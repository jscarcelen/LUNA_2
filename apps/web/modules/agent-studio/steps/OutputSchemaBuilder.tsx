"use client";

import type { AgentSpec, FieldDef } from "../engine/types";
import { createCollection, createField, primaryCollection, collectionFields } from "../engine/model";
import { outputTypes } from "../registry";
import { card, field, fieldBase, ghostBtn, label, kicker } from "../ui";

function FieldCard({ f, onChange, onRemove }: { f: FieldDef; onChange: (next: FieldDef) => void; onRemove: () => void }) {
  return (
    <div className="rounded-xl border border-ink/10 bg-white p-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_150px]">
        <input className={field} value={f.name} onChange={(event) => onChange({ ...f, name: event.target.value })} placeholder="Front" />
        <select className={field} value={f.type} onChange={(event) => { const type = event.target.value as FieldDef["type"]; onChange({ ...f, type, children: type === "array" ? [createField(`${f.name || "item"} item`, "text")] : undefined }); }}>{outputTypes.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}</select>
      </div>
      <input className={`${fieldBase} mt-2 w-full text-xs`} value={f.description || ""} onChange={(event) => onChange({ ...f, description: event.target.value })} placeholder="What is it? e.g. The word in the first language" />
      <div className="mt-2 flex items-center gap-4 text-xs text-ink">
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={f.required !== false} onChange={(event) => onChange({ ...f, required: event.target.checked })} />Required</label>
        <button type="button" className="ml-auto text-soft-ink hover:text-[var(--color-danger)]" onClick={onRemove}>Remove</button>
      </div>
    </div>
  );
}

export function OutputSchemaBuilder({ spec, onChange }: { spec: AgentSpec; onChange: (updater: (spec: AgentSpec) => AgentSpec) => void }) {
  const collection = primaryCollection(spec);
  const fields = collectionFields(collection);
  const setFields = (next: FieldDef[]) => onChange((s) => {
    const primary = primaryCollection(s);
    if (!primary) return { ...s, outputSchema: [createCollection("Items", next), ...s.outputSchema] };
    const item = primary.children![0];
    return { ...s, outputSchema: s.outputSchema.map((f) => (f.id === primary.id ? { ...f, children: [{ ...item, children: next }] } : f)) };
  });
  const singles = spec.outputSchema.filter((f) => f !== collection);
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section className={`${card} p-5`}>
        <p className={kicker}>Generated content</p>
        <div className="mt-3 rounded-2xl border-2 border-dashed border-[#6d4de6]/50 bg-[#6d4de6]/5 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-[#6d4de6] px-1.5 py-0.5 text-[10px] font-bold text-white">↻ Multiple items</span>
            <input className={`${fieldBase} font-semibold`} value={collection?.name || "Items"} onChange={(event) => onChange((s) => { const p = primaryCollection(s); return p ? { ...s, outputSchema: s.outputSchema.map((f) => (f.id === p.id ? { ...f, name: event.target.value } : f)) } : s; })} />
            <span className="text-xs text-soft-ink">the agent returns a list of these</span>
          </div>
          <div className="mt-3 grid gap-2">
            {fields.map((f) => <FieldCard key={f.id} f={f} onChange={(next) => setFields(fields.map((x) => (x.id === next.id ? next : x)))} onRemove={() => setFields(fields.filter((x) => x.id !== f.id))} />)}
            <button type="button" className={`${ghostBtn} justify-self-start`} onClick={() => setFields([...fields, createField("", "text", { required: true })])}>＋ Add field</button>
          </div>
        </div>
        {singles.length ? <div className="mt-3 grid gap-2"><p className={label}>Once per document</p>{singles.map((f) => <FieldCard key={f.id} f={f} onChange={(next) => onChange((s) => ({ ...s, outputSchema: s.outputSchema.map((x) => (x.id === next.id ? next : x)) }))} onRemove={() => onChange((s) => ({ ...s, outputSchema: s.outputSchema.filter((x) => x.id !== f.id) }))} />)}</div> : null}
        <button type="button" className="mt-3 text-xs font-semibold text-[var(--accent-ink)] hover:underline" onClick={() => onChange((s) => ({ ...s, outputSchema: [...s.outputSchema, createField("Title", "text", { description: "A title for the whole document", required: false })] }))}>＋ Add a field that appears once (e.g. a title)</button>
      </section>
      <aside className={`${card} p-5`}>
        <p className={kicker}>Why descriptions matter</p>
        <p className="m-0 mt-2 text-sm text-soft-ink">The "what is it?" text tells the agent exactly what to put in each field, powers the automatic checks, and lets templates match your fields. Keep it concrete: <em>"The translation in language 2"</em>.</p>
        <p className={`${kicker} mt-4`}>Content, not looks</p>
        <p className="m-0 mt-1 text-sm text-soft-ink">Fonts, colours and positions belong to templates. Fields should describe meaning only.</p>
        <p className={`${kicker} mt-4`}>Template compatibility</p>
        <p className="m-0 mt-1 text-sm text-soft-ink">Any template with fields named like these works — templates bind to the structure, not to this agent.</p>
      </aside>
    </div>
  );
}
