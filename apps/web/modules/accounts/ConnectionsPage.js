"use client";

import { useCallback, useEffect, useState } from "react";
import { ROLE_LABEL, accountsApi } from "./api";
import { SHARING_MIGRATION, SetupNotice } from "./SetupNotice";
import { kindExposesPerformance, relationLabel } from "./shared";
import { card, chip, dangerBtn, field, ghostBtn, kicker, primaryBtn } from "./ui";

const dueText = (date) => (date ? new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "");
const KIND_WORD = { document: "file", folder: "folder", subject: "topic" };
const COPY_WORD = { agent: "agent", template: "template", component: "component" };

function Person({ other, label }) {
  return (
    <div className="min-w-0">
      <p className="m-0 truncate text-sm font-semibold text-ink">{other.displayName || other.email}</p>
      <p className="m-0 truncate text-[11px] text-soft-ink">
        <span className={`${chip} mr-1.5 bg-[var(--surface-soft)] text-soft-ink`}>{ROLE_LABEL[other.role] || other.role || "Unknown role"}</span>
        {label ? <span className={`${chip} mr-1.5 bg-[var(--accent-soft)] text-[var(--accent-ink)]`}>{label}</span> : null}
        {other.displayName ? other.email : null}
        {other.awaitingSignup ? " · no LUNA account yet — the request waits for them" : ""}
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
      <div className={`${card} p-5`}>
        <p className={kicker}>Build your network</p>
        <p className="m-0 mt-1 text-sm text-soft-ink">
          Connect with anyone on Luna: students, parents, teachers… there is no limit. They have to accept before anything is shared, and you can end a connection at any time.
          Connected people can share files, folders, study plans, agents, templates and components with each other, and decide whether the other person can only view or also edit.
          {account.role === "teacher" ? " Connect with a student to also assign them activities and study plans and follow their performance." : account.role === "parent" ? " Connect with your child to also send them work and follow their performance." : " Teachers and parents you connect with can send you work; a peer connection never shows anyone your performance."}{" "}
          If they do not have a LUNA account yet, the request waits and shows up when they sign up with that email.
        </p>
        <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={send}>
          <input className={`${field} min-w-[14rem] flex-1`} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="their email" aria-label="Their email" />
          <select className={field} value={relation} onChange={(event) => setRelation(event.target.value)} aria-label="They are a (only needed if they have no account yet)" title="Only needed if they have no account yet">
            <option value="">Any role</option>
            {["student", "teacher", "parent"].map((value) => <option key={value} value={value}>{ROLE_LABEL[value]}</option>)}
          </select>
          <button type="submit" className={primaryBtn} disabled={busy || !email.trim()}>Send request</button>
        </form>
        {message ? <p className="m-0 mt-2 text-xs text-[var(--accent-ink)]" role="status">{message}</p> : null}
        {error ? <p className="m-0 mt-2 text-xs text-[var(--color-danger)]" role="alert">{error}</p> : null}
        {sharingSetup ? <div className="mt-2"><SetupNotice compact migration={SHARING_MIGRATION} title="Connecting beyond teacher, parent and student pairs needs one database step" /></div> : null}
      </div>

      {connections?.incoming?.length ? (
        <div className={`${card} p-5`}>
          <p className={kicker}>Requests for you</p>
          <ul className="m-0 mt-2 grid list-none gap-2 p-0">
            {connections.incoming.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/10 p-3">
                <Person other={row.other} />
                <span className="flex gap-1.5">
                  <button type="button" className={primaryBtn} disabled={busy} onClick={() => run(accountsApi.changeLink("accept", row.id))}>Accept</button>
                  <button type="button" className={ghostBtn} disabled={busy} onClick={() => run(accountsApi.changeLink("decline", row.id))}>Decline</button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className={`${card} p-5`}>
        <p className={kicker}>Your network{accepted.length ? ` · ${accepted.length}` : ""}</p>
        {accepted.length ? (
          <ul className="m-0 mt-2 grid list-none gap-2 p-0">
            {accepted.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/10 p-3">
                <Person other={row.other} label={relationLabel(row.kind, account.role, row.other.role)} />
                <span className="flex gap-1.5">
                  {row.other.role === "student" && account.role !== "student" && kindExposesPerformance(row.kind) ? <button type="button" className={ghostBtn} onClick={() => onOpenPage?.("students")}>{account.role === "parent" ? "See performance" : "Open student"}</button> : null}
                  <button type="button" className={dangerBtn} disabled={busy} onClick={() => { if (window.confirm(`Remove your connection with ${row.other.displayName || row.other.email}? You will stop sharing with each other: what you shared live stops being visible to each other, and copies already sent stay where they are.`)) run(accountsApi.changeLink("remove", row.id)).then(() => load()); }}>Remove</button>
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="m-0 mt-2 text-sm text-soft-ink">{connections ? "Nobody yet. Send a request above." : "Loading…"}</p>}
      </div>

      {connections?.outgoing?.length ? (
        <div className={`${card} p-5`}>
          <p className={kicker}>Waiting for an answer</p>
          <ul className="m-0 mt-2 grid list-none gap-2 p-0">
            {connections.outgoing.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/10 p-3">
                <Person other={row.other} />
                <button type="button" className={ghostBtn} disabled={busy} onClick={() => run(accountsApi.changeLink("cancel", row.id))}>Cancel</button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {grants.received.length ? (
        <div className={`${card} p-5`}>
          <p className={kicker}>Shared with you</p>
          <ul className="m-0 mt-2 grid list-none gap-1.5 p-0">
            {grants.received.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/10 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">{item.itemName || `A ${KIND_WORD[item.itemKind] || "item"}`}</span>
                  <span className="block text-[11px] text-soft-ink">{KIND_WORD[item.itemKind] || "item"} from {item.owner.displayName || "someone"} · {item.permission === "edit" ? "you can edit (changes update the original)" : "view only"}</span>
                </span>
                <button type="button" className={ghostBtn} disabled={busy} onClick={() => { if (window.confirm("Leave this share? It disappears from your workspace. Your own notes and answers stay yours.")) changeGrant(accountsApi.leaveGrant(item.id)); }}>Leave</button>
              </li>
            ))}
          </ul>
          <p className="m-0 mt-2 text-[11px] text-soft-ink">Find it in your workspace under <strong>Shared with me</strong>, in a folder named after the owner. It is the owner&apos;s original, not a copy.</p>
        </div>
      ) : null}

      {grants.given.length ? (
        <div className={`${card} p-5`}>
          <p className={kicker}>Shared by you</p>
          <ul className="m-0 mt-2 grid list-none gap-1.5 p-0">
            {grants.given.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/10 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">{item.itemName || `A ${KIND_WORD[item.itemKind] || "item"}`}</span>
                  <span className="block text-[11px] text-soft-ink">{KIND_WORD[item.itemKind] || "item"} shared with {item.grantee.displayName || item.grantee.email}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <select className={`${field} py-1 text-xs`} value={item.permission} aria-label={`What ${item.grantee.displayName || "they"} can do`} onChange={(event) => changeGrant(accountsApi.changePermission(item.id, event.target.value))}>
                    <option value="view">Can view</option>
                    <option value="edit">Can edit</option>
                  </select>
                  <button type="button" className={ghostBtn} disabled={busy} onClick={() => changeGrant(accountsApi.revokeGrant(item.id))}>Remove</button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {received.length ? (
        <div className={`${card} p-5`}>
          <p className={kicker}>Sent to you</p>
          <ul className="m-0 mt-2 grid list-none gap-1.5 p-0">
            {received.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/10 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">{item.title}</span>
                  <span className="block text-[11px] text-soft-ink">
                    {COPY_WORD[item.itemType] ? `A ${COPY_WORD[item.itemType]} from` : item.mode === "assign" ? "Assigned by" : "Shared by"} {item.sender.displayName || "someone"}{item.dueDate ? ` · due ${dueText(item.dueDate)}` : ""}{item.note ? ` · “${item.note}”` : ""}
                  </span>
                </span>
                {item.copyDocumentId && item.itemType !== "plan" && !COPY_WORD[item.itemType] ? <button type="button" className={ghostBtn} onClick={() => onOpenPage?.(`workspaces?doc=${item.copyDocumentId}`)}>Open</button> : null}
                {item.itemType === "plan" ? <button type="button" className={ghostBtn} onClick={() => onOpenPage?.("plans")}>Study plans</button> : null}
                {item.itemType === "agent" ? <button type="button" className={ghostBtn} onClick={() => onOpenPage?.("ai-tools")}>AI agents</button> : null}
              </li>
            ))}
          </ul>
          <p className="m-0 mt-2 text-[11px] text-soft-ink">Assigned work and older shares are read-only copies in the “Shared documents” folder of your workspace, in a folder named after the sender. Agents, templates and components are your own copies: use and change them freely.</p>
        </div>
      ) : null}

      {account.role !== "student" && shared.sent.length ? (
        <div className={`${card} p-5`}>
          <p className={kicker}>Sent by you</p>
          <ul className="m-0 mt-2 grid list-none gap-1.5 p-0">
            {shared.sent.slice(0, 30).map((item) => (
              <li key={item.id} className="rounded-xl border border-ink/10 px-3 py-2">
                <span className="block truncate text-sm font-semibold text-ink">{item.title}</span>
                <span className="block text-[11px] text-soft-ink">{item.mode === "assign" ? "Assigned" : COPY_WORD[item.itemType] ? `Copy of a ${COPY_WORD[item.itemType]} sent` : "Shared"} with {item.recipient.displayName || "someone"}{item.dueDate ? ` · due ${dueText(item.dueDate)}` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
