"use client";

import { useState } from "react";
import type { Element, FieldDef, GroupElement } from "../../engine/types";
import { arrayFields, arrayItemFields, createField, findField } from "../../engine/model";
import { field as fieldClass, ghostBtn, label, primaryBtn } from "../../ui";
import { Segmented } from "./Segmented";

type RepeatChoice = "none" | "flow" | "page" | "grid";

export function RepeatTab({ element, parentChain, fields, onChange, onAddField }: { element: Element; parentChain: GroupElement[]; fields: FieldDef[]; onChange: (updater: (element: Element) => Element) => void; onAddField: (field: FieldDef, intoArrayId: string | null) => void }) {
  const [advanced, setAdvanced] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  if (element.type !== "group") return <p className="m-0 text-sm text-soft-ink">Repetition belongs to groups. Select this element and press <strong>Group</strong> to repeat it.</p>;
  const group = element;
  // "Show only when": fields of the nearest repeated item (or the document) this group can test.
  const scopeArray = [...parentChain].reverse().find((item) => item.repeat)?.repeat;
  const scopeItemFields = scopeArray ? arrayItemFields(findField(fields, scopeArray.fieldId) || { id: "", name: "", type: "array" }).filter((item) => item.type !== "array" && item.type !== "object") : fields.filter((item) => item.type !== "array" && item.type !== "object");
  const conditionField = group.condition ? findField(fields, group.condition.fieldId) : null;
  const setCondition = (condition: GroupElement["condition"]) => onChange((current) => ({ ...current, condition } as Element));
  const parentRepeat = [...parentChain].reverse().find((item) => item.repeat)?.repeat;
  const parentArray = parentRepeat ? findField(fields, parentRepeat.fieldId) : null;
  // Arrays in scope: nested arrays of the parent item, else root arrays.
  const candidates = parentArray ? arrayItemFields(parentArray).filter((item) => item.type === "array") : arrayFields(fields).filter((item) => !parentChain.length ? true : true);
  const choice: RepeatChoice = group.repeat ? group.repeat.mode : "none";
  const setRepeat = (mode: RepeatChoice, fieldId?: string) => onChange((current) => ({ ...current, repeat: mode === "none" ? null : { fieldId: fieldId || (current as GroupElement).repeat?.fieldId || candidates[0]?.id || "", mode, columns: mode === "grid" ? (current as GroupElement).repeat?.columns || 2 : undefined } } as Element));
  const setPagination = (patch: Partial<GroupElement["pagination"]>) => onChange((current) => ({ ...current, pagination: { ...(current as GroupElement).pagination, ...patch } } as Element));

  function commitNew() {
    const name = draftName.trim();
    if (!name) return;
    const created = createField(name, "array", { children: [createField("item", "object", { children: [] })] });
    onAddField(created, parentArray ? parentArray.id : null);
    setRepeat(choice === "none" ? "flow" : choice, created.id);
    setCreating(false);
    setDraftName("");
  }

  return (
    <div className="grid gap-4">
      <div>
        <label className={label}>Repeat</label>
        <div className="grid gap-1">
          {([["none", "Don't repeat", "Appears once."], ["flow", "Repeat items", "One after another; continues on new pages."], ["page", "One item per page", "Flashcards, certificates, slides."], ["grid", "Grid", "Cards in columns."]] as [RepeatChoice, string, string][]).map(([value, title, text]) => (
            <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2 transition ${choice === value ? "border-[var(--accent)]/40 bg-[var(--accent-soft)]" : "border-ink/10 hover:bg-[var(--surface-soft)]"}`}>
              <input type="radio" className="mt-1" checked={choice === value} onChange={() => setRepeat(value)} />
              <span><span className="block text-sm font-semibold text-ink">{title}</span><span className="block text-xs text-soft-ink">{text}</span></span>
            </label>
          ))}
        </div>
      </div>
      {choice !== "none" ? (
        <div>
          <label className={label}>Repeat for each element of the list</label>
          {!creating ? (
            <select className={fieldClass} value={group.repeat?.fieldId || ""} onChange={(event) => (event.target.value === "__new" ? setCreating(true) : setRepeat(choice, event.target.value))}>
              <option value="">Choose a list…</option>
              {candidates.map((item) => <option key={item.id} value={item.id}>{item.name} · list</option>)}
              <option value="__new">＋ New list…</option>
            </select>
          ) : (
            <div className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-soft)] p-3">
              <input autoFocus className={fieldClass} value={draftName} onChange={(event) => setDraftName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && commitNew()} placeholder="e.g. questions" />
              <div className="mt-2 flex gap-2"><button type="button" className={primaryBtn} onClick={commitNew} disabled={!draftName.trim()}>Create list</button><button type="button" className={ghostBtn} onClick={() => setCreating(false)}>Cancel</button></div>
            </div>
          )}
          <p className="m-0 mt-1.5 text-xs text-soft-ink">{parentArray ? `Nested inside “${parentArray.name}” — repeats for each element's own list.` : "A list is a field that holds many elements; the agent fills it and this group is drawn once per element, one after another."}</p>
          {choice === "grid" ? <div className="mt-2"><label className={label}>Columns</label><input type="number" min="1" max="6" className={fieldClass} value={group.repeat?.columns || 2} onChange={(event) => onChange((current) => ({ ...current, repeat: { ...(current as GroupElement).repeat!, columns: Math.max(1, Number(event.target.value) || 1) } } as Element))} /></div> : null}
        </div>
      ) : null}
      <div>
        <label className={label}>Show only when</label>
        <div className="grid gap-1.5">
          <select className={fieldClass} value={group.condition?.fieldId || ""} onChange={(event) => setCondition(event.target.value ? { fieldId: event.target.value, equals: group.condition?.equals || "" } : null)}>
            <option value="">Always</option>
            {scopeItemFields.map((item) => <option key={item.id} value={item.id}>{item.name}{item.options?.length ? ` (${item.options.join(" / ")})` : ""}</option>)}
          </select>
          {group.condition ? (
            conditionField?.options?.length
              ? <select className={fieldClass} value={group.condition.equals} onChange={(event) => setCondition({ ...group.condition!, equals: event.target.value })}><option value="">equals…</option>{conditionField.options.map((value) => <option key={value} value={value}>= {value}</option>)}</select>
              : <input className={fieldClass} value={group.condition.equals} onChange={(event) => setCondition({ ...group.condition!, equals: event.target.value })} placeholder="equals… e.g. multiple_choice" />
          ) : null}
        </div>
        <p className="m-0 mt-1.5 text-xs text-soft-ink">Put several groups at the same spot, each shown for a different value, and the agent's output picks the design — e.g. a “Type” field with multiple_choice / true_false / open.</p>
      </div>
      {choice !== "none" ? (
        <div>
          <button type="button" className="text-xs font-semibold text-[var(--accent-ink)] hover:underline" onClick={() => setAdvanced((value) => !value)}>{advanced ? "Hide advanced" : "Advanced…"}</button>
          {advanced ? (
            <div className="mt-2 grid gap-2 rounded-xl bg-[var(--surface-soft)] p-3">
              <div><label className={label}>Gap between items (mm)</label><input type="number" min="0" className={fieldClass} value={group.layout.gap} onChange={(event) => onChange((current) => ({ ...current, layout: { ...(current as GroupElement).layout, gap: Number(event.target.value) || 0 } } as Element))} /></div>
              <label className="flex items-center justify-between text-sm text-ink"><span>Page break before</span><input type="checkbox" checked={group.pagination.breakBefore} onChange={(event) => setPagination({ breakBefore: event.target.checked })} /></label>
              <label className="flex items-center justify-between text-sm text-ink"><span>Page break after</span><input type="checkbox" checked={group.pagination.breakAfter} onChange={(event) => setPagination({ breakAfter: event.target.checked })} /></label>
              <label className="flex items-center justify-between text-sm text-ink"><span>Keep each item together</span><input type="checkbox" checked={group.pagination.keepTogether} onChange={(event) => setPagination({ keepTogether: event.target.checked })} /></label>
              <div><label className={label}>Max items per page (blank = auto)</label><input type="number" min="1" className={fieldClass} value={group.pagination.maxItemsPerPage ?? ""} onChange={(event) => setPagination({ maxItemsPerPage: Number(event.target.value) || undefined })} /></div>
              <div><label className={label}>When content doesn't fit</label><Segmented value={group.pagination.overflow} options={[["continue", "Next page"], ["shrink", "Shrink"], ["clip", "Clip"]]} onChange={(value) => setPagination({ overflow: value })} /></div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
