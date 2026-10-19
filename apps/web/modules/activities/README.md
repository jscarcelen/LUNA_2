# activities

The interactive form of a generated resource: the learner answers inside LUNA and the attempt flows back to the performance tracker.

| File | Role |
| --- | --- |
| `engine/activity.ts` | Builds questions from agent output (`buildActivity`), marks them instantly (`gradeActivity`), attaches sources. |
| `ActivityPlayer.js` | The answer page. "Check my answers" / "Submit" marks everything, sends the written answers to the grader in ONE call (`Luna is checking your written answers…`), shows verdict, credit, feedback and the expected answer in place, then hands the attempt to `onSubmit` once. It never closes itself, and **a host must never close it from `onSubmit`** (only Leave / Done → `onClose`); `tests/activities/player-stays-open.test.js` enforces it. One question per screen on a phone (≤ 760 px; optional on a computer, "One question at a time", remembered in localStorage): progress bar, Back / Next fixed at the bottom (safe-area aware), the last screen is "Review answers" then "Submit". On a phone each question has its own Check (`checkOne`): it marks that question the way Submit would (one grader call when it is written or comes with working), shows the feedback, then Continue; Submit reuses those marks (`modelGrades`). On a computer, "One question at a time" still marks everything at the end. Drafts: see below. |
| `drafts.js` | Pure draft rules: `makeDraft`, `resumeState` (same question, same answers, what still fits a changed quiz), `mergeDrafts` (newest wins), `countAnswered` / `isAnswered`, `draftProgress` ("3/6 answered"). |
| `draftStore.js` | Browser side of drafts: localStorage keyed by account (or guest) + activity, plus `/api/activities/drafts` for a logged-in account and a saved quiz (`lib/activityDraftsRepository.js`, migration `202610190002_activity_drafts.sql`, feature-detected). |
| `sourceLabel.js` | What the answer feedback says about the source: the quote; for a maths question "Maths problem based on this section of the notes: {section}" with a link to it; otherwise the section (or document) it came from. Never "no quote". Rendered by `SourceNote.js`. |
| `photoUpload.js` | Phone photos -> JPEG ≤ 2000 px on a canvas (iPhone HEIC included) before upload; `fitWithin`, `jpegName` are pure. |
| `PhotoQuizMaker.js` | "Make a quiz from your notes": take photos (camera or library, up to 8), pick 5/10/15 questions and a difficulty, upload one photo per request through the normal upload pipeline (OCR + vision for handwriting), generate with the built-in Quiz Generator (`plans/execute.js` `runStep`), save and open the quiz. Opened from Practice (the main "Make a quiz" button on a phone, "📷 From photos" on a computer). |
| `grading.js` | Local, model-free marking of written answers (exact, numbers within tolerance, key-term overlap), `needsModel`, `applyGrades`, `causeFor`, partial credit (`creditOf`, `scoreOf`). |
| `gradeBatch.js` | Server side: the AI marking prompt and strict schema, batching (≤ 20 per call), reconciliation, local fallback. Route: `app/api/activities/grade/route.js`. |
| `quantitative.js` | `isQuantitative(question \| result)`: does solving it need maths? Decides analytical vs topic-knowledge errors. |

## Grading rules

- Verdicts: `correct`, `close` (essentially right, not exact: partial credit, an **accuracy** mistake) and `incorrect`.
- Blank, identical and number-for-number answers are settled locally; only written answers that need judging go to the model.
- The model says whether the question needs maths; the cause is then derived: close → accuracy, wrong + maths → analytical, wrong + no maths → topic knowledge. A blank has no cause until the rest of the topic is known (`performance/errors.js`).
- No `OPENAI_API_KEY`, or a failed call: local marking, flagged `graded: "local"`. The learner is never blocked.
- Model: Luna 3 Pro floor, `LUNA_GRADE_MODEL` to override. Catalogue entry: dashboard request F2.

## Practice list and catch-up

- `catchUp.js`: pure helpers for "lead with progress" (`doneThisWeek`, `weekHeadline`, `summariseCatchUp`, `lateTone`). Used by the Practice list and the student Home; tested in `tests/catch-up.test.ts`.
- On a phone, a student also reaches quizzes from the phone app (`modules/mobile`): it opens them in the same reader and player, and reads `loadAllDrafts` for "Continue learning".
- The Practice card is title, chips, one Start button and a "⋯" menu (deadline, Update, Delete with a confirm). The quiz opens as a full-screen dialog with a "← Leave" button.

## Save and finish later (drafts)

- The player autosaves the answers, "how sure" taps, typed working (never the photo), the current question and the time spent: 1.2 s after the last change, on Leave / unmount, and when the page is hidden (`keepalive`). "Save and finish later" saves and leaves; a small "Saved" / "Saved on this device" shows the state.
- Only for a saved quiz (the host passes `documentId`; the reader passes `chat.documentId`). Unsaved previews and Progress practice have no draft.
- Opening the quiz again resumes on the same question with the same answers ("Picked up where you left off · Start again"). Submit grades it, hands the attempt to `onSubmit` and deletes the draft.
- A draft is never an attempt: it is not in `attempts`/`attempt_results` nor in the `activity-attempt` documents, so Progress and "done" ignore it. The Practice list shows "In progress · 3/6 answered" and a Continue button.
