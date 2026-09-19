# Template Studio v3

TypeScript module (the rest of the app is JS). Philosophy: the agent owns content, the template
owns presentation, a mapping layer connects them.

- `engine/types.ts` — canonical model: Template → Layout (class paged | slides, canvas, margins,
  views, pages) → elements with `source: static | field`, `pageScope`, `visibility`; groups own
  `layout` (free | vertical | horizontal | grid), `repeat` (flow | page | grid) and `pagination`.
  Fields have stable ids and editable names; arrays are consumed by repeating groups.
- `engine/layout.ts` — `layoutDocument(template, data, { layoutId, viewId })` → concrete pages
  (+ overflow report, item counts). Flow groups auto-paginate; "every"-scoped elements repeat on
  continuation pages; first/last scopes resolve after pagination; nested repeats are record-major.
- `engine/renderers/` — adapter over the HTML / PDF / DOCX / PPTX renderers; `exportersFor(class)`.
- `engine/mapping.ts` — agent schema tree + `proposeMapping` (name/type similarity) + `applyMapping`.
- `engine/migrate.ts` — v2 docModel and legacy block templates → v3.
- `engine/registry.ts` + `components/` — component registry (add new element types here).
- `state/useTemplateStore.ts` — reducer with undo/redo; UI state is never the model.
- `TemplateStudio.tsx` → `StudioShell` (name · layout · view · Design | Data | Preview | Export)
  → `design/` (AddPanel, PagesPanel, LayersPanel, canvas/, inspector/ tabs Content · Layout ·
  Style · Visibility · Repeat), `data/DataMode` (agent-independent field tree + optional agent
  schema with proposals), `preview/`, `export/`.
- `adapters/agentTemplate.ts` — what gets saved: `templateV3` + `dataFields` /
  `repeatCollectionField = "items"` so `RunAgentPage` keeps working unchanged.

Tests: `apps/web/tests/template-studio/engine.test.ts`. Typecheck: `npm run typecheck`.

## Blocks (pre-made objects)

`engine/blocks.ts` packages a schema fragment with a group of elements bound to it. Built-in blocks live in code; user blocks are saved from a selection ("Save as block") into a local library and can be listed in the Marketplace as design blocks. Elements named `opt:<key>|Label` are controlled by the block's toggles. `{{n}}` in static text renders the item number.
