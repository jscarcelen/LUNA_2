/**
 * Template Studio model.
 *
 * The Studio edits a small, friendly block tree and compiles it into the template document the
 * renderer/exporters already understand (`pageLayouts`, `components`, `blockFormats`, `dataFields`,
 * `repeatCollectionField`). The Studio tree is stored on the template as `studio` so it round-trips
 * losslessly; templates made in the advanced builder (no `studio` blob) are imported best-effort.
 */

export const STUDIO_VERSION = 1;
export const COLLECTION_FIELD = "items";

export const BLOCK_KINDS = [
  { kind: "heading", label: "Heading", icon: "H", hint: "A title or section heading." },
  { kind: "text", label: "Text", icon: "¶", hint: "Fixed text, instructions, notes." },
  { kind: "field", label: "Field", icon: "{ }", hint: "Filled by the agent's JSON output." },
  { kind: "group", label: "Repeating group", icon: "⟳", hint: "Repeats once per item (question, card…)." },
  { kind: "number", label: "Item number", icon: "#", hint: "1, 2, 3… inside a repeating group." },
  { kind: "image", label: "Image", icon: "▣", hint: "Logo or picture (URL)." },
  { kind: "divider", label: "Divider", icon: "—", hint: "A thin line." },
  { kind: "spacer", label: "Spacer", icon: "␣", hint: "Vertical space." },
  { kind: "pageBreak", label: "Page break", icon: "⤓", hint: "Start a new page (PDF / Word)." }
];

export const FIELD_DISPLAYS = [
  { value: "paragraph", label: "Paragraph" },
  { value: "heading2", label: "Large heading" },
  { value: "heading3", label: "Small heading" },
  { value: "standalone_text", label: "Highlighted line" },
  { value: "bullet_list", label: "Bullet list (one per value)" },
  { value: "numbered_list", label: "Numbered list (one per value)" },
  { value: "answer_choice", label: "Answer choices A, B, C…" },
  { value: "badge", label: "Small badge" }
];

export const PAGE_FORMATS = [
  { value: "a4-portrait", label: "A4 portrait", group: "Document" },
  { value: "a4-landscape", label: "A4 landscape", group: "Document" },
  { value: "letter-portrait", label: "Letter portrait", group: "Document" },
  { value: "ppt-16-9", label: "Slides 16:9", group: "Presentation" },
  { value: "ppt-4-3", label: "Slides 4:3", group: "Presentation" }
];

export const SIZE_PX = { s: "12px", m: "15px", l: "20px", xl: "28px" };

export function createId(prefix = "b") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createBlock(kind, overrides = {}) {
  const base = {
    id: createId(),
    kind,
    text: "",
    field: "",
    display: "paragraph",
    level: 2,
    align: "left",
    size: "m",
    weight: "normal",
    color: "",
    background: "",
    padding: 0,
    src: "",
    children: []
  };
  const defaults = {
    heading: { text: "Heading", level: 1, size: "xl", weight: "bold" },
    text: { text: "Write your text here." },
    field: { field: "", display: "paragraph" },
    group: { children: [], padding: 12 },
    number: {},
    image: { src: "" },
    divider: {},
    spacer: {},
    pageBreak: {}
  };
  return { ...base, ...(defaults[kind] || {}), ...overrides };
}

export function createEmptyStudio(name = "Untitled template") {
  return {
    version: STUDIO_VERSION,
    name,
    pageFormat: "a4-portrait",
    blocks: [createBlock("heading", { text: name })]
  };
}

/** A ready-made starting point that matches the Quiz Generator's fields. */
export function createQuizStarter() {
  return {
    version: STUDIO_VERSION,
    name: "Quiz worksheet",
    pageFormat: "a4-portrait",
    blocks: [
      createBlock("heading", { text: "Quiz", level: 1, size: "xl", weight: "bold" }),
      createBlock("text", { text: "Name: ____________________    Date: ____________", size: "s", color: "#6e6e73" }),
      createBlock("divider"),
      createBlock("group", {
        padding: 12,
        children: [
          createBlock("number"),
          createBlock("field", { field: "question", display: "heading3" }),
          createBlock("field", { field: "options", display: "answer_choice" }),
          createBlock("spacer")
        ]
      }),
      createBlock("pageBreak"),
      createBlock("heading", { text: "Answer key", level: 2, size: "l", weight: "bold" }),
      createBlock("group", {
        padding: 6,
        children: [
          createBlock("number"),
          createBlock("field", { field: "answer", display: "standalone_text" }),
          createBlock("field", { field: "explanation", display: "paragraph", size: "s", color: "#6e6e73" })
        ]
      })
    ]
  };
}

function walk(blocks, visitor, parent = null) {
  for (const block of blocks) {
    visitor(block, parent);
    if (block.kind === "group") walk(block.children || [], visitor, block);
  }
}

/** Field tags used by the template, with whether they repeat per item. */
export function collectFieldTags(studio) {
  const tags = new Map();
  walk(studio.blocks || [], (block, parent) => {
    if (block.kind !== "field" || !String(block.field || "").trim()) return;
    const name = String(block.field).trim();
    const perItem = Boolean(parent && parent.kind === "group");
    const existing = tags.get(name);
    tags.set(name, { name, perItem: existing ? existing.perItem || perItem : perItem, isList: ["bullet_list", "numbered_list", "answer_choice"].includes(block.display) });
  });
  return [...tags.values()];
}

function blockStyle(block) {
  const style = {};
  if (block.align && block.align !== "left") style.textAlign = block.align;
  if (block.size && SIZE_PX[block.size] && block.kind !== "spacer") style.fontSize = SIZE_PX[block.size];
  if (block.weight === "bold") style.fontWeight = "700";
  if (block.color) style.color = block.color;
  if (block.background) style.backgroundColor = block.background;
  if (Number(block.padding) > 0) style.padding = `${Number(block.padding)}px`;
  if (block.background || Number(block.padding) > 8) style.radius = "10px";
  if (block.kind === "spacer") style.padding = `${Math.max(4, Number(block.padding) || 8)}px 0`;
  style.margin = "0";
  return style;
}

function compileBlock(block, formats) {
  const style = blockStyle(block);
  const register = (type, extra = {}) => {
    formats[type] = formats[type] || [];
    formats[type].push({ name: block.id, style, ...extra });
    return block.id;
  };
  if (block.kind === "heading") {
    const type = `heading${Math.min(3, Math.max(1, Number(block.level) || 1))}`;
    return { id: block.id, type, text: block.text, illustrativeText: block.text, formatName: register(type) };
  }
  if (block.kind === "text") {
    return { id: block.id, type: "paragraph", text: block.text, illustrativeText: block.text, formatName: register("paragraph") };
  }
  if (block.kind === "field") {
    const type = block.display || "paragraph";
    const isList = ["bullet_list", "numbered_list", "answer_choice"].includes(type);
    return {
      id: block.id,
      type,
      bindField: isList ? "" : block.field,
      repeatField: isList ? block.field : "",
      illustrativeText: `{${block.field || "field"}}`,
      formatName: register(type)
    };
  }
  if (block.kind === "number") {
    return { id: block.id, type: "badge", text: "", illustrativeText: "1", formatName: register("badge", { htmlTemplate: '<span style="display:inline-block;min-width:26px;padding:2px 8px;border-radius:999px;background:#eef2ff;color:#0060c0;font-weight:700;font-size:12px;">{{index}}</span>' }) };
  }
  if (block.kind === "image") {
    return { id: block.id, type: "image", imageSrc: block.src || "", text: "", formatName: register("image") };
  }
  if (block.kind === "divider") return { id: block.id, type: "divider", formatName: register("divider", { style: { margin: "6px 0", borderWidth: "1px", borderColor: "#e5e5ea" } }) };
  if (block.kind === "spacer") return { id: block.id, type: "spacer", formatName: register("spacer") };
  if (block.kind === "pageBreak") return { id: block.id, type: "page_break" };
  return { id: block.id, type: "paragraph", text: block.text };
}

/** Compiles the Studio tree into the renderer's template document. */
export function compileStudio(studio, { id = "", createdAt = "" } = {}) {
  const formats = {};
  const components = [];
  const entries = [];
  for (const block of studio.blocks || []) {
    if (block.kind === "group") {
      const component = {
        id: `comp-${block.id}`,
        name: "Repeating group",
        style: blockStyle(block),
        blocks: (block.children || []).map((child) => compileBlock(child, formats))
      };
      components.push(component);
      entries.push({ id: block.id, componentRefId: component.id, repeatScope: "per-output" });
    } else {
      entries.push({ ...compileBlock(block, formats), repeatScope: "once" });
    }
  }
  const tags = collectFieldTags(studio);
  const now = new Date().toISOString();
  return {
    id: id || createId("tpl"),
    name: String(studio.name || "Untitled template").trim() || "Untitled template",
    createdAt: createdAt || now,
    updatedAt: now,
    pageFormat: studio.pageFormat || "a4-portrait",
    containerClass: "luna-template-default",
    css: ".luna-template-default-page{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',Inter,Helvetica,Arial,sans-serif;color:#1d1d1f;line-height:1.5;} .luna-template-default-page h1,.luna-template-default-page h2,.luna-template-default-page h3,.luna-template-default-page p,.luna-template-default-page ul,.luna-template-default-page ol{margin:0 0 6px;} .tpl-group{margin-bottom:12px;break-inside:avoid;}",
    blockClasses: {},
    blockHtmlTemplates: {},
    blockFormats: formats,
    components,
    canvasBlocks: entries,
    pageLayouts: [{ id: "page-1", pageFormat: studio.pageFormat || "a4-portrait", blocks: entries }],
    activePageId: "page-1",
    dataBindings: {},
    dataFields: tags.map((tag) => ({ id: `field-${tag.name}`, name: tag.name, label: tag.name, dataType: tag.isList ? "array" : "string", repeatScope: tag.perItem ? "per-output" : "once" })),
    repeatCollectionField: tags.some((tag) => tag.perItem) ? COLLECTION_FIELD : "",
    renderVariants: [],
    formatSets: [],
    activeFormatSetId: "",
    canvasSettings: {},
    studio: { ...studio, version: STUDIO_VERSION }
  };
}

/** Sample data for previews, shaped like the agent output the template expects. */
export function buildSampleData(studio, itemCount = 3) {
  const tags = collectFieldTags(studio);
  const sampleValue = (tag, index) => {
    if (tag.isList) return ["First option", "Second option", "Third option"].map((value) => `${value}${index ? ` (${index + 1})` : ""}`);
    return `Sample ${tag.name} ${index ? index + 1 : ""}`.trim();
  };
  const data = {};
  for (const tag of tags.filter((item) => !item.perItem)) data[tag.name] = sampleValue(tag, 0);
  if (tags.some((tag) => tag.perItem)) {
    data[COLLECTION_FIELD] = Array.from({ length: itemCount }, (_, index) => Object.fromEntries(tags.filter((tag) => tag.perItem).map((tag) => [tag.name, sampleValue(tag, index)])));
  }
  return data;
}

/** Best-effort import of a template built in the advanced builder. */
export function importLegacyTemplate(template = {}) {
  if (template.studio && template.studio.version) return { ...template.studio, name: template.name || template.studio.name };
  const blocks = [];
  const components = Array.isArray(template.components) ? template.components : [];
  const page = Array.isArray(template.pageLayouts) && template.pageLayouts.length ? template.pageLayouts[0] : { blocks: template.canvasBlocks || [] };
  const formats = template.blockFormats && typeof template.blockFormats === "object" ? template.blockFormats : {};
  const toStudioBlock = (entry) => {
    const type = String(entry.type || "paragraph");
    const format = (formats[type] || []).find((item) => item.name === entry.formatName);
    if (type === "badge" && String(format?.htmlTemplate || "").includes("{{index}}")) return createBlock("number");
    if (entry.bindField || entry.repeatField) {
      return createBlock("field", { field: entry.bindField || entry.repeatField, display: FIELD_DISPLAYS.some((item) => item.value === type) ? type : "paragraph" });
    }
    if (type.startsWith("heading")) return createBlock("heading", { text: entry.text || entry.illustrativeText || "Heading", level: Number(type.slice(-1)) || 1, size: type === "heading1" ? "xl" : "l" });
    if (type === "image") return createBlock("image", { src: entry.imageSrc || "" });
    if (type === "divider") return createBlock("divider");
    if (type === "spacer") return createBlock("spacer");
    if (type === "page_break") return createBlock("pageBreak");
    return createBlock("text", { text: entry.text || entry.illustrativeText || "" });
  };
  for (const entry of page.blocks || []) {
    if (entry.componentRefId) {
      const component = components.find((item) => item.id === entry.componentRefId);
      blocks.push(createBlock("group", { children: (component?.blocks || []).map(toStudioBlock) }));
    } else {
      blocks.push(toStudioBlock(entry));
    }
  }
  return { version: STUDIO_VERSION, name: template.name || "Imported template", pageFormat: template.pageFormat || "a4-portrait", blocks, imported: true };
}
