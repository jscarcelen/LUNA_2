"use client";

import type { Element, Page } from "../engine/types";
import { componentLabel } from "../engine/registry";
import { backgroundLabel } from "../engine/model";
import { GROUP_COLOR, card, kicker } from "../ui";

function LayerRow({ element, depth, selection, onSelect, onToggleLock }: { element: Element; depth: number; selection: string[]; onSelect: (id: string, additive: boolean) => void; onToggleLock: (id: string) => void }) {
  const isGroup = element.type === "group";
  const isField = element.type === "text" && element.source.type === "field";
  const name = element.name || (element.type === "text" ? (element.source.type === "static" ? element.source.value.slice(0, 24) || "Text" : "AI field") : componentLabel(element.type));
  return (
    <>
      <div role="button" tabIndex={0} onClick={(event) => onSelect(element.id, event.shiftKey)} onKeyDown={(event) => event.key === "Enter" && onSelect(element.id, false)} className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-xs transition ${selection.includes(element.id) ? "bg-[var(--accent-soft)] text-ink" : "text-ink hover:bg-[var(--surface-soft)]"}`} style={{ paddingLeft: 8 + depth * 12 }}>
        <span className="text-[10px]" style={{ color: isGroup ? GROUP_COLOR : isField ? "var(--accent-ink)" : "#6e6e73" }}>{isGroup ? "↻" : isField ? "✦" : "•"}</span>
        <span className="min-w-0 flex-1 truncate">{name}</span>
        {element.pageScope.mode !== "page" ? <span className="rounded bg-[var(--surface-soft)] px-1 text-[9px] text-soft-ink">{element.pageScope.mode}</span> : null}
        <button type="button" onClick={(event) => { event.stopPropagation(); onToggleLock(element.id); }} className="text-[10px] text-soft-ink" title={element.locked ? "Unlock" : "Lock"}>{element.locked ? "🔒" : "🔓"}</button>
      </div>
      {isGroup ? element.children.map((child) => <LayerRow key={child.id} element={child} depth={depth + 1} selection={selection} onSelect={onSelect} onToggleLock={onToggleLock} />) : null}
    </>
  );
}

export function LayersPanel({ page, selection, onSelect, onToggleLock }: { page: Page; selection: string[]; onSelect: (id: string, additive: boolean) => void; onToggleLock: (id: string) => void }) {
  return (
    <div className={`${card} p-3`}>
      <p className={`${kicker} px-1`}>Layers</p>
      <div className="mt-2 grid gap-0.5">
        <div className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-soft-ink"><span>🔒</span><span className="flex-1 truncate">Background · {backgroundLabel(page.background)}</span></div>
        {[...page.elements].reverse().map((element) => <LayerRow key={element.id} element={element} depth={0} selection={selection} onSelect={onSelect} onToggleLock={onToggleLock} />)}
        {!page.elements.length ? <p className="m-0 px-2 py-1 text-xs text-soft-ink">Nothing on this page yet.</p> : null}
      </div>
    </div>
  );
}
