# workspace

The workspace page: one folder tree holding everything (uploaded material, generated resources, the
review centre). A topic (a `subject`) is the top-level folder; everything below it is a folder.

- `ui/WorkspacePage.js` / `ui/WorkspaceBrowser.js` — the page and the tree. Props come from `AppShell`.
- `ui/folderModel.js` — "just folders" node ids (`s:<subject>`, `f:<subject>:<folder>`) over the subject/folder storage.
- `ui/MoveDialog.js` — the "Move to…" folder picker (every topic is the root of its branch).
- `moveModel.js` — pure helpers for moving: where a dropped document lands, status-line texts, undo grouping.

## Moving

Documents and folders can be moved to **any topic or folder of the same workspace**, by drag and drop
(onto a folder or a topic) or from the ⋯ menu → "Move to…" (works on a phone; a checkbox on each row
selects several documents, and dragging one selected item moves them all). The status line says what
moved ("3 items moved to Statistics / Uploaded material") and offers **Undo** while it is the current
message.

Server rules live in `lib/workspaceMove.js` (API actions `moveDocument` and `moveFolder`, see
`app/api/workspaces-supabase/route.js`; ownership and read-only copies are checked by `lib/workspaceGuard.js`):

- Same workspace only. Document ids never change, so plans, attempts, notes and links keep working.
- Across topics every row carrying `subject_id` follows (documents, the folder subtree, `document_chunks`,
  `attempts`, `study_plans`), a topic's own tags are re-created in the target topic, and a document's
  notes file and attempt records (separate, unfiled documents that name it) move with it.
- A folder moves with its subfolders and every document filed in it; never into itself or its own subtree.
- A name already used at the target becomes "Name (2)" and the status line says so.
- The topic skeleton (Uploaded material, Generated material, Study plans, Resources not in study plans,
  a plan's Reference materials) is not moved. A study plan's folder (or its plan document) that changes
  topic goes under the target topic's "Study plans" with its quizzes, so the plan stays together.
- Dropping a document on another topic's top level files it under that topic's "Uploaded material"
  (uploaded) or "Resources not in study plans" (generated) when it has them.
- Writes are ordered so nothing is ever orphaned and each step has an undo that runs in reverse if a
  later step fails ("nothing was changed"); see the journal in `lib/workspaceMove.js`.

Known limit: the plans page resolves documents inside one topic, so a plan that stays behind shows a
document it used as missing once that document moved to another topic. The move tells you which plans.
