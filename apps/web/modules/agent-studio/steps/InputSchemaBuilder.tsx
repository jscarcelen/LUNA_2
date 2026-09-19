"use client";

import { useState } from "react";
import type { AgentSpec, InputDef, InputType } from "../engine/types";
import { LANGUAGES, createInput } from "../engine/model";
import { getInputType, listInputTypes } from "../registry";
import { card, field, fieldBase, ghostBtn, label, primaryBtn, kicker } from "../ui";

function InputCard({ input, onChange, onRemove }: { input: InputDef; onChange: (next: InputDef) => void; onRemove: () => void }) {
  const def = getInputType(input.type);
  return (
    <div className="rounded-2xl border border-ink/10 bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--surface-soft)] text-sm font-bold text-ink">{def.icon}</span>
        <div className="grid flex-1 gap-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_170px]">
            <input className={field} value={input.name} onChange={(event) => onChange({ ...input, name: event.target.value })} placeholder="What should the user choose?" />
            <select className={field} value={input.type} onChange={(event) => { const type = event.target.value as InputType; onChange({ ...input, type, options: getInputType(type).needsOptions ? input.options || [] : undefined, default: getInputType(type).defaultValue }); }}>{listInputTypes().map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}</select>
          </div>
          <input className={`${fieldBase} w-full text-xs`} value={input.description || ""} onChange={(event) => onChange({ ...input, description: event.target.value })} placeholder="Help text (optional) — shown to the user and used by the agent" />
          {def.needsOptions ? <div><label className={label}>Options (one per line)</label><textarea className={`${field} min-h-16`} value={(input.options || []).join("\n")} onChange={(event) => onChange({ ...input, options: event.target.value.split("\n").map((o) => o.trim()).filter(Boolean) })} placeholder={"Beginner\nIntermediate\nAdvanced"} /></div> : null}
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-ink"><span className="font-semibold">Default</span>
              {input.type === "language" ? <select className={`${fieldBase} px-2 py-1 text-xs`} value={String(input.default || "")} onChange={(event) => onChange({ ...input, default: event.target.value })}>{LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}</select>
                : input.type === "choice" ? <select className={`${fieldBase} px-2 py-1 text-xs`} value={String(input.default || "")} onChange={(event) => onChange({ ...input, default: event.target.value })}><option value="">none</option>{(input.options || []).map((o) => <option key={o} value={o}>{o}</option>)}</select>
                : input.type === "toggle" ? <select className={`${fieldBase} px-2 py-1 text-xs`} value={String(input.default || "no")} onChange={(event) => onChange({ ...input, default: event.target.value })}><option value="yes">Yes</option><option value="no">No</option></select>
                : input.type === "multi_choice" ? <span className="text-soft-ink">none</span>
                : <input className={`${fieldBase} w-28 px-2 py-1 text-xs`} type={input.type === "number" ? "number" : "text"} value={String(input.default ?? "")} onChange={(event) => onChange({ ...input, default: input.type === "number" ? Number(event.target.value) : event.target.value })} />}
            </label>
            {input.type === "number" ? <label className="flex items-center gap-1 text-xs text-ink">Min <input className={`${fieldBase} w-16 px-2 py-1 text-xs`} type="number" value={input.min ?? ""} onChange={(event) => onChange({ ...input, min: Number(event.target.value) || undefined })} /> Max <input className={`${fieldBase} w-16 px-2 py-1 text-xs`} type="number" value={input.max ?? ""} onChange={(event) => onChange({ ...input, max: Number(event.target.value) || undefined })} /></label> : null}
            <label className="flex items-center gap-1.5 text-xs text-ink"><input type="checkbox" checked={input.required} onChange={(event) => onChange({ ...input, required: event.target.checked })} />Required</label>
            <button type="button" className="ml-auto text-xs text-soft-ink hover:text-[var(--color-danger)]" onClick={onRemove}>Remove</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const SUGGESTIONS: { name: string; type: InputType; options?: string[]; default?: unknown }[] = [
  { name: "Number of items", type: "number", default: 10 },
  { name: "Difficulty", type: "choice", options: ["Beginner", "Intermediate", "Advanced"], default: "Beginner" },
  { name: "Language", type: "language", default: "English" },
  { name: "Topic", type: "text" },
  { name: "Include explanations", type: "toggle", default: "yes" }
];

export function InputSchemaBuilder({ spec, onChange }: { spec: AgentSpec; onChange: (updater: (spec: AgentSpec) => AgentSpec) => void }) {
  const [adding, setAdding] = useState(false);
  const add = (input: InputDef) => { onChange((s) => ({ ...s, inputs: [...s.inputs, input] })); setAdding(false); };
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section className="grid gap-3">
        <div className={`${card} p-5`}>
          <p className={kicker}>Customize your generation</p>
          <p className="m-0 mt-1 text-sm text-soft-ink">You are defining the controls future users will see. They answer these when they run the agent — you don't answer them now.</p>
        </div>
        {spec.inputs.map((input) => <InputCard key={input.id} input={input} onChange={(next) => onChange((s) => ({ ...s, inputs: s.inputs.map((i) => (i.id === next.id ? next : i)) }))} onRemove={() => onChange((s) => ({ ...s, inputs: s.inputs.filter((i) => i.id !== input.id) }))} />)}
        {!adding ? <button type="button" className={`${ghostBtn} justify-self-start`} onClick={() => setAdding(true)}>＋ Add customization</button> : (
          <div className={`${card} p-4`}>
            <p className="m-0 mb-2 text-sm font-semibold text-ink">What should the user choose?</p>
            <div className="grid gap-1 sm:grid-cols-3">
              {listInputTypes().map((item) => <button key={item.type} type="button" onClick={() => add(createInput("", item.type, { default: item.defaultValue, options: item.needsOptions ? [] : undefined }))} className="flex items-center gap-2 rounded-xl border border-ink/10 px-3 py-2 text-left transition hover:bg-[var(--surface-soft)]"><span className="grid size-7 place-items-center rounded-lg bg-[var(--surface-soft)] text-xs font-bold">{item.icon}</span><span><span className="block text-sm font-semibold text-ink">{item.label}</span><span className="block text-[11px] text-soft-ink">{item.hint}</span></span></button>)}
            </div>
            <button type="button" className={`${ghostBtn} mt-2`} onClick={() => setAdding(false)}>Cancel</button>
          </div>
        )}
      </section>
      <aside className={`${card} p-5`}>
        <p className={kicker}>Common choices</p>
        <div className="mt-2 grid gap-1">{SUGGESTIONS.filter((s) => !spec.inputs.some((i) => i.name === s.name)).map((s) => <button key={s.name} type="button" className="rounded-xl border border-ink/10 px-3 py-2 text-left text-sm text-ink transition hover:bg-[var(--surface-soft)]" onClick={() => add(createInput(s.name, s.type, { options: s.options, default: s.default }))}>＋ {s.name} <span className="text-xs text-soft-ink">· {getInputType(s.type).label}</span></button>)}</div>
        <p className="m-0 mt-3 text-xs text-soft-ink">Preview of what users will see appears in step 5.</p>
      </aside>
    </div>
  );
}
