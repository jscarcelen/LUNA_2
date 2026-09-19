import type { FieldDef } from "./types";
import { slug } from "../../template-studio/engine/model";

type JsonSchema = Record<string, unknown>;

function leaf(field: FieldDef): JsonSchema {
  const base: JsonSchema = {};
  if (field.description) base.description = field.description;
  switch (field.type) {
    case "number": return { ...base, type: "number" };
    case "boolean": return { ...base, type: "boolean" };
    case "rich_text": return { ...base, type: "string", description: `${field.description || field.name} (Markdown; inline $...$ and block $$...$$ LaTeX allowed)` };
    case "image": return { ...base, type: "string", description: `${field.description || field.name} (image URL)` };
    case "formula": return { ...base, type: "string", description: `${field.description || field.name} (LaTeX)` };
    default: return { ...base, type: "string" };
  }
}

export function fieldToJsonSchema(field: FieldDef): JsonSchema {
  if (field.type === "array") {
    const item = field.children?.[0];
    return { type: "array", description: field.description, items: item ? fieldToJsonSchema(item) : { type: "string" } };
  }
  if (field.type === "object") return objectSchema(field.children || [], field.description);
  return leaf(field);
}

function objectSchema(fields: FieldDef[], description?: string): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  for (const field of fields) properties[slug(field.name)] = fieldToJsonSchema(field);
  // OpenAI strict mode requires every property in `required`; optional fields are described as such.
  return { type: "object", description, additionalProperties: false, properties, required: fields.map((field) => slug(field.name)) };
}

/**
 * JSON Schema for the agent output. The primary collection is always emitted under `items` so
 * the runtime, RunAgentPage and templates share one contract; other top-level fields keep their slug.
 */
export function outputJsonSchema(outputSchema: FieldDef[]): JsonSchema {
  const primary = outputSchema.find((field) => field.type === "array");
  const properties: Record<string, JsonSchema> = {};
  for (const field of outputSchema) {
    if (field === primary) properties.items = { ...fieldToJsonSchema(primary), minItems: 1 };
    else properties[slug(field.name)] = fieldToJsonSchema(field);
  }
  return { type: "object", additionalProperties: false, properties, required: Object.keys(properties) };
}

/** The JSON key a top-level output field is emitted under (the first list is always `items`). */
export function outputKey(outputSchema: FieldDef[], field: FieldDef): string {
  const primary = outputSchema.find((item) => item.type === "array");
  return field === primary ? "items" : slug(field.name);
}

/**
 * Human-readable JSON skeleton of the output, shown in the prompt and in Advanced mode so the
 * structure is unambiguous: which keys appear once, which are lists, and what each value holds.
 */
export function outputSkeleton(outputSchema: FieldDef[]): string {
  const hint = (field: FieldDef): string => `"<${field.type}${field.required === false ? ", optional" : ""}: ${field.description || field.name}>"`;
  const render = (field: FieldDef, indent: string): string => {
    if (field.type === "array") {
      const item = field.children?.[0];
      const inner = item?.type === "object"
        ? `${indent}  {\n${(item.children || []).map((child) => `${indent}    "${slug(child.name)}": ${render(child, `${indent}    `)}`).join(",\n")}\n${indent}  }`
        : `${indent}  ${item ? render(item, `${indent}  `) : '"<text>"'}`;
      return `[   // ${field.name}: one element per ${field.name.replace(/s$/i, "").toLowerCase() || "item"}, as many as needed\n${inner},\n${indent}  …\n${indent}]`;
    }
    if (field.type === "object") return `{\n${(field.children || []).map((child) => `${indent}  "${slug(child.name)}": ${render(child, `${indent}  `)}`).join(",\n")}\n${indent}}`;
    return hint(field);
  };
  const lines = outputSchema.map((field, index) => `  "${outputKey(outputSchema, field)}": ${render(field, "  ")}${index < outputSchema.length - 1 ? "," : ""}${field.type !== "array" ? "   // once per document" : ""}`);
  return `{\n${lines.join("\n")}\n}`;
}

/** Flat per-item field list in the legacy shape RunAgentPage/templates consume. */
export function legacyFields(outputSchema: FieldDef[]) {
  const primary = outputSchema.find((field) => field.type === "array");
  const item = primary?.children?.[0];
  const perItem = item?.type === "object" ? item.children || [] : item ? [item] : [];
  const once = outputSchema.filter((field) => field !== primary && field.type !== "object");
  const toLegacy = (field: FieldDef, repeatScope: "once" | "per-output") => ({
    id: field.id,
    name: slug(field.name),
    label: field.name,
    type: field.type === "array" ? "array" : field.type === "number" ? "number" : field.type === "boolean" ? "boolean" : "string",
    repeatScope,
    description: field.description || ""
  });
  return [...perItem.map((field) => toLegacy(field, "per-output")), ...once.map((field) => toLegacy(field, "once"))];
}
