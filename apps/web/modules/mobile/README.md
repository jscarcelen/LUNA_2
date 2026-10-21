# mobile

The student phone app: what a student sees on a phone (width ≤ 760px) on `/app` and `/platform`. Teachers, parents,
iPad and computers keep the website unchanged. There is no native iOS app yet; this is the same web app, laid out as
an iPhone app, so a later App Store wrapper can reuse it.

Four tabs (`components/navModel.js` `MOBILE_TABS`): **Home**, **Study**, **Library**, **Progress**. Everything else
(Make something, all study plans, courses and folders, tools) is behind the profile avatar and opens the website page.

| File | Role |
| --- | --- |
| `model.js` | Pure data, no React: library groups, suggested activities with their reason, plan steps with status, Home's next step / continue / upcoming, Progress. Reuses `plans/`, `dashboard/home.js` and `performance/` so the phone and the website agree. Tested in `tests/mobile/model.test.js`. |
| `MobileHome.js` | Greeting, the next step (from a plan, else an activity not tried or below 80%, else an honest empty state), Continue learning (from the quiz drafts of `activities/draftStore.js`), Coming up (2 at most), quick actions. |
| `MobileStudy.js` | "For you" (activities with subject chips) and "Study plan" (steps with Not started / In progress / Completed and one Start / Continue; "Files (N)" lists the plan's files as a list or gallery). |
| `MobileLibrary.js` | Search, All / Added / By Luna, grouped by subject. Opens the reader or the activity. |
| `AddMaterialSheet.js` | Take a photo, choose photos, choose a file, type or paste text. Real per-file upload state, size checks, retry, then "Make a quiz / Flashcards / A summary / A study plan". |
| `MobileProgress.js` | Your learning, Needs more practice, Recent activity, Next steps, from the mastery engine. Nothing before a first activity. |
| `MobileOpener.js` | Opens a document full screen (ReaderView, which hosts the one-question-per-screen `ActivityPlayer`, or DocumentReader) and saves the attempt the same way Practice does. |
| `ui.js`, `phone.js` | Shared phone pieces (screen, segmented control, chips, rows, empty state) and the breakpoint. |

Text: every word goes through `t()`; the keys are `mobile.*` and `tour.phone.*` in `lib/i18n/messages/{en,es}/mobile.js`.

Rules: no number is shown that the data does not hold (plan step minutes default to 30, so they are never shown), no
leaderboards or streaks, plain words, 44px+ touch targets, safe areas respected.
