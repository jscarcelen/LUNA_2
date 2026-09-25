"use client";

import { useMemo, useState } from "react";
import { ActivityPlayer } from "./ActivityPlayer";
import { defaultLearner } from "../performance/learners";
import { daysUntil, parsePlan } from "../plans/plan";

const card = "rounded-[18px] border border-ink/8 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)]";
const kicker = "m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink";
const primaryBtn = "inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0077ed] disabled:opacity-50";
const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-[var(--surface-soft)]";
const chip = "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold";

function parse(document) {
  try { return JSON.parse(String(document.content || "{}")); } catch { return null; }
}
function dueOf(document) {
  const tag = (document.tags || []).find((t) => String(t).startsWith("due:"));
  return tag ? String(tag).slice(4) : "";
}
function scoreTone(pct) {
  return pct >= 80 ? "text-[#2f9e5b]" : pct >= 50 ? "text-[#b25e00]" : "text-[var(--color-danger)]";
}

/**
 * Activities — the repository of things to do (quizzes, exams, puzzles, flashcards…) in this
 * subject, with due dates and results. Attempts are recorded per question so mistakes can be
 * reviewed and, later, fed into performance tracking.
 */
export function ActivitiesPage({ role = "student", profileName = "", workspaces = [], selectedWorkspaceId, selectedSubjectId, onSaveGeneratedQuizDocument, onUpdateDocumentMeta, onRemoveDocument, onOpenTool }) {
  const subject = workspaces.find((w) => w.id === selectedWorkspaceId)?.subjects?.find((s) => s.id === selectedSubjectId) || null;
  const docs = subject?.documents || [];
  const activities = useMemo(() => docs.filter((d) => (d.tags || []).includes("activity")).map((d) => ({ document: d, parsed: parse(d) })).filter((a) => a.parsed?.activity), [docs]);
  const attempts = useMemo(() => docs.filter((d) => (d.tags || []).includes("activity-attempt")).map((d) => parse(d)).filter((p) => p?.attempt).map((p) => p), [docs]);
  const [playing, setPlaying] = useState(null);
  const [view, setView] = useState("todo");
  const [selected, setSelected] = useState("");
  const [errorFilter, setErrorFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("");
  const [sort, setSort] = useState("priority");
  const [grouped, setGrouped] = useState(true);

  /** Which study plan each activity belongs to — an activity can be scheduled by one. */
  const plans = useMemo(() => docs.map((document) => ({ document, plan: parsePlan(document) })).filter((row) => row.plan), [docs]);
  const planByResource = useMemo(() => {
    const map = new Map();
    for (const { document, plan } of plans) {
      for (const item of plan.items || []) {
        if (item.resourceId) map.set(item.resourceId, { id: document.id, name: plan.name, colour: plan.colour, dueDate: item.dueDate, goalId: item.goalId });
      }
    }
    return map;
  }, [plans]);

  const attemptsFor = (a) => attempts.filter((p) => (p.activityDocumentId && p.activityDocumentId === a.document.id) || p.activityId === a.parsed.activity.id);
  const rows = activities.map((a) => {
    const list = attemptsFor(a).sort((x, y) => String(y.attempt.at).localeCompare(String(x.attempt.at)));
    const best = list.reduce((m, p) => Math.max(m, p.attempt.total ? p.attempt.score / p.attempt.total : 0), 0);
    return { ...a, attempts: list, best, due: dueOf(a.document), done: list.length > 0, folder: (subject?.folders || []).find((f) => (a.document.folderIds || []).includes(f.id))?.name || "" };
  });
  /** Priority: what is late first, then what is due soonest, then everything without a date. */
  const priority = (row) => {
    const days = daysUntil(row.due);
    if (row.done) return 10000;
    if (days === null) return 5000;
    return days;
  };
  const sorters = {
    priority: (a, b) => priority(a) - priority(b) || String(a.due || "9999").localeCompare(String(b.due || "9999")),
    due: (a, b) => String(a.due || "9999").localeCompare(String(b.due || "9999")),
    plan: (a, b) => String(a.plan?.name || "zzz").localeCompare(String(b.plan?.name || "zzz")) || priority(a) - priority(b),
    name: (a, b) => String(a.parsed.activity.title).localeCompare(String(b.parsed.activity.title))
  };
  const withPlans = rows.map((row) => ({ ...row, plan: planByResource.get(row.document.id) || null }));
  const visible = withPlans
    .filter((r) => (view === "todo" ? !r.done : view === "done" ? r.done : true))
    .filter((r) => (planFilter === "" ? true : planFilter === "__none" ? !r.plan : r.plan?.id === planFilter))
    .sort(sorters[sort] || sorters.priority);
  /** Grouping puts each plan's work together, with everything unplanned at the end. */
  const groups = grouped
    ? [...new Map(visible.map((row) => [row.plan?.id || "", { id: row.plan?.id || "", name: row.plan?.name || "Not in a plan", colour: row.plan?.colour || "#8e98ab" }])).values()]
      .map((group) => ({ ...group, rows: visible.filter((row) => (row.plan?.id || "") === group.id) }))
    : [{ id: "", name: "", colour: "", rows: visible }];
  const active = withPlans.find((r) => r.document.id === selected) || null;

  const allErrors = useMemo(() => {
    const out = [];
    for (const r of rows) for (const p of r.attempts) for (const res of p.attempt.results || []) if (res.correct === false) out.push({ ...res, activity: r.parsed.activity.title, at: p.attempt.at });
    return out;
  }, [rows]);
  const errorTopics = [...new Set(allErrors.map((e) => e.topic || e.group || "").filter(Boolean))];

  async function saveAttempt(attempt, documentId) {
    if (!onSaveGeneratedQuizDocument) return;
    const content = JSON.stringify({ kind: "activity-attempt", attempt, activityDocumentId: documentId, activityId: attempt.activityId, learner: defaultLearner(role, profileName) }, null, 2);
    try { await onSaveGeneratedQuizDocument({ folderIds: [], tags: ["activity-attempt"], file: { name: `${attempt.activityTitle} · attempt.json`, content, preview: `${attempt.score}/${attempt.total}`, sizeBytes: content.length } }); } catch { /* keep local */ }
  }
  async function setDue(row, date) {
    if (!onUpdateDocumentMeta) return;
    const tags = (row.document.tags || []).filter((t) => !String(t).startsWith("due:"));
    await onUpdateDocumentMeta(row.document.id, { folderIds: row.document.folderIds || [], tags: date ? [...tags, `due:${date}`] : tags });
  }

  if (!subject) return <section className="tw-scope"><p className={`${card} p-5 text-sm text-soft-ink`}>Select a workspace and subject to see its activities.</p></section>;

  return (
    <section className="tw-scope grid gap-4">
      <div className={`${card} flex flex-wrap items-center justify-between gap-3 p-5`}>
        <div>
          <p className={kicker}>Activities · {subject.name}</p>
          <h3 className="m-0 mt-1 text-xl font-bold text-ink">{rows.filter((r) => !r.done).length} to do · {rows.filter((r) => r.done).length} done</h3>
          <p className="m-0 mt-1 text-sm text-soft-ink">{role === "teacher" ? "Everything you created for this subject; results per activity and a list of every mistake." : "Quizzes, exams, puzzles and flashcards to do here on Luna. Your results are kept so you can review your mistakes."}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex gap-1 rounded-xl bg-[var(--surface-soft)] p-1">{[["todo", "To do"], ["done", "Done"], ["all", "All"], ["errors", `Mistakes (${allErrors.length})`]].map(([value, text]) => <button key={value} type="button" onClick={() => setView(value)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${view === value ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink"}`}>{text}</button>)}</div>
          {onOpenTool ? <button type="button" className={primaryBtn} onClick={() => onOpenTool("ai-tools")}>＋ Create with an agent</button> : null}
        </div>
        {view !== "errors" ? (
          <div className="flex w-full flex-wrap items-center gap-2">
            <select className="rounded-xl border border-ink/12 bg-white px-3 py-1.5 text-xs" value={planFilter} onChange={(event) => setPlanFilter(event.target.value)}>
              <option value="">Every study plan</option>
              {plans.map((row) => <option key={row.document.id} value={row.document.id}>◷ {row.plan.name}</option>)}
              <option value="__none">Not in a plan</option>
            </select>
            <select className="rounded-xl border border-ink/12 bg-white px-3 py-1.5 text-xs" value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="priority">Sort: what is most urgent</option>
              <option value="due">Sort: due date</option>
              <option value="plan">Sort: study plan</option>
              <option value="name">Sort: name</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-soft-ink"><input type="checkbox" checked={grouped} onChange={(event) => setGrouped(event.target.checked)} />Group by plan</label>
          </div>
        ) : null}
      </div>

      {view === "errors" ? (
        <section className={`${card} p-5`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={kicker}>Mistakes to review</p>
            <select className="rounded-xl border border-ink/15 bg-white px-3 py-1.5 text-xs" value={errorFilter} onChange={(event) => setErrorFilter(event.target.value)}><option value="all">All topics</option>{errorTopics.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          </div>
          <div className="mt-3 grid gap-2">
            {allErrors.filter((e) => errorFilter === "all" || (e.topic || e.group) === errorFilter).map((e, index) => (
              <div key={`${e.id}-${index}`} className="rounded-xl border border-[rgba(255,59,48,0.3)] bg-[rgba(255,59,48,0.04)] px-3 py-2">
                <p className="m-0 text-sm font-semibold text-ink">{e.prompt}</p>
                <p className="m-0 mt-0.5 text-xs text-soft-ink">Your answer: <span className="text-[var(--color-danger)]">{e.given || "—"}</span> · Correct: <span className="text-ink">{e.expected}</span></p>
                <p className="m-0 mt-0.5 text-[10px] text-soft-ink">{e.activity}{e.topic ? ` · ${e.topic}` : ""}{e.difficulty ? ` · ${e.difficulty}` : ""} · {new Date(e.at).toLocaleDateString()}</p>
              </div>
            ))}
            {!allErrors.length ? <p className="m-0 text-sm text-soft-ink">No mistakes recorded yet.</p> : null}
          </div>
        </section>
      ) : (
        <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <section className={`${card} p-5`}>
            <div className="grid gap-4">
              {groups.map((group) => (
                <div key={group.id || "none"}>
                  {grouped ? (
                    <p className="m-0 mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.1em] text-soft-ink">
                      <span className="size-2 rounded-full" style={{ background: group.colour }} />{group.name}<span className="font-normal">· {group.rows.length}</span>
                    </p>
                  ) : null}
            <div className="grid gap-2">
              {group.rows.map((r) => {
                const q = r.parsed.activity.questions.length;
                const pct = Math.round(r.best * 100);
                const overdue = r.due && !r.done && r.due < new Date().toISOString().slice(0, 10);
                return (
                  <div key={r.document.id} className={`flex flex-wrap items-center gap-3 rounded-2xl border p-3 transition ${selected === r.document.id ? "border-[var(--accent)]/40 bg-[var(--accent-soft)]/30" : "border-ink/10"}`}>
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelected(r.document.id)}>
                      <p className="m-0 flex flex-wrap items-center gap-2 text-sm font-bold text-ink"><span className="truncate">{r.parsed.activity.title}</span>{r.done ? <span className={`${chip} bg-[rgba(52,199,89,0.15)] text-[#1f7a3a]`}>done</span> : <span className={`${chip} bg-[var(--surface-soft)] text-soft-ink`}>to do</span>}{overdue ? <span className={`${chip} bg-[rgba(255,59,48,0.12)] text-[var(--color-danger)]`}>overdue</span> : null}</p>
                      <p className="m-0 mt-0.5 text-xs text-soft-ink">{q} question{q === 1 ? "" : "s"}{r.parsed.agentName ? ` · ${r.parsed.agentName}` : ""}{r.plan ? ` · ◷ ${r.plan.name}` : r.folder ? ` · 📁 ${r.folder}` : ""}{r.attempts.length ? ` · ${r.attempts.length} attempt${r.attempts.length === 1 ? "" : "s"} · best ` : ""}{r.attempts.length ? <span className={`font-semibold ${scoreTone(pct)}`}>{pct}%</span> : null}</p>
                    </button>
                    <label className="flex items-center gap-1 text-[11px] text-soft-ink">Due<input type="date" className="rounded-lg border border-ink/15 px-2 py-1 text-xs" value={r.due} onChange={(event) => setDue(r, event.target.value)} /></label>
                    <button type="button" className={primaryBtn} onClick={() => setPlaying(r)}>{r.done ? "Try again" : "Start"}</button>
                    {onRemoveDocument ? <button type="button" className={`${ghostBtn} text-[var(--color-danger)]`} onClick={() => { if (window.confirm(`Delete "${r.parsed.activity.title}"?`)) onRemoveDocument(r.document.id); }}>Delete</button> : null}
                  </div>
                );
              })}
            </div>
                </div>
              ))}
              {!visible.length ? <p className="m-0 rounded-xl bg-[var(--surface-soft)] p-4 text-sm text-soft-ink">{view === "todo" ? "Nothing to do here. Create a quiz, exam or flashcards with an agent — or let a study plan build them for you." : "Nothing yet."}</p> : null}
            </div>
          </section>
          <section className={`${card} p-5`}>
            <p className={kicker}>Results</p>
            {!active ? <p className="m-0 mt-2 text-sm text-soft-ink">Select an activity to see its attempts and mistakes.</p> : (
              <div className="mt-2 grid gap-3">
                <p className="m-0 text-base font-bold text-ink">{active.parsed.activity.title}</p>
                {!active.attempts.length ? <p className="m-0 text-sm text-soft-ink">Not attempted yet.</p> : active.attempts.map((p, index) => (
                  <div key={index} className="rounded-xl border border-ink/10 p-3">
                    <p className="m-0 flex items-center justify-between text-sm"><span className="text-soft-ink">{new Date(p.attempt.at).toLocaleString()}</span><span className={`font-bold ${scoreTone(p.attempt.total ? (p.attempt.score / p.attempt.total) * 100 : 0)}`}>{p.attempt.score} / {p.attempt.total}</span></p>
                    {(p.attempt.results || []).filter((r) => r.correct === false).slice(0, 6).map((r) => <p key={r.id} className="m-0 mt-1 text-xs text-ink">✗ {r.prompt} <span className="text-soft-ink">→ {r.expected}</span></p>)}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {playing ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[var(--bg)]/95 p-4 sm:p-8">
          <ActivityPlayer activity={playing.parsed.activity} onSubmit={(attempt) => saveAttempt(attempt, playing.document.id)} onClose={() => setPlaying(null)} />
        </div>
      ) : null}
    </section>
  );
}
