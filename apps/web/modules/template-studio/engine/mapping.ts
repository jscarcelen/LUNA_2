import type { FieldDef, FieldType, SchemaMapping, SchemaNode, DataObject, DataValue } from "./types";
import { flattenFields, slug } from "./model";

/* ---------------------------------------------------------------- agent schema → tree */

interface AgentField { name: string; label?: string; type?: string; repeatScope?: string; description?: string }

/** Agents describe a flat list of per-item fields; the runtime wraps them as { items: [...] }. */
export function schemaFromAgentFields(fields: AgentField[]): SchemaNode[] {
  const leaf = (field: AgentField, prefix: string): SchemaNode => {
    const type: FieldType = field.type === "array" ? "array" : field.type === "number" ? "number" : field.type === "boolean" ? "boolean" : "text";
    const node: SchemaNode = { path: `${prefix}${field.name}`, name: field.label || field.name, type, description: field.description };
    if (type === "array") node.children = [{ path: `${prefix}${field.name}[]`, name: `${field.label || field.name} item`, type: "text" }];
    return node;
  };
  const once = fields.filter((field) => field.repeatScope === "once").map((field) => leaf(field, ""));
  const perItem = fields.filter((field) => field.repeatScope !== "once");
  if (!perItem.length) return once;
  return [...once, { path: "items", name: "items", type: "array", children: [{ path: "items[]", name: "item", type: "object", children: perItem.map((field) => leaf(field, "items[].")) }] }];
}

/** Schema tree from a sample/real JSON payload (for agent-less templates or custom data). */
export function schemaFromData(data: DataValue, path = "", name = "root"): SchemaNode[] {
  if (Array.isArray(data)) {
    const first = data[0];
    return [{ path, name, type: "array", children: first === undefined ? [] : Array.isArray(first) || (first && typeof first === "object") ? [{ path: `${path}[]`, name: "item", type: "object", children: schemaFromData(first, `${path}[]`, "item").flatMap((n) => n.children || [n]) }] : [{ path: `${path}[]`, name: "item", type: typeof first === "number" ? "number" : typeof first === "boolean" ? "boolean" : "text" }] }];
  }
  if (data && typeof data === "object") {
    return Object.entries(data).map(([key, value]) => {
      const childPath = path ? `${path}.${key}` : key;
      if (Array.isArray(value) || (value && typeof value === "object")) return schemaFromData(value, childPath, key)[0];
      return { path: childPath, name: key, type: typeof value === "number" ? "number" : typeof value === "boolean" ? "boolean" : "text" };
    });
  }
  return [{ path, name, type: "text" }];
}

export function flattenSchema(nodes: SchemaNode[]): SchemaNode[] {
  return nodes.flatMap((node) => [node, ...flattenSchema(node.children || [])]);
}

/* ---------------------------------------------------------------- proposals */

function similarity(a: string, b: string): number {
  const x = slug(a);
  const y = slug(b);
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.85;
  const ax = new Set(x.split("_"));
  const by = new Set(y.split("_"));
  const shared = [...ax].filter((token) => by.has(token)).length;
  return shared ? 0.5 + 0.3 * (shared / Math.max(ax.size, by.size)) : 0;
}

function typeCompatible(field: FieldDef, node: SchemaNode): boolean {
  if (field.type === "array") return node.type === "array";
  if (field.type === "object") return node.type === "object";
  return node.type !== "array" && node.type !== "object";
}

export interface MappingProposal { fieldId: string; path: string; score: number }

/**
 * Proposes agent paths for template fields by name similarity + type compatibility, keeping
 * parent/child structure consistent (children of a mapped array map inside that array's items).
 */
export function proposeMapping(fields: FieldDef[], schema: SchemaNode[], existing: SchemaMapping = {}): MappingProposal[] {
  const flatFields = flattenFields(fields);
  const flatSchema = flattenSchema(schema);
  const proposals: MappingProposal[] = [];
  const used = new Set<string>(Object.values(existing));
  for (const entry of flatFields) {
    if (existing[entry.field.id]) {
      proposals.push({ fieldId: entry.field.id, path: existing[entry.field.id], score: 1 });
      continue;
    }
    const parentArray = [...entry.parents].reverse().find((parent) => parent.type === "array");
    const parentPath = parentArray ? proposals.find((item) => item.fieldId === parentArray.id)?.path : undefined;
    let best: MappingProposal | null = null;
    for (const node of flatSchema) {
      if (!typeCompatible(entry.field, node)) continue;
      if (parentPath && !node.path.startsWith(`${parentPath}[]`)) continue;
      if (!parentPath && node.path.includes("[]") && entry.field.type !== "array" && !entry.parents.length) {
        // Root scalar fields shouldn't grab per-item paths unless nothing else matches.
        const score = similarity(entry.field.name, node.name) * 0.6;
        if (score > (best?.score || 0)) best = { fieldId: entry.field.id, path: node.path, score };
        continue;
      }
      const score = similarity(entry.field.name, node.name) * (used.has(node.path) ? 0.7 : 1);
      if (score > (best?.score || 0)) best = { fieldId: entry.field.id, path: node.path, score };
    }
    if (best && best.score >= 0.5) {
      proposals.push(best);
      used.add(best.path);
    }
  }
  return proposals;
}

/* ---------------------------------------------------------------- apply mapping to real output */

function getByPath(data: DataValue, path: string): DataValue | undefined {
  return path.split(".").reduce<DataValue | undefined>((acc, key) => (acc && typeof acc === "object" && !Array.isArray(acc) ? (acc as DataObject)[key] : undefined), data);
}

/**
 * Reshapes agent output into the template's data shape (keys = slug(field name)) following a
 * mapping. Array paths ("items[]") map arrays; child fields resolve relative to each item.
 */
export function applyMapping(fields: FieldDef[], mapping: SchemaMapping, output: DataObject): DataObject {
  const build = (defs: FieldDef[], source: DataValue, basePath: string): DataObject => {
    const result: DataObject = {};
    for (const field of defs) {
      const path = mapping[field.id];
      const relative = path && basePath && path.startsWith(`${basePath}[].`) ? path.slice(basePath.length + 3) : path && !basePath ? path : path && path.startsWith(`${basePath}.`) ? path.slice(basePath.length + 1) : undefined;
      if (field.type === "array") {
        const listPath = relative ?? slug(field.name);
        const raw = getByPath(source, listPath.replace(/\[\]$/, ""));
        const list = Array.isArray(raw) ? raw : [];
        const item = field.children?.[0];
        result[slug(field.name)] = item?.type === "object"
          ? list.map((entry) => build(item.children || [], entry, `${path || listPath}`.replace(/\[\]$/, "")))
          : list;
        continue;
      }
      if (field.type === "object") {
        result[slug(field.name)] = build(field.children || [], relative ? getByPath(source, relative) ?? source : source, path || basePath);
        continue;
      }
      const value = relative ? getByPath(source, relative) : getByPath(source, slug(field.name));
      if (value !== undefined) result[slug(field.name)] = value;
    }
    return result;
  };
  return build(fields, output, "");
}
