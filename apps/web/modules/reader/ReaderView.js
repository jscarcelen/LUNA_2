"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityPlayer } from "../activities/ActivityPlayer";
import { activityLook, outputTitle, resourceBlocks } from "../resources/look";
import { MARKDOWN_CSS } from "./markdown";
import { READER_CSS, blocksToReaderHtml } from "./documentHtml";
import { HIGHLIGHT_COLORS, anchorFromRange, clearHighlights, overlapping, paintHighlights, supportsHighlights } from "./highlights";

const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-[var(--surface-soft)] disabled:opacity-40";

/**
 * The HTML view of anything Luna generates: a summary or guide to read in person, a quiz or exam to
 * do, flashcards to flip. Select any text to highlight it in a colour; show or hide the highlights
 * with one switch; they are saved with the resource (when it is saved) and come back next time.
 */
export function ReaderView({ title = "", resource, activity = null, highlights = [], onSaveHighlights, onSubmit, onClose, notice = "" }) {
  const rootRef = useRef(null);
  const saved = useRef(highlights);
  const [list, setList] = useState(Array.isArray(highlights) ? highlights : []);
  const [color, setColor] = useState("yellow");
  const [visible, setVisible] = useState(true);
  const [toolbar, setToolbar] = useState(null);
  const supported = typeof window !== "undefined" ? supportsHighlights() : true;

  const playable = activity || (resource?.activity?.questions?.length ? resource.activity : null);
  const look = useMemo(() => activityLook(resource), [resource]);
  const html = useMemo(() => {
    if (playable) return "";
    const blocks = resourceBlocks(resource);
    return blocks ? blocksToReaderHtml(blocks, { title: title || outputTitle(resource) }) : "";
  }, [playable, resource, title]);

  // Paint now, and again whenever the content changes underneath (an answer is revealed, a card flips).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    let timer = 0;
    const paint = () => paintHighlights(root, list, visible);
    paint();
    const observer = new MutationObserver(() => { window.clearTimeout(timer); timer = window.setTimeout(paint, 80); });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => { window.clearTimeout(timer); observer.disconnect(); };
  }, [list, visible, html, playable]);
  useEffect(() => () => clearHighlights(), []);

  // Save a moment after the last change.
  useEffect(() => {
    if (list === saved.current) return undefined;
    const timer = window.setTimeout(() => { saved.current = list; onSaveHighlights?.(list); }, 600);
    return () => window.clearTimeout(timer);
  }, [list]);

  function onSelect() {
    const selection = window.getSelection();
    const root = rootRef.current;
    if (!selection || !root || selection.isCollapsed || !selection.rangeCount) { setToolbar(null); return; }
    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) { setToolbar(null); return; }
    if (range.commonAncestorContainer.nodeType === 1 && range.commonAncestorContainer.closest?.("input,textarea,select,button")) { setToolbar(null); return; }
    const box = range.getBoundingClientRect();
    const anchor = anchorFromRange(root, range, color);
    if (!anchor) { setToolbar(null); return; }
    setToolbar({ x: Math.max(8, Math.min(window.innerWidth - 270, box.left + box.width / 2 - 130)), y: Math.max(8, box.top - 48), anchor, touches: overlapping(list, anchor, root.textContent || "").length });
  }

  function apply(colorId) {
    if (!toolbar) return;
    setColor(colorId);
    setList((current) => [...current, { ...toolbar.anchor, color: colorId }]);
    window.getSelection()?.removeAllRanges();
    setToolbar(null);
    setVisible(true);
  }
  function remove() {
    if (!toolbar) return;
    const drop = new Set(overlapping(list, toolbar.anchor, rootRef.current?.textContent || "").map((entry) => entry.id));
    setList((current) => current.filter((entry) => !drop.has(entry.id)));
    window.getSelection()?.removeAllRanges();
    setToolbar(null);
  }

  return (
    <div className="tw-scope fixed inset-0 z-50 flex flex-col bg-[var(--bg)]">
      <style>{MARKDOWN_CSS}{READER_CSS}</style>
      <header className="flex flex-wrap items-center gap-3 border-b border-ink/10 bg-white px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-sm font-bold text-ink">{title || resource?.name || "Document"}</p>
          <p className="m-0 text-[11px] text-soft-ink">{playable ? "Interactive view — read, highlight and answer" : "Reading view — select text to highlight it"}</p>
        </div>
        {supported ? (
          <>
            <div className="flex items-center gap-1" role="group" aria-label="Highlight colour">
              {HIGHLIGHT_COLORS.map((entry) => (
                <button key={entry.id} type="button" title={entry.label} aria-label={`${entry.label} highlighter`} onClick={() => setColor(entry.id)} className={`size-5 rounded-full border-2 transition ${color === entry.id ? "border-ink" : "border-transparent hover:border-ink/30"}`} style={{ background: entry.css }} />
              ))}
            </div>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-ink">
              <input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} />
              Show highlights{list.length ? ` (${list.length})` : ""}
            </label>
            {list.length ? <button type="button" className={ghostBtn} onClick={() => { if (window.confirm("Remove all highlights?")) setList([]); }}>Clear</button> : null}
          </>
        ) : <span className="text-xs text-soft-ink">Highlighting needs a newer browser.</span>}
        <button type="button" className={ghostBtn} onClick={onClose}>Close</button>
      </header>
      {notice ? <p className="m-0 bg-[var(--accent-soft)] px-4 py-1.5 text-xs text-[var(--accent-ink)]">{notice}</p> : null}
      <div className="flex-1 overflow-y-auto px-3 py-6 sm:px-8" onMouseUp={onSelect} onTouchEnd={() => window.setTimeout(onSelect, 50)} onKeyUp={onSelect}>
        <div ref={rootRef}>
          {playable
            ? <ActivityPlayer activity={{ ...playable, title: outputTitle(resource) || playable.title }} look={look} onSubmit={onSubmit} onClose={onClose} />
            : html
              ? <article className="md mx-auto max-w-3xl rounded-[18px] border border-ink/8 bg-white px-6 py-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)] sm:px-10" dangerouslySetInnerHTML={{ __html: html }} />
              : <p className="mx-auto max-w-3xl text-sm text-soft-ink">There is nothing to read in this resource.</p>}
        </div>
      </div>
      {toolbar ? (
        <div className="fixed z-[60] flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-2.5 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.18)]" style={{ left: toolbar.x, top: toolbar.y }} onMouseDown={(event) => event.preventDefault()}>
          {HIGHLIGHT_COLORS.map((entry) => <button key={entry.id} type="button" title={entry.label} aria-label={`Highlight ${entry.label}`} onClick={() => apply(entry.id)} className="size-6 rounded-full border border-ink/15 transition hover:scale-110" style={{ background: entry.css }} />)}
          {toolbar.touches ? <button type="button" className="ml-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-soft-ink hover:bg-[var(--surface-soft)]" onClick={remove}>Remove</button> : null}
        </div>
      ) : null}
    </div>
  );
}
