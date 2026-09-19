import type {
  Background, Canvas, ContentSource, Element, FieldDef, FieldType, GroupElement, ID, ImageElement, Layout, LayoutClass,
  Margins, Page, ShapeElement, Style, Template, TextElement, View
} from "./types";

/* ---------------------------------------------------------------- ids + defaults */

export function createId(prefix = "el"): ID {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export const CANVAS_PRESETS: Record<string, { label: string; class: LayoutClass; canvas: Canvas }> = {
  "a4-portrait": { label: "A4 portrait", class: "paged", canvas: { width: 210, height: 297, unit: "mm" } },
  "a4-landscape": { label: "A4 landscape", class: "paged", canvas: { width: 297, height: 210, unit: "mm" } },
  "letter-portrait": { label: "Letter portrait", class: "paged", canvas: { width: 216, height: 279, unit: "mm" } },
  "card-a6": { label: "Card A6", class: "paged", canvas: { width: 148, height: 105, unit: "mm" } },
  "slides-16-9": { label: "Slides 16:9", class: "slides", canvas: { width: 254, height: 143, unit: "mm" } },
  "slides-4-3": { label: "Slides 4:3", class: "slides", canvas: { width: 254, height: 190, unit: "mm" } }
};

export const DEFAULT_MARGINS: Margins = { top: 12, right: 12, bottom: 12, left: 12 };

export function defaultStyle(overrides: Partial<Style> = {}): Style {
  return { fontFamily: "sans", fontSize: 11, fontWeight: "normal", color: "#1d1d1f", align: "left", lineHeight: 1.35, ...overrides };
}

const baseElement = (type: string, frame = { x: 12, y: 12, w: 100, h: 8 }) => ({
  id: createId("el"),
  type,
  frame: { ...frame },
  style: defaultStyle(),
  pageScope: { mode: "page" as const },
  visibility: {}
});

export function createText(source: ContentSource = { type: "static", value: "Text" }, overrides: Partial<TextElement> = {}): TextElement {
  return { ...baseElement("text"), type: "text", source, format: "plain", ...overrides } as TextElement;
}
export function createImage(source: ContentSource = { type: "static", value: "" }, overrides: Partial<ImageElement> = {}): ImageElement {
  return { ...baseElement("image", { x: 12, y: 12, w: 40, h: 30 }), type: "image", source, ...overrides } as ImageElement;
}
export function createShape(type: ShapeElement["type"], overrides: Partial<ShapeElement> = {}): ShapeElement {
  const frame = type === "line" || type === "arrow" ? { x: 12, y: 12, w: 100, h: 0.5 } : { x: 12, y: 12, w: 60, h: 30 };
  const style = type === "line" || type === "arrow" ? defaultStyle({ stroke: "#d2d2d7", strokeWidth: 0.4 }) : defaultStyle({ fill: "#f5f5f7", stroke: "#d2d2d7", strokeWidth: 0.3, radius: 2 });
  return { ...baseElement(type, frame), type, style, ...overrides } as ShapeElement;
}
export function createGroup(overrides: Partial<GroupElement> = {}): GroupElement {
  return {
    ...baseElement("group", { x: 12, y: 12, w: 186, h: 40 }),
    type: "group",
    name: "Group",
    layout: { mode: "vertical", gap: 3 },
    repeat: null,
    pagination: { breakBefore: false, breakAfter: false, keepTogether: true, allowSplit: false, overflow: "continue" },
    children: [],
    style: defaultStyle({ fill: "", stroke: "" }),
    ...overrides
  } as GroupElement;
}

export function createPage(overrides: Partial<Page> = {}): Page {
  return { id: createId("page"), background: { type: "none" }, elements: [], ...overrides };
}

export function createView(name = "Default", overrides: Partial<View> = {}): View {
  return { id: createId("view"), name, overrides: {}, ...overrides };
}

export function createLayout(name: string, preset = "a4-portrait", overrides: Partial<Layout> = {}): Layout {
  const spec = CANVAS_PRESETS[preset] || CANVAS_PRESETS["a4-portrait"];
  return { id: createId("lay"), name, class: spec.class, canvas: { ...spec.canvas }, margins: { ...DEFAULT_MARGINS }, views: [createView("Default")], pages: [createPage()], ...overrides };
}

/** New layout at another page size with the source layout's elements copied and scaled to the new width. */
export function cloneLayoutForPreset(source: Layout, name: string, preset: string): Layout {
  const created = createLayout(name, preset);
  const ratio = created.canvas.width / source.canvas.width;
  const scale = (element: Element): Element => {
    const frame = { x: element.frame.x * ratio, y: element.frame.y * ratio, w: element.frame.w * ratio, h: element.frame.h * ratio };
    const style = element.style.fontSize ? { ...element.style, fontSize: Math.max(6, Math.round(element.style.fontSize * ratio * 10) / 10) } : element.style;
    const next = { ...element, id: createId("el"), frame, style } as Element;
    if (next.type === "group") next.children = next.children.map(scale);
    return next;
  };
  created.margins = { top: source.margins.top * ratio, right: source.margins.right * ratio, bottom: source.margins.bottom * ratio, left: source.margins.left * ratio };
  created.pages = source.pages.map((page) => createPage({ background: page.background, elements: page.elements.map(scale) }));
  return created;
}

export function createField(name: string, type: FieldType, overrides: Partial<FieldDef> = {}): FieldDef {
  return { id: createId("fld"), name, type, ...overrides };
}

export function createTemplate(name = "Untitled template"): Template {
  const now = new Date().toISOString();
  return { id: createId("tpl"), version: 3, name, fields: [], layouts: [createLayout("Document", "a4-portrait")], createdAt: now, updatedAt: now };
}

/* ---------------------------------------------------------------- field tree helpers */

export interface FieldPathEntry { field: FieldDef; path: string; parents: FieldDef[] }

/** Flattens the field tree with agent-style JSON paths ("items[].question"). */
export function flattenFields(fields: FieldDef[], prefix = "", parents: FieldDef[] = []): FieldPathEntry[] {
  const out: FieldPathEntry[] = [];
  for (const field of fields) {
    const key = slug(field.name);
    const path = prefix ? `${prefix}.${key}` : key;
    out.push({ field, path, parents });
    if (field.type === "array" && field.children?.[0]) {
      const item = field.children[0];
      if (item.type === "object") out.push(...flattenFields(item.children || [], `${path}[]`, [...parents, field, item]));
      else out.push({ field: item, path: `${path}[]`, parents: [...parents, field] });
    } else if (field.type === "object") {
      out.push(...flattenFields(field.children || [], path, [...parents, field]));
    }
  }
  return out;
}

export function findField(fields: FieldDef[], id: ID): FieldDef | null {
  for (const field of fields) {
    if (field.id === id) return field;
    const found = findField(field.children || [], id);
    if (found) return found;
  }
  return null;
}

/** Fields available inside one item of an array field (the array's item object members, or the item itself). */
export function arrayItemFields(array: FieldDef): FieldDef[] {
  const item = array.children?.[0];
  if (!item) return [];
  return item.type === "object" ? item.children || [] : [item];
}

export function arrayFields(fields: FieldDef[]): FieldDef[] {
  const out: FieldDef[] = [];
  for (const field of fields) {
    if (field.type === "array") out.push(field);
    if (field.children) out.push(...arrayFields(field.type === "array" ? arrayItemFields(field) : field.children));
  }
  return out;
}

/** Key used for a field in data objects. Data is looked up by slug(name) with the id as fallback. */
export function slug(name: string): string {
  return String(name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "field";
}

/** Builds a template field tree from an agent's flat output field list (per-item fields → items[]). */
export function fieldsFromAgentFields(agentFields: { name: string; label?: string; type?: string; repeatScope?: string; description?: string }[]): FieldDef[] {
  const once = agentFields.filter((field) => field.repeatScope === "once");
  const perItem = agentFields.filter((field) => field.repeatScope !== "once");
  const toField = (field: (typeof agentFields)[number]): FieldDef => {
    if (field.type === "array") return createField(field.name, "array", { description: field.description, children: [createField(`${field.name} item`, "text")] });
    return createField(field.name, field.type === "number" ? "number" : field.type === "boolean" ? "boolean" : "text", { description: field.description });
  };
  const fields = once.map(toField);
  if (perItem.length) fields.push(createField("items", "array", { children: [createField("item", "object", { children: perItem.map(toField) })] }));
  return fields;
}

/* ---------------------------------------------------------------- element tree helpers */

export function walkElements(elements: Element[], visit: (element: Element, parent: GroupElement | null) => void, parent: GroupElement | null = null): void {
  for (const element of elements) {
    visit(element, parent);
    if (element.type === "group") walkElements(element.children, visit, element);
  }
}

export function findElement(elements: Element[], id: ID): { element: Element | null; parent: GroupElement | null } {
  let result: { element: Element | null; parent: GroupElement | null } = { element: null, parent: null };
  walkElements(elements, (element, parent) => {
    if (element.id === id) result = { element, parent };
  });
  return result;
}

export function updateElement(elements: Element[], id: ID, updater: (element: Element) => Element): Element[] {
  return elements.map((element) => {
    if (element.id === id) return updater(element);
    if (element.type === "group") return { ...element, children: updateElement(element.children, id, updater) };
    return element;
  });
}

export function removeElements(elements: Element[], ids: ID[]): Element[] {
  return elements.filter((element) => !ids.includes(element.id)).map((element) => (element.type === "group" ? { ...element, children: removeElements(element.children, ids) } : element));
}

export function cloneElement(element: Element): Element {
  const copy = { ...element, id: createId("el"), style: { ...element.style }, frame: { ...element.frame } } as Element;
  if (copy.type === "group") copy.children = (element as GroupElement).children.map(cloneElement);
  return copy;
}

export function backgroundLabel(background: Background): string {
  if (background.type === "none") return "None";
  if (background.type === "color") return `Colour ${background.value}`;
  if (background.type === "gradient") return "Gradient";
  return background.type === "pdf" ? `PDF page ${background.sourcePage}` : "Image";
}

/* ---------------------------------------------------------------- starters */

export function createExamStarter(): Template {
  const template = createTemplate("Exam");
  const question = createField("Question", "text", { description: "The question text." });
  const options = createField("Options", "array", { children: [createField("Option", "text")] });
  const answer = createField("Answer", "text");
  const topic = createField("Topic", "text");
  const items = createField("items", "array", { children: [createField("item", "object", { children: [question, options, answer, topic] })] });
  template.fields = [items];
  const layout = template.layouts[0];
  const student = layout.views[0];
  student.name = "Student exam";
  const answerKey = createView("Answer key");
  layout.views.push(answerKey);
  const answerText = createText({ type: "field", fieldId: answer.id }, { frame: { x: 0, y: 0, w: 170, h: 6 }, placeholder: "4", style: defaultStyle({ fontSize: 8.5, color: "#0060c0" }), visibility: { views: [answerKey.id] } });
  layout.pages[0].elements = [
    createText({ type: "static", value: "University Examination" }, { frame: { x: 12, y: 14, w: 120, h: 10 }, style: defaultStyle({ fontSize: 18, fontWeight: "bold" }) }),
    createText({ type: "static", value: "Mathematics 101\nSpring 2026" }, { frame: { x: 150, y: 14, w: 48, h: 10 }, style: defaultStyle({ fontSize: 9, color: "#6e6e73", align: "right" }), pageScope: { mode: "every" } }),
    createText({ type: "static", value: "Name: ____________________________      Date: ______________" }, { frame: { x: 12, y: 28, w: 186, h: 7 }, style: defaultStyle({ fontSize: 9 }), pageScope: { mode: "first" } }),
    createShape("line", { frame: { x: 12, y: 36, w: 186, h: 0.4 } }),
    createGroup({
      name: "Question group",
      frame: { x: 12, y: 42, w: 186, h: 40 },
      layout: { mode: "vertical", gap: 2 },
      repeat: { fieldId: items.id, mode: "flow" },
      children: [
        createText({ type: "field", fieldId: topic.id }, { frame: { x: 150, y: 0, w: 36, h: 5 }, placeholder: "Algebra", style: defaultStyle({ fontSize: 8, color: "#6e6e73", align: "right" }) }),
        createText({ type: "field", fieldId: question.id }, { frame: { x: 0, y: 0, w: 148, h: 8 }, placeholder: "What is the value of 2 + 2?", style: defaultStyle({ fontSize: 11, fontWeight: "bold" }) }),
        createGroup({
          name: "Options group",
          frame: { x: 6, y: 10, w: 170, h: 20 },
          layout: { mode: "vertical", gap: 1 },
          repeat: { fieldId: options.id, mode: "flow" },
          children: [createText({ type: "field", fieldId: options.children![0].id }, { frame: { x: 0, y: 0, w: 170, h: 5 }, placeholder: "An option", style: defaultStyle({ fontSize: 10 }) })]
        }),
        answerText
      ]
    })
  ];
  return template;
}

export function createFlashcardStarter(): Template {
  const template = createTemplate("Flashcards");
  const front = createField("Front", "text");
  const back = createField("Back", "text");
  const topic = createField("Topic", "text");
  const items = createField("items", "array", { children: [createField("item", "object", { children: [front, back, topic] })] });
  template.fields = [items];
  const layout = createLayout("Cards", "card-a6");
  template.layouts = [layout];
  layout.pages[0].elements = [
    createGroup({
      name: "Card",
      frame: { x: 0, y: 0, w: 148, h: 105 },
      layout: { mode: "free", gap: 0 },
      repeat: { fieldId: items.id, mode: "page" },
      children: [
        createShape("rect", { frame: { x: 6, y: 6, w: 136, h: 93 }, style: defaultStyle({ fill: "#ffffff", stroke: "#d2d2d7", strokeWidth: 0.3, radius: 4 }) }),
        createText({ type: "field", fieldId: topic.id }, { frame: { x: 12, y: 12, w: 124, h: 8 }, placeholder: "Vocabulary", style: defaultStyle({ fontSize: 8, color: "#0060c0", fontWeight: "bold" }) }),
        createText({ type: "field", fieldId: front.id }, { frame: { x: 12, y: 30, w: 124, h: 30 }, placeholder: "perro", style: defaultStyle({ fontSize: 22, fontWeight: "bold", align: "center" }) }),
        createShape("line", { frame: { x: 12, y: 66, w: 124, h: 0.4 } }),
        createText({ type: "field", fieldId: back.id }, { frame: { x: 12, y: 70, w: 124, h: 22 }, placeholder: "dog", style: defaultStyle({ fontSize: 14, align: "center", color: "#6e6e73" }) })
      ]
    })
  ];
  return template;
}
