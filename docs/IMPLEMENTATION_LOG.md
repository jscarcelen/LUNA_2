# Implementation Log

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
