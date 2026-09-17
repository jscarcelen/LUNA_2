# Template Studio (and the advanced builder)

`TemplateStudioPage.js` is the default template editor: a canvas of blocks (heading, text, **field**,
**repeating group**, item number, image, divider, spacer, page break) with an inspector for content,
**field tag**, "show as", position (alignment, "comes after"), size/weight/colour/background, and a
live preview rendered by the same `/api/templates/render-preview` route used for exports.

`studioModel.js` compiles the Studio tree into the renderer's template document:
- top-level blocks → `pageLayouts[0].blocks` entries; a repeating group → a `components[]` entry
  referenced with `repeatScope: "per-output"` (rendered record-major, wrapped in `.tpl-group`);
- per-block style → `blockFormats[type][{ name: blockId, style }]` + `formatName: blockId`;
- field tags → `dataFields` (`repeatScope` per item when inside a group) and
  `repeatCollectionField = "items"`, which is exactly what `RunAgentPage` sends.
The tree itself is saved as `template.studio` so reopening is lossless; templates without it (made in
the advanced builder) are imported best-effort.

`TemplateBuilderPage.js` is the previous full-control editor, reachable via "Advanced editor".
