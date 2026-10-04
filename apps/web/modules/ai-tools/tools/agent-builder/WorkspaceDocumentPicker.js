"use client";

import { useMemo, useState } from "react";

const fieldClass = "w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink placeholder:text-soft-ink/70 outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]";

/** "Subject › Folder › Subfolder" labels for the folders of a subject, by folder id. */
export function folderPaths(folders = []) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const pathOf = (folder, guard = 0) => {
    const parent = folder.parentFolderId && guard < 20 ? byId.get(folder.parentFolderId) : null;
    return parent ? [...pathOf(parent, guard + 1), folder.name] : [folder.name];
  };
  return new Map(folders.map((folder) => [folder.id, pathOf(folder).join(" › ")]));
}

/**
 * The documents a workspace holds, grouped by subject and folder, for agents that read material from
 * anywhere in the workspace (the Summary Notes Consolidator). Only approved, uploaded documents are
 * offered. `selectedIds` keeps the order they were picked in.
 */
export function WorkspaceDocumentPicker({ workspace, selectedIds, onChange }) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();

  const groups = useMemo(() => (workspace?.subjects || []).map((subject) => {
    const paths = folderPaths(subject.folders || []);
    const documents = (subject.documents || []).filter((document) => document.sourceType !== "generated" && String(document.reviewStatus || "approved") === "approved");
    const byFolder = new Map();
    for (const document of documents) {
      const folderId = (document.folderIds || (document.folderId ? [document.folderId] : [])).find((id) => paths.has(id)) || "";
      const label = folderId ? paths.get(folderId) : "";
      if (!byFolder.has(label)) byFolder.set(label, []);
      byFolder.get(label).push(document);
    }
    return { subject, documents, folders: [...byFolder.entries()].sort(([a], [b]) => a.localeCompare(b)) };
  }).filter((group) => group.documents.length), [workspace]);

  const toggle = (id) => onChange((previous) => (previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]));
  const setMany = (ids, on) => onChange((previous) => (on ? [...previous, ...ids.filter((id) => !previous.includes(id))] : previous.filter((id) => !ids.includes(id))));
  const total = groups.reduce((sum, group) => sum + group.documents.length, 0);

  return (
    <div className="grid gap-2">
      {total > 6 ? <input className={fieldClass} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name" /> : null}
      <div className="grid max-h-80 gap-3 overflow-auto pr-1">
        {groups.map(({ subject, documents, folders }) => {
          const ids = documents.map((document) => document.id);
          const allOn = ids.every((id) => selectedIds.includes(id));
          return (
            <div key={subject.id} className="grid gap-1">
              <div className="flex items-center justify-between gap-2">
                <p className="m-0 text-xs font-bold uppercase tracking-[0.1em] text-soft-ink">{subject.name}</p>
                <button type="button" className="text-[11px] font-semibold text-[var(--accent-ink)] hover:underline" onClick={() => setMany(ids, !allOn)}>{allOn ? "Clear subject" : "Select subject"}</button>
              </div>
              {folders.map(([label, list]) => {
                const visible = list.filter((document) => !query || String(document.name || "").toLowerCase().includes(query));
                if (!visible.length) return null;
                return (
                  <div key={label || "root"} className="grid gap-1">
                    {label ? <p className="m-0 pl-1 text-[11px] font-semibold text-soft-ink">{label}</p> : null}
                    {visible.map((document) => {
                      const selected = selectedIds.includes(document.id);
                      return (
                        <label key={document.id} className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-sm transition ${selected ? "border-[var(--accent)]/40 bg-[var(--accent-soft)] text-ink" : "border-ink/10 bg-white text-ink hover:bg-[var(--surface-soft)]"}`}>
                          <input className="sr-only" type="checkbox" checked={selected} onChange={() => toggle(document.id)} />
                          <span className={`grid size-4 shrink-0 place-items-center rounded-md text-[10px] ring-1 ring-inset ${selected ? "bg-[var(--accent)] text-white ring-[var(--accent)]" : "ring-ink/30"}`}>{selected ? "✓" : ""}</span>
                          <span className="truncate">{document.name}</span>
                        </label>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
        {!groups.length ? <p className="m-0 py-3 text-center text-xs text-soft-ink">No approved documents in this workspace yet. Upload some in Workspaces.</p> : null}
      </div>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-soft-ink">{selectedIds.length} document{selectedIds.length === 1 ? "" : "s"} selected</span>
        <button type="button" className="font-semibold text-soft-ink hover:underline" onClick={() => onChange(() => [])}>Clear all</button>
      </div>
    </div>
  );
}
