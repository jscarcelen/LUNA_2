"use client";

import { useEffect, useState } from "react";
import { coverageSummary, groupByActivity, matchReferences } from "./coverageMap.js";

// The smallest blocks of text on the page: a paragraph, a list item, a heading, a table cell.
const BLOCKS = "p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote";
const LONG_TEXT = 40;

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
      const nodes = [...article.querySelectorAll(BLOCKS)].filter((node) => !node.querySelector(BLOCKS));
      const texts = nodes.map((node) => node.textContent || "");
      const matches = matchReferences(texts, refs);
      const items = nodes.map((node, index) => {
        const rect = node.getBoundingClientRect();
        return { top: rect.top - box.top, height: rect.height, hits: matches[index], long: texts[index].trim().length >= LONG_TEXT };
      }).filter((item) => item.height > 0 && (item.hits.length || item.long));
      setMarks({ items, left: article.getBoundingClientRect().left - box.left, summary: coverageSummary(texts, matches, refs) });
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
        <div className="sticky top-2 z-10 flex h-0 justify-center">
          <p className="pointer-events-auto m-0 -translate-y-0 rounded-full border border-ink/10 bg-white px-3 py-1 text-[11px] font-semibold text-ink shadow-[0_2px_8px_rgba(0,0,0,0.12)]">
            {Math.round(summary.share * 100)}% of the text is covered by {summary.activities} {summary.activities === 1 ? "activity" : "activities"}
            <span className="ml-2 font-normal text-soft-ink">Darker line = covered more often · grey = not covered</span>
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
            aria-label={covered ? `Covered ${count} ${count === 1 ? "time" : "times"}: show where` : "Not covered by any activity"}
            title={covered ? `Covered ${count} ${count === 1 ? "time" : "times"}` : "Not covered by any activity"}
            onClick={() => setOpen(open === index ? -1 : index)}
            className={`pointer-events-auto absolute w-1.5 rounded-full border-0 p-0 ${covered ? "cursor-pointer" : "cursor-default"}`}
            style={{ left: Math.max(2, left - 14), top: item.top, height: item.height, background: covered ? "var(--accent)" : "rgba(0,0,0,0.12)", opacity: covered ? (count >= 3 ? 1 : count === 2 ? 0.7 : 0.45) : 1 }}
          />
        );
      })}
      {picked && groups.length ? (
        <div className="pointer-events-auto absolute z-20 w-72 rounded-2xl border border-ink/10 bg-white p-3 shadow-[0_12px_32px_rgba(0,0,0,0.2)]" style={{ left: Math.max(8, left + 8), top: picked.top + 4 }}>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="m-0 text-xs font-bold text-ink">Tested or covered {picked.hits.length} {picked.hits.length === 1 ? "time" : "times"}</p>
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
