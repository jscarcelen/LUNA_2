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

## Agent output (`output/`)

Template Studio is the only catalog of components, formats (design variants) and colours (accents).
`output/outputDocument.ts` plans an agent's output (typed blocks, quiz items, flashcards) into runs of
components, assembles them with `engine/outputTemplate.ts` (the Template Wizard's assembler: A4 / Letter /
Slides × Student view / Answer key) and reads a saved template back as "format + colour per component"
(`styleFromTemplate`). `output/OutputDesigner.tsx` is the UI the run page uses (`OutputStylePanel`,
`OutputPreviewPane`). Block types without a Template Studio component are not offered (dividers only
separate; they never render).

Sources and language: question cards print, in the Answer key only, "Source: document › heading · passage N — quote"
linked (HTML and PowerPoint) to `/source?d=<document>&c=<passage>&q=<quote>`, a page that re-chunks the document
exactly as the generator did and highlights the quote (`app/source/page.js`). The best passage per question is
found by `locateSource` (activities/engine) over the run's `sources`. `output/labels.ts` translates the words
components print themselves (Answer, True/False, Name, Date, Page, Section…) into the agent's chosen language,
or the language detected in the content when it is "same as the material".

## Catalog (3 categories)

- **Structure:** Exam header (title, name, date) · Document header (title) · Section header (badge + title | title only) ·
  Headings (levels 1–4) · Paragraph · Key points · Callout · Table · Footer.
- **Questions:** Multiple choice · Open answer · True / false · Fill in the blanks · Match the pairs · Math practice.
  Every question type has an answer (and source) that only the Answer key view shows.
- **Cards & Games:** Flashcard (a document by itself).

A component's *formats* are the other designs of its family (same fields), so switching format never changes what the
AI must write. The AI-side counterpart of each component is a block type in `ai-tools/blocks/blockRegistry.js`
(`COMPONENT_FOR_BLOCK` in `output/outputDocument.ts` is the map). The document title comes from the AI (a `title` field),
not from the agent's name. Pages keep their real size (A4 297 mm, Letter 279 mm, slides 143 mm) and the footer sits at the
bottom of each one.
