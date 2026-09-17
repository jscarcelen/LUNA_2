# Agent Builder / Run Agent

Two pages share one pipeline (`../../pipeline/agentBuilder.js`):

- `AgentBuilderPage.js` — create/edit an agent (instructions, knowledge scope, questions, output
  variables, model/creativity), test-run it, save it to the workspace or list it on the marketplace.
- `RunAgentPage.js` — run a saved agent: knowledge → questions → template, with a sticky live
  preview and a customization sidebar. Saving stores exactly what the preview shows.

## Building blocks

| File | Role |
| --- | --- |
| `useAgentGenerationStream.js` | Client hook. POSTs to `/api/ai-tools/agent-builder/stream`, parses NDJSON events and exposes `{ steps, tokenChars, tokenTail, elapsedMs, error, generate, cancel }`. |
| `GenerationProgress.js` | The step-by-step "building" card (scope → chunk → retrieve → generate) with live token ticker. Pure presentation. |
| `LivePreviewPane.js` | Preview / Data / Raw tabs, desktop/mobile width, PDF/DOCX export, generation overlay. Template output is rendered by `/api/templates/render-preview` and shown in a sandboxed `<iframe srcDoc>`. |
| `OutputCustomizerPanel.js` | Branding (title, subtitle, logo), style (accent, font, density, numbering, dividers), content (item limit, field order/visibility, block type per field). |
| `previewHtml.js` | Shared renderers: `renderPlainOutputHtml`, `wrapPreviewDocument` (brand-aware full HTML doc), `applyOutputCustomization`. Used by both the preview and the save path. |

Styling: these components use Tailwind utilities (tokens in `app/globals.css` `@theme`) inside a
`.tw-scope` wrapper that supplies a minimal base reset, because Tailwind preflight is not loaded
globally. Legacy pages keep the hand-written class system.

## Streaming contract

`POST /api/ai-tools/agent-builder/stream` → `application/x-ndjson`, one JSON object per line:

```
{ step: "scope"|"chunk"|"retrieve"|"generate", status: "start"|"end", ...meta, t }
{ step: "generate", status: "token", chars, delta, t }      // throttled to ~12/s
{ step: "done", status: "end", result, t }                   // same shape as the non-stream route
{ step: "error", status: "end", error, t }
```

The non-streaming `POST /api/ai-tools/agent-builder` is unchanged and still used by tests/tools.
Node runtime with `maxDuration = 60`; the open stream keeps Vercel from idling the function.
