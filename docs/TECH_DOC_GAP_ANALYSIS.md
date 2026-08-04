# Tech Documentation Gap Analysis

This file tracks alignment against the attached LUNA technical documentation.

## Implemented Now

- Monorepo structure (`apps`, `packages`, `modules`)
- Domain-aligned module directories
- Web app scaffold with demo-aligned placeholder pages
- Role-aware navigation and page switching
- App/package/module README documentation coverage
- Documentation process and progress tracking

## Intentionally Deferred (by request)

- AI Pipeline Registry runtime
- RAG ingestion/retrieval
- LLM connections
- JSON schema validation engine
- Rendering machine (PDF/HTML/interactive)
- Event bus and async job system
- Auth, billing, notifications backends

## Differences from Tech Doc in This Iteration

- This iteration focuses on UI + structure only.
- No persistence/database layer is implemented yet.
- No production infrastructure (Supabase/Stripe/Vercel) is wired yet.
- JavaScript-only initial scaffold was used for speed; tech doc target remains TypeScript.
- Current UI is intentionally single-app client-side placeholder logic rather than module-driven backend flows.

## Risks of Current State

- UI is non-functional without backend integrations.
- Placeholder data may diverge from real schema if not formalized soon.

## Mitigation

- Add shared TypeScript schemas in `packages/shared` before backend work.
- Implement `packages/ai-core` interfaces first, then concrete providers.
- Introduce API contracts and mock service adapters before wiring real infrastructure.
