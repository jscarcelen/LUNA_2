"use client";

import { useEffect, useState } from "react";

/**
 * What is happening while a study plan is built, step by step. Building takes a minute or more,
 * which is long enough to wonder whether anything is happening, so every step says what it is doing
 * and why; finished steps are ticked and the long one (writing the quizzes and summaries) counts
 * its items.
 *
 * `steps`: [{ id, title, detail }] in order · `currentId`: the one running · `sub`: { done, total, label } for a step that counts.
 */
export function PlanProgress({ steps = [], currentId = "", sub = null, headline = "Building your plan" }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const currentIndex = Math.max(0, steps.findIndex((step) => step.id === currentId));
  const ratio = steps.length ? (currentIndex + (sub?.total ? Math.min(1, sub.done / sub.total) : 0.4)) / steps.length : 0;
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <div className="grid gap-4" role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <span className="relative grid size-10 shrink-0 place-items-center">
          <span className="absolute inset-0 animate-spin rounded-full border-[3px] border-[var(--accent-soft)] border-t-[var(--accent)]" />
          <span className="text-sm font-bold text-[var(--accent-ink)]">{Math.min(99, Math.round(ratio * 100))}%</span>
        </span>
        <div className="min-w-0">
          <p className="m-0 text-base font-bold text-ink">{headline}</p>
          <p className="m-0 text-xs text-soft-ink">This takes a minute or two — you can keep this window open. {clock}</p>
        </div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-soft)]"><div className="h-full rounded-full bg-[var(--accent)] transition-all duration-700" style={{ width: `${Math.round(ratio * 100)}%` }} /></div>
      <ol className="m-0 grid list-none gap-1 p-0">
        {steps.map((step, index) => {
          const state = index < currentIndex ? "done" : index === currentIndex ? "active" : "waiting";
          return (
            <li key={step.id} className={`flex items-start gap-3 rounded-xl px-3 py-2 transition ${state === "active" ? "bg-[var(--accent-soft)]" : ""}`}>
              <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${state === "done" ? "bg-[#2f9e5b] text-white" : state === "active" ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-soft)] text-soft-ink"}`}>
                {state === "done" ? "✓" : state === "active" ? <span className="size-2 animate-pulse rounded-full bg-white" /> : index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-semibold ${state === "waiting" ? "text-soft-ink" : "text-ink"}`}>{step.title}</span>
                {state !== "waiting" ? <span className="block text-xs text-soft-ink">{step.detail}</span> : null}
                {state === "active" && sub?.total ? (
                  <span className="mt-1.5 block">
                    <span className="block h-1 overflow-hidden rounded-full bg-white"><span className="block h-full rounded-full bg-[var(--accent)] transition-all duration-500" style={{ width: `${Math.round((sub.done / sub.total) * 100)}%` }} /></span>
                    <span className="mt-1 block truncate text-[11px] font-medium text-ink">{sub.done} of {sub.total} done{sub.label ? ` · now: ${sub.label}` : ""}</span>
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
