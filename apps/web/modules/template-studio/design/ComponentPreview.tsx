"use client";

import type { Element, FieldDef, GroupElement } from "../engine/types";
import { findField } from "../engine/model";
import { isSequenceGroup, sequenceMembers } from "../engine/blocks";
import { ElementView } from "./canvas/ElementView";
import { card, kicker } from "../ui";

/** Fields an element (and its children) binds, in visual order, with the binding element id. */
export function bindingsOf(element: Element, fields: FieldDef[]): { field: FieldDef; elementId: string; list?: FieldDef }[] {
  const out: { field: FieldDef; elementId: string; list?: FieldDef }[] = [];
  const seen = new Set<string>();
  const walk = (list: Element[], listField?: FieldDef) => {
    for (const item of [...list].sort((a, b) => a.frame.y - b.frame.y || a.frame.x - b.frame.x)) {
      if ((item.type === "text" || item.type === "image") && item.source.type === "field") {
        const field = findField(fields, item.source.fieldId);
        if (field && !seen.has(field.id)) { seen.add(field.id); out.push({ field, elementId: item.id, list: listField }); }
      }
      if (item.type === "group") {
        const repeatList = item.repeat ? findField(fields, item.repeat.fieldId) || undefined : undefined;
        if (repeatList && !seen.has(repeatList.id)) { seen.add(repeatList.id); out.push({ field: repeatList, elementId: item.id, list: listField }); }
        walk(item.children, repeatList || listField);
      }
    }
  };
  walk(element.type === "group" ? element.children : [element], element.type === "group" && element.repeat ? findField(fields, element.repeat.fieldId) || undefined : undefined);
  if (element.type === "group" && element.repeat) { const list = findField(fields, element.repeat.fieldId); if (list && !seen.has(list.id)) out.unshift({ field: list, elementId: element.id }); }
  return out;
}

export function componentName(element: Element): string {
  if (element.name) return element.name;
  if (element.type === "text") return element.source.type === "static" ? element.source.value.slice(0, 32) || "Text" : "AI text";
  return element.type === "image" ? "Image" : element.type;
}

/** What a component looks like with sample data, plus the fields it fills (hover a field → element highlighted). */
export function ComponentPreview({ element, fields, sampleValues, hovered, onHover, onRename }: { element: Element | null; fields: FieldDef[]; sampleValues: Record<string, unknown>; hovered?: string; onHover?: (elementId: string) => void; onRename?: (fieldId: string, name: string) => void }) {
  if (!element) return <div className={`${card} p-5`}><p className={kicker}>Component</p><p className="m-0 mt-2 text-xs text-soft-ink">Select a component to see what it looks like and which fields it fills.</p></div>;
  const scale = 1.6;
  const isSet = isSequenceGroup(element);
  const members = isSet ? sequenceMembers(element as GroupElement) : [];
  const bindings = bindingsOf(element, fields);
  const stacked = element.type === "group" && (element as GroupElement).children.some((child) => child.type === "group" && child.condition);
  const row = (b: { field: FieldDef; elementId: string }) => (
    <div key={`${b.elementId}-${b.field.id}`} onMouseEnter={() => onHover?.(b.elementId)} onMouseLeave={() => onHover?.("")} className={`flex items-center gap-2 rounded-lg px-2 py-1 transition ${hovered === b.elementId ? "bg-[var(--accent-soft)]" : ""}`}>
      <span className="rounded bg-[var(--surface-soft)] px-1.5 py-0.5 font-mono text-[10px] text-soft-ink">{b.field.type === "array" ? "list" : b.field.type}</span>
      {onRename ? <input className="min-w-0 flex-1 rounded-lg border border-ink/10 bg-white px-2 py-1 text-xs text-ink" value={b.field.name} onChange={(event) => onRename(b.field.id, event.target.value)} /> : <span className="flex-1 truncate text-xs text-ink">{b.field.name}</span>}
      {b.field.fromInputId ? <span className="text-[9px] font-semibold text-[var(--accent-ink)]">user data</span> : b.field.type === "array" ? <span className="text-[10px] text-soft-ink">repeats</span> : null}
    </div>
  );
  return (
    <div className={`${card} p-4`}>
      <p className={kicker}>{componentName(element)}</p>
      <div className="mt-2 overflow-auto rounded-xl border border-ink/10 bg-[#f0f0f3] p-2">
        <div className="relative mx-auto bg-white shadow-[0_1px_4px_rgba(0,0,0,0.12)]" style={{ width: element.frame.w * scale + 12, minHeight: element.frame.h * scale + 12 }}>
          <ElementView element={{ ...element, frame: { ...element.frame, x: 2, y: 2 } } as Element} scale={scale} selectedIds={hovered ? [hovered] : []} fields={fields} sampleMode sampleValues={sampleValues} onPointerDown={() => undefined} onResizeStart={() => undefined} />
          {stacked ? <div style={{ height: element.frame.h * scale * 2 }} /> : null}
        </div>
      </div>
      <p className={`${kicker} mt-3`}>Fields it fills</p>
      <div className="mt-1 grid gap-0.5">
        {isSet ? members.map((member) => (
          <div key={member.child.id} className="rounded-xl bg-[var(--surface-soft)]/60 p-1.5">
            <p className="m-0 flex items-center gap-2 px-2 py-1 text-[11px] font-semibold text-ink">{member.block ? (member.block.variant ? `${member.block.family} · ${member.block.variant}` : member.block.name) : member.child.name}<span className="rounded bg-white px-1 font-mono text-[9px] text-soft-ink">Type = {member.typeValue}</span></p>
            {bindingsOf(member.child, fields).map(row)}
          </div>
        )) : bindings.filter((b) => b.elementId !== element.id || b.field.type === "array").map(row)}
        {!bindings.length ? <p className="m-0 px-2 py-1 text-xs text-soft-ink">Fixed content — no AI fields.</p> : null}
      </div>
    </div>
  );
}
