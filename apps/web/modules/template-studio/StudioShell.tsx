"use client";

import { useState } from "react";
import { CANVAS_PRESETS } from "./engine/model";
import type { Store } from "./state/useTemplateStore";
import { card, fieldBase, ghostBtn, primaryBtn } from "./ui";
import { Segmented } from "./design/inspector/Segmented";

/** Top bar: name · Layout · View · Design | Data | Preview | Export · sample toggle · Save. */
export function StudioShell({ store, busy, status, onSave, onDelete, onBack }: { store: Store; busy: boolean; status: string; onSave: () => void; onDelete: () => void; onBack: () => void }) {
  const { state, layout, view } = store;
  const template = state.template!;
  const [adding, setAdding] = useState<"layout" | "view" | null>(null);
  const [draft, setDraft] = useState("");
  const [preset, setPreset] = useState("slides-16-9");
  if (!layout) return null;

  function commit() {
    if (!draft.trim()) return;
    if (adding === "layout") store.addLayout(draft.trim(), preset);
    if (adding === "view") store.addView(draft.trim());
    setAdding(null);
    setDraft("");
  }

  return (
    <>
      <div className={`${card} flex flex-wrap items-center gap-2 px-4 py-2.5`}>
        <button type="button" className={ghostBtn} onClick={onBack} title="Back to templates">‹</button>
        <input className={`${fieldBase} min-w-44 font-semibold`} value={template.name} onChange={(event) => store.update((current) => ({ ...current, name: event.target.value }))} aria-label="Template name" />
        <select className={fieldBase} value={layout.id} onChange={(event) => (event.target.value === "__new" ? setAdding("layout") : store.dispatch({ type: "setLayout", id: event.target.value }))} aria-label="Layout">
          {template.layouts.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.class === "slides" ? "slides" : `${item.canvas.width}×${item.canvas.height}`}</option>)}
          <option value="__new">＋ New layout…</option>
        </select>
        <select className={fieldBase} value={view?.id || ""} onChange={(event) => (event.target.value === "__new" ? setAdding("view") : store.dispatch({ type: "setView", id: event.target.value }))} aria-label="View">
          {layout.views.map((item) => <option key={item.id} value={item.id}>View: {item.name}</option>)}
          <option value="__new">＋ New view…</option>
        </select>
        <div className="mx-auto"><Segmented size="md" value={state.mode} options={[["design", "Design"], ["data", "Data"], ["preview", "Preview"], ["export", "Export"]]} onChange={(mode) => store.dispatch({ type: "setMode", mode })} /></div>
        {state.mode === "design" ? <label className="flex items-center gap-2 text-xs font-semibold text-ink"><input type="checkbox" checked={state.sampleMode} onChange={(event) => store.dispatch({ type: "setSample", on: event.target.checked })} />Sample data</label> : null}
        <button type="button" className={ghostBtn} disabled={!state.history.length} onClick={() => store.dispatch({ type: "undo" })} title="Undo">↶</button>
        <button type="button" className={ghostBtn} disabled={!state.future.length} onClick={() => store.dispatch({ type: "redo" })} title="Redo">↷</button>
        {state.savedId ? <button type="button" className={`${ghostBtn} text-[var(--color-danger)]`} onClick={onDelete}>Delete</button> : null}
        <button type="button" className={primaryBtn} onClick={onSave} disabled={busy || !state.dirty}>{busy ? "Working…" : state.dirty ? "Save template" : "Saved"}</button>
      </div>
      {adding ? (
        <div className={`${card} flex flex-wrap items-center gap-2 px-4 py-3`}>
          <span className="text-sm font-semibold text-ink">{adding === "layout" ? "New layout" : "New view"}</span>
          <input autoFocus className={fieldBase} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && commit()} placeholder={adding === "layout" ? "Presentation" : "Answer key"} />
          {adding === "layout" ? <select className={fieldBase} value={preset} onChange={(event) => setPreset(event.target.value)}>{Object.entries(CANVAS_PRESETS).map(([key, spec]) => <option key={key} value={key}>{spec.label}</option>)}</select> : <span className="text-xs text-soft-ink">Inherits this layout; hide or restyle elements per view.</span>}
          <button type="button" className={primaryBtn} onClick={commit} disabled={!draft.trim()}>Create</button>
          <button type="button" className={ghostBtn} onClick={() => setAdding(null)}>Cancel</button>
        </div>
      ) : null}
      {status ? <p className="m-0 px-1 text-xs text-[var(--accent-ink)]">{status}</p> : null}
    </>
  );
}
