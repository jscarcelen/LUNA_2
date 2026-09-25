# Prompt to hand this project to another Claude account

> **Superseded by [`../LUNA_HANDOVER.md`](../LUNA_HANDOVER.md)** (2026-09-25), which covers the same
> ground plus platform access, the current architecture, how work is verified and what to do next.
> This file is kept for the short paste-in prompt below.

Copy everything between the lines into the first message of a new Claude Code session (desktop app or CLI) on the new account. Then follow the "Before you paste" list.

## Before you paste

1. On the new account's machine, make sure the repo is present: `git clone https://github.com/jscarcelen/LUNA_2.git ~/LUNA_2` (or pull if it exists). Everything that matters is in the repo — code, docs, the vision document and the project skill.
2. Copy `apps/web/.env.local` from the old machine (it holds `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LUNA_DEMO_USER_ID`). It is git-ignored on purpose.
3. Log in to Vercel once on the new machine: `npx vercel login` (the project `luna2-share-web` is linked through `.vercel/project.json` in the repo).
4. Open the session **in the `~/LUNA_2` folder** so `CLAUDE.md` and `.claude/skills/luna-vision` load automatically.

---

You are continuing work on **LUNA**, an education platform (repo `~/LUNA_2`, GitHub `jscarcelen/LUNA_2`). A previous Claude session built most of it with me; all of its knowledge is in the repository. Do this first, in order, before touching anything:

1. Read `CLAUDE.md`, then `docs/LUNA_VISION.md` (the product vision and the alignment checklist — every change must be checked against it; when I give you new context about the idea, append it there, structured plus my verbatim words, dated), then `.claude/skills/luna-vision/SKILL.md`.
2. Read `docs/IMPLEMENTATION_LOG.md` (what has been built, newest at the bottom), `docs/AGENT_STUDIO_ARCHITECTURE.md`, `docs/TEMPLATE_STUDIO_ARCHITECTURE.md`, and the READMEs in `apps/web/modules/agent-studio`, `apps/web/modules/template-studio`, `apps/web/modules/activities`.
3. Verify the environment: `cd apps/web && npm install && npm run typecheck && npm test && npm run lint`, then start the dev server (`npm run dev` on port 3000) and confirm `POST /api/workspaces-supabase` with `{"action":"listDocumentBlockTemplates"}` returns templates (proves Supabase works) and `POST /api/ai-tools/agent-builder/estimate` works (proves OpenAI works). If `.env.local` is missing, stop and ask me for it.
4. Verify deployment: `npx vercel whoami` and `npx vercel ls luna2-share-web`. Production follows the `main` branch and is the public link **https://luna2-share-web.vercel.app**. The working branch is `feat/agent-run-redesign`; to deploy, run lint/typecheck/tests/`npm run build --workspace @luna/web -- --webpack`, then `git push origin HEAD && git push origin HEAD:main`, wait for `npx vercel ls luna2-share-web` to show the new Production deployment Ready, and check the site. (Running `vercel deploy --prod` directly may be blocked; the git route always works.)

Standing rules you must keep (details in the vision doc):
- Apple-style crisp light UI; no dark mode, no blur/glassmorphism.
- Every AI agent follows one flow: intro → Configure questions → Configure output → Export. Agent Studio is a recipe builder (structured spec, prompts never shown except in Advanced); a hidden "refined brief" metaprompt pass improves the creator's wording.
- Agents own content (JSON), templates own presentation; they are decoupled and sold separately in the marketplace; templates always list their compatible agents.
- Template Studio: Template → Layout → View; Simple (block list) vs Advanced (canvas); blocks/components with design variants; agent-ordered sets ("one of" designs chosen by the agent's output); placement rules; interactive activities are the default for anything answerable (player + attempts in the Activities tab).
- Show me the architecture before major rewrites; implement incrementally; keep tests green; deploy to the public link when I ask to push or deploy.
- Tokens are shown as "lunas" (credit badge, pre-run estimate).

When you have finished the checks, give me a short status: what you verified, what failed, and the last three commits on `main`. Then wait for my next instruction.

---
