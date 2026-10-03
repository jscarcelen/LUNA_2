# chat

Luna's assistant (AI agents → Chatbot).

- `ChatPage.js` — the UI: streaming thread, scope (whole workspace / focus), drop files, `@` references, cost confirmation, and the cards the assistant proposes.
- `engine.js` — one turn on the server: system prompt, cost estimate, tool loop (max 5 steps), events (`estimate`, `confirm`, `status`, `delta`, `sources`, `actions`, `usage`, `error`).
- `tools.js` — the tools the model may call. Reading tools run on the server; `propose_*` tools only return a card.
- `actions.js` — what an approved card does (run an agent, build a document resource, build an agent definition). Nothing is saved without the user's "Save".
- `sources.js` / `stream.js` / `knowledge.js` — passages → numbered references, the OpenAI stream reader, and the guide to Luna the assistant answers from.
- Route: `app/api/chat/route.js` (NDJSON). Unsupported requests are written to `feature_requests`.
