"use client";

import { useEffect, useState } from "react";
import { buildSections, coverageSummary, groupByActivity, matchReferences } from "./coverageMap.js";

// What a section is made of. Text blocks are matched against the activities; formulas, pictures and tables belong to the
// section they sit in (they widen the bar and are listed in its popover) but have no text of their own to match.
const TEXT = "p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th";
const PIECES = `${TEXT}, figure, table, pre, img, .katex-display, .math-display, .luna-page-break, .md-page`;
const LONG_TEXT = 40;

/** The page's pieces in reading order, outermost first (a table is one piece, not one per cell). */
function piecesOf(article) {
  const all = [...article.querySelectorAll(PIECES)];
  const blocks = all.filter((node) => !node.matches(TEXT));
  const outer = blocks.filter((node) => !blocks.some((other) => other !== node && other.contains(node)));
  const text = all.filter((node) => node.matches(TEXT) && !node.querySelector(TEXT) && !outer.some((other) => other.contains(node)));
  return [...outer, ...text].sort((x, y) => (x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
}

const KIND = { questions: "Questions", flashcards: "Flashcards", document: "Written from it" };

/**
 * The coverage view of a document: a line in the margin beside every paragraph that an activity tests or a summary
 * was written from. The darker the line, the more often it is covered; a faint grey line is a paragraph nothing
 * touches. Tapping a line lists which activities cover it (and which questions) with a link to open each one.
 * It draws over the page, never inside it, so highlights and notes keep their positions.
 */
export function CoverageLines({ rootRef, refs, html, onOpen }) {
  const [marks, setMarks] = useState({ items: [], left: 0, summary: null });
  const [open, setOpen] = useState(-1);

  useEffect(() => {
    const wrapper = rootRef.current?.parentElement;
    const article = rootRef.current?.querySelector("article");
    if (!wrapper || !article) { setMarks({ items: [], left: 0, summary: null }); return undefined; }
    let frame = 0;
    const measure = () => {
      const box = wrapper.getBoundingClientRect();
      const texts = [...article.querySelectorAll(TEXT)].filter((node) => !node.querySelector(TEXT)).map((node) => node.textContent || "");
      const allMatches = matchReferences(texts, refs);
      const sections = buildSections(piecesOf(article), box);
      const items = sections.map((section) => {
        const sectionTexts = section.nodes.map((node) => node.textContent || "");
        const matches = matchReferences(sectionTexts, refs);
        const hits = [...new Set(matches.flat())];
        let total = 0;
        let covered = 0;
        sectionTexts.forEach((text, index) => { const length = text.trim().length; if (length < 12) return; total += length; if (matches[index].length) covered += length; });
        return { top: section.top, height: section.bottom - section.top, hits, share: total ? covered / total : 0, title: section.title, counts: section.counts, long: total >= LONG_TEXT };
      }).filter((item) => item.hits.length || item.long || item.counts.formula || item.counts.image || item.counts.table);
      setMarks({ items, left: article.getBoundingClientRect().left - box.left, summary: coverageSummary(texts, allMatches, refs) });
    };
    const schedule = () => { window.cancelAnimationFrame(frame); frame = window.requestAnimationFrame(measure); };
    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(article);
    window.addEventListener("resize", schedule);
    return () => { window.cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("resize", schedule); };
  }, [rootRef, refs, html]);

  const { items, left, summary } = marks;
  const picked = open >= 0 ? items[open] : null;
  const groups = picked ? groupByActivity(picked.hits, refs) : [];

  return (
    <div className="pointer-events-none absolute inset-0">
      {summary ? (
        <div className="absolute inset-x-0 top-0 z-10 flex justify-center">
          <p className="pointer-events-auto m-0 rounded-full border border-ink/10 bg-white px-3 py-1 text-[11px] font-semibold text-ink shadow-[0_1px_4px_rgba(0,0,0,0.08)]">
            {Math.round(summary.share * 100)}% of the text is covered by {summary.activities} {summary.activities === 1 ? "activity" : "activities"}
            <span className="ml-2 font-normal text-soft-ink">One line per section · darker = more of it is covered · grey = not covered</span>
          </p>
        </div>
      ) : null}
      {items.map((item, index) => {
        const count = item.hits.length;
        const covered = count > 0;
        return (
          <button
            key={index}
            type="button"
            disabled={!covered}
            aria-label={covered ? `${item.title || "Section"}: ${Math.round(item.share * 100)}% covered, show where` : `${item.title || "Section"}: not covered by any activity`}
            title={`${item.title || "Section"} · ${covered ? `${Math.round(item.share * 100)}% of its text covered` : "not covered by any activity"}`}
            onClick={() => setOpen(open === index ? -1 : index)}
            className={`pointer-events-auto absolute w-1.5 rounded-full border-0 p-0 ${covered ? "cursor-pointer" : "cursor-default"}`}
            style={{ left: Math.max(2, left - 14), top: item.top, height: item.height, background: covered ? "var(--accent)" : "rgba(0,0,0,0.12)", opacity: covered ? 0.3 + 0.7 * Math.min(1, item.share * (count >= 2 ? 1.15 : 1)) : 1 }}
          />
        );
      })}
      {picked && groups.length ? (
        <div className="pointer-events-auto absolute z-20 w-72 rounded-2xl border border-ink/10 bg-white p-3 shadow-[0_12px_32px_rgba(0,0,0,0.2)]" style={{ left: Math.max(8, left + 8), top: picked.top + 4 }}>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="m-0 truncate text-xs font-bold text-ink">{picked.title || "This section"}</p>
              <p className="m-0 text-[11px] text-soft-ink">{Math.round(picked.share * 100)}% of its text is covered · {picked.hits.length} {picked.hits.length === 1 ? "reference" : "references"}{[picked.counts.formula ? `${picked.counts.formula} formula${picked.counts.formula === 1 ? "" : "s"}` : "", picked.counts.image ? `${picked.counts.image} image${picked.counts.image === 1 ? "" : "s"}` : "", picked.counts.table ? `${picked.counts.table} table${picked.counts.table === 1 ? "" : "s"}` : ""].filter(Boolean).map((part, i) => (i === 0 ? ` · includes ${part}` : `, ${part}`)).join("")}</p>
            </div>
            <button type="button" className="text-[11px] font-semibold text-soft-ink hover:underline" onClick={() => setOpen(-1)}>Close</button>
          </div>
          <div className="grid max-h-64 gap-2 overflow-y-auto">
            {groups.map((group) => (
              <div key={group.activityId} className="grid gap-0.5 rounded-xl bg-[var(--surface-soft)] p-2">
                <p className="m-0 text-xs font-semibold text-ink">{group.name}</p>
                <p className="m-0 text-[11px] text-soft-ink">{KIND[group.kind] || "Activity"}: {group.labels.join(", ")}{group.plans.length ? ` · plan ${group.plans.join(", ")}` : ""}</p>
                {onOpen ? <button type="button" className="justify-self-start text-[11px] font-semibold text-[var(--accent)] hover:underline" onClick={() => onOpen(group.activityId)}>Open this activity →</button> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
