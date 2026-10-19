# Implementation Log

## 2026-10-19 (teacher and parent are no longer the student app with other labels)

- **Home by role**: teacher "Your classes" (a card per group: who is behind, due this week, "Send practice to {class}…" which picks an
  activity/plan and opens the existing Assign dialog preset; `modules/dashboard/ui/TeacherHome.js`), parent "Your child this week" (on
  track or not, where they struggle, one way to help; no Start button, none of the child's tasks). Pure view-models in
  `modules/dashboard/roleHome.js` with tests. Tour, page help and Home copy are role-specific (`components/helpContent.js`).
- **Progress opens on My students / My children** for a teacher or parent with an account (`navModel.landingOf`; the tab comes first).
- **A student's weak topic**: teacher "Send 10 questions to {name}" (makes the set, saves it in the teacher's workspace, opens Assign with the
  student chosen), parent "How to help" (plain panel from the topic data, no AI call). `NextActions` takes `viewer`.
- **Read-only parent**: the plan page hides date pickers, Open, Update…, ✕, Materials & resources… and Update from performance; the child's
  Progress shows no Make a quiz / Plan it for me; "Delete their account" moved to a danger zone behind a dialog naming the child (type the name + password).
- **Topic chips** no longer list "Shared documents" / "Shared with me" (Courses only). **Plan it for me** asks What, Exam date, Time per week; the rest is under "More options" (defaults unchanged).
- **One "Ask Luna" button** replaces "Chat with Luna" + "Feedback" (menu: Ask Luna / Send feedback; small bottom-right on desktop with page bottom padding, an icon in the top bar on a phone).
- **Top bar** shows the page name and a short phone title from `navModel.shortTitleOf` ("Students", "Make", "Study").

## 2026-10-06 (landing: promo video + 16 tester notes)

- **Promo video** (`tools/promo-video`, README there): 58 s, 1920x1080, music only, nine scenes from the real screenshots,
  rendered frame by frame from a deterministic timeline; on the landing page as "See Luna in 1 minute" (`PromoVideo.js`).
- **Landing feedback (16 items from the beta tool)**: phone/native app labelled "coming soon"; marketplace is buy **and** sell in
  Lunas (payments/top-ups coming soon); agent builder step shows the real prompt + questions pages, with the chatbot as its own
  step; answers-with-sources, quiz-answered, notes palette and "Luna's read" views added; "Home" thumbnail removed; softer
  folder/material wording; value-proposition lead instead of the disclaimer; roles section rewritten around purpose and
  interaction; "generators" -> resource-generating agents.
- `scripts/landing-capture/capture.mjs`: six new shots, a write guard for the shared demo account, `--only=<name>`.

## 2026-10-08 (beta feedback tool)

- Temporary tool, see `apps/web/modules/feedback/README.md`: a Feedback button in the app (idea / problem / how it looks / AI result,
  quoted selected text, "point at something", screenshot attach/paste/capture, agent + run context), `POST /api/feedback`, table
  `feedback_items` (migration `202610080001_feedback_items.sql`), and the owner's board at `/feedback-admin` (key `LUNA_FEEDBACK_ADMIN_KEY`)
  with "Copy for Claude" (hand-off message: what, where, files, prompts) and "Save screenshots". Removal list in the README.

## 2026-10-06 (metaprompt pass over the app's prompts)

- `CLAUDE.md` gets a "Prompt quality" rule (every user prompt is sharpened silently before acting) and the full method lives in
  `.claude/skills/metaprompt/SKILL.md`, with a "LUNA prompts" section for prompts that ship in the app.
- Rewritten with the same method (data in XML tags above the task, explicit output format, positive rules each with a reason,
  self-check; **no schema, field, model or parameter changed**): agent improvers (refine A4, improve A5, iterate A7, vague
  instructions → rules A3), study plans (generate P1, re-plan P2, update P4), concept maps (resource concepts P3, document concept
  tree U7), performance coach F1, written-answer grading F2 (wording only), Ask Luna chat A8, Template Studio T1-T4.
- Left alone on purpose (tuned over many sessions, no live run here): agent-run prompts A1/A2, consolidator A9-A12, extraction/OCR U1-U6.
- Not yet run against the live model: first runs should be compared with the previous dashboard version's prompts.
- `docs/dashboard/manifest.mjs`: regexes for A4, A5, P1-P4, U7 follow the new prompt wrappers (`dashboard:check` 0 warnings).

## 2026-10-07 (groups, deadline origin, exam dates)

### Groups of students, "who set this deadline", exam dates

- **Groups** (teacher / parent, `lib/groupsRepository.js`, `modules/accounts/groups.js`, `GroupsBar.js`, `GroupView.js`,
  `groupData.js`, `/api/accounts/groups`, `/api/accounts/linked/members`): named clusters of the students you are connected to as
  their teacher / parent; a student can be in many; membership is checked against the live links on every read (a student whose
  link ended is in no group view or send), plus a trigger and cleanup on link removal; 200 per group, 50 groups per owner. My
  students gets a Groups bar (all / group chips with counts, new / edit / delete group, per-student "Groups…", coloured dots).
  A group opens a **group view**: the existing class panels (class × topic heatmap, who needs attention, topic coverage, headline)
  fed by the members' evidence (every attempt labelled with its student), a comparison table, a plan-progress table, Sent;
  click a student to drill down. The members' workspaces come from one route, a page at a time, authorised per member by an
  accepted link with the same redaction as the single-student route.
- **Send to a group** (`lib/batchSend.js`; Share, Assign, share a copy, Exam date): groups + individuals become one
  de-duplicated list, people and links are read once, 4 at a time inside a 45 s budget (rest `deferred`), 200 people per
  request and 600 deliveries an hour per sender, per-person results and a summary `{ delivered, skipped: { not_connected,
  already_has_it, failed } }` shown in the dialog; assigning skips copies that are already current. Emails: one per person
  (`notifyAssigned`, `notifyExamDates`, `notifyShared` with a batch cap), run after the response (`lib/afterResponse.js`).
- **Deadline origin** (`modules/plans/deadlines.js`, `DeadlineBadge.js`): plan deadlines carry `setBy` (+ `examDateId`);
  assigned plans stamp every deadline as the sender's; assigned copies get the protected tag `due-by:<sender>` next to
  `due:` (the student's own date is `due-own:`, plan steps have `ownDueDate`). The guard refuses editing/removing an imposed
  deadline (403), refuses plans that claim an imposed deadline without a real exam date, and lets the student add their own.
  Shown in Activities, plan cards / page / deadline list / steps / "Next up", Home, the performance "This plan" panel, the bell
  and the emails ("due 24 Oct, set by Prof. Rivera") with two looks (solid dark with the sender's name / outlined "Your
  deadline"). Imposed ranks above an equal own deadline in `nextDeadline`, `upcoming`, `rankPlans`, `nextSteps`, `priorityEngine`.
  Also fixed: a received plan's tick used to be refused when the page wrote back its screen-only `documentId`.
- **Exam dates** (`lib/examDatesRepository.js`, `/api/accounts/exam-dates`, `ExamDatesTab.js`, `plans/ExamDates.js`): send to
  groups / students (optionally sharing a plan with it); students see "Dates from my teachers" (Home, Study plans → Exam dates,
  bell); "Use a teacher's exam date" in Plan it for me / New plan locks the plan's deadline to it, and an existing plan can be
  tied to a date (server-written); the sender edits or cancels (plans follow the new date / keep the date as their own deadline,
  emails + bell); the teacher's Exam dates tab shows who has planned and, on demand, how far.
- **Migration** `supabase/migrations/202610070001_groups_exam_dates.sql` (not applied by this change; feature-detected,
  groups and exam dates answer 503 `setupNeeded` until it is; deadline origin needs no migration). See `docs/SETUP_CHECKLIST.md` H.
- **Tests**: `tests/accounts/groups.test.js`, `examDates.test.js`, `groupData.test.js`, `tests/plans/deadlines.test.js`
  (membership rules, authorisation, link ending, dedupe, per-person results, rate limits and deferral, lock enforcement, exam date
  lifecycle, sorting priority); existing assign / bell tests updated for the new tags and wording.

## 2026-10-05 (moving between topics)

### Folders and documents can move to any topic or folder

- **Before**: drag and drop worked only inside one topic ("0 items moved · 1 left where they were (they
  belong to another top-level folder)"), there was no way to move on a phone, and `moveFolder` only wrote
  `parent_folder_id`.
- **Server** (`lib/workspaceMove.js`, wired through `moveFolder` / new `moveDocument` in
  `lib/workspacesRepository.js` and API actions `moveFolder`, `moveDocument` in `app/api/workspaces-supabase/route.js`;
  the guard in `lib/workspaceGuard.js` reads `targetSubjectId`, `targetFolderId(s)` and `documentIds`, and refuses
  received read-only copies and the "Shared documents" topic). Same workspace only. Across topics: documents, the
  folder subtree, `document_chunks`, `attempts` and `study_plans` rows take the new `subject_id`; the topic's own
  tags are re-created in the target topic; a document's notes file and attempt records (unfiled documents naming it
  in their JSON) travel with it; document ids never change. A folder cannot go into its own subtree; a name clash
  becomes "Name (2)"; the topic skeleton is not moved; a plan's folder (or plan document) goes under the target's
  "Study plans" with its quizzes. Writes go through a journal: undo steps are registered before each change and run
  in reverse on failure ("nothing was changed"). Warnings name plans that still point at documents that left.
- **UI** (`modules/workspace/ui/WorkspaceBrowser.js`, `MoveDialog.js`, `modules/workspace/moveModel.js`): the refusal is
  gone; drop on any folder or topic; per-row checkbox + "Move to…" for a selection; ⋯ → "Move to…" on documents and
  folders (the folder ⋯ menu now also carries New subfolder / Rename / Delete, which had been hover-only);
  `FolderPicker` gained `disabledIds` and draws topics as roots; the status line says what moved and offers **Undo**.
- **Tests**: `tests/workspace/*` (subtree, cycle, name clash, rollback ordering and idempotent undo against an
  in-memory Supabase fake; guard rules; client model).
- **Not done / limits**: no migration needed. The plans page only resolves documents of its own topic, so a plan left
  behind shows a moved document as missing (the move warns about it). Undo of a folder move restores the folder and
  its name; extra links a document had to folders outside the moved tree are not restored.
## 2026-10-05 (open network + sharing v2)

### Anyone can connect, anything can be shared with a permission

- **Open network.** `kindForRoles` now always answers: teacher+student → `teacher_student`, parent+student →
  `parent_student`, everything else → `peer`. Any account asks any other (both sides accept, no limit);
  `requestLink`'s `relation` is an optional hint for an address with no account yet and the kind is settled from the real
  roles on sign-up (`attachPendingLinks`). Role powers are explicit (`hasGuardianPowers`): assigning work and a student's
  performance need a teacher/parent↔student link; a peer never exposes performance or private data. Connections page: "Build
  your network", "Your network", relation labels (`relationLabel`). Migration `202610060001` relaxes the CHECK on `kind`.
- **Live shares.** `share_grants` + `lib/grants.js` (pure `resolveAccess` → owner | edit | view | null, with folder-subtree
  and topic inheritance, revocation, connection check, private documents excluded) used by `lib/workspaceGuard.js` for every
  workspace action. Edit writes to the owner's original (the guard rewrites workspace/topic from the facts it loaded);
  only the owner deletes, moves, re-tags, shares again. `lib/sharedTree.js` lays shared items into
  "Shared with me / <owner>" in the tree API; `lib/grantsRepository.js` shares (connections only, plan + its documents and
  folder), lists who has access, changes, revokes, leaves; ending a connection revokes both directions.
- **Share… dialog** (`modules/accounts/ShareDialog.js`, opened from file rows, folder/topic rows, plans, agent cards,
  template cards, "My blocks") with Can view / Can edit and the People with access list. Agents, templates and
  components are shared as copies (`lib/copyShareRepository.js`, `/api/accounts/share-copy`; components are imported into
  the browser library on next load).
- Bell + email "X shared 'Folder' with you (can edit)"; tests in `tests/accounts/{grants,guardGrants,sharedTree,network}.test.js`.
- Not applied: the migration (`202610060001_network_sharing_grants.sql`) is feature-detected, nothing breaks until it is.

## 2026-10-05 (landing page + Luna logo)

### New public page, one logo everywhere

- **Logo**: an original crescent-with-a-point mark and stroke-drawn "LUNA" wordmark, defined once as data in
  `components/brand/lunaBrand.js`. `components/brand/LunaLogo.js` renders it (`mark`, `tile`, `variant`
  color / mono / white, `size` = height) on the landing page, the demo, the sign-in dialogs' parent page
  and the app's navigation rail (`SideNav.js`). `scripts/brand/build-brand.mjs` writes `public/brand/*`
  (SVG + PNG: mark, lockup, wordmark, app tile, colour/mono/white), the PWA icons the manifest already
  points at (`icon-192/512`, `icon-maskable-512`, `apple-touch-icon`), `app/icon.svg` and `app/favicon.ico`
  (16/32/48). Re-run it after changing the geometry.
- **Real screenshots, no mock UI**: `scripts/landing-capture/capture.mjs` (Playwright core + system/Playwright
  Chromium, ffmpeg-static for the optional video) photographs the running app read-only into
  `public/landing/*.webp` (1440x900 @2x desktop, 390x844 @3x phone, 1000/2000 px webp). The dev overlay is
  hidden; the demo account's empty marketplace is shown with six sample listings put into the throwaway
  browser profile only (captioned "sample listings"). Refresh with `cd apps/web/scripts/landing-capture &&
  npm install && npm run capture`.
- **Landing** (`components/LandingPage.js` + `components/landing/*`, styles in `landing.css`): hero with
  gradient mesh, real screen in a CSS browser frame with two phones and gentle parallax; scroll-snap
  slider of 11 real screens (touch, arrows, dots, arrow keys); Luna Study / Luna Create / Luna Marketplace
  pillars; the upload > plan > practise and track > expand flow; PWA phones; profiles; final CTA.
  **Demo** tab is a guided journey (upload, master notes, plan, performance, agents, build, templates,
  marketplace). **Pricing** and **Training** are shaded, badged *Upcoming* with a *Soon* pill in the nav and
  an honest "what to expect"; "Notify me" is local UI only. Log in / Sign up open the real
  `components/auth/AuthModal.js`. Motion respects `prefers-reduced-motion`; no blur, no dark mode.

## 2026-10-04 (master document)

### Summary Notes Consolidator and the plan's master document

- New built-in agent **Summary Notes Consolidator** (AI agents tab): pick documents from any subject or
  folder (`WorkspaceDocumentPicker`), a language and an optional focus; get one exhaustive, de-duplicated
  document organised by topic, with formulas, tables and figure descriptions, every statement ending in
  a `[D1 p.3 · D2 §Osmosis]` tag and a source key at the top. Spec `createSummaryNotesConsolidatorSpec`
  (`pipeline: "consolidate"`), tool `tools/summary-consolidator/`, output blocks = document structure.
- **Long inputs**: `pipeline/consolidator.js` replaces the single (≈48k chars in / 6k tokens out) call with
  four passes that keep every passage — map (12k-char parts, halve on failure, re-ask for skipped passages,
  carry over verbatim as the last resort) → organise (outline from topic titles only) → merge (per section,
  drafts from all documents) → check (missing LaTeX formulas appended). Streams `progress` events; the
  stream route now allows 300 s and the pipeline degrades to local parsing/de-duplication past 60 % / 90 %
  of a 270 s budget. Cost estimate in the run page covers all passes (`estimateConsolidationTokens`).
- **Study plans**: with 2+ uploaded documents `executePlan` builds the master document FIRST (streamed),
  files it once in the plan's folder (rewritten in place if the uploads change), stores
  `plan.masterDocumentId` / `masterSourceIds`, and every later quiz, flashcard set or summary reads it
  (`scope.documentIds = [master]`), so `attachSources`, `/source` and chat sources point at the
  consolidated document. `materialIds` stay the uploads (concept maps, the "Reference materials"
  shortcut); the master is generated material and is deleted with the plan. The dialog shows a "Merging
  your documents into one master document" step between saving and writing (`planBuildSteps`).
- `pipeline/masterDocument.js`: a master document is a `resource` tagged `master-document`; the workspace
  loader reads it as Markdown (tags expanded to the original documents' names) and `collectScopedDocuments`
  admits it only when picked explicitly. Manually saved consolidations get the tag too.
- Dashboard: requests A9–A11 (read / outline / merge) and a "Master document" flow node
  (`npm run dashboard:check` clean; not published). Tests: `tests/consolidation/*`, `tests/plans/master.test.ts`.
## 2026-10-04 (accounts)

### Email accounts, connections, sharing (first version)

- Migration `202610040001_accounts_links_sharing.sql` (**not applied by the agent; apply it**): `accounts`,
  `account_links`, `shared_items`, RLS on, service-role only. Every accounts route answers
  `{ error, setupNeeded: true }` (503) until it exists, and the UI renders an explicit notice.
- `lib/accountsCore.js` (pure: email/password rules, scrypt, signed session tokens, cookies, link state machine,
  delivery authorisation, setup detection), `lib/session.js` (`ownerUserIdFor(request)`: session account id, else
  the demo owner; the demo page `/app` never sees account data), `lib/accountsRepository.js`,
  `lib/sharingRepository.js`, `lib/workspaceGuard.js`, `lib/resourceAccess.js`, routes in `app/api/accounts/*`.
- `/platform` (AppShell with `account`: fixed role, account menu with Log out, Connections, My students /
  My children), `/login`, `components/auth/AuthModal.js` (used by the landing page).
- Workspace route and the routes that took a demo owner (attempts, replan, concepts, mastery, patterns,
  recommendations, chat, the AI pipeline via `currentOwnerUserId`) now derive the owner from the session; for an
  account every id in a workspace request is checked for ownership and shared copies are read-only.
- Share / assign: read-only copies into `Shared documents / <sender>` with `shared-by:` / `assigned-by:` / `due:`
  tags; plans travel with their activities. Tests: `tests/accounts/*` (117).
- New env var `LUNA_SESSION_SECRET` (required in production). Details: `docs/ACCOUNTS.md`.

## 2026-09-24 (components)

### One design language for the components

- `modules/template-studio/engine/design.ts` (new): palettes (main / deep / tint / soft / line), ink,
  a type scale whose smallest size is 7.2pt, a spacing rhythm, radii, and the pieces every component
  is built from — `cardStyle`, `accentEdge`, `numberBadge`, `pointsPill`, `optionRow`, `answerBand`,
  `confidenceRow`, `chip`, `divider`, `writingLine`.
- Every non-kids block rebuilt on it: exam question, open question, true/false, mixed, compact,
  section + questions, answer box, flashcards (grid and single), vocabulary table, callout, key
  points, document structure, both headers and the footer. Options are lettered A, B, C via the new
  `{{A}}` token in `resolve.ts`. The three starters were re-tokenised to match.
- `instantiateBlock` now swaps a component's whole palette when recolouring (badge, lettering, tint
  and hairline together) instead of only its brightest colour.

### The engine behind the look

- `layout.ts`: a card whose content is hidden in this view fits what it shows (`resolveView` marks
  the group and remembers its designed bottom), so the student's copy has no hole where the answer
  is; and a repeating section taller than a page now splits at its own list — each page repeats the
  section heading and carries as many items as fit (`innerList` / `fitWindow`, `Ctx.windows`).
- `critique.ts`: issues carry a severity — faults (overlap, off-page, unreadable, low contrast) vs
  suggestions (no card, misaligned, cramped); rotated text is measured as it is painted; a page that
  is half empty is fine when the template puts one item per page; prose sections are not "missing a
  card". `faultsOf()` is what a check should assert on.
- `assemble.ts`: a house component that already repeats is used as it is — the previous code lifted
  its inner Options list out and threw the question card away.

### The confidence check

- A `confidence` option on the exam, open, mixed and section question cards prints "How sure are
  you?" with High / Medium / Low boxes.
- `ActivityPlayer` asks the same question on screen once a question is answered; `gradeActivity`
  records it per result; the score card names the questions the learner was sure about and got
  wrong, and the ones they guessed and got right.
- `errors.js` uses it: sure-and-wrong is conceptual (or a gap when it repeats), a guess on a weak
  topic is a gap.

### The generator builds from components

- `/api/templates/template-chat` matches a section to the catalogue when the planner did not name a
  component (by role and wording), returns `usedBlocks`, and names them in its reply.
- Verified end to end: "a Year 8 biology quiz with a confidence check on each question" →
  "Built from Luna's own components: Header, Exam question, Answer box, Footer", with the confidence
  option switched on and a student / answer-key pair of views.
- Tests: `components.test.ts` (every component passes the critic at every size, offers the
  confidence check, and recolours completely) and `assemble-blocks.test.ts` — 127 passing.


## 2026-09-24 (later)

### The interface critic

- `modules/ui/critique.js` — `auditUI(root)` reads the rendered DOM and reports what a careful eye
  would: text out of its box, controls overlapping, a row pushing the page sideways, controls wider
  than the screen, tap targets too small for a thumb, text too pale against what is actually behind
  it (translucent layers are composited; colours in syntaxes it cannot read are left unjudged), and
  unlabelled controls. Exposed as `window.lunaAuditUI` for a browser harness.
- `modules/ui/UiCritic.js` + `.ui-critic*` in `globals.css` — a badge that appears only when the
  screen has faults, lists them, outlines the element and re-checks on every DOM change. Mounted in
  `AppShell` in development and on request in production (`?uicheck=1`); ⌥⇧U toggles it.
- Fixed everything it found across all eight pages at 390 / 834 / 1440px: workspace rows now show
  Open · ★ · ⤓ and a `RowMenu` ("…") instead of eleven buttons; chips truncate at 11rem; the folder
  tree and the workspace panes may shrink (`min-w-0`), as may every panel (`.tw-scope .grid > *`),
  so one long file name no longer widens a column past the screen; status and error colours gained a
  darker `ink` variant for text (the bright colour stays on bars); the phone close button and the
  storage chip are now proper tap targets; nav items carry their name when the rail is icons only;
  search and file inputs are labelled.
- iPad: at 761–1100px the rail is icons, the page keeps 18px gutters and the two-column layouts
  stack. Phone: controls are at least 34px tall.

### Performance: the targets are the study plans

- `modules/performance/targets.js` — `targetsFor(trackBy, …)` builds the subject/topic mapping from
  the user's own plans (plan = subject, goal = topic, via `goal.resourceIds` and plan steps), with
  folders and question tags as fallbacks, plus `coverageOf` so the screen says how much of the
  evidence a plan actually accounts for. Chosen per view with "Track by".

### Performance: an agent that reads the mistakes

- `app/api/performance/coach/route.js` — takes mastery per topic, the error breakdown and the
  questions that keep going wrong, and returns a headline, a diagnosis, two to five actions (each
  with its evidence, kind and effort) and the same finding phrased for a student, a parent and a
  teacher. `dashboard/CoachPanel.js` renders it, caches a read against the evidence it was made
  from, and turns each action into "Do it now" / "Put it in a plan".

### Performance: a dashboard the reader arranges

- `modules/performance/views.js` — views as small documents (panels with visibility, order, mode and
  size), a curated default per profile, localStorage persistence, duplicate/blank/delete, and
  `exportView`/`importView` for sharing and selling (arrangement only, never results).
- `dashboard/registry.js` — 20 panels, each declaring its roles, size and the ways it can read
  (now / over time / broken down); `dashboard/Customise.js` — drag-to-reorder, show/hide, mode and
  width, save as a new view, reset, and "Sell this arrangement".
- `PerformancePage.js` rewritten around the registry: view tabs, dynamic filters (learner, preset
  range or exact dates, plan, folder, resource, activity, skill, difficulty, agent, template,
  material) and panels rendered in the view's order. The old monolithic Student/Teacher dashboards
  were removed; `parts.js` is shared.
- `marketplace/market.js` — a sixth shelf, "Performance dashboards".
- Tests: `apps/web/tests/agent-studio/views.test.js` (6) — 93 passing.


## 2026-09-18

### Hub, galleries, folders, publishing

- AI Tools hub reorganised into four areas: My agents (Built-in / Created by me / Bought tags
  with availability, Edit on own agents), My templates (first-page thumbnails), Agent Studio and
  Template Studio generators. Template Studio: gallery/list views, named folders (persisted in
  the template row), move-to-folder, `template-builder?open=<id>` deep link.
- Agent Studio: multi-line options fixed, output fields reorderable, compiler enforces distinct
  items + count guidance, default no-duplicates rule, agent-knowledge text no longer leaks into
  the user's paste box, Save-to-AI-Tools + Publish dialog (price, per-use / subscription /
  one-time), listing update pushes the new version to installed copies (they follow the listing),
  Edit own agents from the hub.

### Agent Studio — milestone 1

- Per `docs/AGENT_STUDIO_ARCHITECTURE.md`: canonical `AgentSpec` (purpose, instructions,
  inputs, context slots — agent knowledge vs user material, output schema as FieldDefs,
  examples, validation rules, model), auto JSON Schema, prompt compiler, validator, spec-patch
  iteration (quick actions + `/improve` model route), migration from legacy `.agent.json`.
- 5-step wizard (What it creates · Customize · Material · Output · Test & improve) with a live
  test loop (streaming, agent checks, structured output, feedback → spec diff, undo, "use as
  example"), Advanced panel, overview dashboard with marketplace card + publish.
- Runtime emits a `validate` step; spec agents use material strictly opt-in. Vocabulary
  Flashcards shipped as a built-in agent; old creator removed. 10 engine tests.

### Template Studio v3 — milestone 1

- Architecture per `docs/TEMPLATE_STUDIO_ARCHITECTURE.md` (approved). New TypeScript module
  `modules/template-studio/`: typed model (Template → Layout → View; elements with content
  source; groups own repetition; page scope separate from repetition; fields with stable ids),
  layout engine with flow pagination, nested repeats, page-per-item, views, overflow report;
  mapping proposals; migration of v2/legacy templates; component registry; undo/redo store.
- Editor: source chooser (blank / PDF / image / starters / saved), Design (Add · Pages · Layers,
  canvas, floating toolbar Group/Align/Duplicate/Delete, inspector Content · Layout · Style ·
  Visibility · Repeat), Data (editable field tree, optional agent schema + proposals), Preview
  (sample items, page/item counts, overflow warning), Export (by layout class).
- Templates are agent-independent: fields can be defined in the studio before any agent exists.
- Integration: `templateV3` persisted; render route branches on it (layout/view selectable);
  agents auto-map by field name and export PDF/DOCX/PPTX. v2 editor removed; legacy builder
  kept for reference.
- 12 engine tests; `npm run typecheck` (TS scoped to the module).

## 2026-09-17

### Template Studio v2 — document model

- New document model (`render/docModel.js`): pages with locked backgrounds (uploaded PDF pages via
  pdf.js, or images), static elements (text, image, shape, line) and dynamic elements (AI fields,
  groups) positioned in mm. Three repeat modes: field lists, flow groups that auto-paginate and
  repeat the header, and per-item pages. `layoutDocument()` is the single layout engine; HTML,
  PDF (pdf-lib), DOCX and PPTX (pptxgenjs) renderers draw its output (`render/docRenderers.js`).
- Canva-style editor (`TemplateStudioPage.js`): source chooser (blank / PDF / image / starters /
  saved), Design (page navigator, palette, drag/resize canvas, purple group boundaries, inspector,
  design-with-sample-data toggle), Data (agent → field mapping, sample items, paginated preview),
  Export (PDF / Word / PowerPoint / HTML). Legacy templates import into a group.
- `docModel` persisted in template meta; render route branches on it; agents' preview offers PPTX.
- Not yet: Word import, "Detect fields from PDF".

### Reference agent flow + Template Studio

- Every agent now runs through one shell (`RunAgentPage`): intro + "How it works", then
  Configure questions (material, optional style examples, guided choices) → Configure output
  (template picker with auto field mapping, styling, live preview) → Export (PDF via print, HTML,
  save to workspace). The Quiz Generator is a built-in agent config (`quizAgent.js`) rendered by
  the same shell; the 1,000-line legacy wizard was removed.
- Pipeline accepts `scope.styleDocumentIds` (format/level examples only).
- New Template Studio (`TemplateStudioPage.js` + `studioModel.js`): block canvas, field tags with
  suggestions from real agent fields, repeating groups, position/style inspector, live preview,
  Quiz starter. Compiles to the existing renderer model; `template.studio` persisted in
  `document_block_templates` meta for lossless reopening. Advanced builder kept behind a link.
- Renderer: repeated groups render record-major and wrapped (`.tpl-group`); consecutive repeated
  list items merge into one list; item index available to badges (`{{index}}`).

## 2026-09-16

### Phase 1 — design language + role homes

- Dark mode removed at the user's request (blurry). New crisp light design language appended to
  `globals.css`: Apple-like tokens, solid surfaces, no blur, single blue accent, pill buttons.
  Tailwind components lost their `backdrop-blur` / gradient CTAs.
- Roles: added Parent; role-specific nav and identity; new `DashboardPage` with Student "Home",
  Teacher "Classes" (student table, learns-best-with, suggested targeted homework) and Parent
  "Children". Data comes from `modules/dashboard/insights.js` (sample data, labelled) until
  accounts + attempts exist.

### Agent Marketplace rebuilt

- Replaced the placeholder `MarketplaceView` with `modules/agent-marketplace` (Tailwind): hero,
  search/category/sort, listing cards, details drawer, one-click install into the current subject
  (`.agent.json` + `ai-agent` tag) and "Run this agent" hand-off to the Run Agent page.
- Three curated starter agents (Flashcard Maker, Exam Question Writer, Vocabulary Builder) with
  real configs; Agent Builder listings now bundle the agent config. Prices shown, installs free.

### Dark mode + test fixes

- `ThemeToggle` in the TopBar (stored in `localStorage["luna-theme"]`, falls back to OS preference;
  applied pre-paint by an inline script in `app/layout.js`).
- Light-section surfaces tokenized (`--surface`, `--surface-rgb`, `--surface-soft-rgb`) and a
  `:root[data-theme="dark"]` block restores the navy palette. Targeted overrides for legacy rows /
  folder nodes. Template Builder stays light-only.
- Document-processing tests updated to the auxiliary parser contract; the auxiliary math tokenizer
  now parses linear-format scripts/accents (`x_(i)`, `^(2)`, `bar{x}`, `sqrt(...)`). 5/5 tests pass.

### Run Agent / Agent Builder redesign (branch `feat/agent-run-redesign`)

- Added Tailwind v4 (`@tailwindcss/postcss`, utilities + theme only, no preflight). Tokens in
  `app/globals.css` `@theme inline` reference the existing CSS variables so utilities follow the
  active theme; `.tw-scope` provides a scoped base reset for Tailwind-styled surfaces.
- Pipeline: `runAgentGeneration(config, { onProgress })` emits step events; the OpenAI call
  streams (`stream: true`) and reports token progress. `normalizeConfig` moved to
  `pipeline/agentConfig.js`.
- New route `POST /api/ai-tools/agent-builder/stream` (NDJSON, Node runtime, `maxDuration = 60`).
- Run Agent page rebuilt as a two-pane workspace: collapsible step cards on the left, sticky
  live preview on the right (iframe `srcDoc`, Preview/Data/Raw, PDF/DOCX export, desktop/mobile
  width) with a step-by-step generation overlay, plus a Customize sidebar (branding, accent, font,
  density, field order/visibility, block types, item limit). Presets now persist customization.
  Saved documents are rendered through the same `wrapPreviewDocument` used by the preview.
- Agent Builder test-run uses the same streaming hook and preview pane.
- Verification: lint 0 errors; `next build --webpack` green; document-processing tests unchanged
  (same 3 pre-existing failures).

## 2026-09-13

### Claude Code project setup

- Added root `CLAUDE.md` (stack, commands, layout, Supabase/LLM/Vercel rules, conventions).
- `.env.example` now lists every env var the code reads (OpenAI, math OCR, extraction tuning).
- `.gitignore` guards `auxiliary/**/node_modules` and `auxiliary/**/output`.
- Refreshed README "Current Status" / "Scope Boundaries" and the migration list in `docs/SUPABASE_SETUP.md` (14 migrations).
- Baseline: lint 0 errors / 66 warnings; production build green; 3 document-processing tests fail
  (expect `docx-ooxml-cdm` parser, code uses `docx-auxiliary-json-extractor`; 9 obsolete snapshots).
- Supabase project "Luna" was found INACTIVE (paused) and restored; all 14 migrations confirmed applied.
- Added migration `202609160001_fix_match_document_chunks_search_path.sql` (security linter 0011) and applied it via Supabase MCP.

## 2026-08-03

### Step 1: Repository scaffold

- Created scalable monorepo-style structure:
  - `apps/`
  - `packages/`
  - `modules/`
  - `docs/`
  - `scripts/`
- Added root workspace configuration (`package.json` workspaces)
- Added root documentation index in `README.md`

### Notes

- Architecture-first folder boundaries were taken from your technical document section "Code Organization".
- AI engine and rendering are intentionally left as placeholders by request.

### Step 2: Website scaffold and app packages

- Created `apps/web` as the main Next.js app.
- Created `apps/admin` as an admin placeholder app.
- Added workspace-ready package stubs:
  - `packages/ui`
  - `packages/shared`
  - `packages/database`
  - `packages/ai-core`
  - `packages/renderers`

### Step 3: Demo-aligned placeholder UI

- Implemented reusable app shell with:
  - Sidebar role switching (student/teacher)
  - Top bar and search UI
  - Page-level view switching
- Implemented placeholder views for:
  - Dashboard
  - Workspaces
  - Quizzes and Exams
  - Tutor Chat
  - Learning Analytics
  - Agent Marketplace
  - Agent Builder
  - Creator Revenue

### Step 4: Documentation coverage

- Added per-folder README files for `apps/*` and `packages/*`.
- Added module placeholder READMEs in each `modules/*` domain folder.
- Updated root README status and architecture notes.

### Open items

- Dependency installation and local run verification.
- Backend/API, auth, database schema, and all AI runtime integrations.

### Step 5: Validation

- Ran `npm install` successfully for workspace apps.
- Ran `npm run build` successfully for both `@luna/web` and `@luna/admin`.
- Noted dependency warning: `next@14.2.5` has published vulnerability advisories.

### Follow-up from validation

- Upgrade Next.js to the latest patched 14.x or 15.x line before production hardening.

## 2026-08-03 (update)

### Step 6: Next.js security upgrade

- Upgraded `@luna/web` and `@luna/admin` from Next.js `14.2.5` to `16.3.0`.
- Re-ran install and full workspace build.
- Result: successful build for both apps and `npm audit` reports `0 vulnerabilities`.

### Notes

- This is a major-version upgrade; current placeholder app remains compatible.

## 2026-08-03 (update 2)

### Step 7: Node runtime policy alignment

- Updated root Node engines policy to `>=20.9.0 <25` for Next.js 16 compatibility.
- Added `.nvmrc` pinned to `24.15.0` to standardize local/dev/CI runtime.
- Documented Node prerequisites and `nvm install`/`nvm use` steps in root README.

## 2026-08-03 (update 3)

### Step 8: CI workflow enforcement

- Added GitHub Actions workflow: `.github/workflows/ci.yml`.
- CI now runs on every push and pull request.
- Workflow uses Node version from `.nvmrc` via `actions/setup-node`.
- Workflow executes:
  - `npm ci`
  - `npm run build`

### Notes

- This enforces runtime parity and build health for all incoming changes.

## 2026-08-03 (update 4)

### Step 9: Second CI job for quality checks

- Added a second CI job in `.github/workflows/ci.yml` named "Lint and Typecheck".
- Job runs on every push and pull request, using Node from `.nvmrc`.
- Job executes:
  - `npm ci`
  - `npm run lint`
  - conditional typecheck step that activates once TypeScript configs exist and a `typecheck` script is defined.

### Supporting updates

- Replaced deprecated Next.js lint command with ESLint CLI in app scripts.
- Added root ESLint flat config (`eslint.config.mjs`).
- Added ESLint dev dependencies at root (`eslint`, `@eslint/js`, `globals`).

### Validation

- Ran `npm install`, `npm run lint`, and `npm run build` successfully.
- Current lint output includes warnings only, no errors.

## 2026-08-03 (update 5)

### Step 10: Workspace management UI flow

- Implemented an interactive workspace UI in `apps/web` for:
  - workspace creation
  - subject creation inside a selected workspace
  - TXT-only document upload in the selected subject
- Added local preview cards for uploaded TXT documents (name, size, preview snippet).
- Added clear scope indicators and disabled states when workspace/subject context is missing.

### Technical notes

- This feature currently uses local client state only; there is no backend persistence yet.
- Upload uses browser file APIs and accepts `.txt` / `text/plain` only in this phase.

### Validation

- Re-ran `npm run lint` and `npm run build` after the UI changes.
- Result: builds pass, lint warnings remain unchanged from current ESLint baseline.

## 2026-08-03 (update 6)

### Step 11: Folders, topic tags, and document table actions

- Extended workspace UI to support folder and topic-tag creation within selected subjects.
- Added TXT upload scope controls for folder assignment and comma-separated tags.
- Replaced document card list with table-style document management including:
  - rename
  - remove
  - preview modal (full TXT content)

### Step 12: Mock API persistence before backend integration

- Added dynamic API route: `apps/web/app/api/workspaces/route.js`.
- Added file-based mock datastore:
  - `apps/web/mock-data/workspaces.json`
  - `apps/web/lib/mockStore.js`
- Frontend now loads and mutates workspace/subject/document state through API actions (no longer local-only state).

### Validation

- Re-ran `npm run lint` and `npm run build`.
- Build output confirms dynamic route registration for `/api/workspaces`.

## 2026-08-03 (update 7)

### Step 13: Folder and topic-tag full CRUD

- Added folder edit and delete actions in the subject organization UI.
- Added topic-tag edit and delete actions in the subject organization UI.
- Added API actions in `apps/web/app/api/workspaces/route.js`:
  - `renameFolder`
  - `removeFolder`
  - `renameTopicTag`
  - `removeTopicTag`

### Data consistency behavior

- Removing a folder clears that folder assignment from related documents (documents remain available).
- Renaming/removing a topic tag also updates/removes matching document tags within the subject.

### Validation

- Re-ran `npm run lint` and `npm run build`.
- Build remains successful; lint warnings are unchanged baseline warnings.

## 2026-08-03 (update 8)

### Step 14: Workspace and subject full CRUD with cascade checks

- Added workspace rename and delete actions in the UI and API.
- Added subject rename and delete actions in the UI and API.
- Added safety checks before destructive deletes:
  - `removeWorkspace` returns `409` with cascade counts unless `force: true`.
  - `removeSubject` returns `409` with cascade counts unless `force: true`.
- Added confirmation flows in UI to perform forced delete only after user confirmation.

### Data safety behavior

- Workspace delete warning includes counts for subjects, folders, topic tags, and documents.
- Subject delete warning includes counts for folders, topic tags, and documents.

### Validation

- Re-ran `npm run lint` and `npm run build`.
- Build remains successful; lint warnings remain unchanged baseline warnings.

## 2026-08-04 (update 9)

### Step 15: Runtime fix for "code not working"

- Hardened mock persistence in `apps/web/lib/mockStore.js` for serverless/read-only environments:
  - writes now gracefully fall back to in-memory storage for the current instance
  - reads return cached data if filesystem access is unavailable
- Fixed datastore path resolution bug by resolving `mock-data/workspaces.json` relative to the module file path instead of `process.cwd()`.

### Why this mattered

- Running from different working directories (root workspace vs app directory) could fail to locate the mock JSON file.
- On deployments like Vercel, filesystem writes can fail; fallback prevents runtime crashes.

### Validation

- Verified mock store can read/write without throwing.
- Re-ran build successfully.

## 2026-08-04 (update 10)

### Step 16: Supabase backend bootstrap

- Added initial SQL migration for core learning model tables:
  - `workspaces`, `subjects`, `folders`, `topic_tags`, `documents`, `document_tags`
- Added Supabase database package implementation in `packages/database`:
  - admin client factory
  - environment configuration checks
  - repository query layer for workspace tree + CRUD operations
- Added backend API routes in web app:
  - `GET /api/supabase/health`
  - `GET/POST /api/workspaces-supabase`
- Added `.env.example` placeholders for Supabase credentials and demo owner UUID.
- Added setup guide: `docs/SUPABASE_SETUP.md`.

### Notes

- Existing frontend remains attached to mock route (`/api/workspaces`) for safety.
- Once Supabase env and migration are applied, frontend can be switched to `/api/workspaces-supabase`.

## 2026-08-04 (update 11)

### Step 17: Supabase-first workspace flow + deployment hardening

- Switched workspace UI client calls in `apps/web/components/AppShell.js` from mock route to Supabase route:
  - `GET/POST /api/workspaces-supabase`
- Added subfolder-capable UX in `apps/web/components/views.js`:
  - create folder with optional parent
  - hierarchical folder rendering
  - folder path labels in document table and upload selector
- Added migration for folder hierarchy:
  - `supabase/migrations/202608040002_add_folder_hierarchy.sql`
  - introduces `folders.parent_folder_id`
- Added schema compatibility guard in repository layer:
  - workspace, subject, folder, tag, upload flows still work when migration 0002 is not applied
  - subfolder create returns explicit actionable error until migration is applied

### Step 18: Vercel deploy fixes for monorepo package resolution

- Resolved Vercel app-only deployment failure caused by local workspace package import (`@luna/database`).
- Moved Supabase runtime imports in web API routes to app-local libs:
  - `apps/web/lib/supabaseClient.js`
  - `apps/web/lib/workspacesRepository.js`
- Added direct dependency to web app:
  - `@supabase/supabase-js`
- Successfully deployed and aliased production build:
  - `https://luna2-share-web.vercel.app`

### Validation

- Local API smoke test against Supabase route:
  - create workspace
  - create subject
  - create folder
  - add topic tag
  - upload txt document
  - read and visualize from returned tree
- Subfolder action returns explicit migration-required error until SQL 0002 is applied in Supabase.
- Production endpoint check currently reports missing Supabase env vars in Vercel runtime.

## 2026-08-04 (update 12)

### Step 19: Workspace UX + data model upgrade for document organization

- Added multi-folder assignment support for uploaded TXT documents.
- Added migration `supabase/migrations/202608040003_add_document_folder_map.sql`:
  - new `document_folders` bridge table
  - backfill from existing `documents.folder_id`
- Updated Supabase repository (`apps/web/lib/workspacesRepository.js`):
  - document list now includes `folderIds`
  - upload supports assigning to multiple folders
  - compatibility guard provides actionable error if migration 0003 is missing
- Updated workspace API route payload handling (`apps/web/app/api/workspaces-supabase/route.js`) for `folderIds`.
- Updated workspace manager UI (`apps/web/components/views.js`):
  - checkbox-based folder assignment on upload
  - folder/tag/text filters for document table
  - friendly filter reset and results count
  - multi-folder display per document

## Agent run: once-per-document fields, creator knowledge, retries (2026-09-18)

- Runtime (`pipeline/agentBuilder.js`) keeps root fields returned by the model (`data: { ...root, items }`), so once-per-document fields such as `title` reach validation, the Studio tester, the Run preview (`doc-head` section) and template mapping (`buildTemplateData(..., rootData)`).
- Creator knowledge (`knowledgeText`) is sent to the model as a labelled `agentKnowledge` block ("understand style, never copy layout") instead of being merged into `contextPrompt`; merging it made small models imitate the example paragraph and return several bullets in one item.
- `max_tokens` raised to 6000, `finish_reason` tracked (explicit "ran out of space" / content-filter errors), a runaway-whitespace guard on the stream, and one automatic low-temperature non-streaming retry before the local heuristic fallback.
- RunAgentPage recompiles spec-based agents on load (`runConfigFromSpec(spec)`), so prompt-compiler and validation improvements apply to agents saved earlier; every spec agent gets the `no_duplicates` check; failed checks are now shown under the output.

## Template Studio: Blocks (pre-made objects) (2026-09-18)

- `template-studio/engine/blocks.ts` — `BlockDef` (schema fragment + bound element tree + toggles + accent), built-in blocks (Exam question, Open question, True/false, Flashcard, Vocabulary table, Document structure, Key points), `instantiateBlock()` (merges fields by name, remaps ids, applies accent, hides toggled-off parts), `blockFromElements()` (save a selection as a block, keeping only the fields it uses) and a localStorage block library.
- Static text supports `{{n}}` — the 1-based index of the innermost repeated item — for question numbering without a schema field.
- Add panel has two tabs: **Elements** (raw) and **Blocks** (categories + My blocks, colour presets, toggles, Insert). Floating toolbar: **Save as block**. My blocks: **Sell in Marketplace** (price, one-time/subscription/free) → listing `kind: "block"`.
- Marketplace has an **Agents | Design blocks** switch; block listings install into the buyer's block library.

## Agent runs: read material in full, cost estimate, lunas credit (2026-09-19)

- **Material**: `selectChunksWithinBudget()` sends whole chunks (previously each chunk was cut to 1,800 chars and at most 12 were sent) — everything when the material fits ~48k chars, otherwise the best-scoring chunks within the budget, restored to document order. `normalizeConfig` now keeps `knowledgeText` (it was being dropped, so creator knowledge never reached the model). `buildUserMessage()` is the single place the prompt payload is assembled (instructions, output fields, creator knowledge, pasted context, question answers, example, refinement prompt, material, style samples).
- **Estimate**: `POST /api/ai-tools/agent-builder/estimate` → `estimateAgentRun(config)` runs the same material preparation without a model call and returns tokens in/out, USD (list price in `MODEL_PRICING`), documents read and whether they were truncated. Shown under Generate in the Run flow and the Studio tester (`modules/credits/RunEstimate.js`).
- **Lunas**: `modules/credits/credits.js` — local ledger (1 luna = 1 token, 1M starting grant), charged with the real `usage.total_tokens` after each run (estimate as fallback); `CreditsBadge` in the top bar with usage history and a demo top-up. Monetisation rules (tiers, overage, marketplace fees, transfers) to replace this ledger later.
- Stream route `maxDuration` 120s; retry attempt capped at 3,000 output tokens so a looping first attempt cannot exhaust the function time.

## Agent Studio: flexible output structure (2026-09-19)

- Output schema is now an ordered mix of **once-per-document fields** and **lists** (zero, one or several). The first list is emitted as `items` (template/runtime contract); other lists keep their slug. A summary agent can be just `title` + `summary` with no list.
- `outputSkeleton()` renders a commented JSON skeleton; the prompt's `OUTPUT STRUCTURE` section and the Output step's "JSON structure the agent will return" panel both show it, so the structure the model must return is explicit.
- Runtime accepts list-less output (`items` defaults to `[]` when the schema has no list); count / no-duplicate checks and hints only apply when a list exists.
- Tester renders each top-level field generically (once fields as boxes, each list as numbered cards).

## Template Studio: simpler editor (2026-09-19)

- Top bar: name (inline rename) · Saved/Unsaved · Save · View selector (every layout+view pair as one "view") · size · Design | Views | Data | Preview | Export · undo/redo.
- **Views mode** (`views/ViewsMode.tsx`): cards per view (formats, size, page count from sample data), New view dialog (name, description, size, export formats; same size shares elements, other size copies + scales them via `cloneLayoutForPreset`), View settings (name, description, exports, per-element visibility, delete). `View` gained `description` and `exports`; Export offers only the view's formats.
- Add panel: Basic (Text, Heading, Image, Box, Line, Table soon) · AI fields (AI text, AI image) · Premium (built-in blocks) · Custom (my blocks), with search.
- AI field inspector (`AiFieldPanel`): field name · type · Repeat (Once / Repeat per item / One item per page). Repeat wraps the element in a repeating group bound to the first list (creating the list/item field when needed); Once moves it back to a document-level field.
- Layers: ▲▼ order, 👁 hide in this view, lock.
- Canvas now draws elements as exports will (group fills/strokes/radius, element colours, no blue wash on AI fields) and previews repetition: flow/grid groups show two faded ghost copies where items 2–3 land (with `{{n}}` numbering), page-repeat groups show a stacked-pages hint. Left column widened to 248 px with wrapped block descriptions.

## Template Studio: block design mode, component families, sections (2026-09-19)

- **Simple | Advanced** switch (stored as `template.editorMode`, default simple). Simple = `design/SimpleDesign.tsx`: ordered list of top-level blocks (output order), ▲▼, duplicate, delete, repeat chips (Once / per item / one per page / grid), field chips and nested repeat summary; `stackElements()` keeps blocks stacked inside the margins so the same list flows into A4, Letter or slides; footers (`pageScope every`, lower page) stay pinned. Advanced = the canvas.
- Blocks have `family` + `variant`; the Premium section shows one row per family with a "Design" dropdown. New blocks: Header (Exam header / Centered title), Footer (title + `{{page}}`), Section header, **Section + questions** (nested `Sections[] → Questions[]`, agent order), Question card compact (2-column options), Answer box, Flashcard one-per-page, Callout.
- `{{page}}` / `{{pages}}` tokens in static text are resolved after pagination.

## Template Studio: "one of" designs, repeat toggle, group scaling (2026-09-19)

- `GroupElement.condition { fieldId, equals }` — "Show only when" (Repeat · Show when tab). Sibling groups at the same spot with different values = one-of designs; the layout engine skips non-matching groups and fits the parent's height to the shown variant. `FieldDef.options` lists allowed values (sample data cycles through them). New block: Question card → "Mixed — design chosen by question Type".
- Canvas: variants are drawn stacked with "when Type = …" labels so each can be edited; repeat ghosts are now behind a "Show repetitions ×3" toggle (default: one iteration).
- Resizing a group scales children positions, sizes and font sizes proportionally.
- Wording: lists explained as fields with many elements; "Repeat for each element of the list".

## Template Studio: agent-ordered content, placement, sequential flow (2026-09-19)

- **Content in the agent's order** (Add → Agent order): dialog listing every design by family; tick the ones allowed, edit their Type values, name the list. `buildSequenceBlock()` produces one repeating block over `Content[]` whose item = `Type` (+ union of the chosen designs' fields), each design shown only for its Type.
- **Placement** (`element.placement`: flow | fixed | new_page; "every page" = pageScope every) — in Simple rows and the Layout tab. Engine now lays a page out **sequentially**: flowing elements start where the previous ended (designed spacing kept), a flowing element that doesn't fit moves to the next page, fixed blocks keep their position and cap the flow above them on the first page, new_page starts a fresh page after every-page headers.
- Advanced canvas: neutral dashed edges for repeating groups, labels and AI-field outlines only on selection/hover, quieter margins/background.
- Simple list: each block has an **Order** control — "Fixed here" or "Let the agent decide →" (joins the neighbouring agent-ordered set or starts one). Set cards list their designs with Type values, ✕ takes a design back out as a fixed block, "＋ Add design" opens the design picker for that set. Groups carry `origin { blockId, typeValue }` so they can be rebuilt; type values are unique within a set.
- Data tab regrouped **by component**: one collapsible card per block (sets show each design with its Type value), field rows highlight the matching element in a live **component preview** on the right (sample data, ElementView at 3×). The full editable field tree moved into an "All fields" disclosure; agent compatibility sits under the preview.

## Agent output = template blocks; compatible agents (2026-09-20)

- Agent Studio step 4 now defaults to **Blocks**: `steps/OutputComposer.tsx` embeds Template Studio's simple mode in `composer` mode (components only, no formatting) — the composition's fields become `outputSchema`; the composition is stored on the spec as `outputTemplate` (+ `outputTemplateId`). "Start from a saved template" loads a library template's structure; "Save as template" / "Update template" writes it to the library; "Format in Template Studio ↗" deep-links to it. "Fields (manual)" keeps the old builder.
- Manual builder: per-element fields have a value type plus a "Many values (list)" flag instead of a separate list type.
- `compatibleAgents()` (mapping.ts): agents whose output matches every field a template uses (score ≥ 0.6). Shown as ✦ chips on template cards in the Template Studio gallery and the AI Tools hub, and in the Data tab. Built-in tools expose their `agent` config for this.
- Composer: AI text / AI image fields (each a new named field), **Document data** section (Date, Topic, Course, Teacher, Class, custom) → creates an agent input and a once field with `fromInputId`; the runtime copies the user's answer into the output (excluded from the model schema). Component preview column on the right (`design/ComponentPreview.tsx`, shared with the Data tab) with inline field renaming. Once fields from blocks are prefixed with the component name (`header_title`); the output JSON is ordered by block order.

## Rendered thumbnails, template delete, hidden metaprompt refiner (2026-09-20)

- `TemplateThumbnail` renders the real first page (layout engine + sample data → SVG); prefers a paged layout; shows a page-count badge.
- Template gallery/list: 🗑 delete with confirmation (`onDelete` → `onDeleteDocumentBlockTemplate`).
- **Refined brief**: `POST /api/ai-tools/agent-builder/refine` (metaprompt agent) rewrites the creator's wording into a precise brief + implied rules + missing field descriptions; stored on the spec as `refined` with a `sourceHash` of intent/inputs/outputs (stale when the recipe changes). `compileAgent` uses it when current (union of user and refined rules; refined descriptions fill empty ones, also in the JSON schema). Triggered silently before the first test run ("Preparing…") and before saving; visible only under Advanced ("Refined brief", "Refine now", full prompt).
- Fix: `migrateToV3` returns v3 template objects untouched (an agent's stored `outputTemplate` was being treated as legacy and collapsed into one block named after the agent).

## Worksheets, interactive activities, activity layer, component chatbot (2026-09-20)

- **Kids learning blocks** (`category: "kids"`): Match the pairs, Fill in the blanks, Math practice set (2-column, answer boxes), Pair puzzle grid (cut tiles), Word search (grid + words), Tracing, Cut and paste, Multiple choice (kids).
- **Activities engine** (`modules/activities/engine/activity.ts`): `buildActivity(fields, data)` derives questions from any block by field-name convention (options+answer → choice; statement/boolean → true/false; sentence|problem+answer → text/number; left+right → matching; front+back → flashcard; nested sections recurse with group labels); `gradeActivity()` scores locally. `renderActivityHtml()` = standalone interactive HTML. `ActivityPlayer.js` = the in-platform player (progress bar, check, corrections, explanations).
- **Run flow → Export**: "Do it on Luna · recommended" (save as `.activity.json` doc tagged `activity`, opens the player; attempts saved as docs tagged `activity-attempt`) + "Interactive HTML"; file downloads become the second option. Template Studio Export offers the interactive HTML (sample data) when the template has answerable blocks.
- **Activities page** (nav for student/teacher/parent): to do / done / all / mistakes; due dates (tag `due:YYYY-MM-DD`), folders, attempts with best score, per-activity results and a filterable list of every mistake (topic/group, difficulty, given vs expected).
- **Component chatbot** (`/api/templates/component-chat`, `design/ComponentChat.tsx`, `engine/componentDsl.ts`): describe a component → DSL (fields, list, item elements) → `blockFromDsl` → My blocks; follow-up messages refine; guard rails normalise whole-grid drawings into one item. Marked Premium.
- Component chatbot now runs an **internal design agent**: planner (exact spec: list/fields, columns, cell size, coordinates, palette, checks) → builder (DSL) → deterministic normaliser (cells, text widths, background box, missing fields) → reviewer pass when geometry issues remain. Uses `LUNA_COMPONENT_MODEL` (default gpt-4o). `docs/HANDOFF_PROMPT.md` added for moving the project to another Claude account.
- Fix: DSL grid items are wrapped in a free-layout item group (the grid was placing each element in its own cell); engine: a grid *repeat* no longer re-grids the instance's children (tiles were 9 mm wide). New built-in **Square puzzle** (edge-matching tiles, Top/Right/Bottom/Left). Chatbot normaliser de-overlaps texts and grows the cell to fit; known worksheet patterns taught to the planner.
- Text rotation (`style.rotate` ±90) across canvas, thumbnails, HTML, PDF, PPTX; `FieldDef.sampleCount` so previews show a full instance (16 tiles). Square puzzle v2: 16 tiles in solved order, edge words rotated, outer edges empty, cut guides. Design agent: planner infers count/content rules/rotation for simple prompts (`sampleCount`, `contentRules`), DSL gained `rotate`/`sampleCount`. Activity kind **tiles**: the child rebuilds the grid in the player (tap tile → tap slot, swap), graded by placement.
- Component chatbot: field elements are bound to real field names (exact → fuzzy), static labels that merely repeat a field name become that field, so no duplicate "missing field" texts. Sample data for square tile puzzles leaves the grid's outer edges empty like a real solved puzzle.
- **Derived lists** (`FieldDef.derive`): `engine/derive.ts` computes square-puzzle tiles from numbered word pairs (pair k → one shared edge; outer edges empty) at layout/activity time; the agent only produces `Pairs` (Word A / Word B, 24 for 4×4) and the tiles are excluded from the model schema. Square puzzle block and the chatbot (`derive: "tarsia"`, edge fields assigned by geometry) use it. Chatbot drops lines that duplicate the item border, and accepts a **reference image** (sent to the planner as vision input).
- **Fit-to-box text**: the layout engine shrinks the font (down to 60 % of the designed size) until the longest word fits the width and the wrapped text fits the designed height, before letting the box grow. Rotated labels in HTML are drawn with `writing-mode` in a swapped box (no transform glitches).

## Resources library (2026-09-23)

- `modules/resources/`: `resource.js` (record `{ name, activity, data, request, meta }` stored as a document tagged `resource`; helpers for favourites, difficulty, tags, attempts/stats), `SaveResourceDialog.js` (name · folder · difficulty · tags · favourite · open after saving), `ResourceExports.js` (every view of the resource's template × its formats, downloaded through `/api/templates/render-preview`), `ResourcesPage.js` (gallery + list, search and filters by agent / template / source material / folder / tag / favourite, per-card stats — questions, difficulty, times done, errors —, open → Do it on Luna | Downloads | Results, move to folder, delete, regenerate).
- Run flow: Export step now leads with **Save resource…**; the dialog stores the full request (answers, material, knowledge mode, template, mapping, styling). **Regenerate** reopens the agent (`custom-agent:<id>?resource=<doc>`) with that request restored, the previous output loaded and a banner — change anything and generate again, or just switch template and save.
- Nav: Resources for student, teacher and parent.

## Performance dashboard + study plan (2026-09-23)

- `modules/performance/`: `metrics.js` (joins attempts with their resource → folder, agent, template, material, tags, question kinds; `summarise`, `errorsByTopic`, `byResource` with iteration delta, `timeline`), `learners.js` (learner names per browser; attempts now store `learner`), `plan.js` (study goals tagged `study-goal`: title, date, target score, linked resources, `goalProgress`), `PerformancePage.js`.
- Dashboard (nav for all roles, role-aware copy): learner selector for teacher/parent (whole class / all children), date range, filters by folder · resource · activity type · agent · template · source material; KPIs (activities done, average score, mistakes, repeated & improved, time on task); activity timeline; mistakes by topic with rate and examples; per-resource table with times done and improvement; study plan with exam dates, progress bar, "next" resources and per-type scores.
- Resources page: **＋ Folder** (and ＋ Subfolder of the filtered folder) plus "Doing activities as" learner picker for teacher/parent.

## Question classification, timing and source citations (2026-09-23)

- `ActivityQuestion` gained `skill` (pre-set `SKILLS`, editable) and `source { documentName, locator, extract }`; attempts store `durations` (ms per question) and results carry `skill` + `ms`.
- The runtime returns the retrieved `sources` (document, passage, text); `attachSources()` links each question to the passage with the most shared terms and quotes the best sentence. Agent-provided `source`/`quote` fields win. Exam-question blocks now include optional `Skill`, `Difficulty` and `Source` fields so agents classify as they generate.
- Player: per-question timer (clock follows the question being answered); after checking it shows the source extract, the skill/difficulty chips and the seconds spent; the header shows total minutes.
- Resources → open → **Questions & sources**: edit each question's skill (list or custom), difficulty and topic, or set them in bulk; the matched source extract is shown under each question.
- Performance: filters by skill and difficulty; KPI shows seconds per question and an estimated duration for a 20-question exam; new sections "What the mistakes are about" (per skill: asked, seconds, wrong, rate), "By difficulty" and "Time per question" by activity type.

## 2026-09-23 — Starter templates, merged mapping, field highlighting, design sets
- `modules/template-studio/engine/starters.ts`: three finished templates — Exam (Student / Answer key), Flashcards (Study cards / Front only), Vocabulary list (Full list / Practice). Offered in `SourceChooser` via `STARTER_TEMPLATES` / `createStarter(kind)`; the saved library was emptied and seeded with them.
- `modules/ai-tools/tools/agent-builder/outputFields.js` (new): `mergeKey` / `buildMappingRows` merge template slots that mean the same thing (case, spacing, singular/plural) into one mapping row that writes to every slot behind it; `addOutputField(agentConfig, …)` adds a simple field to an agent's output fields, JSON schema and (for Agent Studio recipes) `spec.outputSchema`.
- `RunAgentPage`: mapping rows are merged and carry a ×N badge; unmapped rows get "＋ Add to agent"; an "Add an output field" form sits in both the Output fields tab and the mapping list; selecting a row (or hovering an output field) highlights every place it fills in the preview.
- Renderers: `renderDocHtml(..., { highlight })` outlines the laid-out items of the given fields; `renderHtml` resolves field names to ids (`highlightFields`), and `/api/templates/render-preview` accepts `highlightFields`.
- `buildTemplateData` publishes the agent's items under the v3 template's own list name (`collectionKeys`), not only the legacy `items`; `compileForSave` stores that name in `repeatCollectionField`. Without it a template whose list is called "Questions" rendered a single empty item.
- `modules/template-studio/preview/VariantGallery.tsx` (new): Preview mode shows every design a "one of" component can take, with an example of each and a shortcut to raise the sample count so all of them appear in the rendered document.

## 2026-09-23 (2) — Maths, phones, generated documents, field importance, template pairings
- `engine/latex.ts`: `renderMath` / `latexToUnicode` convert embedded LaTeX to readable characters inside `valueToText` and `richTextToLines`, so every renderer benefits; `docRenderers` maps characters WinAnsi cannot draw to ASCII spellings (a formula used to abort the PDF export).
- Phones: `viewport` meta in `app/layout.js`; `globals.css` gains a ≤760px block (rail as a slide-over sheet behind a menu button + scrim, compact header, single-line scrollable site map, stacked panels, scrollable tables); `modules/ui/PhoneCollapse.js` folds the Resources and Performance filter bars behind one line. Nothing changes above 760px.
- `engine/fit.ts`: field `importance` ("essential" | "useful" | "extra", inferred from the name when unset) and `templateFit()`. Agent Studio's field cards set it; the run flow shows the verdict per template and in the mapping panel, and empty slots no longer block a run (only a mapping pointing at a field the agent lacks does).
- `engine/autoTemplate.ts` + `agent-studio/steps/GeneratedTemplate.tsx`: a finished document (or slide deck) designed from the agent's output fields — header, numbered cards, answers in their own view, footer — previewed live, saveable to Template Studio, replaceable by a saved template. `OutputComposer` now seeds itself from the fields instead of erasing them.
- `server/designer.js` (extracted from the component-chat route) + `app/api/templates/template-chat/route.js` + `engine/assemble.ts` + `design/TemplateChat.tsx`: describe a whole template in words (with a reference image and references to saved templates/blocks); a hidden pass rewrites the description into a brief (page size, sections, views), each section is designed by the component agent, and the sections are assembled into a template — repeating sections are hoisted so they paginate.
- `layout.ts`: first/last-scoped groups are recognised by their descendants, so a header group is no longer drawn twice on the page.
- Run flow: `outputMappings` on the agent document stores the mapping, field types and styling per template; selecting a template restores its setup and the list marks templates already set up.

## 2026-09-24 — Navigation, filing, study plans
- Shell: `SideNav` is now a collapsible navigation rail (icons from tablet width, a sheet on phones); `TopBar` carries the account cluster (lunas, storage left, profile with the role switch). `navByRole` gained icons plus `templates` and `plans`; Template Studio is routed as its own section (`templates`), and the AI hub lists agents only, each card with a delete.
- `modules/ui/FolderTree.js` + `modules/ui/DocumentBrowser.js`: the shared filing UI — nested collapsible folders with counts, create/rename/delete, drop targets; documents as a grid or an indented list with multi-selection (click, ⇧ range, ⌘ add, ⌘A), drag-to-folder, copy/paste (paste files the document into the open folder as well) and bulk move/delete.
- `WorkspacePage` has a "Browse" mode over everything in the space (`WorkspaceBrowser`), with "Manage" keeping the full legacy manager. `ResourcesPage` now shows workspace/space pickers, the same folder tree, tag chips and drag-to-file, so the library mirrors the workspace.
- `SaveResourceDialog` shows the folder hierarchy indented and can create a folder on the spot (`onCreateFolder` passed through the run flow).
- `modules/plans/`: `plan.js` (plan model, progress, weeks), `PlansPage.js` (plan cards with progress rings, a week-by-week schedule, goals, settings) and `AddToPlanDialog.js` — "＋ Add as activity" on any resource schedules it with a due date, in an existing or brand-new plan. An item counts as done when its resource has an attempt.
- Template generator: the design rules now require every item to be a card (pastel fill, stroke, radius, badge, inset writing box, playful for children); the brief carries `audience` and `styleNotes` that every section request must follow; sections are capped in height (62 mm repeating, 22 mm footers) and the normaliser guarantees a card behind single-column items.

## 2026-09-24 (2) — Folders only, resources in place, plans that schedule themselves
- `modules/workspace/ui/folderModel.js`: one folder tree per workspace — a subject is a top-level folder (`s:<id>`), its folders subfolders (`f:<subject>:<folder>`). The subject/folder storage is untouched, so nothing had to be migrated; the shell's handlers took an optional `subjectId` so the browser can act on any branch.
- `WorkspaceBrowser` rewritten: material and generated resources in the same folders, with preview, rename, download, delete, favourite, tags, and for resources open/do/regenerate/plan. Upload of files or a whole folder (subfolders recreated from `webkitRelativePath`), download of a selection or a folder as a zip (jszip), rubber-band selection in `DocumentBrowser` plus per-row actions.
- The Resources page and nav entry are gone; `ResourceDetail.js` holds the panel (do it on Luna, what it teaches, questions & sources, downloads, results) and is opened from the workspace. `/api/resources/concepts` proposes the resource's context and granular learning goals; `modules/resources/concepts.js` indexes them across resources.
- Plans v2 (`modules/plans/plan.js`): several deadlines per plan (`DEADLINE_KINDS`), goals carrying concepts and resource links, sub-plans via `parentPlanId` with `withSubPlans`, `calendarDays` (every plan on one grid, minutes per day) and `upcoming` (the alert panel). An attempt with no resource no longer marks unrelated steps as done.
- `PlanCalendar.js`: 4–12 weeks, colour per plan, amber when a day carries more than 120 minutes, drag an item to another day to move its due date. `PlansPage` gained the calendar tab, the alert panel, deadline and sub-plan editors, and goal→concept/resource linking.
- `GeneratePlanDialog.js` + `/api/plans/generate`: pick material, a deadline, weekly minutes and the practice kinds; the planner spreads the work, leaves the last stretch for review, and is fed the learner's averages and weakest skills so the schedule is fitted to them.

## 2026-09-24 (3) — Generate from components, critique the result, read performance per plan
- `/api/templates/template-chat` now sends the block catalogue (name, description, fields, options) and makes `reuseBlock` an enum of those names: the planner picks house components — "Header", "Multiple choice (kids)", "Footer" — and only draws a section from scratch when nothing fits. Sections that name a block skip the design pass entirely (faster, cheaper, better looking); `assemble.ts` instantiates them from `builtInBlocks()` + the saved library with the brief's accent and the requested options.
- `modules/template-studio/engine/critique.ts`: the design critic. `critiqueTemplate` lays the template out and reports overlapping text, elements in the margin, type under 7pt, text that cannot be read against what is behind it, repeating blocks with no card, blocks that miss the common column and half-empty pages; `repairTemplate` fixes what can be fixed; `polishTemplate` iterates critique → repair → critique. `TemplateChat` runs it before showing anything and reports what it fixed. Headers and footers are exempt from the margin rule.
- Performance: `byConcept`, `retryGains`, `dailyActivity`, `streak`, `trend`, `repeatedMistakes` and `forPlan` in `metrics.js`; the page gained a plan selector that rescopes every metric to that plan, a plan panel (schedule, days left, goals with their concepts, what is left) and new sections for concept mastery, questions that keep going wrong, whether repeating helped, and the daily rhythm.

## 2026-09-24 (4) — Plans that execute, one workspace, better starters
- `modules/plans/execute.js`: `runStep` / `executePlan` turn a plan's promises into material — the quiz, exam, worksheet, flashcards and summary recipes map to the built-in agents (plus a small summary agent), run through `/api/ai-tools/agent-builder`, and the result is saved as a resource in the plan's folder, tagged `activity` and `due:<date>`, with the plan's concepts attached and the step pointed at it. "Plan it for me" builds straight after planning (a checkbox), and every plan card/detail has "✦ Build N resources". Verified end to end: 7 resources generated and filed, 6–12 questions each.
- The workspace absorbed the Advanced screen: the review centre is a node in the tree (approve / re-read per document), the legacy repair tools sit behind one discreet link, and downloads offer every format the processing allows — original, HTML, editable HTML, Markdown, JSON, text for material; JSON, HTML, text (built client-side from the resource) plus PDF/Word/slides through the template for generated resources; folder downloads take a format and come back as a zip.
- Starters redesigned: the exam has a title band with an accent edge, name/date rules, tinted question cards with a coloured edge, numbered badges, pill options and a green answer band in the key view; flashcards have a ribbon, a tinted back panel and a cut line; the vocabulary list has a coloured table head, zebra rows and a marker edge. All three pass the design critic with no issues.
- `layout.ts`: headers, footers and full-bleed blocks are judged against the page edge rather than the margins, so the Preview no longer warns about a footer that is exactly where it belongs.

## 2026-09-24 (5) — Plan filing, activities by plan, the marketplace
- "Open" on a plan step now routes to `workspaces?doc=<id>`; `WorkspaceBrowser` selects that document's folder, highlights it and opens it (resource detail, or preview for material).
- `modules/plans/folders.js`: `ensurePlanFolders` creates `Study plans / <plan> / {Reference material, Generated resources}` idempotently and `linkMaterial` files the studied documents into the plan's folder by adding the folder to their `folderIds` — a link, not a copy. Building a plan files the plan document, links its material and saves every generated resource into "Generated resources". Verified on real data: 12 generated resources in the folder, `Statistics.docx` filed in both `Raw` and `Reference material` with a single copy in the database.
- Activities: each activity is matched to the plan that schedules it; the page gained a plan filter, sorting (most urgent / due date / plan / name) and grouping by plan, with the plan named on every row.
- `modules/marketplace/`: five shelves (agents, templates, components, resources, plans) and seller **stores** — name, tagline, colour, and a record of listings, downloads, rating and reviews. `market.js` holds the model (publish, unpublish, download counting, reviews, store stats); `MarketplacePage.js` the shelves, the store page, the sell dialog (which reads the seller's own agents, templates, blocks, resources and plans) and the review dialog. The old agent-only marketplace page is replaced. Verified end to end: store created, a study plan listed at €7.50, installed (download counted) and reviewed (5★ shown on the listing and the store).

## 2026-09-24 (6) — One learning intelligence layer, three dashboards
- `modules/performance/mastery.js`: `buildEvidence` turns attempts into one row per answered question (learner, subject, topic, difficulty, time, answer given/expected); `masteryOf` blends recent accuracy (0.65) with overall accuracy, scales by difficulty, caps by coverage (ten questions = full evidence), folds in retention (answers given a week or more after the topic first appeared) and decays with staleness. On top: `topicMastery`, `overallMastery`, `masteryOverTime` (weekly), `retentionOf`, `nextActions`, and the class views `byLearner`, `classTopicMatrix`, `classTopicCoverage`, `learnerSubjectMatrix`, `attentionFlags`.
- `modules/performance/errors.js`: the eight-type taxonomy with a classifier that reads the answer given against the expected one and the learner's other evidence on the topic (close numeric answer on a topic they otherwise pass → calculation; the same wrong answer repeatedly → conceptual; blank on a weak topic → knowledge gap; a single miss on a strong topic → careless), plus `analyseErrors` (shares overall and per topic) and `errorSummary`.
- `modules/performance/dashboard/`: shared parts (KPI, mastery map, error breakdown, mastery trend, next actions, heatmap, class topic bars) and the three screens — `StudentDashboard`, `ParentDashboard` (plain-language "What is happening" paragraph first) and `TeacherDashboard` (class × subject, student × subject, students × subjects, with the attention filters). The previous KPI grid and detail sections are kept under an "All the numbers" disclosure.
- Verified on real data: student screen shows 35% mastery across 7 topics with "conceptual 47% / application 29% / knowledge gap 24%" and next actions naming the reason per topic; the teacher's class view builds the class × topic heatmap and flags both learners; the parent's paragraph reads as prose.

## 2026-10-01 — One "Configure output" step for every agent
- Template Studio is the single source of components, formats and colours. Run page step 2 now shows the
  wizard's component cards (format + colour, one colour / format for all, apply a saved template) beside a
  views × page-size preview matrix; the Output fields, Template and Styling tabs are gone.
- Quiz items, flashcards and block agents are all planned into Template Studio components
  (`template-studio/output/outputDocument.ts`); a Paragraph component was added to Template Studio.
- `blockRegistry.js` keeps only what the AI needs; `BlockRenderer`, `LivePreviewPane`, `OutputCustomizerPanel`
  and the field-mapping helpers were removed. Saved agents are upgraded on load (`normalizeSelectedBlock`).

## 2026-10-01 — Template Studio catalog, sources, languages, study-plan re-planning
- Catalog restructured into Structure / Questions / Cards & Games: Exam header vs Document header, Section header
  (badge | title only), levelled Headings, Table under Structure, worksheets merged into Questions, Answer box and
  "Section + questions" removed. Worksheet components now use the accent palette only (guarded by tests).
- Real page sizes (A4 / Letter / slides) with the footer at the bottom of every page; slide covers drop logo/name/date.
- Answer key shows the source passage of each answer, linked to `/source`; printed words follow the output language;
  the header title is written by the AI. Save-resource dialog uses a collapsible folder picker.
- Study plans: the material picker separates uploaded material from generated resources; adding either re-plans what
  is still to do (`plans/revise.js`, `/api/plans/revise`, `RevisePlanDialog`) while finished work stays untouched.

## 2026-10-01 — Presentation dashboard (docs/dashboard)
- `docs/dashboard/` generates one self-contained HTML (`versions/luna-dashboard-<date>.html`): the 4-step process,
  data-driven information-flow diagram, a catalogue of the 21 AI requests (model, params, tokens, cost, exact prompt
  extracted from the source at build time, measured vs estimated), unit costs (PDF/DOCX/PPTX upload, cloud storage,
  plan, agent runs, coach), operating-cost and lunas/marketplace calculators, performance metrics, status and risks.
- Every change writes a new dated version (never overwrites); `npm run dashboard:publish` commits and pushes it.
  Findings worth knowing: uploads are not charged in lunas, 1 luna = 1 token whatever the model, and originals are
  stored as base64 in Postgres.


## 2026-10-01 — Deleting a study plan cleans up after itself
- `plans/folders.js` `planDeletionScope` / `deletePlanEverything`: deleting a plan (Plans page or the workspace tree) removes the plan
  document, its folder (and subfolders) and the generated resources filed in it; uploaded material is only unlinked from the
  plan's folders. "Study plans" is removed when it is left empty. Attempts are erased only if the checkbox is ticked.

## 2026-10-01 — Agent scope for study plans; restyle any saved resource
- Study plans choose their agents from the AI agents tab only: Quiz Generator and Vocabulary Flashcards (defaults) plus the learner's own and bought
  agents (`plans/agents.js`; the plan stores `agentScope`, re-planning stays inside it). The Summary writer is no longer a plan agent and reading steps
  no longer auto-summarise. Custom agents are run from their saved config (items or blocks).
- Resource detail has a "Format & colour" tab (`resources/ResourceStyle.js`): the same component/format/colour panel and page-size × view preview as
  Configure output, rebuilt from the saved data; the look is autosaved in `request.outputStyles` and exports come from the same preview.
  New resources keep their source passages (`data.sources`) so answer citations survive restyling.

## 2026-10-02 — Semantic chunking, traceable sources, exhaustive study plans, interactive look
- Chunking (`ai-tools/pipeline/chunking.js`): chunks start where their heading path says (it used the last unit's), carry `page`/`pageEnd` and the
  headings inside (`<!-- page N -->` markers are location data, not text), no longer split at every `##` (a chunk only ends at a section heading once it
  is big enough: 40/220/380 tokens for #/##/###), cut long sections where the vocabulary changes most (TextTiling-style cohesion), end on a clear topic shift
  and join tiny chunks to their neighbour. Accounting.pdf: 18 chunks of 42–487 tokens → 9 of 257–635.
- Interactive answer sources: items keep the passage the agent cited (`_source` → document, section path, page, passage); the player shows document ›
  section · page · passage, the exact sentence(s) that back the answer and "Open this part of the document →". `/source` finds the passage by its quote when
  the chunk number no longer matches. `pick()` ignores `_`-prefixed system fields (a "S5" citation used to be shown as the quote).
- Interactive look: the player takes the colour (and Lettered options / Ruled lines formats) of the resource's Format & colour choice (`resources/look.js`).
- Study plan exhaustivity (`plans/coverage.js`): the planner prompt demands every concept be studied AND tested (coverage ledger in the schema), the route
  verifies and repairs the schedule in code, re-planning does the same, the final exam lists all concepts, and the plan page shows "all N concepts studied and
  tested" or what is missing with a one-click fix. Concepts of the picked material are read (and extracted if missing) before planning. Each generated
  activity is told its concepts (≥1 question each, `topic` = concept), checked afterwards, and topped up for any concept still missing.

## 2026-10-02 — File results anywhere in the workspace; iterate on a result
- RunAgentPage files results into the whole workspace tree (`foldersOf(workspace)`: subjects are the top-level folders), not only the open subject's
  folders, which was empty when the subject had none — so a saved result could only go to "Unfiled". The picker is shared by the Save dialog and the
  step-3 save; new folders can be created under any node; the result is saved into the chosen subject.
- "Iterate" on a generated result (steps 2 and 3): the user types a twist ("focus more on cash flow", chips for common ones), Luna rewrites the result from
  the same material using `refinementPrompt` + `previousOutput` (now explained to the model in both the items and the block pipelines, and used to rank
  the retrieved passages); earlier versions are kept ("Previous version (n)").

## 2026-10-02 (2) — Text keeps its size and flows; Iterate gets a prompt improver
- Layout engine: in paged layouts text is never shrunk to fit a height — the box grows, and a block taller than the page is cut at a text line and
  continues on the next page (`splitAtLimit`; boxes and rules that straddle the cut are split with it). On slides a component stays on one slide and its
  text shrinks (to 60 %) to the room the slide has. `tests/template-studio/long-text.test.ts`.
- Iterate: `/api/ai-tools/agent-builder/iterate` (dashboard A7) turns the typed request into a brief + checklist and names the original limits it overrides
  (e.g. "one page"); the UI shows "Luna understood: …". The revision note now says the request beats conflicting limits and that cosmetic edits do not
  count; the block composition rules also see the request. Measured on the Accounting summary: "give more examples" → 0 → 8 example cues without the
  improver, 24 with it.
- Reliability: OpenAI calls wait out a 429 rate limit (`openAiFetch`) instead of falling back to a placeholder; block replies are filtered to the allowed
  block types (the model once echoed the schema as a single "object" block).

## 2026-10-03 — Components grow from the top down; page header and footer by default
- Layout engine (free-mode groups): growth is now positional. What sits below a text that turned out taller moves down by exactly that growth (the old
  rule pushed every LATER sibling, so a table's last column slid to the bottom when the middle one wrapped); elements beside it are not pushed; a box or
  rule that contains a grown text stretches; a full-height edge bar stretches with its card. Static headers are measured at their real, laid-out height,
  so a title that wraps no longer runs into the content (nor its accent rule into the first heading).
- Components: paragraph, key-point rows and callout use a short accent mark instead of a full-height bar; key-point rows and paragraphs have space
  between them. Table cells are all top-aligned.
- Documents (block outputs) get a page header (title, taken from the AI's top heading unless it wrote its own header) and a footer by default; each can be
  removed from the "Structure" cards in Configure output / Format & colour (`ComponentStyle.hidden`).
- Tests: `tests/template-studio/component-growth.test.ts`, header/footer cases in `output-document.test.ts`.

## 2026-10-03 (2) — Reader with highlights, question-card polish, source preview, agent description
- HTML reader (`modules/reader/`): any generated document opens as a clean reflowable page (`documentHtml.js`, LaTeX via KaTeX, tables, callouts) and
  any quiz/exam/flashcard set opens as the interactive player inside the same page. Select text to highlight in 6 colours, show/hide highlights with one
  switch, clear them; highlights use the CSS Custom Highlight API (the page is never modified), are stored as text anchors with the words and found again if
  the text moves, and are saved with the resource (`resource.highlights`). Entry points: resource detail ("Read" / "Open HTML view"), study plans ("Read" on
  generated-document steps; "Start" now opens the reader), Activities, the workspace, and the agent run page's export step (unsaved outputs too).
- Source passage page renders the passage as lean HTML (`reader/markdown.js`: headings, lists, tables, LaTeX, page markers) and highlights the block that
  holds the quote.
- Question cards: the left edge runs the full card (answer and source included), true/false asks "How sure are you?" and shows its answer as the same
  full-width green band (True / False), confidence is on by default, at least 4 mm between consecutive components, answer bands cover long answers.
- Footer text is editable ("Footer text" in the Structure card; default `<subject> – Quiz / Summary…`, or "Use the file name").
- Run page: the agent description is one line with "Read more", which shows the prompt in sections (what it does, style, rules, what it returns, blocks).

## 2026-10-03 (3) — Flashcards: three views
- Flashcard component (`engine/blocks.ts`): redesigned card (inset accent tab, FRONT above and BACK below a line across the exact middle that runs the
  card's full width) and two views of the same component — "Both sides on one page" and "One side per page" (a FRONT page then a BACK page for every card,
  from the derived `Sides` field, `derive.kind = "sides"`), for printing back to back and memory games. The cover title belongs to the first view only.
- Layout: a title/cover scoped to the first page is no longer repeated for every record of a page-repeat (it left a blank page before each card); on a
  card or slide a component stays on one page and its text shrinks to fit instead of flowing on.
- Interactive: a set of flashcards plays as a deck (`activities/FlashcardDeck.js`): the word, tap to flip, then "How well did you know it?" (Knew it /
  Almost / Not yet → recorded as confidence and known/unknown), in the colour of the template, with a summary of the cards to see again. Used by every
  entry point that plays an activity (reader, plans, workspace, run page).

## 2026-10-03 (4) — Quiz on slides; sources in any language
- Slides: everything in a block is scaled up together (positions, heights, type, rules, corners) instead of only its width, and each question sits in the
  middle of its slide rather than at the top. The cover centres its title in the blue panel, the Name / Date lines (now part of that option) are gone, and the
  blue bar matches the panel's height.
- Sources: a question's source is the passage the agent cited (`_sourceResolved` → `__cited`), not only the best keyword match, so a quiz in Spanish about an
  English document shows its source; a card with no source takes no room (`collapseEmpty`) and cards fit their content (`fitContent`) with a little air
  under the last line, so they are no longer too tall; the answer label has room for longer words ("RESPUESTA"); "How sure are you?" has room in Spanish.

## 2026-10-03 (5) — Question cards, Configure output, Export step
- Question cards: rounded on the right, straight on the left so the card's top line meets the blue bar (`Style.squareLeft`, HTML/PDF); the answer band and the
  source line are inset to the card's text instead of touching its edges; the space under the last line is a constant 5.5 mm whether or not the answer is
  shown (cards no longer keep room for a source that is not there; the stretched edge bar no longer inflates the card).
- Configure output: the preview toolbar lost PDF / DOCX / Copy (export lives in the Export step); a new "Interactive" tab shows the HTML form (quiz you
  answer and check, flip deck, or reading page) separately from the page-size × view matrix; more air between a Structure card and its "Shown" tick.
- Export step: one "Save to your workspace" card (Save resource… opens the dialog: name, workspace folder, and optionally add to Activities and/or a study
  plan with an optional due date) replaces Save-as-activity, Save-to-workspace and Share; one "Download" card: PDF for any selection of page sizes × views,
  one file each (`OutputDownloads`), and the interactive HTML with a notice that results are not tracked outside Luna. The same panel is under Format &
  colour on a saved resource.

## 2026-10-03 (6) — Numbering, editable title, Chatbot, agents hub, template matrix
- Quiz: questions (and true/false statements, fill-in sentences) are numbered through the whole document (`__n` assigned in `planOutput`, used by the static
  `{{n}}`), instead of restarting at 1 per card. True/false uses the same round numbered badge as the other question cards.
- Titles: the header's title is editable (Structure → Title, like the footer text); the interactive version and the reader show the same title (`outputTitle`).
- **Chatbot** (`modules/chat/`, `app/api/chat`): a Claude/ChatGPT-style assistant on Luna 3 Pro or better. Scope: whole workspace or focused on a subject/folder;
  files can be dropped (uploaded to the current subject) and workspace documents referenced with `@`. It answers about the material with numbered references
  (`[P1]` → passage, heading, page, quote, "Open this part" link to `/source`), answers questions about Luna from `knowledge.js`, and proposes cards that do
  nothing until approved: run an existing agent (it asks first), write a document with the default template, or turn a process into a new agent (shows its prompt,
  saves it to AI agents, editable later). Requests Luna cannot do (new template components) get the fixed "not covered… the Luna team will work on it" reply and are
  recorded in `feature_requests` (**migration `202610030001_feature_requests.sql` must be applied**; until then they are only logged). The cost is estimated before the
  call and the user is asked to confirm only above 30,000 tokens. Dashboard request A8.
- `plans/execute.js`: `generateStepResource` (generate without saving) + `answersFromOptions`; `resources/saveFlow.js`: the save flow shared by the run page and the chat.
- AI agents hub: "Create agent" and "Chatbot" side by side, the gallery of agents underneath. The Template Studio card and the AI Tutor tool are gone (the tutor is
  now the chatbot).
- Template Studio gallery: every template shows its category (document / quiz / game & flashcards) with a category filter, and a third view, **Matrix**:
  templates as columns, the category on top, components as rows grouped by what they are, each cell showing the format and colour used with a "View" button
  that opens the component viewer in that format and colour (`matrix.ts`, `TemplateMatrix.tsx`).

## 2026-10-03 (7) — Phone UI
- Back button: every page change in the app is a history entry (`AppShell.setPage` pushes state, `popstate` restores it), so Back and the iPhone swipe return to the previous page instead of the landing page.
- Landing page: on phones the bar keeps the logo, Try demo and Log in; Home / Demo / Pricing / Training / Sign up fold into a dropdown; the headline's letter-spacing no longer crams the words.
- Workspaces: the filters, upload, review centre and download controls sit behind a "＋" menu (top right of the sidebar card) on phones; Activities: the study-plan / topic / sort filters sit behind a ⚙ button next to "Create with an agent" and are full-width selects.
- Dropdowns: padding for the arrow is set outside the Tailwind layers so a `px-3` can no longer put text under the arrow (all screens).
- Template matrix: compact columns on phones (vertical group labels, shorter cells), scrolls both ways inside its box, and no longer pushes the page wider than the screen (`grid-cols-1`, `tw-table` is exempt from the phone "tables scroll" rule).

## 2026-10-03 (8) — Iterate understands what to change; blocks held to the schema
- Iterate: the prompt improver now reads the result as a numbered outline (`pipeline/iterateContext.js`: `[3] Question 2 (question_mc) — …`) and the output field names, and returns a
  scope (whole result / specific items / one field in every item / add content), the targets with the exact change ("change question 3 to…"), the fields touched, the brief,
  checklist, relax and keep. "More detail in the answers" changes only the answer/explanation fields; "change question 3" changes only question 3 and returns the rest word for word;
  "Luna understood" names the exact place. The writer's revision note reads the scope. Prompt, input and output updated in the dashboard (A7).
- Output vs template fields: item agents were already strict-schema (A1). Block agents were not: the schema is now strict with the block type as an enum (checked against the API with all 15
  block types), and `conformBlocks` (`blocks/blockRegistry.js`) holds the result to the registry — leaked fields dropped, values typed, blocks missing their content discarded.

## 2026-10-03 (9) — Phone: output preview and template picker
- Preview (Configure output): the page preview is laid out in an iframe scaled with CSS `zoom`; iOS Safari inflated the text inside it (so text overflowed boxes sized in mm). The preview document now sets
  `text-size-adjust: 100%`, so the phone shows the same page as the computer. The View \ Page matrix scrolls sideways instead of being cut off.
- "Apply a saved template" is a button dropdown next to Apply (`output/TemplatePicker.tsx`) on every screen: templates grouped by folder as in Template Studio (named folders A–Z, unfiled last), each with its category.

## 2026-10-03 (10) — Phone: sheets, tab bar
- Workspaces "＋" menu is a sheet over a dimmed page with its own Close button (it used to scroll away with the card). Tab bar is Workspaces · Study plans · AI agents · Marketplace (the rest is in the menu button); it sits under dialogs (z-30), so a dialog's last button is never covered. Date fields on iOS no longer spill out of their box.

## 2026-10-03 (11) — Open everything in the HTML reader; notes; download from every view
- Study plan steps: each step names the agent that made (or will make) its material (✦ tag) and has one primary button: **Do activity** (quiz, flashcards), or **Open** (a summary, or the uploaded document a reading step points at); a step with nothing attached shows Open disabled.
- Reader (`reader/ReaderView.js`): a document has two views — Original and **Notes** (select text → colour highlight or ✎ Note; tap a highlight to edit its note; notes panel). Highlights carry a `note`. Top right: **Download** — the PDF page-size × view matrix and the HTML (`reader/DownloadPanel.js`; the HTML can carry the highlights and a "My notes" list, `highlights.markedHtml`); also on the in-place interactive view (`InteractiveView`).
- Uploaded documents open in the same reader (`reader/DocumentReader.js`, `reader/documentView.js`): their own HTML or their text, a PDF layout via the default document template, "Original file" in the download panel. Notes and highlights are kept in a `doc-notes` file next to the document (hidden from folders).
- Workspaces on a phone: Open/Preview, favourites and download moved into the ⋯ menu of a row.

## 2026-10-03 (12) — Reader: edit content, hard margins, step focus, money is not maths
- Content editor (reader "✎ Edit content", uploaded documents): bold, italic, heading, list, formula (LaTeX, double-tap a formula to edit it) and table (type 3x4 or paste rows); Save asks first, then replaces the document itself
  (HTML + Markdown text, re-chunked) so the Original and Notes views both show it; Cancel drops the changes. `documentView.htmlToMarkdown` turns the edited page back into Markdown.
- Study-plan reading steps open the document cut to the part the step is about (`documentView.focusSections`: the step's title and concepts are looked for in each section's heading and text); other sections are
  hidden, not removed, so highlights and notes stay in the same place and sync with the whole document; "Show the whole document" toggles. Notes/edits are the document's, wherever it is opened.
- Notes save by themselves (and when the reader is closed); the header shows Saving… / Saved ✓. The colour dots in the header are gone (colours are in the menu that appears on a selection).
- Hard margins in every HTML view (`MARKDOWN_CSS`): long formulas wrap at an operator (KaTeX bases), tables scroll inside their box, long words break. The downloaded HTML carries KaTeX's stylesheet and table styles.
- "$40,000 cash … a $5,000" is no longer read as a formula (reader: the closing $ must follow a non-space and not precede a digit; upload: prose between dollar signs is left as text; formulas keep `data-latex`). Documents already extracted keep the
  broken rendering until re-uploaded or edited.

## 2026-10-03 (13) — Performance default view; menu column full height
- Performance default view (student): Where things stand → Luna's read → Topic by topic → Why answers are wrong, all full width; "Mastery over time", "This plan" and "What to work on next" are off by default; the Now / Over time / Detail buttons are gone from every panel. A saved copy of the old built-in view is replaced (view version 2); views you made are kept.
- Topic by topic follows the study plan's own concepts (the same tree and indentation as the plan's Student model): the 5 assessed topics furthest behind, the 5 strongest, and how many are not assessed yet (listed on request). Plan chips choose the plan (the most recently active one by default). (`dashboard/PlanTopics.js`)
- Luna's read gives exactly five next actions, a mix of fixing the kind of mistake, plan steps due soonest, the weakest topic and topics slipping (kind "deadline" added; the plan's upcoming steps go to the model). Dashboard F1 updated.
- Menu column (computer): the column runs the full page height; the content inside is the sticky part. `overflow-x: hidden` on html/body (added with the phone work) had silently stopped every `position: sticky` — it is `clip` now.

## 2026-10-04 (1) — Topic switcher, performance filters, three gaps, plan folders, plan progress
- Activities, Study plans and Performance have a "Topic" chip row that switches between main folders (`ui/SubjectTabs.js`); shown only with two or more.
- Performance filters: only Study plan and Period (all time / 7 / 30 / 90 days / chosen dates); teacher/parent keep a student/child picker. Track-by and the other filters are gone.
- Knowledge gaps are three, mutually exclusive and exhaustive (`performance/errors.js`): Topic knowledge gap, Analytical gap, Accuracy; the eight finer causes of the mastery engine each belong to exactly one. All three are always listed.
- Folders (`plans/folders.js`): a new topic gets Uploaded material and Generated material (Study plans, Resources not in study plans). A plan gets Generated material / Study plans / <plan> / Reference materials, which is a shortcut to Uploaded material shown in the tree — documents are never filed twice. New uploads default to Uploaded material, new resources to Resources not in study plans.
- Building a plan shows a step-by-step progress panel with what each step is doing and a counter for the quizzes and summaries being written (`plans/PlanProgress.js`).

## 2026-10-04 (2) — Home page, and Ask Luna beside the material
- **Home** (`dashboard/ui/DashboardPage.js`, `dashboard/home.js`): "Hi <first name>", one row of at most four study-plan cards (closest upcoming deadline first, across every subject of the workspace; sub-plans rolled into their parent), then "Next steps from Luna" — the performance coach (`CoachPanel`, `/api/performance/coach`) fed with the evidence of exactly those plans, reading by itself (`autoRead`, cached against the evidence), or the steps due soonest while there are no results. No plans → one line and "Plan it for me" / "Upload material". Same for student, teacher and parent. The sample-data dashboards and `dashboard/insights.js` are gone.
- The plan card is now `plans/PlanCard.js` (with `Ring`), used by Study plans and Home. New page targets: `plans?open=<documentId>` (AppShell selects the plan's subject) and `plans?generate=1` (opens "Plan it for me").
- **Ask Luna**: a floating button in the full-screen reader and the in-place interactive view opens the chatbot beside the material (side panel on a computer, bottom sheet on a phone; it and the notes panel never open together). It reads the study plan's documents (+ master document, + the reference documents the item was made from), else the subject's uploaded documents, and is told what the user is doing ("Doing the quiz X, 3 of 10 answered, not checked", "Reading Y, showing the part about Z"). It answers only from that material with [P#] references, gives hints instead of the answer of an unchecked question, and records no attempt. Server: `context` on `/api/chat`, `buildMaterialPrompt`, `scope.documentIds` / `scope.readableGeneratedIds`, tools limited to search/list. Charged in lunas as "Ask Luna". Dashboard catalogue A8 lists the new prompt. Callers pass what they know (`chat={{ documentId, planId, sourceDocumentIds }}`): Study plans, Workspaces, Activities, Resource detail, Run agent.

## 2026-10-05 (accounts) — Email confirmation, password reset, phone, notifications, request emails
- **Sign-up**: password typed twice (inline message + server check of `passwordConfirm`), phone number required in international format, normalised to E.164 (`lib/phone.js`), one phone per account (unique index; "That phone number is already linked to another account." without naming the other). Phone is not SMS-verified (`phone_verified_at` null, UI says so).
- **Email confirmation**: one-time `/verify-email?token=…` (32 random bytes, only the SHA-256 hash in `account_tokens`, 48 h, single use, a new request replaces the old one); the page needs a button press so mail scanners cannot burn the link. Unconfirmed accounts can log in and use their workspace, a banner has a rate-limited "Resend email", but cannot send/accept connection requests, share or assign (403 `email_unverified`, enforced in `accountsRepository` / `sharingRepository`). Requests addressed to an email attach only when that email is confirmed (no more attaching at sign-up); requests typed in the sign-up form wait in `accounts.pending_invites` until then.
- **Password reset**: "Forgot password?" in the log-in modal, neutral answer for every email, limits per email and per address, `/reset-password?token=…` (1 h, single use, typed twice, a typo does not burn the link), consumes the token, deletes the other reset links, confirms the email, clears the lock, logs the browser in. `accounts.password_changed_at` ends every older session (`lib/sessionRevocation.js`, checked by `requireAccount`, `/platform`, `/login` and the data routes via `ownerUserIdForFresh`).
- **Mailer** (`lib/mailer.js`, `lib/mailTemplates.js`): SMTP (`LUNA_SMTP_URL` + `LUNA_MAIL_FROM`, nodemailer imported lazily) wins over Resend (`RESEND_API_KEY`, fetch); none = dev console preview + `devPreview` outside production, `mailSetupNeeded` (no token leaked) in production. `LUNA_PUBLIC_URL` for links. Credentials are scrubbed from every log/result.
- **Notifications**: bell in the top bar (badge, Accept/Decline inline, answers, shared/assigned work, polls every 60 s and on focus; `GET/POST /api/accounts/notifications`, derived from `account_links` + `shared_items`, `notifications_seen_at`). Emails: request received / accepted / invitation to someone without an account, deduplicated by `account_links.notified_at` / `accepted_notified_at` (24 h; 7 days for invitations), capped per sender, best effort.
- **Account settings** in the profile menu (email state + resend, phone, password); `/platform?page=connections` deep link used by the emails.
- Migration `supabase/migrations/202610050001_account_verification_phone_tokens.sql` (**not applied from here**). Everything is feature-detected (`supportsVerification()`), so sign-in and sign-up keep working on the old schema.
- Tests: `tests/accounts/{phone,verification,reset,mailer,notifications}.test.js`; the fake DB learned unique indexes, column errors and `legacySchema()`.


## 2026-10-05 — Setup checklist
- `docs/SETUP_CHECKLIST.md`: the steps only the owner can do (migrations, email provider, hand tests, first live runs, before real users).

## 2026-10-06 (1) — Checking answers no longer closes the quiz; menu order; sharper quiz prompt
- Bug: checking the answers of a quiz closed the window (the callers closed it from `onSubmit`, which fires when the answers are checked). The Study plans and Workspace callers now keep it open; "Done" closes it. A broken activity shows a message with a way out instead of taking the page down (`ui/ErrorBoundary.js`, `app/error.js`).
- Menu: Activities sits under Study plans.
- Quiz Generator prompt: one checkable answer per question, no broad "explain/discuss" questions (bounded answers with a stated length), rules for multiple choice (no negative stems, same-category distractors), true/false, calculations and the three difficulty levels. The Agent Studio quiz spec uses the same text.
## 2026-10-05 (grading) — Error classification refined; written answers marked by an AI model
- **Three kinds, redefined** (`performance/errors.js`): *Analytical* = the maths / analytical process went wrong, and only a question that needs maths can have one; *Topic knowledge* = every other wrong answer (definitions, "which is NOT…", differences, classification, theory); *Accuracy* = close but not exact (slip, unit, sign, rounding, spelling, incomplete on the right track, misread, or blank on a topic ≥ 70 % strong elsewhere). `decideError(row, ctx)` is the one readable decision (stored cause → blank rule → close → quantitative? analytical : knowledge) and returns `{ group, verdict, quantitative, reason }`; `classifyError` keeps its signature and returns the finer cause inside the chosen group; `groupOf` unchanged. A non-maths wrong answer can no longer be analytical. Old attempts without a stored cause are re-read by the new rules.
- **`isQuantitative(question | result)`** (`activities/quantitative.js`): explicit flag → maths skill (maths/calculation/arithmetic/statistics…) → numeric-entry or a prompt that asks to calculate/solve/evaluate → recall/definition/concept skill says no → years and dates say no → numeric or formula expected answer → "analysis"/"problem solving" skill only with numbers involved → no.
- **Local grader** (`activities/grading.js`): exact after normalising, numbers within tolerance (rounding = correct, ≤ 3 % / wrong sign / wrong unit / swapped values = close), key-term overlap with negation check, typo = close, "makes sense" check. Verdicts `correct | close | incorrect`, score 0..1 (close = 0.5 by default). `gradeActivity` now returns `verdict`, `score`, `feedback`, `errorCause`, `quantitative`, `graded` per result, and the attempt score is the sum of credits (partial credit).
- **AI marking** (`app/api/activities/grade/route.js`, `activities/gradeBatch.js`): one call per attempt (≤ 20 written answers per call, ≤ 40 per request), strict JSON schema, Luna 3 Pro floor (`LUNA_GRADE_MODEL`), judges meaning not wording, `makesSense`, feedback in the learner's language. Blank / identical / number-for-number answers never reach the model. The model only reports whether the question needs maths; the cause is then derived by the rule (close → accuracy, wrong + maths → analytical, wrong + no maths → knowledge), and a maths skill or calculation prompt overrides a model that says "no maths". No key or a failed call → local marking, flagged `graded: "local"`; the player is never blocked.
- **Player** (`activities/ActivityPlayer.js`): "Check my answers" marks everything at once, shows "Luna is checking your written answers…" while the one batched call is out, then per question the verdict chip (Correct / Almost · 50 % credit / Not quite), the feedback sentence and the expected answer; the attempt is handed to `onSubmit` once with the final marks. The player never closes itself. Token usage is charged like any other model call (`chargeRun`, "Answer check").
- **Performance engine**: `buildEvidence` carries `verdict`, `score`, `feedback`, `errorCause`, `graded`, `kind`, `skill`, `quantitative`; `analyseErrors` prefers the stored `errorCause`; mastery counts a "close" answer as partial credit (`creditOf`). `lib/attemptsRepository.js` stores the fine cause chosen inside the decided group.
- UI copy: `ERROR_TYPES` blurbs, the coach prompt (`/api/performance/coach`), dashboard catalogue (new request **F2 "Mark written answers"**, F1 text, free-steps notes). `npm run dashboard:check` passes; `dashboard:publish` not run.
- Tests: `tests/grading/{quantitative,grading,gradeBatch,errorDecision}.test.js` (quantitative detection, decision table, local grader, batch + route with mocked fetch, stored causes, partial-credit mastery); `tests/agent-studio/mastery.test.js` updated to the new rules.

## 2026-10-06 (2) — Plans follow moved documents; Share on phone
- Study plans look their material up across the whole workspace (a document moved to another topic still opens from the plan and keeps its attempts); lists, pickers and filing stay inside the topic.
- Folder ⋯ menu has "Share…" so folders can be shared from a phone.

## 2026-10-06 (3) — Section headers; every agent reads the whole workspace
- Section header (badge + title): air above it, none below; the card fits what is shown, so a section without an intro line leaves no hole; sections are numbered on their own (SECTION 1, 2, 3 — they were all "1").
- Agent run page: the material picker lists every document of the workspace (all topics, grouped by topic and folder), for every agent, not only the open topic; a plan's steps read their sources across topics too.

## 2026-10-07 — Update anything Luna generated (resources and study plans)
Founder: "any generated material, for example by the AI study planner, can be updated — like run it again on the agent, and the user can write in the iterate prompt what to change."
- **`Update…` on every saved generated item**: the workspace row ⋯ menu, the resource detail header, the reader header (opened from the workspace, Activities, a plan step or the resource detail), the Activities rows, a plan step that points at a resource, and the chat's result cards (a card that is not saved yet is replaced in the card). One dialog everywhere: `modules/resources/UpdateDialog.js`.
- **`modules/resources/update.js`** (pure, tested) runs the SAME agent again, headless: `resolveAgent` (built-in by name, saved agent by `meta.agentId`, or by name for older plan-made items; a deleted agent says so and offers "Run it as a copy with the built-in agent of the same kind"), `answersForResource` (saved choices by question id, else by the question's words — built-in flashcards/consolidator get new ids on every load — else the item's own count/types), `resolveMaterial` (saved documents that still exist, optionally replaced by other documents of the whole workspace), `buildUpdateConfig` (the config RunAgentPage builds + `refinementPrompt` + `previousOutput`; the consolidator re-reads its documents and gets the request as its Focus because it has no previous-output mode), `improveRequest` (the Iterate prompt improver, `/api/ai-tools/agent-builder/iterate`), `updateResource` (improver → `/stream` via `runAgentStreaming` → `rebuildResource` → `diffResources`; nothing is saved). Lunas are charged with `chargeRun` like any run; the estimate comes from `useRunEstimate`.
- **Result screen with a comparison** (`UpdateCompare.js`): quizzes/flashcards list the new / changed / removed questions (matched by their words), documents show the new version's blocks marked same / changed (before and after side by side) / new, removed ones where they were. Buttons: **Replace this** (default when nobody used the item), **Save as a new version** (default when it has attempts, is a step of a plan, other items are made from it, or it was shared view-only; the original is untouched so attempts and plans keep pointing at it), **Discard**, **Change my request**. A replaced item keeps its document id, its activity id and the id/classification of every question the writer left as it was; reworded questions get fresh ids so old attempts never attach to the wrong question. Copies are named "Name (v2)", "(v3)"…
- **Versions** inside the resource JSON (`resource.versions`, newest first, max 5: the content before the update, the prompt, the date, the agent and model) with **Restore this version** in the resource detail (new "Versions" tab; restoring keeps the version it leaves, so it can be undone). `meta.updatedAt` is set on every update.
- **Master documents / summaries**: they are resources, so the same dialog updates them (consolidation runs again with the request as its focus). An item made from a source that was updated later shows "Based on an older version of …" in its detail (`staleSources`); the dialog warns how many items depend on a master document before replacing it.
- **Update this plan…** (plan page header and plan card): `modules/plans/UpdatePlanDialog.js` + `modules/plans/updatePlan.js` + `app/api/plans/update/route.js` (Luna 3 Pro floor via `resolveAgentModel(LUNA_PLAN_MODEL)`, strict JSON schema). The learner writes the request (suggestion chips), may change the time per week and the next deadline (prefilled from the plan); the model proposes every step still to do as kept / moved / edited / added / removed with a summary. `applyPlanUpdate` enforces the rules whatever the model says: finished steps and the resources of built steps are untouched (a built step can be moved or retitled, never removed), a deadline with `setBy` is never changed or dropped (from the model or the learner's fields), new steps only use the agents of `plan.agentScope`, dates stay between today and the last deadline, a step the model leaves out is kept. The preview lists added / removed / moved / changed steps with dates (and a coverage warning); "Apply changes" saves, then offers to build the material of the new steps (existing build flow with `PlanProgress`, master document included). `plan.history` keeps the last five versions with **Restore** (what was finished or built since is kept, deadlines set by others stay).
- Small changes in shared files: `plans/execute.js` records `meta.agentId` and the choices (`request.answersByQuestion`) of plan-made items and exports `fieldDefs`; `RunAgentPage.js` saves `answersByQuestion` too; `PlansPage.js` `build(row, report)` reports progress and returns the result.
- Dashboard: new request **P4 "Update the plan with a request"**; A7 (Iterate improver) also runs from "Update…". `npm run dashboard:check` passes; `dashboard:publish` not run.
- Tests: `tests/resources/update.test.ts` (resolve agent, build config, material, replace/copy decision, versions cap + restore, diff, rebuild, `updateResource` with a fake fetch) and `tests/plans/update-plan.test.ts` (schema, merge rules, deadlines, history/restore, the route).
## 2026-10-07 — Real maths in the outputs; valid LaTeX from the consolidator; source tags that open the original
- **Maths**: the layout engine no longer flattens LaTeX to Unicode for HTML/PDF. Text items that carry formulas keep a `math` representation (raw LaTeX / link segments per line, with the height reserved for each line: stacked fractions, sums with limits, roots and matrices push the components below instead of overlapping them; display maths is centred on its own line; long formulas break at relations/operators; prices like `$40,000 … $5,000` are never maths). HTML draws KaTeX with its stylesheet and fonts inlined (offline, only when needed); PDF (pdf-lib, no browser) uses a small TeX-style typesetter over KaTeX's parse tree (`engine/math/typeset.ts`, `ai-tools/render/pdfMath.js`); DOCX gets native Word equations (OMML) and PPTX a readable Unicode fallback (`∑(i=1→n)`, `x̄`, `(a, b; c, d)`).
- **Consolidator**: prompts require every expression as LaTeX (even when the source is flattened/Unicode text); `repairNotesMath` repairs the usual breakages deterministically, validates each formula with KaTeX, asks the model once (batched, dashboard request A12) for the ones it cannot save, and shows what still fails as a code span. Block-agent prompt got one safe math/currency rule; the quiz prompt is untouched.
- **Source links**: `[D1 p.3 · D2 §Osmosis]` and the key at the top link to `/source?d=…&p=…&s=…` (page / section aware, `embed=1` for the in-app overlay). HTML, PDF (clickable), DOCX/PPTX hyperlinks and the reader; in the app the click opens the original at that page. Master-document quizzes/summaries link the originals their quoted passage names.
- Tests: `tests/template-studio/{math-output,math-repair}.test.ts`, `tests/consolidation/{math-repair,source-links}.test.ts`; `latex.test.ts` updated (limits now `∑(i=1→n)`). Dashboard manifest: A9 prompt text, new A12; `npm run dashboard:check` passes (`dashboard:publish` not run).
- Regenerate KaTeX assets after upgrading `katex`: `node apps/web/scripts/generate-katex-assets.mjs`.
## 2026-10-12 — Beta feedback batch (landing page + app)
- **Chat with Luna** (`modules/chat/GlobalAskLuna.js`, `mode: "page"` in `AskLuna`/`/api/chat`/`engine.js buildPagePrompt`): a launcher on every screen; the reader's own Ask Luna claims the slot while open (`AskLunaContext.claim`).
- **Performance**: overall accuracy (question-weighted) and Retention = share of error topics whose later answers (≥7 days after the first mistake) improved (`mastery.js errorRecovery`); `InfoDot` on every metric (`dashboard/parts.js METRIC_INFO`); "Accuracy by topic" in `PlanTopics.js`.
- **Plans**: optional instructions + resource-format notes (and a style-document picker) in the generator; `modules/plans/dailyCap.js` enforces "most in one day"; a deadline that moves offers "Update the plan"; built-in `summary` agent schedules 1–2 page topic summaries before reading the notes.
- **Reader**: "Original file" download (`reader/downloadOriginal.js`), `TopicMap` (topics vs pages, jump to a topic).
- **Uploads**: Excel (`lib/spreadsheetExtraction.js`); destination picker (`MoveDialog` reused) + size-limited batches + progress panel (`workspace/uploadPlan.js`, `ui/UploadProgress.js`); a plain-text 413 now reads "Reduce the file size or upload fewer files" instead of "Unexpected token R"; renaming a document updates the `{id, name}` pairs in generated material (`workspace/renameCascade.js`).
- **Pictures**: PPTX (`lib/pptxRender.js`) and PDF (`lib/pdfRender.js`, pdf-parse `getImage`) keep figures as data-URI images in `sourceRenderHtml` (Word already did via mammoth); the consolidator adds the largest figures per source as `figure` blocks (`ai-tools/pipeline/figures.js`, `block-figure` component) so HTML, markdown and PDF show them.
- **Settings**: name, age, plan (free/paid, no billing yet), email change (needs the password; must be re-confirmed), "Email me a reset link" — `/api/accounts/settings` actions `profile`, `email`, `resetLink`; migration `202610120001_account_profile.sql` (age, plan) — apply it for age/plan.
## 2026-10-12 — Simpler app: four sections, one next step, help everywhere
- **Navigation** (`apps/web/components/navModel.js`, tested): the rail / phone bar has four sections — **Home, Study, Progress, Create** (parents: no Create). Inside a section a pill tab bar (`SectionTabs`): Study = Courses · Study plans · Practice; Progress = My progress (teachers/parents on the real platform also My students / My children); Create = Make · Output styles (not for students) · Browse tools. Every old page key (`workspaces`, `plans?open=…`, `ai-tool:…`, `marketplace`…) still works: `sectionOf` only says which section it belongs to. People & connections moved to the profile menu; the storage chip left the top bar. Plain names: Courses, Practice, Progress, Make, Output styles, Browse tools.
- **Home** (`modules/dashboard`): one "Your next step" card (`nextBestAction`), three shortcuts per role (`homeShortcuts`), a getting-started checklist for new people (`firstRunChecklist`); plans and Luna's suggestions are folded below.
- **Help**: `?` beside every page title (`PageHelp`, copy in `pageHelp.js`), a four-step first-run tour (`FirstRunTour`; a step plays a clip when its `video` is set — none recorded yet), `EmptyState` on Courses, Study plans and Practice. Errors are plain sentences (`friendlyError.js`).
- **Create → Make** (`ai-tools/ui/CreatePage.js`): "What do you want to make?" (quiz / flashcards / summary) → tick material → Continue opens the tool with that material chosen (`ai-tool:<id>?docs=a,b`, `toolContext.presetDocumentIds`). Build your own tool and the chatbot sit behind "More ▾"; "My tools" is underneath.
- **Study**: tick documents in Courses and the bar offers Make a quiz / Flashcards / Summarise / Plan it / Ask Luna (`askLuna()` opens the page chat with the material); the same entries are in each document's ⋯ menu. Sidebar: Upload files is the one button, the rest is under "More".
- **Progress**: three numbers (accuracy, retention, on track for the exam — `performance/headline.js`) and "Work on these next"; the arrangeable dashboard is under "See details".
- Role-aware: students do not see selling in Browse tools or Output styles.
- Not done: Study is tabs, not a split screen (material left, plan right); no tour videos yet (needs recordings).
## 2026-10-12 — Three built-in agents (beta feedback 5b3c069d, e9f21807, 2e03670a)
- **Math Problem Set** (`ai-tools/tools/math-problem-set/mathAgent.js`, a plain config like the Quiz Generator): a problem set, not a recall quiz. Answer types: number with units, true / false, multiple choice with numeric options. Inputs: how many, answer types, **concept difficulty** and **math difficulty** (separate), list the key formulas under each problem (yes / no), focus, language. Each answer has a numbered worked solution, the unit, the formulas and a list of key math concepts; an unsuitable document (e.g. history) returns no problems and a note suggesting the Quiz Generator or the Document Summarizer (shown as the status message). `activities/engine/activity.ts` now shows the worked solution, unit and key maths with the explanation and treats a plain-number answer of a `numeric` item as a number question.
- **Concept Flashcards** (`createConceptFlashcardsSpec`): the key concepts of the chosen documents, concept on the front, definition on the back; number of cards (max 30) and language.
- **Document Summarizer** (`createDocumentSummarySpec`, document blocks): one or several documents → ONE structured summary of 1 or 2 pages (big picture, key messages, concepts, formulas, what to remember, where to focus), written like a consultant's briefing. One model call over the best-matching passages (very long inputs are sampled; the Summary Notes Consolidator still keeps everything).
- Quick make (Create → Make) and the bar on selected documents now use these (the earlier "Summarise" button pointed at a tool id that did not exist). They are also found by name when a resource they made is updated (`resources/update.js BUILTIN_AGENTS`). Dashboard: request **A13** shows the three recipes.
## 2026-10-12 — Simpler run page, save flow, math output, Luna's read (beta feedback ec3d3203, 53cc923e, 85848751)
- **Run page is two steps** (`RunAgentPage.js`): Set up → Result. The agent description is collapsible (collapses itself once there is a result). The Result step has the editor on the left (Iterate, **Save and export**, a simple *Look* card: colour, format, editable title/footer; **Advanced options** reveals the components, per-component editing and the base template via `OutputStylePanel simple`) and the preview on the right (**Interactive first, then Document** with the page-size × view matrix).
- **Save and export** (`agent-builder/SaveExportViews.js`): choose *Save to my workspace* (the existing save form: folder, Practice, study plan + due date) or *Download* (the matrix of views and paper sizes, plus the interactive HTML). Saving shows a progress view with the % remaining, then **Open** (interactive version, to do the activity) and **View in workspace** (`workspaces?doc=<id>`), with a close arrow at the top right.
- **Problem-set output** (ec3d3203): worked steps are one string per step (`splitSteps`, `ActivityQuestion.steps`), typeset with KaTeX in the player and listed in the standalone HTML; the answer key carries the unit and the steps (each on its own line), a multiple-choice answer written as "55" finds the option "$55", and a row with only a title/suitability note no longer turns the whole output into the automatic one-view A4 layout (that fallback had no answer key and no slide size). Slides stay real 16:9 with one question per slide (test added).
- **Luna's read** (53cc923e): every action carries `planStep` (the exact title of an existing, not-done plan step, validated server-side, else empty). Existing → "Already in your plan", due date, only "Do it now"; new → "New · not in a plan yet", "Create it" and "Add to a plan", no due date. Coach prompt changed (dashboard republished); cache key bumped to `v3`.
- **Workspace** (85848751): the "Extraction repair & tag colours…" button is removed from the sidebar "More" menu.
- Not run here: `next build` (no SWC binary in the sandbox). Preset material from Quick make no longer jumps past Set up.
## 2026-10-12 — Topic or skill? (skills taxonomy, tagging, diagnosis, heatmap, refreshers)
- **Taxonomy** (`modules/skills/taxonomy.js`): families (Quantitative, Reasoning, Language, Attention to detail) and 24 sub-skills with stable ids (arithmetic, percentages, algebra, derivatives, integration, limits, matrices, vectors, probability, statistics, units-rounding, multi-step, reading, attention…); legacy flat tags map in (concept / definition / recall map to nothing: that is topic knowledge); `inferSkills` is a conservative keyword fallback; `skillTaggingRule()` is the prompt block that lists the ids.
- **Tagging**: the Quiz Generator and Math Problem Set return `requires_skills` (hidden field); `ActivityQuestion.skills` normalises them (or infers them for older / block / hand-written content) and `gradeActivity` copies them onto every `AttemptResult`. The relational `attempt_results.skill` column is unchanged (attempts are read from the saved attempt documents).
- **Diagnosis** (`performance/skillDiagnosis.js`, tested): per skill, accuracy when a question needs it vs when it does not (weak = clearly worse, enough answers); per weak topic, share of mistakes on weak skills and accuracy on questions that avoid them → `skill` / `topic` / `both` / `unclear`, each with a plain-language reason. Thresholds in `THRESHOLDS`.
- **UI**: "Topic or skill?" panel (`dashboard/SkillMap.js`, topic × skill grid + what each weak spot needs; default view v3) and a compact card on Progress. **Luna's read** now receives the diagnosis and returns `kind: "skill-primer"` actions with a validated skill id. "Refresh this skill" generates a **skill refresher**: a quick primer (shown above the questions via `Activity.intro`) and a drill tagged with the skill, with prerequisites listed in teaching order. The coach practice activity now goes through `buildActivity` (it had its own older question shape).
- Not done: refreshers are not saved to the workspace or inserted into a study plan as a prerequisite step yet; the grader does not name the failing skill (the diagnosis is statistical); no skill-level tracking in the relational mastery engine. Coach cache key bumped to `v4`.
## 2026-10-12 — Level tests, working per question, skills completed
- **Level Test** (`ai-tools/tools/level-test`): a built-in agent that decides the kind and level of the material, chooses 4–8 foundation components (language: words, simple sentences, negatives, forming questions, tenses, spelling; history: background, key terms, order of events, causes; technical: prerequisite concepts and skills) and writes questions per component, easy to harder; `topic` holds the component. Offered in Create → Make, the document menu and the selection bar. **Where you start** (`performance/levelTest.js`, `dashboard/LevelReport.js`, panel `level-tests` and a compact card on Progress): per foundation Solid / Review / Start here, where to begin (first foundation that is not solid), "Build this foundation" (reteach practice) and "Refresh <skill>" for foundations that are skills.
- **Working box** (`activities/ActivityPlayer.js` `WorkBox`, `activities/workImage.js`): on choice, true/false, number and written questions, "Show your working": notes, a photo (downscaled in the browser to 900 px, sent to the grader only; the saved attempt keeps the notes and a `hasImage` flag), and "This is my full answer". A wrong answer with working always goes to the model (`gradeBatch.js`, vision input): it finds the first wrong step, names the failing skill (`failedSkill`, a taxonomy id) and reads the working (`workVerdict`). A chosen option stays the final answer: working explains a wrong choice; with the tick and working that reaches the key it earns "close" (0.6, accuracy), never full marks.
- **Skills, completed**: the taxonomy adds Language learning (vocabulary, grammar forms, building sentences, negatives, forming questions, verbs and tenses, spelling) and Humanities (chronology, causes and consequences, sources, comparing); the diagnosis blames a wrong answer on the skill the grader named (and counts a blamed skill the question was not tagged with); a refresher can be **saved** and **added to a plan before the step it prepares** (`plans/prerequisite.js insertPrerequisite`); migration `202610120002_attempt_result_skills.sql` adds `skills`, `failed_skill`, `has_work` to `attempt_results` (the repository retries without them until it is applied).
- **Fixed**: the skill list in a prompt contained "vocabulary", which made the Quiz Generator and Math Problem Set look like flashcard agents and capped them at 30 items (`looksLikeFlashcards` now ignores the `<skill_tags>` block).
- Not done: the standalone interactive HTML export has no working box; photos are not kept in saved attempts; per-skill tracking in the relational mastery engine still reads the old single `skill`.

## 2026-10-12 — Embedded images in uploaded Word previews
- `canonical/model.js` `embedDocxImages`: reads `word/_rels/document.xml.rels`, embeds png/jpg/gif/webp as `data:` URIs on figure blocks (1.5 MB each, 8 MB total cap; emf/wmf skipped).
- `htmlRenderer.js`: figures with an image render `<img>`; text/markdown/RAG output is untouched (no base64 in chunks).
- Test: `tests/document-processing/docx-embedded-images.test.ts`. Applies to newly uploaded documents (re-upload existing ones).
- Same day, PDF/PPTX: `lib/pdfRender.js` / `pptxRender.js` already embedded pictures, but the CDM re-render (`parseHtmlFallbackBlocks`) dropped `<img>`; it now keeps `data:image` pictures as figure blocks in order. Test added.

## 2026-10-12 — Skills grid by workspace and plan, every built-in agent in the plan, formula sheet, coverage view
- **Skills grid** (`performance/skillOverview.js`, `dashboard/SkillMatrix.js`): rows are workspace → study plan (answers on material in no plan sit under "Outside a study plan"), columns are skills grouped by family (Quantitative, Reasoning, Language…). Only skills with enough answers or a visible weakness show; "+ All skills" opens every answered skill. The "i" in a cell lists which topics of that plan the skill's questions came from. "By topic · advanced" is the full workspace → plan → topic table, indented. Same learner and date filters as the page. Test: `tests/performance-skill-overview.test.ts`.
- **Plan agents** (`plans/agents.js`, `plans/execute.js` `STEP_RECIPES`): the dialog offered 3 hard-coded agents; it now offers every built-in agent of the Create tab (Quiz, Vocabulary Flashcards, Topic Summary, Math Problem Set, Concept Flashcards, Document Summarizer, Formula Sheet, Level Test) plus the learner's own and bought ones. The Summary Notes Consolidator is not offered: the plan builds the master document itself. Summary-like keys (`isSummaryKey`) are scoped by topics, not tested per concept.
- **Formula Sheet** (`ai-tools/tools/formula-sheet`, `createFormulaSheetSpec`): built-in agent; every key formula as the material states it, each variable, the logic behind it, when to use it. Also in Quick make. Dashboard card A13 updated.
- **Coverage view** (`reader/coverageMap.js`, `reader/CoverageLines.js`): a "Coverage" button in a document's preview draws a line beside every paragraph that an activity tests (a question's source extract) or a written output was made from (its source passages); darker = more often, grey = untouched, a pill gives the covered share. Tapping a line lists the activities, their questions and plan, with a link that opens the activity (Courses). Applies to any resource that keeps sources. Not wired: the link in the study plan page's reader. Test: `tests/reader-coverage-map.test.ts`.

## 2026-10-13 (live review fixes: mastery request)

- `/api/student/mastery`, `/patterns`, `/recommendations` and `/api/plans/replan` returned 500 ("more than one relationship was found
  for 'concepts' and 'concept_prerequisites'"): the prerequisite-count embeds now name `concept_prerequisites_prerequisite_id_fkey`.
- Concept states are read for the session owner (`ownerUserIdForFresh`) and filtered to the requested workspace; the client's
  localStorage `learnerId` ("anonymous" for most browsers) no longer decides whose rows are returned.
- Copy: the chat panel's broken "does not count as an attempt" sentence, and "All childs" → "All children" (`modules/accounts/nouns.js`).

## 2026-10-12 — Beta feedback batch (d15aa3ce, 207dd7a5, 5ffbe57a, f03f48bd, f0c53813, 2f46075a)
- d15aa3ce: a deadline has an optional `covers` text (Details button on each deadline in the plan). `buildPlanUpdatePayload` sends it, and rule 8 "Coverage" in the plan-update prompt schedules that material before that date (JSON schema unchanged).
- 207dd7a5: "i" info popovers (`METRIC_INFO.studentModel` / `planProgress`) on the Student model and the plan progress ring.
- 5ffbe57a: Sub-plans card removed from the plan page (data support kept).
- f03f48bd: `autoFile` on saves from Save-resource / run page / targeted practice (not in a plan, no folder chosen) files into "Generated material / Resources not in study plans" (`AppShell.handleSaveGeneratedQuizDocument`).
- f0c53813: folders get a checkbox; the selection bar handles files and folders together: Move to… and Delete (nested picks collapse to the outer folder).
- 2f46075a: saving Account settings now updates the account in `AppShell` (`onAccountChange`), so Home's greeting and the menu show the new name at once.
- Needs `npm run dashboard:publish` locally (the plan-update prompt changed).

## 2026-10-13 — Legal compliance P0 (docs/LEGAL_COMPLIANCE_PLAN.md: L1–L4, L8, L14, L16, L18)
- Migration `202610130001_legal_compliance.sql` (feature-detected via `supportsLegal`; sign-up works as before until applied): `accounts.birth_date/is_minor/terms_version/terms_accepted_at/guardian_confirmed_at/deletion_scheduled_at`, table `guardian_consents`.
- L1/L3 age gate: sign-up asks the birth date for everyone (`AuthModal` step 1), server rules in `accountsCore.js` (`parseBirthDate`, `needsGuardianConsent` <14, `isMinorAccount` <18). Under 14 gets no account (`403 needsGuardian`).
- L2 guardian consent: `lib/guardianConsent.js` + `/api/accounts/guardian/{request,consent}` + `/guardian` page. Only first name + birth date + guardian email kept, 48 h; consent creates the child account and the guardian's parent account (or links an existing parent) with an accepted link.
- L18 `/terms`, `/privacy`, `/ai` (texts in `lib/legalTexts.js`, operator from env), sign-up checkbox, version stored per account, footer links.
- L4 `store:false` on every OpenAI chat call; the coach no longer sends the student's name.
- L8 `/api/accounts/data` (download JSON; delete = 30-day grace, login cancels; a parent can export/erase a child), `lib/accountData.js`, daily `/api/cron/privacy` (vercel.json cron, needs `CRON_SECRET`), Account settings "Your data", parent controls in "My students".
- L14 `AiGuidanceNote` under AI scores, coach, level report, skill map. L16 `docs/DPIA_RAT.md`.
- Not done (still open in the plan): teacher grade override, RLS, phone optional for minors, marketplace/sharing blocks for minors (L5), retention jobs beyond deletion, Spanish texts, payments.
- Tests: `tests/legal-compliance.test.ts`, age-gate cases in `tests/accounts/verification.test.js`.

## 2026-10-13 — Legal compliance, second pass
- L5: minors cannot request or accept `peer` connections (`requestLink`/`changeLink`/`attachPendingLinks`; a request to a minor looks like a normal pending one), cannot sell in the marketplace, and the phone number is optional under 18 (sign-up route + `AuthModal`).
- L11: `public/katex` (CSS + woff2 fonts) used by the workspace preview instead of jsDelivr.
- L9: `purgeDue` also drops expired tokens and feedback screenshots older than 90 days.
- L12: migration `202610130002_enable_rls_all_tables.sql`.
- Spanish Terms/Privacy/AI texts (`lib/legalTextsEs.js`, `?lang=es`), "Made with AI" label on the output preview, `docs/PRIVACY_OPERATIONS.md` (breach procedure, sub-processors).
- Tests: peer/minor rules in `tests/accounts/network.test.js`, teen phone in `verification.test.js`, Spanish texts and retention numbers in `legal-compliance.test.ts`.

## 2026-10-13 — legal follow-ups (prompt audit, inactivity, review, lunas, offline KaTeX)
- Prompt audit: `lib/aiPrivacy.js` `scrubPii` (emails/phones → markers) applied to grader answers/working, chat messages, plan-update instructions, agent-builder iterate/improve feedback. No prompt template contains an account name or email; the coach already says "the learner". Uploaded material is deliberately not scrubbed.
- Inactive accounts: migration `202610130003_inactive_accounts.sql` (`last_login_at`, `inactivity_warned_at`); login sets/clears them; the daily cron warns after 24 months, schedules deletion 30 days later (+30-day grace; login cancels). Privacy texts EN/ES updated.
- Mark reviews: migration `202610130004_mark_reviews.sql`; student "Ask my teacher to review this mark" under each question (`/api/attempts/review`), teacher "Mark reviews" tab confirms/overrides (`/api/accounts/linked/reviews`, teacher only, parents read-only); an override updates the stored result and attempt score.
- Lunas-only economy in Terms EN/ES (no cash, no cash-out); marketplace prices shown in lunas; "Report" button on listings (goes to the feedback inbox).
- Standalone HTML downloads (reader and workspace export) inline KaTeX CSS/fonts instead of loading jsDelivr.
- `docs/SCHOOL_DPA_TEMPLATE_en.md` / `_es.md`, `docs/PROVIDER_DPA_STEPS.md`.

## 2026-10-14 — iPhone (installable web app)
- PWA: manifest (id/scope/category), `public/sw.js` (offline page + static assets only; pages and `/api` are never cached because they hold study data), `/offline` page, `modules/pwa/PwaSetup.js` (registers the worker; on iPhone Safari shows an "Add to Home Screen" hint once). Native wrapper (Capacitor) or a rewrite stays an option; needs Xcode + Apple Developer account.
- Reader: PDF pictures embedded via a pdfjs child process (pdf-parse needs a canvas that is not available), page separators, section-level coverage bars.

## 2026-10-14 — plans, reading, trust page
- Summary resources made of key points (point/detail/topic) now render in the reader (`keyPointBlocks` in `modules/resources/look.js`); they opened as "nothing to read".
- Chat with Luna in the reader was hidden under the Feedback button: the launcher now stacks above it.
- New built-in agent **Reading Splitter** (`reading`): splits documents into reading parts that are the material's own text (or, in a plan, one part per read step). Create tab, plan agent catalog, Update… registry.
- Planner: every selected agent is used (prompt rules 12–13 + `modules/plans/agentUse.js` adds a step for any agent left out; read steps of uploaded documents become reading parts when the splitter is selected).
- Landing: new **Trust** tab (Spain/EU and US law, what Luna does with data, how it is protected, what is still in progress; EN/ES).

## 2026-10-14 — grounding checks
- `pipeline/grounding.js`: quote-and-verify (`_quote` must be in the cited passage), `_support` stated/inferred, unmatched-figure flags, and a second-pass judge (gpt-4o-mini); wired into `runAgentGeneration` (items and written blocks) and the chat engine (`chat/groundChat.js`).
- Failing items are dropped when strict and enough remain, otherwise flagged. UI: Stated / Inferred / Could not be confirmed badge and verified quote under each answered question; ⚠ marks and a notice in written documents; a check note under chat answers.
- Config: `config.grounding === false` or `groundingStrict === false` per run; `LUNA_GROUNDING_JUDGE=off`, `LUNA_GROUNDING_MODEL`.
- Grounding follow-up: flashcards show the source note and badge on the flipped card (`activities/SourceNote.js`); written documents (summaries, formula sheets, reading parts) now carry `_source`/`_quote`/`_support` per paragraph, bullet list and callout (block schema `grounded: true`), the quote is verified in code, verified paragraphs show their supporting quote on hover and unverified ones a ⚠ mark.

## 2026-10-14 — PDF fidelity: batches, lists, pictures, visual formula editor, interactive charts
- PDF → Markdown now converts in batches of 5 pages (4 in parallel, one retry, visible note for a failed batch) instead of one 16k-token call for the whole file.
- `normalizeCanonicalDocument` no longer empties bullet lists of AI-read files; list items keep their nesting (`depth`) in the HTML/Markdown/text renderers.
- Pictures: shared logos and tiny images skipped, 1-bit scans read, caps raised, picture worker flushes stdout before exit; figures without an embedded picture (vector drawings) get a page screenshot (needs `@napi-rs/canvas`).
- Formula editor: MathLive visual dialog (`reader/FormulaEditor.js`, fonts self-hosted in `public/mathlive`). Converter prompt keeps underbraces/labels.
- Charts: new `chart` block (`renderers/chartSvg.js`) holding the plotted numbers, drawn as SVG in the reader/exports; click a chart to change its numbers (`reader/ChartEditor.js`); saved with "Edit content". Converter emits a fenced `chart` JSON block for plotted charts.
- Dashboard U1 updated (batching, chart block); run `npm run dashboard:publish`.

## 2026-10-19 — rollout onboarding: class codes, school consent, legal placeholders
- Class join codes: migration `202610140001_class_codes.sql` (`class_codes`, `class_joins`), `lib/classCodes.js` (pure: generator, validation, under-14 decision), `lib/classesRepository.js`, routes `/api/accounts/classes` and `/classes/check`, sign-up `classCode`, teacher card "Your class code" and student "Join a class with a code" in Connections. Joining creates the teacher-student link already accepted; wrong codes are rate limited (10 per 15 minutes per address and account).
- School sign-up under 14: a class created with the teacher's "school holds parental consent" confirmation (stored with teacher id and time) approves under-14s who join with its code; other classes keep the guardian email flow. One sentence added to the Children section of the Privacy Policy (EN/ES).
- Legal pages never show a placeholder: `operatorDetails` treats empty or placeholder values (e.g. `privacy@yourdomain`) as unset and says to use the in-app Feedback button; site description is now a real one-liner.
- Tests: `tests/class-codes.test.ts`. Owner must apply the migration in Supabase before the rollout and set `LUNA_PRIVACY_EMAIL`, `LUNA_LEGAL_NAME`, `LUNA_LEGAL_ADDRESS` in Vercel.
## 2026-10-19 (older Safari, speed, linked-student reads, tour per account)

- **Older Safari**: every regex lookbehind (`(?<=`, `(?<!`) removed from `apps/web` source (it is a parse-time SyntaxError before Safari 16.4);
  `lib/regexCompat.js` holds the replacements and `tests/regex-compat.test.js` fuzzes them against the original patterns and fails if a
  lookbehind literal is reintroduced. `browserslist` (safari/ios_saf >= 14, chrome/firefox/edge >= 90) added to `apps/web/package.json`
  (Next reads it for SWC/CSS targets). `replaceAll` and `Array.prototype.at` calls in shared code replaced by `replace(/x/g)` / index.
- **Speed**: the workspace tree is cached in the browser (`lib/workspacesClientCache.js`: one shared request, stale-while-revalidate, 20 s
  freshness, kept in sync by mutation answers). `GET /api/workspaces-supabase` loads the tree once (was twice), the 11 column probes are
  memoised per process and run in parallel, the independent document queries and the sharers' trees load with `Promise.all`.
  "What Luna suggests" mounts after 1.5 s (or when opened) behind a skeleton. **Owner TODO**: Vercel function region, see `docs/SUPABASE_SETUP.md`.
- **Linked student read-only view**: `/api/concepts` and `/api/student/mastery` accept `studentId` and authorise it with the accepted
  teacher_student/parent_student link (`lib/linkedStudentRead.js`); the client no longer sends `learnerId=anonymous`.
- **Tour per account**: `accounts.tour_seen_at` (migration `202610190001_account_tour_seen.sql`, feature-detected), `POST /api/accounts/tour`;
  without the migration the flag is kept in localStorage under the account id.

## 2026-10-19 — student rollout fixes (branch feat/rollout-student)
- Practice card (A6): full title (up to 3 lines), one big Start button, and the deadline / Update / Delete controls in a "⋯" menu (Delete confirms). Same on desktop and phone.
- Names (C1): `modules/ui/displayName.js` hides `.resource.json` everywhere a name is shown (rename keeps the stored suffix). Courses rows are Open + "⋯" only (folder hover icons, star and download buttons moved into the menu).
- Summaries (C2): a generated document opens in the reader; "What it teaches", Regenerate and Delete are in its "⋯" menu.
- Coach (C3): the coach prompt writes to the reader ("you" for a student) and every action needs its own reason; the local "Work on these next" list builds a per-topic `why` from that topic's score, mistakes and trend (`whyThisTopic`). Coach cache key bumped to v5.
- Plain words (C4): "Covers all N topics", "Tools used", "How well you know it"; one name "Tool" for tool / agent / Agent Studio; lunas balance hidden behind `SHOW_LUNAS` in `modules/credits/CreditsBadge.js`.
- Quiz (C5): the quiz overlay is a full-screen dialog with a "← Leave" button.
- Reader (C8): `repairLatexEscapes` typesets `\bar{x}` (also when the backslash was lost); an empty "Figure" label with no picture is no longer drawn.
- Progress first (C9): `modules/activities/catchUp.js` — "N quizzes done this week" before late items, one catch-up message instead of a wall of late badges, first late chip red and the rest amber (Practice and student Home).

## 2026-10-19 — A9: English / Spanish (branch feat/rollout-2026-10-19)
- New dependency-free i18n layer in `apps/web/lib/i18n/` (see its README): `t(key, vars)`, `t.plural`, `LocaleProvider`/`useT`/`useLocale`, `LanguageSwitch`, server detection (cookie `luna_lang` then Accept-Language, default en), `<html lang>` from `app/layout.js` (the layout is now dynamic). Legal pages reuse the cookie when there is no `?lang=`.
- Switch "EN | ES" in the top bar (desktop and phone), landing header, auth dialog, token screens and Account settings. Cookie only: no migration, so the choice is per browser.
- Translated (es): landing, sign-up/login incl. class code, navigation and titles (long and phone-short), student Home, "?" help and first-run tour, Study plans, Practice and the quiz player, Progress incl. coach panel text, Courses tree/row menus/reader chrome, teacher and parent Home, People/Connections, share/send dialogs, notifications, Ask Luna menu, feedback widget, Account settings, error messages (`friendlyError.js`). Remaining English: see `lib/i18n/README.md`.
- AI content: coach request sends `language`; `/api/performance/coach` adds a `<language>` block (`npm run dashboard:check` passes); agent runners' "Language" question defaults to the UI language when Spanish.
- Tests: `tests/i18n/i18n.test.js` (same keys and `{placeholders}` in en and es, detection, plurals, fallback), `tests/i18n/keys-used.test.js` (literal keys used in code exist). Existing English tests unchanged: pure helpers keep English output without `t`.

## 2026-10-19 — quiz player: drafts, results stay open, source labels, phone quizzes (branch feat/rollout-quiz)
- **Save without submitting**: drafts autosave (debounced, on Leave, on page hide) to `activity_drafts` for a logged-in account (migration `202610190002_activity_drafts.sql`, feature-detected, route `app/api/activities/drafts`) and always to localStorage keyed by account + activity. "Save and finish later" button, "Saved" indicator, resume on the same question with the same answers, Submit only when chosen. Drafts are never attempts. Practice shows "In progress · 3/6 answered · Continue". Pure rules in `modules/activities/drafts.js`.
- **Bug "checking the answers closes the quiz"**: root cause was Progress → practice (`modules/performance/PerformancePage.js`) calling `setPractising(null)` inside the player's `onSubmit`, so the results unmounted as soon as they were computed. The host no longer closes it; the player now awaits `onSubmit` safely, scrolls its own results into view inside whatever scrolls (the reader is a fixed z-[70] dialog, so `window.scrollTo` did nothing), and the grader has a 40 s per-call model timeout (`MODEL_TIMEOUT_MS` in `gradeBatch.js`, route `maxDuration` 60) so long written/maths grading always answers with local marking instead of being killed by Vercel; the client gives up only at 55 s; photos of working are capped at 6 per request (4.5 MB body limit). Regression guard: `tests/activities/player-stays-open.test.js`.
- **Answer feedback source**: `modules/activities/sourceLabel.js` + `SourceNote.js`: a maths question says "Maths problem based on this section of the notes: {section}" with a link to the section; other questions without a quote name their section; the "No supporting quote was given" reason is never shown. `attachSources` now gives every question a section heading (the cited passage's heading, else the nearest passage, else the single document).
- **Phone**: one question per screen (progress bar, Back/Next fixed at the bottom with `env(safe-area-inset-bottom)`, Review answers → Submit, 180 ms step animation `animate-step`), big tap targets, 16 px inputs (no iOS zoom); optional "One question at a time" on a computer. `PhotoQuizMaker.js`: camera / library photos, client-side JPEG ≤ 2000 px (`photoUpload.js`), upload through the existing pipeline one photo per request, 5/10/15 questions + difficulty, generated with the built-in Quiz Generator, opened straight away.
- Tests: `tests/activities/drafts.test.js`, `photo-upload.test.js`, `source-label.test.js`, `player-stays-open.test.js`. i18n keys `practice.draft.*`, `practice.step.*`, `practice.src.*`, `practice.photo.*` in en and es.
