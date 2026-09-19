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
  const rest = outputSchema.filter((field) => field !== primary);
  const properties: Record<string, JsonSchema> = {};
  if (primary) properties.items = { ...fieldToJsonSchema(primary), minItems: 1 };
  for (const field of rest) properties[slug(field.name)] = fieldToJsonSchema(field);
  return { type: "object", additionalProperties: false, properties, required: Object.keys(properties) };
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
