"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityPlayer } from "../activities/ActivityPlayer";
import { ErrorBoundary } from "../ui/ErrorBoundary";
import { activityLook, outputTitle, resourceBlocks } from "../resources/look";
import { MARKDOWN_CSS, renderMath } from "./markdown";
import { htmlToMarkdown } from "./documentView";
import { READER_CSS, blocksToReaderHtml } from "./documentHtml";
import { DownloadPanel } from "./DownloadPanel";
import { AskLuna } from "../chat/AskLuna";
import { HIGHLIGHT_COLORS, anchorFromRange, clearHighlights, highlightAt, markedHtml, overlapping, paintHighlights, supportsHighlights } from "./highlights";

const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-[var(--surface-soft)] disabled:opacity-40";

/**
 * The HTML view of anything Luna holds: a summary or guide to read, a quiz or exam to do, flashcards
 * to flip, an uploaded document. A document has two views — "Original" (just the text) and "Notes &
 * highlights", where you select text to highlight it in a colour, add a note to it, and tap a
 * highlight to read or edit its note. Highlights and notes are saved with the document. The
 * Download button (top right) opens the PDF page-size × view matrix and the HTML.
 *
 * `html` replaces the generated reading page (an uploaded document); `resource` still describes it
 * for the PDF; `onDownloadOriginal` adds "original file" to the download panel.
 *
 * "Ask Luna" (a button at the bottom right) opens the assistant beside the page, answering from the study plan's
 * material and knowing what is on screen. `chat` says what this is: { documentId, planId, sourceDocumentIds, subjectId,
 * readSelf }; every field is optional (nothing known = the subject's uploaded documents), and `chat={false}` hides it.
 */
export function ReaderView({ title = "", resource, activity = null, html: htmlOverride = "", highlights = [], onSaveHighlights, onSubmit, onClose, notice = "", onDownloadOriginal, initialView = "", onSaveContent, onEditStart, focusInfo = null, showingAll = false, onToggleFocus, chat = null, onUpdate }) {
  const rootRef = useRef(null);
  const saved = useRef(highlights);
  const [list, setList] = useState(Array.isArray(highlights) ? highlights : []);
  const [color, setColor] = useState("yellow");
  const [toolbar, setToolbar] = useState(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatProgress, setChatProgress] = useState(null);
  const [focusId, setFocusId] = useState("");
  const [problem, setProblem] = useState("");
  const [saveState, setSaveState] = useState("");
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [articleKey, setArticleKey] = useState(0);
  const listRef = useRef(list);
  const onSaveRef = useRef(onSaveHighlights);
  listRef.current = list;
  onSaveRef.current = onSaveHighlights;
  const supported = typeof window !== "undefined" ? supportsHighlights() : true;

  const playable = activity || (resource?.activity?.questions?.length ? resource.activity : null);
  const look = useMemo(() => activityLook(resource), [resource]);
  const html = useMemo(() => {
    if (playable) return "";
    if (htmlOverride) return htmlOverride;
    const blocks = resourceBlocks(resource);
    return blocks ? blocksToReaderHtml(blocks, { title: title || outputTitle(resource) }) : "";
  }, [playable, resource, title, htmlOverride]);

  // A document opens as its original unless it already has notes; a quiz or flashcard set always allows highlighting.
  const [view, setView] = useState(initialView || (playable || list.length ? "notes" : "original"));
  const noting = view === "notes" && supported && !editing;

  // The notes panel and Ask Luna share the right-hand side: opening one closes the other.
  useEffect(() => { if (notesOpen) setChatOpen(false); }, [notesOpen]);
  useEffect(() => { if (chatOpen) setNotesOpen(false); }, [chatOpen]);
  const askOn = chat !== false && !editing;
  const flashcards = Boolean(playable?.questions?.length) && playable.questions.every((question) => question.kind === "flashcard");
  const askItem = useMemo(() => ({ documentId: chat?.documentId || "", planId: chat?.planId || "", subjectId: chat?.subjectId || "", sourceDocumentIds: chat?.sourceDocumentIds || resource?.meta?.sourceDocumentIds || [], readSelf: chat?.readSelf ?? !playable }), [chat, resource, playable]);
  const askView = {
    kind: playable ? (flashcards ? "flashcards" : "quiz") : htmlOverride ? "document" : "generated",
    title: title || outputTitle(resource) || resource?.name || "",
    agentName: resource?.meta?.agentName || "",
    section: focusInfo?.focused && !showingAll ? focusInfo.label || "" : "",
    progress: playable ? { ...(chatProgress || { answered: 0, checked: false }), total: playable.questions.length } : null,
    notesView: view === "notes" && list.length > 0
  };

  // Paint now, and again whenever the content changes underneath (an answer is revealed, a card flips).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    let timer = 0;
    const paint = () => paintHighlights(root, list, noting);
    paint();
    const observer = new MutationObserver(() => { window.clearTimeout(timer); timer = window.setTimeout(paint, 80); });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => { window.clearTimeout(timer); observer.disconnect(); };
  }, [list, noting, html, playable]);
  useEffect(() => () => clearHighlights(), []);

  // Notes and highlights save by themselves a moment after the last change, and when the reader is closed.
  useEffect(() => {
    if (list === saved.current) return undefined;
    setSaveState("Saving…");
    const timer = window.setTimeout(async () => {
      saved.current = list;
      try { await onSaveHighlights?.(list); setSaveState("Saved ✓"); } catch { setSaveState("Not saved"); }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [list]);
  useEffect(() => () => {
    if (listRef.current !== saved.current) { saved.current = listRef.current; onSaveRef.current?.(listRef.current); }
  }, []);

  /* ------------------------------------------------------------ the content editor */
  const exec = (command, value = null) => { rootRef.current?.querySelector("article")?.focus(); document.execCommand(command, false, value); setDirty(true); };
  const outerMath = (element) => { let found = element.closest?.("[data-latex], .katex-display, .katex") || null; while (found?.parentElement?.closest?.("[data-latex], .katex-display, .katex")) found = found.parentElement.closest("[data-latex], .katex-display, .katex"); return found; };
  const mathHtml = (tex, display) => `<span class="math-${display ? "display" : "inline"} nicer-latex" data-latex="${tex.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")}" contenteditable="false">${renderMath(tex, display)}</span>${display ? "" : "&nbsp;"}`;
  function insertMath() {
    const tex = window.prompt("LaTeX formula (for example: \\frac{a}{b} or x^2 + 1)");
    if (!tex?.trim()) return;
    exec("insertHTML", mathHtml(tex.trim(), false));
  }
  function insertTable() {
    const answer = window.prompt("Table: type its size (for example 3x4 = 3 rows, 4 columns), or paste the rows, one per line, cells separated by commas or tabs.");
    if (!answer?.trim()) return;
    const size = /^\s*(\d+)\s*[x×]\s*(\d+)\s*$/i.exec(answer);
    const rows = size
      ? Array.from({ length: Math.min(30, Number(size[1])) }, () => Array.from({ length: Math.min(12, Number(size[2])) }, () => ""))
      : answer.split(/\n/).map((line) => line.trim()).filter(Boolean).map((line) => line.split(/\t|\s*[,;|]\s*/));
    const width = Math.max(...rows.map((row) => row.length));
    const escape = (value) => String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const cells = (row, tag) => Array.from({ length: width }, (_, index) => `<${tag}>${escape(row[index]) || "<br>"}</${tag}>`).join("");
    exec("insertHTML", `<div class="md-table"><table><thead><tr>${cells(rows[0], "th")}</tr></thead><tbody>${rows.slice(1).map((row) => `<tr>${cells(row, "td")}</tr>`).join("")}</tbody></table></div><p><br></p>`);
  }
  function editMath(event) {
    if (!editing) return;
    const target = outerMath(event.target);
    if (!target) return;
    const current = target.getAttribute("data-latex") || target.querySelector?.('annotation[encoding="application/x-tex"]')?.textContent || "";
    const tex = window.prompt("Edit the LaTeX formula", current);
    if (tex === null || !tex.trim()) return;
    const display = target.classList.contains("katex-display") || target.classList.contains("math-display");
    const holder = document.createElement("span");
    holder.innerHTML = mathHtml(tex.trim(), display);
    target.replaceWith(holder.firstChild);
    setDirty(true);
  }
  function startEditing() {
    onEditStart?.();
    setView("original");
    setNotesOpen(false);
    setToolbar(null);
    setEditing(true);
    setDirty(false);
    window.setTimeout(() => {
      // Formulas are one piece: you edit them with a double tap, not letter by letter.
      rootRef.current?.querySelectorAll(".katex-display, .katex, [data-latex]").forEach((element) => element.setAttribute("contenteditable", "false"));
      rootRef.current?.querySelector("article")?.focus();
    }, 0);
  }
  function stopEditing() {
    setEditing(false);
    setDirty(false);
    setArticleKey((key) => key + 1);
  }
  function cancelEditing() {
    if (dirty && !window.confirm("Discard your changes?")) return;
    stopEditing();
  }
  async function saveEditing() {
    const article = rootRef.current?.querySelector("article");
    if (!article || !onSaveContent) return;
    if (!window.confirm("Save these changes? They replace the document itself, so they show in the Original view and in the Notes view. Your highlights and notes are kept.")) return;
    const copy = article.cloneNode(true);
    copy.querySelectorAll("[contenteditable]").forEach((element) => element.removeAttribute("contenteditable"));
    copy.removeAttribute("contenteditable");
    setSaveState("Saving…");
    try {
      await onSaveContent({ html: copy.innerHTML, markdown: htmlToMarkdown(copy) });
      setSaveState("Document saved ✓");
      stopEditing();
    } catch (error) {
      setProblem(`Could not save the changes: ${String(error?.message || error)}`);
      setSaveState("Not saved");
    }
  }

  function onSelect() {
    if (!noting) { setToolbar(null); return; }
    const selection = window.getSelection();
    const root = rootRef.current;
    if (!selection || !root || selection.isCollapsed || !selection.rangeCount) { setToolbar(null); return; }
    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) { setToolbar(null); return; }
    if (range.commonAncestorContainer.nodeType === 1 && range.commonAncestorContainer.closest?.("input,textarea,select,button")) { setToolbar(null); return; }
    const box = range.getBoundingClientRect();
    const anchor = anchorFromRange(root, range, color);
    if (!anchor) { setToolbar(null); return; }
    setToolbar({ x: Math.max(8, Math.min(window.innerWidth - 330, box.left + box.width / 2 - 150)), y: Math.max(8, box.top - 48), anchor, touches: overlapping(list, anchor, root.textContent || "").length });
  }

  // Tapping a highlight opens its note.
  function onPageClick(event) {
    if (!noting || !rootRef.current || window.getSelection()?.toString()) return;
    const hit = highlightAt(rootRef.current, list, event.clientX, event.clientY);
    if (hit) { setNotesOpen(true); setFocusId(hit.id); }
  }

  function apply(colorId, { note = false } = {}) {
    if (!toolbar) return;
    setColor(colorId);
    const entry = { ...toolbar.anchor, color: colorId, note: "" };
    setList((current) => [...current, entry]);
    window.getSelection()?.removeAllRanges();
    setToolbar(null);
    if (note) { setNotesOpen(true); setFocusId(entry.id); }
  }
  function remove() {
    if (!toolbar) return;
    const drop = new Set(overlapping(list, toolbar.anchor, rootRef.current?.textContent || "").map((entry) => entry.id));
    setList((current) => current.filter((entry) => !drop.has(entry.id)));
    window.getSelection()?.removeAllRanges();
    setToolbar(null);
  }
  const setNote = (id, note) => setList((current) => current.map((entry) => (entry.id === id ? { ...entry, note } : entry)));
  const recolour = (id, colorId) => setList((current) => current.map((entry) => (entry.id === id ? { ...entry, color: colorId } : entry)));
  const dropOne = (id) => setList((current) => current.filter((entry) => entry.id !== id));

  /** The reading page as HTML for the download: plain, or with the highlights drawn in and the notes listed. */
  function getHtml({ notes = false } = {}) {
    const article = rootRef.current?.querySelector("article");
    if (!article) return "";
    return markedHtml(article, notes ? list : [], { notes });
  }

  const noted = list.filter((entry) => String(entry.note || "").trim()).length;

  return (
    <div className="tw-scope fixed inset-0 z-50 flex flex-col bg-[var(--bg)]">
      <style>{MARKDOWN_CSS}{READER_CSS}</style>
      <header className="relative flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-ink/10 bg-white px-4 py-2.5">
        <div className="min-w-0 flex-1 basis-40">
          <p className="m-0 truncate text-sm font-bold text-ink">{title || resource?.name || "Document"}</p>
          <p className="m-0 text-[11px] text-soft-ink">{playable ? "Interactive view — read, highlight and answer" : view === "notes" ? "Select text to highlight it or add a note" : "Original text"}</p>
        </div>
        {!playable && !editing ? (
          <div className="flex items-center gap-1 rounded-full bg-[var(--surface-soft)] p-1" role="group" aria-label="View">
            {[["original", "Original"], ["notes", `Notes${list.length ? ` (${list.length})` : ""}`]].map(([value, label]) => (
              <button key={value} type="button" onClick={() => { setView(value); setToolbar(null); if (value === "original") setNotesOpen(false); }} className={`rounded-full px-3 py-1 text-xs font-semibold ${view === value ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.1)]" : "text-soft-ink"}`}>{label}</button>
            ))}
          </div>
        ) : null}
        {noting ? <button type="button" className={ghostBtn} aria-pressed={notesOpen} onClick={() => setNotesOpen((open) => !open)}>✎ Notes{list.length ? ` (${noted}/${list.length})` : ""}</button> : view === "notes" && !editing ? <span className="text-xs text-soft-ink">Highlighting needs a newer browser.</span> : null}
        {saveState ? <span className="text-[11px] text-soft-ink" aria-live="polite">{saveState}</span> : null}
        {onSaveContent && !playable && !editing ? <button type="button" className={ghostBtn} onClick={startEditing}>✎ Edit content</button> : null}
        {onUpdate && !editing ? <button type="button" className={ghostBtn} title="Say what to change and Luna rewrites it" onClick={onUpdate}>✦<span className="ml-1">Update…</span></button> : null}
        <button type="button" className={ghostBtn} aria-label="Download" aria-expanded={downloadOpen} onClick={() => setDownloadOpen((open) => !open)}>⤓<span className="ml-1 hidden sm:inline">Download</span></button>
        <button type="button" className={ghostBtn} onClick={onClose}>Close</button>
        {downloadOpen ? (
          <>
            <button type="button" aria-label="Close download" className="fixed inset-0 z-10 cursor-default bg-black/20" onClick={() => setDownloadOpen(false)} />
            <div className="absolute right-3 top-full z-20 mt-1 max-h-[75vh] w-[min(94vw,540px)] overflow-y-auto rounded-2xl border border-ink/10 bg-white p-4 shadow-[0_16px_48px_rgba(0,0,0,0.25)]">
              <div className="mb-3 flex items-center justify-between"><p className="m-0 text-sm font-bold text-ink">Download</p><button type="button" className="text-xs font-semibold text-soft-ink hover:underline" onClick={() => setDownloadOpen(false)}>Close</button></div>
              <DownloadPanel resource={resource} filename={title || resource?.name} activity={playable} getHtml={getHtml} highlightCount={list.length} onOriginal={onDownloadOriginal} onError={setProblem} />
              {problem ? <p className="m-0 mt-2 text-xs text-[var(--color-danger)]">{problem}</p> : null}
            </div>
          </>
        ) : null}
      </header>
      {notice ? <p className="m-0 bg-[var(--accent-soft)] px-4 py-1.5 text-xs text-[var(--accent-ink)]">{notice}</p> : null}
      {focusInfo?.focused && !editing ? (
        <p className="m-0 flex flex-wrap items-center gap-2 bg-[var(--accent-soft)] px-4 py-1.5 text-xs text-[var(--accent-ink)]">
          {showingAll ? "Showing the whole document." : `Showing the part for this step: ${focusInfo.label || "the relevant sections"}.`}
          <button type="button" className="font-semibold underline" onClick={onToggleFocus}>{showingAll ? "Show only this step's part" : "Show the whole document"}</button>
          <span className="text-soft-ink">Notes are kept with the whole document.</span>
        </p>
      ) : null}
      {editing ? (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-ink/10 bg-white px-4 py-2" onMouseDown={(event) => { if (event.target.closest("button")) event.preventDefault(); }}>
          <button type="button" className={ghostBtn} onClick={() => exec("bold")}><strong>B</strong></button>
          <button type="button" className={ghostBtn} onClick={() => exec("italic")}><em>I</em></button>
          <button type="button" className={ghostBtn} onClick={() => exec("formatBlock", "h2")}>Heading</button>
          <button type="button" className={ghostBtn} onClick={() => exec("formatBlock", "p")}>Text</button>
          <button type="button" className={ghostBtn} onClick={() => exec("insertUnorderedList")}>• List</button>
          <button type="button" className={ghostBtn} onClick={insertMath}>Σ Formula</button>
          <button type="button" className={ghostBtn} onClick={insertTable}>▦ Table</button>
          <button type="button" className={ghostBtn} onClick={() => exec("undo")}>↶</button>
          <button type="button" className={ghostBtn} onClick={() => exec("redo")}>↷</button>
          <span className="flex-1" />
          <span className="hidden text-[11px] text-soft-ink md:inline">Double-tap a formula to edit it.</span>
          <button type="button" className={ghostBtn} onClick={cancelEditing}>Cancel</button>
          <button type="button" className="inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-white" onClick={saveEditing}>Save changes</button>
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto px-3 py-6 sm:px-8" onMouseUp={onSelect} onTouchEnd={() => window.setTimeout(onSelect, 50)} onKeyUp={onSelect} onClick={onPageClick}>
          <div ref={rootRef}>
            {playable
              ? <ErrorBoundary onClose={onClose} title="This activity hit a problem"><ActivityPlayer activity={{ ...playable, title: outputTitle(resource) || playable.title }} look={look} onSubmit={onSubmit} onClose={onClose} onProgress={askOn ? setChatProgress : undefined} /></ErrorBoundary>
              : html
                ? <article key={articleKey} className={`md mx-auto max-w-3xl rounded-[18px] border bg-white px-6 py-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)] outline-none sm:px-10 ${editing ? "border-[var(--accent)] ring-4 ring-[var(--accent-soft)]" : "border-ink/8"}`} contentEditable={editing} suppressContentEditableWarning onInput={() => setDirty(true)} onDoubleClick={editMath} dangerouslySetInnerHTML={{ __html: html }} />
                : <p className="mx-auto max-w-3xl text-sm text-soft-ink">There is nothing to read here.</p>}
          </div>
        </div>
        {notesOpen && noting ? (
          <aside className="fixed inset-x-0 bottom-0 z-[61] flex max-h-[55vh] flex-col border-t border-ink/10 bg-white shadow-[0_-12px_32px_rgba(0,0,0,0.15)] lg:static lg:z-auto lg:max-h-none lg:w-80 lg:shrink-0 lg:border-l lg:border-t-0 lg:shadow-none">
            <div className="flex items-center justify-between border-b border-ink/8 px-4 py-2.5">
              <p className="m-0 text-sm font-bold text-ink">My notes</p>
              <button type="button" className="text-xs font-semibold text-soft-ink hover:underline" onClick={() => setNotesOpen(false)}>Hide</button>
            </div>
            <div className="grid flex-1 content-start gap-3 overflow-y-auto p-3">
              {list.length ? list.map((entry) => (
                <div key={entry.id} className={`grid gap-1.5 rounded-xl border p-2.5 ${focusId === entry.id ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-ink/10"}`}>
                  <p className="m-0 line-clamp-3 border-l-4 pl-2 text-xs italic text-ink" style={{ borderColor: HIGHLIGHT_COLORS.find((item) => item.id === entry.color)?.css }}>“{entry.text}”</p>
                  <textarea
                    autoFocus={focusId === entry.id}
                    rows={2}
                    className="w-full rounded-lg border border-ink/12 bg-white px-2 py-1.5 text-sm text-ink"
                    placeholder="Write a note…"
                    value={entry.note || ""}
                    onFocus={() => setFocusId(entry.id)}
                    onChange={(event) => setNote(entry.id, event.target.value)}
                  />
                  <div className="flex items-center gap-1">
                    {HIGHLIGHT_COLORS.map((item) => <button key={item.id} type="button" aria-label={item.label} onClick={() => recolour(entry.id, item.id)} className={`size-4 rounded-full border-2 ${entry.color === item.id ? "border-ink" : "border-transparent"}`} style={{ background: item.css }} />)}
                    <button type="button" className="ml-auto text-[11px] font-semibold text-soft-ink hover:text-[var(--color-danger)]" onClick={() => dropOne(entry.id)}>Delete</button>
                  </div>
                </div>
              )) : <p className="m-0 text-xs text-soft-ink">Select some text, choose a colour, and add a note to it with the ✎ button. Tap a highlight to come back to its note.</p>}
            </div>
          </aside>
        ) : null}
        {askOn ? <AskLuna open={chatOpen} onOpenChange={setChatOpen} item={askItem} view={askView} layout="aside" launcherClassName={notesOpen && noting ? "lg:right-[21rem]" : ""} /> : null}
      </div>
      {toolbar ? (
        <div className="fixed z-[62] flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-2.5 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.18)]" style={{ left: toolbar.x, top: toolbar.y }} onMouseDown={(event) => event.preventDefault()}>
          {HIGHLIGHT_COLORS.map((entry) => <button key={entry.id} type="button" title={entry.label} aria-label={`Highlight ${entry.label}`} onClick={() => apply(entry.id)} className="size-6 rounded-full border border-ink/15 transition hover:scale-110" style={{ background: entry.css }} />)}
          <button type="button" className="ml-1 rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-semibold text-white" onClick={() => apply(color, { note: true })}>✎ Note</button>
          {toolbar.touches ? <button type="button" className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-soft-ink hover:bg-[var(--surface-soft)]" onClick={remove}>Remove</button> : null}
        </div>
      ) : null}
    </div>
  );
}
