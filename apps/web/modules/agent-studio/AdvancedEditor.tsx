"use client";

import type { AgentSpec } from "./engine/types";
import { MODEL_OPTIONS } from "./engine/model";
import { outputJsonSchema } from "./engine/schema";
import { compileAgent } from "./engine/compile";
import { ensureRefined, isRefined } from "./engine/refine";
import { useState } from "react";
import { card, field, label, kicker } from "./ui";

export function AdvancedEditor({ spec, onChange }: { spec: AgentSpec; onChange: (updater: (spec: AgentSpec) => AgentSpec) => void }) {
  const [refining, setRefining] = useState(false);
  const current = isRefined(spec);
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className={`${card} p-5 lg:col-span-2`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><p className={kicker}>Refined brief (automatic)</p><p className="m-0 mt-1 text-xs text-soft-ink">Luna rewrites your wording into a precise brief for the model before each run — same intent, ambiguities resolved, missing rules added. {current ? "Up to date." : "Will be refreshed on the next test or save."}</p></div>
          <button type="button" className="rounded-full border border-ink/15 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-[var(--surface-soft)] disabled:opacity-50" disabled={refining} onClick={async () => { setRefining(true); const next = await ensureRefined({ ...spec, refined: null }); onChange(() => next); setRefining(false); }}>{refining ? "Refining…" : "Refine now"}</button>
        </div>
        {spec.refined ? (
          <div className="mt-3 grid gap-2 lg:grid-cols-2">
            <div><label className={label}>Brief</label><p className="m-0 whitespace-pre-wrap rounded-xl bg-[var(--surface-soft)] p-3 text-xs text-ink">{spec.refined.core}</p></div>
            <div>
              {spec.refined.constraints.length ? <><label className={label}>Added rules</label><ul className="m-0 grid list-disc gap-0.5 pl-4 text-xs text-ink">{spec.refined.constraints.map((c) => <li key={c}>{c}</li>)}</ul></> : null}
              {spec.refined.notes ? <p className="m-0 mt-2 text-xs text-soft-ink">{spec.refined.notes}</p> : null}
            </div>
          </div>
        ) : null}
        <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-soft-ink">Full prompt sent to the model</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-[var(--surface-soft)] p-3 font-mono text-[11px] text-ink">{compileAgent(spec).system}</pre></details>
      </section>
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
