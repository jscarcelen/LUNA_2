"use client";

import { useMemo, useRef, useState } from "react";
import { TemplateThumbnail, compatibleAgentNames, templateFolderOf } from "./TemplateThumbnail";
import { card, kicker } from "./ui";

export interface SavedTemplateRow { id: string; name: string; folderId?: string; templateV3?: unknown; docModel?: unknown; dataFields?: unknown[] }

function AgentChips({ names }: { names: string[] }) {
  if (!names.length) return <p className="m-0 mt-1 text-[10px] text-soft-ink">No compatible agent yet</p>;
  return <p className="m-0 mt-1 flex flex-wrap gap-1">{names.slice(0, 3).map((name) => <span key={name} className="rounded-full bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent-ink)]">✦ {name}</span>)}{names.length > 3 ? <span className="text-[10px] text-soft-ink">+{names.length - 3}</span> : null}</p>;
}

export function SourceChooser({ templates, busy, agents = [], onBlank, onStarter, onUpload, onOpen, onMoveToFolder }: { templates: SavedTemplateRow[]; busy: boolean; agents?: { id: string; name: string; fields: any[] }[]; onBlank: () => void; onStarter: (kind: "exam" | "flashcards") => void; onUpload: (file: File) => void; onOpen: (row: SavedTemplateRow) => void; onMoveToFolder?: (row: SavedTemplateRow, folder: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<"gallery" | "list">("gallery");
  const [folder, setFolder] = useState<string>("");
  const [newFolder, setNewFolder] = useState("");
  const [extraFolders, setExtraFolders] = useState<string[]>([]);
  const folders = useMemo(() => [...new Set([...templates.map(templateFolderOf).filter(Boolean), ...extraFolders])].sort(), [templates, extraFolders]);
  const createFolder = () => { const name = newFolder.trim(); if (!name) return; setExtraFolders((current) => [...new Set([...current, name])]); setFolder(name); setNewFolder(""); };
  const shown = templates.filter((row) => (folder === "" ? true : folder === "__none" ? !templateFolderOf(row) : templateFolderOf(row) === folder));
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
        <div className={`${card} p-5 lg:col-span-2`}>
          <p className={kicker}>Start from an example</p>
          <div className="mt-3 grid gap-2">
            <button type="button" onClick={() => onStarter("exam")} className="flex items-center gap-3 rounded-xl border border-ink/10 px-3 py-2.5 text-left transition hover:bg-[var(--surface-soft)]"><span className="grid size-9 place-items-center rounded-lg bg-[var(--surface-soft)]">📝</span><span><span className="block text-sm font-semibold text-ink">Exam</span><span className="block text-xs text-soft-ink">Question group with nested options, Student / Answer key views.</span></span></button>
            <button type="button" onClick={() => onStarter("flashcards")} className="flex items-center gap-3 rounded-xl border border-ink/10 px-3 py-2.5 text-left transition hover:bg-[var(--surface-soft)]"><span className="grid size-9 place-items-center rounded-lg bg-[var(--surface-soft)]">🃏</span><span><span className="block text-sm font-semibold text-ink">Flashcards</span><span className="block text-xs text-soft-ink">One card per item.</span></span></button>
          </div>
        </div>
        <div className={`${card} p-5 lg:col-span-2`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={kicker}>My templates</p>
            <div className="flex items-center gap-2">
              <div className="flex gap-1 rounded-xl bg-[var(--surface-soft)] p-1">{(["gallery", "list"] as const).map((v) => <button key={v} type="button" onClick={() => setView(v)} className={`rounded-lg px-2.5 py-1 text-xs font-semibold capitalize ${view === v ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink"}`}>{v}</button>)}</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {[["", "All"], ["__none", "Unfiled"], ...folders.map((f) => [f, f])].map(([value, text]) => <button key={value} type="button" onClick={() => setFolder(value)} className={`rounded-full px-3 py-1 text-xs font-semibold ${folder === value ? "bg-ink text-white" : "bg-[var(--surface-soft)] text-soft-ink hover:text-ink"}`}>{value && value !== "__none" ? "📁 " : ""}{text}</button>)}
            <span className="ml-auto flex items-center gap-1"><input className="rounded-full border border-ink/15 px-3 py-1 text-xs" value={newFolder} onChange={(event) => setNewFolder(event.target.value)} placeholder="New folder name" onKeyDown={(event) => event.key === "Enter" && createFolder()} /><button type="button" className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white disabled:opacity-40" disabled={!newFolder.trim()} onClick={createFolder}>＋ Folder</button></span>
          </div>
          {folder && folder !== "__none" && !shown.length ? <p className="m-0 mt-2 text-xs text-soft-ink">Folder “{folder}” is empty — use the dropdown under a template to move it here.</p> : null}
          {view === "gallery" ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {shown.map((row) => (
                <div key={row.id} className="group rounded-2xl border border-ink/10 bg-white p-2 transition hover:border-[var(--accent)]/50 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
                  <button type="button" onClick={() => onOpen(row)} className="block w-full text-left"><TemplateThumbnail template={row} width={170} /><p className="m-0 mt-2 truncate text-sm font-semibold text-ink">{row.name}</p><p className="m-0 text-[11px] text-soft-ink">{row.templateV3 ? "v3" : row.docModel ? "v2" : "legacy"} · {(row.dataFields || []).length} fields{templateFolderOf(row) ? ` · ${templateFolderOf(row)}` : ""}</p><AgentChips names={compatibleAgentNames(row, agents)} /></button>
                  {onMoveToFolder ? <select className="mt-1 w-full rounded-lg border border-ink/10 px-2 py-1 text-[11px] text-soft-ink" value={templateFolderOf(row)} onChange={(event) => onMoveToFolder(row, event.target.value)}><option value="">Unfiled</option>{folders.map((f) => <option key={f} value={f}>📁 {f}</option>)}</select> : null}
                </div>
              ))}
              {!shown.length ? <p className="m-0 text-sm text-soft-ink">No templates here yet.</p> : null}
            </div>
          ) : (
            <div className="mt-3 grid gap-1">
              {shown.map((row) => (
                <button key={row.id} type="button" onClick={() => onOpen(row)} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-[var(--surface-soft)]">
                  <span className="truncate text-sm font-semibold text-ink">{row.name}{templateFolderOf(row) ? <span className="ml-2 text-xs font-normal text-soft-ink">📁 {templateFolderOf(row)}</span> : null}</span>
                  <span className="shrink-0 text-xs text-soft-ink">{row.templateV3 ? "v3" : row.docModel ? "v2 · will upgrade" : "legacy · will upgrade"} · {(row.dataFields || []).length} fields</span>
                </button>
              ))}
              {!shown.length ? <p className="m-0 text-sm text-soft-ink">No templates here yet.</p> : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
