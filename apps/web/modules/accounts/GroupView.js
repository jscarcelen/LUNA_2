"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PerformancePage } from "../performance/PerformancePage";
import { dueLabel } from "../plans/plan";
import { OriginBadge } from "../plans/DeadlineBadge";
import { accountsApi } from "./api";
import { GROUP_SUBJECT_ID, GROUP_WORKSPACE_ID, buildGroupWorkspaces, compareMembers, memberLabels, memberPlanRows, subjectNamesOf } from "./groupData";
import { card, field, ghostBtn, kicker } from "./ui";
import { nounWord } from "./nouns.js";
import { useT } from "../../lib/i18n/LocaleProvider.js";

const noop = async () => null;

/**
 * Reads the members of a group a page at a time (`/api/accounts/linked/members`): a student's workspace is heavy, so
 * the screen fills in as the pages arrive. A student whose connection has ended is never returned. `reload()` starts over.
 */
function useGroupMembers(groupId) {
  const [state, setState] = useState({ members: [], total: 0, loading: true, error: "", skipped: 0 });
  const run = useRef(0);
  const load = useCallback(async () => {
    const token = (run.current += 1);
    setState({ members: [], total: 0, loading: true, error: "", skipped: 0 });
    let offset = 0;
    let members = [];
    let skipped = 0;
    for (;;) {
      const page = await accountsApi.groupMembers({ groupId, offset, limit: 10 });
      if (token !== run.current) return;
      if (!page.ok) { setState((current) => ({ ...current, loading: false, error: page.error })); return; }
      members = [...members, ...(page.data.members || [])];
      skipped += page.data.skipped || 0;
      setState({ members, total: page.data.total || 0, loading: Boolean(page.data.hasMore), error: "", skipped });
      if (!page.data.hasMore) return;
      offset = page.data.nextOffset;
    }
  }, [groupId]);
  useEffect(() => { load(); return () => { run.current += 1; }; }, [load]);
  return { ...state, reload: load };
}

const masteryTone = (value) => (value === null ? "text-soft-ink" : value >= 70 ? "text-[#1d7a44]" : value >= 50 ? "text-[#b25e00]" : "text-[var(--color-danger)]");

/** One row per member: how they are doing. Click a name to open that student's own view. */
function CompareTable({ members, onOpenStudent }) {
  const t = useT();
  const rows = useMemo(() => compareMembers(members, {}, t), [members, t]);
  if (!rows.length) return null;
  return (
    <div className={`${card} overflow-x-auto p-4`}>
      <p className={kicker}>{t("people.gv.compare")}</p>
      <table className="mt-2 w-full min-w-[32rem] border-collapse text-left text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-soft-ink">
            <th className="py-1 pr-3 font-semibold">{t("people.gv.student")}</th><th className="py-1 pr-3 font-semibold">{t("people.gv.mastery")}</th><th className="py-1 pr-3 font-semibold">{t("people.gv.activities")}</th><th className="py-1 pr-3 font-semibold">{t("people.gv.lastActive")}</th><th className="py-1 pr-3 font-semibold">{t("people.gv.lateSteps")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-ink/8">
              <td className="py-1.5 pr-3"><button type="button" className="font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline" onClick={() => onOpenStudent(row.id)}>{row.name}</button></td>
              <td className={`py-1.5 pr-3 font-bold ${masteryTone(row.mastery)}`}>{row.mastery === null ? "—" : `${row.mastery}%`}</td>
              <td className="py-1.5 pr-3 text-ink">{row.attempts}</td>
              <td className="py-1.5 pr-3 text-soft-ink">{row.idleDays === null ? t("people.gv.noActivity") : row.idleDays === 0 ? t("people.gv.today") : t("people.gv.daysAgo", { days: row.idleDays })}</td>
              <td className={`py-1.5 pr-3 ${row.late ? "font-semibold text-[var(--color-danger)]" : "text-soft-ink"}`}>{row.late || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The Study plans tab of a group: the members' plan progress in one table. */
function PlansTable({ members, onOpenStudent }) {
  const t = useT();
  const rows = useMemo(() => memberPlanRows(members, t), [members, t]);
  const flat = rows.flatMap((row) => (row.plans.length ? row.plans.map((plan) => ({ ...plan, studentId: row.id, student: row.name })) : [{ studentId: row.id, student: row.name, empty: true }]));
  return (
    <div className={`${card} overflow-x-auto p-4`}>
      <p className={kicker}>{t("people.gv.plansOfGroup")}</p>
      <table className="mt-2 w-full min-w-[40rem] border-collapse text-left text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-soft-ink">
            <th className="py-1 pr-3 font-semibold">{t("people.gv.student")}</th><th className="py-1 pr-3 font-semibold">{t("people.gv.plan")}</th><th className="py-1 pr-3 font-semibold">{t("people.gv.progress")}</th><th className="py-1 pr-3 font-semibold">{t("people.gv.nextDeadline")}</th><th className="py-1 pr-3 font-semibold">{t("people.gv.late")}</th>
          </tr>
        </thead>
        <tbody>
          {flat.map((row, index) => (
            <tr key={`${row.studentId}-${row.documentId || index}`} className="border-t border-ink/8">
              <td className="py-1.5 pr-3"><button type="button" className="font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline" onClick={() => onOpenStudent(row.studentId)}>{row.student}</button></td>
              {row.empty ? <td className="py-1.5 pr-3 text-soft-ink" colSpan={4}>{t("people.gv.noPlan")}</td> : (
                <>
                  <td className="py-1.5 pr-3 text-ink"><span className="mr-1.5 inline-block size-2 rounded-full align-middle" style={{ background: row.colour }} />{row.name}</td>
                  <td className="py-1.5 pr-3">
                    <span className="flex items-center gap-2"><span className="h-1.5 w-20 overflow-hidden rounded-full bg-ink/8"><span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.round(row.ratio * 100)}%` }} /></span><span className="text-xs text-soft-ink">{row.done}/{row.total}</span></span>
                  </td>
                  <td className="py-1.5 pr-3 text-xs text-soft-ink">
                    {row.deadline ? <span className="flex flex-wrap items-center gap-1.5"><OriginBadge imposed={row.imposed} by={row.setBy} ownLabel={t("people.gv.studentsOwn")} />{row.deadline.title} · {dueLabel(row.deadline.date, t)}</span> : t("people.gv.noDeadline")}
                  </td>
                  <td className={`py-1.5 pr-3 ${row.late ? "font-semibold text-[var(--color-danger)]" : "text-soft-ink"}`}>{row.late || "—"}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A group as one: the performance view becomes a CLASS view (class × topic heatmap, who needs attention, topic coverage,
 * headline) fed by the members' evidence, with a comparison table; the plans tab is a table of the members' plan
 * progress; "Sent" lists what you sent to its members. Click a student anywhere to open their individual view.
 */
export function GroupView({ group, tab, sent = [], noun, onOpenStudent }) {
  const t = useT();
  const nouns = nounWord(noun, t, true);
  const { members, total, loading, error, skipped, reload } = useGroupMembers(group.id);
  const [subjectName, setSubjectName] = useState("");
  const subjectNames = useMemo(() => subjectNamesOf(members), [members]);
  useEffect(() => { if (subjectName && !subjectNames.includes(subjectName)) setSubjectName(""); }, [subjectName, subjectNames]);
  const labels = useMemo(() => memberLabels(members, t), [members, t]);
  const workspaces = useMemo(() => buildGroupWorkspaces(members, { groupName: group.name, subjectName }, t), [members, group.name, subjectName, t]);
  const memberIds = useMemo(() => new Set(group.memberIds), [group.memberIds]);
  const sentToGroup = useMemo(() => {
    const byTitle = new Map();
    for (const item of sent.filter((entry) => memberIds.has(entry.recipient.id))) {
      const key = `${item.title}|${item.mode}|${item.dueDate}`;
      const entry = byTitle.get(key) || { ...item, people: [] };
      entry.people.push(item.recipient.displayName || item.recipient.id);
      byTitle.set(key, entry);
    }
    return [...byTitle.values()];
  }, [sent, memberIds]);

  if (!group.memberCount) return <p className={`${card} p-5 text-sm text-soft-ink`}>{t("people.gv.empty", { nouns })}</p>;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-soft-ink">
        <span className="size-2.5 rounded-full" style={{ background: group.colour }} />
        <span className="font-semibold text-ink">{group.name}</span>
        <span>{loading ? t("people.gv.reading", { count: members.length, total: total || group.memberCount, nouns }) : `${members.length} ${nounWord(noun, t, members.length !== 1)}${skipped ? ` · ${t("people.gv.notShown", { count: skipped })}` : ""}`} · {t("people.gv.readOnly")}</span>
        <button type="button" className={ghostBtn} disabled={loading} onClick={reload}>{loading ? t("common.loading") : t("people.gv.refresh")}</button>
      </div>
      {error ? <p className={`${card} p-4 text-sm text-[var(--color-danger)]`} role="alert">{error}</p> : null}

      {tab === "performance" ? (
        <>
          {subjectNames.length > 1 ? (
            <label className="flex flex-wrap items-center gap-2 text-xs font-semibold text-soft-ink">{t("people.gv.topic")}
              <select className={`${field} max-w-[16rem]`} value={subjectName} onChange={(event) => setSubjectName(event.target.value)}>
                <option value="">{t("people.group.allTopics")}</option>
                {subjectNames.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
          ) : null}
          <CompareTable members={members} onOpenStudent={onOpenStudent} />
          {members.length ? (
            <PerformancePage
              key={`${group.id}|${subjectName}|${loading ? "loading" : "ready"}`}
              role="teacher"
              profileName={group.name}
              workspaces={workspaces}
              selectedWorkspaceId={GROUP_WORKSPACE_ID}
              selectedSubjectId={GROUP_SUBJECT_ID}
              onSaveGeneratedQuizDocument={noop}
              onRemoveDocument={noop}
              onOpenPage={() => {}}
              onSelectSubject={() => {}}
              onOpenLearner={(label) => { const found = [...labels.entries()].find(([, value]) => value === label); if (found) onOpenStudent(found[0]); }}
            />
          ) : loading ? <p className={`${card} p-5 text-sm text-soft-ink`}>{t("people.gv.loadingWork")}</p> : null}
        </>
      ) : null}

      {tab === "plans" ? <PlansTable members={members} onOpenStudent={onOpenStudent} /> : null}

      {tab === "sent" ? (
        <div className={`${card} p-5`}>
          <p className={kicker}>{t("people.gv.sentTo", { name: group.name })}</p>
          {sentToGroup.length ? (
            <ul className="m-0 mt-2 grid list-none gap-1.5 p-0">
              {sentToGroup.map((item) => (
                <li key={item.id} className="rounded-xl border border-ink/10 px-3 py-2">
                  <span className="block truncate text-sm font-semibold text-ink">{item.title}</span>
                  <span className="block text-[11px] text-soft-ink">{item.mode === "assign" ? t("people.gv.assigned") : t("people.gv.shared")}{item.dueDate ? ` · ${t("people.gv.dueLocked", { due: dueLabel(item.dueDate, t) })}` : ""} · {t("people.gv.ofMembers", { count: item.people.length, total: group.memberCount, nouns })}</span>
                </li>
              ))}
            </ul>
          ) : <p className="m-0 mt-2 text-sm text-soft-ink">{t("people.gv.sentNone")}</p>}
        </div>
      ) : null}
    </div>
  );
}
