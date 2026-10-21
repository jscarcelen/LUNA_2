"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { dueLabel } from "../plans/plan";
import { accountsApi } from "./api";
import { onShareFinished, requestShare } from "./shareEvents";
import { coverageOf, overviewCounts, sharingOverview } from "./sharingStatus.js";
import { card, chip, dangerBtn, field, ghostBtn, kicker } from "./ui";
import { useT } from "../../lib/i18n/LocaleProvider.js";

const ICON = { subject: "📚", folder: "📁", plan: "🗓", activity: "✏️", file: "📄" };
const GREEN = "bg-[#2f9e5b]/12 text-[#1d7a44]";
const AMBER = "bg-[#ff9500]/14 text-[#9a5800]";
const GREY = "bg-ink/6 text-soft-ink";

/**
 * "What {name} can see": for the chosen student or group, every topic, folder and file of MY workspace with a clear
 * status — green "Can see / Can edit" (live share, also through a folder or topic), "Assigned · due …" (a copy), grey
 * "Not shared" — and the action that goes with it right on the row: Share…, Assign…, Stop sharing, change the due
 * date, send the latest version of an assigned copy, open the plan to edit it.
 *
 * `audience` = { kind: "student" | "group", ids: string[], name: string, groupId?: string }.
 */
export function SharingOverviewTab({ account, workspaces = [], audience, sent = [], onSentChanged, onOpenPlan, onOpenDocument }) {
  const t = useT();
  const [grants, setGrants] = useState(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState({ text: "", error: false });
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const result = await accountsApi.grantOverview();
    setGrants(result.ok ? result.data.given || [] : []);
  }, []);
  useEffect(() => { load(); }, [load]);
  // Something was shared or assigned through the dialog: read the state again.
  useEffect(() => onShareFinished(() => { load(); onSentChanged?.(); }), [load, onSentChanged]);

  const topics = useMemo(() => sharingOverview({ workspaces, grants: grants || [], sent, audienceIds: audience.ids }), [workspaces, grants, sent, audience.ids]);
  const counts = useMemo(() => overviewCounts(topics), [topics]);
  const isGroup = audience.kind === "group";
  const total = audience.ids.length;
  const initial = (mode) => (isGroup && audience.groupId ? { mode, groupIds: [audience.groupId], recipientIds: [] } : { mode, groupIds: [], recipientIds: audience.ids });

  const share = (row, mode = "share") => requestShare({ kind: row.kind, id: row.id, name: row.name, document: row.document, initial: initial(mode) });

  async function act(key, promise, success) {
    setBusy(key);
    setNotice({ text: "", error: false });
    const results = await Promise.all([].concat(promise));
    setBusy("");
    const failed = results.find((result) => !result.ok);
    if (failed) { setNotice({ text: failed.error, error: true }); return; }
    setNotice({ text: success, error: false });
    await load();
    await onSentChanged?.();
  }

  const stopSharing = (row) => act(`stop:${row.id}`, row.access.direct.map((entry) => accountsApi.revokeGrant(entry.grantId)), t("classroom.access.stopped", { item: row.name }));
  const resendCopy = (row, dueDate) => act(`due:${row.id}`, accountsApi.send({ mode: "assign", documentId: row.id, recipientIds: [...new Set(row.access.copies.filter((copy) => copy.mode === "assign").map((copy) => copy.personId))], dueDate }), dueDate ? t("classroom.access.dateSaved", { item: row.name, due: dueLabel(dueDate, t) }) : t("classroom.access.resent", { item: row.name }));

  const matches = (row) => (!query.trim() || String(row.name).toLowerCase().includes(query.trim().toLowerCase())) && (filter === "all" || (filter === "shared" ? coverageOf(row.access) !== "none" : coverageOf(row.access) === "none"));

  if (grants === null) return <p className={`${card} p-5 text-sm text-soft-ink`}>{t("common.loading")}</p>;

  return (
    <div className="grid gap-3">
      <div className={`${card} grid gap-2 p-4`}>
        <p className={kicker}>{t("classroom.access.title", { name: audience.name })}</p>
        <p className="m-0 text-sm text-soft-ink">{t("classroom.access.intro")}</p>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-soft-ink">
          <span className={`${chip} ${GREEN}`}>{t("classroom.access.legendSee")}</span>
          <span className={`${chip} ${AMBER}`}>{isGroup ? t("classroom.access.legendSome") : t("classroom.access.legendCopy")}</span>
          <span className={`${chip} ${GREY}`}>{t("classroom.access.legendNone")}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t("classroom.access.filter")}>
            {[["all", t("classroom.access.all")], ["shared", t("classroom.access.sharedN", { count: counts.shared })], ["none", t("classroom.access.noneN", { count: counts.none })]].map(([value, label]) => (
              <button key={value} type="button" role="tab" aria-selected={filter === value} onClick={() => setFilter(value)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${filter === value ? "border-transparent bg-ink text-white" : "border-ink/15 bg-white text-soft-ink"}`}>{label}</button>
            ))}
          </div>
          <input className={`${field} min-w-[10rem] flex-1 !py-1.5 text-xs`} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("classroom.access.search")} aria-label={t("classroom.access.search")} />
        </div>
        {notice.text ? <p role={notice.error ? "alert" : "status"} className={`m-0 text-xs ${notice.error ? "text-[var(--color-danger)]" : "text-[var(--accent-ink)]"}`}>{notice.text}</p> : null}
      </div>

      {!topics.length ? <p className={`${card} p-5 text-sm text-soft-ink`}>{t("classroom.access.empty")}</p> : null}

      {topics.map((topic) => {
        const topicRow = { kind: "subject", id: topic.id, name: topic.name, access: topic.access };
        const rows = topic.rows.filter(matches);
        const showTopic = matches(topicRow) || rows.length;
        if (!showTopic) return null;
        return (
          <section key={topic.id} className={`${card} grid gap-1 p-3`} aria-label={topic.name}>
            <Row row={topicRow} topic t={t} isGroup={isGroup} total={total} busy={busy} onShare={share} onStop={stopSharing} onResend={resendCopy} onOpenPlan={onOpenPlan} onOpenDocument={onOpenDocument} subjectId={topic.id} />
            {rows.map((row) => (
              <Row key={`${row.kind}:${row.id}`} row={row} t={t} isGroup={isGroup} total={total} busy={busy} onShare={share} onStop={stopSharing} onResend={resendCopy} onOpenPlan={onOpenPlan} onOpenDocument={onOpenDocument} subjectId={topic.id} canAssign={account?.role === "teacher" || account?.role === "parent"} />
            ))}
            {!topic.rows.length ? <p className="m-0 px-2 py-1 text-xs text-soft-ink">{t("classroom.access.topicEmpty")}</p> : null}
          </section>
        );
      })}
    </div>
  );
}

/** The status words for one row. */
function statusOf(row, { t, isGroup, total }) {
  const { access } = row;
  const coverage = coverageOf(access);
  const assigned = access.copies.filter((copy) => copy.mode === "assign");
  const firstDue = assigned.map((copy) => copy.dueDate).filter(Boolean).sort()[0] || "";
  const inheritedFrom = !access.direct.length && access.inherited.length ? access.inherited[0].fromName : "";
  const liveWord = access.best === "edit" ? t("classroom.access.canEdit") : t("classroom.access.canSee");
  const pills = [];
  if (access.best) {
    const count = access.live.size;
    pills.push({ tone: !isGroup || count >= total ? GREEN : AMBER, text: isGroup ? (count >= total ? t("classroom.access.allCan", { what: liveWord, total }) : t("classroom.access.someCan", { what: liveWord, count, total })) : liveWord });
  }
  if (assigned.length) {
    const people = new Set(assigned.map((copy) => copy.personId)).size;
    const due = firstDue ? ` · ${t("classroom.access.due", { due: dueLabel(firstDue, t) })}` : "";
    pills.push({ tone: access.best ? GREEN : AMBER, text: `${isGroup ? t("classroom.access.assignedSome", { count: people, total }) : t("classroom.access.assigned")}${due}` });
  } else if (access.copies.length) {
    pills.push({ tone: AMBER, text: isGroup ? t("classroom.access.copySome", { count: new Set(access.copies.map((copy) => copy.personId)).size, total }) : t("classroom.access.copy") });
  }
  if (coverage === "none") pills.push({ tone: GREY, text: t("classroom.access.notShared") });
  return { pills, inheritedFrom, assigned, firstDue };
}

function Row({ row, topic = false, t, isGroup, total, busy, onShare, onStop, onResend, onOpenPlan, onOpenDocument, subjectId, canAssign = false }) {
  const { pills, inheritedFrom, assigned, firstDue } = statusOf(row, { t, isGroup, total });
  const [editingDate, setEditingDate] = useState(false);
  const [date, setDate] = useState(firstDue);
  const [confirmStop, setConfirmStop] = useState(false);
  const icon = topic ? ICON.subject : row.kind === "folder" ? ICON.folder : ICON[row.itemType] || ICON.file;
  const coverage = coverageOf(row.access);
  const fullyLive = row.access.best && row.access.live.size >= total;
  const assignable = canAssign && row.kind === "document" && (row.itemType === "plan" || row.itemType === "activity");
  const rowBusy = busy.endsWith(`:${row.id}`);
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl px-2 py-1.5 ${topic ? "bg-[var(--surface-soft)]" : "hover:bg-[var(--surface-soft)]"} ${coverage === "none" && !topic ? "opacity-90" : ""}`} style={{ paddingLeft: topic ? undefined : `${0.5 + Math.min(row.depth + 1, 4) * 0.9}rem` }}>
      <span className="flex min-w-[min(100%,14rem)] flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
        <span aria-hidden="true">{icon}</span>
        <span className={`min-w-0 [overflow-wrap:anywhere] ${topic ? "text-sm font-bold" : "text-sm font-semibold"} text-ink`}>{row.name}</span>
        {pills.map((pill) => <span key={pill.text} className={`${chip} ${pill.tone}`}>{pill.text}</span>)}
        {inheritedFrom ? <span className="text-[11px] text-soft-ink [overflow-wrap:anywhere]">{t("classroom.access.through", { name: inheritedFrom })}</span> : null}
      </span>
      <span className="flex flex-wrap items-center gap-1.5">
        {row.itemType === "plan" ? <button type="button" className={ghostBtn} onClick={() => onOpenPlan?.({ documentId: row.id, subjectId })}>{t("classroom.access.editPlan")}</button> : null}
        {row.kind === "document" && row.itemType !== "plan" ? <button type="button" className={ghostBtn} onClick={() => onOpenDocument?.(row.id)}>{t("classroom.access.open")}</button> : null}
        {assigned.length ? (
          editingDate ? (
            <span className="flex items-center gap-1">
              <input type="date" className={`${field} !py-1 text-xs`} value={date} onChange={(event) => setDate(event.target.value)} aria-label={t("classroom.access.newDate", { item: row.name })} />
              <button type="button" className={ghostBtn} disabled={rowBusy || !date} onClick={async () => { await onResend(row, date); setEditingDate(false); }}>{t("classroom.access.saveDate")}</button>
              <button type="button" className={ghostBtn} onClick={() => setEditingDate(false)}>{t("common.cancel")}</button>
            </span>
          ) : (
            <>
              <button type="button" className={ghostBtn} disabled={rowBusy} onClick={() => { setDate(firstDue); setEditingDate(true); }}>{firstDue ? t("classroom.access.changeDate") : t("classroom.access.addDate")}</button>
              <button type="button" className={ghostBtn} disabled={rowBusy} title={t("classroom.access.resendHelp")} onClick={() => onResend(row, firstDue)}>{t("classroom.access.resend")}</button>
            </>
          )
        ) : null}
        {!fullyLive ? <button type="button" className={ghostBtn} onClick={() => onShare(row)}>{t("classroom.access.share")}</button> : null}
        {assignable && !assigned.length ? <button type="button" className={ghostBtn} onClick={() => onShare(row, "assign")}>{t("classroom.access.assign")}</button> : null}
        {row.access.direct.length ? (
          confirmStop ? (
            <span className="flex items-center gap-1">
              <button type="button" className={dangerBtn} disabled={rowBusy} onClick={async () => { await onStop(row); setConfirmStop(false); }}>{t("classroom.access.confirmStop")}</button>
              <button type="button" className={ghostBtn} onClick={() => setConfirmStop(false)}>{t("common.cancel")}</button>
            </span>
          ) : <button type="button" className={ghostBtn} onClick={() => setConfirmStop(true)}>{t("classroom.access.stop")}</button>
        ) : null}
      </span>
    </div>
  );
}
