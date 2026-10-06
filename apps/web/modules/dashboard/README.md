# dashboard (Home)

The Home page, the same for a student, a teacher and a parent (only the name differs):

1. **Greeting** — "Hi <first name>" (`home.js` `greeting`, from the role profile in `components/data.js`).
2. **Plan gallery** — one row, at most four study-plan cards, the plans with the closest upcoming
   deadline first (`rankPlans`). Plans of **every subject** of the workspace, not only the selected one.
   The card is `plans/PlanCard.js`, the same component the Study plans list draws. Opening a card goes
   to `plans?open=<documentId>` (AppShell selects the plan's subject first).
3. **Next steps from Luna** — the performance coach (`performance/dashboard/CoachPanel.js` →
   `/api/performance/coach`) fed with the evidence of exactly those plans (`coachInputFor`): mastery per
   topic, kinds of mistake, repeated mistakes, and the plans' next steps merged soonest first. It reads by
   itself (`autoRead`; cached against the evidence). With no results yet, the steps due soonest are listed instead (`nextSteps`).

A student also gets **Dates from my teachers** (`plans/ExamDates.js`) right under the gallery when a teacher or parent sent
exam dates ("Plan for it" → `plans?generate=1&exam=<id>`). Deadlines show who set them (`plans/DeadlineBadge.js`: solid dark =
a teacher or parent, outlined = your own); on the same day a plan or step with an imposed deadline ranks first.

No plans yet → one line and a "Plan it for me" (`plans?generate=1`) or "Upload material" button.

`home.js` is pure (greeting, plan ranking, coach input) and tested in `tests/dashboard/home.test.js`.
The old sample-data dashboards and `insights.js` were removed.
