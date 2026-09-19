"use client";

import { useState } from "react";
import type { ExportFormat, Layout, View } from "../engine/types";
import { EXPORTS_BY_CLASS } from "../engine/types";
import { CANVAS_PRESETS } from "../engine/model";
import { ghostBtn, label, primaryBtn, fieldBase } from "../ui";
import { sizeLabel } from "../StudioShell";

export const FORMAT_LABELS: Record<ExportFormat, string> = { pdf: "PDF", docx: "Word", html_print: "HTML", png: "PNG", pptx: "PowerPoint", html_slideshow: "HTML slideshow" };

export function ExportPicker({ formats, value, onChange }: { formats: ExportFormat[]; value: ExportFormat[]; onChange: (next: ExportFormat[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {formats.map((format) => {
        const on = value.includes(format);
        const soon = format === "png" || format === "html_slideshow";
        return <label key={format} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${on ? "border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "border-ink/10 text-soft-ink"} ${soon ? "opacity-50" : ""}`}><input type="checkbox" className="sr-only" disabled={soon} checked={on} onChange={(event) => onChange(event.target.checked ? [...value, format] : value.filter((item) => item !== format))} />{FORMAT_LABELS[format]}{soon ? " (soon)" : ""}</label>;
      })}
    </div>
  );
}

/** Name · description · page size · export formats · start from. Same size = shares the layout (visibility overrides); other size = a copy at that size. */
export function NewViewDialog({ layout, onClose, onCreate }: { layout: Layout; onClose: () => void; onCreate: (input: { name: string; description?: string; preset?: string; exports?: View["exports"]; blank?: boolean }) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [size, setSize] = useState("same");
  const [blank, setBlank] = useState(false);
  const targetClass = size === "same" ? layout.class : CANVAS_PRESETS[size].class;
  const [exports, setExports] = useState<ExportFormat[]>(EXPORTS_BY_CLASS[layout.class].filter((f) => f !== "png" && f !== "html_slideshow"));
  const available = EXPORTS_BY_CLASS[targetClass];
  const picked = exports.filter((f) => available.includes(f));
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-[0_24px_64px_rgba(0,0,0,0.25)]" onClick={(event) => event.stopPropagation()}>
        <h4 className="m-0 text-lg font-bold text-ink">New view</h4>
        <p className="m-0 mt-1 text-xs text-soft-ink">A view is one way of outputting this template — e.g. “Printable exam — with answers” or “Slides, one question each”.</p>
        <div className="mt-4 grid gap-3">
          <div><label className={label}>Name</label><input autoFocus className={`${fieldBase} w-full`} value={name} onChange={(event) => setName(event.target.value)} placeholder="Printable exam — with answers" /></div>
          <div><label className={label}>Description (optional)</label><input className={`${fieldBase} w-full`} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Same as the student version, plus the answer key" /></div>
          <div>
            <label className={label}>Page size</label>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {[["same", `Same as now (${sizeLabel(layout)})`], ...Object.entries(CANVAS_PRESETS).map(([key, spec]) => [key, spec.label])].map(([key, text]) => (
                <button key={key} type="button" onClick={() => { setSize(key); const cls = key === "same" ? layout.class : CANVAS_PRESETS[key].class; setExports(EXPORTS_BY_CLASS[cls].filter((f) => f !== "png" && f !== "html_slideshow")); }} className={`rounded-xl border px-3 py-2 text-left text-xs font-semibold ${size === key ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "border-ink/10 text-ink hover:bg-[var(--surface-soft)]"}`}>{text}</button>
              ))}
            </div>
            <p className="m-0 mt-1.5 text-[11px] text-soft-ink">{size === "same" ? "Shares the same elements — choose what is visible in this view." : "Copies the elements to the new size so you can rearrange them."}</p>
            {size !== "same" ? <label className="mt-1.5 flex items-center gap-2 text-xs text-ink"><input type="checkbox" checked={blank} onChange={(event) => setBlank(event.target.checked)} />Start blank instead of copying</label> : null}
          </div>
          <div><label className={label}>Export formats</label><ExportPicker formats={available} value={picked} onChange={setExports} /></div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={ghostBtn} onClick={onClose}>Cancel</button>
          <button type="button" className={primaryBtn} disabled={!name.trim()} onClick={() => onCreate({ name: name.trim(), description: description.trim() || undefined, preset: size === "same" ? undefined : size, exports: picked, blank })}>Create view</button>
        </div>
      </div>
    </div>
  );
}
