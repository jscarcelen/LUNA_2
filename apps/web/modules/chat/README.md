# chat

Luna's assistant (AI agents → Chatbot).

- `ChatPage.js` — the UI: streaming thread, scope (whole workspace / focus), drop files, `@` references, cost confirmation, and the cards the assistant proposes.
- `engine.js` — one turn on the server: system prompt, cost estimate, tool loop (max 5 steps), events (`estimate`, `confirm`, `status`, `delta`, `sources`, `actions`, `usage`, `error`).
- `tools.js` — the tools the model may call. Reading tools run on the server; `propose_*` tools only return a card.
- `actions.js` — what an approved card does (run an agent, build a document resource, build an agent definition). Nothing is saved without the user's "Save".
- `sources.js` / `stream.js` / `knowledge.js` — passages → numbered references, the OpenAI stream reader, and the guide to Luna the assistant answers from.
- **Ask Luna** (the chat beside a quiz, summary or document; opened from the floating button in `reader/ReaderView.js` and `reader/InteractiveView.js`):
  - `AskLuna.js` — the panel (side column on a computer, bottom sheet on a phone; floating card in the in-place view), `AskLunaContext.js` — AppShell provides the workspace tree so any reader can find its plan.
  - `materialChat.js` (pure, tested) — `selectMaterial` (the plan's `materialIds` + `masterDocumentId` + the item's reference documents; else the subject's uploaded documents), `describeView` (the "what the user is doing" sentence; quiz progress comes from `ActivityPlayer`'s `onProgress`), `resourceText`.
  - Server: `/api/chat` also takes `context`; with it `engine.js` uses `buildMaterialPrompt` (answer only from the material with [P#], guide don't reveal an unchecked answer, records nothing) and only the `search_material` / `list_documents` tools. `scope.documentIds` is an exact document list; `scope.readableGeneratedIds` lets a master document or the summary being read be searched.
  - `client.js` (`streamChat`) and `ChatParts.js` (answer rendering, references, citation jumps) are shared with `ChatPage.js`. Usage is charged with `chargeRun` as "Ask Luna".
- Route: `app/api/chat/route.js` (NDJSON). Unsupported requests are written to `feature_requests`.
