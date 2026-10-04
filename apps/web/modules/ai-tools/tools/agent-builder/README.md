# Agent Builder / Run Agent

Two pages share one pipeline (`../../pipeline/agentBuilder.js`):

- `AgentBuilderPage.js` — create/edit an agent (instructions, knowledge scope, questions, output
  variables, model/creativity), test-run it, save it to the workspace or list it on the marketplace.
- `RunAgentPage.js` — run a saved agent: material → questions → output (components, format, color)
  → export. The output is planned into Template Studio components (`template-studio/output/`), so
  every agent — quiz, flashcards, block agents — has the same step 2 and exports what it previews.

## Building blocks

| File | Role |
| --- | --- |
| `useAgentGenerationStream.js` | Client hook. POSTs to `/api/ai-tools/agent-builder/stream`, parses NDJSON events and exposes `{ steps, tokenChars, tokenTail, elapsedMs, error, generate, cancel }`. |
| `GenerationProgress.js` | The step-by-step "building" card (scope → chunk → retrieve → generate) with live token ticker. Pure presentation. |
| `RunAgentPage.js` step 2 | Components, formats and colors come only from Template Studio: `template-studio/output/OutputStylePanel` (one card per component, one color / format for all, apply a saved template) beside `OutputPreviewPane` (view × page-size matrix, Preview / Data / Raw, PDF / DOCX / PPTX). |
| `WorkspaceDocumentPicker.js` | Documents of the whole workspace grouped by subject and folder, for agents that read from anywhere (the Summary Notes Consolidator). |
| `readAgentStream.js` | `runAgentStreaming(config, onEvent)`: runs an agent through the stream endpoint from non-React code (study-plan builds) and resolves with the final result. |
| `previewHtml.js` | Plain-text/HTML renderers still used for the Raw tab and the workspace browser. |

Styling: these components use Tailwind utilities (tokens in `app/globals.css` `@theme`) inside a
`.tw-scope` wrapper that supplies a minimal base reset, because Tailwind preflight is not loaded
globally. Legacy pages keep the hand-written class system.

## Streaming contract

`POST /api/ai-tools/agent-builder/stream` → `application/x-ndjson`, one JSON object per line:

```
{ step: "scope"|"chunk"|"retrieve"|"generate", status: "start"|"end", ...meta, t }
{ step: "generate", status: "token", chars, delta, t }      // throttled to ~12/s
{ step: "generate", status: "progress", phase: "map"|"organise"|"merge"|"check", done, total, label, t }   // multi-pass agents (consolidator); the step stays active
{ step: "done", status: "end", result, t }                   // same shape as the non-stream route
{ step: "error", status: "end", error, t }
```

The non-streaming `POST /api/ai-tools/agent-builder` is unchanged and still used by tests/tools.
Node runtime with `maxDuration = 60`; the open stream keeps Vercel from idling the function.
