import type { AgentSpec } from "./types";
import type { FieldDef } from "../../template-studio/engine/types";

/** What the refinement depends on: intent, inputs and output shape. Changing any of it invalidates the brief. */
export function specHash(spec: AgentSpec): string {
  const fields: string[] = [];
  const walk = (list: FieldDef[]) => list.forEach((f) => { fields.push(`${f.name}:${f.type}:${f.description || ""}:${f.fromInputId ? "u" : ""}`); if (f.children) walk(f.children); });
  walk(spec.outputSchema || []);
  const text = JSON.stringify([spec.name, spec.purpose, spec.instructions, spec.inputs.map((i) => [i.name, i.type, i.options, i.description]), spec.contextSlots.map((c) => [c.name, c.kind, c.usage, c.description]), fields]);
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return String(hash >>> 0);
}

export function isRefined(spec: AgentSpec): boolean {
  return Boolean(spec.refined && spec.refined.sourceHash === specHash(spec));
}

/** Asks the (hidden) metaprompt agent for a refined brief. Returns the spec unchanged on failure. */
export async function ensureRefined(spec: AgentSpec): Promise<AgentSpec> {
  if (isRefined(spec)) return spec;
  if (!String(spec.instructions.core || spec.purpose.description || "").trim()) return spec;
  try {
    const response = await fetch("/api/ai-tools/agent-builder/refine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spec }) });
    const data = await response.json();
    if (!response.ok || !data?.refined) return spec;
    return { ...spec, refined: { ...data.refined, sourceHash: specHash(spec), at: new Date().toISOString() } };
  } catch {
    return spec;
  }
}
