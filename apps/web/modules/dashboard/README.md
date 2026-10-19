# dashboard (Home)

Home is different for each role (`ui/DashboardPage.js` dispatches):

- **Teacher: "Your classes"** (`ui/TeacherHome.js`): one card per group (plus "Not in a class yet" / "All my students") with who is
  behind, what is due this week and a big "Send practice to {class}…" button. It opens `accounts/SendPracticeDialog.js` (pick an
  activity or plan) and then the normal Assign dialog (`ShareDialog` with `item.initial`), so the due date and delivery are the existing flow.
  Data: `ui/useLinkedMembers.js` (connections, groups, members a page at a time, 30 max per card). "Open class" goes to `students?group=<id>`.
- **Parent: "Your child this week"** (`ui/ParentHome.js`): per child on track or not, where they struggle, ONE way to help, read-only.
  No Start button and none of the child's tasks as the parent's own.
- Both are built by the pure view-models in `roleHome.js` (`standingOf`, `classCardOf`, `weeklySummaryOf`, `howToHelp`), tested in `tests/dashboard/role-home.test.js`.
  "Behind" = a late step, a passed plan date, no activity for 7 days while work is left, or mastery under 50%.

The student Home (the rest of this file) is:

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
