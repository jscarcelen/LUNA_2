"use client";

import type { AgentSpec, FieldDef } from "../engine/types";
import { createCollection, createField } from "../engine/model";
import { outputSkeleton } from "../engine/schema";
import { outputTypes } from "../registry";
import { card, fieldBase, ghostBtn, kicker } from "../ui";

const LIST_COLOR = "#6d4de6";

function Mover({ onMove, first, last }: { onMove?: (direction: -1 | 1) => void; first?: boolean; last?: boolean }) {
  if (!onMove) return null;
  return (
    <span className="flex gap-1">
      <button type="button" title="Move up" disabled={first} className="rounded-md border border-ink/15 px-2 py-0.5 text-xs disabled:opacity-30" onClick={() => onMove(-1)}>▲</button>
      <button type="button" title="Move down" disabled={last} className="rounded-md border border-ink/15 px-2 py-0.5 text-xs disabled:opacity-30" onClick={() => onMove(1)}>▼</button>
    </span>
  );
}

function FieldCard({ f, onChange, onRemove, onMove, first, last, tone = "once" }: { f: FieldDef; onChange: (next: FieldDef) => void; onRemove: () => void; onMove?: (direction: -1 | 1) => void; first?: boolean; last?: boolean; tone?: "once" | "item" }) {
  // A field is a value type that may repeat ("many values") — the same idea as a list in Template Studio.
  const leafTypes = outputTypes.filter((t) => t.type !== "object" && t.type !== "array");
  const isList = f.type === "array";
  const valueType = isList ? (f.children?.[0]?.type || "text") : f.type;
  const setValueType = (type: FieldDef["type"]) => onChange(isList ? { ...f, children: [{ ...(f.children?.[0] || createField(`${f.name || "item"} value`, "text")), type }] } : { ...f, type });
  const setList = (on: boolean) => onChange(on ? { ...f, type: "array", children: [createField(`${f.name || "item"} value`, valueType)] } : { ...f, type: valueType, children: undefined });
  return (
    <div className="rounded-xl border border-ink/10 bg-white p-3">
      <div className="grid gap-2 sm:grid-cols-[auto_1fr_150px]">
        <span className={`self-center rounded-md px-1.5 py-0.5 text-[10px] font-bold ${tone === "once" ? "bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "text-white"}`} style={tone === "item" ? { background: LIST_COLOR } : undefined}>{tone === "once" ? "once" : "per item"}</span>
        <input className={`${fieldBase} w-full`} value={f.name} onChange={(event) => onChange({ ...f, name: event.target.value })} placeholder={tone === "once" ? "Title" : "Front"} />
        <select className={`${fieldBase} w-full`} value={valueType} onChange={(event) => setValueType(event.target.value as FieldDef["type"])}>{leafTypes.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}</select>
      </div>
      <input className={`${fieldBase} mt-2 w-full text-xs`} value={f.description || ""} onChange={(event) => onChange({ ...f, description: event.target.value })} placeholder={tone === "once" ? "What is it? e.g. A title for the whole document" : "What is it? e.g. The word in the first language"} />
      <div className="mt-2 flex items-center gap-4 text-xs text-ink">
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={f.required !== false} onChange={(event) => onChange({ ...f, required: event.target.checked })} />Required</label>
        {tone === "item" ? <label className="flex items-center gap-1.5" title="Several values of this type, e.g. answer options"><input type="checkbox" checked={isList} onChange={(event) => setList(event.target.checked)} />Many values (list)</label> : null}
        <span className="ml-auto flex items-center gap-2"><Mover onMove={onMove} first={first} last={last} /><button type="button" className="text-soft-ink hover:text-[var(--color-danger)]" onClick={onRemove}>Remove</button></span>
      </div>
    </div>
  );
}

function ListCard({ list, isPrimary, onChange, onRemove, onMove, first, last }: { list: FieldDef; isPrimary: boolean; onChange: (next: FieldDef) => void; onRemove: () => void; onMove: (direction: -1 | 1) => void; first: boolean; last: boolean }) {
  const item = list.children?.[0];
  const fields = item?.type === "object" ? item.children || [] : item ? [item] : [];
  const setFields = (next: FieldDef[]) => onChange({ ...list, children: [{ ...(item && item.type === "object" ? item : createField("item", "object")), type: "object", children: next }] });
  return (
    <div className="rounded-2xl border-2 border-dashed p-4" style={{ borderColor: `${LIST_COLOR}80`, background: `${LIST_COLOR}0d` }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: LIST_COLOR }}>↻ List</span>
        <input className={`${fieldBase} font-semibold`} value={list.name} onChange={(event) => onChange({ ...list, name: event.target.value })} placeholder="Flashcards" />
        <span className="text-xs text-soft-ink">the agent returns as many of these as needed{isPrimary ? " (JSON key: items)" : ""}</span>
        <span className="ml-auto flex items-center gap-2"><Mover onMove={onMove} first={first} last={last} /><button type="button" className="text-xs text-soft-ink hover:text-[var(--color-danger)]" onClick={onRemove}>Remove list</button></span>
      </div>
      <input className={`${fieldBase} mt-2 w-full text-xs`} value={list.description || ""} onChange={(event) => onChange({ ...list, description: event.target.value })} placeholder="What is each element? e.g. One flashcard pairing a word in both languages" />
      <div className="mt-3 grid gap-2">
        {fields.map((f, index) => <FieldCard key={f.id} f={f} tone="item" first={index === 0} last={index === fields.length - 1} onMove={(direction) => { const next = [...fields]; const target = index + direction; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; setFields(next); }} onChange={(next) => setFields(fields.map((x) => (x.id === next.id ? next : x)))} onRemove={() => setFields(fields.filter((x) => x.id !== f.id))} />)}
        <button type="button" className={`${ghostBtn} justify-self-start`} onClick={() => setFields([...fields, createField("", "text", { required: true })])}>＋ Add field to each element</button>
      </div>
    </div>
  );
}

/**
 * Output structure: an ordered mix of fields that appear once per document (title, summary…)
 * and lists whose elements repeat (flashcards, questions…). The first list is emitted as `items`.
 */
export function OutputSchemaBuilder({ spec, onChange }: { spec: AgentSpec; onChange: (updater: (spec: AgentSpec) => AgentSpec) => void }) {
  const schema = spec.outputSchema;
  const primary = schema.find((f) => f.type === "array") || null;
  const replace = (next: FieldDef) => onChange((s) => ({ ...s, outputSchema: s.outputSchema.map((x) => (x.id === next.id ? next : x)) }));
  const remove = (id: string) => onChange((s) => ({ ...s, outputSchema: s.outputSchema.filter((x) => x.id !== id) }));
  const move = (index: number, direction: -1 | 1) => onChange((s) => { const next = [...s.outputSchema]; const target = index + direction; if (target < 0 || target >= next.length) return s; [next[index], next[target]] = [next[target], next[index]]; return { ...s, outputSchema: next }; });
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section className={`${card} p-5`}>
        <p className={kicker}>Generated content</p>
        <p className="m-0 mt-1 text-xs text-soft-ink">Combine fields that appear <strong>once</strong> (a title, a summary box) with <strong>lists</strong> whose elements repeat (flashcards, questions). Order here is the order in the output.</p>
        <div className="mt-3 grid gap-3">
          {schema.map((f, index) => f.type === "array"
            ? <ListCard key={f.id} list={f} isPrimary={f === primary} first={index === 0} last={index === schema.length - 1} onMove={(d) => move(index, d)} onChange={replace} onRemove={() => remove(f.id)} />
            : <FieldCard key={f.id} f={f} tone="once" first={index === 0} last={index === schema.length - 1} onMove={(d) => move(index, d)} onChange={replace} onRemove={() => remove(f.id)} />)}
          {!schema.length ? <p className="m-0 rounded-xl border border-dashed border-ink/20 p-4 text-center text-xs text-soft-ink">Nothing yet — add a field or a list below.</p> : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={ghostBtn} onClick={() => onChange((s) => ({ ...s, outputSchema: [...s.outputSchema, createField("", "rich_text", { required: true })] }))}>＋ Field (once per document)</button>
          <button type="button" className={ghostBtn} style={{ borderColor: `${LIST_COLOR}66`, color: LIST_COLOR }} onClick={() => onChange((s) => ({ ...s, outputSchema: [...s.outputSchema, createCollection(s.outputSchema.some((f) => f.type === "array") ? "" : "Items", [createField("", "text", { required: true })])] }))}>＋ List (repeats per element)</button>
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-semibold text-soft-ink">JSON structure the agent will return</summary>
          <pre className="mt-2 overflow-x-auto rounded-xl bg-[var(--surface-soft)] p-3 text-[11px] leading-relaxed text-ink">{outputSkeleton(schema)}</pre>
        </details>
      </section>
      <aside className={`${card} p-5`}>
        <p className={kicker}>Once vs list</p>
        <p className="m-0 mt-2 text-sm text-soft-ink">A <strong>summary</strong> is a title and one content box — two "once" fields, no list. <strong>Flashcards</strong> are a list where each element has "Word in language 1" and "Word in language 2" — the agent fills as many elements as requested.</p>
        <p className={`${kicker} mt-4`}>Why descriptions matter</p>
        <p className="m-0 mt-1 text-sm text-soft-ink">The "what is it?" text tells the agent exactly what to put in each field, powers the automatic checks, and lets templates match your fields. Keep it concrete: <em>"The translation in language 2"</em>.</p>
        <p className={`${kicker} mt-4`}>Content, not looks</p>
        <p className="m-0 mt-1 text-sm text-soft-ink">Fonts, colours and positions belong to templates. Fields describe meaning only.</p>
        <p className={`${kicker} mt-4`}>Template compatibility</p>
        <p className="m-0 mt-1 text-sm text-soft-ink">Once-fields map to single template slots; lists map to repeating groups. Any template with matching fields works.</p>
      </aside>
    </div>
  );
}
