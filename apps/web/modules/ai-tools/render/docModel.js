/**
 * LUNA document model — "a template is a designed document + a data structure".
 *
 * template = {
 *   name, format ("a4-portrait" | ... ), pageSize: { width, height } (mm),
 *   pages: [{
 *     id, background: { type: "image", src } | null,
 *     repeat: { source } | null,                      // repeat page per item (flashcards)
 *     elements: [Element]                             // static + dynamic, absolute (mm)
 *   }]
 * }
 * Element = { id, type: "text"|"field"|"image"|"rect"|"line"|"group", x, y, w, h, style, ... }
 *   text:  { content }
 *   field: { path, display: "text"|"list"|"choices"|"image", placeholder }
 *   image: { src }
 *   rect:  { style.fill, style.stroke, style.radius }
 *   line:  { style.stroke }
 *   group: { label, repeat: { source, mode: "flow" } | null, gap, continueOnNextPage, children: [Element] (coords relative to group) }
 *
 * The layout engine turns (template, data) into concrete pages of positioned items; renderers
 * (HTML, PDF, DOCX, PPTX) only draw those items, so every format shares one layout.
 */

export const DOC_MODEL_VERSION = 2;
export const PAGE_MARGIN_MM = 12;

export const PAGE_SIZES = {
  "a4-portrait": { width: 210, height: 297, label: "A4 portrait" },
  "a4-landscape": { width: 297, height: 210, label: "A4 landscape" },
  "letter-portrait": { width: 216, height: 279, label: "Letter portrait" },
  "ppt-16-9": { width: 254, height: 143, label: "Slides 16:9" },
  "ppt-4-3": { width: 254, height: 190, label: "Slides 4:3" },
  "card-a6": { width: 148, height: 105, label: "Card A6 (flashcards)" }
};

export function createId(prefix = "el") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function defaultStyle(overrides = {}) {
  return { fontSize: 11, fontWeight: "normal", color: "#1d1d1f", align: "left", fontFamily: "sans", lineHeight: 1.35, fill: "", stroke: "", radius: 0, ...overrides };
}

export function createElement(type, overrides = {}) {
  const base = { id: createId(), type, x: 20, y: 20, w: 100, h: 10, style: defaultStyle() };
  const defaults = {
    text: { content: "Text", h: 8 },
    field: { path: "", display: "text", placeholder: "", h: 8 },
    image: { src: "", w: 40, h: 30 },
    rect: { w: 60, h: 30, style: defaultStyle({ fill: "#f5f5f7", stroke: "#d2d2d7", radius: 3 }) },
    line: { w: 100, h: 0.5, style: defaultStyle({ stroke: "#d2d2d7" }) },
    group: { label: "Group", w: 170, h: 40, gap: 4, repeat: null, continueOnNextPage: true, children: [], style: defaultStyle({ fill: "", stroke: "" }) }
  };
  return { ...base, ...(defaults[type] || {}), ...overrides };
}

export function createPage(overrides = {}) {
  return { id: createId("page"), background: null, repeat: null, elements: [], ...overrides };
}

export function createTemplate(name = "Untitled template", format = "a4-portrait") {
  return { version: DOC_MODEL_VERSION, name, format, pageSize: { ...PAGE_SIZES[format] }, pages: [createPage()] };
}

/** Exam starter: header + instructions (static) and a Question group repeating per item. */
export function createExamStarter() {
  const template = createTemplate("Exam", "a4-portrait");
  const page = template.pages[0];
  page.elements = [
    createElement("text", { x: PAGE_MARGIN_MM, y: 14, w: 120, h: 10, content: "University Examination", style: defaultStyle({ fontSize: 18, fontWeight: "bold" }) }),
    createElement("text", { x: 150, y: 14, w: 48, h: 10, content: "Mathematics 101\nSpring 2026", style: defaultStyle({ fontSize: 9, color: "#6e6e73", align: "right" }) }),
    createElement("text", { x: PAGE_MARGIN_MM, y: 28, w: 90, h: 7, content: "Name: ____________________________", style: defaultStyle({ fontSize: 9 }) }),
    createElement("text", { x: 120, y: 28, w: 78, h: 7, content: "Date: ______________", style: defaultStyle({ fontSize: 9, align: "right" }) }),
    createElement("line", { x: PAGE_MARGIN_MM, y: 36, w: 186, h: 0.4 }),
    createElement("text", { x: PAGE_MARGIN_MM, y: 39, w: 186, h: 6, content: "Instructions: choose the best answer for each question.", style: defaultStyle({ fontSize: 8.5, color: "#6e6e73" }) }),
    createElement("group", {
      label: "Question group",
      x: PAGE_MARGIN_MM,
      y: 48,
      w: 186,
      h: 46,
      gap: 5,
      repeat: { source: "items", mode: "flow" },
      children: [
        createElement("field", { x: 0, y: 0, w: 12, h: 7, path: "number", display: "text", placeholder: "1", style: defaultStyle({ fontSize: 11, fontWeight: "bold", color: "#0060c0" }) }),
        createElement("field", { x: 150, y: 0, w: 36, h: 6, path: "topic", display: "text", placeholder: "Algebra", style: defaultStyle({ fontSize: 8, color: "#6e6e73", align: "right" }) }),
        createElement("field", { x: 12, y: 0, w: 136, h: 9, path: "question", display: "text", placeholder: "What is the value of 2 + 2?", style: defaultStyle({ fontSize: 11, fontWeight: "bold" }) }),
        createElement("field", { x: 12, y: 11, w: 170, h: 26, path: "options", display: "choices", placeholder: "3|4|5|6", style: defaultStyle({ fontSize: 10 }) }),
        createElement("field", { x: 12, y: 39, w: 170, h: 6, path: "answer", display: "text", placeholder: "4", style: defaultStyle({ fontSize: 8.5, color: "#0060c0" }) })
      ]
    })
  ];
  return template;
}

/** Flashcard starter: one card page per item. */
export function createFlashcardStarter() {
  const template = createTemplate("Flashcards", "card-a6");
  const page = template.pages[0];
  page.repeat = { source: "items" };
  page.elements = [
    createElement("rect", { x: 6, y: 6, w: 136, h: 93, style: defaultStyle({ fill: "#ffffff", stroke: "#d2d2d7", radius: 4 }) }),
    createElement("field", { x: 12, y: 12, w: 124, h: 8, path: "topic", display: "text", placeholder: "Vocabulary", style: defaultStyle({ fontSize: 8, color: "#0060c0", fontWeight: "bold" }) }),
    createElement("field", { x: 12, y: 30, w: 124, h: 30, path: "front", display: "text", placeholder: "perro", style: defaultStyle({ fontSize: 22, fontWeight: "bold", align: "center" }) }),
    createElement("line", { x: 12, y: 66, w: 124, h: 0.4 }),
    createElement("field", { x: 12, y: 70, w: 124, h: 22, path: "back", display: "text", placeholder: "dog", style: defaultStyle({ fontSize: 14, align: "center", color: "#6e6e73" }) })
  ];
  return template;
}

/* -------------------------------------------------------------------------- data helpers */

export function getPath(source, path) {
  if (!path) return undefined;
  return String(path).split(".").reduce((acc, key) => (acc && typeof acc === "object" ? acc[key] : undefined), source);
}

function resolveValue(path, contexts) {
  for (const context of contexts) {
    const value = getPath(context, path);
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function resolveList(path, contexts) {
  const value = resolveValue(path, contexts);
  return Array.isArray(value) ? value : [];
}

/** Every field path used, with repeat scope, so agents can auto-map. */
export function collectTemplateFields(template) {
  const fields = new Map();
  const visit = (elements, perItem) => {
    for (const element of elements || []) {
      if (element.type === "group") visit(element.children, perItem || Boolean(element.repeat?.source));
      if (element.type !== "field" || !String(element.path || "").trim()) continue;
      const name = String(element.path).trim();
      const isList = ["list", "choices"].includes(element.display);
      const existing = fields.get(name);
      fields.set(name, { name, perItem: existing ? existing.perItem || perItem : perItem, isList: existing ? existing.isList || isList : isList, display: element.display });
    }
  };
  for (const page of template.pages || []) visit(page.elements, Boolean(page.repeat?.source));
  return [...fields.values()];
}

/** Sample data matching the template's fields, used by the "design with sample data" toggle. */
export function buildSampleData(template, itemCount = 3) {
  const fields = collectTemplateFields(template);
  const placeholders = {};
  const visit = (elements) => {
    for (const element of elements || []) {
      if (element.type === "group") visit(element.children);
      if (element.type === "field" && element.path && element.placeholder) placeholders[element.path] = element.placeholder;
    }
  };
  for (const page of template.pages || []) visit(page.elements);
  const valueFor = (field, index) => {
    const placeholder = placeholders[field.name];
    if (field.isList) return (placeholder ? placeholder.split("|") : ["First option", "Second option", "Third option"]).map((value) => value.trim());
    if (field.name === "number") return String(index + 1);
    if (placeholder) return index ? `${placeholder} (${index + 1})` : placeholder;
    return `Sample ${field.name}${index ? ` ${index + 1}` : ""}`;
  };
  const data = {};
  for (const field of fields.filter((item) => !item.perItem)) data[field.name] = valueFor(field, 0);
  const perItem = fields.filter((item) => item.perItem);
  if (perItem.length) data.items = Array.from({ length: itemCount }, (_, index) => Object.fromEntries(perItem.map((field) => [field.name, valueFor(field, index)])));
  return data;
}

/* -------------------------------------------------------------------------- text metrics */

const MM_PER_PT = 0.352778;

/** Rough wrap estimate shared by layout and non-HTML renderers (avg glyph ≈ 0.5em). */
export function wrapText(text, widthMm, fontSizePt, { bold = false } = {}) {
  const avgCharMm = fontSizePt * MM_PER_PT * (bold ? 0.55 : 0.5);
  const maxChars = Math.max(4, Math.floor(widthMm / avgCharMm));
  const lines = [];
  for (const paragraph of String(text ?? "").split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length > maxChars && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

export function lineHeightMm(style = {}) {
  return (Number(style.fontSize) || 11) * MM_PER_PT * (Number(style.lineHeight) || 1.35);
}

/* -------------------------------------------------------------------------- layout engine */

function fieldToLines(element, contexts) {
  const value = resolveValue(element.path, contexts);
  if (element.display === "list" || element.display === "choices") {
    const list = Array.isArray(value) ? value : value === undefined ? String(element.placeholder || "").split("|").filter(Boolean) : String(value).split(/\n+/);
    return list.map((item, index) => (element.display === "choices" ? `${String.fromCharCode(65 + (index % 26))}.  ${item}` : `•  ${item}`));
  }
  if (value === undefined) return [element.placeholder ? String(element.placeholder) : `{${element.path || "field"}}`];
  return [Array.isArray(value) ? value.join(", ") : String(value)];
}

function measureTextItem(item) {
  const bold = item.style.fontWeight === "bold";
  const lh = lineHeightMm(item.style);
  const wrapped = item.lines.flatMap((line) => wrapText(line, item.w, item.style.fontSize, { bold }));
  return { lines: wrapped, height: Math.max(item.h, wrapped.length * lh + 1) };
}

/** Lays out one element (absolute coords already resolved) into concrete items. Returns { items, bottom }. */
function layoutElement(element, originX, originY, contexts, options) {
  const x = originX + Number(element.x || 0);
  const y = originY + Number(element.y || 0);
  const w = Number(element.w || 0);
  const h = Number(element.h || 0);
  const style = { ...defaultStyle(), ...(element.style || {}) };

  if (element.type === "text") {
    const item = { type: "text", x, y, w, h, style, lines: String(element.content ?? "").split(/\r?\n/), isField: false };
    const measured = measureTextItem(item);
    return { items: [{ ...item, lines: measured.lines, h: measured.height }], bottom: y + measured.height };
  }
  if (element.type === "field") {
    if (element.display === "image") {
      const value = resolveValue(element.path, contexts);
      return { items: [{ type: "image", x, y, w, h, style, src: typeof value === "string" ? value : "", isField: true, path: element.path }], bottom: y + h };
    }
    const item = { type: "text", x, y, w, h, style, lines: fieldToLines(element, contexts), isField: true, path: element.path, hasValue: resolveValue(element.path, contexts) !== undefined };
    const measured = measureTextItem(item);
    return { items: [{ ...item, lines: measured.lines, h: measured.height }], bottom: y + measured.height };
  }
  if (element.type === "image") return { items: [{ type: "image", x, y, w, h, style, src: element.src || "" }], bottom: y + h };
  if (element.type === "rect") return { items: [{ type: "rect", x, y, w, h, style }], bottom: y + h };
  if (element.type === "line") return { items: [{ type: "line", x, y, w, h: Math.max(0.3, h), style }], bottom: y + h };
  if (element.type === "group") return layoutGroupInstance(element, x, y, contexts, options);
  return { items: [], bottom: y };
}

/** Lays out the children of one group instance; nested repeating groups expand and push siblings down. */
function layoutGroupInstance(group, x, y, contexts, options) {
  const children = [...(group.children || [])].sort((a, b) => Number(a.y || 0) - Number(b.y || 0));
  const items = [];
  let shift = 0;
  let bottom = y;
  const style = { ...defaultStyle(), ...(group.style || {}) };
  const bodyItems = [];
  for (const child of children) {
    const childY = Number(child.y || 0) + shift;
    if (child.type === "group" && child.repeat?.source) {
      const list = resolveList(child.repeat.source, contexts);
      const records = list.length ? list : [null];
      let cursor = y + childY;
      const startY = cursor;
      for (const record of records) {
        const laid = layoutGroupInstance(child, x + Number(child.x || 0), cursor, record && typeof record === "object" ? [record, ...contexts] : [{ value: record, label: record }, ...contexts], options);
        bodyItems.push(...laid.items);
        cursor = laid.bottom + Number(child.gap || 2);
      }
      const used = cursor - startY - Number(child.gap || 2);
      shift += Math.max(0, used - Number(child.h || 0));
      bottom = Math.max(bottom, cursor);
      continue;
    }
    const laid = layoutElement({ ...child, y: childY }, x, y, contexts, options);
    bodyItems.push(...laid.items);
    const designedBottom = y + childY + Number(child.h || 0);
    if (laid.bottom > designedBottom) shift += laid.bottom - designedBottom;
    bottom = Math.max(bottom, laid.bottom);
  }
  const groupHeight = Math.max(Number(group.h || 0) + shift, bottom - y);
  if (style.fill || style.stroke) items.push({ type: "rect", x, y, w: Number(group.w || 0), h: groupHeight, style });
  items.push(...bodyItems);
  return { items, bottom: y + groupHeight, height: groupHeight };
}

/**
 * Produces concrete pages: [{ width, height, background, items, sourcePageId, continuation }].
 * Flow groups auto-paginate: overflow continues on a new page carrying the source page's
 * background and every static element above the group ("header"), unless a later template page
 * declares a group with the same id (explicit continuation page).
 */
export function layoutDocument(template, data = {}) {
  const size = template.pageSize || PAGE_SIZES[template.format] || PAGE_SIZES["a4-portrait"];
  const pages = [];
  const rootContexts = [data];
  const templatePages = template.pages || [];
  const options = { size };

  const startPage = (sourcePage, continuation = false, staticOnly = null) => {
    const page = { width: size.width, height: size.height, background: sourcePage.background || null, items: [], sourcePageId: sourcePage.id, continuation };
    pages.push(page);
    if (staticOnly) {
      for (const element of staticOnly) page.items.push(...layoutElement(element, 0, 0, rootContexts, options).items);
    }
    return page;
  };

  const layoutPage = (sourcePage, contexts) => {
    let page = startPage(sourcePage);
    const elements = [...(sourcePage.elements || [])].sort((a, b) => Number(a.y || 0) - Number(b.y || 0));
    let flowShift = 0;
    for (const element of elements) {
      if (element.type === "group" && element.repeat?.source && element.repeat.mode !== "static") {
        const list = resolveList(element.repeat.source, contexts);
        const records = list.length ? list : [null];
        const gap = Number(element.gap || 4);
        const headerElements = elements.filter((item) => item !== element && Number(item.y || 0) + Number(item.h || 0) <= Number(element.y || 0) && !(item.type === "group" && item.repeat?.source));
        let cursor = Number(element.y || 0) + flowShift;
        const limit = size.height - PAGE_MARGIN_MM;
        for (const [index, record] of records.entries()) {
          const recordContexts = record && typeof record === "object" ? [{ ...record, number: record.number ?? index + 1 }, ...contexts] : [{ value: record, label: record, number: index + 1 }, ...contexts];
          let laid = layoutGroupInstance(element, Number(element.x || 0), cursor, recordContexts, options);
          if (laid.bottom > limit && cursor > Number(element.y || 0)) {
            page = startPage(sourcePage, true, element.continueOnNextPage === false ? [] : headerElements);
            cursor = Number(element.y || 0);
            laid = layoutGroupInstance(element, Number(element.x || 0), cursor, recordContexts, options);
          }
          page.items.push(...laid.items);
          cursor = laid.bottom + gap;
        }
        flowShift += Math.max(0, cursor - gap - (Number(element.y || 0) + Number(element.h || 0)));
        continue;
      }
      const laid = layoutElement({ ...element, y: Number(element.y || 0) + (Number(element.y || 0) > 0 && flowShift && isBelowFlow(element, elements) ? flowShift : 0) }, 0, 0, contexts, options);
      page.items.push(...laid.items);
    }
  };

  function isBelowFlow(element, elements) {
    const flow = elements.find((item) => item.type === "group" && item.repeat?.source);
    return flow ? Number(element.y || 0) >= Number(flow.y || 0) + Number(flow.h || 0) : false;
  }

  for (const sourcePage of templatePages) {
    if (sourcePage.repeat?.source) {
      const list = resolveList(sourcePage.repeat.source, rootContexts);
      const records = list.length ? list : [null];
      for (const [index, record] of records.entries()) {
        layoutPage(sourcePage, record && typeof record === "object" ? [{ ...record, number: record.number ?? index + 1 }, data] : [{ value: record, number: index + 1 }, data]);
      }
    } else {
      layoutPage(sourcePage, rootContexts);
    }
  }
  return { size, pages };
}
