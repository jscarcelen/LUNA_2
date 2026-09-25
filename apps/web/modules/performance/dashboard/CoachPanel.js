"use client";

import { useCallback, useEffect, useState } from "react";
import { card, ghostBtn, kicker } from "./parts";

const KIND_LABEL = {
  practise: "Practise",
  reteach: "Re-teach",
  review: "Review",
  "spaced-recall": "Come back to it",
  "exam-technique": "Exam technique",
  habit: "Habit"
};

const cacheKey = (signature) => `luna.performance.coach.${signature}`;

/**
 * Luna's read of the results.
 *
 * Everything else on this screen measures. This asks the model to read those measurements — mastery
 * per topic, the kinds of mistake, the questions that keep going wrong — and say what to do about
 * it, as actions the screen can act on: generate the practice, put it in a plan, open the material.
 * The read is cached against the evidence it was made from, so it is not re-bought on every render
 * and it visibly goes stale when the evidence moves.
 */
export function CoachPanel({ role = "student", learner = "", topics = [], errorTypes = [], stuck = [], plan = null, onPractise, onSchedule }) {
  const [state, setState] = useState({ status: "idle", read: null, error: "" });
  const signature = `${role}|${learner}|${topics.map((topic) => `${topic.topic}:${topic.mastery}:${topic.questions}`).join(",")}|${errorTypes.map((type) => `${type.id}:${type.count}`).join(",")}`;
  const digest = hash(signature);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = JSON.parse(window.localStorage.getItem(cacheKey(digest)) || "null");
      setState(stored ? { status: "done", read: stored, error: "" } : { status: "idle", read: null, error: "" });
    } catch { setState({ status: "idle", read: null, error: "" }); }
  }, [digest]);

  const read = useCallback(async () => {
    setState((current) => ({ ...current, status: "reading", error: "" }));
    try {
      const response = await fetch("/api/performance/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, learner, topics, errorTypes, stuck, plan })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not read the results.");
      try { window.localStorage.setItem(cacheKey(digest), JSON.stringify(payload)); } catch { /* fine without the cache */ }
      setState({ status: "done", read: payload, error: "" });
    } catch (error) {
      setState({ status: "idle", read: null, error: error.message });
    }
  }, [role, learner, topics, errorTypes, stuck, plan, digest]);

  const { read: result, status, error } = state;

  if (!topics.length && !errorTypes.length) {
    return <p className="m-0 rounded-xl bg-[var(--surface-soft)] p-4 text-sm text-soft-ink">Once there are a few results, Luna can read them and say what to do next.</p>;
  }

  return (
    <div className="grid gap-3">
      {result ? (
        <>
          <p className="m-0 text-[15px] font-semibold leading-snug text-ink">{result.headline}</p>
          <p className="m-0 text-sm leading-relaxed text-soft-ink">{result.diagnosis}</p>
          <div className="grid gap-2">
            {(result.actions || []).map((action, index) => (
              <div key={`${action.title}-${index}`} className="rounded-xl border border-ink/10 p-3">
                <p className="m-0 flex flex-wrap items-baseline justify-between gap-2 text-sm font-bold text-ink">
                  <span className="min-w-0">{index + 1}. {action.title}</span>
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-soft-ink">{KIND_LABEL[action.kind] || action.kind} · {action.effort}</span>
                </p>
                <p className="m-0 mt-1 text-[11px] text-soft-ink">{action.why}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {onPractise ? <button type="button" className={ghostBtn} onClick={() => onPractise(action)}>Do it now</button> : null}
                  {onSchedule ? <button type="button" className={ghostBtn} onClick={() => onSchedule(action)}>Put it in a plan</button> : null}
                </div>
              </div>
            ))}
          </div>
          {result.messages ? (
            <details className="rounded-xl bg-[var(--surface-soft)] p-3">
              <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-soft-ink">The same thing said to a student, a parent and a teacher</summary>
              <div className="mt-2 grid gap-2">
                {[["student", "To the learner"], ["parent", "To a parent"], ["teacher", "To a teacher"]].map(([key, label]) => (
                  <p key={key} className="m-0 text-[12px] text-ink"><span className="font-semibold text-soft-ink">{label}: </span>{result.messages[key]}</p>
                ))}
              </div>
            </details>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={ghostBtn} disabled={status === "reading"} onClick={read}>{status === "reading" ? "Reading…" : "Read again"}</button>
            <span className="text-[10px] text-soft-ink">Read {result.readAt ? new Date(result.readAt).toLocaleString() : "earlier"} from the evidence in this selection.</span>
          </div>
        </>
      ) : (
        <>
          <p className="m-0 text-sm text-soft-ink">Luna can read the mistakes behind these numbers — which topic is actually the problem, why the answers are wrong, and what to do this week — and turn it into actions you can start from here.</p>
          <button type="button" className={ghostBtn} disabled={status === "reading"} onClick={read}>{status === "reading" ? "Reading the results…" : "◎ Read my results"}</button>
          {error ? <p className="m-0 text-xs text-[var(--color-danger)]">{error}</p> : null}
        </>
      )}
    </div>
  );
}

/** A short, stable key for one state of the evidence. */
function hash(text) {
  let value = 0;
  for (let index = 0; index < text.length; index += 1) value = (value * 31 + text.charCodeAt(index)) | 0;
  return Math.abs(value).toString(36);
}

export { card, kicker };
