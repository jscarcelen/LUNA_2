"use client";

import { useMemo, useState } from "react";
import { templateFolderOf } from "../TemplateThumbnail";
import { KIND_LABEL, templateComponents, templateKind } from "../matrix";
import type { SavedTemplateRow } from "../SourceChooser";

/** Saved templates grouped by folder (named folders A–Z, unfiled last), each tagged with its category. */
export function groupTemplates(templates: SavedTemplateRow[]) {
  const byFolder = new Map<string, { row: SavedTemplateRow; kind: ReturnType<typeof templateKind> }[]>();
  for (const row of templates) {
    const folder = templateFolderOf(row);
    const list = byFolder.get(folder) || [];
    list.push({ row, kind: templateKind(templateComponents(row)) });
    byFolder.set(folder, list);
  }
  const named = [...byFolder.keys()].filter(Boolean).sort((a, b) => a.localeCompare(b));
  return [...named.map((folder) => ({ folder, items: byFolder.get(folder) || [] })), ...(byFolder.has("") ? [{ folder: "", items: byFolder.get("") || [] }] : [])];
}

/**
 * A dropdown of the saved templates laid out the way Template Studio files them: one group per
 * folder (📁), the unfiled ones last, each with its category (document, quiz, game).
 */
export function TemplatePicker({ templates, value, onChange, loading = false }: { templates: SavedTemplateRow[]; value: string; onChange: (id: string) => void; loading?: boolean }) {
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => groupTemplates(templates), [templates]);
  const chosen = templates.find((row) => row.id === value);
  const label = chosen ? chosen.name : loading ? "Loading templates…" : templates.length ? "Choose a template…" : "No saved templates yet";

  return (
    <div className="relative min-w-0 flex-1">
      <button type="button" disabled={!templates.length} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}
        className="flex w-full min-w-40 items-center justify-between gap-2 rounded-full border border-ink/15 bg-white px-4 py-2 text-left text-sm font-semibold text-ink transition hover:bg-[var(--surface-soft)] disabled:opacity-50">
        <span className={`min-w-0 truncate ${chosen ? "" : "text-soft-ink"}`}>{chosen ? `${KIND_LABEL[templateKind(templateComponents(chosen))].icon} ${label}` : label}</span>
        <span aria-hidden className="shrink-0 text-xs text-soft-ink">▾</span>
      </button>
      {open ? (
        <>
          <button type="button" aria-label="Close" className="fixed inset-0 z-30 cursor-default bg-transparent" onClick={() => setOpen(false)} />
          <div role="listbox" className="absolute left-0 right-0 top-full z-40 mt-1 max-h-72 overflow-y-auto rounded-2xl border border-ink/12 bg-white p-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.2)]">
            {groups.map((group) => (
              <div key={group.folder || "__none"} className="pb-1">
                <p className="m-0 px-2.5 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-soft-ink">{group.folder ? `📁 ${group.folder}` : groups.length > 1 ? "Unfiled" : "Templates"}</p>
                {group.items.map(({ row, kind }) => (
                  <button key={row.id} type="button" role="option" aria-selected={row.id === value} onClick={() => { onChange(row.id); setOpen(false); }}
                    className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition ${row.id === value ? "bg-[var(--accent-soft)] font-semibold text-[var(--accent-ink)]" : "text-ink hover:bg-[var(--surface-soft)]"}`}>
                    <span aria-hidden>{KIND_LABEL[kind].icon}</span>
                    <span className="min-w-0 flex-1 truncate">{row.name}</span>
                    <span className="shrink-0 text-[10px] text-soft-ink">{KIND_LABEL[kind].label}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
