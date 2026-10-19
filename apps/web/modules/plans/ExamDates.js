"use client";

import { useState } from "react";
import { OriginBadge } from "./DeadlineBadge";
import { daysUntil, dueLabel } from "./plan";
import { shortDate } from "./deadlines";
import { examOptionLabel, planableExamDates, sortExamDates } from "../accounts/examDates";
import { useT } from "../../lib/i18n/LocaleProvider.js";

const card = "rounded-[18px] border border-ink/8 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)]";
const kicker = "m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink";
const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-[var(--surface-soft)] disabled:opacity-50";
const primaryBtn = "inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[#0077ed] disabled:opacity-50";

/**
 * "Dates from my teachers": the exam dates a teacher or parent sent you, soonest first. Each can be planned for in one
 * click (the plan then carries that date as a locked deadline: it moves if they move it), or hidden.
 *
 * @param {object} props
 * @param {object[]} props.examDates `[{ id, title, date, subjectHint, notes, senderName, linkedPlanIds, dismissedAt }]`
 * @param {(examDate: object) => void} [props.onPlan] "Plan for it"
 * @param {(documentId: string) => void} [props.onOpenPlan] open a plan that already follows the date
 * @param {(examDate: object, hide: boolean) => void} [props.onDismiss] hide / bring back
 * @param {boolean} [props.showHidden] list the hidden ones too (the Study plans tab)
 * @param {string} [props.title]
 */
export function ExamDatesCard({ examDates = [], onPlan, onOpenPlan, onDismiss, showHidden = false, title = "", emptyHint = "" }) {
  const t = useT();
  title = title || t("plans.exam.title");
  const today = new Date().toISOString().slice(0, 10);
  const list = sortExamDates(examDates.filter((entry) => showHidden || !entry.dismissedAt), today);
  if (!list.length && !emptyHint) return null;
  return (
    <section className={card} aria-label={title}>
      <p className={kicker}>{title}</p>
      {!list.length ? <p className="m-0 mt-2 text-sm text-soft-ink">{emptyHint}</p> : (
        <ul className="m-0 mt-3 grid list-none gap-2 p-0">
          {list.map((entry) => {
            const days = daysUntil(entry.date);
            const past = entry.date < today;
            return (
              <li key={entry.id} className={`flex flex-wrap items-center gap-3 rounded-2xl border border-ink/10 p-3 ${entry.dismissedAt ? "opacity-60" : ""}`}>
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[var(--surface-soft)] text-center leading-tight" aria-hidden="true">
                  <span className="text-base font-bold text-ink">{Number(entry.date.slice(8, 10))}</span>
                  <span className="text-[10px] font-semibold uppercase text-soft-ink">{shortDate(entry.date, t).split(" ")[1] || ""}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-bold text-ink">{entry.title}</span>
                    <OriginBadge imposed by={entry.senderName} tooltip={t("plans.exam.setByTip", { by: entry.senderName || t("plans.origin.yourTeacher") })} />
                  </span>
                  <span className="block text-[11px] text-soft-ink">
                    {[entry.subjectHint, past ? t("plans.exam.passed") : days === 0 ? t("plans.exam.today") : days === 1 ? t("plans.exam.tomorrow") : dueLabel(entry.date, t)].filter(Boolean).join(" · ")}
                    {entry.linkedPlanIds?.length ?  ` · ${t.plural("plans.exam.follow", entry.linkedPlanIds.length)}` : ""}
                  </span>
                  {entry.notes ? <span className="mt-0.5 block text-xs text-ink [overflow-wrap:anywhere]">{entry.notes}</span> : null}
                </span>
                <span className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {entry.linkedPlanIds?.length && onOpenPlan ? <button type="button" className={ghostBtn} onClick={() => onOpenPlan(entry.linkedPlanIds[0])}>{t("plans.exam.openMine")}</button> : null}
                  {onPlan && !past ? <button type="button" className={entry.linkedPlanIds?.length ? ghostBtn : primaryBtn} onClick={() => onPlan(entry)}>{entry.linkedPlanIds?.length ? t("plans.exam.another") : t("plans.exam.planFor")}</button> : null}
                  {onDismiss ? <button type="button" className={ghostBtn} onClick={() => onDismiss(entry, !entry.dismissedAt)}>{entry.dismissedAt ? t("plans.exam.showAgain") : t("plans.exam.hide")}</button> : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * "Use a teacher's exam date": a dropdown of the upcoming dates sent to you. Choosing one fills the "Ready by" date and the
 * plan then carries that date as a locked deadline (`examDate` = the chosen row, or null for your own date).
 */
export function ExamDatePicker({ examDates = [], value = "", onChange, className = "" }) {
  const t = useT();
  const options = planableExamDates(examDates);
  if (!options.length) return null;
  return (
    <label className={`grid gap-1 text-xs font-semibold text-soft-ink ${className}`}>
      {t("plans.exam.use")}
      <select className="w-full rounded-xl border border-ink/12 bg-white px-3 py-2 text-sm text-ink" value={value} onChange={(event) => onChange(options.find((entry) => entry.id === event.target.value) || null)}>
        <option value="">{t("plans.exam.ownDate")}</option>
        {options.map((entry) => <option key={entry.id} value={entry.id}>{examOptionLabel(entry, (date) => shortDate(date, t))}</option>)}
      </select>
      {value ? <span className="text-[11px] font-normal text-soft-ink">{t("plans.exam.locked", { by: options.find((entry) => entry.id === value)?.senderName || t("plans.origin.yourTeacher") })}</span> : null}
    </label>
  );
}

/**
 * On an open plan: tie it to a teacher's exam date after the fact. (The server rewrites the plan with the locked
 * deadline.) Hidden when there is nothing to choose or the plan already follows every available date.
 */
export function PlanExamLink({ plan, examDates = [], onLink, busy = false }) {
  const t = useT();
  const [choice, setChoice] = useState("");
  const followed = new Set((plan.deadlines || []).map((deadline) => deadline.examDateId).filter(Boolean));
  const options = planableExamDates(examDates).filter((entry) => !followed.has(entry.id));
  if (!options.length || plan.receivedFrom) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-ink/20 p-2.5">
      <span className="text-xs font-semibold text-soft-ink">{t("plans.exam.tie")}</span>
      <select className="min-w-[10rem] flex-1 rounded-lg border border-ink/12 bg-white px-2 py-1 text-xs" value={choice} onChange={(event) => setChoice(event.target.value)} aria-label={t("plans.exam.aria")}>
        <option value="">{t("plans.exam.choose")}</option>
        {options.map((entry) => <option key={entry.id} value={entry.id}>{examOptionLabel(entry, (date) => shortDate(date, t))}</option>)}
      </select>
      <button type="button" className={ghostBtn} disabled={!choice || busy} onClick={async () => { await onLink(choice); setChoice(""); }}>{busy ? t("plans.exam.linking") : t("plans.exam.link")}</button>
    </div>
  );
}
