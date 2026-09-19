"use client";

import type { AgentSpec, ContextSlot } from "../engine/types";
import { createSlot } from "../engine/model";
import { card, field, fieldBase, ghostBtn, label, kicker } from "../ui";

interface Doc { id: string; name: string }

function SlotCard({ slot, docs, onChange, onRemove }: { slot: ContextSlot; docs: Doc[]; onChange: (next: ContextSlot) => void; onRemove: () => void }) {
  const isKnowledge = slot.kind === "agent_knowledge";
  return (
    <div className="rounded-2xl border border-ink/10 bg-white p-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_150px]">
        <input className={field} value={slot.name} onChange={(event) => onChange({ ...slot, name: event.target.value })} placeholder={isKnowledge ? "ACT style guide" : "Source material"} />
        <select className={field} value={slot.usage} onChange={(event) => onChange({ ...slot, usage: event.target.value as ContextSlot["usage"] })}><option value="source">Take content from it</option><option value="style">Imitate its style</option></select>
      </div>
      <textarea className={`${field} mt-2 min-h-14 text-xs`} value={slot.description} onChange={(event) => onChange({ ...slot, description: event.target.value })} placeholder="How should the agent use this material?" />
      {isKnowledge ? (
        <div className="mt-2 grid gap-2">
          <div><label className={label}>Documents from your workspace</label>
            <div className="grid max-h-36 gap-1 overflow-auto">{docs.map((doc) => { const on = (slot.documentIds || []).includes(doc.id); return <label key={doc.id} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs ${on ? "border-[var(--accent)]/40 bg-[var(--accent-soft)]" : "border-ink/10"}`}><input type="checkbox" checked={on} onChange={() => onChange({ ...slot, documentIds: on ? (slot.documentIds || []).filter((id) => id !== doc.id) : [...(slot.documentIds || []), doc.id] })} />{doc.name}</label>; })}{!docs.length ? <p className="m-0 text-xs text-soft-ink">No approved documents in this subject.</p> : null}</div></div>
          <div><label className={label}>Or paste reference text</label><textarea className={`${field} min-h-16 text-xs`} value={slot.text || ""} onChange={(event) => onChange({ ...slot, text: event.target.value })} placeholder="Rules, examples, glossary…" /></div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-ink">
          <label className="flex items-center gap-1.5"><input type="radio" checked={slot.required} onChange={() => onChange({ ...slot, required: true })} />Required</label>
          <label className="flex items-center gap-1.5"><input type="radio" checked={!slot.required} onChange={() => onChange({ ...slot, required: false })} />Optional</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={slot.multiple} onChange={(event) => onChange({ ...slot, multiple: event.target.checked })} />Several files allowed</label>
        </div>
      )}
      <button type="button" className="mt-2 text-xs text-soft-ink hover:text-[var(--color-danger)]" onClick={onRemove}>Remove</button>
    </div>
  );
}

export function ContextBuilder({ spec, docs, onChange }: { spec: AgentSpec; docs: Doc[]; onChange: (updater: (spec: AgentSpec) => AgentSpec) => void }) {
  const knowledge = spec.contextSlots.filter((s) => s.kind === "agent_knowledge");
  const material = spec.contextSlots.filter((s) => s.kind === "user_material");
  const set = (next: ContextSlot) => onChange((s) => ({ ...s, contextSlots: s.contextSlots.map((c) => (c.id === next.id ? next : c)) }));
  const remove = (id: string) => onChange((s) => ({ ...s, contextSlots: s.contextSlots.filter((c) => c.id !== id) }));
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className={`${card} grid gap-3 p-5`}>
        <div><p className={kicker}>Agent knowledge</p><p className="m-0 mt-1 text-sm text-soft-ink">Material that is always part of this agent — style guides, rules, examples. Bundled with the agent wherever it goes.</p></div>
        {knowledge.map((slot) => <SlotCard key={slot.id} slot={slot} docs={docs} onChange={set} onRemove={() => remove(slot.id)} />)}
        <button type="button" className={`${ghostBtn} justify-self-start`} onClick={() => onChange((s) => ({ ...s, contextSlots: [...s.contextSlots, createSlot("agent_knowledge", "", { description: "Use this as reference for how to write the output.", usage: "style" })] }))}>＋ Add knowledge</button>
      </section>
      <section className={`${card} grid gap-3 p-5`}>
        <div><p className={kicker}>User material</p><p className="m-0 mt-1 text-sm text-soft-ink">What people upload when they run the agent — their own chapter, notes or PDF. Keeps the agent reusable for any subject.</p></div>
        {material.map((slot) => <SlotCard key={slot.id} slot={slot} docs={docs} onChange={set} onRemove={() => remove(slot.id)} />)}
        <button type="button" className={`${ghostBtn} justify-self-start`} onClick={() => onChange((s) => ({ ...s, contextSlots: [...s.contextSlots, createSlot("user_material", "Extra material", { description: "Optional additional material." })] }))}>＋ Add material slot</button>
        <p className={`${fieldBase} m-0 border-0 bg-[var(--surface-soft)] text-xs text-soft-ink`}>{material.length ? "Users will see " + material.map((m) => `“${m.name || "material"}” (${m.required ? "required" : "optional"})`).join(" and ") + " when they run the agent." : "No material slot: the agent works from its own knowledge and the user's choices only."}</p>
      </section>
    </div>
  );
}
