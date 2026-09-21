/**
 * Small, model-friendly description of a component ("DSL") → BlockDef. The chatbot fills this
 * shape; we validate and convert it to real elements. Units: mm on a 186 mm wide block.
 */
import type { Element, FieldDef } from "./types";
import { createField, createGroup, createShape, createText, defaultStyle, createId } from "./model";
import type { BlockDef } from "./blocks";

export interface DslField { name: string; type?: "text" | "rich_text" | "number" | "boolean" | "image" | "formula"; list?: boolean; description?: string; options?: string[] }
export interface DslElement {
  kind: "text" | "field" | "box" | "circle" | "line";
  /** text: the fixed text; field: the field name it shows. */
  text?: string;
  field?: string;
  x: number; y: number; w: number; h: number;
  size?: number; bold?: boolean; color?: string; align?: "left" | "center" | "right";
  fill?: string; stroke?: string; radius?: number;
  /** Text rotation: 90 (reads bottom→top) or -90 (top→bottom); frame = the unrotated box centred where the text goes. */
  rotate?: number;
}
export interface DslComponent {
  name: string;
  description: string;
  /** Fields once per document. */
  fields: DslField[];
  /** Name of the repeating list and the fields of each of its items (omit for a once-only block). */
  list?: { name: string; itemFields: DslField[]; description?: string; columns?: number; sampleCount?: number } | null;
  /** Elements of one item (or of the block when there is no list). */
  elements: DslElement[];
  /** Elements drawn once above the repeating part (title etc.). */
  header?: DslElement[];
  height: number;
  headerHeight?: number;
  accent?: string;
}

const fieldDef = (f: DslField): FieldDef => {
  const type = f.type || "text";
  return f.list ? createField(f.name, "array", { description: f.description, children: [createField(`${f.name} value`, type)] }) : createField(f.name, type, { description: f.description, options: f.options });
};

function elementFrom(el: DslElement, byName: Map<string, FieldDef>): Element | null {
  const frame = { x: Number(el.x) || 0, y: Number(el.y) || 0, w: Math.max(1, Number(el.w) || 10), h: Math.max(0.3, Number(el.h) || 6) };
  const style = defaultStyle({ fontSize: el.size || 10, fontWeight: el.bold ? "bold" : "normal", color: el.color || "#1d1d1f", align: el.align || "left", fill: el.fill, stroke: el.stroke, strokeWidth: el.stroke ? 0.35 : undefined, radius: el.radius, rotate: el.rotate || undefined });
  if (el.kind === "text") return createText({ type: "static", value: String(el.text || "") }, { frame, style });
  if (el.kind === "field") {
    const field = byName.get(String(el.field || "").toLowerCase());
    if (!field) return null;
    const target = field.type === "array" ? field.children?.[0] : field;
    if (!target) return null;
    return createText({ type: "field", fieldId: target.id }, { frame, style, placeholder: el.text || target.name, format: target.type === "rich_text" ? "rich" : "plain" });
  }
  if (el.kind === "box") return createShape("rect", { frame, style: defaultStyle({ fill: el.fill || "#f5f5f7", stroke: el.stroke || "", strokeWidth: 0.35, radius: el.radius ?? 2 }) });
  if (el.kind === "circle") return createShape("ellipse", { frame, style: defaultStyle({ fill: el.fill || "#ffffff", stroke: el.stroke || "#1d1d1f", strokeWidth: 0.35 }) });
  return createShape("line", { frame: { ...frame, h: 0.3 }, style: defaultStyle({ stroke: el.stroke || "#d2d2d7", strokeWidth: 0.3 }) });
}

export function blockFromDsl(dsl: DslComponent): BlockDef {
  const once = (dsl.fields || []).map(fieldDef);
  const byName = new Map<string, FieldDef>();
  once.forEach((f) => byName.set(f.name.toLowerCase(), f));
  let listField: FieldDef | null = null;
  if (dsl.list && dsl.list.name) {
    const itemFields = (dsl.list.itemFields || []).map(fieldDef);
    itemFields.forEach((f) => byName.set(f.name.toLowerCase(), f));
    listField = createField(dsl.list.name, "array", { description: dsl.list.description, sampleCount: dsl.list.sampleCount || undefined, children: [createField("item", "object", { children: itemFields })] });
  }
  const headerEls = (dsl.header || []).map((el) => elementFrom(el, byName)).filter((el): el is Element => Boolean(el));
  const itemEls = (dsl.elements || []).map((el) => elementFrom(el, byName)).filter((el): el is Element => Boolean(el));
  const headerH = Math.max(0, Number(dsl.headerHeight) || (headerEls.length ? Math.max(...headerEls.map((e) => e.frame.y + e.frame.h)) + 2 : 0));
  const itemH = Math.max(6, Number(dsl.height) || Math.max(...itemEls.map((e) => e.frame.y + e.frame.h), 6));
  const children: Element[] = [...headerEls];
  if (listField && dsl.list) {
    // Nested lists inside the item (e.g. options) repeat inside the item via a nested group.
    const nested = listField.children![0].children!.filter((f) => f.type === "array");
    const boundTo = (e: Element): string => (e.type === "text" && e.source.type === "field" ? e.source.fieldId : "");
    const itemChildren = itemEls.filter((e) => !nested.some((n) => n.children?.[0]?.id === boundTo(e)));
    for (const n of nested) {
      const bound = itemEls.filter((e) => boundTo(e) === n.children?.[0]?.id);
      if (!bound.length) continue;
      const top = Math.min(...bound.map((b) => b.frame.y));
      itemChildren.push(createGroup({ name: n.name, frame: { x: 0, y: top, w: 186, h: Math.max(...bound.map((b) => b.frame.y + b.frame.h)) - top + 6 }, layout: { mode: "vertical", gap: 1.2 }, repeat: { fieldId: n.id, mode: "flow" }, children: bound.map((b) => ({ ...b, frame: { ...b.frame, y: 0 } })) }));
    }
    const columns = Math.max(1, Number(dsl.list.columns) || 1);
    const cellW = columns > 1 ? Math.floor(186 / columns) - 3 : 186;
    // One item = a free-layout group (so the grid places whole items, not their parts).
    const item = createGroup({ name: `${dsl.list.name} item`, frame: { x: 0, y: 0, w: cellW, h: itemH }, layout: { mode: "free", gap: 0 }, repeat: null, children: itemChildren.map((e) => ({ ...e, frame: { ...e.frame, w: Math.min(e.frame.w, cellW - e.frame.x) } })) });
    children.push(createGroup({ name: dsl.list.name, frame: { x: 0, y: headerH, w: 186, h: itemH }, layout: { mode: columns > 1 ? "grid" : "vertical", gap: 3, columns: columns > 1 ? columns : undefined }, repeat: { fieldId: listField.id, mode: columns > 1 ? "grid" : "flow", columns: columns > 1 ? columns : undefined }, children: [item] }));
  } else {
    children.push(...itemEls);
  }
  const group = createGroup({ name: dsl.name, frame: { x: 12, y: 12, w: 186, h: headerH + itemH }, layout: { mode: "free", gap: 3 }, repeat: null, children });
  return { id: `block-ai-${createId("c")}`, name: dsl.name, description: dsl.description || "", category: "custom", icon: "✨", family: dsl.name, fields: [...once, ...(listField ? [listField] : [])], elements: [group], builtIn: false, author: "Luna AI" };
}
