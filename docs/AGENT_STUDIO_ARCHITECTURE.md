# Agent Studio — architecture proposal

Status: **proposal, awaiting approval** (2026-09-18). No code changed yet.

Principle: **Agent = content-generation recipe. Template = presentation recipe.** The prompt is
derived, never canonical. Users never write prompts or JSON unless they open Advanced.

## 1. What exists today (inspection)

| Piece | File | Verdict |
| --- | --- | --- |
| Creator UI: one 605-line form (name, instructions, context, questions, output fields, model, test, publish) | `tools/agent-builder/AgentBuilderPage.js` | **Replace** with the 5-step Agent Studio. Reuse: nothing structural; copy the marketplace-publish handler. |
| Saved agent = ad-hoc JSON in a `.agent.json` workspace document, tag `ai-agent`: `{ name, instructions, contextPrompt, questions[], outputExample, template.fields[], model, creativity, scope, outputMapping, savedOutput }` | `buildAgentConfig()` | **Migrate** to the canonical `AgentSpec` (adapter reads both shapes). |
| Runtime: `normalizeConfig` → `runAgentGeneration` (RAG over `scope.documentIds` + `styleDocumentIds`, one hand-written system prompt, JSON schema from `template.fields`, local fallback, streaming) | `pipeline/agentConfig.js`, `pipeline/agentBuilder.js`, `/api/ai-tools/agent-builder(/stream)` | **Keep the runtime**; insert a **prompt compiler** in front of it. `runAgentGeneration` receives compiled `{ system, user, schema }` instead of raw config. |
| Run flow (intro → configure questions → configure output → export) | `RunAgentPage.js` | **Keep**. It already renders questions from a list and fields from a schema; point it at `AgentSpec.inputs` / `outputSchema` through the adapter. |
| Built-in Quiz agent (config object with field descriptions) | `quiz-generator/quizAgent.js` | **Rewrite as an `AgentSpec`** (first migration proof). |
| Template Studio v3 field tree / mapping | `modules/template-studio/engine/{types,mapping}.ts` | **Reuse `FieldDef`** as the output-schema node type — one field model across both studios, so `schemaFromAgentFields` becomes trivial. |

Gaps the spec addresses: no purpose/description layer; questions are "prompt variables";
context is one text box + workspace doc ids (no agent knowledge vs user material, no
required/optional slots); output fields have only name/type/repeatScope; no examples model,
no validation, no iteration that edits the spec; prompt text is the canonical artefact.

## 2. Canonical TypeScript model (`apps/web/modules/agent-studio/engine/types.ts`)

```ts
export interface AgentSpec {
  id: ID; version: 1; name: string;
  purpose: { headline: string; description: string; category?: string };
  instructions: { core: string; style?: string; constraints?: string[] }; // plain language, compiled later
  inputs: InputDef[];              // what the end user can customise
  contextSlots: ContextSlot[];     // agent knowledge + user material
  outputSchema: FieldDef[];        // shared with template-studio (stable ids, names, descriptions, types)
  examples: ExampleDef[];
  validationRules: ValidationRule[];
  model: { model: string; creativity: "low" | "medium" | "high" };
  createdAt: string; updatedAt: string;
}

export type InputType = "text" | "number" | "choice" | "multi_choice" | "toggle" | "language" | "document";
export interface InputDef { id: ID; name: string; description?: string; type: InputType; required: boolean; default?: unknown; options?: string[]; min?: number; max?: number }

export interface ContextSlot {
  id: ID; kind: "agent_knowledge" | "user_material"; name: string; description: string; // "how the material is used"
  required: boolean; multiple: boolean; accept: ("pdf" | "docx" | "image" | "text")[];
  documentIds?: ID[];             // agent_knowledge only: workspace documents bundled with the agent
  usage: "source" | "style";      // draw content from it vs imitate its format/level
}

export interface ExampleDef { id: ID; inputs: Record<ID, unknown>; output: DataObject; note?: string; source: "pasted" | "uploaded" | "generated" }
export type ValidationRule =
  | { type: "count_matches_input"; arrayFieldId: ID; inputId: ID }
  | { type: "required_fields" } | { type: "no_duplicates"; arrayFieldId: ID; byFieldId: ID }
  | { type: "answer_in_options"; arrayFieldId: ID; answerFieldId: ID; optionsFieldId: ID }
  | { type: "options_count"; arrayFieldId: ID; optionsFieldId: ID; count: number }
  | { type: "template_compatible"; templateId: ID };
```

`FieldDef` is imported from `template-studio/engine/types.ts`: same ids, names, descriptions and
types on both sides, so template compatibility is a structural comparison, not name matching.

## 3. JSON Schema generation

`engine/schema.ts`: `fieldDefsToJsonSchema(outputSchema)` — objects/arrays recurse, descriptions
carried through, `required` from `FieldDef.required`, `additionalProperties: false`, used with
OpenAI `response_format: json_schema` (strict). Rich text = string annotated
"Markdown with inline/block LaTeX allowed"; image = string URL; formula = LaTeX string.

## 4. Prompt compiler (`engine/compile.ts`)

`compileAgent(spec, run: { inputValues, contextChunks, styleChunks, feedbackHistory }) → { system, user, schema, model, temperature }`

Sections are generated in a fixed order from the structured spec (never stored):
1. Role + purpose (`purpose.headline/description`).
2. Instructions (`instructions.core`, `style`, `constraints[]`).
3. Output contract — one line per field: `front — The word in language 1 (text, required)`; arrays as "return N items in `flashcards`".
4. User choices — `Number of cards: 20`, `Language 1: Spanish` … (from `inputs` + run values, using names and descriptions).
5. Material — agent-knowledge chunks (with each slot's `usage`/description), then user material; style slots flagged "imitate format, do not copy content".
6. Examples — rendered as input → output pairs.
7. Validation hints — rules restated as instructions ("exactly the requested number; the answer must be one of the options").
8. Refinement log — accumulated iteration changes are applied to the spec (see §6), so this section is normally empty; kept for one-shot "try this once" experiments.

Model-specific adapters live in `compile.ts` (OpenAI now; a Claude adapter is a second function).

## 5. Runtime changes

- `pipeline/agentBuilder.js` gains `runAgentSpec(spec, runInputs, { onProgress })`: resolves
  context slots (agent-knowledge doc ids + run-time document ids), runs the existing chunking /
  retrieval, calls `compileAgent`, sends to the model, then runs **`validate(spec, output)`**
  (`engine/validate.ts`) and returns `{ output, checks: [{ rule, ok, message }] }`.
- Existing `runAgentGeneration(config)` stays as a thin wrapper: legacy config → `AgentSpec` via
  `migrate.ts` → `runAgentSpec`. Routes unchanged; the stream emits a new `validate` step.

## 6. Iteration = spec edits (`engine/improve.ts`)

`improveAgent(spec, feedback | quickAction, lastRun) → { spec: AgentSpec, changes: SpecChange[] }`:
a small model call that receives the spec (as JSON), the last inputs/output and the feedback, and
returns **patches to the spec** — allowed targets: `instructions.core/style/constraints`,
`outputSchema[].description`, `validationRules`, `examples` (add). Quick actions are pre-written
feedback strings. The UI shows the diff ("Explanation description: 'One sentence…' → 'At most 15
words…'"), recompiles, reruns the test, and the user can undo. Nothing patches the sample output.

## 7. React component architecture (`apps/web/modules/agent-studio/`)

```
AgentStudio.tsx                       entry (registered as "agent-builder" tool); wizard on create, dashboard when opened
├─ state/useAgentStore.ts             reducer + undo, step, spec, lastRun
├─ AgentHeader.tsx                    name · status (draft/tested/published) · Save · Advanced toggle
├─ CreationStepper.tsx                ① What it creates ② Customize ③ Material ④ Output ⑤ Test & improve
├─ steps/PurposeStep.tsx              headline + description; "Draft it for me" → engine/draft.ts (AI proposal → editable)
├─ steps/InputSchemaBuilder.tsx       list of InputCard; "+ Add customization" asks "What should the user choose?"
├─ steps/ContextBuilder.tsx           Agent knowledge (pick workspace docs, usage) · User material slot (required/optional, multiple, accept, description)
├─ steps/OutputSchemaBuilder.tsx      collections as cards ("Flashcards — multiple items"), FieldCard (name · what is it? · type · required · example); "+ Add field" / "+ Add collection"
├─ steps/ExampleBuilder.tsx           paste / upload / generate; shown inside step 5
├─ test/AgentTester.tsx               live controls from inputs + material drop; Generate test (streaming)
├─ test/OutputInspector.tsx           structured output cards (reuses LivePreviewPane's plain renderer)
├─ test/ValidationPanel.tsx           ✓/✗ checks from engine/validate.ts
├─ test/IterationPanel.tsx            natural-language feedback + quick actions; shows spec diff; undo
├─ AdvancedEditor.tsx                 compiled prompt (read-only), instructions text, JSON schema (read-only), model config, validation rules
├─ dashboard/AgentDashboard.tsx       the "final agent screen": 5 summary cards, each opens its step; Publish (marketplace card generated from spec)
├─ registry.ts                        input-type registry (control, default, validator) and output-type registry
└─ engine/ { types, model, schema, compile, validate, improve, draft, migrate }
```

Registries: `inputTypes[type] = { label, icon, defaults, Control (run-time), Config (creator) }`
and `outputTypes[type] = { label, jsonSchema(), sample() }` — marketplace input/output types
register the same way.

## 8. Integration with the rest of LUNA

- **RunAgentPage** reads `AgentSpec` through `adapters/runAdapter.ts`: `inputs → questions`,
  `outputSchema → template.fields (flattened, with descriptions)`, `contextSlots(user_material)
  → the material step (required/optional shown; style slots → "style examples")`. No UI change.
- **Template Studio Data mode**: `schemaFromAgentFields` replaced by `spec.outputSchema` directly
  (same `FieldDef`), and the compatibility check becomes structural.
- **Marketplace card**: generated from the spec (creates / user chooses / returns / compatible
  templates = templates whose field tree is satisfied by `outputSchema`).
- **Persistence**: `.agent.json` documents keep working; content becomes `{ spec: AgentSpec,
  legacy?: oldConfig }`. `migrate.ts` converts old configs on read (questions → inputs,
  contextPrompt → an agent-knowledge text slot, template.fields → outputSchema under an `items`
  collection, outputExample → example). Supabase schema untouched (accounts phase will move
  agents to a table).

## 9. Milestone plan

**M1 (this PR)** — engine (`types, model, schema, compile, validate, migrate`) with tests; Quiz
agent + Vocabulary Flashcard Generator as `AgentSpec`s; runtime `runAgentSpec` + validate step in
the stream; Agent Studio wizard steps 1–5 with a working test loop (streaming, output inspector,
validation panel), iteration via `improve.ts` (feedback + quick actions, diff, undo), examples
(paste/generate), Advanced panel (read-only prompt + schema, editable instructions/model), dashboard,
save as `.agent.json`, marketplace publish from spec. RunAgentPage/Template Studio adapters.
End-to-end: create Vocabulary Flashcards → test with a PDF → validated JSON → Template Studio
flashcard template → export.

**M2** — "Draft it for me" (AI proposal from a sentence), upload example, per-run output
customisation, agent-knowledge chunk caching, Claude model adapter, agent versioning.

## 10. File changes (M1)

New: `apps/web/modules/agent-studio/**` (~22 files), `apps/web/tests/agent-studio/engine.test.ts`,
`modules/ai-tools/tools/vocabulary-flashcards/{index.js,agent.ts}`.
Modified: `tools/agent-builder/index.js` (→ AgentStudio), `pipeline/agentBuilder.js`
(`runAgentSpec`, validate step), `pipeline/agentConfig.js` (accepts `spec`), stream route (emit
`validate`), `RunAgentPage.js` (read via adapter; show required material slot), `quizAgent.js`
(→ spec), `template-studio/data/DataMode.tsx` (accept `FieldDef[]` agents), marketplace listing
payload (`spec`), `CLAUDE.md`, docs.
Removed after verification: `AgentBuilderPage.js`.

## 11. Decisions to confirm

1. **Iteration uses a model call** that returns spec patches (cost: one extra small request per
   feedback). Alternative: rule-based patches for quick actions only, model call for free text.
   I propose: quick actions rule-based (deterministic), free text via model.
2. **Agent knowledge = workspace documents** referenced by id (already chunked/embedded), not
   files stored inside the agent. Publishing to the marketplace copies those documents with the
   listing (M2 when accounts exist).
3. **Language input type** = a choice with a curated language list; "document" input type = a
   run-time user-material slot (kept as a context slot, shown among the customisations).
4. TypeScript for `modules/agent-studio/**` like the template studio.
