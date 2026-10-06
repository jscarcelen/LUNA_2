# LUNA — Claude Code project guide

## Product vision — read first

**`docs/LUNA_VISION.md` is the source of truth for the idea** (profiles, archetypes, key
functionality, tracking, revenue model, agent principles) and every change must be checked against
its alignment checklist. Invoke the `luna-vision` skill (`.claude/skills/luna-vision/SKILL.md`)
before planning or implementing, and append any new founder context to that document.

## Prompt quality — metaprompt on every request

The user wants every prompt they write sharpened before it is acted on. The full method is the
`metaprompt` skill (`.claude/skills/metaprompt/SKILL.md`; invoke it for an explicit "metaprompt this /
mejora este prompt").

For every non-trivial request, silently run its diagnosis (ambiguous intent, missing context, no output
spec, hidden assumptions, vague criteria, buried instruction, no verification) and act on the sharpened
version: infer the most useful reading of what was asked, break a blob into steps, and make "good / clear /
detailed" concrete against `docs/LUNA_VISION.md` and the rules below. Do not add goals the user did not imply, and
do not ask for clarification unless a critical fact is truly unknowable. If the reading you chose is not
obvious, say it in one line before starting. Do not paste a rewritten prompt back unless the user asks for one.
Answer in the language of the user's message.

The same principles govern every prompt that **ships inside the app** (agent builder and its
refine/improve/iterate improvers, study-plan generator/revise/update, concept maps, consolidator, coach,
grading, template studio): data before task, XML tags, explicit output format, positive rules with a reason,
reasoning before answer, self-check. See "LUNA prompts" in the skill, and run `npm run dashboard:check` after
editing one (the dashboard extracts prompts from source).

## What LUNA is

LUNA is an education platform where teachers, students and (eventually) parents upload course
material and generate study content through pre-built AI agents (quiz/exam generator, flashcards,
summaries...), build their own agents (prompt + context + output template) and sell them in an agent
marketplace. Longer term it will track how each student studies best so teachers and parents can
send targeted homework.

### Document upload & extraction
Every uploaded file must be fully parsed: running text, headings and document structure, embedded
pictures, mathematical formulas (MathML/LaTeX), graphs, charts, diagrams, and schemas. The CDM
(canonical document model) stores all of these; the extraction pipeline (DOCX, PDF via Anthropic
vision fallback, PPTX via GPT-4o slide description, handwritten notes via OCR) feeds into it.

### Workspace organisation
Workspaces are organised **Subject → Topic → Subfolder** (arbitrary depth). Within each node,
material is classified as:
- **Reference** — teacher-uploaded source material (textbooks, notes, past exams). Static; read
  inside LUNA or exported.
- **Generated / static** — summaries, infographics, schemes produced by agents. Read inside LUNA
  or exported; not "answered".
- **Generated / interactive** — quizzes, flashcards, worksheets, games. Answered inside LUNA; the
  attempt and score are sent back to the performance tracker.

### Study plans
A study plan ties reference material to goals, topics, exam dates and generated activities with
deadlines. Study plans can be embedded inside larger study plans (a topic plan inside a subject
plan). Each resource can belong to zero, one, or many study plans.

### Performance tracking — the "why" behind every dashboard
Each role has concrete questions the dashboards must answer:

**Student**
- What skills do I need to improve? What topics should I reinforce?
- Am I improving over time? Am I on track for my exam?
- What resources work best for me / make me most efficient?
- What mistakes am I making consistently?
- Why am I making them? Lack of content knowledge? Lack of attention? Missing a core skill (e.g.
  algebra) that underlies this topic?
- Distinguish **topic skills** (Biology osmosis) from **transversal skills** (reading comprehension,
  arithmetic, time management under pressure). The platform must detect both types of pattern.

**Parent**
- Is my child progressing (speed and quality)? Is their study time efficient?
- How can I help? Which topics can I support? Which skills need external reinforcement?

**Teacher**
- Topic, subject and transversal performance views — per student, per class, across classes.
- Identify students who need targeted resources for a given topic.
- Generate student-focused resources directly from the performance view.

Performance trends are tracked **within a topic** (exam mindset) and **transversally** (study
skills that repeat across topics/subjects).

### AI agent builder — 4-step flow (the north star)
1. **Prompt** — what the agent does (one sentence; no "what should it generate?" field).
2. **Context / reference** — which workspaces, documents, or example question sets the agent reads
   (RAG source; can be empty).
3. **User inputs** — the questions the *runner* answers at run time (language, number of questions,
   difficulty…). Defined as typed controls (text, number, choice, toggle, language).
4. **Output blocks** — which block categories the agent can produce. The teacher *selects* which
   block formats to allow; the agent picks which of the allowed formats to use and in what order.
   All blocks in the same category share identical AI fields — only the visual format differs, so
   formats are fully interchangeable without touching the schema.

### Agent runner — what a student/teacher does
1. Upload reference material (optional — for agents that need it, e.g. "make an exam from my
   notes").
2. Answer the configured user inputs (language, count, difficulty…).
3. Pick the visual format for each output block category (e.g. "I want multiple-choice cards in
   the red style").
4. Generate → answer inside LUNA, or export (HTML/PDF/DOCX/PPTX). Attempt results flow back to
   the performance tracker.

### Template Studio — the design layer (keep it simple)
A template is **a selection of block formats**. Nothing more.
- **Categories**: Document structure (static, no AI fields); Interactive — questions (exam
  questions, MC, open answer, T/F…); Interactive — worksheets (fill-in-blanks, match, math…);
  Games (flashcards, word search, puzzles…).
- Within each category there are **families** (Question card, Flashcard…), each with multiple
  **visual formats** (designs). All formats in a family share the same AI fields.
- Building a template = picking which formats from each family are allowed. The agent decides
  order, repetition and count. The user decides only the visual style.
- The Template Studio UI is: **landing page** (create new or open existing) → **construction**
  (prompt-generate OR manual block picker) → **preview** (with/without answers, A4/slides/cards)
  → **save**.
- The block editor (simple mode) is just the AddPanel checkbox list on the left and the Canvas
  preview on the right. No inspector, no placement controls, no order controls — the blocks'
  repetition and placement are preconfigured and invisible to the user.
- The **Data tab** lets the user override any AI field with a fixed value (forces it in every
  output).

**Current reality vs. vision** — be honest about what exists:
- Exists: workspaces/subjects/folders/tags/documents CRUD on Supabase, DOCX/PDF document-processing
  pipeline, RAG (chunking + pgvector retrieval), OpenAI-backed quiz generator, agent builder + run
  page with template output mappings, template builder / block editor, HTML/DOCX/PDF exporters.
- Accounts (first version, see `docs/ACCOUNTS.md`): email + password sign-up/log-in, signed session cookie,
  the real platform at `/platform` (role fixed by the account, own workspaces), teacher↔student and
  parent↔student connections that need both sides to accept, read-only sharing into "Shared documents /
  <sender>", assigning activities and study plans with a due date, and a read-only student performance view
  for parents/teachers. **Needs migration `202610040001_accounts_links_sharing.sql` applied** (until then the
  UI shows an explicit "Accounts need one database step" notice). The public demo at `/app` is unchanged
  (shared demo owner `LUNA_DEMO_USER_ID`, sample profile, role switcher).
- Email confirmation, password reset, one phone per account (not SMS-verified), the notification bell and request emails exist
  behind migration `202610050001_account_verification_phone_tokens.sql` (feature-detected: sign-in works without it); see
  `docs/ACCOUNTS.md` and `lib/mailer.js`.
- **Open network + sharing v2** (migration `202610060001_network_sharing_grants.sql`, feature-detected: nothing breaks and
  sharing v2 routes answer `503 setupNeeded` until it is applied): any account connects with any other (`peer` kind;
  teacher/parent↔student keep assign + performance, a peer never exposes performance); files, folders (subtree, also what is
  added later), topics and study plans are shared **live** with `view`/`edit` through `share_grants` and appear under
  "Shared with me / <owner>" in the tree; agents/templates/components are shared as copies. **Authorisation rule: decide
  access only with `lib/grants.js` `resolveAccess` (via `workspaceGuard` / `resourceAccess`), never from client flags; edit
  changes the owner's original, only the owner deletes/moves/re-tags/shares onward; actions not listed in
  `SHARED_ACTION_NEEDS` are owner-only.** See `docs/ACCOUNTS.md`.
- Does NOT exist yet: a third-party auth provider / SMS verification (ownership of the
  demo is still a hardcoded uuid), quiz attempts + real analytics, marketplace
  purchases/payments (browsing + install works; listings are localStorage), RLS policies, TypeScript.
- Roadmap agreed with the user: 1 design system ✔ → 2 accounts & roles (auth provider TBD later) →
  3 online quiz player + attempts + assignments → 4 insights/format-preference intelligence →
  5 marketplace v2 (templates + Supabase + payments) → 6 document formats (PDF/OCR/handwriting/Excel, PPTX export).

## Stack

- npm workspaces monorepo. **Only `apps/web` (`@luna/web`) is real**; `apps/admin`, `packages/*` and
  root `modules/*` are placeholders (`packages/database` is duplicated inside `apps/web/lib`).
- Next.js 16 canary, App Router (`apps/web/app`), React 18. **Plain JS/JSX** except
  `modules/template-studio/**`, which is TypeScript (`tsconfig.json` with `allowJs`; `npm run typecheck`).
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
- Roles: in the demo (`/app`) `student` / `teacher` / `parent` are a client-side switch (`components/data.js`
  `navByRole`, `roleProfiles`); in the real platform (`/platform`, `<AppShell account={…}/>`) the role comes
  from the logged-in account, there is no switcher, and `platformNavExtras` adds Connections / My students.
  **Server rule: whose data a request touches is decided only by `ownerUserIdFor(request)` (`lib/session.js`:
  session account id, else the demo owner); never read an owner id from a request body or query.** For a
  logged-in account `lib/workspaceGuard.js` also checks every workspace/topic/folder/document id (own, or shared with the account by a live
  grant, see `lib/grants.js`) and keeps documents tagged `shared-by:…` read-only. Home (`modules/dashboard/ui/DashboardPage.js`) is the same simple page for every role: greeting, a
  one-row gallery of the 4 most urgent study plans, and Luna's next steps (real data).
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
- `supabase/migrations/` (repo root) — `YYYYMMDDNNNN_description.sql`, 23 so far.
- `app/platform` (real platform), `app/login`, `app/api/accounts/*`, `modules/accounts/`,
  `lib/accountsCore.js` (pure rules), `lib/session.js`, `lib/accountsRepository.js`, `lib/sharingRepository.js`,
  `lib/workspaceGuard.js` — accounts, see `docs/ACCOUNTS.md`.
- `modules/feedback/` + `app/feedback-admin` + `app/api/feedback` — TEMPORARY beta feedback tool (delete when the beta ends; README lists how). When the user pastes a
  "LUNA beta feedback to implement" brief, work through it item by item as the brief says.
- `docs/` — `ROADMAP.md`, `IMPLEMENTATION_LOG.md`, `SUPABASE_SETUP.md`, `ACCOUNTS.md`, `VERCEL_DO_NOT_DO.md`.

### Agents and templates (product rules — enforce these always)

**Agent Studio** (`modules/agent-studio/`, TypeScript): 4-step wizard.
- Step 1 Prompt — name + what the agent does. No "what should it generate?" field.
- Step 2 Context — workspace/document sources for RAG.
- Step 3 Inputs — typed controls (text / number / choice / toggle / language) the runner answers.
- Step 4 Output — a **block picker**: the teacher clicks which block formats the agent may use.
  This is the simplified `OutputComposer`: show the 4-category / family / variant AddPanel grid;
  no full DesignMode in composer mode. The selected blocks' AI fields become the output JSON schema
  automatically.
- `AgentSpec` is canonical; JSON Schema is compiled from it; output is validated; feedback patches
  the spec. Never expose prompts/JSON outside the Advanced panel; never bake source material into an
  agent definition (use context slots at run time).

**Template Studio v3** (`modules/template-studio/`, TypeScript — see README and
`docs/TEMPLATE_STUDIO_ARCHITECTURE.md`): Template → Layout → View; elements with
`source: static | field`; groups own repetition (flow / page / grid) and nest; page scope is
separate from repetition; one layout engine feeds HTML/PDF/DOCX/PPTX. Templates are
agent-independent (fields auto-map by name). Saved rows carry `templateV3` + `dataFields`.

Key rules:
- The **AddPanel** (left sidebar) is the only way to add blocks in simple mode. It shows the
  3-level accordion: category → family → variant, with checkboxes. Checking = add; unchecking =
  remove. Do NOT add per-format template code, expose placement controls, or reintroduce the
  block-list editor.
- Simple mode layout: **[AddPanel 280px | Canvas preview full width]**. Inspector is hidden.
- The **Data tab** in Template Studio lets users pin any AI field to a fixed value.
- Every agent renders through `modules/ai-tools/tools/agent-builder/RunAgentPage.js`: intro →
  reference material → configure inputs → configure output format (block style picker) → export.
  Built-in agents are plain config objects (`tools/quiz-generator/quizAgent.js`); no bespoke wizards.

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
  after DDL. Every table is keyed by `owner_user_id` (an account's id, or the demo owner); the accounts
  tables (`accounts`, `account_links`, `shared_items`) are service-role only.

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
`EXTRACTION_MIN_CONFIDENCE`, `LUNA_SESSION_SECRET` (32+ random chars signing the session cookie; required in
production/preview on Vercel, a dev fallback is used locally), `LUNA_MAIL_FROM`, `LUNA_SMTP_URL` (SMTP provider, wins over Resend),
`LUNA_FEEDBACK_ADMIN_KEY` (opens the temporary beta feedback board at `/feedback-admin`; see `apps/web/modules/feedback/README.md`),
`RESEND_API_KEY`, `LUNA_PUBLIC_URL` (outgoing email; none configured = dev console preview / production "Email is not set up yet").

## Conventions

- Commits: lowercase `scope: description` (e.g. `agent-builder: add two-step variable mapping flow`).
- camelCase for logic files, PascalCase for React components/pages, kebab-case directories, ESM with
  explicit `.js` extensions in relative imports.
- API routes declare `export const runtime = "nodejs"; export const dynamic = "force-dynamic";`.
- Input normalization: `String(x || "").trim()`.
- Every folder under `apps/*`, `packages/*`, `modules/*` has a README.md — update it when the folder
  changes meaningfully; add an entry to `docs/IMPLEMENTATION_LOG.md` for notable work.

## Workflow

- **Before responding to any multi-part request: list every bullet/numbered item the user asked for
  and confirm each is addressed in the current response. Do not mark a session as done until all
  sub-requests are implemented. If a request has 5 sections, implement all 5 in one session.**
- **Dashboard (`docs/dashboard/`)**: a generated, dated HTML presentation of the product, its flows, every AI
  request (exact prompts, models, tokens, cost) and the economics. The user has given **standing permission**
  to commit + push new dashboard versions. When you change an AI prompt, model, price, AI request, flow step or
  the lunas/marketplace model, update `docs/dashboard/manifest.mjs` and run `npm run dashboard:publish` (see the
  `luna-dashboard` skill). It writes a new `versions/luna-dashboard-YYYY-MM-DD[-n].html`, never overwrites.
- Don't commit or push unless asked. `main` deploys to production on Vercel — do feature work on a
  branch (`feat/...`) and let the user merge.
- Long-running AI work must stream (see the agent-builder `/stream` route) rather than rely on Edge
  runtime; the pipeline needs Node (Supabase, chunking, document parsers).
- `~/LUNA_2.worktrees/` holds agent worktrees (e.g. `agents/ui-redesign-template-builder`).
- `Statistics.pdf`, `auxiliary/PDF_JS_Jupyter/`, `auxiliary/pdf-json-extractor/` are intentionally
  untracked local experiments — leave them alone.
