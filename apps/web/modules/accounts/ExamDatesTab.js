"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { accountsApi } from "./api";
import { examPlanStatus } from "./groupData";
import { selectionStats, summaryLine } from "./groups";
import { MemberPicker } from "./GroupsBar";
import { GROUPS_MIGRATION, SetupNotice } from "./SetupNotice";
import { classifyDeliverable } from "./shared";
import { card, dangerBtn, field, ghostBtn, kicker, primaryBtn } from "./ui";
import { dueLabel } from "../plans/plan";
import { shortDate } from "../plans/deadlines";
import { useT } from "../../lib/i18n/LocaleProvider.js";
import { askConfirm } from "../ui/dialogs.js";

const who = (person) => person.displayName || person.email;
const nounKey = (noun) => (noun === "child" ? "child" : "student");

/** The teacher's own plans and materials that can be shared together with an exam date (never received copies or private notes). */
function shareableDocuments(workspaces = []) {
  const out = [];
  for (const workspace of workspaces) {
    for (const subject of workspace.subjects || []) {
      for (const document of subject.documents || []) {
        if (!classifyDeliverable(document, "share").ok) continue;
        if (document.shared) continue;
        out.push({ id: document.id, name: document.name, plan: (document.tags || []).includes("study-plan"), subject: subject.name });
      }
    }
  }
  return out.sort((a, b) => Number(b.plan) - Number(a.plan) || a.name.localeCompare(b.name));
}

/**
 * Send an exam date (title, date, subject/topic name, notes) to groups and students, optionally sharing a study plan
 * or material with it; or edit one already sent (everyone who got it, and the plans that follow it, move with it).
 */
function ExamDateDialog({ mode, initial, groups, students, workspaces, scope, noun, onClose, onDone }) {
  const t = useT();
  const nouns = t(`dialogs.exam.nouns.${nounKey(noun)}`);
  const [form, setForm] = useState({ title: initial?.title || "", date: initial?.date || "", subjectHint: initial?.subjectHint || "", notes: initial?.notes || "" });
  const [groupIds, setGroupIds] = useState(scope?.groupId ? [scope.groupId] : []);
  const [studentIds, setStudentIds] = useState(scope?.studentId ? [scope.studentId] : []);
  const [documentId, setDocumentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState(null);
  const documents = useMemo(() => shareableDocuments(workspaces), [workspaces]);
  const groupMap = useMemo(() => new Map(groups.map((group) => [group.id, { name: group.name, memberIds: group.memberIds }])), [groups]);
  const stats = useMemo(() => selectionStats({ groupIds, individualIds: studentIds, groups: groupMap }, t), [groupIds, studentIds, groupMap]);

  async function submit() {
    setBusy(true);
    setError("");
    const result = mode === "edit"
      ? await accountsApi.updateExamDate(initial.batchId, form)
      : await accountsApi.sendExamDate({ ...form, groupIds, recipientIds: studentIds, shareDocumentId: documentId });
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    if (mode === "edit") { onDone?.(result.data.plansUpdated ? t.plural("dialogs.exam.updatedPlans", result.data.plansUpdated) : t("dialogs.exam.updated")); onClose(); return; }
    setOutcome(result.data);
    onDone?.(t("dialogs.exam.sent", { title: form.title, summary: summaryLine(result.data.summary, t) }));
  }

  return (
    <div className="tw-scope fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={mode === "edit" ? t("dialogs.exam.edit") : t("dialogs.exam.send")} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-[0_24px_64px_rgba(0,0,0,0.25)]" onClick={(event) => event.stopPropagation()}>
        <p className={kicker}>{mode === "edit" ? t("dialogs.exam.edit") : t("dialogs.exam.send")}</p>
        {outcome ? (
          <div className="mt-3 grid gap-2">
            <p className="m-0 text-sm font-semibold text-ink">{summaryLine(outcome.summary, t)}.</p>
            {outcome.shared?.error ? <p className="m-0 text-xs text-[var(--color-danger)]">{t("dialogs.exam.planNotShared", { error: outcome.shared.error })}</p> : outcome.shared?.itemName ? <p className="m-0 text-xs text-soft-ink">{t("dialogs.exam.planShared", { name: outcome.shared.itemName })}</p> : null}
            {outcome.results.filter((entry) => !entry.ok || entry.alreadyHadIt).length ? (
              <ul className="m-0 grid list-none gap-0.5 p-0 text-xs text-soft-ink">
                {outcome.results.filter((entry) => !entry.ok || entry.alreadyHadIt).slice(0, 12).map((entry) => <li key={entry.recipientId}>{who(students.find((student) => student.id === entry.recipientId) || { displayName: "", email: entry.recipientId })}: {entry.alreadyHadIt ? t("dialogs.exam.alreadyHad") : entry.reason === "not_connected" ? t("dialogs.exam.notConnected") : t("dialogs.exam.failed")}</li>)}
              </ul>
            ) : null}
            <div className="flex justify-end"><button type="button" className={primaryBtn} onClick={onClose}>{t("common.done")}</button></div>
          </div>
        ) : (
          <div className="mt-3 grid gap-3">
            <label className="grid gap-1 text-xs font-semibold text-soft-ink">{t("dialogs.exam.title")}<input autoFocus className={field} maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder={t("dialogs.exam.titlePh")} /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-semibold text-soft-ink">{t("dialogs.exam.date")}<input type="date" className={field} value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
              <label className="grid gap-1 text-xs font-semibold text-soft-ink">{t("dialogs.exam.subject")}<input className={field} maxLength={80} value={form.subjectHint} onChange={(event) => setForm({ ...form, subjectHint: event.target.value })} placeholder={t("dialogs.exam.subjectPh")} /></label>
            </div>
            <label className="grid gap-1 text-xs font-semibold text-soft-ink">{t("dialogs.exam.notes")}<textarea className={field} rows={2} maxLength={500} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder={t("dialogs.exam.notesPh")} /></label>

            {mode === "send" ? (
              <>
                <div>
                  <p className={`${kicker} mb-1.5`}>{t("dialogs.exam.who")}</p>
                  {groups.length ? (
                    <div className="mb-2 grid gap-1">
                      {groups.map((group) => (
                        <label key={group.id} className="flex cursor-pointer items-center gap-2 rounded-xl border border-ink/10 px-3 py-1.5 text-sm">
                          <input type="checkbox" checked={groupIds.includes(group.id)} onChange={() => setGroupIds((current) => (current.includes(group.id) ? current.filter((id) => id !== group.id) : [...current, group.id]))} />
                          <span className="size-2 shrink-0 rounded-full" style={{ background: group.colour }} />
                          <span className="min-w-0 flex-1 truncate font-semibold text-ink">{group.name}</span>
                          <span className="text-[11px] text-soft-ink">{t.plural(`dialogs.exam.count.${nounKey(noun)}`, group.memberCount)}</span>
                        </label>
                      ))}
                    </div>
                  ) : null}
                  <p className="m-0 mb-1 text-[11px] font-semibold text-soft-ink">{groups.length ? t("dialogs.exam.andIndividual", { nouns }) : t("dialogs.exam.individual", { nouns })}</p>
                  <MemberPicker students={students} selectedIds={studentIds} onChange={setStudentIds} />
                  <p className="m-0 mt-1.5 text-xs text-ink" role="status">{stats.people ? `${stats.line || t.plural("dialogs.share.people", stats.people)} · ${t.plural("dialogs.share.total", stats.people)}` : t("dialogs.exam.choose")}</p>
                </div>
                {documents.length ? (
                  <label className="grid gap-1 text-xs font-semibold text-soft-ink">{t("dialogs.exam.alsoShare")}
                    <select className={field} value={documentId} onChange={(event) => setDocumentId(event.target.value)}>
                      <option value="">{t("dialogs.exam.nothing")}</option>
                      {documents.some((entry) => entry.plan) ? <optgroup label={t("dialogs.exam.studyPlans")}>{documents.filter((entry) => entry.plan).map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {entry.subject}</option>)}</optgroup> : null}
                      <optgroup label={t("dialogs.exam.material")}>{documents.filter((entry) => !entry.plan).slice(0, 200).map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {entry.subject}</option>)}</optgroup>
                    </select>
                  </label>
                ) : null}
              </>
            ) : <p className="m-0 text-[11px] text-soft-ink">{t("dialogs.exam.changeNote")}</p>}

            {error ? <p className="m-0 text-xs text-[var(--color-danger)]" role="alert">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <button type="button" className={ghostBtn} onClick={onClose}>{t("common.cancel")}</button>
              <button type="button" className={primaryBtn} disabled={busy || !form.title.trim() || !form.date || (mode === "send" && !stats.people)} onClick={submit}>{busy ? t("dialogs.notice.sending") : mode === "edit" ? t("common.save") : t("dialogs.exam.sendBtn")}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * "Exam dates" in My students: the dates you sent, per group / student, with edit and cancel, and who has planned for each
 * one (a plan linked to the date, and how far along it is, read through the same link-authorised performance route).
 */
export function ExamDatesTab({ account, groups, students, workspaces, scope, noun, onNotice }) {
  const t = useT();
  const nouns = t(`dialogs.exam.nouns.${nounKey(noun)}`);
  const [items, setItems] = useState(null);
  const [setup, setSetup] = useState(null);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState(null); // { mode: "send" } | { mode: "edit", item }
  const [open, setOpen] = useState("");
  const [progress, setProgress] = useState({}); // batchId -> { loading, done, byStudent: { id: { planned, ratio, name } } }
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    const result = await accountsApi.examDates();
    if (result.setupNeeded) { setSetup({ migration: result.migration }); return; }
    if (!result.ok) { setError(result.error); return; }
    if (result.data.supported === false) { setSetup({ migration: "" }); return; }
    setItems(result.data.items || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  /** Reads the planned recipients' workspaces a page at a time and computes how far each plan has got. */
  async function checkProgress(item) {
    const ids = item.recipients.filter((entry) => entry.planned && entry.connected).map((entry) => entry.id);
    setProgress((current) => ({ ...current, [item.batchId]: { loading: true, byStudent: {} } }));
    const byStudent = {};
    let offset = 0;
    for (;;) {
      const page = await accountsApi.groupMembers({ studentIds: ids, offset, limit: 10 });
      if (!page.ok) { setError(page.error); break; }
      for (const member of page.data.members || []) {
        const recipient = item.recipients.find((entry) => entry.id === member.student.id);
        byStudent[member.student.id] = examPlanStatus(member, recipient?.examDateId || "");
      }
      if (!page.data.hasMore) break;
      offset = page.data.nextOffset;
    }
    setProgress((current) => ({ ...current, [item.batchId]: { loading: false, byStudent } }));
  }

  async function cancel(item) {
    if (!(await askConfirm({ message: t("dialogs.exam.confirmCancel", { title: item.title, nouns }), confirmLabel: t("dialogs.exam.cancelIt"), cancelLabel: t("common.keep"), danger: true }))) return;
    setBusyId(item.batchId);
    const result = await accountsApi.cancelExamDate(item.batchId);
    setBusyId("");
    if (!result.ok) { setError(result.error); return; }
    setItems(result.data.items || []);
    onNotice?.(`${t("dialogs.exam.cancelled", { title: item.title })}${result.data.plansUpdated ? ` ${t.plural("dialogs.exam.plansKept", result.data.plansUpdated)}` : ""}`);
  }

  if (setup) return <div className={`${card} p-5`}><SetupNotice compact migration={setup.migration || GROUPS_MIGRATION} title={t("dialogs.exam.dbStep")} /></div>;

  const visible = (items || []).filter((item) => {
    if (scope?.groupId) { const group = groups.find((entry) => entry.id === scope.groupId); return item.recipients.some((entry) => group?.memberIds.includes(entry.id)); }
    if (scope?.studentId) return item.recipients.some((entry) => entry.id === scope.studentId);
    return true;
  });

  return (
    <div className={`${card} grid gap-3 p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className={kicker}>{t("dialogs.exam.sentTitle")}</p>
          <p className="m-0 mt-1 text-sm text-soft-ink">{t("dialogs.exam.intro", { nouns })}</p>
        </div>
        <button type="button" className={primaryBtn} onClick={() => setDialog({ mode: "send" })}>＋ {t("dialogs.exam.send")}</button>
      </div>
      {error ? <p className="m-0 text-xs text-[var(--color-danger)]" role="alert">{error}</p> : null}
      {items === null ? <p className="m-0 text-sm text-soft-ink">{t("common.loading")}</p> : !visible.length ? <p className="m-0 text-sm text-soft-ink">{items.length ? t("dialogs.exam.nothingSelection") : t("dialogs.exam.noDates")}</p> : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {visible.map((item) => {
            const planned = item.recipients.filter((entry) => entry.planned).length;
            const state = progress[item.batchId];
            return (
              <li key={item.batchId} className={`rounded-2xl border border-ink/10 p-3 ${item.cancelled ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink">{item.title}{item.cancelled ? ` · ${t("dialogs.exam.cancelledTag")}` : ""}</span>
                    <span className="block text-[11px] text-soft-ink">{shortDate(item.date, t)} ({dueLabel(item.date, t)}){item.subjectHint ? ` · ${item.subjectHint}` : ""} · {item.groups.length ? `${item.groups.join(", ")}` : t.plural(`dialogs.exam.count.${nounKey(noun)}`, item.recipients.length)}{item.groups.length ? ` (${item.recipients.length})` : ""} · {t("dialogs.exam.plannedOf", { planned, total: item.recipients.length })}</span>
                  </span>
                  <button type="button" className={ghostBtn} onClick={() => setOpen(open === item.batchId ? "" : item.batchId)}>{open === item.batchId ? t("dialogs.exam.hide") : t("dialogs.exam.whoPlanned")}</button>
                  {!item.cancelled ? <button type="button" className={ghostBtn} onClick={() => setDialog({ mode: "edit", item })}>{t("common.edit")}</button> : null}
                  {!item.cancelled ? <button type="button" className={dangerBtn} disabled={busyId === item.batchId} onClick={() => cancel(item)}>{t("common.cancel")}</button> : null}
                </div>
                {open === item.batchId ? (
                  <div className="mt-2 grid gap-1.5 border-t border-ink/8 pt-2">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-soft-ink">
                      <span>{t("dialogs.exam.readOnly")}</span>
                      {planned && !item.cancelled ? <button type="button" className={ghostBtn} disabled={state?.loading} onClick={() => checkProgress(item)}>{state?.loading ? t("dialogs.exam.reading") : state ? t("dialogs.exam.refresh") : t("dialogs.exam.show")}</button> : null}
                    </div>
                    <ul className="m-0 grid list-none gap-1 p-0">
                      {item.recipients.map((entry) => {
                        const status = state?.byStudent?.[entry.id];
                        return (
                          <li key={entry.examDateId} className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="min-w-0 flex-1 truncate text-ink">{who(entry)}{!entry.connected ? ` ${t("dialogs.exam.noLonger")}` : ""}</span>
                            {entry.planned ? (
                              <span className="flex items-center gap-2 text-xs">
                                <span className="font-semibold text-[#1d7a44]">{t("dialogs.exam.planMade")}</span>
                                {status ? <span className="text-ink">{t("dialogs.exam.pctDone", { pct: Math.round(status.ratio * 100) })}{status.plans[0] ? ` · ${status.plans[0].name}` : ""}{status.plans.some((plan) => plan.late) ? ` · ${t("dialogs.exam.nLate", { count: status.plans.reduce((sum, plan) => sum + plan.late, 0) })}` : ""}</span> : null}
                              </span>
                            ) : <span className="text-xs text-soft-ink">{t("dialogs.exam.noPlan")}</span>}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {dialog ? (
        <ExamDateDialog
          mode={dialog.mode}
          initial={dialog.item}
          groups={groups}
          students={students}
          workspaces={workspaces}
          scope={scope}
          noun={noun}
          onClose={() => { setDialog(null); load(); }}
          onDone={(message) => onNotice?.(message)}
        />
      ) : null}
    </div>
  );
}
