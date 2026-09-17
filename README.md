# LUNA Platform Scaffold

This repository contains a scalable, modular scaffold for the LUNA platform based on the attached technical architecture and UI demo.

## Current Status

Last refreshed: 2026-09-13. See `CLAUDE.md` for the working guide and `docs/IMPLEMENTATION_LOG.md` for history.

- Done: Monorepo structure (`apps`, `packages`, `modules`, `docs`, `scripts`) with per-folder READMEs
- Done: Next.js App Router web app (`apps/web`) with Dashboard, Workspaces, Quiz, Chat, Analytics, Marketplace, Builder, Revenue pages
- Done: Workspace / subject / folder (nested) / topic tag / document full CRUD on Supabase (`/api/workspaces-supabase`), with mock route fallback
- Done: Document-processing pipeline (DOCX/PDF/TXT parsing, canonical document model, math normalization, OCR hooks, markdown output)
- Done: RAG — persisted document chunks with pgvector embeddings and heuristic rerank (`modules/ai-tools/pipeline`)
- Done: LLM provider — OpenAI via fetch with local heuristic fallback when no key is configured
- Done: Quiz generator tool; Agent Builder + Run Agent (custom prompt/context/output template, variable mapping, JSON-schema output)
- Done: Template builder / block editor with saved templates; HTML, DOCX, PDF exporters and stored generated exports
- Done: 15 Supabase migrations (`supabase/migrations`), Vercel deployment from repo root
- Not done: Real authentication and role model (teacher / student / **parent**), RLS
- Not done: Student performance tracking and analytics (Analytics page is static)
- Not done: Marketplace transactions / payments (marketplace is UI only)
- Not done: AI tutor and chatbot tools (stubs in the registry), TypeScript migration

## Folder Structure

- `apps/web`: Main user-facing web app (placeholder implementation)
- `apps/admin`: Admin/operations app placeholder
- `packages/ui`: Shared UI components package placeholder
- `packages/shared`: Shared types/constants/utilities placeholder
- `packages/database`: Database abstractions placeholder
- `packages/ai-core`: Pipeline registry and AI orchestration placeholders
- `packages/renderers`: JSON-to-HTML/PDF/interactive renderer placeholders
- `modules/*`: Domain modules mapped to architecture domains
- `docs`: Living documentation and implementation tracking

## Architecture Notes

- The structure mirrors your technical architecture section for `apps`, `packages`, and `modules`.
- The website implementation intentionally uses static placeholder data and client-only interactions.
- Complex AI/runtime systems are deferred by design for this phase.

## Documentation Index

- `docs/IMPLEMENTATION_LOG.md`: Chronological log of work performed
- `docs/TECH_DOC_GAP_ANALYSIS.md`: What matches, what is deferred, and deviations from tech doc
- `docs/ROADMAP.md`: Planned next implementation steps
- `docs/SUPABASE_SETUP.md`: Supabase environment, migration, and API setup steps

## CI

- GitHub Actions workflow: `.github/workflows/ci.yml`
- Runs on every push and pull request
- Enforces Node runtime from `.nvmrc`, then runs:
   - `npm ci`
   - `npm run build`
- Includes a second quality job that runs:
   - `npm run lint`
   - Typecheck step (auto-enables after TypeScript migration when tsconfig files and a typecheck script are present)

## Vercel Pitfall Log

- Incident: Vercel build/runtime failed in `apps/web/components/views.js` after adding LaTeX/help text in JSX.
- Error signatures seen:
   - `Error: x Expected unicode escape`
   - `ReferenceError: text is not defined`
- Root causes:
   - Raw LaTeX/help snippets with braces/backslashes were inserted directly in JSX.
   - Placeholder text like `{{text}}` was written directly in JSX, which React parsed as an expression.
- Prevention rules (mandatory):
   - For code/help examples containing braces or backslashes, render as a JSX string literal: `<code>{"$\\sum_{i=1}^n i$"}</code>`.
   - Never place raw `{{...}}` directly in JSX text. Wrap it as a string literal, for example `{" {{text}} "}`.
   - After editing JSX-heavy content, run local diagnostics before push.

## Quick Start

### Prerequisites

- Node.js `24.15.0` (see `.nvmrc`)
- npm (bundled with Node)

Use nvm to match the project runtime:

1. `nvm install`
2. `nvm use`

1. Install dependencies:
   - `npm install`
2. Start web app:
   - `npm run dev:web`
3. Start admin app:
   - `npm run dev:admin`

## What Is Included in the Web App

- Role switching (`student`, `teacher`) with role-aware navigation
- Demo-inspired sections:
   - Dashboard
   - Workspaces
   - Quiz Engine (placeholder interactions)
   - Tutor Chat (placeholder conversation)
   - Learning Analytics
   - Agent Marketplace
   - Agent Builder
   - Creator Revenue
- Responsive layout and reusable component structure
- Workspace management flow in placeholder mode:
   - Create workspace
   - Create subjects inside selected workspace
   - Rename and delete workspaces (force confirmation when cascading data exists)
   - Rename and delete subjects (force confirmation when cascading data exists)
   - Create, edit, and delete folders under subjects
   - Create, edit, and delete topic tags under subjects
   - Upload TXT files with folder/tag assignment
   - Document actions: rename, remove, preview modal
   - Persist changes through mock API routes (`/api/workspaces`)

## Supabase Backend (New)

- SQL schema migration at `supabase/migrations/202608040001_init_luna.sql`
- Folder hierarchy migration at `supabase/migrations/202608040002_add_folder_hierarchy.sql`
- Database package with Supabase repository queries in `packages/database/src`
- Health route: `/api/supabase/health`
- Backend route: `/api/workspaces-supabase`

### Workspace Flow Status

- Implemented and validated with Supabase route:
   - workspaces, subjects, folders, tags, txt upload, txt preview
- Subfolders require migration `202608040002_add_folder_hierarchy.sql` to be applied in Supabase.

## Scope Boundaries (Intentional)

Still deferred in the current version:

- No real authentication or payments (ownership uses a demo user id)
- No parent role or student performance analytics
- No row-level security on Supabase tables

These are documented as future tasks in `docs/ROADMAP.md`.
