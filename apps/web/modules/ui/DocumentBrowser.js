"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The documents of the selected folder, as a grid of cards or an indented list.
 *
 * Handles the things people expect of a file browser and which the app was missing: selecting
 * several (click, shift for a range, ⌘/Ctrl for one more), dragging them onto a folder, copying and
 * pasting into another folder, and moving or deleting the selection in one go.
 */
export function DocumentBrowser({
  documents = [],
  folders = [],
  view = "list",
  selectedIds = [],
  onSelectionChange,
  onOpen,
  onMove,
  onCopy,
  onDelete,
  onDownload,
  renderCard,
  renderMeta,
  renderActions,
  marquee = false,
  emptyText = "Nothing here yet."
}) {
  const [clipboard, setClipboard] = useState([]);
  const [band, setBand] = useState(null);
  const lastIndex = useRef(-1);
  const areaRef = useRef(null);
  const selected = new Set(selectedIds);

  /**
   * Rubber-band selection: dragging across empty space selects everything the rectangle touches,
   * the way a file manager does. Additive with ⌘/Ctrl or ⇧.
   */
  function bandStart(event) {
    if (!marquee || event.button !== 0) return;
    if (event.target.closest("[data-doc-row]") || event.target.closest("button") || event.target.closest("select") || event.target.closest("input")) return;
    const rect = areaRef.current?.getBoundingClientRect();
    if (!rect) return;
    const additive = event.metaKey || event.ctrlKey || event.shiftKey;
    const origin = { x: event.clientX, y: event.clientY };
    const base = additive ? selectedIds : [];
    if (!additive) onSelectionChange?.([]);
    setBand({ ...origin, x2: origin.x, y2: origin.y });
    const onMove = (moveEvent) => {
      setBand({ x: origin.x, y: origin.y, x2: moveEvent.clientX, y2: moveEvent.clientY });
      const box = { left: Math.min(origin.x, moveEvent.clientX), right: Math.max(origin.x, moveEvent.clientX), top: Math.min(origin.y, moveEvent.clientY), bottom: Math.max(origin.y, moveEvent.clientY) };
      const hit = [...(areaRef.current?.querySelectorAll("[data-doc-row]") || [])]
        .filter((node) => { const item = node.getBoundingClientRect(); return item.left < box.right && item.right > box.left && item.top < box.bottom && item.bottom > box.top; })
        .map((node) => node.getAttribute("data-doc-row"));
      onSelectionChange?.([...new Set([...base, ...hit])]);
    };
    const onUp = () => { setBand(null); window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function click(event, document, index) {
    const ids = new Set(selectedIds);
    if (event.metaKey || event.ctrlKey) {
      if (ids.has(document.id)) ids.delete(document.id); else ids.add(document.id);
    } else if (event.shiftKey && lastIndex.current >= 0) {
      const [from, to] = [Math.min(lastIndex.current, index), Math.max(lastIndex.current, index)];
      for (let position = from; position <= to; position += 1) ids.add(documents[position].id);
    } else {
      ids.clear();
      ids.add(document.id);
    }
    lastIndex.current = index;
    onSelectionChange?.([...ids]);
  }

  // ⌘C / ⌘V move a copy into the folder you are looking at; Delete removes the selection.
  useEffect(() => {
    function onKey(event) {
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
      if (typing) return;
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key === "c" && selectedIds.length) { setClipboard(selectedIds); event.preventDefault(); }
      if (meta && event.key === "v" && clipboard.length && onCopy) { onCopy(clipboard); event.preventDefault(); }
      if (meta && event.key === "a" && documents.length) { onSelectionChange?.(documents.map((item) => item.id)); event.preventDefault(); }
      if ((event.key === "Backspace" || event.key === "Delete") && selectedIds.length && onDelete) {
        if (window.confirm(`Delete ${selectedIds.length} item${selectedIds.length === 1 ? "" : "s"}?`)) onDelete(selectedIds);
        event.preventDefault();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedIds, clipboard, documents, onCopy, onDelete, onSelectionChange]);

  function dragStart(event, document) {
    const ids = selected.has(document.id) ? selectedIds : [document.id];
    if (!selected.has(document.id)) onSelectionChange?.(ids);
    event.dataTransfer.setData("text/luna-documents", ids.join(","));
    event.dataTransfer.effectAllowed = "move";
  }

  if (!documents.length) return <p className="m-0 rounded-xl bg-[var(--surface-soft)] p-4 text-sm text-soft-ink">{emptyText}</p>;

  return (
    <div className="grid gap-2">
      {selectedIds.length ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-soft)]/50 px-3 py-2 text-xs">
          <span className="font-semibold text-[var(--accent-ink)]">{selectedIds.length} selected</span>
          {onMove ? (
            <select
              className="rounded-lg border border-ink/15 bg-white px-2 py-1 text-xs"
              value=""
              onChange={(event) => { onMove(selectedIds, event.target.value); }}
            >
              <option value="">Move to…</option>
              <option value="">Unfiled</option>
              {folders.map((folder) => <option key={folder.id} value={folder.id}>📁 {folder.name}</option>)}
            </select>
          ) : null}
          {onCopy ? <button type="button" className="rounded-full border border-ink/15 bg-white px-2.5 py-1 font-semibold" onClick={() => setClipboard(selectedIds)}>Copy</button> : null}
          {onCopy && clipboard.length ? <button type="button" className="rounded-full border border-ink/15 bg-white px-2.5 py-1 font-semibold" onClick={() => onCopy(clipboard)}>Paste {clipboard.length} here</button> : null}
          {onDownload ? <button type="button" className="rounded-full border border-ink/15 bg-white px-2.5 py-1 font-semibold" onClick={() => onDownload(selectedIds)}>⤓ Download</button> : null}
          {onDelete ? <button type="button" className="rounded-full border border-ink/15 bg-white px-2.5 py-1 font-semibold text-[var(--color-danger)]" onClick={() => { if (window.confirm(`Delete ${selectedIds.length} item${selectedIds.length === 1 ? "" : "s"}?`)) onDelete(selectedIds); }}>Delete</button> : null}
          <button type="button" className="ml-auto text-soft-ink hover:underline" onClick={() => onSelectionChange?.([])}>Clear</button>
        </div>
      ) : null}

      <div ref={areaRef} onMouseDown={bandStart} className={`relative ${view === "grid" ? "grid gap-2 sm:grid-cols-2 xl:grid-cols-3" : "grid gap-1"} ${marquee ? "min-h-24 select-none" : ""}`}>
        {band ? <div className="pointer-events-none fixed z-30 rounded border border-[var(--accent)] bg-[var(--accent)]/10" style={{ left: Math.min(band.x, band.x2), top: Math.min(band.y, band.y2), width: Math.abs(band.x2 - band.x), height: Math.abs(band.y2 - band.y) }} /> : null}
        {documents.map((document, index) => {
          const isSelected = selected.has(document.id);
          const common = {
            "data-doc-row": document.id,
            draggable: true,
            onDragStart: (event) => dragStart(event, document),
            onClick: (event) => click(event, document, index),
            onDoubleClick: () => onOpen?.(document)
          };
          if (view === "grid") {
            return (
              <article key={document.id} {...common} className={`cursor-pointer rounded-2xl border p-3 transition ${isSelected ? "border-[var(--accent)] bg-[var(--accent-soft)]/40" : "border-ink/10 bg-white hover:border-ink/20"}`}>
                {renderCard ? renderCard(document, isSelected) : (
                  <>
                    <p className="m-0 truncate text-sm font-semibold text-ink">{document.name}</p>
                    {renderMeta ? <div className="mt-1">{renderMeta(document)}</div> : <p className="m-0 mt-1 line-clamp-2 text-xs text-soft-ink">{document.preview || ""}</p>}
                    {renderActions ? <div className="mt-2">{renderActions(document)}</div> : null}
                  </>
                )}
              </article>
            );
          }
          return (
            <div key={document.id} {...common} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition ${isSelected ? "border-[var(--accent)] bg-[var(--accent-soft)]/40" : "border-transparent hover:bg-[var(--surface-soft)]"}`}>
              <span aria-hidden className="text-sm">{document.sourceType === "generated" ? "✨" : "📄"}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{document.name}</span>
                {renderMeta ? renderMeta(document) : <span className="block truncate text-[11px] text-soft-ink">{document.preview || ""}</span>}
              </span>
              {renderActions ? renderActions(document) : (onOpen ? <button type="button" className="shrink-0 rounded-full border border-ink/15 px-2.5 py-1 text-[11px] font-semibold text-ink" onClick={(event) => { event.stopPropagation(); onOpen(document); }}>Open</button> : null)}
            </div>
          );
        })}
      </div>
      <p className="m-0 text-[11px] text-soft-ink">Click to select · ⇧ click for a range · ⌘ click to add{marquee ? " · drag across empty space to select many" : ""} · drag onto a folder to move · ⌘C / ⌘V to copy into another folder</p>
    </div>
  );
}
