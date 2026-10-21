"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { accountsApi } from "./api";
import { SetupNotice } from "./SetupNotice";
import { MAX_MESSAGE_BODY, MAX_MESSAGE_SUBJECT } from "./messages.js";
import { card, dangerBtn, field, ghostBtn, kicker, primaryBtn } from "./ui";
import { useT } from "../../lib/i18n/LocaleProvider.js";

const MESSAGES_MIGRATION = "supabase/migrations/202610210001_class_messages.sql";

/**
 * "Messages": write to the chosen student or group, or to all your students, and (teachers) to their parents too, in
 * one go. They get it in the bell and by email; the email carries your address, so a reply goes to your own inbox.
 * Below: what you sent to these people, who has seen it, and Delete.
 *
 * `audience` = { kind: "student" | "group", ids, name, groupId? }; `allIds` = every connected student.
 */
export function MessagesTab({ account, audience, allIds = [] }) {
  const t = useT();
  const [state, setState] = useState({ loading: true, sent: [], canReachParents: account?.role === "teacher", setup: false });
  const [scope, setScope] = useState("selected");
  const [toStudents, setToStudents] = useState(true);
  const [toParents, setToParents] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState({ text: "", error: false });
  const [confirmDelete, setConfirmDelete] = useState("");
  const [open, setOpen] = useState("");

  const load = useCallback(async () => {
    const result = await accountsApi.messages();
    if (result.setupNeeded || result.data?.supported === false) { setState((current) => ({ ...current, loading: false, setup: true })); return; }
    setState({ loading: false, sent: result.ok ? result.data.sent || [] : [], canReachParents: Boolean(result.data?.canReachParents), setup: false });
  }, []);
  useEffect(() => { load(); }, [load]);

  const everyone = scope === "all";
  const targetIds = everyone ? allIds : audience.ids;
  const targetName = everyone ? t("classroom.msg.allStudents", { count: allIds.length }) : audience.name;
  const canParents = state.canReachParents;
  const ready = subject.trim() && body.trim() && targetIds.length && (toStudents || (canParents && toParents)) && !busy;

  // What was sent to these people (any send that reached one of them).
  const shown = useMemo(() => {
    const ids = new Set(audience.ids);
    return state.sent.filter((entry) => (entry.aboutStudentIds || []).some((id) => ids.has(id)));
  }, [state.sent, audience.ids]);

  async function send(event) {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    setNotice({ text: "", error: false });
    const useGroup = !everyone && audience.kind === "group" && audience.groupId;
    const result = await accountsApi.sendMessage({ subject, body, toStudents, toParents: canParents && toParents, groupIds: useGroup ? [audience.groupId] : [], recipientIds: useGroup ? [] : targetIds });
    setBusy(false);
    if (result.setupNeeded) { setState((current) => ({ ...current, setup: true })); return; }
    if (!result.ok) { setNotice({ text: result.error, error: true }); return; }
    const { students = 0, parents = 0 } = result.data.summary || {};
    setNotice({ text: parents ? t("classroom.msg.sentBoth", { students, parents }) : t("classroom.msg.sentStudents", { students }), error: false });
    setSubject("");
    setBody("");
    await load();
  }

  async function remove(batchId) {
    setBusy(true);
    const result = await accountsApi.deleteMessage(batchId);
    setBusy(false);
    setConfirmDelete("");
    if (!result.ok) { setNotice({ text: result.error, error: true }); return; }
    setNotice({ text: t("classroom.msg.deleted"), error: false });
    await load();
  }

  if (state.setup) return <SetupNotice migration={MESSAGES_MIGRATION} title={t("classroom.msg.setup")} />;

  const buttonLabel = toStudents && canParents && toParents ? t("classroom.msg.sendBoth", { name: targetName }) : toStudents ? t("classroom.msg.sendStudents", { name: targetName }) : t("classroom.msg.sendParents", { name: targetName });

  return (
    <div className="grid gap-3">
      <form className={`${card} grid gap-3 p-5`} onSubmit={send}>
        <p className={kicker}>{t("classroom.msg.write")}</p>
        <div className="grid gap-1.5">
          <span className="text-xs font-semibold text-soft-ink">{t("classroom.msg.to")}</span>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("classroom.msg.to")}>
            {[["selected", audience.name], ["all", t("classroom.msg.allStudents", { count: allIds.length })]].filter(([value]) => value === "selected" || allIds.length > audience.ids.length).map(([value, label]) => (
              <button key={value} type="button" role="radio" aria-checked={scope === value} onClick={() => setScope(value)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${scope === value ? "border-transparent bg-ink text-white" : "border-ink/15 bg-white text-soft-ink"}`}>{label}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink">
            <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={toStudents} onChange={(event) => setToStudents(event.target.checked)} /> {t("classroom.msg.students")}</label>
            {canParents ? <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={toParents} onChange={(event) => setToParents(event.target.checked)} /> {t("classroom.msg.parents")}</label> : null}
          </div>
          {canParents && toParents ? <p className="m-0 text-[11px] text-soft-ink">{t("classroom.msg.parentsHelp")}</p> : null}
        </div>
        <label className="grid gap-1 text-xs font-semibold text-soft-ink">{t("classroom.msg.subject")}
          <input className={`${field} font-normal`} value={subject} maxLength={MAX_MESSAGE_SUBJECT} onChange={(event) => setSubject(event.target.value)} placeholder={t("classroom.msg.subjectPh")} />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-soft-ink">{t("classroom.msg.message")}
          <textarea className={`${field} min-h-[7rem] font-normal`} value={body} maxLength={MAX_MESSAGE_BODY} onChange={(event) => setBody(event.target.value)} placeholder={t("classroom.msg.messagePh")} />
        </label>
        <p className="m-0 text-[11px] text-soft-ink">{t("classroom.msg.howItArrives")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className={primaryBtn} disabled={!ready}>{busy ? t("classroom.msg.sending") : buttonLabel}</button>
          {notice.text ? <span role={notice.error ? "alert" : "status"} className={`text-xs ${notice.error ? "text-[var(--color-danger)]" : "text-[var(--accent-ink)]"}`}>{notice.text}</span> : null}
        </div>
      </form>

      <div className={`${card} grid gap-2 p-5`}>
        <p className={kicker}>{t("classroom.msg.sentTo", { name: audience.name })}</p>
        {state.loading ? <p className="m-0 text-sm text-soft-ink">{t("common.loading")}</p> : shown.length ? (
          <ul className="m-0 grid list-none gap-2 p-0">
            {shown.map((entry) => (
              <li key={entry.batchId} className="grid gap-1 rounded-xl border border-ink/10 px-3 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <button type="button" className="min-w-0 truncate text-left text-sm font-semibold text-ink hover:underline" aria-expanded={open === entry.batchId} onClick={() => setOpen(open === entry.batchId ? "" : entry.batchId)}>{entry.subject}</button>
                  <span className="text-[11px] text-soft-ink">{new Date(entry.sentAt).toLocaleDateString(t.locale === "es" ? "es-ES" : "en-US", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <p className="m-0 text-[11px] text-soft-ink">
                  {entry.groups?.length ? `${entry.groups.map((group) => group.name).join(", ")} · ` : ""}
                  {entry.students.length ? t("classroom.msg.seenStudents", { seen: entry.studentsSeen, total: entry.students.length }) : ""}
                  {entry.students.length && entry.parents ? " · " : ""}
                  {entry.parents ? t("classroom.msg.seenParents", { seen: entry.parentsSeen, total: entry.parents }) : ""}
                </p>
                {open === entry.batchId ? (
                  <>
                    <p className="m-0 whitespace-pre-line rounded-lg bg-[var(--surface-soft)] px-3 py-2 text-sm text-ink [overflow-wrap:anywhere]">{entry.body}</p>
                    {entry.students.length ? <p className="m-0 text-[11px] text-soft-ink">{entry.students.map((student) => `${student.seen ? "✓" : "○"} ${student.displayName || "?"}`).join("   ")}</p> : null}
                  </>
                ) : null}
                <div className="flex gap-1.5">
                  {confirmDelete === entry.batchId ? (
                    <>
                      <button type="button" className={dangerBtn} disabled={busy} onClick={() => remove(entry.batchId)}>{t("classroom.msg.confirmDelete")}</button>
                      <button type="button" className={ghostBtn} onClick={() => setConfirmDelete("")}>{t("common.cancel")}</button>
                    </>
                  ) : <button type="button" className={ghostBtn} onClick={() => setConfirmDelete(entry.batchId)}>{t("classroom.msg.delete")}</button>}
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="m-0 text-sm text-soft-ink">{t("classroom.msg.none")}</p>}
      </div>
    </div>
  );
}

/**
 * Messages sent TO me (a student, or a parent about their child), for the Connections page. Shown only when there are
 * some; opening the page counts as having seen them.
 */
export function ReceivedMessages() {
  const t = useT();
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    const result = await accountsApi.messages();
    if (result.ok) setMessages(result.data.received || []);
    if (result.ok && (result.data.received || []).some((message) => !message.read)) accountsApi.readMessages();
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!messages.length) return null;
  return (
    <div className={`${card} grid gap-2 p-5`}>
      <p className={kicker}>{t("classroom.inbox.title")} · {messages.length}</p>
      <ul className="m-0 grid list-none gap-2 p-0">
        {messages.map((message) => (
          <li key={message.id} className={`grid gap-1 rounded-xl border border-ink/10 px-3 py-2 ${message.read ? "" : "bg-[rgba(0,113,227,0.06)]"}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-sm font-semibold text-ink">{message.subject}</span>
              <span className="text-[11px] text-soft-ink">{new Date(message.sentAt).toLocaleDateString(t.locale === "es" ? "es-ES" : "en-US", { day: "numeric", month: "short" })}</span>
            </div>
            <p className="m-0 text-[11px] text-soft-ink">{message.aboutStudent?.displayName ? t("classroom.inbox.fromAbout", { name: message.sender.displayName || message.sender.email, child: message.aboutStudent.displayName }) : t("classroom.inbox.from", { name: message.sender.displayName || message.sender.email })}{message.sender.email ? ` · ${message.sender.email}` : ""}</p>
            <p className="m-0 whitespace-pre-line text-sm text-ink [overflow-wrap:anywhere]">{message.body}</p>
            <div>
              <button type="button" className={ghostBtn} disabled={busy === message.id} onClick={async () => { setBusy(message.id); await accountsApi.hideMessage(message.id); setBusy(""); load(); }}>{t("classroom.inbox.remove")}</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
