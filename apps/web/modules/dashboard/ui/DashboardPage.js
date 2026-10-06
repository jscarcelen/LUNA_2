"use client";

import { useMemo } from "react";
import { PlanCard } from "../../plans/PlanCard";
import { PLAN_TAG, dueLabel } from "../../plans/plan";
import { ExamDatesCard } from "../../plans/ExamDates";
import { OriginBadge } from "../../plans/DeadlineBadge";
import { joinAttempts } from "../../performance/metrics";
import { CoachPanel } from "../../performance/dashboard/CoachPanel";
import { HOME_PLAN_LIMIT, coachInputFor, documentsOf, greeting, nextSteps, planRowsOf, rankPlans } from "../home";

const card = "rounded-[18px] border border-ink/8 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)]";
const kicker = "m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink";
const primaryBtn = "inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0077ed] active:scale-[0.98]";

/**
 * Home: a greeting, the study plans that need attention first (closest deadline, one row, at most
 * four — the same cards as in Study plans), and what Luna proposes to do next, read from the
 * results of exactly those plans. It looks across every subject of the workspace, not just the
 * selected one, and is the same for a student, a teacher and a parent.
 *
 * `onOpenPlan({ documentId, subjectId })` opens one plan in Study plans; `onOpenPage(target)` goes
 * to any other page.
 */
export function DashboardPage({ profileName = "", role = "student", workspaces = [], selectedWorkspaceId = "", loading = false, onOpenPlan, onOpenPage, examDates = [], onDismissExamDate }) {
  const workspace = workspaces.find((entry) => entry.id === selectedWorkspaceId) || workspaces[0] || null;
  const documents = useMemo(() => documentsOf(workspace), [workspace]);
  const rows = useMemo(() => planRowsOf(workspace), [workspace]);
  const attempts = useMemo(() => joinAttempts(documents), [documents]);
  const entries = useMemo(() => rankPlans(rows, attempts, { limit: HOME_PLAN_LIMIT }), [rows, attempts]);
  const coach = useMemo(() => coachInputFor(entries, documents, rows), [entries, documents, rows]);
  const steps = useMemo(() => nextSteps(entries, 5), [entries]);
  const hasMaterial = documents.some((document) => document.sourceType !== "generated" && !(document.tags || []).includes(PLAN_TAG));
  const hasEvidence = coach.topics.length > 0 || coach.errorTypes.length > 0;
  // Exam dates teachers or parents sent (students only; the card is absent when there are none), right under the plan gallery.
  const examCard = examDates.some((entry) => !entry.dismissedAt) ? (
    <ExamDatesCard
      examDates={examDates}
      onPlan={(entry) => onOpenPage?.(`plans?generate=1&exam=${entry.id}`)}
      onOpenPlan={(documentId) => onOpenPlan?.({ documentId, subjectId: rows.find((row) => row.document.id === documentId)?.subjectId || "" })}
      onDismiss={(entry, hide) => onDismissExamDate?.(entry, hide)}
    />
  ) : null;

  return (
    <section className="tw-scope grid gap-6">
      <h2 className="m-0 text-[32px] font-bold tracking-tight text-ink">{greeting(profileName)}</h2>

      {!workspace && loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">
          {[0, 1, 2, 3].map((index) => <div key={index} className="h-56 animate-pulse rounded-[18px] bg-ink/5" />)}
        </div>
      ) : !entries.length ? (
        <>
        {examCard}
        <div className={`${card} grid justify-items-start gap-3`}>
          <p className="m-0 text-base font-semibold text-ink">No study plans yet.</p>
          <p className="m-0 text-sm text-soft-ink">{hasMaterial ? "Let Luna turn your material into a plan with deadlines, activities and a way to track how it is going." : "Upload your course material and Luna will turn it into a plan with deadlines and activities."}</p>
          <button type="button" className={primaryBtn} onClick={() => onOpenPage?.(hasMaterial ? "plans?generate=1" : "workspaces")}>{hasMaterial ? "✦ Plan it for me" : "Upload material"}</button>
        </div>
        </>
      ) : (
        <>
          <div className="grid grid-flow-col auto-cols-[82%] gap-3 overflow-x-auto pb-1 sm:auto-cols-[calc((100%-0.75rem)/2)] lg:auto-cols-[calc((100%-2.25rem)/4)]" aria-label="Study plans, closest deadline first">
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

          {examCard}

          <div className={card}>
            <p className={kicker}>Next steps from Luna</p>
            <div className="mt-3">
              {hasEvidence ? (
                <CoachPanel
                  role={role}
                  learner={profileName}
                  topics={coach.topics}
                  errorTypes={coach.errorTypes}
                  stuck={coach.stuck}
                  plan={coach.plan}
                  practiseLabel="See in Performance"
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
                            <span className={`shrink-0 text-xs font-semibold ${step.days !== null && step.days < 0 ? "text-[var(--color-danger)]" : "text-soft-ink"}`}>{dueLabel(step.dueDate)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="m-0 text-sm text-soft-ink">Everything in these plans is done.</p>}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
