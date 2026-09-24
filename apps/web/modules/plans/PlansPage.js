"use client";

import { useMemo, useState } from "react";
import { DEADLINE_KINDS, ITEM_KINDS, PLAN_COLOURS, PLAN_TAG, buildPlan, dueLabel, newDeadline, newGoal, newItem, nextDeadline, parsePlan, planProgress, planWeeks, upcoming, withSubPlans } from "./plan";
import { parseResource } from "../resources/resource";
import { conceptIndex, resourceConcepts } from "../resources/concepts";
import { joinAttempts } from "../performance/metrics";
import { PlanCalendar } from "./PlanCalendar";
import { GeneratePlanDialog } from "./GeneratePlanDialog";

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
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={colour} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${circumference * Math.max(0, Math.min(1, ratio))} ${circumference}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize={size * 0.26} fontWeight="700" fill="#1d1d1f">{Math.round(ratio * 100)}%</text>
    </svg>
  );
}

/**
 * Study plans: several at once, nested (a final exam made of the topics it covers), each with its
 * deadlines, its goals — expressed as the concepts its resources teach — and its schedule. The
 * calendar puts every plan on the same weeks so a collision is visible before it happens, and the
 * alert panel says what is due now.
 */
export function PlansPage({ role = "student", workspaces = [], selectedWorkspaceId, selectedSubjectId, onSaveGeneratedQuizDocument, onUpdateGeneratedDocument, onRemoveDocument, onOpenResource }) {
  const subject = workspaces.find((w) => w.id === selectedWorkspaceId)?.subjects?.find((s) => s.id === selectedSubjectId) || null;
  const documents = subject?.documents || [];
  const [openId, setOpenId] = useState("");
  const [tab, setTab] = useState("plans");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState({ name: "", examDate: "", colour: PLAN_COLOURS[0], note: "", parentPlanId: "" });

  const plans = useMemo(() => documents.map((document) => ({ document, plan: parsePlan(document) })).filter((row) => row.plan), [documents]);
  const resources = useMemo(() => documents.map((document) => ({ document, resource: parseResource(document) })).filter((row) => row.resource), [documents]);
  const attempts = useMemo(() => joinAttempts(documents), [documents]);
  const concepts = useMemo(() => conceptIndex(resources), [resources]);
  const alerts = useMemo(() => upcoming(plans, attempts, 10), [plans, attempts]);
  const open = plans.find((row) => row.document.id === openId) || null;
  const roots = plans.filter((row) => !row.plan.parentPlanId || !plans.some((other) => other.document.id === row.plan.parentPlanId));

  async function save(plan, documentId) {
    const content = JSON.stringify({ ...plan, updatedAt: new Date().toISOString() }, null, 2);
    const deadline = nextDeadline(plan);
    const file = { name: `${plan.name}.plan.json`, content, preview: `${(plan.items || []).length} steps${deadline ? ` · ${deadline.date}` : ""}`, sizeBytes: content.length };
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

  /** Dropping an item on a day of the calendar moves its due date, whichever plan it belongs to. */
  function moveItem(planId, itemId, date) {
    const row = plans.find((entry) => entry.document.id === planId);
    if (!row) return;
    save({ ...row.plan, items: row.plan.items.map((item) => (item.id === itemId ? { ...item, dueDate: date } : item)) }, planId);
  }

  if (!subject) return <section className="tw-scope"><p className="m-0 text-sm text-soft-ink">Choose a folder in your workspace first.</p></section>;

  /* ---------------------------------------------------------------- one plan */
  if (open) {
    const plan = open.plan;
    const children = plans.filter((row) => row.plan.parentPlanId === open.document.id);
    const whole = withSubPlans(plan, plans);
    const progress = planProgress(plan, attempts);
    const wholeProgress = planProgress(whole, attempts);
    const weeks = planWeeks(plan);
    const parent = plans.find((row) => row.document.id === plan.parentPlanId) || null;

    return (
      <section className="tw-scope grid gap-4">
        <div className={`${card} p-5`} style={{ borderTop: `4px solid ${plan.colour}` }}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <button type="button" className="text-xs font-semibold text-soft-ink hover:underline" onClick={() => setOpenId("")}>← All plans</button>
              {parent ? <button type="button" className="ml-2 text-xs font-semibold text-[var(--accent-ink)] hover:underline" onClick={() => setOpenId(parent.document.id)}>part of “{parent.plan.name}”</button> : null}
              <h3 className="m-0 mt-1 text-2xl font-bold tracking-tight text-ink">{plan.name}</h3>
              <p className="m-0 mt-1 text-sm text-soft-ink">
                {progress.deadline ? `${progress.deadline.title}: ${dueLabel(progress.deadline.date)}` : "No deadline set"}
                {plan.learner ? ` · ${plan.learner}` : ""}
                {progress.total ? ` · ${progress.done} of ${progress.total} steps done` : ""}
                {children.length ? ` · ${children.length} sub-plan${children.length === 1 ? "" : "s"} (${wholeProgress.done}/${wholeProgress.total} in total)` : ""}
              </p>
              {plan.note ? <p className="m-0 mt-2 max-w-2xl text-sm text-ink">{plan.note}</p> : null}
            </div>
            <div className="flex items-center gap-4">
              <Ring ratio={children.length ? wholeProgress.ratio : progress.ratio} colour={plan.colour} size={64} />
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
            {!plan.items.length ? <p className="m-0 mt-3 rounded-xl bg-[var(--surface-soft)] p-4 text-sm text-soft-ink">Nothing scheduled yet. Add a resource here, or use “＋ Plan” on any resource in your folders.</p> : null}
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
                            <span className="block text-[11px] text-soft-ink">{kind.label}{item.minutes ? ` · ${item.minutes} min` : ""}{item.goalId ? ` · ${(plan.goals.find((goal) => goal.id === item.goalId) || {}).title || ""}` : ""}{score !== undefined ? ` · scored ${Math.round(score * 100)}%` : ""}</span>
                          </span>
                          <select
                            className="rounded-lg border border-ink/12 px-2 py-1 text-xs"
                            value={item.goalId || ""}
                            onChange={(event) => updateOpen((current) => ({ ...current, items: current.items.map((entry) => (entry.id === item.id ? { ...entry, goalId: event.target.value } : entry)) }))}
                          >
                            <option value="">No goal</option>
                            {plan.goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
                          </select>
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
              <p className={kicker}>Deadlines</p>
              <div className="mt-2 grid gap-2">
                {(plan.deadlines || []).map((deadline) => (
                  <div key={deadline.id} className="flex flex-wrap items-center gap-1.5 rounded-xl border border-ink/10 p-2">
                    <input className="min-w-0 flex-1 rounded-lg border border-ink/12 px-2 py-1 text-sm" value={deadline.title} onChange={(event) => updateOpen((current) => ({ ...current, deadlines: current.deadlines.map((entry) => (entry.id === deadline.id ? { ...entry, title: event.target.value } : entry)) }))} />
                    <select className="rounded-lg border border-ink/12 px-2 py-1 text-xs" value={deadline.kind} onChange={(event) => updateOpen((current) => ({ ...current, deadlines: current.deadlines.map((entry) => (entry.id === deadline.id ? { ...entry, kind: event.target.value } : entry)) }))}>
                      {DEADLINE_KINDS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
                    </select>
                    <input type="date" className="rounded-lg border border-ink/12 px-2 py-1 text-xs" value={deadline.date || ""} onChange={(event) => updateOpen((current) => ({ ...current, deadlines: current.deadlines.map((entry) => (entry.id === deadline.id ? { ...entry, date: event.target.value } : entry)) }))} />
                    <span className="text-[11px] text-soft-ink">{dueLabel(deadline.date)}</span>
                    <button type="button" className="text-xs text-soft-ink hover:text-[var(--color-danger)]" onClick={() => updateOpen((current) => ({ ...current, deadlines: current.deadlines.filter((entry) => entry.id !== deadline.id) }))}>✕</button>
                  </div>
                ))}
                <button type="button" className={`${ghostBtn} justify-self-start`} onClick={() => { const title = window.prompt("What is the deadline? e.g. Mock exam"); if (title) updateOpen((current) => ({ ...current, deadlines: [...(current.deadlines || []), newDeadline(title, "", "exam")] })); }}>＋ Add a deadline</button>
              </div>
            </section>

            <section className={`${card} p-5`}>
              <p className={kicker}>What to achieve</p>
              <p className="m-0 mt-1 text-[11px] text-soft-ink">A goal can name the concepts it covers and the resources that teach them.</p>
              <div className="mt-2 grid gap-2">
                {progress.goals.map((goal) => (
                  <div key={goal.id} className="rounded-xl border border-ink/10 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="m-0 text-sm font-semibold text-ink">{goal.title}</p>
                      <button type="button" className="text-xs text-soft-ink hover:text-[var(--color-danger)]" onClick={() => updateOpen((current) => ({ ...current, goals: current.goals.filter((entry) => entry.id !== goal.id), items: current.items.map((entry) => (entry.goalId === goal.id ? { ...entry, goalId: "" } : entry)) }))}>✕</button>
                    </div>
                    <p className="m-0 mt-1 text-[11px] text-soft-ink">Target {Math.round((goal.targetScore || 0.8) * 100)}% · {goal.done} of {goal.total} steps{goal.average ? ` · averaging ${Math.round(goal.average * 100)}%` : ""}</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-soft)]"><div className="h-full rounded-full" style={{ width: `${goal.total ? (goal.done / goal.total) * 100 : 0}%`, background: goal.met ? "#2f9e5b" : plan.colour }} /></div>
                    {(goal.concepts || []).length ? <p className="m-0 mt-2 flex flex-wrap gap-1">{goal.concepts.map((concept) => <span key={concept} className={`${chip} bg-[var(--surface-soft)] text-soft-ink`}>{concept}</span>)}</p> : null}
                    <div className="mt-2 grid gap-1.5">
                      {concepts.length ? (
                        <select
                          className="rounded-lg border border-ink/12 bg-white px-2 py-1 text-xs"
                          value=""
                          onChange={(event) => {
                            const value = event.target.value;
                            if (!value) return;
                            const entry = concepts.find((item) => item.key === value);
                            updateOpen((current) => ({
                              ...current,
                              goals: current.goals.map((item) => (item.id === goal.id
                                ? { ...item, concepts: [...new Set([...(item.concepts || []), entry.name])], resourceIds: [...new Set([...(item.resourceIds || []), ...entry.resources.map((resource) => resource.documentId)])] }
                                : item))
                            }));
                          }}
                        >
                          <option value="">＋ Cover a concept…</option>
                          {concepts.map((entry) => <option key={entry.key} value={entry.key}>{entry.name} ({entry.resources.length} resource{entry.resources.length === 1 ? "" : "s"})</option>)}
                        </select>
                      ) : null}
                      <select
                        className="rounded-lg border border-ink/12 bg-white px-2 py-1 text-xs"
                        value=""
                        onChange={(event) => {
                          const row = resources.find((item) => item.document.id === event.target.value);
                          if (!row) return;
                          updateOpen((current) => ({
                            ...current,
                            goals: current.goals.map((item) => (item.id === goal.id ? { ...item, resourceIds: [...new Set([...(item.resourceIds || []), row.document.id])], concepts: [...new Set([...(item.concepts || []), ...resourceConcepts(row.resource).map((concept) => concept.name)])] } : item)),
                            items: current.items.some((item) => item.resourceId === row.document.id)
                              ? current.items.map((item) => (item.resourceId === row.document.id ? { ...item, goalId: goal.id } : item))
                              : [...current.items, newItem({ resourceId: row.document.id, title: row.resource.name, kind: row.resource.activity ? "activity" : "read", goalId: goal.id })]
                          }));
                        }}
                      >
                        <option value="">＋ Link a resource to this goal…</option>
                        {resources.map((row) => <option key={row.document.id} value={row.document.id}>{row.resource.name}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
                <button type="button" className={`${ghostBtn} justify-self-start`} onClick={() => { const title = window.prompt("What should be achieved? e.g. Master quadratic equations"); if (title) updateOpen((current) => ({ ...current, goals: [...current.goals, newGoal(title)] })); }}>＋ Add a goal</button>
              </div>
            </section>

            <section className={`${card} p-5`}>
              <p className={kicker}>Sub-plans</p>
              <p className="m-0 mt-1 text-[11px] text-soft-ink">Break a big exam into the topics it is made of; the parent shows their combined progress.</p>
              <div className="mt-2 grid gap-1.5">
                {children.map((row) => {
                  const childProgress = planProgress(row.plan, attempts);
                  return (
                    <button key={row.document.id} type="button" className="flex items-center gap-2 rounded-xl border border-ink/10 px-3 py-2 text-left hover:bg-[var(--surface-soft)]" onClick={() => setOpenId(row.document.id)}>
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: row.plan.colour }} />
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{row.plan.name}</span><span className="block text-[11px] text-soft-ink">{childProgress.done}/{childProgress.total} steps{childProgress.deadline ? ` · ${dueLabel(childProgress.deadline.date)}` : ""}</span></span>
                      <span className="text-xs font-bold text-soft-ink">{Math.round(childProgress.ratio * 100)}%</span>
                    </button>
                  );
                })}
                <button type="button" className={`${ghostBtn} justify-self-start`} onClick={() => { setDraft({ name: "", examDate: "", colour: plan.colour, note: "", parentPlanId: open.document.id }); setCreating(true); }}>＋ New sub-plan</button>
                {plans.filter((row) => row.document.id !== open.document.id && !row.plan.parentPlanId).length ? (
                  <select className="rounded-lg border border-ink/12 bg-white px-2 py-1 text-xs" value="" onChange={(event) => { const row = plans.find((item) => item.document.id === event.target.value); if (row) save({ ...row.plan, parentPlanId: open.document.id }, row.document.id); }}>
                    <option value="">Move an existing plan under this one…</option>
                    {plans.filter((row) => row.document.id !== open.document.id && !row.plan.parentPlanId).map((row) => <option key={row.document.id} value={row.document.id}>{row.plan.name}</option>)}
                  </select>
                ) : null}
              </div>
            </section>

            <section className={`${card} p-5`}>
              <p className={kicker}>Plan settings</p>
              <div className="mt-2 grid gap-2">
                <label className="grid gap-1 text-xs font-semibold text-soft-ink">Name<input className={field} value={plan.name} onChange={(event) => updateOpen((current) => ({ ...current, name: event.target.value }))} /></label>
                <label className="grid gap-1 text-xs font-semibold text-soft-ink">Notes<textarea className={field} rows={3} value={plan.note || ""} onChange={(event) => updateOpen((current) => ({ ...current, note: event.target.value }))} /></label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {PLAN_COLOURS.map((colour) => <button key={colour} type="button" aria-label={`Colour ${colour}`} className={`size-6 rounded-full ${plan.colour === colour ? "ring-2 ring-offset-2 ring-ink/40" : ""}`} style={{ background: colour }} onClick={() => updateOpen((current) => ({ ...current, colour }))} />)}
                </div>
                {plan.parentPlanId ? <button type="button" className="justify-self-start text-xs font-semibold text-soft-ink hover:underline" onClick={() => updateOpen((current) => ({ ...current, parentPlanId: "" }))}>Detach from its parent plan</button> : null}
                {onRemoveDocument ? <button type="button" className="justify-self-start text-xs font-semibold text-[var(--color-danger)] hover:underline" onClick={() => { if (window.confirm(`Delete the plan “${plan.name}”?`)) { onRemoveDocument(open.document.id); setOpenId(""); } }}>Delete this plan</button> : null}
              </div>
            </section>
          </div>
        </div>
        {status ? <p className="m-0 px-1 text-xs text-[var(--accent-ink)]">{status}{busy ? " …" : ""}</p> : null}
        {creating ? <CreateDialog draft={draft} setDraft={setDraft} busy={busy} plans={plans} onCancel={() => setCreating(false)} onCreate={async () => { await save(buildPlan(draft)); setCreating(false); setDraft({ name: "", examDate: "", colour: PLAN_COLOURS[0], note: "", parentPlanId: "" }); }} /> : null}
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
          <p className="m-0 mt-1 text-sm text-soft-ink">Deadlines, what has to be achieved, and the resources and activities that get {role === "student" ? "you" : "them"} there. Doing an activity on Luna ticks it off by itself.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-xl bg-[var(--surface-soft)] p-1">
            {[["plans", "Plans"], ["calendar", "Calendar"]].map(([value, label]) => <button key={value} type="button" onClick={() => setTab(value)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === value ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink"}`}>{label}</button>)}
          </div>
          <button type="button" className={ghostBtn} onClick={() => setGenerating(true)}>✦ Plan it for me</button>
          <button type="button" className={primaryBtn} onClick={() => { setDraft({ name: "", examDate: "", colour: PLAN_COLOURS[plans.length % PLAN_COLOURS.length], note: "", parentPlanId: "" }); setCreating(true); }}>＋ New plan</button>
        </div>
      </div>

      {alerts.length ? (
        <section className={`${card} p-5`}>
          <div className="flex items-center justify-between gap-2">
            <p className={kicker}>Next up</p>
            <span className="text-[11px] text-soft-ink">{alerts.filter((alert) => alert.days < 0).length} late · {alerts.filter((alert) => alert.days === 0).length} today</span>
          </div>
          <ul className="m-0 mt-2 grid list-none gap-1.5 p-0">
            {alerts.slice(0, 6).map((alert) => (
              <li key={`${alert.planId}-${alert.id}`}>
                <button type="button" className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition hover:bg-[var(--surface-soft)] ${alert.days < 0 ? "border-[var(--color-danger)]/30 bg-[rgba(255,59,48,0.04)]" : alert.days === 0 ? "border-[var(--accent)]/40 bg-[var(--accent-soft)]/40" : "border-ink/10"}`} onClick={() => setOpenId(alert.planId)}>
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: alert.colour }} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{alert.kind === "deadline" ? "★ " : ""}{alert.title}</span><span className="block text-[11px] text-soft-ink">{alert.planName}</span></span>
                  <span className={`shrink-0 text-xs font-semibold ${alert.days < 0 ? "text-[var(--color-danger)]" : "text-soft-ink"}`}>{dueLabel(alert.dueDate)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {status ? <p className="m-0 px-1 text-xs text-[var(--accent-ink)]">{status}</p> : null}

      {tab === "calendar" ? <PlanCalendar rows={plans} attempts={attempts} onOpenPlan={setOpenId} onMoveItem={moveItem} /> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {roots.map(({ document, plan }) => {
            const children = plans.filter((row) => row.plan.parentPlanId === document.id);
            const progress = planProgress(children.length ? withSubPlans(plan, plans) : plan, attempts);
            return (
              <article key={document.id} className={`${card} flex flex-col gap-3 p-5`} style={{ borderTop: `4px solid ${plan.colour}` }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="m-0 truncate text-base font-bold text-ink">{plan.name}</h4>
                    <p className="m-0 mt-0.5 text-xs text-soft-ink">{progress.deadline ? `${progress.deadline.title} · ${dueLabel(progress.deadline.date)}` : "No deadline"}{children.length ? ` · ${children.length} sub-plan${children.length === 1 ? "" : "s"}` : ""}</p>
                  </div>
                  <Ring ratio={progress.ratio} colour={plan.colour} />
                </div>
                <div className="flex flex-wrap gap-1">
                  <span className={`${chip} bg-[var(--surface-soft)] text-soft-ink`}>{progress.done}/{progress.total} steps</span>
                  {progress.goals.length ? <span className={`${chip} bg-[var(--surface-soft)] text-soft-ink`}>{progress.goals.filter((goal) => goal.met).length}/{progress.goals.length} goals</span> : null}
                  {progress.late.length ? <span className={`${chip} bg-[rgba(255,59,48,0.1)] text-[var(--color-danger)]`}>{progress.late.length} late</span> : null}
                  {progress.average ? <span className={`${chip} bg-[#2f9e5b]/10 text-[#1d7a44]`}>avg {Math.round(progress.average * 100)}%</span> : null}
                </div>
                {children.length ? (
                  <ul className="m-0 grid list-none gap-0.5 p-0">
                    {children.map((row) => <li key={row.document.id} className="truncate text-[11px] text-soft-ink">↳ {row.plan.name}</li>)}
                  </ul>
                ) : null}
                {progress.next.length ? (
                  <div>
                    <p className={kicker}>Next up</p>
                    <ul className="m-0 mt-1 grid list-none gap-1 p-0">
                      {progress.next.slice(0, 3).map((item) => <li key={item.id} className="flex items-center justify-between gap-2 text-xs text-ink"><span className="truncate">{item.title}</span><span className="shrink-0 text-soft-ink">{dueLabel(item.dueDate)}</span></li>)}
                    </ul>
                  </div>
                ) : <p className="m-0 text-xs text-soft-ink">Everything done. 🎉</p>}
                <button type="button" className={`${primaryBtn} mt-auto`} onClick={() => setOpenId(document.id)}>Open plan</button>
              </article>
            );
          })}
          {!plans.length ? <p className="m-0 text-sm text-soft-ink">No plans yet — create one, or let Luna build one from your material.</p> : null}
        </div>
      )}

      {creating ? <CreateDialog draft={draft} setDraft={setDraft} busy={busy} plans={plans} onCancel={() => setCreating(false)} onCreate={async () => { await save(buildPlan(draft)); setCreating(false); setDraft({ name: "", examDate: "", colour: PLAN_COLOURS[0], note: "", parentPlanId: "" }); }} /> : null}

      {generating ? (
        <GeneratePlanDialog
          documents={documents}
          resources={resources}
          attempts={attempts}
          onCancel={() => setGenerating(false)}
          onDone={(message) => { setGenerating(false); setStatus(message); }}
          onSavePlan={(plan) => save(plan)}
        />
      ) : null}
    </section>
  );
}

function CreateDialog({ draft, setDraft, busy, plans, onCancel, onCreate }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-[0_24px_64px_rgba(0,0,0,0.25)]" onClick={(event) => event.stopPropagation()}>
        <h4 className="m-0 text-lg font-bold text-ink">{draft.parentPlanId ? "New sub-plan" : "New study plan"}</h4>
        <p className="m-0 mt-1 text-xs text-soft-ink">A name and a first deadline. Goals, resources and further deadlines are added inside.</p>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-xs font-semibold text-soft-ink">Name<input autoFocus className={field} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Maths final · June" /></label>
          <label className="grid gap-1 text-xs font-semibold text-soft-ink">First deadline<input type="date" className={field} value={draft.examDate} onChange={(event) => setDraft({ ...draft, examDate: event.target.value })} /></label>
          <label className="grid gap-1 text-xs font-semibold text-soft-ink">What is it for?<textarea className={field} rows={2} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="Cover units 4 to 6 and fix the mistakes from the mock." /></label>
          <label className="grid gap-1 text-xs font-semibold text-soft-ink">Part of
            <select className={field} value={draft.parentPlanId} onChange={(event) => setDraft({ ...draft, parentPlanId: event.target.value })}>
              <option value="">A plan of its own</option>
              {plans.map((row) => <option key={row.document.id} value={row.document.id}>{row.plan.name}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            {PLAN_COLOURS.map((colour) => <button key={colour} type="button" aria-label={`Colour ${colour}`} className={`size-6 rounded-full ${draft.colour === colour ? "ring-2 ring-offset-2 ring-ink/40" : ""}`} style={{ background: colour }} onClick={() => setDraft({ ...draft, colour })} />)}
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={ghostBtn} onClick={onCancel}>Cancel</button>
          <button type="button" className={primaryBtn} disabled={busy || !draft.name.trim()} onClick={onCreate}>{busy ? "Creating…" : "Create plan"}</button>
        </div>
      </div>
    </div>
  );
}
