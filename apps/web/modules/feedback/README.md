# feedback — beta feedback tool (TEMPORARY)

Lets testers send written feedback from inside the app, and gives the owner one board to read it all and hand it to Claude.
Built to be deleted when the beta ends.

## Tester side (`FeedbackWidget.js`, mounted in `components/AppShell.js` for the app and, via `SiteFeedback.js` in `app/layout.js`, on every other page such as the landing page)
A "Feedback" button on every screen of `/app` and `/platform`. Pick a kind (Idea / Something is wrong / How it looks / AI result),
write, and optionally:
- **select text first** — it is quoted automatically (read on pointer-down, before the click clears the selection);
- **Point at something** — tap any part of the screen; we store a short selector, the words on it and the section heading;
- **Attach / paste / capture a screenshot** — resized to ≤1400px JPEG in the browser (`capture.js`), stored in the row.
Pages can add context with `setFeedbackContext(key, value)` (`feedbackContext.js`); `RunAgentPage` adds the agent id + name, run state and step,
so agent/prompt feedback says which agent it was about.

## Owner side
- `/feedback-admin` (`FeedbackBoard.js`): cards filtered by status (New → Sent to Claude → Done / Dismissed), area and kind, with
  screenshot, quote, pointed-at part and a note. Select cards → **Copy for Claude** builds the hand-off message
  (`buildBrief` in `lib/feedbackCore.js`: what, where, files to start in, prompt files + dashboard ids for AI-result feedback, ids of the
  screenshots) and marks them "Sent to Claude"; **Save screenshots** downloads them as `feedback-<id>.jpg` to drag into the chat.
- The page asks for `LUNA_FEEDBACK_ADMIN_KEY` (held in sessionStorage, sent as `x-feedback-key`). With no key configured the API answers 503.
- `lib/feedbackCore.js` `AREAS` maps each page key to its code files and prompts: update it when pages move.

## API
`POST /api/feedback` (anyone, same-origin, 30/hour per address) · `GET|PATCH|DELETE /api/feedback/admin` (key; 10 wrong keys / 15 min).
Table `feedback_items` (migration `202610080001_feedback_items.sql`, service role only; the routes answer `503 setupNeeded` until applied).

## How to remove it
1. Delete `apps/web/modules/feedback/`, `apps/web/app/feedback-admin/`, `apps/web/app/api/feedback/`, `apps/web/lib/feedbackCore.js`,
   `apps/web/lib/feedbackRepository.js`, `apps/web/tests/feedback/`.
2. Remove `SiteFeedback` from `app/layout.js`. In `components/AppShell.js` remove the `FeedbackWidget` import and element; in `RunAgentPage.js` remove the `feedbackContext` import and the two effects.
3. `drop table public.feedback_items;` and delete the env var `LUNA_FEEDBACK_ADMIN_KEY`.
