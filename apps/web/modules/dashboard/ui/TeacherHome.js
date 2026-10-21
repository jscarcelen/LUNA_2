"use client";

import { useMemo } from "react";
import { classCardOf, behindLine } from "../roleHome";
import { dueLabel } from "../../plans/plan";
import { classSpecs } from "./classSpecs";
import { useClassMembers, useConnectedStudents, useGroups } from "./useLinkedMembers";
import { useT } from "../../../lib/i18n/LocaleProvider.js";

const card = "rounded-[18px] border border-ink/8 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)]";
const kicker = "m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink";
const primaryBtn = "inline-flex w-full items-center justify-center rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0077ed] active:scale-[0.98] disabled:opacity-50 sm:w-auto";
const linkBtn = "text-xs font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline";

function ClassCard({ entry, onSendPractice, onOpenPage }) {
  const t = useT();
  const { members, loading, error } = useClassMembers(entry.spec, entry.key);
  const model = useMemo(() => classCardOf({ key: entry.key, name: entry.name, members }, t), [entry.key, entry.name, members, t]);
  const size = loading ? entry.recipientIds.length || undefined : model.size;
  return (
    <article className={`${card} grid gap-3`} aria-label={t("people.home.classAria", { name: entry.name })} style={entry.colour ? { borderTop: `4px solid ${entry.colour}` } : undefined}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="m-0 text-xl font-bold tracking-tight text-ink">{entry.name}</h3>
        <button type="button" className={linkBtn} onClick={() => onOpenPage?.(entry.id ? `students?group=${entry.id}` : "students")}>{t("people.home.openClass")}</button>
      </div>
      {loading ? <div className="h-16 animate-pulse rounded-xl bg-ink/5" aria-busy="true" /> : (
        <>
          <p className={`m-0 text-sm font-semibold ${model.behind.length ? "text-[var(--color-danger)]" : "text-ink"}`}>{model.headline}{size ? <span className="font-normal text-soft-ink"> · {t.plural("people.studentCount", size)}</span> : null}</p>
          {error ? <p className="m-0 text-xs text-[var(--color-danger)]" role="alert">{error}</p> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className={kicker}>{t("people.home.whoBehind")}</p>
              {model.behind.length ? (
                <ul className="m-0 mt-1.5 grid list-none gap-1 p-0">
                  {model.behind.slice(0, 3).map((entryBehind) => (
                    <li key={entryBehind.id} className="truncate text-sm text-ink"><button type="button" className="text-left font-semibold hover:underline" onClick={() => onOpenPage?.("students")}>{behindLine(entryBehind)}</button></li>
                  ))}
                  {model.behind.length > 3 ? <li className="text-xs text-soft-ink">{t("people.home.andMore", { count: model.behind.length - 3 })}</li> : null}
                </ul>
              ) : <p className="m-0 mt-1.5 text-sm text-soft-ink">{t("people.home.nobody")}</p>}
            </div>
            <div>
              <p className={kicker}>{t("people.home.dueWeek")}</p>
              {model.due.length ? (
                <ul className="m-0 mt-1.5 grid list-none gap-1 p-0">
                  {model.due.slice(0, 3).map((item) => (
                    <li key={item.key} className="flex items-baseline justify-between gap-2 text-sm text-ink"><span className="min-w-0 truncate">{item.title}</span><span className="shrink-0 text-xs text-soft-ink">{dueLabel(item.date, t)} · {t.plural("people.studentCount", item.students)}</span></li>
                  ))}
                </ul>
              ) : <p className="m-0 mt-1.5 text-sm text-soft-ink">{t("people.home.nothingDue")}</p>}
            </div>
          </div>
        </>
      )}
      <button type="button" className={primaryBtn} onClick={() => onSendPractice?.({ name: entry.name, groupIds: entry.groupIds, recipientIds: entry.recipientIds })}>{t("people.home.sendTo", { name: entry.name })}</button>
      {/* The two other everyday jobs for a class: write to it (and its parents), and check what it can open. */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <button type="button" className={linkBtn} onClick={() => onOpenPage?.(`students?${entry.id ? `group=${entry.id}&` : ""}tab=messages`)}>{t("classroom.home.message")}</button>
        <button type="button" className={linkBtn} onClick={() => onOpenPage?.(`students?${entry.id ? `group=${entry.id}&` : ""}tab=access`)}>{t("classroom.home.access")}</button>
      </div>
    </article>
  );
}

/** Teacher Home: "Your classes". */
export function TeacherHome({ account = false, onSendPractice, onOpenPage }) {
  const t = useT();
  const people = useConnectedStudents(account);
  const groups = useGroups(account);
  const specs = useMemo(() => (people.students === null || groups === null ? null : classSpecs(groups, people.students, t)), [people.students, groups, t]);
  return (
    <section className="tw-scope grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-[32px] font-bold tracking-tight text-ink">{t("people.home.yourClasses")}</h2>
        {/* Classes, students, groups and join codes are all managed on one page. */}
        {account ? <button type="button" className="inline-flex items-center gap-2 rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-[var(--surface-soft)]" onClick={() => onOpenPage?.("connections")}><span aria-hidden className="text-[var(--accent)]">👥</span>{t("classes.manage")}</button> : null}
      </div>
      {specs === null ? (
        <div className="grid gap-3" aria-busy="true">{[0, 1].map((index) => <div key={index} className="h-40 animate-pulse rounded-[18px] bg-ink/5" />)}</div>
      ) : specs.length ? (
        <div className="grid gap-4 lg:grid-cols-2">{specs.map((entry) => <ClassCard key={entry.key} entry={entry} onSendPractice={onSendPractice} onOpenPage={onOpenPage} />)}</div>
      ) : (
        <div className={`${card} grid justify-items-start gap-2`}>
          <p className="m-0 text-2xl font-bold tracking-tight text-ink">{people.setupNeeded ? t("people.home.dbStep") : account ? t("people.home.connectStudents") : t("people.home.classesAccount")}</p>
          <p className="m-0 text-sm text-soft-ink">{account ? t("people.home.teacherEmpty") : t("people.home.teacherLogin")}</p>
          {account ? <button type="button" className={`${primaryBtn} mt-1`} onClick={() => onOpenPage?.("connections")}>{t("people.home.connectBtn")}</button> : null}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3" aria-label={t("people.home.shortcuts")}>
        {[{ id: "upload", label: t("people.home.sc.upload"), target: "workspaces", icon: "⤒" }, { id: "make", label: t("people.home.sc.make"), target: "create", icon: "✎" }, { id: "students", label: t("people.home.sc.students"), target: "students", icon: "☺" }].map((shortcut) => (
          <button key={shortcut.id} type="button" className="flex items-center gap-3 rounded-2xl border border-ink/10 bg-white px-4 py-3 text-left text-sm font-semibold text-ink transition hover:bg-[var(--surface-soft)]" onClick={() => onOpenPage?.(shortcut.target)}>
            <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-base text-[var(--accent)]">{shortcut.icon}</span>
            {shortcut.label}
          </button>
        ))}
      </div>
    </section>
  );
}
