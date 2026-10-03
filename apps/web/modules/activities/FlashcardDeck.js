"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { gradeActivity } from "./engine/activity";

const card = "rounded-[18px] border border-ink/8 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)]";
const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-[var(--surface-soft)] disabled:opacity-40";
const primaryBtn = "inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#0077ed] disabled:opacity-50";

/** How well the learner knew the card. Sure counts as known; the other two come back for review. */
const LEVELS = [
  { key: "high", label: "Knew it", hint: "Sure", answer: "known" },
  { key: "medium", label: "Almost", hint: "Fairly sure", answer: "unknown" },
  { key: "low", label: "Not yet", hint: "Guessing", answer: "unknown" }
];

const lookStyle = (look) => (look?.accent ? { "--accent": look.accent.main, "--accent-soft": look.accent.tint, "--accent-ink": `color-mix(in srgb, ${look.accent.main} 65%, #000)` } : undefined);

/**
 * The flashcard component, played: the word, a tap to flip it, and then how well you knew it. The
 * card looks like the printed one (its colour, the tab on top, FRONT / BACK, the line across the
 * middle) and every rating is recorded as the confidence of that attempt.
 */
export function FlashcardDeck({ activity, look = null, onSubmit, onClose }) {
  const cards = activity.questions;
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [answers, setAnswers] = useState({});
  const [confidence, setConfidence] = useState({});
  const [attempt, setAttempt] = useState(null);
  const [startedAt] = useState(() => Date.now());
  const timing = useRef({ durations: {}, since: Date.now() });

  const current = cards[index];
  const done = index >= cards.length;
  const rated = Object.keys(confidence).length;

  function rate(level) {
    if (!current || !flipped) return;
    const now = Date.now();
    timing.current.durations[current.id] = (timing.current.durations[current.id] || 0) + (now - timing.current.since);
    timing.current.since = now;
    setAnswers((previous) => ({ ...previous, [current.id]: level.answer }));
    setConfidence((previous) => ({ ...previous, [current.id]: level.key }));
    window.setTimeout(() => { setFlipped(false); setIndex((value) => value + 1); }, 220);
  }

  useEffect(() => {
    function onKey(event) {
      if (done || event.target?.tagName === "INPUT") return;
      if (event.key === " " || event.key === "Enter") { event.preventDefault(); setFlipped((value) => !value); }
      if (flipped && ["1", "2", "3"].includes(event.key)) rate(LEVELS[Number(event.key) - 1]);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function finish() {
    const graded = gradeActivity(activity, answers, startedAt, timing.current.durations, confidence);
    setAttempt(graded);
    if (typeof onSubmit === "function") onSubmit(graded);
  }

  const missed = useMemo(() => cards.filter((entry) => answers[entry.id] === "unknown"), [cards, answers]);

  return (
    <section className="tw-scope mx-auto grid max-w-2xl gap-3" style={lookStyle(look)}>
      <header className={`${card} p-4`} style={look?.accent ? { borderTop: "6px solid var(--accent)" } : undefined}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="m-0 truncate text-xl font-bold tracking-tight text-ink">{activity.title}</h3>
            <p className="m-0 text-xs text-soft-ink">{done ? "Deck finished" : `Card ${index + 1} of ${cards.length} · tap the card to flip it`}</p>
          </div>
          {onClose ? <button type="button" className={ghostBtn} onClick={onClose}>{attempt ? "Done" : "Leave"}</button> : null}
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-soft)]"><div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${cards.length ? (Math.min(index, cards.length) / cards.length) * 100 : 0}%` }} /></div>
      </header>

      {!done ? (
        <>
          <button type="button" onClick={() => setFlipped((value) => !value)} aria-label={flipped ? "Show the front" : "Flip the card"} className="relative block w-full text-left" style={{ perspective: 1200 }}>
            <div className="relative w-full transition-transform duration-500" style={{ transformStyle: "preserve-3d", transform: flipped ? "rotateY(180deg)" : "none", aspectRatio: "3 / 2" }}>
              {[{ side: "FRONT", text: current.prompt, back: false }, { side: "BACK", text: current.back || (typeof current.answer === "string" ? current.answer : ""), back: true }].map((face) => (
                <div key={face.side} className="absolute inset-0 grid grid-rows-[auto_1fr] overflow-hidden rounded-[22px] border border-[var(--accent-soft)] bg-white shadow-[0_12px_32px_rgba(0,0,0,0.10)]" style={{ backfaceVisibility: "hidden", transform: face.back ? "rotateY(180deg)" : "none" }}>
                  <div className="mx-10 h-1.5 rounded-b-full bg-[var(--accent)]" />
                  <div className="grid grid-rows-[auto_1fr] px-8 pb-8 pt-4">
                    <span className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: face.back ? "#8e8e93" : "var(--accent-ink)" }}>{face.side}</span>
                    <p className={`m-0 grid place-items-center text-center font-bold text-ink ${String(face.text).length > 60 ? "text-xl" : "text-3xl sm:text-4xl"}`}>{face.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </button>

          <div className={`${card} p-4`}>
            {flipped ? (
              <>
                <p className="m-0 text-sm font-semibold text-ink">How well did you know it?</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {LEVELS.map((level, position) => (
                    <button key={level.key} type="button" onClick={() => rate(level)} className="rounded-xl border border-ink/12 px-3 py-2.5 text-left transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]">
                      <span className="block text-sm font-bold text-ink">{level.label}</span>
                      <span className="block text-[11px] text-soft-ink">{level.hint} · key {position + 1}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <p className="m-0 text-sm text-soft-ink">Think of the answer, then flip the card (Space).</p>
                <div className="flex gap-2">
                  {index > 0 ? <button type="button" className={ghostBtn} onClick={() => setIndex((value) => Math.max(0, value - 1))}>← Back</button> : null}
                  <button type="button" className={primaryBtn} onClick={() => setFlipped(true)}>Flip</button>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className={`${card} p-5`}>
          {attempt ? (
            <>
              <p className="m-0 text-3xl font-bold text-ink">{attempt.score} / {attempt.total}</p>
              <p className="m-0 text-sm text-soft-ink">you knew these cards{missed.length ? ` — ${missed.length} to see again` : " — perfect!"}</p>
            </>
          ) : (
            <>
              <p className="m-0 text-lg font-bold text-ink">That was the whole deck</p>
              <p className="m-0 mt-1 text-sm text-soft-ink">{rated} card{rated === 1 ? "" : "s"} rated. Save the result so your progress is tracked.</p>
              <button type="button" className={`${primaryBtn} mt-3`} onClick={finish}>Save my result</button>
            </>
          )}
          {missed.length ? (
            <div className="mt-4 grid gap-1.5">
              <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink">To see again</p>
              {missed.map((entry) => <p key={entry.id} className="m-0 rounded-lg bg-[var(--surface-soft)] px-3 py-1.5 text-sm text-ink"><strong>{entry.prompt}</strong> — {entry.back || entry.answer}</p>)}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
