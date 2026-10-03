"use client";

import { useMemo, useState } from "react";
import { TemplateThumbnail, compatibleAgentNames, templateFolderOf } from "./TemplateThumbnail";
import { TemplateMatrix } from "./TemplateMatrix";
import { KIND_LABEL, templateComponents, templateKind, type TemplateKind } from "./matrix";
import { card, kicker, primaryBtn } from "./ui";

export interface SavedTemplateRow { id: string; name: string; folderId?: string; templateV3?: unknown; docModel?: unknown; dataFields?: unknown[] }

function AgentChips({ names }: { names: string[] }) {
  if (!names.length) return <p className="m-0 mt-1 text-[10px] text-soft-ink">No compatible agent yet</p>;
  return <p className="m-0 mt-1 flex flex-wrap gap-1">{names.slice(0, 3).map((name) => <span key={name} className="rounded-full bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent-ink)]">✦ {name}</span>)}{names.length > 3 ? <span className="text-[10px] text-soft-ink">+{names.length - 3}</span> : null}</p>;
}

export function SourceChooser({ templates, busy, agents = [], onNewTemplate, onUpload, onOpen, onMoveToFolder, onDelete }: { templates: SavedTemplateRow[]; busy: boolean; agents?: { id: string; name: string; fields: any[] }[]; onNewTemplate: () => void; onUpload: (file: File) => void; onOpen: (row: SavedTemplateRow) => void; onMoveToFolder?: (row: SavedTemplateRow, folder: string) => void; onDelete?: (row: SavedTemplateRow) => void }) {
  const [view, setView] = useState<"gallery" | "list" | "matrix">("gallery");
  const [kind, setKind] = useState<"" | TemplateKind>("");
  const [folder, setFolder] = useState<string>("");
  const [newFolder, setNewFolder] = useState("");
  const [extraFolders, setExtraFolders] = useState<string[]>([]);

  const folders = useMemo(() => [...new Set([...templates.map(templateFolderOf).filter(Boolean), ...extraFolders])].sort(), [templates, extraFolders]);
  const createFolder = () => { const name = newFolder.trim(); if (!name) return; setExtraFolders((current) => [...new Set([...current, name])]); setFolder(name); setNewFolder(""); };
  // Documents, quizzes or games: decided by the components a template contains.
  const kinds = useMemo(() => new Map(templates.map((row) => [row.id, templateKind(templateComponents(row))] as const)), [templates]);
  const kindOf = (row: SavedTemplateRow): TemplateKind => kinds.get(row.id) || "document";
  const shown = templates.filter((row) => (folder === "" ? true : folder === "__none" ? !templateFolderOf(row) : templateFolderOf(row) === folder) && (!kind || kindOf(row) === kind));
  const KindChip = ({ row }: { row: SavedTemplateRow }) => <span className="rounded-full bg-[var(--surface-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-soft-ink">{KIND_LABEL[kindOf(row)].icon} {KIND_LABEL[kindOf(row)].label}</span>;

  return (
    <section className="tw-scope grid grid-cols-1 gap-4">
      {/* Header */}
      <div className={`${card} flex flex-wrap items-center justify-between gap-3 p-5`}>
        <div>
          <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--accent-ink)]">Template Studio</span>
          <h2 className="m-0 mt-2 text-2xl font-bold tracking-tight text-ink">My templates</h2>
          <p className="m-0 mt-0.5 text-sm text-soft-ink">Templates tell the AI how to format and present its output.</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/dev/block-matrix"
            target="_blank"
            rel="noreferrer"
            title="Internal developer tool — Block Component Matrix"
            className="rounded-xl border border-ink/10 px-3 py-2 text-xs font-semibold text-soft-ink hover:border-ink/25 hover:text-ink"
          >
            ⊞ Block Matrix
          </a>
          <button type="button" className={`${primaryBtn} gap-1.5 px-5 py-2.5 text-sm`} onClick={onNewTemplate}>
            ＋ New template
          </button>
        </div>
      </div>

      {/* Gallery */}
      <div className={`${card} min-w-0 overflow-hidden p-4 md:p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={kicker}>All templates</p>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 rounded-xl bg-[var(--surface-soft)] p-1">{(["gallery", "list", "matrix"] as const).map((v) => <button key={v} type="button" onClick={() => setView(v)} className={`rounded-lg px-2.5 py-1 text-xs font-semibold capitalize ${view === v ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink"}`}>{v}</button>)}</div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-soft-ink">Category</span>
          {([["", "All"], ["document", "📄 Documents"], ["quiz", "📝 Quizzes"], ["game", "🃏 Games & flashcards"]] as const).map(([value, text]) => <button key={value} type="button" onClick={() => setKind(value as "" | TemplateKind)} className={`rounded-full px-3 py-1 text-xs font-semibold ${kind === value ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-soft)] text-soft-ink hover:text-ink"}`}>{text}</button>)}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {[["", "All"], ["__none", "Unfiled"], ...folders.map((f) => [f, f])].map(([value, text]) => <button key={value} type="button" onClick={() => setFolder(value)} className={`rounded-full px-3 py-1 text-xs font-semibold ${folder === value ? "bg-ink text-white" : "bg-[var(--surface-soft)] text-soft-ink hover:text-ink"}`}>{value && value !== "__none" ? "📁 " : ""}{text}</button>)}
          <span className="ml-auto flex items-center gap-1"><input className="rounded-full border border-ink/15 px-3 py-1 text-xs" value={newFolder} onChange={(event) => setNewFolder(event.target.value)} placeholder="New folder" onKeyDown={(event) => event.key === "Enter" && createFolder()} /><button type="button" className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white disabled:opacity-40" disabled={!newFolder.trim()} onClick={createFolder}>＋</button></span>
        </div>
        {view === "matrix" ? <TemplateMatrix templates={shown} /> : view === "gallery" ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {shown.map((row) => (
              <div key={row.id} className="group rounded-2xl border border-ink/10 bg-white p-2 transition hover:border-[var(--accent)]/50 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
                <button type="button" onClick={() => onOpen(row)} className="block w-full text-left"><TemplateThumbnail template={row} width={170} /><p className="m-0 mt-2 truncate text-sm font-semibold text-ink">{row.name}</p><p className="m-0 mt-0.5"><KindChip row={row} /></p><p className="m-0 mt-0.5 text-[11px] text-soft-ink">{(row.dataFields || []).length} fields{templateFolderOf(row) ? ` · ${templateFolderOf(row)}` : ""}</p><AgentChips names={compatibleAgentNames(row, agents)} /></button>
                <div className="mt-1 flex items-center gap-1">
                  {onMoveToFolder ? <select className="min-w-0 flex-1 rounded-lg border border-ink/10 px-2 py-1 text-[11px] text-soft-ink" value={templateFolderOf(row)} onChange={(event) => onMoveToFolder(row, event.target.value)}><option value="">Unfiled</option>{folders.map((f) => <option key={f} value={f}>📁 {f}</option>)}</select> : null}
                  {onDelete ? <button type="button" title="Delete" className="grid size-7 shrink-0 place-items-center rounded-lg border border-ink/10 text-xs text-soft-ink hover:border-[rgba(215,0,21,0.4)] hover:text-[var(--color-danger)]" onClick={() => { if (window.confirm(`Delete "${row.name}"? This cannot be undone.`)) onDelete(row); }}>🗑</button> : null}
                </div>
              </div>
            ))}
            {!shown.length ? (
              <div className="col-span-full flex flex-col items-center gap-4 rounded-2xl border border-dashed border-ink/15 p-10 text-center">
                <span className="text-4xl">📄</span>
                <div>
                  <p className="m-0 font-semibold text-ink">No templates yet</p>
                  <p className="m-0 mt-1 text-sm text-soft-ink">Create your first template to define how the AI presents its output.</p>
                </div>
                <button type="button" className={`${primaryBtn} px-5 py-2`} onClick={onNewTemplate}>＋ Create template</button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-3 grid gap-1">
            {shown.map((row) => (
              <div key={row.id} className="flex items-center gap-2 rounded-xl px-3 py-2 transition hover:bg-[var(--surface-soft)]">
                <button type="button" onClick={() => onOpen(row)} className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left">
                  <span className="truncate text-sm font-semibold text-ink">{row.name} <KindChip row={row} />{templateFolderOf(row) ? <span className="ml-2 text-xs font-normal text-soft-ink">📁 {templateFolderOf(row)}</span> : null}</span>
                  <span className="shrink-0 text-xs text-soft-ink">{(row.dataFields || []).length} fields</span>
                </button>
                {onDelete ? <button type="button" title="Delete" className="grid size-7 shrink-0 place-items-center rounded-lg text-xs text-soft-ink hover:text-[var(--color-danger)]" onClick={() => { if (window.confirm(`Delete "${row.name}"? This cannot be undone.`)) onDelete(row); }}>🗑</button> : null}
              </div>
            ))}
            {!shown.length ? <p className="m-0 text-sm text-soft-ink">No templates yet.</p> : null}
          </div>
        )}
      </div>

      {busy ? <p className="m-0 px-1 text-xs text-[var(--accent-ink)]">Preparing pages…</p> : null}
    </section>
  );
}
