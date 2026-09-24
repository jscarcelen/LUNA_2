"use client";

import { useMemo, useState } from "react";
import { ITEM_KINDS, PLAN_COLOURS, PLAN_TAG, buildPlan, dueLabel, newGoal, newItem, parsePlan, planProgress, planWeeks } from "./plan";
import { parseResource } from "../resources/resource";
import { joinAttempts } from "../performance/metrics";

const card = "rounded-[18px] border border-ink/8 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)]";
const kicker = "m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink";
const primaryBtn = "inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0077ed] disabled:opacity-50";
const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-[var(--surface-soft)]";
const field = "w-full rounded-xl border border-ink/12 bg-white px-3 py-2 text-sm text-ink";
const chip = "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold";

/** Ring showing how much of a plan is done — the one number a plan is judged on. */
function Ring({ ratio, colour, size = 56 }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="6" />
      <circle
        cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={colour} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={`${circumference * Math.max(0, Math.min(1, ratio))} ${circumference}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize={size * 0.26} fontWeight="700" fill="#1d1d1f">{Math.round(ratio * 100)}%</text>
    </svg>
  );
}

/**
 * Study plans — several at a time, each with its own deadline, goals, material and activities.
 * A plan advances by itself when the student does one of its activities on Luna.
 */
export function PlansPage({ role = "student", workspaces = [], selectedWorkspaceId, selectedSubjectId, onSaveGeneratedQuizDocument, onUpdateGeneratedDocument, onRemoveDocument, onOpenResource }) {
  const subject = workspaces.find((w) => w.id === selectedWorkspaceId)?.subjects?.find((s) => s.id === selectedSubjectId) || null;
  const documents = subject?.documents || [];
  const [openId, setOpenId] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "", examDate: "", colour: PLAN_COLOURS[0], note: "" });

  const plans = useMemo(() => documents.map((document) => ({ document, plan: parsePlan(document) })).filter((row) => row.plan), [documents]);
  const resources = useMemo(() => documents.map((document) => ({ document, resource: parseResource(document) })).filter((row) => row.resource), [documents]);
  const attempts = useMemo(() => joinAttempts(documents), [documents]);
  const open = plans.find((row) => row.document.id === openId) || null;

  async function save(plan, documentId) {
    const content = JSON.stringify({ ...plan, updatedAt: new Date().toISOString() }, null, 2);
    const file = { name: `${plan.name}.plan.json`, content, preview: `${(plan.items || []).length} steps${plan.examDate ? ` · ${plan.examDate}` : ""}`, sizeBytes: content.length };
    setBusy(true);
    try {
      if (documentId) await onUpdateGeneratedDocument?.(documentId, { file });
      else await onSaveGeneratedQuizDocument?.({ folderIds: [], tags: [PLAN_TAG], file });
      setStatus(`Saved “${plan.name}”.`);
    } catch (error) {
      setStatus(String(error.message || error));
    } finally {
      setBusy(false);
    }
  }

  function updateOpen(updater) {
    if (!open) return;
    save(updater(open.plan), open.document.id);
  }

  if (!subject) return <section className="tw-scope"><p className="m-0 text-sm text-soft-ink">Choose a workspace and a space first.</p></section>;

  /* ---------------------------------------------------------------- one plan */
  if (open) {
    const plan = open.plan;
    const progress = planProgress(plan, attempts);
    const weeks = planWeeks(plan);
    return (
      <section className="tw-scope grid gap-4">
        <div className={`${card} p-5`} style={{ borderTop: `4px solid ${plan.colour}` }}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <button type="button" className="text-xs font-semibold text-soft-ink hover:underline" onClick={() => setOpenId("")}>← All plans</button>
              <h3 className="m-0 mt-1 text-2xl font-bold tracking-tight text-ink">{plan.name}</h3>
              <p className="m-0 mt-1 text-sm text-soft-ink">
                {plan.examDate ? `${dueLabel(plan.examDate)} · ${new Date(`${plan.examDate}T00:00:00`).toLocaleDateString()}` : "No deadline set"}
                {plan.learner ? ` · ${plan.learner}` : ""}
                {progress.total ? ` · ${progress.done} of ${progress.total} steps done` : ""}
              </p>
              {plan.note ? <p className="m-0 mt-2 max-w-2xl text-sm text-ink">{plan.note}</p> : null}
            </div>
            <div className="flex items-center gap-4">
              <Ring ratio={progress.ratio} colour={plan.colour} size={64} />
              {progress.average ? <div><p className={kicker}>Average</p><p className="m-0 text-xl font-bold text-ink">{Math.round(progress.average * 100)}%</p></div> : null}
              {progress.late.length ? <div><p className={kicker}>Late</p><p className="m-0 text-xl font-bold text-[var(--color-danger)]">{progress.late.length}</p></div> : null}
            </div>
          </div>
        </div>

        <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <section className={`${card} p-5`}>
            <div className="flex items-center justify-between gap-2">
              <p className={kicker}>The plan</p>
              <select
                className="rounded-xl border border-ink/12 bg-white px-2 py-1 text-xs"
                value=""
                onChange={(event) => {
                  const row = resources.find((item) => item.document.id === event.target.value);
                  if (!row) return;
                  updateOpen((current) => ({ ...current, items: [...current.items, newItem({ resourceId: row.document.id, title: row.resource.name, kind: row.resource.activity ? "activity" : "read" })] }));
                }}
              >
                <option value="">＋ Add a resource…</option>
                {resources.map((row) => <option key={row.document.id} value={row.document.id}>{row.resource.name}</option>)}
              </select>
            </div>
            {!plan.items.length ? <p className="m-0 mt-3 rounded-xl bg-[var(--surface-soft)] p-4 text-sm text-soft-ink">Nothing scheduled yet. Add a resource here, or use “Add to a plan” on any resource.</p> : null}
            <div className="mt-3 grid gap-4">
              {weeks.map((week) => (
                <div key={week.start || "undated"}>
                  <p className="m-0 text-xs font-bold uppercase tracking-[0.1em] text-soft-ink">
                    {week.start ? `Week of ${new Date(`${week.start}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "long" })}` : "No date yet"}
                  </p>
                  <div className="mt-2 grid gap-2">
                    {week.items.map((item) => {
                      const score = progress.scoreByResource.get(item.resourceId);
                      const done = Boolean(item.doneAt) || score !== undefined;
                      const late = !done && dueLabel(item.dueDate).includes("late");
                      const kind = ITEM_KINDS.find((entry) => entry.id === item.kind) || ITEM_KINDS[0];
                      return (
                        <div key={item.id} className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 ${done ? "border-[#2f9e5b]/30 bg-[#2f9e5b]/5" : late ? "border-[var(--color-danger)]/30 bg-[rgba(255,59,48,0.04)]" : "border-ink/10 bg-white"}`}>
                          <button
                            type="button"
                            title={done ? "Mark as not done" : "Mark as done"}
                            className={`grid size-6 shrink-0 place-items-center rounded-full border text-xs ${done ? "border-[#2f9e5b] bg-[#2f9e5b] text-white" : "border-ink/25 text-transparent"}`}
                            onClick={() => updateOpen((current) => ({ ...current, items: current.items.map((entry) => (entry.id === item.id ? { ...entry, doneAt: entry.doneAt ? "" : new Date().toISOString() } : entry)) }))}
                          >
                            ✓
                          </button>
                          <span className="shrink-0 text-sm" aria-hidden>{kind.icon}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-ink">{item.title}</span>
                            <span className="block text-[11px] text-soft-ink">{kind.label}{item.goalId ? ` · ${(plan.goals.find((goal) => goal.id === item.goalId) || {}).title || ""}` : ""}{score !== undefined ? ` · scored ${Math.round(score * 100)}%` : ""}</span>
                          </span>
                          <input
                            type="date"
                            className="rounded-lg border border-ink/12 px-2 py-1 text-xs"
                            value={item.dueDate || ""}
                            onChange={(event) => updateOpen((current) => ({ ...current, items: current.items.map((entry) => (entry.id === item.id ? { ...entry, dueDate: event.target.value } : entry)) }))}
                          />
                          {onOpenResource && item.resourceId ? <button type="button" className={ghostBtn} onClick={() => onOpenResource(item.resourceId)}>Open</button> : null}
                          <button type="button" className="text-xs text-soft-ink hover:text-[var(--color-danger)]" title="Remove from the plan" onClick={() => updateOpen((current) => ({ ...current, items: current.items.filter((entry) => entry.id !== item.id) }))}>✕</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-3">
            <section className={`${card} p-5`}>
              <p className={kicker}>What to achieve</p>
              <div className="mt-2 grid gap-2">
                {progress.goals.map((goal) => (
                  <div key={goal.id} className="rounded-xl border border-ink/10 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="m-0 text-sm font-semibold text-ink">{goal.title}</p>
                      <button type="button" className="text-xs text-soft-ink hover:text-[var(--color-danger)]" onClick={() => updateOpen((current) => ({ ...current, goals: current.goals.filter((entry) => entry.id !== goal.id), items: current.items.map((entry) => (entry.goalId === goal.id ? { ...entry, goalId: "" } : entry)) }))}>✕</button>
                    </div>
                    <p className="m-0 mt-1 text-[11px] text-soft-ink">Target {Math.round((goal.targetScore || 0.8) * 100)}% · {goal.done} of {goal.total} steps{goal.average ? ` · averaging ${Math.round(goal.average * 100)}%` : ""}</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-soft)]"><div className="h-full rounded-full" style={{ width: `${goal.total ? (goal.done / goal.total) * 100 : 0}%`, background: goal.met ? "#2f9e5b" : plan.colour }} /></div>
                  </div>
                ))}
                <button type="button" className={ghostBtn} onClick={() => { const title = window.prompt("What should be achieved? e.g. Master quadratic equations"); if (title) updateOpen((current) => ({ ...current, goals: [...current.goals, newGoal(title)] })); }}>＋ Add a goal</button>
              </div>
            </section>

            <section className={`${card} p-5`}>
              <p className={kicker}>Plan settings</p>
              <div className="mt-2 grid gap-2">
                <label className="grid gap-1 text-xs font-semibold text-soft-ink">Name<input className={field} value={plan.name} onChange={(event) => updateOpen((current) => ({ ...current, name: event.target.value }))} /></label>
                <label className="grid gap-1 text-xs font-semibold text-soft-ink">Deadline / exam date<input type="date" className={field} value={plan.examDate || ""} onChange={(event) => updateOpen((current) => ({ ...current, examDate: event.target.value }))} /></label>
                <label className="grid gap-1 text-xs font-semibold text-soft-ink">Notes<textarea className={field} rows={3} value={plan.note || ""} onChange={(event) => updateOpen((current) => ({ ...current, note: event.target.value }))} /></label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {PLAN_COLOURS.map((colour) => <button key={colour} type="button" aria-label={`Colour ${colour}`} className={`size-6 rounded-full ${plan.colour === colour ? "ring-2 ring-offset-2 ring-ink/40" : ""}`} style={{ background: colour }} onClick={() => updateOpen((current) => ({ ...current, colour }))} />)}
                </div>
                {onRemoveDocument ? <button type="button" className="justify-self-start text-xs font-semibold text-[var(--color-danger)] hover:underline" onClick={() => { if (window.confirm(`Delete the plan “${plan.name}”?`)) { onRemoveDocument(open.document.id); setOpenId(""); } }}>Delete this plan</button> : null}
              </div>
            </section>
          </div>
        </div>
        {status ? <p className="m-0 px-1 text-xs text-[var(--accent-ink)]">{status}{busy ? " …" : ""}</p> : null}
      </section>
    );
  }

  /* ---------------------------------------------------------------- all plans */
  return (
    <section className="tw-scope grid gap-4">
      <div className={`${card} flex flex-wrap items-center justify-between gap-3 p-5`}>
        <div>
          <p className={kicker}>Study plans · {subject.name}</p>
          <h3 className="m-0 mt-1 text-xl font-bold text-ink">{plans.length} plan{plans.length === 1 ? "" : "s"}</h3>
          <p className="m-0 mt-1 text-sm text-soft-ink">A deadline, what has to be achieved, and the resources and activities that get {role === "student" ? "you" : "them"} there. Doing an activity on Luna ticks it off by itself.</p>
        </div>
        <button type="button" className={primaryBtn} onClick={() => setCreating(true)}>＋ New plan</button>
      </div>

      {status ? <p className="m-0 px-1 text-xs text-[var(--accent-ink)]">{status}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {plans.map(({ document, plan }) => {
          const progress = planProgress(plan, attempts);
          return (
            <article key={document.id} className={`${card} flex flex-col gap-3 p-5`} style={{ borderTop: `4px solid ${plan.colour}` }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="m-0 truncate text-base font-bold text-ink">{plan.name}</h4>
                  <p className="m-0 mt-0.5 text-xs text-soft-ink">{plan.examDate ? dueLabel(plan.examDate) : "No deadline"}{plan.learner ? ` · ${plan.learner}` : ""}</p>
                </div>
                <Ring ratio={progress.ratio} colour={plan.colour} />
              </div>
              <div className="flex flex-wrap gap-1">
                <span className={`${chip} bg-[var(--surface-soft)] text-soft-ink`}>{progress.done}/{progress.total} steps</span>
                {progress.goals.length ? <span className={`${chip} bg-[var(--surface-soft)] text-soft-ink`}>{progress.goals.filter((goal) => goal.met).length}/{progress.goals.length} goals</span> : null}
                {progress.late.length ? <span className={`${chip} bg-[rgba(255,59,48,0.1)] text-[var(--color-danger)]`}>{progress.late.length} late</span> : null}
                {progress.average ? <span className={`${chip} bg-[#2f9e5b]/10 text-[#1d7a44]`}>avg {Math.round(progress.average * 100)}%</span> : null}
              </div>
              {progress.next.length ? (
                <div>
                  <p className={kicker}>Next up</p>
                  <ul className="m-0 mt-1 grid list-none gap-1 p-0">
                    {progress.next.slice(0, 3).map((item) => (
                      <li key={item.id} className="flex items-center justify-between gap-2 text-xs text-ink"><span className="truncate">{item.title}</span><span className="shrink-0 text-soft-ink">{dueLabel(item.dueDate)}</span></li>
                    ))}
                  </ul>
                </div>
              ) : <p className="m-0 text-xs text-soft-ink">Everything done. 🎉</p>}
              <button type="button" className={`${primaryBtn} mt-auto`} onClick={() => setOpenId(document.id)}>Open plan</button>
            </article>
          );
        })}
        {!plans.length ? <p className="m-0 text-sm text-soft-ink">No plans yet — create one, then add resources to it from the Resources tab.</p> : null}
      </div>

      {creating ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={() => setCreating(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-[0_24px_64px_rgba(0,0,0,0.25)]" onClick={(event) => event.stopPropagation()}>
            <h4 className="m-0 text-lg font-bold text-ink">New study plan</h4>
            <p className="m-0 mt-1 text-xs text-soft-ink">Give it a name and a deadline. Goals and resources are added inside.</p>
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1 text-xs font-semibold text-soft-ink">Name<input autoFocus className={field} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Maths final · June" /></label>
              <label className="grid gap-1 text-xs font-semibold text-soft-ink">Deadline / exam date<input type="date" className={field} value={draft.examDate} onChange={(event) => setDraft({ ...draft, examDate: event.target.value })} /></label>
              <label className="grid gap-1 text-xs font-semibold text-soft-ink">What is it for?<textarea className={field} rows={2} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="Cover units 4 to 6 and fix the mistakes from the mock." /></label>
              <div className="flex flex-wrap items-center gap-1.5">
                {PLAN_COLOURS.map((colour) => <button key={colour} type="button" aria-label={`Colour ${colour}`} className={`size-6 rounded-full ${draft.colour === colour ? "ring-2 ring-offset-2 ring-ink/40" : ""}`} style={{ background: colour }} onClick={() => setDraft({ ...draft, colour })} />)}
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className={ghostBtn} onClick={() => setCreating(false)}>Cancel</button>
              <button
                type="button"
                className={primaryBtn}
                disabled={busy || !draft.name.trim()}
                onClick={async () => { await save(buildPlan(draft)); setCreating(false); setDraft({ name: "", examDate: "", colour: PLAN_COLOURS[0], note: "" }); }}
              >
                {busy ? "Creating…" : "Create plan"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
