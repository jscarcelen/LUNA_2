"use client";

import { useState } from "react";
import type { Store } from "./state/useTemplateStore";
import { card, fieldBase, ghostBtn, primaryBtn } from "./ui";
import { Segmented } from "./design/inspector/Segmented";
import { NewViewDialog } from "./views/NewViewDialog";

export function sizeLabel(layout: { class: string; canvas: { width: number; height: number } }): string {
  const { width, height } = layout.canvas;
  if (layout.class === "slides") return width / height > 1.5 ? "Slides 16:9" : "Slides 4:3";
  if (width === 210 && height === 297) return "A4";
  if (width === 297 && height === 210) return "A4 landscape";
  if (width === 216 && height === 279) return "Letter";
  if (width === 148 && height === 105) return "Card A6";
  return `${width}×${height} mm`;
}

/**
 * Top bar — name · saved state · Save | View · size | Design · Views · Data · Preview · Export | undo/redo.
 * Everything else lives in the side panels; keep this row calm.
 */
export function StudioShell({ store, busy, status, onSave, onDelete, onBack }: { store: Store; busy: boolean; status: string; onSave: () => void; onDelete: () => void; onBack: () => void }) {
  const { state, layout, view } = store;
  const template = state.template!;
  const [editingName, setEditingName] = useState(false);
  const [newView, setNewView] = useState(false);
  if (!layout) return null;
  const outputs = template.layouts.flatMap((item) => item.views.map((v) => ({ layout: item, view: v })));
  const key = `${layout.id}::${view?.id || ""}`;

  return (
    <>
      <div className={`${card} flex flex-wrap items-center gap-2 px-4 py-2`}>
        <button type="button" className={`${ghostBtn} px-3`} onClick={onBack} title="Back to templates">‹</button>
        {editingName ? (
          <input autoFocus className={`${fieldBase} min-w-56 font-semibold`} value={template.name} onChange={(event) => store.update((current) => ({ ...current, name: event.target.value }))} onBlur={() => setEditingName(false)} onKeyDown={(event) => event.key === "Enter" && setEditingName(false)} aria-label="Template name" />
        ) : (
          <button type="button" className="max-w-56 truncate rounded-lg px-2 py-1 text-left text-base font-bold text-ink hover:bg-[var(--surface-soft)]" title="Rename" onClick={() => setEditingName(true)}>{template.name || "Untitled template"} <span className="text-xs font-normal text-soft-ink">✎</span></button>
        )}
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${state.dirty ? "text-[#b25e00]" : "text-[#2f9e5b]"}`}><span className={`size-1.5 rounded-full ${state.dirty ? "bg-[#e0730f]" : "bg-[#2f9e5b]"}`} />{state.dirty ? "Unsaved changes" : "Saved"}</span>
        <button type="button" className={`${primaryBtn} px-4 py-1.5`} onClick={onSave} disabled={busy || !state.dirty}>{busy ? "Saving…" : "Save"}</button>

        <span className="mx-1 hidden h-6 w-px bg-ink/10 sm:block" />

        <label className="flex items-center gap-1.5 text-xs font-semibold text-soft-ink">View
          <select className={`${fieldBase} max-w-48 py-1.5 text-sm`} value={key} onChange={(event) => { if (event.target.value === "__new") { setNewView(true); return; } const [layoutId, viewId] = event.target.value.split("::"); store.setOutput(layoutId, viewId); }} aria-label="View">
            {outputs.map(({ layout: l, view: v }) => <option key={`${l.id}::${v.id}`} value={`${l.id}::${v.id}`}>{v.name} · {sizeLabel(l)}</option>)}
            <option value="__new">＋ New view…</option>
          </select>
        </label>
        <span className="hidden rounded-full bg-[var(--surface-soft)] px-2.5 py-1 text-[11px] font-semibold text-soft-ink xl:inline">{sizeLabel(layout)} · {layout.canvas.width}×{layout.canvas.height} mm</span>

        <div className="mx-auto"><Segmented size="md" value={state.mode} options={[["design", "Design"], ["views", "Views"], ["data", "Data"], ["preview", "Preview"], ["export", "Export"]]} onChange={(mode) => store.dispatch({ type: "setMode", mode })} /></div>

        {state.mode === "design" ? <Segmented value={template.editorMode || "simple"} options={[["simple", "Simple"], ["advanced", "Advanced"]]} onChange={(mode) => store.update((current) => ({ ...current, editorMode: mode }))} /> : null}
        {state.mode === "design" && (template.editorMode || "simple") === "advanced" ? <label className="flex items-center gap-1.5 text-xs font-semibold text-ink"><input type="checkbox" checked={state.sampleMode} onChange={(event) => store.dispatch({ type: "setSample", on: event.target.checked })} />Sample data</label> : null}
        <button type="button" className={`${ghostBtn} px-2.5`} disabled={!state.history.length} onClick={() => store.dispatch({ type: "undo" })} title="Undo (⌘Z)">↶</button>
        <button type="button" className={`${ghostBtn} px-2.5`} disabled={!state.future.length} onClick={() => store.dispatch({ type: "redo" })} title="Redo (⇧⌘Z)">↷</button>
        {state.savedId ? <button type="button" className="rounded-full px-2 py-1 text-xs font-semibold text-soft-ink hover:text-[var(--color-danger)]" onClick={onDelete} title="Delete template">Delete</button> : null}
      </div>
      {status ? <p className="m-0 px-1 text-xs text-[var(--accent-ink)]">{status}</p> : null}
      {newView ? <NewViewDialog layout={layout} onClose={() => setNewView(false)} onCreate={(input) => { store.addOutput(input); setNewView(false); store.dispatch({ type: "setMode", mode: "design" }); }} /> : null}
    </>
  );
}
