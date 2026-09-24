import type { Template } from "../engine/types";
import { flattenFields, slug } from "../engine/model";

/**
 * Compiles a v3 template into the row the repository stores and the shape agents already
 * understand: `dataFields` (per-item vs once) + `repeatCollectionField = "items"`. The full model
 * travels as `templateV3`; `docModel`/`studio` are left null so the render route picks v3.
 */
export function compileForSave(template: Template, savedId: string) {
  // Leaf scalars + arrays (nested arrays included); skip objects and the scalar item of an array (path ends with "[]").
  const flat = flattenFields(template.fields).filter((entry) => entry.field.type !== "object" && !entry.path.endsWith("[]"));
  const dataFields = flat.map((entry) => {
    const perItem = entry.parents.some((parent) => parent.type === "array");
    return { id: entry.field.id, name: slug(entry.field.name), label: entry.field.name, dataType: entry.field.type === "array" ? "array" : entry.field.type === "number" ? "number" : "string", repeatScope: perItem ? "per-output" : "once", description: entry.field.description || "" };
  }).filter((entry) => entry.name !== "items");
  // The list the agent's items fill: the template's own list name, so the layout engine finds it.
  const collection = template.fields.find((field) => field.type === "array");
  const primary = template.layouts[0];
  return {
    id: savedId || template.id,
    name: template.name,
    pageFormat: primary?.class === "slides" ? "ppt-16-9" : "a4-portrait",
    containerClass: "luna-doc",
    css: "",
    blockClasses: {},
    blockHtmlTemplates: {},
    blockFormats: {},
    components: [],
    canvasBlocks: [],
    pageLayouts: [],
    dataBindings: {},
    dataFields,
    repeatCollectionField: collection ? slug(collection.name) : "",
    renderVariants: [],
    formatSets: [],
    docModel: null,
    studio: null,
    templateV3: template
  };
}
