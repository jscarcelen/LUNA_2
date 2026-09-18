import type { DataObject, DataValue, Element, FieldDef, Template } from "./types";
import { slug, walkElements } from "./model";

/** Placeholders declared on text elements, by field id — used to make sample data look real. */
function placeholders(template: Template): Record<string, string> {
  const out: Record<string, string> = {};
  for (const layout of template.layouts) for (const page of layout.pages) walkElements(page.elements, (element: Element) => {
    if (element.type === "text" && element.source.type === "field" && element.placeholder) out[element.source.fieldId] = element.placeholder;
  });
  return out;
}

function sampleFor(field: FieldDef, index: number, hints: Record<string, string>, itemCount: number): DataValue {
  const hint = hints[field.id];
  switch (field.type) {
    case "number": return index + 1;
    case "boolean": return index % 2 === 0;
    case "image": return "";
    case "formula": return hint || "E = mc^2";
    case "object": return Object.fromEntries((field.children || []).map((child) => [slug(child.name), sampleFor(child, index, hints, itemCount)]));
    case "array": {
      const item = field.children?.[0];
      if (!item) return [];
      const count = item.type === "object" ? itemCount : 3;
      return Array.from({ length: count }, (_, i) => (item.type === "object" ? sampleFor(item, i, hints, itemCount) : hint ? `${hint} ${i + 1}` : `${field.name} ${i + 1}`));
    }
    default: {
      if (slug(field.name) === "number") return String(index + 1);
      if (hint) return index ? `${hint} (${index + 1})` : hint;
      return index ? `Sample ${field.name.toLowerCase()} ${index + 1}` : `Sample ${field.name.toLowerCase()}`;
    }
  }
}

/** Sample data shaped like the template's field tree. Top-level arrays get `itemCount` items. */
export function buildSampleData(template: Template, itemCount = 3): DataObject {
  const hints = placeholders(template);
  const data: DataObject = {};
  for (const field of template.fields) data[slug(field.name)] = sampleFor(field, 0, hints, itemCount);
  return data;
}
