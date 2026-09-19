"use client";

import { useMemo, useState } from "react";
import type { DataObject, Element, ExportFormat, Layout, Template, View } from "../engine/types";
import { EXPORTS_BY_CLASS } from "../engine/types";
import { layoutDocument } from "../engine/layout";
import { walkElements } from "../engine/model";
import type { Store } from "../state/useTemplateStore";
import { card, fieldBase, ghostBtn, kicker, label, primaryBtn } from "../ui";
import { sizeLabel } from "../StudioShell";
import { ExportPicker, FORMAT_LABELS, NewViewDialog } from "./NewViewDialog";

function elementLabel(element: Element): string {
  if (element.name) return element.name;
  if (element.type === "text") return element.source.type === "static" ? element.source.value.slice(0, 28) || "Text" : "AI field";
  if (element.type === "group") return "Group";
  return element.type;
}

function viewFormats(layout: Layout, view: View): ExportFormat[] {
  return view.exports || EXPORTS_BY_CLASS[layout.class].filter((f) => f !== "png" && f !== "html_slideshow");
}

/** One card per view: what it is, its size, formats and page count, plus edit / open. */
export function ViewsMode({ store, template, sampleData }: { store: Store; template: Template; sampleData: DataObject }) {
  const [editing, setEditing] = useState<{ layoutId: string; viewId: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const outputs = template.layouts.flatMap((layout) => layout.views.map((view) => ({ layout, view })));
  const counts = useMemo(() => Object.fromEntries(outputs.map(({ layout, view }) => { try { return [`${layout.id}::${view.id}`, layoutDocument(template, sampleData, { layoutId: layout.id, viewId: view.id }).pages.length]; } catch { return [`${layout.id}::${view.id}`, layout.pages.length]; } })), [template, sampleData, outputs]);
  const active = editing ? outputs.find((o) => o.layout.id === editing.layoutId && o.view.id === editing.viewId) : null;

  return (
    <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section className={`${card} p-5`}>
        <div className="flex items-center justify-between gap-2">
          <div><p className={kicker}>Views</p><p className="m-0 mt-1 text-xs text-soft-ink">Each view is one way of outputting this template — different visibility, size or formats. Elements are shared, never duplicated.</p></div>
          <button type="button" className={primaryBtn} onClick={() => setCreating(true)}>＋ New view</button>
        </div>
        <div className="mt-4 grid gap-2">
          {outputs.map(({ layout, view }) => {
            const isCurrent = store.state.layoutId === layout.id && store.state.viewId === view.id;
            const pages = counts[`${layout.id}::${view.id}`];
            return (
              <div key={`${layout.id}::${view.id}`} className={`flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 ${isCurrent ? "border-[var(--accent)]/40 bg-[var(--accent-soft)]/40" : "border-ink/10"}`}>
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--surface-soft)] text-lg">{layout.class === "slides" ? "▭" : "▯"}</span>
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-sm font-bold text-ink">{view.name}{isCurrent ? <span className="ml-2 rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] font-semibold text-white">Editing</span> : null}</p>
                  <p className="m-0 text-xs text-soft-ink">{view.description || (layout.class === "slides" ? "Slide deck" : "Paged document")}</p>
                  <p className="m-0 mt-1 text-[11px] text-soft-ink">{viewFormats(layout, view).map((f) => FORMAT_LABELS[f]).join(" · ")} &nbsp;·&nbsp; {sizeLabel(layout)} · {pages} {layout.class === "slides" ? "slide" : "page"}{pages === 1 ? "" : "s"}</p>
                </div>
                <button type="button" className={ghostBtn} onClick={() => setEditing({ layoutId: layout.id, viewId: view.id })}>Settings</button>
                <button type="button" className={`${ghostBtn} ${isCurrent ? "opacity-50" : ""}`} onClick={() => { store.setOutput(layout.id, view.id); store.dispatch({ type: "setMode", mode: "design" }); }}>Open in Design</button>
              </div>
            );
          })}
        </div>
      </section>

      {active ? <ViewSettings store={store} template={template} layout={active.layout} view={active.view} onClose={() => setEditing(null)} /> : (
        <aside className={`${card} p-5`}>
          <p className={kicker}>How views work</p>
          <ul className="m-0 mt-2 grid list-disc gap-1.5 pl-4 text-sm text-soft-ink">
            <li><strong className="text-ink">Same size</strong> views share the elements — you only choose what is visible (e.g. hide the answers for students).</li>
            <li><strong className="text-ink">Another size</strong> (slides, Letter…) copies the elements so you can rearrange them for that format.</li>
            <li>Each view picks its own export formats; Export offers only those.</li>
            <li>Repeating content (questions, cards) flows onto as many pages or slides as needed in every view.</li>
          </ul>
        </aside>
      )}
      {creating ? <NewViewDialog layout={store.layout!} onClose={() => setCreating(false)} onCreate={(input) => { store.addOutput(input); setCreating(false); }} /> : null}
    </div>
  );
}

function ViewSettings({ store, template, layout, view, onClose }: { store: Store; template: Template; layout: Layout; view: View; onClose: () => void }) {
  const updateView = (updater: (view: View) => View) => store.update((current) => ({ ...current, layouts: current.layouts.map((l) => (l.id === layout.id ? { ...l, views: l.views.map((v) => (v.id === view.id ? updater(v) : v)) } : l)) }));
  const allViewIds = layout.views.map((v) => v.id);
  const rows: { element: Element; depth: number }[] = [];
  for (const page of layout.pages) walkElements(page.elements, (element, parent) => { if (!parent) rows.push({ element, depth: 0 }); else if (parent && rows.some((r) => r.element.id === parent.id) && element.type === "group") rows.push({ element, depth: 1 }); });
  const isVisible = (element: Element) => !element.visibility.views || element.visibility.views.includes(view.id);
  const setVisible = (element: Element, on: boolean) => store.update((current) => ({
    ...current,
    layouts: current.layouts.map((l) => (l.id !== layout.id ? l : { ...l, pages: l.pages.map((page) => ({ ...page, elements: toggleDeep(page.elements, element.id, on) })) }))
  }));
  function toggleDeep(list: Element[], id: string, on: boolean): Element[] {
    return list.map((item) => {
      if (item.id === id) {
        const currentList = item.visibility.views || allViewIds;
        const next = on ? [...new Set([...currentList, view.id])] : currentList.filter((v) => v !== view.id);
        return { ...item, visibility: { views: next.length === allViewIds.length ? undefined : next } };
      }
      return item.type === "group" ? { ...item, children: toggleDeep(item.children, id, on) } : item;
    });
  }
  const canDelete = template.layouts.flatMap((l) => l.views).length > 1;
  function remove() {
    if (!canDelete) return;
    store.update((current) => {
      const layouts = current.layouts.map((l) => (l.id === layout.id ? { ...l, views: l.views.filter((v) => v.id !== view.id) } : l)).filter((l) => l.views.length > 0);
      return { ...current, layouts };
    });
    onClose();
  }
  return (
    <aside className={`${card} p-5`}>
      <div className="flex items-center justify-between"><p className="m-0 text-sm font-bold text-ink">View settings</p><button type="button" className="text-xs text-soft-ink hover:text-ink" onClick={onClose}>Close ✕</button></div>
      <div className="mt-3 grid gap-3">
        <div><label className={label}>Name</label><input className={`${fieldBase} w-full`} value={view.name} onChange={(event) => updateView((v) => ({ ...v, name: event.target.value }))} /></div>
        <div><label className={label}>Description</label><input className={`${fieldBase} w-full`} value={view.description || ""} onChange={(event) => updateView((v) => ({ ...v, description: event.target.value }))} placeholder="Who is it for, what does it show" /></div>
        <div><label className={label}>Page size</label><p className="m-0 text-sm text-ink">{sizeLabel(layout)} · {layout.canvas.width}×{layout.canvas.height} mm <span className="text-xs text-soft-ink">— to output at another size, create a new view with that size.</span></p></div>
        <div><label className={label}>Export formats</label><ExportPicker formats={EXPORTS_BY_CLASS[layout.class]} value={viewFormats(layout, view)} onChange={(next) => updateView((v) => ({ ...v, exports: next }))} /></div>
        <div>
          <label className={label}>Visible in this view</label>
          <div className="grid gap-1">
            {rows.map(({ element, depth }) => (
              <label key={element.id} className="flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-ink/10 px-3 py-1.5 text-sm text-ink" style={{ marginLeft: depth * 14 }}>
                <span className="truncate">{element.type === "group" ? "↻ " : element.type === "text" && element.source.type === "field" ? "✦ " : ""}{elementLabel(element)}</span>
                <input type="checkbox" checked={isVisible(element)} onChange={(event) => setVisible(element, event.target.checked)} />
              </label>
            ))}
            {!rows.length ? <p className="m-0 text-xs text-soft-ink">No elements yet.</p> : null}
          </div>
          <p className="m-0 mt-1.5 text-[11px] text-soft-ink">Hide the answer for students, show it in the answer key — same template.</p>
        </div>
        {canDelete ? <button type="button" className="justify-self-start text-xs font-semibold text-[var(--color-danger)]" onClick={remove}>Delete this view</button> : null}
      </div>
    </aside>
  );
}
