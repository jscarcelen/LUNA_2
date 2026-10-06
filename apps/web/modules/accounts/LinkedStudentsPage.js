"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PerformancePage } from "../performance/PerformancePage";
import { joinAttempts } from "../performance/metrics";
import { dueLabel, parsePlan, planProgress } from "../plans/plan";
import { SubjectTabs } from "../ui/SubjectTabs";
import { accountsApi } from "./api";
import { SetupNotice } from "./SetupNotice";
import { card, chip, ghostBtn, kicker } from "./ui";

const noop = async () => null;

/** A student's study plans, read-only: how far each is, what is next, what is late. */
function ReadOnlyPlans({ documents, studentName }) {
  const attempts = useMemo(() => joinAttempts(documents), [documents]);
  const plans = useMemo(() => documents.map((document) => ({ document, plan: parsePlan(document) })).filter((row) => row.plan), [documents]);
  if (!plans.length) return <p className={`${card} p-5 text-sm text-soft-ink`}>{studentName} has no study plans in this topic yet.</p>;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {plans.map(({ document, plan }) => {
        const progress = planProgress(plan, attempts);
        const isDone = (item) => Boolean(item.doneAt) || Boolean(item.resourceId && progress.scoreByResource.has(item.resourceId));
        return (
          <article key={document.id} className={`${card} grid gap-2 p-5`} style={{ borderTop: `4px solid ${plan.colour || "#0071e3"}` }}>
            <h4 className="m-0 truncate text-base font-bold text-ink">{plan.name}</h4>
            <p className="m-0 text-xs text-soft-ink">{progress.deadline ? `${progress.deadline.title} · ${dueLabel(progress.deadline.date)}` : "No deadline"}</p>
            <div className="h-1.5 overflow-hidden rounded-full bg-ink/8" aria-label={`${Math.round(progress.ratio * 100)}% done`}><span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.round(progress.ratio * 100)}%` }} /></div>
            <div className="flex flex-wrap gap-1">
              <span className={`${chip} bg-[var(--surface-soft)] text-soft-ink`}>{progress.done}/{progress.total} steps</span>
              {progress.late.length ? <span className={`${chip} bg-[rgba(255,59,48,0.1)] text-[var(--color-danger)]`}>{progress.late.length} late</span> : null}
              {progress.average ? <span className={`${chip} bg-[#2f9e5b]/10 text-[#1d7a44]`}>avg {Math.round(progress.average * 100)}%</span> : null}
            </div>
            <ul className="m-0 grid list-none gap-1 p-0">
              {(plan.items || []).slice(0, 12).map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 text-xs text-ink">
                  <span className="min-w-0 truncate">{isDone(item) ? "✓ " : "○ "}{item.title}</span>
                  <span className="shrink-0 text-soft-ink">{isDone(item) && progress.scoreByResource.has(item.resourceId) ? `${Math.round(progress.scoreByResource.get(item.resourceId) * 100)}%` : item.dueDate ? dueLabel(item.dueDate) : ""}</span>
                </li>
              ))}
            </ul>
          </article>
        );
      })}
    </div>
  );
}

/**
 * "My students" (teacher) / "My children" (parent): pick a connected student — a parent can have several —
 * and read their performance and study plans. Everything here is read-only and comes from the student's
 * own account through an accepted connection; uploaded material and private notes are not shown, only
 * their names.
 */
export function LinkedStudentsPage({ account, onOpenPage }) {
  const [students, setStudents] = useState(null);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("performance");
  const [sent, setSent] = useState([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const noun = account.role === "parent" ? "child" : "student";

  useEffect(() => {
    let live = true;
    accountsApi.connections().then((result) => {
      if (!live) return;
      if (result.setupNeeded) { setSetupNeeded(true); return; }
      if (!result.ok) { setError(result.error); return; }
      // Only teacher/parent <-> student connections open a student's performance; a peer connection never does.
      const list = (result.data.connections.accepted || []).filter((row) => row.kind === "teacher_student" || row.kind === "parent_student").map((row) => row.other).filter((other) => other.role === "student" && other.id);
      setStudents(list);
      setSelectedId((current) => current || list[0]?.id || "");
    });
    accountsApi.shared().then((result) => { if (live && result.ok) setSent(result.data.sent || []); });
    return () => { live = false; };
  }, []);

  const loadStudent = useCallback(async (id) => {
    if (!id) { setData(null); return; }
    setLoading(true);
    setError("");
    const result = await accountsApi.studentWorkspaces(id);
    setLoading(false);
    if (result.setupNeeded) { setSetupNeeded(true); return; }
    if (!result.ok) { setData(null); setError(result.error); return; }
    setData(result.data);
    const first = result.data.workspaces?.[0];
    setWorkspaceId(first?.id || "");
    setSubjectId(first?.subjects?.[0]?.id || "");
  }, []);
  useEffect(() => { loadStudent(selectedId); }, [selectedId, loadStudent]);

  const student = students?.find((entry) => entry.id === selectedId) || null;
  const subject = data?.workspaces?.find((workspace) => workspace.id === workspaceId)?.subjects?.find((entry) => entry.id === subjectId) || null;
  const sentToStudent = sent.filter((item) => item.recipient.id === selectedId);

  if (setupNeeded) return <section className="tw-scope grid gap-3"><SetupNotice /></section>;

  return (
    <section className="tw-scope grid gap-3">
      <div className={`${card} p-4`}>
        <p className={kicker}>{account.role === "parent" ? "My children" : "My students"}</p>
        {students === null ? <p className="m-0 mt-1 text-sm text-soft-ink">Loading…</p> : students.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5" role="tablist" aria-label={`Choose a ${noun}`}>
            {students.map((entry) => (
              <button key={entry.id} type="button" role="tab" aria-selected={entry.id === selectedId} onClick={() => setSelectedId(entry.id)}
                className={`inline-flex max-w-[14rem] items-center truncate rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${entry.id === selectedId ? "border-transparent bg-ink text-white" : "border-ink/15 bg-white text-soft-ink hover:bg-[var(--surface-soft)]"}`}>
                <span className="truncate">{entry.displayName || entry.email}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="m-0 mt-1 text-sm text-soft-ink">
            No connected {noun}s yet. Send a request from <button type="button" className="font-semibold text-[var(--accent-ink)] underline" onClick={() => onOpenPage?.("connections")}>Connections</button>; once they accept you can follow their work here.
          </p>
        )}
      </div>

      {error ? <p className={`${card} p-4 text-sm text-[var(--color-danger)]`} role="alert">{error}</p> : null}

      {student ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1.5" role="tablist" aria-label="View">
              {[["performance", "Performance"], ["plans", "Study plans"], ["sent", `Sent to ${student.displayName || noun}`]].map(([value, label]) => (
                <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold ${tab === value ? "border-transparent bg-ink text-white" : "border-ink/15 bg-white text-soft-ink"}`}>{label}</button>
              ))}
            </div>
            <span className="flex items-center gap-2 text-[11px] text-soft-ink">
              Read-only view of {student.displayName || student.email}’s work · uploaded material and private notes are not shown
              <button type="button" className={ghostBtn} disabled={loading} onClick={() => loadStudent(selectedId)}>{loading ? "Loading…" : "Refresh"}</button>
            </span>
          </div>

          {loading && !data ? <p className={`${card} p-5 text-sm text-soft-ink`}>Loading {student.displayName || noun}’s workspace…</p> : null}

          {data && tab === "performance" ? (
            <PerformancePage
              key={selectedId}
              role="student"
              profileName={student.displayName || ""}
              workspaces={data.workspaces}
              selectedWorkspaceId={workspaceId}
              selectedSubjectId={subjectId}
              onSaveGeneratedQuizDocument={noop}
              onRemoveDocument={noop}
              onOpenPage={() => {}}
              onSelectSubject={setSubjectId}
            />
          ) : null}

          {data && tab === "plans" ? (
            <div className="grid gap-3">
              <SubjectTabs workspaces={data.workspaces} selectedWorkspaceId={workspaceId} selectedSubjectId={subjectId} onSelectSubject={setSubjectId} />
              <ReadOnlyPlans documents={subject?.documents || []} studentName={student.displayName || noun} />
            </div>
          ) : null}

          {tab === "sent" ? (
            <div className={`${card} p-5`}>
              <p className={kicker}>What you sent</p>
              {sentToStudent.length ? (
                <ul className="m-0 mt-2 grid list-none gap-1.5 p-0">
                  {sentToStudent.map((item) => (
                    <li key={item.id} className="rounded-xl border border-ink/10 px-3 py-2">
                      <span className="block truncate text-sm font-semibold text-ink">{item.title}</span>
                      <span className="block text-[11px] text-soft-ink">{item.mode === "assign" ? "Assigned" : "Shared"}{item.dueDate ? ` · due ${dueLabel(item.dueDate)}` : ""}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="m-0 mt-2 text-sm text-soft-ink">Nothing yet. Use “Share with…” on a document in Workspaces, or on a study plan in Study plans, to send or assign work.</p>}
              <button type="button" className={`${ghostBtn} mt-3`} onClick={() => onOpenPage?.("workspaces")}>Open Workspaces</button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
