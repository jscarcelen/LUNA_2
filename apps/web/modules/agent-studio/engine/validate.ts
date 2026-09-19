import type { AgentSpec, DataObject, ValidationCheck } from "./types";
import { collectionFields, primaryCollection } from "./model";
import { findField } from "../../template-studio/engine/model";
import { slug } from "../../template-studio/engine/model";

function key(spec: AgentSpec, fieldId: string): string {
  const field = findField(spec.outputSchema, fieldId);
  return field ? slug(field.name) : fieldId;
}

/** Runs the agent's validation rules against one output. Structural, deterministic, cheap. */
export function validateOutput(spec: AgentSpec, output: DataObject | null, inputValues: Record<string, unknown> = {}): ValidationCheck[] {
  const checks: ValidationCheck[] = [];
  if (!output || typeof output !== "object") return [{ rule: "valid_json", ok: false, message: "The agent did not return valid JSON." }];
  checks.push({ rule: "valid_json", ok: true, message: "Valid JSON" });
  const items = Array.isArray(output.items) ? (output.items as DataObject[]) : [];
  const primary = primaryCollection(spec);
  for (const rule of spec.validationRules) {
    if (rule.type === "required_fields") {
      const required = collectionFields(primary).filter((field) => field.required !== false).map((field) => slug(field.name));
      const missing = items.flatMap((item, index) => required.filter((name) => item[name] === undefined || item[name] === null || item[name] === "").map((name) => `item ${index + 1}: ${name}`));
      checks.push({ rule: rule.type, ok: missing.length === 0, message: missing.length ? `Missing ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "…" : ""}` : "All required fields present" });
    }
    if (rule.type === "count_matches_input") {
      const wanted = Number(inputValues[rule.inputId]);
      if (!Number.isFinite(wanted) || !wanted) continue;
      checks.push({ rule: rule.type, ok: items.length === wanted, message: items.length === wanted ? `Exactly ${wanted} items` : `${items.length} items, ${wanted} requested` });
    }
    if (rule.type === "no_duplicates") {
      const k = key(spec, rule.byFieldId);
      const seen = new Set<string>();
      const dupes = items.filter((item) => { const v = String(item[k] ?? "").trim().toLowerCase(); if (!v) return false; if (seen.has(v)) return true; seen.add(v); return false; });
      checks.push({ rule: rule.type, ok: dupes.length === 0, message: dupes.length ? `${dupes.length} duplicate ${k}${dupes.length === 1 ? "" : "s"}` : "No duplicates" });
    }
    if (rule.type === "answer_in_options") {
      const a = key(spec, rule.answerFieldId);
      const o = key(spec, rule.optionsFieldId);
      const bad = items.filter((item) => Array.isArray(item[o]) && (item[o] as unknown[]).length > 0 && !(item[o] as unknown[]).map((x) => String(x).trim().toLowerCase()).includes(String(item[a] ?? "").trim().toLowerCase()));
      checks.push({ rule: rule.type, ok: bad.length === 0, message: bad.length ? `${bad.length} answer${bad.length === 1 ? " is" : "s are"} not among the options` : "Every answer is one of its options" });
    }
    if (rule.type === "options_count") {
      const o = key(spec, rule.optionsFieldId);
      const bad = items.filter((item) => Array.isArray(item[o]) && (item[o] as unknown[]).length !== rule.count);
      checks.push({ rule: rule.type, ok: bad.length === 0, message: bad.length ? `${bad.length} item${bad.length === 1 ? "" : "s"} without ${rule.count} options` : `${rule.count} options per item` });
    }
  }
  return checks;
}
