"use client";

import { useCallback, useEffect, useState } from "react";
import { ROLE_LABEL, accountsApi } from "./api";
import { SetupNotice } from "./SetupNotice";
import { card, chip, dangerBtn, field, ghostBtn, kicker, primaryBtn } from "./ui";

/** Who can this account ask? (the role of the person asked) */
const RELATIONS = { student: ["teacher", "parent"], teacher: ["student"], parent: ["student"] };

const dueText = (date) => (date ? new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "");

function Person({ other }) {
  return (
    <div className="min-w-0">
      <p className="m-0 truncate text-sm font-semibold text-ink">{other.displayName || other.email}</p>
      <p className="m-0 truncate text-[11px] text-soft-ink">
        <span className={`${chip} mr-1.5 bg-[var(--surface-soft)] text-soft-ink`}>{ROLE_LABEL[other.role] || other.role}</span>
        {other.displayName ? other.email : null}
        {other.awaitingSignup ? " · no LUNA account yet — the request waits for them" : ""}
      </p>
    </div>
  );
}

/**
 * Connections: who this account is linked to. A connection is a request from one side that the other
 * side must accept — teacher with student, parent with student. Only an accepted connection lets the two
 * share work or (for teacher/parent -> student) assign it and see the student's performance.
 */
export function ConnectionsPage({ account, onOpenPage }) {
  const relations = RELATIONS[account.role] || [];
  const [connections, setConnections] = useState(null);
  const [shared, setShared] = useState({ sent: [], received: [] });
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [relation, setRelation] = useState(relations[0] || "student");

  const load = useCallback(async () => {
    const [links, items] = await Promise.all([accountsApi.connections(), accountsApi.shared()]);
    if (links.setupNeeded || items.setupNeeded) { setSetupNeeded(true); return; }
    if (!links.ok) { setError(links.error); return; }
    setConnections(links.data.connections);
    if (items.ok) setShared({ sent: items.data.sent || [], received: items.data.received || [] });
  }, []);
  useEffect(() => { load(); }, [load]);

  async function run(promise) {
    setBusy(true);
    setError("");
    setMessage("");
    const result = await promise;
    setBusy(false);
    if (result.setupNeeded) { setSetupNeeded(true); return false; }
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

  if (setupNeeded) return <section className="tw-scope grid gap-3"><SetupNotice /></section>;

  const accepted = connections?.accepted || [];
  const heading = account.role === "student" ? "Your teachers and parents" : account.role === "teacher" ? "Your students" : "Your children";
  const received = shared.received;

  return (
    <section className="tw-scope grid gap-3">
      <div className={`${card} p-5`}>
        <p className={kicker}>Connect with someone</p>
        <p className="m-0 mt-1 text-sm text-soft-ink">
          {account.role === "student"
            ? "Ask your teacher or parent to connect. They have to accept before anything is shared."
            : account.role === "teacher"
              ? "Ask a student to connect. Once they accept you can assign them activities and study plans, share files, and follow their performance."
              : "Ask your child to connect. Once they accept you can send them work and follow their performance."}{" "}
          If they do not have a LUNA account yet, the request waits and shows up when they sign up with that email.
        </p>
        <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={send}>
          <input className={`${field} min-w-[14rem] flex-1`} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="their email" aria-label="Their email" />
          {relations.length > 1 ? (
            <select className={field} value={relation} onChange={(event) => setRelation(event.target.value)} aria-label="They are a">
              {relations.map((value) => <option key={value} value={value}>{ROLE_LABEL[value]}</option>)}
            </select>
          ) : null}
          <button type="submit" className={primaryBtn} disabled={busy || !email.trim()}>Send request</button>
        </form>
        {message ? <p className="m-0 mt-2 text-xs text-[var(--accent-ink)]" role="status">{message}</p> : null}
        {error ? <p className="m-0 mt-2 text-xs text-[var(--color-danger)]" role="alert">{error}</p> : null}
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
        <p className={kicker}>{heading}</p>
        {accepted.length ? (
          <ul className="m-0 mt-2 grid list-none gap-2 p-0">
            {accepted.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/10 p-3">
                <Person other={row.other} />
                <span className="flex gap-1.5">
                  {row.other.role === "student" && account.role !== "student" ? <button type="button" className={ghostBtn} onClick={() => onOpenPage?.("students")}>{account.role === "parent" ? "See performance" : "Open student"}</button> : null}
                  <button type="button" className={dangerBtn} disabled={busy} onClick={() => { if (window.confirm(`Remove your connection with ${row.other.displayName || row.other.email}? You will stop sharing with each other. Files already sent stay where they are.`)) run(accountsApi.changeLink("remove", row.id)); }}>Remove</button>
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

      {received.length ? (
        <div className={`${card} p-5`}>
          <p className={kicker}>Sent to you</p>
          <ul className="m-0 mt-2 grid list-none gap-1.5 p-0">
            {received.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/10 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">{item.title}</span>
                  <span className="block text-[11px] text-soft-ink">
                    {item.mode === "assign" ? "Assigned" : "Shared"} by {item.sender.displayName || "someone"}{item.dueDate ? ` · due ${dueText(item.dueDate)}` : ""}{item.note ? ` · “${item.note}”` : ""}
                  </span>
                </span>
                {item.copyDocumentId && item.itemType !== "plan" ? <button type="button" className={ghostBtn} onClick={() => onOpenPage?.(`workspaces?doc=${item.copyDocumentId}`)}>Open</button> : null}
                {item.itemType === "plan" ? <button type="button" className={ghostBtn} onClick={() => onOpenPage?.("plans")}>Study plans</button> : null}
              </li>
            ))}
          </ul>
          <p className="m-0 mt-2 text-[11px] text-soft-ink">Everything sent to you is in the “Shared documents” folder of your workspace, in a folder named after the sender. It is read-only, but you can highlight it, take notes and answer it.</p>
        </div>
      ) : null}

      {account.role !== "student" && shared.sent.length ? (
        <div className={`${card} p-5`}>
          <p className={kicker}>Sent by you</p>
          <ul className="m-0 mt-2 grid list-none gap-1.5 p-0">
            {shared.sent.slice(0, 30).map((item) => (
              <li key={item.id} className="rounded-xl border border-ink/10 px-3 py-2">
                <span className="block truncate text-sm font-semibold text-ink">{item.title}</span>
                <span className="block text-[11px] text-soft-ink">{item.mode === "assign" ? "Assigned" : "Shared"} with {item.recipient.displayName || "a student"}{item.dueDate ? ` · due ${dueText(item.dueDate)}` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
