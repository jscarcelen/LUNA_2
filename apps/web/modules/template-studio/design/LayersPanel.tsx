"use client";

import type { Element, Page } from "../engine/types";
import { componentLabel } from "../engine/registry";
import { backgroundLabel } from "../engine/model";
import { GROUP_COLOR, card, kicker } from "../ui";

export interface LayersPanelProps {
  page: Page;
  selection: string[];
  viewId: string;
  onSelect: (id: string, additive: boolean) => void;
  onToggleLock: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
}

function layerName(element: Element): string {
  if (element.name) return element.name;
  if (element.type === "text") return element.source.type === "static" ? element.source.value.slice(0, 24) || "Text" : "AI field";
  if (element.type === "image") return element.source.type === "field" ? "AI image" : "Image";
  return componentLabel(element.type);
}

function LayerRow({ element, depth, index, count, props }: { element: Element; depth: number; index: number; count: number; props: LayersPanelProps }) {
  const { selection, viewId, onSelect, onToggleLock, onToggleVisible, onMove } = props;
  const isGroup = element.type === "group";
  const isField = (element.type === "text" || element.type === "image") && element.source.type === "field";
  const visible = !element.visibility.views || element.visibility.views.includes(viewId);
  const btn = "grid size-5 place-items-center rounded text-[10px] text-soft-ink opacity-0 transition group-hover:opacity-100 hover:bg-[var(--surface-soft)] hover:text-ink disabled:opacity-0";
  return (
    <>
      <div role="button" tabIndex={0} onClick={(event) => onSelect(element.id, event.shiftKey)} onKeyDown={(event) => event.key === "Enter" && onSelect(element.id, false)} className={`group flex cursor-pointer items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs transition ${selection.includes(element.id) ? "bg-[var(--accent-soft)] text-ink" : "text-ink hover:bg-[var(--surface-soft)]"} ${visible ? "" : "opacity-50"}`} style={{ paddingLeft: 6 + depth * 12 }}>
        <span className="text-[10px]" style={{ color: isGroup ? GROUP_COLOR : isField ? "var(--accent-ink)" : "#6e6e73" }}>{isGroup ? "↻" : isField ? "✦" : "•"}</span>
        <span className="min-w-0 flex-1 truncate">{layerName(element)}</span>
        {element.pageScope.mode !== "page" ? <span className="rounded bg-[var(--surface-soft)] px-1 text-[9px] text-soft-ink">{element.pageScope.mode}</span> : null}
        <button type="button" className={btn} disabled={index === 0} title="Bring forward" onClick={(event) => { event.stopPropagation(); onMove(element.id, 1); }}>▲</button>
        <button type="button" className={btn} disabled={index === count - 1} title="Send backward" onClick={(event) => { event.stopPropagation(); onMove(element.id, -1); }}>▼</button>
        <button type="button" onClick={(event) => { event.stopPropagation(); onToggleVisible(element.id); }} className={`grid size-5 place-items-center rounded text-[11px] ${visible ? "text-soft-ink" : "text-[var(--color-danger)]"} hover:bg-[var(--surface-soft)]`} title={visible ? "Hide in this view" : "Show in this view"}>{visible ? "👁" : "⊘"}</button>
        <button type="button" onClick={(event) => { event.stopPropagation(); onToggleLock(element.id); }} className={`grid size-5 place-items-center rounded text-[10px] ${element.locked ? "text-ink" : "text-soft-ink opacity-0 group-hover:opacity-100"} hover:bg-[var(--surface-soft)]`} title={element.locked ? "Unlock" : "Lock"}>{element.locked ? "🔒" : "🔓"}</button>
      </div>
      {isGroup ? [...element.children].reverse().map((child, childIndex) => <LayerRow key={child.id} element={child} depth={depth + 1} index={childIndex} count={element.children.length} props={props} />) : null}
    </>
  );
}

/** Layers: order (▲▼), hide in this view (👁), lock. Top of the list = front. */
export function LayersPanel(props: LayersPanelProps) {
  const { page } = props;
  const ordered = [...page.elements].reverse();
  return (
    <div className={`${card} p-3`}>
      <p className={`${kicker} px-1`}>Layers</p>
      <div className="mt-2 grid gap-0.5">
        {ordered.map((element, index) => <LayerRow key={element.id} element={element} depth={0} index={index} count={ordered.length} props={props} />)}
        <div className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-soft-ink"><span>🔒</span><span className="flex-1 truncate">Background · {backgroundLabel(page.background)}</span></div>
        {!page.elements.length ? <p className="m-0 px-2 py-1 text-xs text-soft-ink">Nothing on this page yet.</p> : null}
      </div>
    </div>
  );
}
