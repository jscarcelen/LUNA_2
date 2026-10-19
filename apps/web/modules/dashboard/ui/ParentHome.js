"use client";

import { useEffect, useMemo, useState } from "react";
import { accountsApi } from "../../accounts/api";
import { weeklySummaryOf } from "../roleHome";
import { useConnectedStudents } from "./useLinkedMembers";
import { useT } from "../../../lib/i18n/LocaleProvider.js";

const card = "rounded-[18px] border border-ink/8 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)]";
const kicker = "m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink";
const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-[var(--surface-soft)]";
const TONE = { "on-track": "bg-[#1a7f37]", behind: "bg-[#d97706]", new: "bg-ink/30" };

function ChildCard({ student, onOpenPage }) {
  const t = useT();
  const [state, setState] = useState({ member: null, loading: true, error: "" });
  useEffect(() => {
    let live = true;
    accountsApi.studentWorkspaces(student.id).then((result) => {
      if (!live) return;
      if (!result.ok) { setState({ member: null, loading: false, error: result.error }); return; }
      setState({ member: { student, workspaces: result.data.workspaces || [] }, loading: false, error: "" });
    });
    return () => { live = false; };
  }, [student]);
  const summary = useMemo(() => (state.member ? weeklySummaryOf(state.member, {}, t) : null), [state.member, t]);
  const [help, setHelp] = useState(false);
  return (
    <article className={`${card} grid gap-3`} aria-label={t("people.home.childAria", { name: student.displayName || t("people.home.yourChild") })}>
      {state.loading ? <div className="h-24 animate-pulse rounded-xl bg-ink/5" aria-busy="true" /> : state.error ? <p className="m-0 text-sm text-[var(--color-danger)]" role="alert">{state.error}</p> : (
        <>
          <div className="flex items-start gap-3">
            <span aria-hidden className={`mt-2 size-3 shrink-0 rounded-full ${TONE[summary.status]}`} />
            <div className="min-w-0">
              <p className="m-0 text-2xl font-bold tracking-tight text-ink">{summary.headline}</p>
              <p className="m-0 mt-0.5 text-sm text-soft-ink">{summary.detail}</p>
            </div>
          </div>
          {summary.struggles.length ? (
            <div>
              <p className={kicker}>{t("people.home.struggles", { name: summary.firstName })}</p>
              <ul className="m-0 mt-1.5 grid list-none gap-1 p-0">
                {summary.struggles.map((topic) => <li key={topic.topic} className="flex items-baseline justify-between gap-2 text-sm text-ink"><span className="min-w-0 truncate font-semibold">{topic.topic}</span><span className="shrink-0 text-xs text-soft-ink">{topic.mastery}% · {topic.reason}</span></li>)}
              </ul>
            </div>
          ) : null}
          {summary.help ? (
            <div className="rounded-2xl bg-[var(--surface-soft)] p-3">
              <p className={kicker}>{t("people.home.oneWay")}</p>
              <p className="m-0 mt-1 text-sm text-ink">{summary.help.steps[0]}</p>
              <button type="button" className="mt-1.5 text-xs font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline" onClick={() => setHelp((value) => !value)} aria-expanded={help}>{help ? t("people.home.hide") : t("people.home.moreIdeas")}</button>
              {help ? <ul className="m-0 mt-1.5 grid list-none gap-1 p-0 text-sm text-ink">{summary.help.steps.slice(1).map((step) => <li key={step}>· {step}</li>)}</ul> : null}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={ghostBtn} onClick={() => onOpenPage?.("students")}>{t("people.home.seeProgress", { name: summary.firstName })}</button>
          </div>
        </>
      )}
    </article>
  );
}

/** Parent Home: "Your child this week". Read-only: no Start button and none of the child's tasks as the parent's own. */
export function ParentHome({ account = false, onOpenPage }) {
  const t = useT();
  const people = useConnectedStudents(account);
  return (
    <section className="tw-scope grid gap-5">
      <h2 className="m-0 text-[32px] font-bold tracking-tight text-ink">{t("people.home.childWeek")}</h2>
      {people.students === null ? (
        <div className="grid gap-3" aria-busy="true"><div className="h-32 animate-pulse rounded-[18px] bg-ink/5" /></div>
      ) : people.students.length ? (
        <div className="grid gap-4 lg:grid-cols-2">{people.students.map((student) => <ChildCard key={student.id} student={student} onOpenPage={onOpenPage} />)}</div>
      ) : (
        <div className={`${card} grid justify-items-start gap-2`}>
          <p className="m-0 text-2xl font-bold tracking-tight text-ink">{people.setupNeeded ? t("people.home.dbStep") : account ? t("people.home.connectChild") : t("people.home.childrenAccount")}</p>
          <p className="m-0 text-sm text-soft-ink">{account ? t("people.home.parentEmpty") : t("people.home.parentLogin")}</p>
          {account ? <button type="button" className="inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white" onClick={() => onOpenPage?.("connections")}>{t("people.home.connectMine")}</button> : null}
        </div>
      )}
    </section>
  );
}
