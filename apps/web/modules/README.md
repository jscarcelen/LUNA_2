# Modules Structure

This folder organizes app features by user-facing section and shared capabilities.

## Navigation modules
- workspace
- dashboard
- ai-tools
- agent-marketplace

## AI tools module layout
- pipeline: shared orchestration for scope -> chunk -> retrieve -> generate
- render/templates: output templates that format stable JSON contracts
- tools/<tool-id>: one folder per tool

The AI tools hub reads from `ai-tools/registry.js`.
To add a new tool now:
1. Create `tools/<new-tool>/index.js` with a tool manifest and page component.
2. Register it in `ai-tools/registry.js`.
3. Reuse the pipeline stages and change only config, provider prompt/schema, and renderer.

## Core logistics placeholders
- core/auth
- core/notifications
- core/users

## Phase 1 shared contracts bridge
- Root shared contracts live in `/modules/*` (domain/runtime layer).
- Web adapters re-export these from `core/shared-contracts.js`.
- Keep pages and UI composition in `apps/web/modules/*`.

## Phase 3 shared tree/filter utilities
- Folder tree flattening/path mapping moved to root workspace helpers.
- Document filter predicates and folder grouping helpers moved to root workspace helpers.
- Route and page/component boundaries remain unchanged.
