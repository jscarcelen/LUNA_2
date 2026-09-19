"use client";

import type { AgentSpec } from "./engine/types";
import { MODEL_OPTIONS } from "./engine/model";
import { outputJsonSchema } from "./engine/schema";
import { card, field, label, kicker } from "./ui";

export function AdvancedEditor({ spec, onChange }: { spec: AgentSpec; onChange: (updater: (spec: AgentSpec) => AgentSpec) => void }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className={`${card} grid gap-3 p-5`}>
        <p className={kicker}>Instructions</p>
        <div><label className={label}>Core</label><textarea className={`${field} min-h-32`} value={spec.instructions.core} onChange={(event) => onChange((s) => ({ ...s, instructions: { ...s.instructions, core: event.target.value } }))} /></div>
        <div><label className={label}>Style</label><input className={field} value={spec.instructions.style || ""} onChange={(event) => onChange((s) => ({ ...s, instructions: { ...s.instructions, style: event.target.value } }))} /></div>
        <div><label className={label}>Rules (one per line)</label><textarea className={`${field} min-h-24`} value={spec.instructions.constraints.join("\n")} onChange={(event) => onChange((s) => ({ ...s, instructions: { ...s.instructions, constraints: event.target.value.split("\n").map((l) => l.trim()).filter(Boolean) } }))} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className={label}>Model</label><select className={field} value={spec.model.model} onChange={(event) => onChange((s) => ({ ...s, model: { ...s.model, model: event.target.value } }))}>{MODEL_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></div>
          <div><label className={label}>Creativity</label><select className={field} value={spec.model.creativity} onChange={(event) => onChange((s) => ({ ...s, model: { ...s.model, creativity: event.target.value as AgentSpec["model"]["creativity"] } }))}><option value="low">Low (consistent)</option><option value="medium">Medium</option><option value="high">High (varied)</option></select></div>
        </div>
      </section>
      <section className={`${card} p-5`}>
        <p className={kicker}>Output schema (generated)</p>
        <pre className="mt-2 max-h-96 overflow-auto rounded-xl bg-[var(--surface-soft)] p-3 font-mono text-[11px] text-ink">{JSON.stringify(outputJsonSchema(spec.outputSchema), null, 2)}</pre>
        <p className="m-0 mt-2 text-xs text-soft-ink">Edit fields in step 4; this schema is derived from them.</p>
      </section>
    </div>
  );
}
