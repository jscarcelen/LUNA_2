"use client";

import type { Element, FieldDef, GroupElement, Layout, Page } from "../engine/types";
import { findField, isPinned, simpleOrder } from "../engine/model";
import { GROUP_COLOR, card, ghostBtn, kicker } from "../ui";
import { PlacementControl } from "./PlacementControl";

export interface SimpleDesignProps {
  layout: Layout;
  page: Page;
  fields: FieldDef[];
  selection: string[];
  onSelect: (ids: string[]) => void;
  onReorder: (orderedIds: string[]) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onSetRepeat: (id: string, mode: "none" | "flow" | "page" | "grid") => void;
  onChangeElement: (id: string, updater: (element: Element) => Element) => void;
  onAdvanced: () => void;
}

function elementName(element: Element): string {
  if (element.name) return element.name;
  if (element.type === "text") return element.source.type === "static" ? element.source.value.slice(0, 40) || "Text" : "AI text";
  if (element.type === "image") return element.source.type === "field" ? "AI image" : "Image";
  return element.type === "group" ? "Group" : element.type;
}

function repeatSummary(element: Element, fields: FieldDef[]): { label: string; tone: "once" | "repeat" | "page" } {
  if (element.type !== "group" || !element.repeat) return { label: element.pageScope.mode === "every" ? "Every page" : element.pageScope.mode === "first" ? "First page" : element.placement === "fixed" ? "Fixed position" : element.placement === "new_page" ? "New page" : "Once", tone: "once" };
  const list = findField(fields, element.repeat.fieldId)?.name || "items";
  if (element.repeat.mode === "page") return { label: `One ${list.replace(/s$/i, "").toLowerCase()} per page`, tone: "page" };
  if (element.repeat.mode === "grid") return { label: `Grid · one per ${list.replace(/s$/i, "").toLowerCase()}`, tone: "repeat" };
  return { label: `Repeats for each of ${list}`, tone: "repeat" };
}

function fieldsOf(element: Element): string[] {
  const out: string[] = [];
  const walk = (list: Element[]) => list.forEach((item) => { if ((item.type === "text" || item.type === "image") && item.source.type === "field") out.push(item.id); if (item.type === "group") walk(item.children); });
  walk(element.type === "group" ? element.children : [element]);
  return out;
}

function nestedRepeats(element: Element, fields: FieldDef[]): string[] {
  const out: string[] = [];
  const walk = (list: Element[]) => {
    const variants = list.filter((item): item is GroupElement => item.type === "group" && Boolean(item.condition?.fieldId));
    if (variants.length) out.push(`one of ${variants.length} designs by ${findField(fields, variants[0].condition!.fieldId)?.name || "field"}: ${variants.map((v) => `${v.name || "design"} (${v.condition!.equals})`).join(" · ")}`);
    list.forEach((item) => { if (item.type === "group") { if (item.repeat) out.push(`${item.name || "Group"} · for each of ${findField(fields, item.repeat.fieldId)?.name || "items"}`); walk(item.children); } });
  };
  if (element.type === "group") walk(element.children);
  return out;
}

/**
 * Simple design: the template as an ordered list of blocks. Order = output order; each block says
 * whether it appears once or repeats. The same list flows into A4, Letter or slides.
 */
export function SimpleDesign({ layout, page, fields, selection, onSelect, onReorder, onDuplicate, onDelete, onSetRepeat, onChangeElement, onAdvanced }: SimpleDesignProps) {
  const ordered = simpleOrder(page.elements, layout);
  const ids = ordered.map((element) => element.id);
  const move = (id: string, direction: -1 | 1) => {
    const index = ids.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    const next = [...ids];
    [next[index], next[target]] = [next[target], next[index]];
    onReorder(next);
  };
  return (
    <div className={`${card} p-4`} style={{ minHeight: 640 }}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div><p className={kicker}>Blocks · output order</p><p className="m-0 mt-0.5 text-xs text-soft-ink">Top to bottom is the order in the document. Blocks flow onto as many pages or slides as needed — switch to Advanced for exact positions.</p></div>
        <button type="button" className={ghostBtn} onClick={onAdvanced}>Open in Advanced ↗</button>
      </div>
      <div className="grid gap-2">
        {ordered.map((element, index) => {
          const selected = selection.includes(element.id);
          const repeat = repeatSummary(element, fields);
          const fieldIds = fieldsOf(element);
          const nested = nestedRepeats(element, fields);
          const pinned = isPinned(element, layout);
          const isGroup = element.type === "group";
          const accent = isGroup && element.style.fill ? element.style.fill : isGroup && element.style.stroke ? element.style.stroke : "var(--surface-soft)";
          return (
            <div key={element.id} role="button" tabIndex={0} onClick={() => onSelect([element.id])} onKeyDown={(event) => event.key === "Enter" && onSelect([element.id])} className={`grid cursor-pointer grid-cols-[auto_1fr_auto] items-start gap-3 rounded-2xl border p-3 transition ${selected ? "border-[var(--accent)] ring-4 ring-[var(--accent-soft)]" : "border-ink/10 hover:border-ink/25"}`}>
              <span className="grid size-10 place-items-center rounded-xl text-base font-bold" style={{ background: accent, color: repeat.tone === "once" ? "#1d1d1f" : GROUP_COLOR }}>{repeat.tone === "once" ? index + 1 : "↻"}</span>
              <div className="min-w-0">
                <p className="m-0 flex flex-wrap items-center gap-2 text-sm font-bold text-ink">
                  <span className="truncate">{elementName(element)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${repeat.tone === "once" ? "bg-[var(--surface-soft)] text-soft-ink" : "text-white"}`} style={repeat.tone === "once" ? undefined : { background: GROUP_COLOR }}>{repeat.label}</span>
                  {pinned ? <span className="rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-[10px] font-semibold text-soft-ink">pinned to bottom</span> : null}
                </p>
                {fieldIds.length ? <p className="m-0 mt-1 flex flex-wrap gap-1">{fieldIds.slice(0, 8).map((id) => { const f = findField(fields, id); return f ? <span key={id} className="rounded-md bg-[var(--accent-soft)] px-1.5 text-[10px] font-semibold text-[var(--accent-ink)]">✦ {f.name}</span> : null; })}</p> : <p className="m-0 mt-1 text-[11px] text-soft-ink">Fixed content</p>}
                {nested.map((line) => <p key={line} className="m-0 mt-1 text-[11px] text-soft-ink">↳ {line}</p>)}
                <div className="mt-2 grid gap-1.5 sm:grid-cols-[auto_1fr] sm:items-center" onClick={(event) => event.stopPropagation()}>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-soft-ink">Placement</span>
                  <PlacementControl compact element={element} onChange={(updater) => onChangeElement(element.id, updater)} />
                </div>
                {isGroup ? (
                  <div className="mt-2 flex flex-wrap gap-1" onClick={(event) => event.stopPropagation()}>
                    {([["none", "Once"], ["flow", "Repeat per item"], ["page", "One per page / slide"], ["grid", "Grid"]] as const).map(([mode, text]) => {
                      const current = (element as GroupElement).repeat?.mode || "none";
                      return <button key={mode} type="button" onClick={() => onSetRepeat(element.id, mode)} className={`rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${current === mode ? "border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "border-ink/10 text-soft-ink hover:text-ink"}`}>{text}</button>;
                    })}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-col items-end gap-1" onClick={(event) => event.stopPropagation()}>
                <span className="flex gap-1">
                  <button type="button" className="rounded-md border border-ink/15 px-2 py-0.5 text-xs disabled:opacity-30" disabled={index === 0} onClick={() => move(element.id, -1)} title="Move up">▲</button>
                  <button type="button" className="rounded-md border border-ink/15 px-2 py-0.5 text-xs disabled:opacity-30" disabled={index === ordered.length - 1} onClick={() => move(element.id, 1)} title="Move down">▼</button>
                </span>
                <span className="flex gap-2 text-[11px]">
                  <button type="button" className="text-soft-ink hover:text-ink" onClick={() => onDuplicate(element.id)}>Duplicate</button>
                  <button type="button" className="text-soft-ink hover:text-[var(--color-danger)]" onClick={() => onDelete(element.id)}>Delete</button>
                </span>
              </div>
            </div>
          );
        })}
        {!ordered.length ? <p className="m-0 rounded-2xl border border-dashed border-ink/20 p-8 text-center text-sm text-soft-ink">Add a header, a section or a question card from the left — they stack here in output order.</p> : null}
      </div>
    </div>
  );
}
