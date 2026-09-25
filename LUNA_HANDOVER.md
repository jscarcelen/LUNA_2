# LUNA — handover to a new Claude account

Everything a fresh Claude (or a fresh human) needs to take over this project, get access to GitHub,
Vercel, Supabase and OpenAI, load the full context, and keep improving the site that is live at
**https://luna2-share-web.vercel.app**.

**No secret is written in this file.** Where a key is needed it is named, and it says where to get
it. Copy the values yourself, out of band.

Last updated 2026-09-25, at commit `e7bc589` on `main`.

---

## 1. What LUNA is, in one paragraph

LUNA is an education platform. Teachers, students and parents upload their own material; AI agents
turn it into study resources (exams, flashcards, summaries, activities); Template Studio designs how
those resources look on paper and on screen; study plans schedule the work and generate it; the
performance layer measures what was actually learned; and a marketplace sells agents, templates,
components, resources, whole study plans and performance dashboards. The product vision — profiles,
archetypes, subscription and credit model ("lunas"), agent principles — lives in
`docs/LUNA_VISION.md` and is the source of truth. Every change is checked against its alignment
checklist.

---

## 2. Access you need to transfer

| Platform | What it is | How the new account gets in |
|---|---|---|
| **GitHub** | `https://github.com/jscarcelen/LUNA_2` — the whole project, including docs and the project skill. | Add the new account as a collaborator (Settings → Collaborators), or transfer the repo. Nothing else is needed; there is no private package registry. |
| **Vercel** | Project `luna2-share-web`, team scope `jonathans-projects-396234a2`. Production follows the `main` branch and serves the public link. | Invite the new account to the Vercel team, then on the new machine run `npx vercel login` and `npx vercel link` (choose the existing project). `.vercel/` is git-ignored, so it is re-created locally. |
| **Supabase** | Project **"Luna"**, ref `fekeupkjljbgimntxpnv` — workspaces, subjects, folders, documents, chunks/embeddings, block templates. 15 migrations in `supabase/migrations/`. | Invite the new account to the Supabase organisation, or hand over the project. Keys are copied from Project settings → API. |
| **OpenAI** | Every AI feature calls the OpenAI REST API directly (no SDK). | Create a key on the new account's OpenAI project, or reuse the existing one. It goes in `OPENAI_API_KEY`. |

### Secrets to move across (names only)

Local development reads `apps/web/.env.local` (git-ignored). The same variables are already set on
the Vercel project; if the Vercel project is recreated they must be set again there.

Required:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — server-side only, never sent to the browser
- `SUPABASE_ANON_KEY`
- `LUNA_DEMO_USER_ID` — a UUID; every row is owned by it until real auth exists
- `OPENAI_API_KEY`

Optional (all have defaults or fallbacks):

- `LUNA_QUIZ_MODEL`, `LUNA_AGENT_MODEL`, `LUNA_EMBEDDING_MODEL`, `LUNA_CONCEPT_MODEL`, `LUNA_COACH_MODEL`
- `MATH_OCR_ENDPOINT`, `MATH_OCR_APP_ID`, `MATH_OCR_APP_KEY`, `OCR_LANGUAGES`, `OCR_MIN_CONFIDENCE`, `EXTRACTION_MIN_CONFIDENCE`

---

## 3. Machine setup (15 minutes)

```bash
git clone https://github.com/jscarcelen/LUNA_2.git ~/LUNA_2
cd ~/LUNA_2
nvm use            # Node 24.15.0 — see .nvmrc
npm install
```

Then create `apps/web/.env.local` with the variables above, and:

```bash
npx vercel login && npx vercel link     # pick luna2-share-web in jonathans-projects-396234a2
```

Sanity checks, all from the repo root:

```bash
npm run lint                                      # must be 0 errors (warnings are expected)
npx tsc --noEmit -p apps/web/tsconfig.json        # typecheck (TS lives under modules/*-studio, activities/engine)
npx vitest run apps/web/tests                     # 127 tests, all green
npm run build --workspace @luna/web -- --webpack  # exactly what Vercel runs
npm run dev:web                                   # http://localhost:3000
```

Two live checks that prove the credentials work:

- `POST http://localhost:3000/api/workspaces-supabase` with `{"action":"listDocumentBlockTemplates"}` → returns rows (Supabase is reachable).
- Open the app, go to **Performance → "Read my results"** → returns a diagnosis (OpenAI is reachable).

Optional but useful: connect the **Supabase** and **Vercel** MCP connectors in the new Claude
account. They are not required — the CLI and the SQL editor cover everything — but they make
migrations and deployment checks one call instead of several.

---

## 4. The first message to paste into the new Claude session

Open the session **in the `~/LUNA_2` folder** so `CLAUDE.md` and `.claude/skills/luna-vision` load
automatically, then paste:

> You are taking over **LUNA**, an education platform (repo `~/LUNA_2`, GitHub `jscarcelen/LUNA_2`,
> live at https://luna2-share-web.vercel.app). Everything the previous sessions knew is in the
> repository. Before touching anything:
>
> 1. Read `LUNA_HANDOVER.md`, `CLAUDE.md`, then `docs/LUNA_VISION.md` (the product vision and its
>    alignment checklist — every change is checked against it, and whenever I tell you something new
>    about the idea you append it there, structured plus my verbatim words, dated), then
>    `.claude/skills/luna-vision/SKILL.md`.
> 2. Read `docs/IMPLEMENTATION_LOG.md` from the top (newest first) — at least the last five entries —
>    plus `docs/TEMPLATE_STUDIO_ARCHITECTURE.md` and `docs/AGENT_STUDIO_ARCHITECTURE.md`.
> 3. Verify the environment exactly as §3 of the handover says (lint, typecheck, tests, build, dev
>    server, the two live checks). If `apps/web/.env.local` is missing, stop and ask me for it.
> 4. Verify deployment access: `npx vercel whoami` and `npx vercel ls luna2-share-web`.
>
> Then give me a short status: what you verified, what failed, the last three commits on `main`, and
> what you understand the current priorities to be. Wait for my instruction before changing code.

---

## 5. Standing rules the previous sessions worked under

These came from me over many sessions. They are not preferences to re-litigate; they are how the
product works. The long form is in `docs/LUNA_VISION.md` (§5.1a–§5.1n).

**Design**
- Apple-like: crisp, light, solid white surfaces, hairlines, pill buttons, 12–18px radii, 180ms
  easing. **No dark mode, no blur, no glassmorphism** — both were tried and rejected.
- No AI jargon anywhere in the interface. Users never see "prompt", "token" (it is "lunas") or JSON
  unless they open an Advanced panel.
- Nothing may spill out of its box, at any width. iPhone and iPad are first-class, not a squeezed
  desktop layout.

**Agents**
- Every agent — built-in, user-made or bought — runs through one flow: intro ("what it does / how it
  works") → **Configure questions** → **Configure output** → **Export**. No bespoke wizards.
- The Agent Studio is a **recipe builder**, not a prompt builder: `AgentSpec` (purpose, inputs,
  context slots, output schema, examples, validation, model config) is canonical; the prompt and the
  JSON Schema are compiled from it; feedback patches the spec, never the sample output.
- Agents own **content** (JSON). Templates own **presentation**. They are decoupled, mapped by field
  name, and sold separately.
- Never bake a user's material into an agent — that is what context slots are for.

**Templates**
- Template → Layout → View. Elements carry `source: static | field`; groups own repetition
  (flow / page / grid) and nest; page scope is separate from repetition; one layout engine feeds
  HTML, PDF, DOCX and PPTX.
- Templates are **assembled from components** (`engine/blocks.ts`), and the components all follow one
  design language (`engine/design.ts`). The template-generating agent must reuse catalogue components
  and says which it used.

**Performance**
- Mastery ≠ accuracy: recency, difficulty, coverage, retention and decay all count.
- The tracked targets are the user's **study plans** — a plan is the subject, its goals are the
  topics. Luna invents no second taxonomy.
- Errors are classified (conceptual, procedural, calculation, misread, application, gap, careless,
  incomplete), and the learner's stated confidence feeds that classification.
- The dashboard starts from a curated default per profile and is arranged by the reader; views are
  saved, switchable as tabs, and sellable.
- No leaderboards. Never push "do more" ahead of "learn more".

**Process**
- Show the architecture and the file changes before a major rewrite; implement incrementally.
- Deploy to the public link whenever I ask to push or deploy (see §7) — preview URLs are
  login-protected and useless to the friends I share this with.
- Keep `docs/IMPLEMENTATION_LOG.md` and `docs/LUNA_VISION.md` up to date in the same commit as the work.

---

## 6. Where everything is

Monorepo with npm workspaces; **only `apps/web` (`@luna/web`) is real**. Plain JS/JSX except
TypeScript under `modules/template-studio/**`, `modules/agent-studio/**` and
`modules/activities/engine/**`.

```
apps/web/
  app/                      Next.js App Router
    api/ai-tools/…          quiz + agent-builder (+ /stream, NDJSON progress)
    api/templates/…         template-chat (whole-document generator), component-chat, render-preview
    api/performance/coach   the agent that reads mistakes and returns actions
    api/plans/generate      builds a study plan from material + deadline + performance
    api/resources/concepts  what a resource teaches
    api/workspaces-supabase the action-router for all workspace CRUD
    globals.css             design tokens, legacy CSS, nav rail, phone/iPad rules, UI-critic styles
  components/               AppShell, SideNav, TopBar, data.js (per-role nav), views.js (legacy, edit surgically)
  modules/
    template-studio/        TS. engine/{design,blocks,layout,resolve,critique,assemble,starters,latex,fit}.ts,
                            renderers/{html,pdf,docx,pptx}, design/ (editor UI), preview/
    agent-studio/           TS. AgentSpec, prompt compiler, schema generation
    ai-tools/               registry + tools/<id>/ (agent-builder RunAgentPage is THE agent flow),
                            pipeline/ (chunking, retrieval, providers, agentBuilder), render/
    activities/             interactive player + engine/activity.ts (grading, confidence)
    workspace/              folder model + WorkspaceBrowser (one screen for material and generated work)
    resources/              resource model, detail panel, concepts
    plans/                  plan model, calendar, generation, execution, folder filing
    performance/            mastery.js, errors.js, targets.js, views.js, dashboard/ (registry, panels, coach)
    marketplace/            six shelves, stores, reviews, downloads
    ui/                     FolderTree, DocumentBrowser, RowMenu, PhoneCollapse, critique.js, UiCritic.js
  tests/                    vitest — agent-studio/, template-studio/, document-processing/
supabase/migrations/        15 SQL files, YYYYMMDDNNNN_description.sql
docs/                       LUNA_VISION.md, IMPLEMENTATION_LOG.md, ROADMAP.md, the two architecture docs,
                            SUPABASE_SETUP.md, VERCEL_DO_NOT_DO.md
.claude/skills/luna-vision/ the project skill: read the vision, run the checklist, append new context
.claude/launch.json         dev server definition for the in-app browser preview
```

---

## 7. Deploying to the public link

Production is built **only from `main`**; a push to a feature branch produces a preview that is
login-protected and cannot be opened by other people. So "deploy" always means: fast-forward `main`.

```bash
# 1. gates
npm run lint                                      # 0 errors
npx tsc --noEmit -p apps/web/tsconfig.json
npx vitest run apps/web/tests                     # all green
npm run build --workspace @luna/web -- --webpack

# 2. ship
git push origin HEAD && git push origin HEAD:main

# 3. confirm
npx vercel ls luna2-share-web                     # wait for the Production row to say Ready
# then open https://luna2-share-web.vercel.app and check the change is really there
```

`npx vercel deploy --prod` may be refused by the desktop app's permission classifier; the git route
always works. Deploy from the **repo root** only — never from `apps/web` (see
`docs/VERCEL_DO_NOT_DO.md`).

---

## 8. How work is verified (do not skip this)

- **The interface critic** — `modules/ui/critique.js` + `UiCritic.js`. It reads the rendered DOM and
  reports text out of its box, overlapping controls, sideways page scroll, tap targets too small,
  unreadable contrast and unlabelled controls. It runs automatically in development and in
  production with `?uicheck=1`; `window.lunaAuditUI()` returns the report from the console or from a
  browser-driving tool. **A change that adds an issue is not finished.** Check at 390px (iPhone),
  834px (iPad) and 1280–1440px (desktop).
- **The design critic** — `template-studio/engine/critique.ts`. It reads laid-out documents and
  separates faults (overlap, off-page, unreadable type, low contrast) from suggestions (no card,
  misaligned). `faultsOf()` must be empty for every built-in component; the test
  `tests/template-studio/components.test.ts` enforces it.
- **The browser** — drive the dev server in the in-app browser pane (`preview_start` with the
  `luna-web` config in `.claude/launch.json`), take screenshots, and read the page. Never ask the
  user to check something manually that you can check yourself.
- **Real data** — the Supabase workspace has real documents, plans and attempts. Features were
  verified against them, not against fixtures.

---

## 9. What exists, and what does not

**Exists and works**: workspaces/subjects/folders/documents on Supabase; DOCX/PDF processing with a
canonical model, OCR hooks and a review centre; RAG (chunking + pgvector); agents (built-in and
user-made) with a live preview and streaming; Agent Studio (recipe model); Template Studio v3 with a
component library, whole-template generation from a description, a design critic and HTML/PDF/DOCX/
PPTX export; interactive activities with grading, timing and a confidence check; study plans that
generate, file and schedule their own material; a resources/activities/review workflow inside one
workspace screen; the performance layer (mastery, error taxonomy, coach agent, arrangeable
dashboards per role); a six-shelf marketplace; the interface critic.

**Does not exist yet**: real authentication (everything is owned by `LUNA_DEMO_USER_ID`; the
student/teacher/parent switch is client state), row-level security, payments (the marketplace is
localStorage), multi-user sharing and friends, mobile apps, and the Duolingo-style reminder system.
Those are the next serious pieces of work, roughly in that order.

**Known noise, not regressions**: `npx vitest run` from the repo root also picks up
`auxiliary/pdf-json-extractor/tests/*` which are `node:test` files and fail to collect — run
`npx vitest run apps/web/tests` instead. Lint reports ~132 warnings (mostly the ESLint config not
seeing JSX usage); 0 errors is the bar. `apps/web/tsconfig.tsbuildinfo` shows up as modified; it is
committed noise, ignore it.

---

## 10. Recent work, newest first

The full record is `docs/IMPLEMENTATION_LOG.md`. The last four sessions, in one line each:

1. **`e7bc589` one design language for the components, and a confidence check** — `engine/design.ts`
   (palettes, type scale, spacing, card/badge/option/answer-band builders); every component rebuilt
   on it; lettered A/B/C options via a new `{{A}}` token; cards fit what they show, so hiding the
   answer closes the gap; sections taller than a page split across pages; the template agent matches
   sections to catalogue components and reports which it used; question cards can ask "How sure are
   you?", the activity player records it, and the error taxonomy uses it.
2. **`5e0f5dc` an interface critic, and a performance tab the reader arranges** — the UI critic and
   every overflow/contrast/tap-target fix it found; iPad and iPhone rules; study plans as the tracked
   targets; the coach agent; panel registry, saved views, dynamic filters, dashboards on the
   marketplace.
3. **`3594896` one learning intelligence layer, three dashboards** — mastery model, error taxonomy,
   student/parent/teacher dashboards.
4. **`937d4f5` plans file their work; activities by plan; five marketplaces** — plan folders with
   linked (not duplicated) material, activities sourced by plans, seller stores with reviews.

---

## 11. Suggested next steps

1. **Accounts and roles for real** — Supabase Auth, ownership per user, RLS on every table, and
   retire `LUNA_DEMO_USER_ID`. Everything else is blocked behind this for a real launch.
2. **Sharing** — a learner shares a resource or a plan with a friend or a class; teacher assigns to a
   group. The data model already carries owners and tags.
3. **Payments in the marketplace** — listings move from localStorage to Supabase, then Stripe.
4. **Reminders** — the Duolingo-style nudge loop in the vision doc, driven by the plan calendar.
5. **Keep the critics honest** — when a new component or screen is added, add it to
   `tests/template-studio/components.test.ts` and run the UI critic at the three widths.

---

## 12. If something looks wrong

- The site is live but a change is missing → check `npx vercel ls luna2-share-web`: the newest
  **Production** row must be Ready and newer than your push; if only a Preview row moved, `main` was
  not fast-forwarded.
- Supabase calls fail locally → `SUPABASE_SERVICE_ROLE_KEY` missing or wrong; the app has no browser
  client, so everything goes through server routes.
- AI features return "No model configured" → `OPENAI_API_KEY` is missing in that environment (local
  `.env.local` **and** the Vercel project need it).
- A template renders empty → the agent's output field names must match the template's fields; open
  the template's **Data** tab, which shows the structure and the auto-mapping.
- Anything about the product's intent → `docs/LUNA_VISION.md` first, and ask me rather than guessing.
