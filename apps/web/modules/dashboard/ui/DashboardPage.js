"use client";

import { useEffect, useMemo, useState } from "react";
import { PlanCard } from "../../plans/PlanCard";
import { PLAN_TAG, dueLabel } from "../../plans/plan";
import { ExamDatesCard } from "../../plans/ExamDates";
import { OriginBadge } from "../../plans/DeadlineBadge";
import { joinAttempts } from "../../performance/metrics";
import { summariseCatchUp } from "../../activities/catchUp";
import { CoachPanel } from "../../performance/dashboard/CoachPanel";
import { TeacherHome } from "./TeacherHome";
import { ParentHome } from "./ParentHome";
import { HOME_PLAN_LIMIT, coachInputFor, documentsOf, firstRunChecklist, greeting, homeShortcuts, nextBestAction, nextSteps, planRowsOf, rankPlans } from "../home";

const card = "rounded-[18px] border border-ink/8 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)]";
const kicker = "m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink";
const primaryBtn = "inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0077ed] active:scale-[0.98]";

/**
 * Home answers one question: "what do I do now?". A greeting, ONE next-step card, three shortcuts and, for a new
 * person, a three-step checklist. The study plans (closest deadline first) and what Luna suggests are underneath,
 * folded away until wanted. They are read from the plans that need attention first It looks across every subject of the workspace, not just the
 * selected one, and is the same for a student, a teacher and a parent.
 *
 * `onOpenPlan({ documentId, subjectId })` opens one plan in Study plans; `onOpenPage(target)` goes
 * to any other page.
 */
function StudentHome({ profileName = "", role = "student", workspaces = [], selectedWorkspaceId = "", loading = false, onOpenPlan, onOpenPage, examDates = [], onDismissExamDate, account = false }) {
  const workspace = workspaces.find((entry) => entry.id === selectedWorkspaceId) || workspaces[0] || null;
  const documents = useMemo(() => documentsOf(workspace), [workspace]);
  const rows = useMemo(() => planRowsOf(workspace), [workspace]);
  const attempts = useMemo(() => joinAttempts(documents), [documents]);
  const entries = useMemo(() => rankPlans(rows, attempts, { limit: HOME_PLAN_LIMIT }), [rows, attempts]);
  const coach = useMemo(() => coachInputFor(entries, documents, rows), [entries, documents, rows]);
  const steps = useMemo(() => nextSteps(entries, 5), [entries]);
  // Students see what they finished before anything that is late; many late steps become one calm message.
  const catchUp = useMemo(() => summariseCatchUp(steps.map((step) => ({ done: false, due: step.dueDate })), { attempts }), [steps, attempts]);
  const hasMaterial = documents.some((document) => document.sourceType !== "generated" && !(document.tags || []).includes(PLAN_TAG));
  const hasEvidence = coach.topics.length > 0 || coach.errorTypes.length > 0;
  // "What Luna suggests" calls the model (4-5 s): it never blocks the first paint. The panel is mounted (and so reads) only
  // after Home has been on screen for a moment, or as soon as the person opens it; until then a skeleton holds the place.
  const [coachReady, setCoachReady] = useState(false);
  useEffect(() => {
    if (coachReady) return undefined;
    const timer = setTimeout(() => setCoachReady(true), 1500);
    return () => clearTimeout(timer);
  }, [coachReady]);
  // Exam dates teachers or parents sent (students only; the card is absent when there are none), right under the plan gallery.
  const examCard = examDates.some((entry) => !entry.dismissedAt) ? (
    <ExamDatesCard
      examDates={examDates}
      onPlan={(entry) => onOpenPage?.(`plans?generate=1&exam=${entry.id}`)}
      onOpenPlan={(documentId) => onOpenPlan?.({ documentId, subjectId: rows.find((row) => row.document.id === documentId)?.subjectId || "" })}
      onDismiss={(entry, hide) => onDismissExamDate?.(entry, hide)}
    />
  ) : null;

  const action = nextBestAction({ hasMaterial, hasPlans: entries.length > 0, steps, hasEvidence, role });
  const checklist = firstRunChecklist({ hasMaterial, hasPlans: entries.length > 0, hasEvidence });
  const shortcuts = homeShortcuts(role, Boolean(account));
  const go = () => {
    if (action.kind === "step") return onOpenPlan?.({ documentId: action.step.planId, subjectId: action.step.subjectId });
    return onOpenPage?.({ upload: "workspaces", plan: "plans?generate=1", practise: "create", review: "performance" }[action.kind] || "workspaces");
  };

  return (
    <section className="tw-scope grid gap-5">
      <h2 className="m-0 text-[32px] font-bold tracking-tight text-ink">{greeting(profileName)}</h2>
      {role === "student" && catchUp.headline ? <p className="m-0 -mt-3 text-sm font-semibold text-[#1f7a3a]">✓ {catchUp.headline}</p> : null}

      {!workspace && loading ? (
        <div className="grid gap-3" aria-busy="true">
          {[0, 1].map((index) => <div key={index} className="h-32 animate-pulse rounded-[18px] bg-ink/5" />)}
        </div>
      ) : (
        <>
          <div className={`${card} grid justify-items-start gap-2 border-[var(--accent)]/30`} aria-label="Next step">
            <p className={kicker}>Your next step</p>
            <p className="m-0 text-2xl font-bold tracking-tight text-ink">{action.title}</p>
            {action.detail ? <p className="m-0 text-sm text-soft-ink">{action.detail}</p> : null}
            {role === "student" && catchUp.catchUp ? <p className="m-0 text-sm text-ink">{catchUp.catchUp}</p> : null}
            <button type="button" className={`${primaryBtn} mt-1 px-6 py-2.5`} onClick={go}>{action.cta}</button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3" aria-label="Shortcuts">
            {shortcuts.map((shortcut) => (
              <button key={shortcut.id} type="button" className="flex items-center gap-3 rounded-2xl border border-ink/10 bg-white px-4 py-3 text-left text-sm font-semibold text-ink transition hover:bg-[var(--surface-soft)]" onClick={() => onOpenPage?.(shortcut.target)}>
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-base text-[var(--accent)]">{shortcut.icon}</span>
                {shortcut.label}
              </button>
            ))}
          </div>

          {checklist && role !== "parent" ? (
            <div className={card}>
              <p className={kicker}>Getting started</p>
              <ol className="m-0 mt-3 grid list-none gap-2 p-0">
                {checklist.map((item, index) => (
                  <li key={item.id}>
                    <button type="button" disabled={item.done} className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left text-sm text-ink transition enabled:hover:bg-[var(--surface-soft)]" onClick={() => onOpenPage?.(item.target)}>
                      <span aria-hidden className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${item.done ? "bg-[#1a7f37] text-white" : "border border-ink/20 text-soft-ink"}`}>{item.done ? "✓" : index + 1}</span>
                      <span className={item.done ? "text-soft-ink line-through" : "font-semibold"}>{item.label}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {examCard}

          {entries.length ? (
            <details className="group">
              <summary className="cursor-pointer list-none text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden"><span className="mr-1 inline-block transition group-open:rotate-90" aria-hidden>▸</span>Your study plans ({entries.length})</summary>
              <div className="mt-3 grid grid-flow-col auto-cols-[82%] gap-3 overflow-x-auto pb-1 sm:auto-cols-[calc((100%-0.75rem)/2)] lg:auto-cols-[calc((100%-2.25rem)/4)]" aria-label="Study plans, closest deadline first">
                {entries.map((entry) => (
                  <PlanCard
                    key={entry.document.id}
                    document={entry.document}
                    plan={entry.plan}
                    subPlans={entry.children}
                    progress={entry.progress}
                    subjectName={entry.subjectName}
                    onOpen={() => onOpenPlan?.({ documentId: entry.document.id, subjectId: entry.subjectId })}
                  />
                ))}
              </div>
            </details>
          ) : null}

          {entries.length ? (
            <details className="group" onToggle={(event) => { if (event.currentTarget.open) setCoachReady(true); }}>
              <summary className="cursor-pointer list-none text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden"><span className="mr-1 inline-block transition group-open:rotate-90" aria-hidden>▸</span>What Luna suggests</summary>
              <div className={`${card} mt-3`}>
                {hasEvidence && !coachReady ? (
                  <div className="grid gap-2" aria-busy="true" aria-label="Luna is getting ready">
                    <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--surface-soft)]" />
                    <div className="h-4 w-full animate-pulse rounded bg-[var(--surface-soft)]" />
                    <div className="h-4 w-1/2 animate-pulse rounded bg-[var(--surface-soft)]" />
                  </div>
                ) : hasEvidence ? (
                  <CoachPanel
                    role={role}
                    learner={profileName}
                    topics={coach.topics}
                    errorTypes={coach.errorTypes}
                    stuck={coach.stuck}
                    plan={coach.plan}
                    practiseLabel="See in Progress"
                    onPractise={() => onOpenPage?.("performance")}
                    autoRead
                  />
                ) : (
                  <div className="grid gap-3">
                    <p className="m-0 text-sm text-soft-ink">Do a first activity and Luna will read your results and propose what to work on. Until then, this is what is due soonest.</p>
                    {steps.length ? (
                      <ul className="m-0 grid list-none gap-1.5 p-0">
                        {steps.map((step) => (
                          <li key={step.id}>
                            <button type="button" className="flex w-full items-center gap-2 rounded-xl border border-ink/10 px-3 py-2 text-left transition hover:bg-[var(--surface-soft)]" onClick={() => onOpenPlan?.({ documentId: step.planId, subjectId: step.subjectId })}>
                              <span className="size-2.5 shrink-0 rounded-full" style={{ background: step.colour }} />
                              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{step.title}</span><span className="block truncate text-[11px] text-soft-ink">{step.planName}</span></span>
                              {step.imposed ? <OriginBadge imposed by={step.setByName} /> : null}
                              <span className={`shrink-0 text-xs font-semibold ${step.days !== null && step.days < 0 ? "text-[#8a4a00]" : "text-soft-ink"}`}>{dueLabel(step.dueDate)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="m-0 text-sm text-soft-ink">Everything in these plans is done.</p>}
                  </div>
                )}
              </div>
            </details>
          ) : null}
        </>
      )}
    </section>
  );
}

/**
 * Home is different for each role: a student gets their next step, a teacher "Your classes" (who is behind, what is due,
 * send practice) and a parent "Your child this week" (read-only). `onSendPractice({ name, groupIds, recipientIds })` opens the
 * Send practice flow.
 */
export function DashboardPage({ role = "student", account = false, onSendPractice, onOpenPage, ...rest }) {
  if (role === "teacher") return <TeacherHome account={account} onSendPractice={onSendPractice} onOpenPage={onOpenPage} />;
  if (role === "parent") return <ParentHome account={account} onOpenPage={onOpenPage} />;
  return <StudentHome role={role} account={account} onOpenPage={onOpenPage} {...rest} />;
}
