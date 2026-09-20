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
