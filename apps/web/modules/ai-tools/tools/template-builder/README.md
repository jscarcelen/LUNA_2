# Template Studio

A template is a **designed document + a data structure**. Static elements define the visual design,
AI fields define where the agent's output goes, groups define what repeats.

- Model: `modules/ai-tools/render/docModel.js` — `pages[] → { background, repeat, elements[] }`,
  elements are `text | field | image | rect | line | group` positioned in mm. Three repeat modes:
  field lists inside a group (`display: list | choices`), groups (`repeat: { source: "items",
  mode: "flow" }`, auto-paginate and repeat the header), pages (`page.repeat.source`).
- Layout: `layoutDocument(template, data)` turns the model + data into concrete pages; every
  export (HTML / PDF / DOCX / PPTX in `docRenderers.js`) draws those pages — one engine, all formats.
- Editor: `TemplateStudioPage.js` — source chooser (blank / PDF / image; Word later), then
  Design (pages navigator, palette, canvas with drag/resize, purple group boundaries, inspector,
  "design with sample data"), Data (agent → template field mapping, sample items, paginated
  preview) and Export tabs. PDF pages are rasterised client-side with pdf.js into locked
  backgrounds.
- Storage: saved through `saveDocumentBlockTemplate` with `docModel` (persisted in the template
  meta) plus `dataFields` / `repeatCollectionField = "items"` so agents auto-map. The render route
  branches on `template.docModel`.
- `TemplateBuilderPage.js` is the legacy editor ("Advanced"); legacy templates open in the Studio
  with their field tags placed in a group.
