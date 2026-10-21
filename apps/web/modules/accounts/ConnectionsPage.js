"use client";

import { useCallback, useEffect, useState } from "react";
import { accountsApi, roleLabel } from "./api";
import { ClassCodeCard } from "./ClassCodeCard";
import { ReceivedMessages } from "./MessagesTab";
import { SHARING_MIGRATION, SetupNotice } from "./SetupNotice";
import { kindExposesPerformance, relationLabel } from "./shared";
import { card, chip, dangerBtn, field, ghostBtn, kicker, primaryBtn } from "./ui";
import { useT } from "../../lib/i18n/LocaleProvider.js";
import { askConfirm } from "../ui/dialogs.js";

const dueText = (date, t) => (date ? new Date(`${date}T00:00:00`).toLocaleDateString(t.locale === "es" ? "es-ES" : undefined, { day: "numeric", month: "short" }) : "");
const KIND_WORD = { document: true, folder: true, subject: true };
const COPY_WORD = { agent: true, template: true, component: true };
const kindWord = (kind, t) => t(`people.conn.kind.${KIND_WORD[kind] ? kind : "item"}`);
const kindA = (kind, t) => t(`people.conn.kindA.${KIND_WORD[kind] ? kind : "item"}`);

function Person({ other, label }) {
  const t = useT();
  return (
    <div className="min-w-0">
      <p className="m-0 truncate text-sm font-semibold text-ink">{other.displayName || other.email}</p>
      <p className="m-0 truncate text-[11px] text-soft-ink">
        <span className={`${chip} mr-1.5 bg-[var(--surface-soft)] text-soft-ink`}>{roleLabel(other.role, t) || t("people.conn.unknownRole")}</span>
        {label ? <span className={`${chip} mr-1.5 bg-[var(--accent-soft)] text-[var(--accent-ink)]`}>{label}</span> : null}
        {other.displayName ? other.email : null}
        {other.awaitingSignup ? ` · ${t("people.conn.awaiting")}` : ""}
      </p>
    </div>
  );
}

/**
 * Connections: your network. Anyone can connect with anyone (students, parents, teachers…, no limit); a
 * connection is a request from one side that the other side must accept. Connected people can share files,
 * folders, study plans, agents, templates and components with each other, and choose whether the other person
 * may only view or also edit. Two role-specific powers stay explicit: a teacher or parent connected to a student
 * (teacher/student, parent/student) can assign work and follow that student's performance. A peer connection
 * never exposes performance or anything private: only what is explicitly shared.
 */
export function ConnectionsPage({ account, onOpenPage }) {
  const t = useT();
  const [connections, setConnections] = useState(null);
  const [shared, setShared] = useState({ sent: [], received: [] });
  const [grants, setGrants] = useState({ given: [], received: [], supported: true });
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [sharingSetup, setSharingSetup] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [relation, setRelation] = useState("");

  const load = useCallback(async () => {
    const [links, items, live] = await Promise.all([accountsApi.connections(), accountsApi.shared(), accountsApi.grantOverview()]);
    if (links.setupNeeded || items.setupNeeded) { setSetupNeeded(true); return; }
    if (!links.ok) { setError(links.error); return; }
    setConnections(links.data.connections);
    if (items.ok) setShared({ sent: items.data.sent || [], received: items.data.received || [] });
    if (live.ok) setGrants({ given: live.data.given || [], received: live.data.received || [], supported: live.data.supported !== false });
  }, []);
  useEffect(() => { load(); }, [load]);

  async function run(promise) {
    setBusy(true);
    setError("");
    setMessage("");
    const result = await promise;
    setBusy(false);
    if (result.setupNeeded) {
      // The open network and sharing with permissions need the newer migration; the classic pairs keep working without it.
      if (String(result.migration || "").includes("202610060001")) { setSharingSetup(true); return false; }
      setSetupNeeded(true);
      return false;
    }
    if (!result.ok) { setError(result.error); return false; }
    setMessage(result.data.message || "");
    if (result.data.connections) setConnections(result.data.connections);
    return true;
  }

  async function send(event) {
    event.preventDefault();
    if (!email.trim()) return;
    if (await run(accountsApi.requestLink(email, relation))) setEmail("");
  }

  async function changeGrant(promise) {
    if (await run(promise)) await load();
  }

  if (setupNeeded) return <section className="tw-scope grid gap-3"><SetupNotice /></section>;

  const accepted = connections?.accepted || [];
  const received = shared.received;

  return (
    <section className="tw-scope grid gap-3">
      <ReceivedMessages />
      <ClassCodeCard account={account} onChanged={load} />
      <div className={`${card} p-5`}>
        <p className={kicker}>{t("people.conn.build")}</p>
        <p className="m-0 mt-1 text-sm text-soft-ink">
          {t("people.conn.intro1")}
          {" "}{t("people.conn.intro2")}
          {" "}{account.role === "teacher" ? t("people.conn.introTeacher") : account.role === "parent" ? t("people.conn.introParent") : t("people.conn.introStudent")}{" "}
          {t("people.conn.intro3")}
        </p>
        <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={send}>
          <input className={`${field} min-w-[14rem] flex-1`} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t("people.conn.emailPh")} aria-label={t("people.conn.emailAria")} />
          <select className={field} value={relation} onChange={(event) => setRelation(event.target.value)} aria-label={t("people.conn.roleAria")} title={t("people.conn.roleTitle")}>
            <option value="">{t("people.conn.anyRole")}</option>
            {["student", "teacher", "parent"].map((value) => <option key={value} value={value}>{roleLabel(value, t)}</option>)}
          </select>
          <button type="submit" className={primaryBtn} disabled={busy || !email.trim()}>{t("people.conn.sendRequest")}</button>
        </form>
        {message ? <p className="m-0 mt-2 text-xs text-[var(--accent-ink)]" role="status">{message}</p> : null}
        {error ? <p className="m-0 mt-2 text-xs text-[var(--color-danger)]" role="alert">{error}</p> : null}
        {sharingSetup ? <div className="mt-2"><SetupNotice compact migration={SHARING_MIGRATION} title={t("people.conn.sharingDb")} /></div> : null}
      </div>

      {connections?.incoming?.length ? (
        <div className={`${card} p-5`}>
          <p className={kicker}>{t("people.conn.requestsForYou")}</p>
          <ul className="m-0 mt-2 grid list-none gap-2 p-0">
            {connections.incoming.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/10 p-3">
                <Person other={row.other} />
                <span className="flex gap-1.5">
                  <button type="button" className={primaryBtn} disabled={busy} onClick={() => run(accountsApi.changeLink("accept", row.id))}>{t("people.conn.accept")}</button>
                  <button type="button" className={ghostBtn} disabled={busy} onClick={() => run(accountsApi.changeLink("decline", row.id))}>{t("people.conn.decline")}</button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className={`${card} p-5`}>
        <p className={kicker}>{t("people.conn.yourNetwork")}{accepted.length ? ` · ${accepted.length}` : ""}</p>
        {accepted.length ? (
          <ul className="m-0 mt-2 grid list-none gap-2 p-0">
            {accepted.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/10 p-3">
                <Person other={row.other} label={relationLabel(row.kind, account.role, row.other.role, t)} />
                <span className="flex gap-1.5">
                  {row.other.role === "student" && account.role !== "student" && kindExposesPerformance(row.kind) ? <button type="button" className={ghostBtn} onClick={() => onOpenPage?.("students")}>{account.role === "parent" ? t("people.conn.seePerf") : t("people.conn.openStudent")}</button> : null}
                  <button type="button" className={dangerBtn} disabled={busy} onClick={async () => { if (await askConfirm({ message: t("people.conn.confirmRemove", { name: row.other.displayName || row.other.email }), confirmLabel: t("common.remove"), danger: true })) run(accountsApi.changeLink("remove", row.id)).then(() => load()); }}>{t("common.remove")}</button>
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="m-0 mt-2 text-sm text-soft-ink">{connections ? t("people.conn.nobody") : t("common.loading")}</p>}
      </div>

      {connections?.outgoing?.length ? (
        <div className={`${card} p-5`}>
          <p className={kicker}>{t("people.conn.waiting")}</p>
          <ul className="m-0 mt-2 grid list-none gap-2 p-0">
            {connections.outgoing.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/10 p-3">
                <Person other={row.other} />
                <button type="button" className={ghostBtn} disabled={busy} onClick={() => run(accountsApi.changeLink("cancel", row.id))}>{t("common.cancel")}</button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {grants.received.length ? (
        <div className={`${card} p-5`}>
          <p className={kicker}>{t("people.conn.sharedWithYou")}</p>
          <ul className="m-0 mt-2 grid list-none gap-1.5 p-0">
            {grants.received.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/10 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">{item.itemName || kindA(item.itemKind, t)}</span>
                  <span className="block text-[11px] text-soft-ink">{t("people.conn.kindFrom", { kind: kindWord(item.itemKind, t), name: item.owner.displayName || t("people.conn.someone") })} · {item.permission === "edit" ? t("people.conn.canEditYou") : t("people.conn.viewOnly")}</span>
                </span>
                <button type="button" className={ghostBtn} disabled={busy} onClick={async () => { if (await askConfirm({ message: t("people.conn.confirmLeave"), confirmLabel: t("common.leave"), danger: true })) changeGrant(accountsApi.leaveGrant(item.id)); }}>{t("people.conn.leave")}</button>
              </li>
            ))}
          </ul>
          <p className="m-0 mt-2 text-[11px] text-soft-ink">{t("people.conn.findA")} <strong>{t("people.conn.sharedWithMe")}</strong>{t("people.conn.findB")}</p>
        </div>
      ) : null}

      {grants.given.length ? (
        <div className={`${card} p-5`}>
          <p className={kicker}>{t("people.conn.sharedByYou")}</p>
          <ul className="m-0 mt-2 grid list-none gap-1.5 p-0">
            {grants.given.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/10 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">{item.itemName || kindA(item.itemKind, t)}</span>
                  <span className="block text-[11px] text-soft-ink">{t("people.conn.kindSharedWith", { kind: kindWord(item.itemKind, t), name: item.grantee.displayName || item.grantee.email })}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <select className={`${field} py-1 text-xs`} value={item.permission} aria-label={t("people.conn.whatCanDo", { name: item.grantee.displayName || t("people.conn.they") })} onChange={(event) => changeGrant(accountsApi.changePermission(item.id, event.target.value))}>
                    <option value="view">{t("people.conn.canView")}</option>
                    <option value="edit">{t("people.conn.canEdit")}</option>
                  </select>
                  <button type="button" className={ghostBtn} disabled={busy} onClick={() => changeGrant(accountsApi.revokeGrant(item.id))}>{t("common.remove")}</button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {received.length ? (
        <div className={`${card} p-5`}>
          <p className={kicker}>{t("people.conn.sentToYou")}</p>
          <ul className="m-0 mt-2 grid list-none gap-1.5 p-0">
            {received.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/10 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">{item.title}</span>
                  <span className="block text-[11px] text-soft-ink">
                    {COPY_WORD[item.itemType] ? t(`people.conn.copyFrom.${item.itemType}`, { name: item.sender.displayName || t("people.conn.someone") }) : item.mode === "assign" ? t("people.conn.assignedBy", { name: item.sender.displayName || t("people.conn.someone") }) : t("people.conn.sharedBy", { name: item.sender.displayName || t("people.conn.someone") })}{item.dueDate ? ` · ${t("people.conn.dueDate", { date: dueText(item.dueDate, t) })}` : ""}{item.note ? ` · “${item.note}”` : ""}
                  </span>
                </span>
                {item.copyDocumentId && item.itemType !== "plan" && !COPY_WORD[item.itemType] ? <button type="button" className={ghostBtn} onClick={() => onOpenPage?.(`workspaces?doc=${item.copyDocumentId}`)}>{t("common.open")}</button> : null}
                {item.itemType === "plan" ? <button type="button" className={ghostBtn} onClick={() => onOpenPage?.("plans")}>{t("people.conn.studyPlans")}</button> : null}
                {item.itemType === "agent" ? <button type="button" className={ghostBtn} onClick={() => onOpenPage?.("create")}>{t("people.conn.openMake")}</button> : null}
              </li>
            ))}
          </ul>
          <p className="m-0 mt-2 text-[11px] text-soft-ink">{t("people.conn.copiesNote")}</p>
        </div>
      ) : null}

      {account.role !== "student" && shared.sent.length ? (
        <div className={`${card} p-5`}>
          <p className={kicker}>{t("people.conn.sentByYou")}</p>
          <ul className="m-0 mt-2 grid list-none gap-1.5 p-0">
            {shared.sent.slice(0, 30).map((item) => (
              <li key={item.id} className="rounded-xl border border-ink/10 px-3 py-2">
                <span className="block truncate text-sm font-semibold text-ink">{item.title}</span>
                <span className="block text-[11px] text-soft-ink">{item.mode === "assign" ? t("people.conn.assignedWith", { name: item.recipient.displayName || t("people.conn.someone") }) : COPY_WORD[item.itemType] ? t(`people.conn.copySent.${item.itemType}`, { name: item.recipient.displayName || t("people.conn.someone") }) : t("people.conn.sharedWith", { name: item.recipient.displayName || t("people.conn.someone") })}{item.dueDate ? ` · ${t("people.conn.dueDate", { date: dueText(item.dueDate, t) })}` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
