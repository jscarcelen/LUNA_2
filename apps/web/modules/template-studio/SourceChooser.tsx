"use client";

import { useMemo, useRef, useState } from "react";
import { TemplateThumbnail, compatibleAgentNames, templateFolderOf } from "./TemplateThumbnail";
import { TemplateChat } from "./design/TemplateChat";
import { card, kicker } from "./ui";

export interface SavedTemplateRow { id: string; name: string; folderId?: string; templateV3?: unknown; docModel?: unknown; dataFields?: unknown[] }

function AgentChips({ names }: { names: string[] }) {
  if (!names.length) return <p className="m-0 mt-1 text-[10px] text-soft-ink">No compatible agent yet</p>;
  return <p className="m-0 mt-1 flex flex-wrap gap-1">{names.slice(0, 3).map((name) => <span key={name} className="rounded-full bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent-ink)]">✦ {name}</span>)}{names.length > 3 ? <span className="text-[10px] text-soft-ink">+{names.length - 3}</span> : null}</p>;
}

type TemplateKind = "document" | "cards";

/** Kind picker — the first step before the prompt. */
function KindPicker({ onPick }: { onPick: (kind: TemplateKind) => void }) {
  return (
    <div className={`${card} p-6`}>
      <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--accent-ink)]">Template Studio</span>
      <h3 className="m-0 mt-3 text-[24px] font-bold tracking-tight text-ink">Create a new template</h3>
      <p className="m-0 mt-1 max-w-xl text-sm text-soft-ink">A template is a designed document plus the places where the AI fills in. Choose what you want to make:</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onPick("document")}
          className="group flex flex-col items-start gap-3 rounded-2xl border-2 border-ink/10 bg-white p-6 text-left transition hover:border-[var(--accent)] hover:shadow-[0_8px_28px_rgba(0,0,0,0.08)]"
        >
          <span className="grid size-14 place-items-center rounded-2xl bg-[var(--accent-soft)] text-3xl">📄</span>
          <span>
            <span className="block text-base font-bold text-ink">Document, Exam or Worksheet</span>
            <span className="mt-1 block text-sm text-soft-ink">Printable A4 / US Letter pages, also works as slides. Headers, footers, question cards, structured content, activities — in the order you choose.</span>
          </span>
          <span className="mt-auto flex flex-wrap gap-1.5">
            {["📋 Exam", "📝 Worksheet", "📖 Study notes", "✍ Fill-in-the-blanks"].map((tag) => (
              <span key={tag} className="rounded-full bg-[var(--surface-soft)] px-2.5 py-0.5 text-[11px] font-semibold text-soft-ink">{tag}</span>
            ))}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onPick("cards")}
          className="group flex flex-col items-start gap-3 rounded-2xl border-2 border-ink/10 bg-white p-6 text-left transition hover:border-[var(--accent)] hover:shadow-[0_8px_28px_rgba(0,0,0,0.08)]"
        >
          <span className="grid size-14 place-items-center rounded-2xl bg-[#fdf4ff] text-3xl">🃏</span>
          <span>
            <span className="block text-base font-bold text-ink">Cards, Games or Flashcards</span>
            <span className="mt-1 block text-sm text-soft-ink">One item per card or slide. Flashcards, matching games, word puzzles, cut-apart tiles — made to play or display on screen.</span>
          </span>
          <span className="mt-auto flex flex-wrap gap-1.5">
            {["🃏 Flashcards", "🎮 Word search", "▦ Matching game", "✂ Cut & paste"].map((tag) => (
              <span key={tag} className="rounded-full bg-[#fdf4ff] px-2.5 py-0.5 text-[11px] font-semibold text-[#7e22ce]">{tag}</span>
            ))}
          </span>
        </button>
      </div>
    </div>
  );
}

export function SourceChooser({ templates, busy, agents = [], onBlank, onStarter, onUpload, onGenerated, onOpen, onMoveToFolder, onDelete }: { templates: SavedTemplateRow[]; busy: boolean; agents?: { id: string; name: string; fields: any[] }[]; onBlank: () => void; onStarter: (kind: string) => void; onGenerated?: (template: any, note: string) => void; onUpload: (file: File) => void; onOpen: (row: SavedTemplateRow) => void; onMoveToFolder?: (row: SavedTemplateRow, folder: string) => void; onDelete?: (row: SavedTemplateRow) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<"gallery" | "list">("gallery");
  const [folder, setFolder] = useState<string>("");
  const [newFolder, setNewFolder] = useState("");
  const [extraFolders, setExtraFolders] = useState<string[]>([]);
  const [kind, setKind] = useState<TemplateKind | null>(null);

  const folders = useMemo(() => [...new Set([...templates.map(templateFolderOf).filter(Boolean), ...extraFolders])].sort(), [templates, extraFolders]);
  const createFolder = () => { const name = newFolder.trim(); if (!name) return; setExtraFolders((current) => [...new Set([...current, name])]); setFolder(name); setNewFolder(""); };
  const shown = templates.filter((row) => (folder === "" ? true : folder === "__none" ? !templateFolderOf(row) : templateFolderOf(row) === folder));

  return (
    <section className="tw-scope grid gap-4">
      {/* Step 1 — kind picker (or step 2 header once kind is chosen) */}
      {!kind ? (
        <KindPicker onPick={setKind} />
      ) : (
        <div className={`${card} p-4`}>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setKind(null)} className="rounded-full border border-ink/15 px-3 py-1.5 text-xs font-semibold text-soft-ink hover:text-ink">‹ Change type</button>
            <span className="text-sm font-semibold text-ink">{kind === "document" ? "📄 Document, Exam or Worksheet" : "🃏 Cards, Games or Flashcards"}</span>
          </div>
        </div>
      )}

      {/* Step 2 — prompt (shown once kind is picked) */}
      {kind && onGenerated ? (
        <TemplateChat
          kind={kind}
          templateNames={templates.map((row) => row.name)}
          onBuilt={onGenerated}
          onUpload={onUpload}
        />
      ) : null}

      {/* Gallery */}
      <div className={`${card} p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={kicker}>My templates</p>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 rounded-xl bg-[var(--surface-soft)] p-1">{(["gallery", "list"] as const).map((v) => <button key={v} type="button" onClick={() => setView(v)} className={`rounded-lg px-2.5 py-1 text-xs font-semibold capitalize ${view === v ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink"}`}>{v}</button>)}</div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {[["", "All"], ["__none", "Unfiled"], ...folders.map((f) => [f, f])].map(([value, text]) => <button key={value} type="button" onClick={() => setFolder(value)} className={`rounded-full px-3 py-1 text-xs font-semibold ${folder === value ? "bg-ink text-white" : "bg-[var(--surface-soft)] text-soft-ink hover:text-ink"}`}>{value && value !== "__none" ? "📁 " : ""}{text}</button>)}
          <span className="ml-auto flex items-center gap-1"><input className="rounded-full border border-ink/15 px-3 py-1 text-xs" value={newFolder} onChange={(event) => setNewFolder(event.target.value)} placeholder="New folder" onKeyDown={(event) => event.key === "Enter" && createFolder()} /><button type="button" className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white disabled:opacity-40" disabled={!newFolder.trim()} onClick={createFolder}>＋</button></span>
        </div>
        {view === "gallery" ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {shown.map((row) => (
              <div key={row.id} className="group rounded-2xl border border-ink/10 bg-white p-2 transition hover:border-[var(--accent)]/50 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
                <button type="button" onClick={() => onOpen(row)} className="block w-full text-left"><TemplateThumbnail template={row} width={170} /><p className="m-0 mt-2 truncate text-sm font-semibold text-ink">{row.name}</p><p className="m-0 text-[11px] text-soft-ink">{(row.dataFields || []).length} fields{templateFolderOf(row) ? ` · ${templateFolderOf(row)}` : ""}</p><AgentChips names={compatibleAgentNames(row, agents)} /></button>
                <div className="mt-1 flex items-center gap-1">
                  {onMoveToFolder ? <select className="min-w-0 flex-1 rounded-lg border border-ink/10 px-2 py-1 text-[11px] text-soft-ink" value={templateFolderOf(row)} onChange={(event) => onMoveToFolder(row, event.target.value)}><option value="">Unfiled</option>{folders.map((f) => <option key={f} value={f}>📁 {f}</option>)}</select> : null}
                  {onDelete ? <button type="button" title="Delete" className="grid size-7 shrink-0 place-items-center rounded-lg border border-ink/10 text-xs text-soft-ink hover:border-[rgba(215,0,21,0.4)] hover:text-[var(--color-danger)]" onClick={() => { if (window.confirm(`Delete "${row.name}"? This cannot be undone.`)) onDelete(row); }}>🗑</button> : null}
                </div>
              </div>
            ))}
            {!shown.length ? <p className="m-0 col-span-full text-sm text-soft-ink">No templates yet — describe one above to get started.</p> : null}
          </div>
        ) : (
          <div className="mt-3 grid gap-1">
            {shown.map((row) => (
              <div key={row.id} className="flex items-center gap-2 rounded-xl px-3 py-2 transition hover:bg-[var(--surface-soft)]">
                <button type="button" onClick={() => onOpen(row)} className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left">
                  <span className="truncate text-sm font-semibold text-ink">{row.name}{templateFolderOf(row) ? <span className="ml-2 text-xs font-normal text-soft-ink">📁 {templateFolderOf(row)}</span> : null}</span>
                  <span className="shrink-0 text-xs text-soft-ink">{(row.dataFields || []).length} fields</span>
                </button>
                {onDelete ? <button type="button" title="Delete" className="grid size-7 shrink-0 place-items-center rounded-lg text-xs text-soft-ink hover:text-[var(--color-danger)]" onClick={() => { if (window.confirm(`Delete "${row.name}"? This cannot be undone.`)) onDelete(row); }}>🗑</button> : null}
              </div>
            ))}
            {!shown.length ? <p className="m-0 text-sm text-soft-ink">No templates yet.</p> : null}
          </div>
        )}
      </div>

      {/* Hidden file input for PDF/image upload (accessible from TemplateChat) */}
      <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.target.value = ""; }} />
      {busy ? <p className="m-0 px-1 text-xs text-[var(--accent-ink)]">Preparing pages…</p> : null}
    </section>
  );
}
