"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { gradeActivity } from "./engine/activity";
import { applyGrades, needsModel } from "./grading.js";
import { chargeRun } from "../credits/credits";
import { AiGuidanceNote } from "../performance/dashboard/parts";
import { FlashcardDeck } from "./FlashcardDeck";
import { renderInline } from "../reader/markdown";
import { cleanWork, fileToWorkImage } from "./workImage.js";
import { skillLabel } from "../skills/taxonomy.js";
import { SourceNote } from "./SourceNote";

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
/**
 * How sure the learner is, asked before they check. It costs one tap and it changes what a wrong
 * answer means: sure and wrong is a misconception to correct, unsure and wrong is a gap to teach,
 * and unsure and right is something to revisit before it is forgotten.
 */
const CONFIDENCE = [["high", "Sure"], ["medium", "Fairly sure"], ["low", "Guessing"]];

/** The document's colour and format, applied to the player through the same variables the rest of the app uses. */
function lookStyle(look) {
  if (!look?.accent) return undefined;
  return { "--accent": look.accent.main, "--accent-soft": look.accent.tint, "--accent-ink": `color-mix(in srgb, ${look.accent.main} 65%, #000)` };
}

/** How a written answer was marked: the verdict, what it earned, and the sentence that says why. */
const VERDICT_CHIP = {
  correct: ["Correct", "bg-[rgba(52,199,89,0.14)] text-[#1d7a44]"],
  close: ["Almost", "bg-[rgba(255,159,10,0.16)] text-[#8a4a00]"],
  incorrect: ["Not quite", "bg-[rgba(255,59,48,0.12)] text-[#b30031]"]
};

function MarkNote({ result }) {
  if (!result.graded || !result.verdict) return null;
  const [label, tone] = VERDICT_CHIP[result.verdict] || VERDICT_CHIP.incorrect;
  const credit = result.verdict === "close" ? ` · ${Math.round((Number(result.score) || 0) * 100)}% credit` : "";
  return (
    <div className="mt-2" role="note">
      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tone}`}>{label}{credit}</span>
      {result.feedback ? <p className="m-0 mt-1.5 text-sm text-ink">{result.feedback}</p> : null}
      {result.failedSkill ? <p className="m-0 mt-1 text-xs text-soft-ink">The skill that tripped this one: <strong className="text-ink">{skillLabel(result.failedSkill)}</strong>.</p> : null}
      {result.makesSense === false && result.given ? <p className="m-0 mt-1 text-xs text-soft-ink">This does not read as an answer to the question.</p> : null}
    </div>
  );
}

/** Sends the written answers that need judging to the grader in ONE call; resolves to { [questionId]: grade }. */
async function gradeWritten(activity, questions, answers, signal, work = {}) {
  const items = questions.map((question) => ({
    id: question.id,
    question: question.prompt,
    expectedAnswer: String(question.answer ?? ""),
    givenAnswer: String(answers[question.id] ?? ""),
    context: [activity.title, question.group, question.source?.extract].filter(Boolean).join(" · ").slice(0, 600),
    skill: question.skill || "",
    topic: question.topic || "",
    // What the grader needs to read the learner's working and to name the skill that failed.
    qkind: question.kind,
    options: question.options || [],
    skills: question.skills || [],
    steps: Array.isArray(question.steps) ? question.steps.join(" ").slice(0, 700) : "",
    work: cleanWork(work[question.id]) || undefined
  }));
  const response = await fetch("/api/activities/grade", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }), signal });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "The checker could not be reached.");
  const grades = {};
  for (const row of data.results || []) grades[row.id] = row;
  // Pay for it like any other model call; it is a few hundred tokens.
  if (data.usage?.total_tokens) chargeRun({ agentName: "Answer check", usage: data.usage, model: data.model || "" });
  return { grades, note: data.note || "" };
}

/**
 * "Show your working": notes and a photo of what the learner wrote on paper, per question. A choice or
 * true/false answer hides how the learner got there; this lets the grader see it and name the real
 * reason for a mistake. "This is my full answer" asks the grader to mark the working too.
 */
function WorkBox({ value, locked, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const work = value || { text: "", image: "", full: false };
  const filled = Boolean(work.text || work.image);
  const patch = (next) => onChange({ ...work, ...next });
  async function pick(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true); setError("");
    try { patch({ image: await fileToWorkImage(file) }); } catch (problem) { setError(String(problem.message || problem)); } finally { setBusy(false); }
  }
  return (
    <details className="mt-3 rounded-xl border border-ink/10 px-3 py-2" open={filled && !locked ? true : undefined}>
      <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-soft-ink">Show your working (optional){filled ? " · added" : ""}</summary>
      <div className="mt-2 grid gap-2">
        <textarea className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-[var(--accent)]" rows={3} disabled={locked} value={work.text} onChange={(event) => patch({ text: event.target.value })} placeholder="Notes, steps, or why you chose this answer" />
        <div className="flex flex-wrap items-center gap-2">
          {!locked ? <label className="inline-flex cursor-pointer items-center rounded-full border border-ink/15 px-3 py-1 text-xs font-semibold text-ink hover:bg-[var(--surface-soft)]">{busy ? "Reading the photo…" : work.image ? "Replace the photo" : "Add a photo of your working"}<input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={pick} /></label> : null}
          {work.image ? (
            <span className="inline-flex items-center gap-2">
              <img src={work.image} alt="Your working" className="h-14 w-14 rounded-lg border border-ink/10 object-cover" />
              {!locked ? <button type="button" className="text-xs font-semibold text-soft-ink hover:underline" onClick={() => patch({ image: "" })}>Remove</button> : null}
            </span>
          ) : null}
        </div>
        {error ? <p className="m-0 text-xs text-[var(--color-danger)]">{error}</p> : null}
        <label className="flex items-start gap-2 text-xs text-soft-ink">
          <input type="checkbox" className="mt-0.5" disabled={locked || !filled} checked={work.full === true} onChange={(event) => patch({ full: event.target.checked })} />
          <span><strong className="text-ink">This is my full answer.</strong> Mark my working too, and use it to find the reason for a mistake. Without the tick, the working only helps explain a wrong answer.</span>
        </label>
      </div>
    </details>
  );
}

/** "Ask my teacher to review this mark": the AI mark is guidance, a person decides. Only offered when the quiz is a saved document. */
function ReviewRequest({ documentId, question, result, existing, onSent }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [state, setState] = useState({ busy: false, error: "" });
  if (existing && existing.status !== "requested") {
    return <p className="m-0 mt-2 text-xs font-semibold text-ink">Your teacher {existing.status === "overridden" ? "changed this mark" : "confirmed this mark"}: now {existing.final_correct ? "right" : "wrong"}{existing.teacher_note ? ` — ${existing.teacher_note}` : ""}</p>;
  }
  if (existing) return <p className="m-0 mt-2 text-xs text-soft-ink">Review requested — your teacher will look at it.</p>;
  async function send() {
    setState({ busy: true, error: "" });
    try {
      const response = await fetch("/api/attempts/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activityDocumentId: documentId, questionId: question.id, questionPrompt: question.prompt, given: result.given, expected: result.expected, aiCorrect: result.correct, note }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setState({ busy: false, error: response.status === 401 ? "Log in with your student account to ask for a review." : body.setupNeeded ? "Reviews are not switched on yet." : body.error || "Could not send." }); return; }
      setState({ busy: false, error: "" });
      onSent?.(body.review);
    } catch {
      setState({ busy: false, error: "Could not send. Try again." });
    }
  }
  return open ? (
    <div className="mt-2 grid gap-1.5">
      <input className={input} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Why do you think the mark is wrong? (optional)" />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={ghostBtn} disabled={state.busy} onClick={send}>{state.busy ? "Sending…" : "Send to my teacher"}</button>
        <button type="button" className="text-xs font-semibold text-soft-ink underline" onClick={() => setOpen(false)}>Cancel</button>
        {state.error ? <span className="text-xs text-[var(--color-danger)]" role="alert">{state.error}</span> : null}
      </div>
    </div>
  ) : <button type="button" className="mt-2 text-xs font-semibold text-[var(--accent-ink)] underline" onClick={() => setOpen(true)}>Ask my teacher to review this mark</button>;
}

function QuestionList({ activity, onSubmit, onClose, onProgress, look = null, documentId = "" }) {
  const [reviews, setReviews] = useState({});
  useEffect(() => {
    if (!documentId) return;
    fetch(`/api/attempts/review?activityDocumentId=${encodeURIComponent(documentId)}`).then((r) => (r.ok ? r.json() : null)).then((body) => {
      if (body?.reviews) setReviews(Object.fromEntries(body.reviews.map((row) => [row.question_id, row])));
    }).catch(() => {});
  }, [documentId]);
  const [answers, setAnswers] = useState({});
  const [lastId, setLastId] = useState("");
  const [confidence, setConfidence] = useState({});
  const [work, setWork] = useState({});
  const [attempt, setAttempt] = useState(null);
  // Written answers are read by Luna before the result is shown: true while that call is out.
  const [checking, setChecking] = useState(false);
  const [gradingNote, setGradingNote] = useState("");
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [flipped, setFlipped] = useState({});
  const [pickedTile, setPickedTile] = useState(null);
  const [startedAt] = useState(() => Date.now());
  // Time per question: the clock runs on whichever question the child is interacting with.
  const timing = useRef({ durations: {}, current: "", since: Date.now() });
  const touch = (id) => {
    const state = timing.current;
    const now = Date.now();
    if (state.current) state.durations[state.current] = (state.durations[state.current] || 0) + (now - state.since);
    state.current = id;
    state.since = now;
  };
  const closeTiming = () => {
    const state = timing.current;
    if (state.current) { state.durations[state.current] = (state.durations[state.current] || 0) + (Date.now() - state.since); state.current = ""; }
    return state.durations;
  };
  const set = (id, value) => { touch(id); setLastId(id); setAnswers((prev) => ({ ...prev, [id]: value })); };
  const answered = activity.questions.filter((q) => { const v = answers[q.id]; return q.kind === "match" ? v && Object.keys(v).length === (q.pairs || []).length : q.kind === "tiles" ? Array.isArray(v) && !v.includes(null) : v !== undefined && v !== ""; }).length;
  // Lets whoever hosts the player (the "Ask Luna" chat) know where the learner is, without seeing any answer.
  useEffect(() => {
    if (typeof onProgress !== "function") return;
    const index = activity.questions.findIndex((q) => q.id === lastId);
    const question = activity.questions[index];
    onProgress({ answered, total: activity.questions.length, checked: Boolean(attempt), score: attempt?.score ?? 0, current: question ? { number: index + 1, prompt: question.kind === "match" ? "Match each pair" : question.kind === "tiles" ? "Rebuild the grid" : String(question.prompt || "") } : null });
  }, [answered, attempt, lastId]);
  const resultById = useMemo(() => Object.fromEntries((attempt?.results || []).map((r) => [r.id, r])), [attempt]);

  /**
   * Checking marks everything at once and keeps the window open: the learner stays on this page and
   * reads the result. Choice, true/false, matching and numbers are marked on the spot; the written
   * answers that need judging go to the grader in ONE call. If that fails the local marking stands
   * (and says so) — the player is never blocked on the model. The attempt is handed to `onSubmit`
   * once, with the final marks, and the player never closes itself.
   */
  async function check() {
    if (checking || attempt) return;
    let graded = gradeActivity(activity, answers, startedAt, closeTiming(), confidence, work);
    // The grader reads written answers, and any wrong answer that comes with working: that is where the reason for the mistake is.
    const wrongWithWork = new Set(graded.results.filter((row) => row.correct === false && cleanWork(work[row.id])).map((row) => row.id));
    const written = activity.questions.filter((question) => wrongWithWork.has(question.id) || needsModel({ kind: question.kind, given: answers[question.id], expected: question.answer }));
    if (written.length) {
      setChecking(true);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 45000);
      try {
        const { grades, note } = await gradeWritten(activity, written, answers, controller.signal, work);
        graded = applyGrades(graded, grades);
        if (note && mounted.current) setGradingNote(note);
        else if (!Object.keys(grades).length && mounted.current) setGradingNote("Luna could not check the written answers, so they were marked by comparing words.");
      } catch {
        if (mounted.current) setGradingNote("Luna could not check the written answers, so they were marked by comparing words.");
      } finally {
        clearTimeout(timer);
        if (mounted.current) setChecking(false);
      }
    }
    if (mounted.current) setAttempt(graded);
    if (typeof onSubmit === "function") onSubmit(graded);
    if (mounted.current) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <section className="tw-scope mx-auto grid max-w-3xl gap-3" style={lookStyle(look)}>
      <header className={`${card} p-5`} style={look?.accent ? { borderTop: "6px solid var(--accent)" } : undefined}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="m-0 text-2xl font-bold tracking-tight text-ink">{activity.title}</h3>{activity.subtitle ? <p className="m-0 mt-1 text-sm text-soft-ink">{activity.subtitle}</p> : null}
            {activity.intro ? (
              <details className="mt-3 rounded-xl bg-[var(--surface-soft)] p-3" open>
                <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-soft-ink">Quick refresher</summary>
                <div className="mt-2 grid gap-1.5">{String(activity.intro).split(/\n+/).map((line) => line.trim()).filter(Boolean).map((line, lineIndex) => <p key={lineIndex} className="m-0 text-sm text-ink" dangerouslySetInnerHTML={{ __html: renderInline(line) }} />)}</div>
              </details>
            ) : null}
          </div>
          {onClose ? <button type="button" className={ghostBtn} onClick={onClose}>{attempt ? "Done" : "Leave"}</button> : null}
        </div>
        {attempt ? (
          <div className="mt-4 rounded-2xl bg-[var(--accent-soft)] p-4">
            <p className="m-0 text-3xl font-bold text-ink">{Number.isInteger(attempt.score) ? attempt.score : attempt.score.toFixed(1)} / {attempt.total}</p>
            <p className="m-0 text-sm text-soft-ink">{attempt.durationMs ? `${Math.max(1, Math.round(attempt.durationMs / 60000))} min · ` : ""}{attempt.total ? Math.round((attempt.score / attempt.total) * 100) : 0}% correct{attempt.results.some((r) => r.correct === false) ? " — the mistakes are marked below, with the right answer." : " — perfect!"}{attempt.results.some((r) => r.verdict === "close") ? " Answers that were almost right earn part of a point." : ""}</p>
            {gradingNote ? <p className="m-0 mt-1 text-xs text-soft-ink">{gradingNote}</p> : null}
            <AiGuidanceNote className="mt-1" />
            {(() => {
              // Where certainty and correctness disagree is the most useful thing on this screen.
              const sureWrong = attempt.results.filter((row) => row.confidence === "high" && row.correct === false).length;
              const unsureRight = attempt.results.filter((row) => row.confidence === "low" && row.correct === true).length;
              if (!sureWrong && !unsureRight) return null;
              return (
                <p className="m-0 mt-2 text-xs text-ink">
                  {sureWrong ? `${sureWrong} you were sure about ${sureWrong === 1 ? "was" : "were"} wrong — those are misunderstandings, not slips. ` : ""}
                  {unsureRight ? `${unsureRight} you guessed ${unsureRight === 1 ? "was" : "were"} right — worth going over once more.` : ""}
                </p>
              );
            })()}
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
        const tone = !result ? "" : result.correct ? "border-[rgba(52,199,89,0.5)] bg-[rgba(52,199,89,0.06)]" : result.verdict === "close" ? "border-[rgba(255,159,10,0.55)] bg-[rgba(255,159,10,0.06)]" : result.correct === false ? "border-[rgba(255,59,48,0.45)] bg-[rgba(255,59,48,0.05)]" : "";
        const locked = Boolean(attempt) || checking;
        return (
          <article key={q.id} className={`${card} border-2 p-5 ${tone}`}>
            <div className="flex items-start gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-sm font-bold text-white">{index + 1}</span>
              <div className="min-w-0 flex-1">
                {q.group ? <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-soft-ink">{q.group}</p> : null}
                <p className="m-0 text-base font-semibold text-ink">{q.kind === "match" ? "Match each pair" : q.kind === "tiles" ? "Rebuild the grid — matching edges together" : q.prompt}</p>

                {q.kind === "choice" ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {(q.options || []).map((option, optionIndex) => {
                      const on = answers[q.id] === option;
                      const isAnswer = result && option === result.expected;
                      return <button key={option} type="button" disabled={locked} onClick={() => set(q.id, option)} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition ${on ? "border-[var(--accent)] bg-[var(--accent-soft)] font-semibold text-ink" : "border-ink/10 text-ink hover:bg-[var(--surface-soft)]"} ${isAnswer ? "ring-2 ring-[rgba(52,199,89,0.6)]" : ""}`}>{look?.letters ? <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${on ? "bg-[var(--accent)] text-white" : "bg-[var(--accent-soft)] text-[var(--accent-ink)]"}`}>{String.fromCharCode(65 + optionIndex)}</span> : null}<span>{option}</span></button>;
                    })}
                  </div>
                ) : null}

                {q.kind === "boolean" ? (
                  <div className="mt-3 flex gap-2">
                    {[["true", "True"], ["false", "False"]].map(([value, label]) => <button key={value} type="button" disabled={locked} onClick={() => set(q.id, value)} className={`rounded-full border px-5 py-2 text-sm font-semibold ${answers[q.id] === value ? "border-[var(--accent)] bg-[var(--accent-soft)] text-ink" : "border-ink/10 text-ink"} ${result && value === result.expected ? "ring-2 ring-[rgba(52,199,89,0.6)]" : ""}`}>{label}</button>)}
                  </div>
                ) : null}

                {q.kind === "text" && look?.ruled ? (
                  <textarea
                    className={`${input} mt-3`}
                    rows={3}
                    disabled={locked}
                    value={answers[q.id] || ""}
                    onChange={(event) => set(q.id, event.target.value)}
                    placeholder="Write your answer"
                    style={{ lineHeight: "28px", backgroundImage: "repeating-linear-gradient(transparent, transparent 27px, var(--accent-soft) 27px, var(--accent-soft) 28px)", backgroundPositionY: "8px" }}
                  />
                ) : null}

                {(q.kind === "text" && !look?.ruled) || q.kind === "number" ? (
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

                {["choice", "boolean", "number", "text"].includes(q.kind) && (!attempt || work[q.id]) ? (
                  <WorkBox value={work[q.id]} locked={locked} onChange={(next) => setWork((previous) => ({ ...previous, [q.id]: next }))} />
                ) : null}

                {!attempt && answers[q.id] !== undefined && answers[q.id] !== "" ? (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-soft-ink">How sure are you?</span>
                    {CONFIDENCE.map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setConfidence((prev) => ({ ...prev, [q.id]: prev[q.id] === value ? "" : value }))}
                        className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${confidence[q.id] === value ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "border-ink/12 text-soft-ink hover:bg-[var(--surface-soft)]"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                ) : null}
                {result && result.confidence ? (
                  <p className="m-0 mt-2 text-[11px] text-soft-ink">
                    You said you were <strong className="text-ink">{CONFIDENCE.find(([value]) => value === result.confidence)?.[1].toLowerCase() || result.confidence}</strong>
                    {result.correct === false && result.confidence === "high" ? " — worth a second look: this one is a misunderstanding rather than a slip." : ""}
                    {result.correct === true && result.confidence === "low" ? " — but you got it right. Come back to it once more and it will stick." : ""}
                  </p>
                ) : null}
                {result ? <MarkNote result={result} /> : null}
                {result && Array.isArray(q.steps) && q.steps.length ? (
                  <div className="mt-2 grid gap-1.5 rounded-xl bg-[var(--surface-soft)] p-3">
                    <p className="m-0 text-[11px] font-semibold uppercase tracking-wider text-soft-ink">Step by step</p>
                    {q.steps.map((step, stepIndex) => <p key={stepIndex} className="m-0 text-sm text-ink" dangerouslySetInnerHTML={{ __html: renderInline(step) }} />)}
                  </div>
                ) : null}
                {result && result.correct === false && q.kind !== "match" ? <p className={`m-0 mt-2 text-sm ${result.verdict === "close" ? "text-[#8a4a00]" : "text-[var(--color-danger)]"}`}>{result.verdict === "close" ? "Expected answer" : "Correct answer"}: <strong>{result.expected}</strong>{q.explanation ? <span className="text-soft-ink"> — {q.explanation}</span> : null}</p> : null}
                {result && (q.source?.extract || q.source?.grounding) ? <SourceNote source={q.source} /> : null}
                {result ? <p className="m-0 mt-1 flex flex-wrap gap-1 text-[10px] text-soft-ink">{q.skill ? <span className="rounded-full bg-[var(--surface-soft)] px-2 py-0.5 font-semibold">{q.skill}</span> : null}{q.difficulty ? <span className="rounded-full bg-[var(--surface-soft)] px-2 py-0.5 font-semibold">{q.difficulty}</span> : null}{result.ms ? <span className="rounded-full bg-[var(--surface-soft)] px-2 py-0.5 font-semibold">{Math.round(result.ms / 1000)}s</span> : null}</p> : null}
                {result && result.correct && q.explanation ? <p className="m-0 mt-2 whitespace-pre-line text-xs text-soft-ink">{q.explanation}</p> : null}
                {result && documentId && q.kind !== "match" && q.kind !== "tiles" ? <ReviewRequest documentId={documentId} question={q} result={result} existing={reviews[q.id]} onSent={(review) => setReviews((current) => ({ ...current, [q.id]: review }))} /> : null}
              </div>
            </div>
          </article>
        );
      })}

      {!attempt ? (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {checking ? <p className="m-0 flex items-center gap-2 text-sm text-soft-ink" role="status" aria-live="polite"><span className="inline-block size-3.5 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" aria-hidden />Luna is checking your written answers…</p> : null}
          <button type="button" className={primaryBtn} disabled={!activity.questions.length || checking} onClick={check}>{checking ? "Checking…" : "Check my answers"}</button>
        </div>
      ) : null}
      {!activity.questions.length ? <p className={`${card} p-5 text-sm text-soft-ink`}>This document has nothing to answer — it is a reading document. Export it instead.</p> : null}
    </section>
  );
}

/**
 * Plays an activity. A set of flashcards is a deck (flip, then say how well you knew it); everything
 * else is a page of questions answered and checked together.
 */
export function ActivityPlayer(props) {
  const questions = props.activity?.questions || [];
  if (questions.length && questions.every((question) => question.kind === "flashcard")) return <FlashcardDeck {...props} />;
  return <QuestionList {...props} />;
}
