# Implementation Log

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
