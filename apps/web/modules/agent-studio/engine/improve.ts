import type { AgentSpec, SpecChange } from "./types";
import { QUICK_ACTIONS } from "./model";

export interface ImproveResult { spec: AgentSpec; changes: SpecChange[] }

/** Deterministic quick actions: append/replace constraints on the spec. */
export function applyQuickAction(spec: AgentSpec, actionId: string): ImproveResult {
  const action = QUICK_ACTIONS.find((item) => item.id === actionId);
  if (!action) return { spec, changes: [] };
  const constraints = spec.instructions.constraints.filter((line) => !sameIntent(line, action.id));
  const next = { ...spec, instructions: { ...spec.instructions, constraints: [...constraints, action.feedback] }, updatedAt: new Date().toISOString() };
  return { spec: next, changes: [{ path: "instructions.constraints", before: spec.instructions.constraints.join(" · ") || "(none)", after: next.instructions.constraints.join(" · ") }] };
}

function sameIntent(line: string, actionId: string): boolean {
  const l = line.toLowerCase();
  if (actionId === "harder") return l.includes("beginner") || l.includes("simpler");
  if (actionId === "easier") return l.includes("advanced") || l.includes("challenging");
  return QUICK_ACTIONS.find((a) => a.id === actionId)?.feedback === line;
}

/** Applies model-produced patches (from /api/ai-tools/agent-builder/improve) to a spec. */
export interface SpecPatch { target: "instructions.core" | "instructions.style" | "instructions.constraints" | "field.description" | "example.note"; fieldId?: string; value: string }

export function applyPatches(spec: AgentSpec, patches: SpecPatch[]): ImproveResult {
  let next: AgentSpec = { ...spec, instructions: { ...spec.instructions, constraints: [...spec.instructions.constraints] }, outputSchema: JSON.parse(JSON.stringify(spec.outputSchema)) };
  const changes: SpecChange[] = [];
  for (const patch of patches) {
    if (patch.target === "instructions.core") { changes.push({ path: "instructions.core", before: next.instructions.core, after: patch.value }); next.instructions.core = patch.value; }
    else if (patch.target === "instructions.style") { changes.push({ path: "instructions.style", before: next.instructions.style || "", after: patch.value }); next.instructions.style = patch.value; }
    else if (patch.target === "instructions.constraints") { if (!next.instructions.constraints.includes(patch.value)) { changes.push({ path: "instructions.constraints", before: next.instructions.constraints.join(" · ") || "(none)", after: [...next.instructions.constraints, patch.value].join(" · ") }); next.instructions.constraints.push(patch.value); } }
    else if (patch.target === "field.description" && patch.fieldId) {
      const walk = (fields: typeof next.outputSchema): void => { for (const field of fields) { if (field.id === patch.fieldId) { changes.push({ path: `field "${field.name}" description`, before: field.description || "", after: patch.value }); field.description = patch.value; } if (field.children) walk(field.children); } };
      walk(next.outputSchema);
    }
  }
  next = { ...next, updatedAt: new Date().toISOString() };
  return { spec: next, changes };
}
