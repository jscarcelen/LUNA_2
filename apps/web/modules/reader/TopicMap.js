"use client";

import { useEffect, useMemo, useState } from "react";
import { formatPages, pageCountOf, topicRows } from "./topicLayout";
import { useT } from "../../lib/i18n/LocaleProvider.js";

/**
 * "Topics in these notes": the document's topic tree against its pages. Each topic is a row with a bar showing
 * which pages carry it; tapping a topic (or one of its concepts) scrolls the notes to it. It stays out of the
 * way: closed by default, and absent when the document has no extracted topics yet.
 */
export function TopicMap({ documentId, workspaceId, html = "", onJump }) {
  const t = useT();
  const [concepts, setConcepts] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!documentId || !workspaceId) { setConcepts([]); return undefined; }
    let cancelled = false;
    fetch(`/api/concepts?workspaceId=${encodeURIComponent(workspaceId)}&documentIds=${encodeURIComponent(documentId)}`)
      .then((response) => response.json())
      .then((data) => { if (!cancelled) setConcepts(Array.isArray(data?.concepts) ? data.concepts : []); })
      .catch(() => { if (!cancelled) setConcepts([]); });
    return () => { cancelled = true; };
  }, [documentId, workspaceId]);

  const rows = useMemo(() => topicRows(concepts), [concepts]);
  const pageCount = useMemo(() => pageCountOf(html, concepts), [html, concepts]);
  if (!rows.length) return null;

  return (
    <div className="tw-scope border-b border-ink/8 bg-white px-4 py-2">
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-2 text-left text-xs font-semibold text-ink">
        <span aria-hidden>{open ? "▾" : "▸"}</span>
        {t("courses.tm.title")}
        <span className="font-normal text-soft-ink">· {t.plural("courses.tm.topics", rows.length)}, {t.plural("courses.tm.concepts", concepts.length)}{pageCount ? ` · ${t.plural("courses.tm.pages", pageCount)}` : ""}</span>
      </button>
      {open ? (
        <div className="mt-2 grid max-h-72 gap-1.5 overflow-y-auto pr-1">
          {rows.map((row) => (
            <div key={row.topic} className="rounded-xl border border-ink/10 px-2.5 py-1.5">
              <button type="button" className="grid w-full grid-cols-[minmax(0,11rem)_minmax(0,1fr)] items-center gap-3 text-left" onClick={() => onJump?.({ page: row.firstPage, section: row.topic })} title={row.pages.length ? `${row.topic} · ${formatPages(row.pages)}` : row.topic}>
                <span className="truncate text-sm font-semibold text-ink">{row.topic}</span>
                {pageCount && row.segments.length ? (
                  <span className="relative block h-2 rounded-full bg-[var(--surface-soft)]" aria-label={formatPages(row.pages)}>
                    {row.segments.map((segment) => (
                      <span key={segment.from} className="absolute top-0 h-full rounded-full bg-[var(--accent)]" style={{ left: `${((segment.from - 1) / pageCount) * 100}%`, width: `${Math.max(1.5, ((segment.to - segment.from + 1) / pageCount) * 100)}%` }} />
                    ))}
                  </span>
                ) : <span className="text-[11px] text-soft-ink">{t.plural("courses.tm.concepts", row.concepts.length)}</span>}
              </button>
              <div className="mt-1 flex flex-wrap gap-1">
                {row.concepts.map((concept) => (
                  <button key={concept.id} type="button" className="max-w-full truncate rounded-full border border-ink/12 px-2 py-0.5 text-[11px] text-ink transition hover:bg-[var(--surface-soft)]" title={concept.pages.length ? formatPages(concept.pages) : t("courses.tm.find")} onClick={() => onJump?.({ page: concept.pages[0] ?? null, section: concept.name })}>
                    {concept.name}{concept.pages.length ? <span className="ml-1 text-soft-ink">{formatPages(concept.pages.slice(0, 3))}{concept.pages.length > 3 ? "…" : ""}</span> : null}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
