"use client";

import { useMemo, useState } from "react";

/**
 * The folder tree shared by the workspace and by the resources library.
 *
 * Both places file the same documents, so they must show the same structure: the workspace holds
 * everything (uploaded and generated), the library only what the agents produced — the tree, the
 * counts and the drop targets are identical, which is what makes a move in one visible in the other.
 */

/** Folders as a tree, in name order, with each folder's descendants. */
export function buildFolderTree(folders = []) {
  const byParent = new Map();
  for (const folder of folders) {
    const key = folder.parentFolderId || "";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(folder);
  }
  const build = (parentId, depth) => (byParent.get(parentId) || [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((folder) => ({ ...folder, depth, children: build(folder.id, depth + 1) }));
  return build("", 0);
}

/** Every folder id under (and including) this one. */
export function folderBranch(node) {
  return [node.id, ...node.children.flatMap(folderBranch)];
}

export function FolderTree({
  folders = [],
  documents = [],
  selectedId = "",
  onSelect,
  onCreateFolder,
  onRenameFolder,
  onRemoveFolder,
  onDropDocuments,
  countLabel = "item"
}) {
  const tree = useMemo(() => buildFolderTree(folders), [folders]);
  const [open, setOpen] = useState({});
  const [renaming, setRenaming] = useState("");
  const [draftName, setDraftName] = useState("");
  const [adding, setAdding] = useState("");
  const [newName, setNewName] = useState("");
  const [dropTarget, setDropTarget] = useState("");

  const counts = useMemo(() => {
    const map = new Map();
    for (const document of documents) for (const id of document.folderIds || []) map.set(id, (map.get(id) || 0) + 1);
    return map;
  }, [documents]);
  const deepCount = (node) => folderBranch(node).reduce((total, id) => total + (counts.get(id) || 0), 0);
  const unfiled = documents.filter((document) => !(document.folderIds || []).length).length;

  const row = (node) => {
    const expanded = open[node.id] !== false;
    const isSelected = selectedId === node.id;
    return (
      <div key={node.id}>
        <div
          className={`group flex min-w-0 items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition ${isSelected ? "bg-[var(--accent-soft)] text-[var(--accent-ink)]" : dropTarget === node.id ? "bg-[var(--surface-soft)] ring-2 ring-[var(--accent)]/40" : "hover:bg-[var(--surface-soft)]"}`}
          style={{ paddingLeft: 8 + node.depth * 14 }}
          onDragOver={(event) => { if (onDropDocuments) { event.preventDefault(); setDropTarget(node.id); } }}
          onDragLeave={() => setDropTarget((current) => (current === node.id ? "" : current))}
          onDrop={(event) => {
            if (!onDropDocuments) return;
            event.preventDefault();
            setDropTarget("");
            const ids = String(event.dataTransfer.getData("text/luna-documents") || "").split(",").filter(Boolean);
            if (ids.length) onDropDocuments(ids, node.id);
          }}
        >
          <button
            type="button"
            className={`w-6 shrink-0 text-[10px] text-soft-ink ${node.children.length ? "" : "invisible"}`}
            onClick={() => setOpen((current) => ({ ...current, [node.id]: !expanded }))}
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? "▾" : "▸"}
          </button>
          {renaming === node.id ? (
            <input
              autoFocus
              className="flex-1 rounded-md border border-ink/15 px-2 py-0.5 text-sm"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && draftName.trim()) { onRenameFolder?.(node.id, draftName.trim()); setRenaming(""); }
                if (event.key === "Escape") setRenaming("");
              }}
              onBlur={() => setRenaming("")}
            />
          ) : (
            <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => onSelect?.(node.id)}>
              <span aria-hidden>📁</span>
              <span className="truncate font-medium">{node.name}</span>
              <span className="ml-auto shrink-0 text-[11px] text-soft-ink">{deepCount(node) || ""}</span>
            </button>
          )}
          <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100 max-[760px]:opacity-100">
            {onCreateFolder ? <button type="button" title="New subfolder" className="w-7 text-xs text-soft-ink hover:text-ink" onClick={() => { setAdding(node.id); setNewName(""); setOpen((current) => ({ ...current, [node.id]: true })); }}>＋</button> : null}
            {onRenameFolder ? <button type="button" title="Rename" className="w-7 text-xs text-soft-ink hover:text-ink" onClick={() => { setRenaming(node.id); setDraftName(node.name); }}>✎</button> : null}
            {onRemoveFolder ? <button type="button" title="Delete folder" className="w-7 text-xs text-soft-ink hover:text-[var(--color-danger)]" onClick={() => { if (window.confirm(`Delete the folder “${node.name}”? Its documents stay, unfiled.`)) onRemoveFolder(node.id); }}>🗑</button> : null}
          </span>
        </div>
        {adding === node.id ? (
          <div className="flex items-center gap-1 py-1" style={{ paddingLeft: 26 + node.depth * 14 }}>
            <input
              autoFocus
              className="flex-1 rounded-md border border-ink/15 px-2 py-0.5 text-sm"
              value={newName}
              placeholder="Folder name"
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && newName.trim()) { onCreateFolder?.(newName.trim(), node.id); setAdding(""); setNewName(""); }
                if (event.key === "Escape") setAdding("");
              }}
              onBlur={() => setAdding("")}
            />
          </div>
        ) : null}
        {expanded ? node.children.map(row) : null}
      </div>
    );
  };

  return (
    <div className="grid min-w-0 gap-1">
      <button
        type="button"
        className={`flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition ${selectedId === "" ? "bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "hover:bg-[var(--surface-soft)]"}`}
        onClick={() => onSelect?.("")}
      >
        <span aria-hidden>🗂</span><span className="min-w-0 truncate font-medium">All {countLabel}s</span><span className="ml-auto text-[11px] text-soft-ink">{documents.length || ""}</span>
      </button>
      {tree.map(row)}
      <button
        type="button"
        className={`flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition ${selectedId === "__unfiled" ? "bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "hover:bg-[var(--surface-soft)]"}`}
        onClick={() => onSelect?.("__unfiled")}
        onDragOver={(event) => { if (onDropDocuments) event.preventDefault(); }}
        onDrop={(event) => {
          if (!onDropDocuments) return;
          event.preventDefault();
          const ids = String(event.dataTransfer.getData("text/luna-documents") || "").split(",").filter(Boolean);
          if (ids.length) onDropDocuments(ids, "");
        }}
      >
        <span aria-hidden>▫</span><span className="font-medium">Unfiled</span><span className="ml-auto text-[11px] text-soft-ink">{unfiled || ""}</span>
      </button>
      {onCreateFolder ? (
        adding === "__root" ? (
          <input
            autoFocus
            className="rounded-md border border-ink/15 px-2 py-1 text-sm"
            value={newName}
            placeholder="Folder name"
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && newName.trim()) { onCreateFolder(newName.trim(), ""); setAdding(""); setNewName(""); }
              if (event.key === "Escape") setAdding("");
            }}
            onBlur={() => setAdding("")}
          />
        ) : (
          <button type="button" className="justify-self-start px-2 py-1 text-xs font-semibold text-[var(--accent-ink)] hover:underline" onClick={() => { setAdding("__root"); setNewName(""); }}>＋ New folder</button>
        )
      ) : null}
    </div>
  );
}
