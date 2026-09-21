import type { Element, FieldDef, Template } from "./types";
import { createField, createGroup, createLayout, createShape, createTemplate, createText, defaultStyle, slug } from "./model";

/** Any template row from the database → v3. Returns null for rows that have nothing usable. */
export function migrateToV3(saved: any): Template {
  // Already a v3 template object (e.g. an agent's stored output composition).
  if (saved?.version === 3 && Array.isArray(saved.layouts)) return saved as Template;
  if (saved?.templateV3?.version === 3) return { ...saved.templateV3, name: saved.name || saved.templateV3.name };
  if (saved?.docModel) return fromDocModelV2(saved);
  return fromLegacy(saved);
}

/** v2 docModel (pages → elements with text/field types, groups with repeat.source) → v3. */
function fromDocModelV2(saved: any): Template {
  const doc = saved.docModel;
  const template = createTemplate(saved.name || doc.name || "Imported template");
  const fieldsByName = new Map<string, FieldDef>();
  const perItem: FieldDef[] = [];
  const once: FieldDef[] = [];
  const ensureField = (name: string, isList: boolean, inRepeat: boolean): FieldDef => {
    const key = slug(name);
    if (fieldsByName.has(key)) return fieldsByName.get(key)!;
    const field = isList ? createField(name, "array", { children: [createField(`${name} item`, "text")] }) : createField(name, "text");
    fieldsByName.set(key, field);
    (inRepeat ? perItem : once).push(field);
    return field;
  };
  const convert = (element: any, inRepeat: boolean): Element => {
    const frame = { x: Number(element.x || 0), y: Number(element.y || 0), w: Number(element.w || 0), h: Number(element.h || 0) };
    const style = defaultStyle(element.style || {});
    if (element.type === "text") return createText({ type: "static", value: String(element.content || "") }, { frame, style });
    if (element.type === "field") {
      const isList = ["list", "choices"].includes(element.display);
      const field = ensureField(String(element.path || "field"), isList, inRepeat);
      if (isList) {
        return createGroup({ name: `${field.name} list`, frame, layout: { mode: "vertical", gap: 1 }, repeat: { fieldId: field.id, mode: "flow" }, children: [createText({ type: "field", fieldId: field.children![0].id }, { frame: { x: 0, y: 0, w: frame.w, h: 5 }, style })] });
      }
      if (element.display === "image") return { ...createText({ type: "field", fieldId: field.id }), type: "image", frame, style } as unknown as Element;
      return createText({ type: "field", fieldId: field.id }, { frame, style, placeholder: element.placeholder || "" });
    }
    if (element.type === "image") return { ...createText({ type: "static", value: String(element.src || "") }), type: "image", frame, style } as unknown as Element;
    if (element.type === "rect") return createShape("rect", { frame, style: defaultStyle({ fill: element.style?.fill, stroke: element.style?.stroke, radius: element.style?.radius }) });
    if (element.type === "line") return createShape("line", { frame, style: defaultStyle({ stroke: element.style?.stroke }) });
    if (element.type === "group") {
      const repeats = Boolean(element.repeat?.source);
      const group = createGroup({ name: element.label || "Group", frame, layout: { mode: "free", gap: Number(element.gap ?? 4) }, children: (element.children || []).map((child: any) => convert(child, inRepeat || repeats)) });
      if (repeats) group.repeat = { fieldId: "__items__", mode: "flow" };
      return group;
    }
    return createText({ type: "static", value: "" }, { frame });
  };
  const layout = createLayout("Document", doc.format && doc.format !== "custom" ? doc.format.replace("ppt-", "slides-") : "a4-portrait");
  if (doc.pageSize) layout.canvas = { width: doc.pageSize.width, height: doc.pageSize.height, unit: "mm" };
  if (doc.margins) layout.margins = { ...doc.margins };
  layout.pages = (doc.pages || []).map((page: any) => ({
    id: page.id || `page_${Math.random().toString(36).slice(2, 8)}`,
    background: page.background?.src ? { type: "image" as const, src: page.background.src, locked: true, visible: true, opacity: 1 } : { type: "none" as const },
    elements: (page.elements || []).map((element: any) => convert(element, Boolean(page.repeat?.source)))
  }));
  const items = createField("items", "array", { children: [createField("item", "object", { children: perItem })] });
  const fix = (elements: Element[]): Element[] => elements.map((element) => {
    if (element.type !== "group") return element;
    const group = { ...element, children: fix(element.children) };
    if (group.repeat?.fieldId === "__items__") group.repeat = { fieldId: items.id, mode: "flow" };
    return group;
  });
  layout.pages = layout.pages.map((page) => ({ ...page, elements: fix(page.elements) }));
  // v2 page repeat → wrap the page's elements in a page-repeat group
  (doc.pages || []).forEach((page: any, index: number) => {
    if (page.repeat?.source && layout.pages[index]) {
      const wrapper = createGroup({ name: "Card", frame: { x: 0, y: 0, w: layout.canvas.width, h: layout.canvas.height }, layout: { mode: "free", gap: 0 }, repeat: { fieldId: items.id, mode: "page" }, children: layout.pages[index].elements });
      layout.pages[index].elements = [wrapper];
    }
  });
  template.fields = perItem.length ? [...once, items] : once;
  template.layouts = [layout];
  return template;
}

/** Legacy block/list templates: their field tags become a vertical flow group. */
function fromLegacy(saved: any): Template {
  const template = createTemplate(saved?.name || "Imported template");
  const layout = template.layouts[0];
  const dataFields: any[] = Array.isArray(saved?.dataFields) ? saved.dataFields : [];
  const perItem = dataFields.filter((field) => field.repeatScope !== "once").map((field) => (field.dataType === "array" ? createField(field.label || field.name, "array", { children: [createField(`${field.name} item`, "text")] }) : createField(field.label || field.name, "text")));
  const once = dataFields.filter((field) => field.repeatScope === "once").map((field) => createField(field.label || field.name, "text"));
  const items = createField("items", "array", { children: [createField("item", "object", { children: perItem })] });
  template.fields = perItem.length ? [...once, items] : once;
  const children: Element[] = perItem.map((field, index) => (field.type === "array"
    ? createGroup({ name: `${field.name} list`, frame: { x: 0, y: index * 9, w: 180, h: 12 }, layout: { mode: "vertical", gap: 1 }, repeat: { fieldId: field.id, mode: "flow" }, children: [createText({ type: "field", fieldId: field.children![0].id }, { frame: { x: 0, y: 0, w: 180, h: 5 } })] })
    : createText({ type: "field", fieldId: field.id }, { frame: { x: 0, y: index * 9, w: 180, h: 8 } })));
  layout.pages[0].elements = [
    createText({ type: "static", value: saved?.name || "Title" }, { frame: { x: 12, y: 14, w: 150, h: 10 }, style: defaultStyle({ fontSize: 18, fontWeight: "bold" }) }),
    ...(perItem.length ? [createGroup({ name: "Imported group", frame: { x: 12, y: 30, w: 186, h: Math.max(20, perItem.length * 9 + 4) }, layout: { mode: "vertical", gap: 2 }, repeat: { fieldId: items.id, mode: "flow" }, children })] : [])
  ];
  return template;
}

/** Ensures a parsed JSON blob is a v3 template (fills defaults for missing pieces). */
export function normalizeTemplate(input: any): Template {
  const template = input && input.version === 3 ? (input as Template) : migrateToV3(input);
  if (!template.layouts?.length) template.layouts = [createLayout("Document")];
  for (const layout of template.layouts) {
    if (!layout.views?.length) layout.views = [{ id: "view_default", name: "Default", overrides: {} }];
    if (!layout.margins) layout.margins = { top: 12, right: 12, bottom: 12, left: 12 };
    if (!layout.pages?.length) layout.pages = [{ id: "page_1", background: { type: "none" }, elements: [] }];
  }
  template.fields = template.fields || [];
  return template;
}
