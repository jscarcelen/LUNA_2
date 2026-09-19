# Agent Studio

Agent = content-generation recipe (TypeScript module). The compiled prompt is derived, never stored.

- `engine/types.ts` — `AgentSpec { purpose, instructions, inputs[], contextSlots[], outputSchema: FieldDef[], examples[], validationRules[], model }`. Output fields reuse Template Studio's `FieldDef` (stable ids).
- `engine/schema.ts` — `outputJsonSchema()` (strict, descriptions, primary collection under `items`) and `legacyFields()` for RunAgentPage/templates.
- `engine/compile.ts` — prompt compiler: role/purpose → instructions/rules → output contract → user choices → material notes → examples → validation hints.
- `engine/validate.ts` — structural checks (valid JSON, required fields, count matches input, no duplicates, answer ∈ options, options count).
- `engine/improve.ts` — quick actions (rule-based) and `applyPatches()` for model-proposed spec patches from `/api/ai-tools/agent-builder/improve`.
- `engine/migrate.ts` — `specFromLegacy()` (old `.agent.json`) and `runConfigFromSpec()` (spec → the run config the runtime + RunAgentPage consume; carries `spec`, `outputJsonSchema`, `validationRules`, `materialSlots`).
- `engine/model.ts` — factories + built-in specs (Vocabulary Flashcards, Quiz).
- `AgentStudio.tsx` — list/starters → 5-step wizard (`steps/*`, `test/TestStep.tsx`) → overview dashboard with marketplace card + publish; `AdvancedEditor.tsx` for instructions/rules/model and the generated schema. `registry.ts` holds input/output type registries.

Runtime: `pipeline/agentBuilder.js` uses `config.outputJsonSchema` when present and emits a `validate` step with checks. Saved agents are `.agent.json` documents containing `runConfigFromSpec(spec)` (so the Run flow needs no changes) plus `spec`.
Tests: `tests/agent-studio/engine.test.ts`.
