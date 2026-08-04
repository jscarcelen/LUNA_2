# LUNA Platform Scaffold

This repository contains a scalable, modular scaffold for the LUNA platform based on the attached technical architecture and UI demo.

## Current Status

- Done: Monorepo structure (`apps`, `packages`, `modules`, `docs`, `scripts`)
- Done: Initial Next.js website shell with placeholder-only implementation
- Done: Demo-aligned pages (Dashboard, Workspaces, Quiz, Chat, Analytics, Marketplace, Builder, Revenue)
- Done: Interactive workspace management UI (create workspace, create subject, upload TXT documents)
- Done: Subject organization UI (folders + topic tags)
- Done: Subject organization full CRUD (folders + topic tags)
- Done: Workspace and subject full CRUD (rename/delete with cascade safety checks)
- Done: Document table actions (rename, remove, preview modal)
- Done: Mock API persistence for workspace/subject/document workflows
- Done: Supabase backend scaffold (schema, repository queries, API routes)
- Done: Web workspace manager switched to Supabase API route
- Done: Per-folder README documentation for apps and packages
- Not done: Backend, auth, database schema, RAG, LLM providers, render pipeline

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

This first version keeps all AI/business-critical pieces as placeholders:

- No LLM integration
- No rendering engine implementation
- No RAG retrieval implementation
- No real authentication and payments

These are documented as future tasks in `docs/ROADMAP.md`.
