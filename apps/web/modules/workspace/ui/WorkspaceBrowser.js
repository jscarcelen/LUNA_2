"use client";

import { useMemo, useState } from "react";
import { FolderTree, buildFolderTree, folderBranch } from "../../ui/FolderTree";
import { DocumentBrowser } from "../../ui/DocumentBrowser";

const card = "rounded-[18px] border border-ink/8 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)]";
const kicker = "m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink";
const field = "rounded-xl border border-ink/12 bg-white px-3 py-1.5 text-sm text-ink";
const chip = "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold";

const KINDS = [
  { id: "all", label: "Everything" },
  { id: "uploaded", label: "Uploaded" },
  { id: "generated", label: "Generated" }
];

/** Documents that Luna files by itself and that should not clutter the browser. */
const SYSTEM_TAGS = ["activity-attempt", "study-plan", "study-goal", "ai-agent"];

/**
 * The workspace as a file browser: the folder tree on the left, the documents of the selected
 * folder as a grid or an indented list on the right.
 *
 * The workspace holds everything — uploaded material and everything the agents generated — while
 * the Resources library shows the generated half of the same documents in the same folders, so a
 * move made here is a move there too.
 */
export function WorkspaceBrowser({
  subject,
  isWorking = false,
  onCreateFolder,
  onRenameFolder,
  onRemoveFolder,
  onUpdateDocumentMeta,
  onRemoveDocument,
  onOpenDocument
}) {
  const [folderId, setFolderId] = useState("");
  const [view, setView] = useState("list");
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [status, setStatus] = useState("");
  const folders = subject?.folders || [];
  const tree = useMemo(() => buildFolderTree(folders), [folders]);

  const documents = useMemo(
    () => (subject?.documents || []).filter((document) => !(document.tags || []).some((tag) => SYSTEM_TAGS.includes(tag))),
    [subject]
  );

  // Selecting a folder shows what is in it and in everything under it.
  const branch = useMemo(() => {
    if (!folderId || folderId === "__unfiled") return null;
    const find = (nodes) => nodes.reduce((found, node) => found || (node.id === folderId ? node : find(node.children)), null);
    const node = find(tree);
    return node ? new Set(folderBranch(node)) : new Set([folderId]);
  }, [folderId, tree]);

  const visible = documents.filter((document) => {
    if (kind === "uploaded" && document.sourceType === "generated") return false;
    if (kind === "generated" && document.sourceType !== "generated") return false;
    if (folderId === "__unfiled" && (document.folderIds || []).length) return false;
    if (branch && !(document.folderIds || []).some((id) => branch.has(id))) return false;
    const term = query.trim().toLowerCase();
    if (term && !`${document.name} ${(document.tags || []).join(" ")}`.toLowerCase().includes(term)) return false;
    return true;
  });

  const move = (ids, targetFolderId) => {
    for (const id of ids) {
      const document = documents.find((item) => item.id === id);
      if (document) onUpdateDocumentMeta?.(id, { folderIds: targetFolderId ? [targetFolderId] : [], tags: document.tags || [] });
    }
    setStatus(`Moved ${ids.length} item${ids.length === 1 ? "" : "s"}.`);
    setSelectedIds([]);
  };

  // "Paste" files the copies into the folder you are looking at; a document can live in several.
  const copyHere = (ids) => {
    const target = folderId && folderId !== "__unfiled" ? folderId : "";
    if (!target) { setStatus("Open a folder first — that is where the copies go."); return; }
    for (const id of ids) {
      const document = documents.find((item) => item.id === id);
      if (!document) continue;
      const next = [...new Set([...(document.folderIds || []), target])];
      onUpdateDocumentMeta?.(id, { folderIds: next, tags: document.tags || [] });
    }
    setStatus(`${ids.length} item${ids.length === 1 ? "" : "s"} also filed here.`);
  };

  const remove = (ids) => {
    for (const id of ids) onRemoveDocument?.(id);
    setSelectedIds([]);
    setStatus(`Deleted ${ids.length} item${ids.length === 1 ? "" : "s"}.`);
  };

  if (!subject) return null;

  return (
    <section className="tw-scope grid items-start gap-3 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className={`${card} grid gap-3 p-4`}>
        <div>
          <p className={kicker}>Folders</p>
          <p className="m-0 mt-0.5 text-[11px] text-soft-ink">{documents.length} document{documents.length === 1 ? "" : "s"} in {subject.name}</p>
        </div>
        <FolderTree
          folders={folders}
          documents={documents}
          selectedId={folderId}
          countLabel="document"
          onSelect={setFolderId}
          onCreateFolder={onCreateFolder ? (name, parentId) => onCreateFolder(name, parentId) : undefined}
          onRenameFolder={onRenameFolder}
          onRemoveFolder={onRemoveFolder}
          onDropDocuments={move}
        />
      </aside>

      <div className={`${card} grid gap-3 p-4`}>
        <div className="flex flex-wrap items-center gap-2">
          <input className={`${field} min-w-44 flex-1`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search in this folder…" />
          <div className="flex gap-1 rounded-xl bg-[var(--surface-soft)] p-1">
            {KINDS.map((entry) => (
              <button key={entry.id} type="button" onClick={() => setKind(entry.id)} className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${kind === entry.id ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink"}`}>{entry.label}</button>
            ))}
          </div>
          <div className="flex gap-1 rounded-xl bg-[var(--surface-soft)] p-1">
            {[["list", "List"], ["grid", "Grid"]].map(([value, label]) => (
              <button key={value} type="button" onClick={() => setView(value)} className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${view === value ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink"}`}>{label}</button>
            ))}
          </div>
        </div>
        {status ? <p className="m-0 text-xs text-[var(--accent-ink)]">{status}{isWorking ? " …" : ""}</p> : null}
        <DocumentBrowser
          documents={visible}
          folders={folders}
          view={view}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onOpen={onOpenDocument}
          onMove={move}
          onCopy={copyHere}
          onDelete={onRemoveDocument ? remove : undefined}
          emptyText={query ? "Nothing matches your search." : "This folder is empty — drag documents here, or upload some."}
          renderMeta={(document) => (
            <span className="flex flex-wrap items-center gap-1 text-[11px] text-soft-ink">
              <span className={`${chip} ${document.sourceType === "generated" ? "bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "bg-[var(--surface-soft)] text-soft-ink"}`}>{document.sourceType === "generated" ? "generated" : "uploaded"}</span>
              {document.sizeLabel ? <span>{document.sizeLabel}</span> : null}
              {(document.tags || []).filter((tag) => tag !== "resource").slice(0, 3).map((tag) => <span key={tag} className={`${chip} border border-ink/10 text-soft-ink`}>{tag}</span>)}
            </span>
          )}
        />
      </div>
    </section>
  );
}
