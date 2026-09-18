"use client";

import { useRef } from "react";
import { card, kicker } from "./ui";

export interface SavedTemplateRow { id: string; name: string; templateV3?: unknown; docModel?: unknown; dataFields?: unknown[] }

export function SourceChooser({ templates, busy, onBlank, onStarter, onUpload, onOpen }: { templates: SavedTemplateRow[]; busy: boolean; onBlank: () => void; onStarter: (kind: "exam" | "flashcards") => void; onUpload: (file: File) => void; onOpen: (row: SavedTemplateRow) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <section className="tw-scope grid gap-4">
      <div className={`${card} p-6`}>
        <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--accent-ink)]">Template Studio</span>
        <h3 className="m-0 mt-3 text-[26px] font-bold tracking-tight text-ink">Create a template</h3>
        <p className="m-0 mt-1 max-w-2xl text-sm text-soft-ink">A template is a designed document plus the places where the AI writes. Start from your own exam or worksheet, from an example, or from a blank page — you don't need an agent yet.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { key: "blank", title: "Blank canvas", text: "Build your design from zero.", icon: "▭", action: onBlank },
            { key: "pdf", title: "Upload PDF", text: "Each page becomes a locked background.", icon: "⇪", action: () => fileRef.current?.click() },
            { key: "image", title: "Upload image", text: "A scanned page or a design export.", icon: "▣", action: () => fileRef.current?.click() },
            { key: "word", title: "Import Word", text: "Coming soon — export to PDF meanwhile.", icon: "W", disabled: true }
          ].map((item) => (
            <button key={item.key} type="button" disabled={item.disabled || busy} onClick={item.action} className="flex items-start gap-3 rounded-2xl border border-ink/10 bg-white p-4 text-left transition hover:border-[var(--accent)]/50 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] disabled:opacity-50">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-lg font-bold text-[var(--accent-ink)]">{item.icon}</span>
              <span><span className="block text-sm font-bold text-ink">{item.title}</span><span className="block text-xs text-soft-ink">{item.text}</span></span>
            </button>
          ))}
        </div>
        <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.target.value = ""; }} />
        {busy ? <p className="m-0 mt-3 text-xs text-[var(--accent-ink)]">Preparing your pages…</p> : null}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className={`${card} p-5`}>
          <p className={kicker}>Start from an example</p>
          <div className="mt-3 grid gap-2">
            <button type="button" onClick={() => onStarter("exam")} className="flex items-center gap-3 rounded-xl border border-ink/10 px-3 py-2.5 text-left transition hover:bg-[var(--surface-soft)]"><span className="grid size-9 place-items-center rounded-lg bg-[var(--surface-soft)]">📝</span><span><span className="block text-sm font-semibold text-ink">Exam</span><span className="block text-xs text-soft-ink">Question group with nested options, Student / Answer key views.</span></span></button>
            <button type="button" onClick={() => onStarter("flashcards")} className="flex items-center gap-3 rounded-xl border border-ink/10 px-3 py-2.5 text-left transition hover:bg-[var(--surface-soft)]"><span className="grid size-9 place-items-center rounded-lg bg-[var(--surface-soft)]">🃏</span><span><span className="block text-sm font-semibold text-ink">Flashcards</span><span className="block text-xs text-soft-ink">One card per item.</span></span></button>
          </div>
        </div>
        <div className={`${card} p-5`}>
          <p className={kicker}>Open a saved template</p>
          <div className="mt-3 grid max-h-56 gap-1 overflow-auto">
            {templates.map((row) => (
              <button key={row.id} type="button" onClick={() => onOpen(row)} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-[var(--surface-soft)]">
                <span className="truncate text-sm font-semibold text-ink">{row.name}</span>
                <span className="shrink-0 text-xs text-soft-ink">{row.templateV3 ? "v3" : row.docModel ? "v2 · will upgrade" : "legacy · will upgrade"} · {(row.dataFields || []).length} fields</span>
              </button>
            ))}
            {!templates.length ? <p className="m-0 text-sm text-soft-ink">No templates yet.</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
