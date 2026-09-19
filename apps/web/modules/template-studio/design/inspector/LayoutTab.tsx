"use client";

import type { Element, GroupElement, Page, PageScope } from "../../engine/types";
import { field as fieldClass, fieldBase, label } from "../../ui";
import { Segmented } from "./Segmented";
import { PlacementControl } from "../PlacementControl";

export function LayoutTab({ element, pages, onChange }: { element: Element; pages: Page[]; onChange: (updater: (element: Element) => Element) => void }) {
  const setFrame = (patch: Partial<Element["frame"]>) => onChange((current) => ({ ...current, frame: { ...current.frame, ...patch } }));
  const scope = element.pageScope.mode;
  return (
    <div className="grid gap-4">
      {element.type === "group" ? (
        <div>
          <label className={label}>Arrange children</label>
          <Segmented value={(element as GroupElement).layout.mode} options={[["free", "Free"], ["vertical", "Stack ↓"], ["horizontal", "Stack →"], ["grid", "Grid"]]} onChange={(mode) => onChange((current) => ({ ...current, layout: { ...(current as GroupElement).layout, mode } } as Element))} />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div><label className={label}>Gap (mm)</label><input type="number" min="0" className={fieldClass} value={(element as GroupElement).layout.gap} onChange={(event) => onChange((current) => ({ ...current, layout: { ...(current as GroupElement).layout, gap: Number(event.target.value) || 0 } } as Element))} /></div>
            {(element as GroupElement).layout.mode === "grid" ? <div><label className={label}>Columns</label><input type="number" min="1" max="6" className={fieldClass} value={(element as GroupElement).layout.columns || 2} onChange={(event) => onChange((current) => ({ ...current, layout: { ...(current as GroupElement).layout, columns: Math.max(1, Number(event.target.value) || 1) } } as Element))} /></div> : null}
          </div>
          <p className="m-0 mt-1.5 text-xs text-soft-ink">Stacked children grow with their content — longer AI text pushes the rest down.</p>
        </div>
      ) : null}
      <div>
        <label className={label}>Position &amp; size (mm)</label>
        <div className="grid grid-cols-4 gap-1.5">
          {(["x", "y", "w", "h"] as const).map((key) => (
            <label key={key} className="grid gap-0.5 text-[10px] font-semibold uppercase text-soft-ink">{key}<input type="number" step="0.5" className={`${fieldBase} w-full px-2 py-1 text-xs`} value={Math.round(element.frame[key] * 10) / 10} onChange={(event) => setFrame({ [key]: Number(event.target.value) || 0 })} /></label>
          ))}
        </div>
      </div>
      <PlacementControl element={element} onChange={onChange} />
      <div>
        <label className={label}>Appears on</label>
        <select className={fieldClass} value={scope} onChange={(event) => {
          const mode = event.target.value as PageScope["mode"];
          onChange((current) => ({ ...current, pageScope: mode === "selected" ? { mode, pageIds: [pages[0]?.id].filter(Boolean) as string[] } : { mode } } as Element));
        }}>
          <option value="page">This page only</option>
          <option value="first">First page</option>
          <option value="last">Last page</option>
          <option value="every">Every page (incl. continuation pages)</option>
          <option value="selected">Selected pages</option>
        </select>
        {scope === "selected" ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {pages.map((page, index) => {
              const on = element.pageScope.mode === "selected" && element.pageScope.pageIds.includes(page.id);
              return <button key={page.id} type="button" onClick={() => onChange((current) => { const ids = current.pageScope.mode === "selected" ? current.pageScope.pageIds : []; return { ...current, pageScope: { mode: "selected", pageIds: on ? ids.filter((id) => id !== page.id) : [...ids, page.id] } } as Element; })} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${on ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-soft)] text-soft-ink"}`}>Page {index + 1}</button>;
            })}
          </div>
        ) : null}
        <p className="m-0 mt-1.5 text-xs text-soft-ink">Independent from repetition: a header on every page, a title on the first page.</p>
      </div>
      <label className="flex items-center justify-between gap-3 text-sm text-ink"><span>Locked</span><input type="checkbox" checked={Boolean(element.locked)} onChange={(event) => onChange((current) => ({ ...current, locked: event.target.checked }))} /></label>
    </div>
  );
}
