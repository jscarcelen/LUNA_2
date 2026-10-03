"use client";

import { useMemo } from "react";
import { OutputDownloads } from "../template-studio/output/OutputDesigner";
import { renderActivityHtml } from "../activities/engine/html";
import { outputDocumentFor } from "../resources/outputDoc";
import { MARKDOWN_CSS } from "./markdown";
import { READER_CSS } from "./documentHtml";

const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-[var(--surface-soft)] disabled:opacity-40";

function save(name, body, type) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** One reading page as a standalone HTML file. */
export function standalonePage(title, body) {
  const safe = String(title || "Document").replace(/</g, "&lt;");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safe}</title><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"><style>body{margin:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}article{max-width:760px;margin:24px auto;background:#fff;border-radius:18px;padding:28px 36px;box-shadow:0 1px 2px rgba(0,0,0,.05);box-sizing:border-box}@media (max-width:640px){article{margin:0;border-radius:0;padding:20px 16px}}mark{border-radius:3px;padding:0 1px}.luna-notes{margin-top:2em;border-top:1px solid #e5e5ea;padding-top:1em;font-size:.92em}${MARKDOWN_CSS}${READER_CSS}</style></head><body><article class="md">${body}</article></body></html>`;
}

/**
 * What the Download button of every reading / interactive view opens: the PDF matrix (page size ×
 * view, each its own file) and the HTML — the interactive file for a quiz or flashcards, the
 * reading page (optionally with my highlights and notes) for a document.
 */
export function DownloadPanel({ resource, filename, activity = null, getHtml, highlightCount = 0, onOriginal, originalLabel = "Original file", onError }) {
  const doc = useMemo(() => outputDocumentFor(resource), [resource]);
  const name = filename || resource?.name || "document";
  const activityData = activity && activity.questions ? activity : resource?.activity?.questions?.length ? resource.activity : null;
  const hasActivity = Boolean(activityData);

  function interactiveHtml() {
    const html = activityData ? renderActivityHtml(activityData) : null;
    if (html) save(`${name}.interactive.html`, html, "text/html");
    else onError?.("There is no interactive form of this.");
  }
  function readingHtml(withNotes) {
    const body = getHtml?.({ notes: withNotes });
    if (!body) { onError?.("Nothing to download yet."); return; }
    save(`${name}${withNotes ? " · notes" : ""}.html`, standalonePage(name, body), "text/html");
  }

  return (
    <div className="grid gap-3">
      {doc ? (
        <OutputDownloads doc={doc} filename={name} onError={onError} interactiveKind={hasActivity ? "activity" : "document"} onInteractiveHtml={hasActivity ? interactiveHtml : () => readingHtml(false)} />
      ) : (
        <div className="grid gap-2">
          <p className="m-0 text-xs text-soft-ink">This has no page layout to print, but you can take it as HTML.</p>
          <button type="button" className={ghostBtn} onClick={() => (hasActivity ? interactiveHtml() : readingHtml(false))}>Download the HTML</button>
        </div>
      )}
      {!hasActivity && highlightCount > 0 ? (
        <div className="border-t border-ink/8 pt-3">
          <button type="button" className={ghostBtn} onClick={() => readingHtml(true)}>Download the HTML with my highlights and notes ({highlightCount})</button>
        </div>
      ) : null}
      {onOriginal ? (
        <div className="border-t border-ink/8 pt-3">
          <button type="button" className={ghostBtn} onClick={onOriginal}>{originalLabel}</button>
        </div>
      ) : null}
    </div>
  );
}
