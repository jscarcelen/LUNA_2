"use client";

import { useMemo, useState } from "react";
import { planRowsOf, rankPlans } from "../dashboard/home";
import { joinAttempts } from "../performance/metrics";
import { deadlineText, dueText, planTasks, studyActivities } from "./model.js";
import { useT } from "../../lib/i18n/LocaleProvider.js";
import { Bar, ChipRow, Empty, MobileScreen, Segmented, Skeleton, TypeIcon, cardClass, secondaryClass } from "./ui.js";

/** A step's status in words, and the one action that goes with it. */
const STATUS = {
  todo: { label: "mobile.status.todo", action: "mobile.start" },
  started: { label: "mobile.status.started", action: "mobile.continue" },
  done: { label: "mobile.status.done", action: "mobile.open" }
};

function StatusDot({ status }) {
  if (status === "done") return <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-[#34c759] text-[13px] font-bold text-white">✓</span>;
  if (status === "started") return <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full border-2 border-[var(--accent)]"><span className="size-2.5 rounded-full bg-[var(--accent)]" /></span>;
  return <span aria-hidden className="size-6 shrink-0 rounded-full border-2 border-ink/20" />;
}

/**
 * Study on the phone: "For you" (activities to do, with the reason each is suggested, filterable by subject) and
 * "Study plan" (each plan as a list of steps with their status and one obvious Start / Continue). Tapping opens the
 * activity player or the reader directly; steps that still have to be made open the full plan, which makes them.
 */
export function MobileStudy({ workspace = null, loading = false, drafts = {}, initialView = "for-you", onOpen, onOpenPage }) {
  const t = useT();
  const [view, setView] = useState(initialView === "plan" ? "plan" : "for-you");
  const [subjectId, setSubjectId] = useState("");
  const subjects = workspace?.subjects || [];
  const activities = useMemo(() => studyActivities(workspace, { subjectId, drafts }, t), [workspace, subjectId, drafts, t]);
  const plans = useMemo(() => {
    const rows = planRowsOf(workspace);
    const documents = subjects.flatMap((subject) => subject.documents || []);
    const entries = rankPlans(rows, joinAttempts(documents), { limit: 50 });
    return planTasks(entries, rows, workspace, drafts, t);
  }, [workspace, drafts, t]);
  const [openDone, setOpenDone] = useState({});
  const documentById = (id) => subjects.flatMap((subject) => subject.documents || []).find((document) => document.id === id) || null;
  const subjectsWithWork = subjects.filter((subject) => (subject.documents || []).some((document) => (document.tags || []).includes("activity") || (document.tags || []).includes("resource")));

  function startStep(plan, step) {
    const document = step.resourceId ? documentById(step.resourceId) : null;
    if (document) onOpen?.(document, step.subjectId);
    else onOpenPage?.(`plans?open=${plan.planId}`);
  }

  return (
    <MobileScreen title={t("mobile.tab.study")} label={t("mobile.tab.study")}>
      <Segmented label={t("mobile.study.show")} options={[["for-you", t("mobile.study.forYou")], ["plan", t("mobile.study.plan")]]} value={view} onChange={setView} />
      {!workspace && loading ? <Skeleton rows={3} /> : null}

      {workspace && view === "for-you" ? (
        <div className="grid gap-4">
          {subjectsWithWork.length > 1 ? (
            <ChipRow label={t("mobile.subjects")} value={subjectId} onChange={setSubjectId} options={[["", t("mobile.all")], ...subjectsWithWork.map((subject) => [subject.id, subject.name])]} />
          ) : null}
          {activities.length ? (
            <div className="grid gap-3">
              {activities.map((row) => (
                <button key={row.documentId} type="button" className={`${cardClass} flex w-full items-start gap-3 p-4 text-left active:bg-[var(--surface-soft)]`} onClick={() => onOpen?.(documentById(row.documentId), row.subjectId)}>
                  <TypeIcon typeId={row.typeId} made />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-soft-ink">{[row.type, row.subjectName].filter(Boolean).join(" · ")}</span>
                    <span className="block text-[16px] font-semibold leading-snug text-ink [overflow-wrap:anywhere]">{row.title}</span>
                    {row.topics.length ? <span className="mt-0.5 block truncate text-[13px] text-soft-ink">{t("mobile.covers", { topics: row.topics.join(", ") })}</span> : null}
                    <span className={`mt-1 block text-[13px] ${row.days !== null && row.days < 0 && !row.attempts ? "font-semibold text-[var(--color-danger)]" : "text-ink"}`}>{row.reason}</span>
                    <span className="mt-0.5 block text-[12px] text-soft-ink">{t.plural(row.typeId === "flashcards" ? "mobile.count.cards" : "mobile.count.questions", row.questionCount)}</span>
                  </span>
                  <span aria-hidden className="mt-1 shrink-0 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[13px] font-semibold text-[var(--accent-ink)]">{row.draft ? t("mobile.continue") : row.attempts ? t("mobile.again") : t("mobile.start")}</span>
                </button>
              ))}
            </div>
          ) : (
            <Empty
              title={subjectId ? t("mobile.study.emptySubject") : t("mobile.study.empty")}
              text={t("mobile.study.emptyText")}
              actions={[{ label: t("mobile.makeQuiz"), onClick: () => onOpenPage?.("create") }, { label: t("mobile.upload"), onClick: () => onOpenPage?.("library?add=1") }]}
            />
          )}
          {activities.length ? <button type="button" className={`${secondaryClass} justify-self-center`} onClick={() => onOpenPage?.("create")}>{t("mobile.study.makeNew")}</button> : null}
        </div>
      ) : null}

      {workspace && view === "plan" ? (
        plans.length ? (
          <div className="grid gap-4">
            {plans.map((plan) => {
              const todo = plan.steps.filter((step) => step.status !== "done");
              const done = plan.steps.filter((step) => step.status === "done");
              const showDone = Boolean(openDone[plan.planId]);
              return (
                <article key={plan.planId} className={`${cardClass} overflow-hidden`}>
                  <header className="grid gap-2 p-4">
                    <div className="flex items-start gap-2">
                      <span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: plan.colour || "var(--accent)" }} />
                      <div className="min-w-0 flex-1">
                        <h2 className="m-0 text-[17px] font-semibold leading-snug text-ink [overflow-wrap:anywhere]">{plan.name}</h2>
                        <p className="m-0 text-[13px] text-soft-ink">{[plan.subjectName, plan.deadline ? deadlineText(plan.deadline, t) : ""].filter(Boolean).join(" · ")}</p>
                      </div>
                    </div>
                    {plan.total ? (
                      <div className="flex items-center gap-2">
                        <Bar value={(plan.done / plan.total) * 100} colour={plan.colour || "var(--accent)"} label={t("mobile.plan.doneOf", { done: plan.done, total: plan.total })} />
                        <span className="shrink-0 text-[12px] text-soft-ink">{t("mobile.plan.doneOf", { done: plan.done, total: plan.total })}</span>
                      </div>
                    ) : <p className="m-0 text-[13px] text-soft-ink">{t("mobile.plan.noSteps")}</p>}
                  </header>
                  {todo.length ? (
                    <ol className="m-0 list-none divide-y divide-ink/8 border-t border-ink/8 p-0">
                      {todo.map((step) => (
                        <li key={step.id} className="flex items-center gap-3 px-4 py-3">
                          <StatusDot status={step.status} />
                          <div className="min-w-0 flex-1">
                            <p className="m-0 text-[15px] font-semibold leading-snug text-ink [overflow-wrap:anywhere]">{step.title}</p>
                            <p className={`m-0 text-[13px] ${step.days !== null && step.days < 0 ? "font-semibold text-[var(--color-danger)]" : "text-soft-ink"}`}>{[t(STATUS[step.status].label), dueText(step.due, t)].filter(Boolean).join(" · ")}</p>
                          </div>
                          <button type="button" className={`min-h-[40px] shrink-0 rounded-full px-4 text-[14px] font-semibold ${step.status === "started" ? "bg-[var(--accent)] text-white" : "bg-[var(--accent-soft)] text-[var(--accent-ink)]"}`} onClick={() => startStep(plan, step)}>{t(STATUS[step.status].action)}</button>
                        </li>
                      ))}
                    </ol>
                  ) : plan.total ? <p className="m-0 border-t border-ink/8 px-4 py-3 text-[14px] text-soft-ink">{t("mobile.plan.allDone")}</p> : null}
                  {done.length ? (
                    <div className="border-t border-ink/8">
                      <button type="button" className="flex min-h-[44px] w-full items-center justify-between px-4 text-[14px] font-semibold text-soft-ink" aria-expanded={showDone} onClick={() => setOpenDone((previous) => ({ ...previous, [plan.planId]: !showDone }))}>
                        <span>{showDone ? t("mobile.plan.hideDone", { count: done.length }) : t("mobile.plan.showDone", { count: done.length })}</span>
                        <span aria-hidden>{showDone ? "▴" : "▾"}</span>
                      </button>
                      {showDone ? (
                        <ol className="m-0 list-none divide-y divide-ink/8 p-0">
                          {done.map((step) => (
                            <li key={step.id} className="flex items-center gap-3 px-4 py-2.5">
                              <StatusDot status="done" />
                              <p className="m-0 min-w-0 flex-1 truncate text-[15px] text-soft-ink">{step.title}</p>
                              {step.resourceId ? <button type="button" className="min-h-[36px] shrink-0 text-[14px] font-semibold text-[var(--accent)]" onClick={() => startStep(plan, step)}>{t("mobile.open")}</button> : null}
                            </li>
                          ))}
                        </ol>
                      ) : null}
                    </div>
                  ) : null}
                  <button type="button" className="flex min-h-[44px] w-full items-center justify-center border-t border-ink/8 text-[14px] font-semibold text-[var(--accent)]" onClick={() => onOpenPage?.(`plans?open=${plan.planId}`)}>{t("mobile.plan.openFull")}</button>
                </article>
              );
            })}
          </div>
        ) : (
          <Empty
            title={t("mobile.plan.empty")}
            text={t("mobile.plan.emptyText")}
            actions={[{ label: t("mobile.plan.planIt"), onClick: () => onOpenPage?.("plans?generate=1") }, { label: t("mobile.upload"), onClick: () => onOpenPage?.("library?add=1") }]}
          />
        )
      ) : null}
    </MobileScreen>
  );
}
