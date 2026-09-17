# LUNA — Claude Code project guide

## What LUNA is

LUNA is an education platform where teachers, students and (eventually) parents upload course
material and generate study content through pre-built AI agents (quiz/exam generator, flashcards,
summaries...), build their own agents (prompt + context + output template) and sell them in an agent
marketplace. Longer term it will track how each student studies best so teachers and parents can
send targeted homework.

**Current reality vs. vision** — be honest about what exists:
- Exists: workspaces/subjects/folders/tags/documents CRUD on Supabase, DOCX/PDF document-processing
  pipeline, RAG (chunking + pgvector retrieval), OpenAI-backed quiz generator, agent builder + run
  page with template output mappings, template builder / block editor, HTML/DOCX/PDF exporters.
- Does NOT exist yet: real auth (ownership is a hardcoded demo uuid; the student/teacher/parent
  switch is client state with sample dashboards), quiz attempts + real analytics, marketplace
  purchases/payments (browsing + install works; listings are localStorage), RLS, TypeScript.
- Roadmap agreed with the user: 1 design system ✔ → 2 accounts & roles (auth provider TBD later) →
  3 online quiz player + attempts + assignments → 4 insights/format-preference intelligence →
  5 marketplace v2 (templates + Supabase + payments) → 6 document formats (PDF/OCR/handwriting/Excel, PPTX export).

## Stack

- npm workspaces monorepo. **Only `apps/web` (`@luna/web`) is real**; `apps/admin`, `packages/*` and
  root `modules/*` are placeholders (`packages/database` is duplicated inside `apps/web/lib`).
- Next.js 16 canary, App Router (`apps/web/app`), React 18. **Plain JS/JSX — no TypeScript.**
  Styling is hybrid: legacy pages use the hand-written class system in `apps/web/app/globals.css`;
  new/redesigned surfaces use **Tailwind v4 utilities** (tokens in the `@theme` block at the top of
  `globals.css`, referencing the existing CSS variables). Preflight is NOT loaded — wrap Tailwind-
  styled trees in `.tw-scope` for the base reset. Vitest. Flat ESLint (`eslint.config.mjs`).
- **Design language (Phase 1, 2026-09-16): crisp, light, Apple-like.** The final "LUNA design
  language" block at the end of `globals.css` overrides the older pastel theme at token level
  (`--bg #f5f5f7`, `--paper #fff`, `--ink #1d1d1f`, single accent `--accent #0071e3`, hairline
  `--line`, soft `--shadow`). Rules: solid white surfaces, no `backdrop-blur` / translucency, no
  gradients on controls, pill buttons, 12–18px radii, 180ms `--ease` motion. The user rejected a
  dark theme as "blurry" — do not reintroduce dark mode or glassmorphism.
- Roles: `student` / `teacher` / `parent` are a client-side switch (`components/data.js`
  `navByRole`, `roleProfiles`). Each has its own home (`modules/dashboard/ui/DashboardPage.js`).
  `modules/dashboard/insights.js` is the data seam — sample data now, Supabase later.
- Node 24 (`.nvmrc`). `apps/web/CLAUDE.md` → `AGENTS.md` points at the bundled Next canary docs in
  `node_modules/next/dist/docs/` — read those before writing Next-specific code.

## Commands (run from repo root)

```bash
npm run dev:web                                   # next dev for apps/web
npm run lint                                      # eslint web + admin (warnings OK, 0 errors required)
npm test --workspace @luna/web                    # vitest (document-processing tests)
npm run build --workspace @luna/web -- --webpack  # exactly what Vercel runs
```

Baseline as of 2026-09-13: lint 0 errors / 66 warnings; build green; **3 document-processing tests
fail** because they still expect the old `docx-ooxml-cdm` parser while uploads now use
`docx-auxiliary-json-extractor` (9 obsolete snapshots). Don't treat those as regressions you caused.

## Where things live (`apps/web`)

- `app/api/*` — route handlers: `ai-tools/quiz`, `ai-tools/agent-builder` (+ `/stream`, NDJSON
  progress events), `templates/render-preview`, `workspaces` (mock), `workspaces-supabase`,
  `supabase/health`.
- `components/views.js` — ~2500-line file holding most page views. Edit surgically; don't reformat.
- `components/AppShell.js`, `SideNav.js`, `TopBar.js`, `data.js` (per-role nav).
- `lib/supabaseClient.js`, `lib/workspacesRepository.js`, `lib/mockStore.js`, `lib/fileTextExtraction.js`.
- `modules/ai-tools/` — `registry.js` (tool registry), `tools/<tool-id>/` (manifest + pages;
  `tools/agent-builder/README.md` documents the streaming + live-preview building blocks),
  `pipeline/` (`workspaceSource` → `chunking` → `retrieval` → `provider-openai`/`provider-local`,
  `agentBuilder.js`, `embeddings.js`), `render/` (templates + exporters).
- `modules/document-processing/` — parsers, canonical model (CDM), math, normalization, renderers.
- `modules/core/` — shared contracts (`validateAiToolManifest`), auth/users placeholders.
- `supabase/migrations/` (repo root) — `YYYYMMDDNNNN_description.sql`, 15 so far.
- `docs/` — `ROADMAP.md`, `IMPLEMENTATION_LOG.md`, `SUPABASE_SETUP.md`, `VERCEL_DO_NOT_DO.md`.

### Agents and templates (product rule)
Every agent — built-in, user-made or from the marketplace — renders through
`modules/ai-tools/tools/agent-builder/RunAgentPage.js`: intro + How it works → Configure questions
→ Configure output → Export. Built-in agents are plain config objects (see
`tools/quiz-generator/quizAgent.js`); do not build bespoke wizards. Templates are edited in the
Template Studio (`tools/template-builder/TemplateStudioPage.js`, model in `studioModel.js`) and
matched to agents by **field tags** (`dataFields`); output data is `{ items: [...] }` when the
template repeats per item.

### Adding an AI tool
Create `modules/ai-tools/tools/<id>/index.js` exporting a manifest (validated by
`validateAiToolManifest`) plus its page component, then register it in `modules/ai-tools/registry.js`.
See `apps/web/modules/README.md`.

## Rules

**Supabase**
- Server-side only: `createSupabaseAdminClient()` (service role). Never ship the service key to the
  browser; there is no anon/browser client today.
- Schema change = new file in `supabase/migrations/` following the naming pattern, applied with the
  Supabase MCP `apply_migration` (project ref `fekeupkjljbgimntxpnv`, name "Luna") or the SQL
  editor, then listed in `docs/SUPABASE_SETUP.md`. Run `get_advisors` (security + performance)
  after DDL. Every table is keyed by `owner_user_id`; keep that until real auth lands.

**LLM**
- OpenAI via raw `fetch` (no SDK). Models are branded "Luna 3 Mini/Pro/Max" (`AGENT_MODEL_OPTIONS`
  in `pipeline/agentBuilder.js`); overrides via `LUNA_QUIZ_MODEL`, `LUNA_AGENT_MODEL`,
  `LUNA_EMBEDDING_MODEL`. `provider-local.js` is the no-key fallback — keep it working.
- Generators return **content-only JSON**; templates/exporters own all presentation.
- Prompts are inline strings in the pipeline files; keep them there unless refactoring on purpose.

**Vercel** (see `docs/VERCEL_DO_NOT_DO.md`)
- Deploy from the **repo root only** (root `vercel.json`), never from `apps/web`. Build uses
  `--webpack`. Project `luna2-share-web`, scope `jonathans-projects-396234a2`.
- JSX pitfall: never put raw `{{...}}` or LaTeX with braces/backslashes in JSX text — wrap in a
  string literal.

**Env vars** (names only; values live in `.env.local`, never print them)
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LUNA_DEMO_USER_ID`,
`OPENAI_API_KEY`, `LUNA_QUIZ_MODEL`, `LUNA_AGENT_MODEL`, `LUNA_EMBEDDING_MODEL`,
`MATH_OCR_ENDPOINT`, `MATH_OCR_APP_ID`, `MATH_OCR_APP_KEY`, `OCR_LANGUAGES`, `OCR_MIN_CONFIDENCE`,
`EXTRACTION_MIN_CONFIDENCE`.

## Conventions

- Commits: lowercase `scope: description` (e.g. `agent-builder: add two-step variable mapping flow`).
- camelCase for logic files, PascalCase for React components/pages, kebab-case directories, ESM with
  explicit `.js` extensions in relative imports.
- API routes declare `export const runtime = "nodejs"; export const dynamic = "force-dynamic";`.
- Input normalization: `String(x || "").trim()`.
- Every folder under `apps/*`, `packages/*`, `modules/*` has a README.md — update it when the folder
  changes meaningfully; add an entry to `docs/IMPLEMENTATION_LOG.md` for notable work.

## Workflow

- Don't commit or push unless asked. `main` deploys to production on Vercel — do feature work on a
  branch (`feat/...`) and let the user merge.
- Long-running AI work must stream (see the agent-builder `/stream` route) rather than rely on Edge
  runtime; the pipeline needs Node (Supabase, chunking, document parsers).
- `~/LUNA_2.worktrees/` holds agent worktrees (e.g. `agents/ui-redesign-template-builder`).
- `Statistics.pdf`, `auxiliary/PDF_JS_Jupyter/`, `auxiliary/pdf-json-extractor/` are intentionally
  untracked local experiments — leave them alone.
