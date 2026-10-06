# activities

The interactive form of a generated resource: the learner answers inside LUNA and the attempt flows back to the performance tracker.

| File | Role |
| --- | --- |
| `engine/activity.ts` | Builds questions from agent output (`buildActivity`), marks them instantly (`gradeActivity`), attaches sources. |
| `ActivityPlayer.js` | The answer page. "Check my answers" marks everything, sends the written answers to the grader in ONE call (`Luna is checking your written answers…`), shows verdict, credit, feedback and the expected answer, then hands the attempt to `onSubmit` once. It never closes itself. |
| `grading.js` | Local, model-free marking of written answers (exact, numbers within tolerance, key-term overlap), `needsModel`, `applyGrades`, `causeFor`, partial credit (`creditOf`, `scoreOf`). |
| `gradeBatch.js` | Server side: the AI marking prompt and strict schema, batching (≤ 20 per call), reconciliation, local fallback. Route: `app/api/activities/grade/route.js`. |
| `quantitative.js` | `isQuantitative(question \| result)`: does solving it need maths? Decides analytical vs topic-knowledge errors. |

## Grading rules

- Verdicts: `correct`, `close` (essentially right, not exact: partial credit, an **accuracy** mistake) and `incorrect`.
- Blank, identical and number-for-number answers are settled locally; only written answers that need judging go to the model.
- The model says whether the question needs maths; the cause is then derived: close → accuracy, wrong + maths → analytical, wrong + no maths → topic knowledge. A blank has no cause until the rest of the topic is known (`performance/errors.js`).
- No `OPENAI_API_KEY`, or a failed call: local marking, flagged `graded: "local"`. The learner is never blocked.
- Model: Luna 3 Pro floor, `LUNA_GRADE_MODEL` to override. Catalogue entry: dashboard request F2.
