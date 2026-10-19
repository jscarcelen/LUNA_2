"use client";

import { useMemo } from "react";
import { classCardOf, behindLine } from "../roleHome";
import { dueLabel } from "../../plans/plan";
import { classSpecs } from "./classSpecs";
import { useClassMembers, useConnectedStudents, useGroups } from "./useLinkedMembers";

const card = "rounded-[18px] border border-ink/8 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)]";
const kicker = "m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink";
const primaryBtn = "inline-flex w-full items-center justify-center rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0077ed] active:scale-[0.98] disabled:opacity-50 sm:w-auto";
const linkBtn = "text-xs font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline";

function ClassCard({ entry, onSendPractice, onOpenPage }) {
  const { members, loading, error } = useClassMembers(entry.spec, entry.key);
  const model = useMemo(() => classCardOf({ key: entry.key, name: entry.name, members }), [entry.key, entry.name, members]);
  const size = loading ? entry.recipientIds.length || undefined : model.size;
  return (
    <article className={`${card} grid gap-3`} aria-label={`Class ${entry.name}`} style={entry.colour ? { borderTop: `4px solid ${entry.colour}` } : undefined}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="m-0 text-xl font-bold tracking-tight text-ink">{entry.name}</h3>
        <button type="button" className={linkBtn} onClick={() => onOpenPage?.(entry.id ? `students?group=${entry.id}` : "students")}>Open class</button>
      </div>
      {loading ? <div className="h-16 animate-pulse rounded-xl bg-ink/5" aria-busy="true" /> : (
        <>
          <p className={`m-0 text-sm font-semibold ${model.behind.length ? "text-[var(--color-danger)]" : "text-ink"}`}>{model.headline}{size ? <span className="font-normal text-soft-ink"> · {size} {size === 1 ? "student" : "students"}</span> : null}</p>
          {error ? <p className="m-0 text-xs text-[var(--color-danger)]" role="alert">{error}</p> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className={kicker}>Who is behind</p>
              {model.behind.length ? (
                <ul className="m-0 mt-1.5 grid list-none gap-1 p-0">
                  {model.behind.slice(0, 3).map((entryBehind) => (
                    <li key={entryBehind.id} className="truncate text-sm text-ink"><button type="button" className="text-left font-semibold hover:underline" onClick={() => onOpenPage?.("students")}>{behindLine(entryBehind)}</button></li>
                  ))}
                  {model.behind.length > 3 ? <li className="text-xs text-soft-ink">and {model.behind.length - 3} more</li> : null}
                </ul>
              ) : <p className="m-0 mt-1.5 text-sm text-soft-ink">Nobody right now.</p>}
            </div>
            <div>
              <p className={kicker}>Due this week</p>
              {model.due.length ? (
                <ul className="m-0 mt-1.5 grid list-none gap-1 p-0">
                  {model.due.slice(0, 3).map((item) => (
                    <li key={item.key} className="flex items-baseline justify-between gap-2 text-sm text-ink"><span className="min-w-0 truncate">{item.title}</span><span className="shrink-0 text-xs text-soft-ink">{dueLabel(item.date)} · {item.students} {item.students === 1 ? "student" : "students"}</span></li>
                  ))}
                </ul>
              ) : <p className="m-0 mt-1.5 text-sm text-soft-ink">Nothing due.</p>}
            </div>
          </div>
        </>
      )}
      <button type="button" className={primaryBtn} onClick={() => onSendPractice?.({ name: entry.name, groupIds: entry.groupIds, recipientIds: entry.recipientIds })}>Send practice to {entry.name}…</button>
    </article>
  );
}

/** Teacher Home: "Your classes". */
export function TeacherHome({ account = false, onSendPractice, onOpenPage }) {
  const people = useConnectedStudents(account);
  const groups = useGroups(account);
  const specs = useMemo(() => (people.students === null || groups === null ? null : classSpecs(groups, people.students)), [people.students, groups]);
  return (
    <section className="tw-scope grid gap-5">
      <h2 className="m-0 text-[32px] font-bold tracking-tight text-ink">Your classes</h2>
      {specs === null ? (
        <div className="grid gap-3" aria-busy="true">{[0, 1].map((index) => <div key={index} className="h-40 animate-pulse rounded-[18px] bg-ink/5" />)}</div>
      ) : specs.length ? (
        <div className="grid gap-4 lg:grid-cols-2">{specs.map((entry) => <ClassCard key={entry.key} entry={entry} onSendPractice={onSendPractice} onOpenPage={onOpenPage} />)}</div>
      ) : (
        <div className={`${card} grid justify-items-start gap-2`}>
          <p className="m-0 text-2xl font-bold tracking-tight text-ink">{people.setupNeeded ? "Accounts need one database step" : account ? "Connect your students" : "Classes live in your account"}</p>
          <p className="m-0 text-sm text-soft-ink">{account ? "Add your students by email. Once they accept, each class shows who is behind and what is due this week, and you can send them practice in one tap." : "Log in with a teacher account to connect students and see your classes here."}</p>
          {account ? <button type="button" className={`${primaryBtn} mt-1`} onClick={() => onOpenPage?.("connections")}>Connect students</button> : null}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3" aria-label="Shortcuts">
        {[{ id: "upload", label: "Upload material", target: "workspaces", icon: "⤒" }, { id: "make", label: "Make a quiz", target: "create", icon: "✎" }, { id: "students", label: "My students", target: "students", icon: "☺" }].map((shortcut) => (
          <button key={shortcut.id} type="button" className="flex items-center gap-3 rounded-2xl border border-ink/10 bg-white px-4 py-3 text-left text-sm font-semibold text-ink transition hover:bg-[var(--surface-soft)]" onClick={() => onOpenPage?.(shortcut.target)}>
            <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-base text-[var(--accent)]">{shortcut.icon}</span>
            {shortcut.label}
          </button>
        ))}
      </div>
    </section>
  );
}
