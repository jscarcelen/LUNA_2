# Template Studio v3 — architecture proposal

Status: **proposal, awaiting approval** (2026-09-18). Nothing below is implemented yet.

Philosophy: *the agent owns content, the template owns presentation, a mapping layer connects them.*
The differentiator is visual layout + nested groups + dynamic repetition + schema mapping +
multi-renderer output — not the drawing canvas.

## 1. What exists today (inspection)

| Piece | File | Verdict |
| --- | --- | --- |
| Document model v2 (pages → background / elements, groups with `repeat.source`, page repeat) | `apps/web/modules/ai-tools/render/docModel.js` (366 lines) | **Evolve** into v3 engine: keep the flow/pagination algorithm, page-repeat, sample data, text metrics; replace the element shape. |
| Renderers HTML / PDF (pdf-lib) / DOCX / PPTX (pptxgenjs) | `render/docRenderers.js` (211) | **Keep** — they only consume laid-out pages. Add PNG later behind the same interface; gate by layout class. |
| Editor (chooser, canvas, inspector, data, export) | `tools/template-builder/TemplateStudioPage.js` (958, one file) | **Replace** with modular components. Reuse: pdf.js page rasterising, drag/resize maths, group-bounds maths, align maths. |
| Legacy block builder | `tools/template-builder/TemplateBuilderPage.js` (2,781) | **Keep behind "Advanced"** for one more release; legacy + v2 templates go through a migration adapter. |
| Agent integration | `tools/agent-builder/RunAgentPage.js`, `LivePreviewPane.js` | **Keep contract**: `dataFields` + `repeatCollectionField = "items"` + `/api/templates/render-preview`. v3 adds a schema-level mapping, exposed through the same props. |
| Persistence | `lib/workspacesRepository.js` (`document_block_templates.block_classes.__luna_meta`) | **Keep**; store `templateV3` next to `docModel`/`studio`. |
| Render route | `app/api/templates/render-preview/route.js` | **Keep**; branch on `template.templateV3` → v3 engine, `docModel` → v2, else legacy. |

Current weaknesses the spec addresses: elements have separate `text`/`field` types (no content
source); groups can't nest repeats; no views; no page scope; "list/choices" are field displays
rather than an array repeated by a group; fields are referenced by name; editor is one 958-line
file; the Add menu exposes implementation primitives.

## 2. TypeScript data model (`apps/web/modules/template-studio/engine/types.ts`)

TypeScript is introduced **only for `modules/template-studio/**`**. Next.js handles a TS/JS mix
(it generates `tsconfig.json` with `allowJs`); the CI typecheck step already activates when a
`typecheck` script exists. Rest of the app stays JavaScript.

```ts
export type ID = string;

// ---------- fields (schema the template expects; agent-independent)
export type LeafFieldType = "text" | "rich_text" | "number" | "boolean" | "image" | "formula";
export type StructFieldType = "object" | "array";
export interface FieldDef {
  id: ID;                       // stable, e.g. "fld_7H2"; never shown to users
  name: string;                 // editable display name, e.g. "Question Text"
  type: LeafFieldType | StructFieldType;
  description?: string;
  children?: FieldDef[];        // object: members; array: exactly one child = item shape
  required?: boolean;
}

// ---------- template
export interface Template {
  id: ID;
  version: 3;
  name: string;
  fields: FieldDef[];           // root schema (a tree). Groups bind to array fields.
  layouts: Layout[];
  createdAt: string;
  updatedAt: string;
}

export type LayoutClass = "paged" | "slides";          // "web" later
export type ExportFormat = "pdf" | "docx" | "html_print" | "png" | "pptx" | "html_slideshow";
export const EXPORTS_BY_CLASS: Record<LayoutClass, ExportFormat[]> = {
  paged:  ["pdf", "docx", "html_print", "png"],
  slides: ["pptx", "pdf", "html_slideshow", "png"],
};

export interface Layout {
  id: ID;
  name: string;                 // "Document", "Presentation"
  class: LayoutClass;
  canvas: { width: number; height: number; unit: "mm" };
  margins: { top: number; right: number; bottom: number; left: number };
  views: View[];                // at least one ("Default")
  pages: Page[];
}

export interface View {
  id: ID;
  name: string;                 // "Student Exam", "Answer Key"
  overrides: Record<ID, ElementOverride>;   // by element id; inheritance by default
  pages?: Page[];               // only when detached ("fully independent view")
}
export interface ElementOverride { hidden?: boolean; style?: Partial<Style>; source?: ContentSource }

export interface Page {
  id: ID;
  background: Background;
  elements: Element[];
}
export type Background =
  | { type: "none" }
  | { type: "color"; value: string }
  | { type: "gradient"; from: string; to: string; angle: number }
  | { type: "image"; src: string; locked: boolean; visible: boolean; opacity: number }
  | { type: "pdf"; src: string; sourcePage: number; locked: boolean; visible: boolean; opacity: number };

// ---------- elements: one base, three independent dimensions
export interface Frame { x: number; y: number; w: number; h: number }   // mm; relative to parent group
export type PageScope =
  | { mode: "page" }            // the page it lives on
  | { mode: "first" } | { mode: "last" } | { mode: "every" }
  | { mode: "selected"; pageIds: ID[] };
export interface Visibility { views?: ID[] }   // undefined = all views

export interface ElementBase {
  id: ID;
  type: string;                 // registry key
  name?: string;                // layer name
  frame: Frame;
  style: Style;
  pageScope: PageScope;
  visibility: Visibility;
  locked?: boolean;
}
export interface Style {        // presentation only — never comes from the agent
  fontFamily?: "sans" | "serif" | "mono"; fontSize?: number; fontWeight?: "normal" | "bold";
  color?: string; align?: "left" | "center" | "right"; lineHeight?: number;
  fill?: string; stroke?: string; strokeWidth?: number; radius?: number; opacity?: number;
}
export type ContentSource =
  | { type: "static"; value: string }
  | { type: "field"; fieldId: ID };        // resolved against the nearest repeating scope

export interface TextElement  extends ElementBase { type: "text";  source: ContentSource; format: "plain" | "rich" }
export interface ImageElement extends ElementBase { type: "image"; source: ContentSource }
export interface ShapeElement extends ElementBase { type: "rect" | "ellipse" | "line" | "arrow" }
export interface TableElement extends ElementBase { type: "table"; columns: { header: string; source: ContentSource }[]; rowsFieldId?: ID }

export interface GroupElement extends ElementBase {
  type: "group";
  layout: { mode: "free" | "vertical" | "horizontal" | "grid"; gap: number; columns?: number };
  repeat: RepeatRule | null;
  pagination: { breakBefore: boolean; breakAfter: boolean; keepTogether: boolean; allowSplit: boolean;
                maxItemsPerPage?: number; overflow: "continue" | "shrink" | "clip" };
  children: Element[];
}
export interface RepeatRule {
  fieldId: ID;                  // must be an array field; nested arrays resolve relative to parent scope
  mode: "flow" | "page" | "grid";
  columns?: number;
}
export type Element = TextElement | ImageElement | ShapeElement | TableElement | GroupElement;

// ---------- mapping (Data mode). Lives with the run, not inside the template.
export interface SchemaMapping { [templateFieldId: ID]: string }   // fieldId → agent JSON path, e.g. "items[].question"
```

Notes
- `field` is not an element type; **AI Field** in the Add menu creates a `text` (or `image`)
  element with `source.type = "field"`. Same renderer, style and frame as static text.
- A group's `repeat.fieldId` points at an array field. Children bind to that array's item fields,
  so `Options group` inside `Question group` binds to `questions[].options[]` naturally.
- Views are override maps; the layout engine resolves `element ⊕ view.overrides[id]` before layout.
- `pageScope` is evaluated after pagination (an "every page" footer is stamped onto continuation
  pages; "first"/"last" resolve against the produced pages).

## 3. Engine (`modules/template-studio/engine/`)

| File | Responsibility | From v2 |
| --- | --- | --- |
| `types.ts` | the model above | new |
| `model.ts` | `createTemplate`, `createLayout`, `createView`, element factories, id generation, field tree helpers (`findField`, `arrayItemFields`, `schemaFromAgentFields`) | partly `docModel.js` |
| `migrate.ts` | v2 `docModel` → v3; legacy block templates → v3 (fields into a vertical flow group); v3 → v3 upgrades | new (replaces `openSaved` import) |
| `resolve.ts` | apply view overrides; evaluate visibility; resolve `ContentSource` against a scope stack; Markdown+LaTeX → runs for rich text | new |
| `layout.ts` | `layoutDocument(template, layoutId, viewId, data) → LaidOutPage[]`: free frames, vertical/horizontal/grid stacks with content-driven height, nested repeats, pagination rules, page scopes, overflow report | evolves `docModel.js` |
| `sample.ts` | sample data from the field tree; `mergeAgentOutput(data)` | evolves `buildSampleData` |
| `mapping.ts` | schema tree from agent fields; `proposeMapping(templateFields, agentSchema)` (name + type similarity, with scores); apply mapping to real output | new |
| `renderers/{html,pdf,docx,pptx}.ts` + `index.ts` | consume `LaidOutPage[]`; `exportersFor(layoutClass)` | wraps `docRenderers.js` (kept) |
| `registry.ts` | `ComponentDef { type, label, icon, group, defaults(), Inspector, CanvasView, measure?, migrate? }` and `registerComponent()` | new |

Layout algorithm (the part that matters): a page is laid out as free elements + flow groups.
A flow group with `repeat` iterates the bound array; each item lays out its children (vertical
stack = children re-stacked by content height; nested repeating groups expand and push
siblings); items are placed one after another; when an item would cross the bottom margin the
engine applies `pagination` (keep together → move whole item; allow split → not in milestone 1)
and opens a continuation page carrying background + `every`/matching page-scope elements. `page`
mode emits one page per item; `grid` fills columns then wraps. The engine returns
`{ pages, overflows: [{ elementId, pageIndex }] }` so the editor can warn immediately.

## 4. React component hierarchy (`modules/template-studio/`)

```
TemplateStudio.tsx                     entry (registered in ai-tools registry as "template-builder")
├─ state/useTemplateStore.ts           reducer + undo/redo, selection, activeLayout/View/Page, mode
├─ StudioShell.tsx                     top bar: name · Layout switcher · View switcher · Design|Data|Preview|Export · Save
├─ SourceChooser.tsx                   blank / PDF / image / starters / saved  (reuses pdfToPages)
├─ design/
│   ├─ DesignMode.tsx                  3 columns
│   ├─ AddPanel.tsx                    Text · Image · Shape · Line · Table · AI Field · Group
│   ├─ PagesPanel.tsx                  thumbnails, add/remove/reorder
│   ├─ LayersPanel.tsx                 tree with lock/visibility (background locked)
│   ├─ canvas/Canvas.tsx               scale-to-fit, margin guides, background dimming
│   ├─ canvas/ElementView.tsx          dispatches to registry CanvasView; flow groups show stacked ghost items
│   ├─ canvas/SelectionOverlay.tsx     handles, marquee, snapping
│   ├─ canvas/FloatingToolbar.tsx      Group · Align · Duplicate · Delete (multi-select)
│   └─ inspector/Inspector.tsx         tabs Content | Layout | Style | Visibility | Repeat, contextual
│       ├─ ContentTab.tsx              static text / field picker (from template fields) / rich text toggle
│       ├─ LayoutTab.tsx               frame, group layout mode, gap, columns, page scope, align tools
│       ├─ StyleTab.tsx                per registry inspector schema
│       ├─ VisibilityTab.tsx           per-view toggles (writes view overrides)
│       └─ RepeatTab.tsx               Don't repeat / Repeat items / One per page / Grid + Advanced
├─ data/DataMode.tsx                   TemplateStructureTree ↔ AgentSchemaTree, MappingRow with proposals
├─ preview/PreviewMode.tsx             sample vs agent output, layout/view switch, page & item counts, overflow banner
├─ export/ExportMode.tsx               exporters compatible with the active layout class
├─ components/                         registry entries: text, image, rect, ellipse, line, arrow, table, group
└─ adapters/agentTemplate.ts           compile v3 → { dataFields, repeatCollectionField, schema } for RunAgentPage
```

Outside the studio only two files change: `render-preview/route.js` (branch on `templateV3`,
accept `layoutId`/`viewId`) and `LivePreviewPane.js` (layout/view pickers when a v3 template
is selected, exporters by class).

## 5. Milestone plan (incremental, each shippable)

**M1 — model + engine + minimal editor** (target of the first PR)
- `types.ts`, `model.ts`, `migrate.ts`, `resolve.ts`, `layout.ts` (free + vertical flow + nested
  repeat + page repeat + continuation pages), `sample.ts`, `mapping.ts`, renderers wrapper, registry.
- Create/open template; Document and Presentation layouts; views with visibility overrides;
  page background (none/colour/image/PDF, locked, dim); add/move/resize text, image, shapes;
  AI Field; multi-select → Group → repeat from a sample array; vertical flow groups; Data mode
  with auto-proposed mapping; sample preview with page/item counts and overflow warning;
  JSON serialise/deserialise; migration of v2/legacy templates; agents keep working.
- Unit tests for `layout.ts`, `migrate.ts`, `mapping.ts` (vitest).

**M2** — horizontal/grid layouts, page scopes on canvas (first/last/every), rich text
(Markdown + LaTeX) rendering in HTML/PDF, table element, PNG export, real agent-output preview
in the studio, undo/redo polish, snapping.

**M3** — detached views, keep-together/split rules, component marketplace hooks (registry
serialisation), "Detect fields from PDF".

## 6. File changes (M1)

New
- `apps/web/modules/template-studio/**` (≈ 25 files listed above)
- `apps/web/tsconfig.json` (generated by Next; `allowJs: true`, `strict: true` for the module)
- `apps/web/tests/template-studio/{layout,migrate,mapping}.test.ts`
- `package.json`: `typecheck` script (`tsc --noEmit`), devDeps `typescript`, `@types/react`

Modified
- `modules/ai-tools/tools/template-builder/index.js` → points at `TemplateStudio`
- `app/api/templates/render-preview/route.js` → v3 branch (+ `layoutId`, `viewId`, `format` gate)
- `modules/ai-tools/tools/agent-builder/LivePreviewPane.js` → layout/view selectors, exporters by class
- `lib/workspacesRepository.js` → persist `templateV3` in template meta
- `modules/ai-tools/render/docRenderers.js` → accept the v3 laid-out page shape (small)

Removed (after M1 ships and is verified)
- `modules/ai-tools/tools/template-builder/TemplateStudioPage.js` (v2 editor)
- `modules/ai-tools/render/docModel.js` (superseded; its algorithm lives in `layout.ts`)

Unchanged
- Everything outside Template Studio: navigation, design language, agents' 3-step flow,
  marketplace, dashboards, Supabase schema (the template row shape is untouched).

## 7. Decisions I'd like confirmed

1. **TypeScript for the new module only** (rest of the app stays JS). Alternative: JSDoc typedefs — weaker guarantees, no new tooling.
2. **Mapping lives with the run/agent preset, not inside the template** (templates bind to a schema; a stored mapping would tie them to one agent). The Data tab edits the mapping for the currently chosen agent and saves it as that agent's preset — same place today's `outputMapping` lives.
3. **Rich text = Markdown + LaTeX**, rendered with KaTeX in HTML and as plain fallback in PDF/DOCX/PPTX in M1 (true LaTeX typesetting in PDF is M2).
4. **Legacy block builder** stays reachable under "Advanced" until M2, then is removed.
