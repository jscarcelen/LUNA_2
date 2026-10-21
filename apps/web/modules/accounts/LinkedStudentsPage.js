"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PerformancePage } from "../performance/PerformancePage";
import { joinAttempts } from "../performance/metrics";
import { dueLabel, parsePlan, planProgress } from "../plans/plan";
import { PlanDeadlines } from "../plans/DeadlineBadge";
import { PlanFiles } from "../plans/PlanFiles";
import { planFiles } from "../plans/planFiles";
import { parseResource } from "../resources/resource";
import { ReaderView } from "../reader/ReaderView";
import { SubjectTabs } from "../ui/SubjectTabs";
import { accountsApi } from "./api";
import { ExamDatesTab } from "./ExamDatesTab";
import { MarkReviewsTab } from "./MarkReviewsTab";
import { MessagesTab } from "./MessagesTab";
import { SharingOverviewTab } from "./SharingOverviewTab";
import { GroupView } from "./GroupView";
import { GroupDots, GroupsBar, StudentGroupsMenu } from "./GroupsBar";
import { SetupNotice } from "./SetupNotice";
import { card, chip, ghostBtn, kicker } from "./ui";
import { childLabel, matchesChildName, nounWord } from "./nouns.js";
import { useT } from "../../lib/i18n/LocaleProvider.js";

const noop = async () => null;

/** A parent's right to a copy of a child's data (GDPR / COPPA). Erasing the account is NOT here: it lives in the danger zone at the bottom. */
function ChildDataControls({ student }) {
  const t = useT();
  return <a className={ghostBtn} href={`/api/accounts/data?studentId=${encodeURIComponent(student.id)}`} download>{t("people.ls.download")}</a>;
}

/** Erase a child's account: a dialog that names the child, asks for the name typed back and the parent's password. */
function DeleteChildDialog({ student, onClose, onErased }) {
  const t = useT();
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState({ busy: false, error: "" });
  const name = childLabel(student, t);
  const ready = matchesChildName(typed, student) && Boolean(password) && !state.busy;
  async function erase(event) {
    event.preventDefault();
    if (!ready) return;
    setState({ busy: true, error: "" });
    const result = await accountsApi.deleteAccount(password, student.id);
    if (result.ok) { onErased?.(student.id); onClose(); return; }
    setState({ busy: false, error: result.error });
  }
  return (
    <div className="tw-scope fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={state.busy ? undefined : onClose}>
      <form role="alertdialog" aria-modal="true" aria-label={t("people.ls.deleteAria", { name })} onSubmit={erase} className={`${card} grid w-full max-w-sm gap-3 p-5`} onClick={(event) => event.stopPropagation()}>
        <h3 className="m-0 text-lg font-bold text-ink">{t("people.ls.deleteTitle", { name })}</h3>
        <p className="m-0 text-sm text-soft-ink">{t("people.ls.deleteBody")}</p>
        <label className="grid gap-1 text-xs font-semibold text-soft-ink">{t("people.ls.typeA")} <span className="font-bold text-ink">{name}</span> {t("people.ls.typeB")}
          <input className="rounded-lg border border-ink/12 px-2 py-1.5 text-sm font-normal text-ink" value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-soft-ink">{t("people.ls.yourPassword")}
          <input type="password" autoComplete="current-password" className="rounded-lg border border-ink/12 px-2 py-1.5 text-sm font-normal text-ink" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {state.error ? <p role="alert" className="m-0 text-xs text-[var(--color-danger)]">{state.error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" className={ghostBtn} onClick={onClose} disabled={state.busy}>{t("common.cancel")}</button>
          <button type="submit" className={`${ghostBtn} !border-[var(--color-danger)] !bg-[var(--color-danger)] !text-white`} disabled={!ready}>{state.busy ? t("people.ls.deleting") : t("people.ls.deleteAccount")}</button>
        </div>
      </form>
    </div>
  );
}

/** The danger zone at the very bottom of a child's page, apart from everyday actions. */
function ChildDangerZone({ student, onErased }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-6 grid gap-2 rounded-[18px] border border-[var(--color-danger)]/30 p-4" aria-label={t("people.ls.danger")}>
      <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-danger)]">{t("people.ls.danger")}</p>
      <p className="m-0 text-sm text-soft-ink">{t("people.ls.erase", { name: childLabel(student, t) })}</p>
      <div><button type="button" className={`${ghostBtn} !text-[var(--color-danger)]`} onClick={() => setOpen(true)}>{t("people.ls.deleteBtn", { name: childLabel(student, t) })}</button></div>
      {open ? <DeleteChildDialog student={student} onClose={() => setOpen(false)} onErased={onErased} /> : null}
    </div>
  );
}

/**
 * A student's study plans, read-only: how far each is, what is next, what is late, who set each deadline, and the files
 * each plan uses. What Luna made opens in the reader; uploaded material comes here by name only (redactTreeForGuardian).
 * `allDocuments` is the whole workspace, because a plan's material can sit in another topic.
 */
function ReadOnlyPlans({ documents, allDocuments = documents, folders = [], studentName }) {
  const t = useT();
  const [reading, setReading] = useState(null); // { resource, document } opened from a plan's files
  const attempts = useMemo(() => joinAttempts(documents), [documents]);
  const plans = useMemo(() => documents.map((document) => ({ document, plan: parsePlan(document, { folders }) })).filter((row) => row.plan), [documents, folders]);
  if (!plans.length) return <p className={`${card} p-5 text-sm text-soft-ink`}>{t("people.ls.noPlans", { name: studentName })}</p>;
  const readable = (file) => (file.kind === "made" ? parseResource(file.document) : null);
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {plans.map(({ document, plan }) => {
        const progress = planProgress(plan, attempts);
        const isDone = (item) => Boolean(item.doneAt) || Boolean(item.resourceId && progress.scoreByResource.has(item.resourceId));
        return (
          <article key={document.id} className={`${card} grid gap-2 p-5`} style={{ borderTop: `4px solid ${plan.colour || "#0071e3"}` }}>
            <h4 className="m-0 truncate text-base font-bold text-ink">{plan.name}</h4>
            {/* Solid dark = a teacher or parent set it; outlined = the student's own. */}
            <PlanDeadlines plan={plan} ownLabel={t("people.gv.studentsOwn")} />
            <div className="h-1.5 overflow-hidden rounded-full bg-ink/8" aria-label={t("people.ls.pctDone", { pct: Math.round(progress.ratio * 100) })}><span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.round(progress.ratio * 100)}%` }} /></div>
            <div className="flex flex-wrap gap-1">
              <span className={`${chip} bg-[var(--surface-soft)] text-soft-ink`}>{t("people.ls.steps", { done: progress.done, total: progress.total })}</span>
              {progress.late.length ? <span className={`${chip} bg-[rgba(255,59,48,0.1)] text-[var(--color-danger)]`}>{t("people.ls.late", { count: progress.late.length })}</span> : null}
              {progress.average ? <span className={`${chip} bg-[#2f9e5b]/10 text-[#1d7a44]`}>{t("people.ls.avg", { pct: Math.round(progress.average * 100) })}</span> : null}
            </div>
            <ul className="m-0 grid list-none gap-1 p-0">
              {(plan.items || []).slice(0, 12).map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 text-xs text-ink">
                  <span className="min-w-0 truncate">{isDone(item) ? "✓ " : "○ "}{item.title}</span>
                  <span className="shrink-0 text-soft-ink">{isDone(item) && progress.scoreByResource.has(item.resourceId) ? `${Math.round(progress.scoreByResource.get(item.resourceId) * 100)}%` : item.dueDate ? dueLabel(item.dueDate, t) : ""}{item.ownDueDate ? ` · ${t("people.ls.own", { due: dueLabel(item.ownDueDate, t) })}` : ""}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 border-t border-ink/8 pt-3">
              <PlanFiles compact files={planFiles(plan, allDocuments, t)} canOpen={(file) => Boolean(readable(file))} onOpen={(file) => setReading({ resource: readable(file), document: file.document })} lockedHint={t("plans.files.nameOnly")} emptyText={t("plans.files.emptyReadOnly")} />
            </div>
          </article>
        );
      })}
      {reading ? <ReaderView resource={reading.resource} title={reading.resource?.name || ""} highlights={reading.resource?.highlights || []} onClose={() => setReading(null)} /> : null}
    </div>
  );
}

const tabButton = (active) => `rounded-full border px-3.5 py-1.5 text-xs font-semibold ${active ? "border-transparent bg-ink text-white" : "border-ink/15 bg-white text-soft-ink"}`;

/**
 * "My students" (teacher) / "My children" (parent): pick a connected student — a parent can have several — or a GROUP of
 * them, and read their performance and study plans. Everything here is read-only and comes from the students' own
 * accounts through an accepted connection; uploaded material and private notes are not shown, only their names.
 *
 *  - Groups bar: "All students", one chip per group, "+ New group"; a student can be in several groups. Choosing a group
 *    switches the view to the GROUP view (class panels fed by its members, comparison, plan table); clicking a student
 *    opens their individual view.
 *  - Tabs: Performance · Study plans · Sent · Exam dates (dates you send to groups or students; they plan for them).
 */
export function LinkedStudentsPage({ account, workspaces = [], onOpenPage, onOpenPlan, onOpenDocument, initialGroupId = "", initialTab = "", onSendQuestions }) {
  const t = useT();
  const [students, setStudents] = useState(null);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [error, setError] = useState("");
  const [groupId, setGroupId] = useState(initialGroupId);
  const [selectedId, setSelectedId] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState(() => (["performance", "access", "plans", "messages", "reviews", "exams"].includes(initialTab) ? initialTab : "performance"));
  const [sent, setSent] = useState([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [groups, setGroups] = useState([]);
  const [groupsSetup, setGroupsSetup] = useState(null);
  const [notice, setNotice] = useState("");
  const noun = account.role === "parent" ? "child" : "student";
  const reloadSent = useCallback(async () => {
    const result = await accountsApi.shared();
    if (result.ok) setSent(result.data.sent || []);
  }, []);

  useEffect(() => {
    let live = true;
    accountsApi.connections().then((result) => {
      if (!live) return;
      if (result.setupNeeded) { setSetupNeeded(true); return; }
      if (!result.ok) { setError(result.error); return; }
      // Only teacher/parent <-> student connections open a student's performance; a peer connection never does.
      const list = (result.data.connections.accepted || []).filter((row) => row.kind === "teacher_student" || row.kind === "parent_student").map((row) => row.other).filter((other) => other.role === "student" && other.id);
      setStudents(list);
      setSelectedId((current) => current || (initialGroupId ? "" : list[0]?.id || ""));
    });
    reloadSent();
    accountsApi.groups().then((result) => {
      if (!live) return;
      if (result.setupNeeded) { setGroupsSetup({ migration: result.migration || "" }); return; }
      if (result.ok) setGroups(result.data.groups || []);
    });
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

  const group = groups.find((entry) => entry.id === groupId) || null;
  // Only the students of the chosen group are listed (a group is only ever made of connected students).
  const shown = useMemo(() => (group && students ? students.filter((entry) => group.memberIds.includes(entry.id)) : students), [group, students]);
  const groupsOfStudent = useCallback((id) => groups.filter((entry) => entry.memberIds.includes(id)), [groups]);
  const student = students?.find((entry) => entry.id === selectedId) || null;
  const subject = data?.workspaces?.find((workspace) => workspace.id === workspaceId)?.subjects?.find((entry) => entry.id === subjectId) || null;
  const inGroupView = Boolean(group) && !selectedId;

  // Choosing a group shows the group view (no student selected); "All students" goes back to one student at a time.
  const selectGroup = (id) => { setGroupId(id); setSelectedId(id ? "" : (selectedId || students?.[0]?.id || "")); setError(""); };
  const openStudent = (id) => { setSelectedId(id); setError(""); };
  const onGroupsChanged = (next) => {
    setGroups(next.groups || []);
    // The group being looked at may have been deleted.
    if (groupId && !(next.groups || []).some((entry) => entry.id === groupId)) { setGroupId(""); setSelectedId((current) => current || students?.[0]?.id || ""); }
  };

  if (setupNeeded) return <section className="tw-scope grid gap-3"><SetupNotice /></section>;

  // "What … can see" replaces the old "Sent" list: it shows what was sent AND what was not, with the actions on each row.
  const studentName = student ? student.displayName || nounWord(noun, t) : "";
  const tabs = inGroupView
    ? [["performance", t("people.ls.tab.group")], ["access", t("classroom.tab.access", { name: group.name })], ["plans", t("people.ls.tab.plans")], ["messages", t("classroom.tab.messages")], ["exams", t("people.ls.tab.exams")]]
    : student ? [["performance", t("people.ls.tab.performance")], ["access", t("classroom.tab.access", { name: studentName })], ["plans", t("people.ls.tab.plans")], ["messages", t("classroom.tab.messages")], ["reviews", t("people.ls.tab.reviews")], ["exams", t("people.ls.tab.exams")]] : [["exams", t("people.ls.tab.exams")]];
  const connectedIds = (students || []).map((entry) => entry.id);
  const audience = inGroupView
    ? { kind: "group", ids: group.memberIds.filter((id) => connectedIds.includes(id)), name: group.name, groupId: group.id }
    : student ? { kind: "student", ids: [student.id], name: studentName } : null;

  return (
    <section className="tw-scope grid gap-3">
      <div className={`${card} grid gap-3 p-4`}>
        <p className={kicker}>{account.role === "parent" ? t("people.home.sc.children") : t("people.home.sc.students")}</p>
        {students === null ? <p className="m-0 text-sm text-soft-ink">{t("common.loading")}</p> : students.length ? (
          <>
            <GroupsBar groups={groups} students={students} groupId={groupId} onSelectGroup={selectGroup} onChanged={onGroupsChanged} setup={groupsSetup} noun={noun} />
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t("people.ls.choose", { noun: nounWord(noun, t) })}>
              {shown.map((entry) => (
                <button key={entry.id} type="button" role="tab" aria-selected={entry.id === selectedId} onClick={() => openStudent(entry.id)}
                  className={`inline-flex max-w-[14rem] items-center gap-1.5 truncate rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${entry.id === selectedId ? "border-transparent bg-ink text-white" : "border-ink/15 bg-white text-soft-ink hover:bg-[var(--surface-soft)]"}`}>
                  <span className="truncate">{entry.displayName || entry.email}</span>
                  <GroupDots groups={groupsOfStudent(entry.id)} />
                </button>
              ))}
              {group && !shown.length ? <span className="text-xs text-soft-ink">{t("people.ls.noneInGroup", { nouns: nounWord(noun, t, true) })}</span> : null}
            </div>
          </>
        ) : (
          <p className="m-0 text-sm text-soft-ink">
            {t("people.ls.noConnA", { nouns: nounWord(noun, t, true) })} <button type="button" className="font-semibold text-[var(--accent-ink)] underline" onClick={() => onOpenPage?.("connections")}>{t("people.ls.connections")}</button>{t("people.ls.noConnB")}
          </p>
        )}
      </div>

      {error ? <p className={`${card} p-4 text-sm text-[var(--color-danger)]`} role="alert">{error}</p> : null}
      {notice ? <p className="m-0 px-1 text-xs text-[var(--accent-ink)]" role="status">{notice}</p> : null}

      {students?.length && (student || inGroupView || tab === "exams") ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label={t("people.ls.view")}>
              {group && student ? <button type="button" className={ghostBtn} onClick={() => setSelectedId("")}>← {group.name}</button> : null}
              {tabs.map(([value, label]) => (
                <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={tabButton(tab === value)}>{label}</button>
              ))}
            </div>
            {student && tab !== "exams" ? (
              <span className="flex flex-wrap items-center gap-2 text-[11px] text-soft-ink">
                <StudentGroupsMenu key={student.id} student={student} groups={groups} memberOf={groupsOfStudent(student.id).map((entry) => entry.id)} onChanged={onGroupsChanged} noun={noun} />
                {t("people.ls.readOnly", { name: student.displayName || student.email })}
                <button type="button" className={ghostBtn} disabled={loading} onClick={() => loadStudent(selectedId)}>{loading ? t("common.loading") : t("people.gv.refresh")}</button>
                {account?.role === "parent" ? <ChildDataControls key={`data-${student.id}`} student={student} /> : null}
              </span>
            ) : null}
          </div>

          {tab === "plans" && audience && account?.role === "teacher" ? (
            <p className={`${card} m-0 flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-soft-ink`}>
              <span>{t("classroom.plansHint", { name: audience.name })}</span>
              <button type="button" className={ghostBtn} onClick={() => setTab("access")}>{t("classroom.plansHintBtn")}</button>
            </p>
          ) : null}
          {tab === "access" && audience ? (
            <SharingOverviewTab key={`access-${audience.kind}-${audience.groupId || audience.ids[0]}`} account={account} workspaces={workspaces} audience={audience} sent={sent} onSentChanged={reloadSent} onOpenPlan={onOpenPlan} onOpenDocument={onOpenDocument} />
          ) : tab === "messages" && audience ? (
            <MessagesTab key={`messages-${audience.kind}-${audience.groupId || audience.ids[0]}`} account={account} audience={audience} allIds={connectedIds} />
          ) : tab === "exams" ? (
            <ExamDatesTab account={account} groups={groups} students={students} workspaces={workspaces} scope={{ groupId: inGroupView ? groupId : "", studentId: student ? selectedId : "" }} noun={noun} onNotice={setNotice} />
          ) : inGroupView ? (
            <GroupView key={`${group.id}:${group.memberIds.join(",")}`} group={group} tab={tab} sent={sent} noun={noun} onOpenStudent={openStudent} />
          ) : (
            <>
              {loading && !data ? <p className={`${card} p-5 text-sm text-soft-ink`}>{t("people.ls.loadingWs", { name: student.displayName || nounWord(noun, t) })}</p> : null}

              {data && tab === "performance" ? (
                <PerformancePage
                  key={selectedId}
                  role="student"
                  viewer={account.role}
                  studentName={student.displayName || ""}
                  onSendQuestions={(action) => onSendQuestions?.(action, student)}
                  profileName={student.displayName || ""}
                  viewingStudentId={selectedId}
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
                  <ReadOnlyPlans documents={subject?.documents || []} allDocuments={(data.workspaces.find((workspace) => workspace.id === workspaceId)?.subjects || []).flatMap((entry) => entry.documents || [])} folders={subject?.folders || []} studentName={student.displayName || nounWord(noun, t)} />
                </div>
              ) : null}

              {tab === "reviews" && student ? <MarkReviewsTab key={`reviews-${student.id}`} student={student} canDecide={account?.role === "teacher"} /> : null}

            </>
          )}
          {account?.role === "parent" && student && tab !== "exams" && !inGroupView ? <ChildDangerZone key={`danger-${student.id}`} student={student} onErased={(id) => { setStudents((list) => (list || []).filter((entry) => entry.id !== id)); setSelectedId(""); }} /> : null}
        </>
      ) : null}
    </section>
  );
}
