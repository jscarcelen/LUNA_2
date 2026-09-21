"use client";

import { useMemo, useState } from "react";
import { gradeActivity } from "./engine/activity";

const card = "rounded-[18px] border border-ink/8 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)]";
const primaryBtn = "inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#0077ed] disabled:opacity-50";
const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-[var(--surface-soft)]";
const input = "w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-[var(--accent)]";

function shuffle(list, seed) {
  const out = [...list];
  let s = seed || 7;
  for (let i = out.length - 1; i > 0; i -= 1) { s = (s * 9301 + 49297) % 233280; const j = Math.floor((s / 233280) * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

/**
 * The child answers here. One card per question; "Check my answers" grades locally and hands the
 * attempt to `onSubmit` (stored by the caller for tracking). Works for choice, true/false, text,
 * numbers, matching and flashcards.
 */
export function ActivityPlayer({ activity, onSubmit, onClose }) {
  const [answers, setAnswers] = useState({});
  const [attempt, setAttempt] = useState(null);
  const [flipped, setFlipped] = useState({});
  const [pickedTile, setPickedTile] = useState(null);
  const [startedAt] = useState(() => Date.now());
  const set = (id, value) => setAnswers((prev) => ({ ...prev, [id]: value }));
  const answered = activity.questions.filter((q) => { const v = answers[q.id]; return q.kind === "match" ? v && Object.keys(v).length === (q.pairs || []).length : q.kind === "tiles" ? Array.isArray(v) && !v.includes(null) : v !== undefined && v !== ""; }).length;
  const resultById = useMemo(() => Object.fromEntries((attempt?.results || []).map((r) => [r.id, r])), [attempt]);

  function check() {
    const graded = gradeActivity(activity, answers, startedAt);
    setAttempt(graded);
    if (typeof onSubmit === "function") onSubmit(graded);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <section className="tw-scope mx-auto grid max-w-3xl gap-3">
      <header className={`${card} p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="m-0 text-2xl font-bold tracking-tight text-ink">{activity.title}</h3>{activity.subtitle ? <p className="m-0 mt-1 text-sm text-soft-ink">{activity.subtitle}</p> : null}</div>
          {onClose ? <button type="button" className={ghostBtn} onClick={onClose}>{attempt ? "Done" : "Leave"}</button> : null}
        </div>
        {attempt ? (
          <div className="mt-4 rounded-2xl bg-[var(--accent-soft)] p-4">
            <p className="m-0 text-3xl font-bold text-ink">{attempt.score} / {attempt.total}</p>
            <p className="m-0 text-sm text-soft-ink">{attempt.total ? Math.round((attempt.score / attempt.total) * 100) : 0}% correct{attempt.results.some((r) => r.correct === false) ? " — the mistakes are marked below, with the right answer." : " — perfect!"}</p>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-soft)]"><div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${activity.questions.length ? (answered / activity.questions.length) * 100 : 0}%` }} /></div>
            <span className="text-xs font-semibold text-soft-ink">{answered} / {activity.questions.length}</span>
          </div>
        )}
      </header>

      {activity.questions.map((q, index) => {
        const result = resultById[q.id];
        const tone = !result ? "" : result.correct ? "border-[rgba(52,199,89,0.5)] bg-[rgba(52,199,89,0.06)]" : result.correct === false ? "border-[rgba(255,59,48,0.45)] bg-[rgba(255,59,48,0.05)]" : "";
        const locked = Boolean(attempt);
        return (
          <article key={q.id} className={`${card} border-2 p-5 ${tone}`}>
            <div className="flex items-start gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-sm font-bold text-white">{index + 1}</span>
              <div className="min-w-0 flex-1">
                {q.group ? <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-soft-ink">{q.group}</p> : null}
                <p className="m-0 text-base font-semibold text-ink">{q.kind === "match" ? "Match each pair" : q.kind === "tiles" ? "Rebuild the grid — matching edges together" : q.prompt}</p>

                {q.kind === "choice" ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {(q.options || []).map((option) => {
                      const on = answers[q.id] === option;
                      const isAnswer = result && option === result.expected;
                      return <button key={option} type="button" disabled={locked} onClick={() => set(q.id, option)} className={`rounded-xl border px-3 py-2 text-left text-sm transition ${on ? "border-[var(--accent)] bg-[var(--accent-soft)] font-semibold text-ink" : "border-ink/10 text-ink hover:bg-[var(--surface-soft)]"} ${isAnswer ? "ring-2 ring-[rgba(52,199,89,0.6)]" : ""}`}>{option}</button>;
                    })}
                  </div>
                ) : null}

                {q.kind === "boolean" ? (
                  <div className="mt-3 flex gap-2">
                    {[["true", "True"], ["false", "False"]].map(([value, label]) => <button key={value} type="button" disabled={locked} onClick={() => set(q.id, value)} className={`rounded-full border px-5 py-2 text-sm font-semibold ${answers[q.id] === value ? "border-[var(--accent)] bg-[var(--accent-soft)] text-ink" : "border-ink/10 text-ink"} ${result && value === result.expected ? "ring-2 ring-[rgba(52,199,89,0.6)]" : ""}`}>{label}</button>)}
                  </div>
                ) : null}

                {q.kind === "text" || q.kind === "number" ? (
                  <input className={`${input} mt-3 max-w-sm`} inputMode={q.kind === "number" ? "decimal" : "text"} disabled={locked} value={answers[q.id] || ""} onChange={(event) => set(q.id, event.target.value)} placeholder={q.kind === "number" ? "Your result" : "Your answer"} />
                ) : null}

                {q.kind === "match" ? (
                  <div className="mt-3 grid gap-2">
                    {(q.pairs || []).map((pair) => {
                      const rights = shuffle((q.pairs || []).map((p) => p.right), q.pairs.length * 13);
                      const chosen = (answers[q.id] || {})[pair.left] || "";
                      const good = result ? (q.answer[pair.left] || "").toLowerCase() === chosen.toLowerCase() : null;
                      return (
                        <div key={pair.left} className={`grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border px-3 py-2 ${good === true ? "border-[rgba(52,199,89,0.5)]" : good === false ? "border-[rgba(255,59,48,0.45)]" : "border-ink/10"}`}>
                          <span className="text-sm font-semibold text-ink">{pair.left}</span>
                          <span className="text-soft-ink">→</span>
                          <select className={input} disabled={locked} value={chosen} onChange={(event) => set(q.id, { ...(answers[q.id] || {}), [pair.left]: event.target.value })}>
                            <option value="">Choose…</option>
                            {rights.map((right) => <option key={right} value={right}>{right}</option>)}
                          </select>
                          {good === false ? <span className="col-span-3 text-xs text-[var(--color-danger)]">Correct: {q.answer[pair.left]}</span> : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {q.kind === "tiles" ? (() => {
                  const tiles = q.tiles || [];
                  const cols = q.columns || 4;
                  const order = answers[q.id] || shuffle(tiles.map((_, i) => i), tiles.length * 7);
                  const placement = Array.isArray(answers[q.id]) ? answers[q.id] : null; // slot → tile index
                  const slots = placement || Array(tiles.length).fill(null);
                  const tray = tiles.map((_, i) => i).filter((i) => !slots.includes(i));
                  const put = (slot) => {
                    if (pickedTile === null || locked) return;
                    const next = [...slots];
                    const from = next.indexOf(pickedTile);
                    if (from >= 0) next[from] = next[slot];
                    next[slot] = pickedTile;
                    set(q.id, next);
                    setPickedTile(null);
                  };
                  const Tile = ({ t, i, small }) => (
                    <div className={`relative grid place-items-center rounded-lg border text-[10px] font-semibold text-[#1f2a6b] ${pickedTile === i ? "border-[var(--accent)] ring-2 ring-[var(--accent-soft)]" : "border-[#e39ab1]"}`} style={{ background: "#ffe4ec", width: small ? 64 : 84, height: small ? 64 : 84 }}>
                      <span className="absolute top-0.5 left-1 right-1 truncate text-center">{t.top}</span>
                      <span className="absolute bottom-0.5 left-1 right-1 truncate text-center">{t.bottom}</span>
                      <span className="absolute left-0 top-1/2 origin-center -translate-y-1/2 -rotate-90 whitespace-nowrap" style={{ transform: "translate(-30%,-50%) rotate(-90deg)" }}>{t.left}</span>
                      <span className="absolute right-0 top-1/2 whitespace-nowrap" style={{ transform: "translate(30%,-50%) rotate(90deg)" }}>{t.right}</span>
                    </div>
                  );
                  void order;
                  return (
                    <div className="mt-3 grid gap-3 sm:grid-cols-[auto_1fr]">
                      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, 84px)` }}>
                        {slots.map((tileIndex, slot) => {
                          const good = result ? tileIndex === slot : null;
                          return (
                            <button key={slot} type="button" disabled={locked} onClick={() => (tileIndex !== null && pickedTile === null ? setPickedTile(tileIndex) : put(slot))} className={`grid place-items-center rounded-lg border-2 border-dashed ${good === true ? "border-[rgba(52,199,89,0.7)]" : good === false ? "border-[rgba(255,59,48,0.6)]" : "border-ink/15"}`} style={{ width: 88, height: 88 }}>
                              {tileIndex !== null ? <Tile t={tiles[tileIndex]} i={tileIndex} /> : <span className="text-[10px] text-soft-ink">{slot + 1}</span>}
                            </button>
                          );
                        })}
                      </div>
                      <div>
                        <p className="m-0 text-xs text-soft-ink">Tap a tile, then tap a slot. Touching edges must match (word ↔ translation).</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {tray.map((i) => <button key={i} type="button" disabled={locked} onClick={() => setPickedTile(pickedTile === i ? null : i)}><Tile t={tiles[i]} i={i} small /></button>)}
                          {!tray.length ? <span className="text-xs text-soft-ink">All tiles placed — tap two placed tiles to swap them.</span> : null}
                        </div>
                      </div>
                    </div>
                  );
                })() : null}

                {q.kind === "flashcard" ? (
                  <div className="mt-3 grid gap-2">
                    <button type="button" className="rounded-2xl border border-ink/10 bg-[var(--surface-soft)] p-5 text-center text-lg font-semibold text-ink" onClick={() => setFlipped((prev) => ({ ...prev, [q.id]: !prev[q.id] }))}>{flipped[q.id] ? q.back : "Tap to reveal the answer"}</button>
                    {flipped[q.id] ? <div className="flex gap-2">{[["known", "✓ I knew it"], ["unknown", "✗ Not yet"]].map(([value, label]) => <button key={value} type="button" disabled={locked} onClick={() => set(q.id, value)} className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${answers[q.id] === value ? "border-[var(--accent)] bg-[var(--accent-soft)] text-ink" : "border-ink/10 text-ink"}`}>{label}</button>)}</div> : null}
                  </div>
                ) : null}

                {result && result.correct === false && q.kind !== "match" ? <p className="m-0 mt-2 text-sm text-[var(--color-danger)]">Correct answer: <strong>{result.expected}</strong>{q.explanation ? <span className="text-soft-ink"> — {q.explanation}</span> : null}</p> : null}
                {result && result.correct && q.explanation ? <p className="m-0 mt-2 text-xs text-soft-ink">{q.explanation}</p> : null}
              </div>
            </div>
          </article>
        );
      })}

      {!attempt ? <div className="flex justify-end"><button type="button" className={primaryBtn} disabled={!activity.questions.length} onClick={check}>Check my answers</button></div> : null}
      {!activity.questions.length ? <p className={`${card} p-5 text-sm text-soft-ink`}>This document has nothing to answer — it is a reading document. Export it instead.</p> : null}
    </section>
  );
}
