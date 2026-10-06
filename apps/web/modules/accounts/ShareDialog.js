"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ROLE_LABEL, accountsApi } from "./api";
import { SHARING_MIGRATION, SetupNotice } from "./SetupNotice";
import { classifyDeliverable, sharedInfoOf } from "./shared";
import { field, ghostBtn, kicker, primaryBtn } from "./ui";

/** What can be shared, and how. Files, folders and topics are shared LIVE (with a permission); the rest as a copy. */
const LIVE_KINDS = ["document", "folder", "subject"];
const KIND_WORD = { document: "file", folder: "folder", subject: "topic", agent: "agent", template: "template", component: "component" };

const PERMISSIONS = [
  ["view", "Can view", "They can read it, highlight it and take their own notes. They cannot change it."],
  ["edit", "Can edit", "They can change the content, rename it and add files. Edit changes the original: everyone sees the update."]
];

const who = (person) => person.displayName || person.email;

/**
 * "Share…": send something to people you are connected to (and only them; the server checks again).
 *
 *  - a file, a folder (with everything in it, also what is added later), a topic or a study plan: a LIVE share
 *    with a permission. You stay the owner; they see the original under "Shared with me / <your name>".
 *    The "People with access" list lets you change or take away access at any time.
 *  - an agent, a template or a component: they get their own copy (no live sync).
 *  - a teacher or parent can also ASSIGN an activity or a study plan to a connected student, with a due date
 *    (that sends a read-only copy, as before).
 *
 * `item` = { kind, id, name, document?, component? }. (`document` alone is still accepted for older callers.)
 */
export function ShareDialog({ account, item: itemProp, document: legacyDocument, onClose, onDone }) {
  const item = useMemo(() => itemProp || (legacyDocument ? { kind: "document", id: legacyDocument.id, name: legacyDocument.name, document: legacyDocument } : null), [itemProp, legacyDocument]);
  const live = LIVE_KINDS.includes(item?.kind);
  const word = KIND_WORD[item?.kind] || "item";

  const [connections, setConnections] = useState(null);
  const [setup, setSetup] = useState(null);
  const [picked, setPicked] = useState([]);
  const [mode, setMode] = useState("share");
  const [permission, setPermission] = useState("view");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [access, setAccess] = useState(null);

  useEffect(() => {
    let alive = true;
    accountsApi.connections().then((result) => {
      if (!alive) return;
      if (result.setupNeeded) setSetup({ migration: result.migration || "", title: "Accounts need one database step" });
      else if (!result.ok) setError(result.error);
      else setConnections(result.data.connections);
    });
    return () => { alive = false; };
  }, []);

  const loadAccess = useCallback(async () => {
    if (!live || !item?.id) return;
    const result = await accountsApi.grantsOn(item.kind, item.id);
    if (result.ok) setAccess(result.data.grants || []);
    else if (result.status !== 404) setAccess([]);
  }, [item?.kind, item?.id, live]);
  useEffect(() => { loadAccess(); }, [loadAccess]);

  const document = item?.document || null;
  const notMine = Boolean(sharedInfoOf(document));
  const deliverable = item?.kind === "document" && document ? classifyDeliverable(document, "share") : { ok: !notMine };
  const canAssignRole = account.role === "teacher" || account.role === "parent";
  const assignable = item?.kind === "document" && document && canAssignRole && classifyDeliverable(document, "assign").ok;

  const rows = useMemo(() => (connections?.accepted || []).filter((row) => row.other.id && (mode !== "assign" || (row.other.role === "student" && row.kind !== "peer"))), [connections, mode]);
  const people = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => !needle || `${row.other.displayName} ${row.other.email}`.toLowerCase().includes(needle));
  }, [rows, query]);
  const accessByPerson = useMemo(() => new Map((access || []).map((entry) => [entry.grantee.id, entry])), [access]);

  const toggle = (id) => setPicked((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));
  const eligible = picked.filter((id) => rows.some((row) => row.other.id === id));

  const handle = (result) => {
    if (result.setupNeeded) { setSetup({ migration: result.migration || SHARING_MIGRATION, title: "Sharing with permissions needs one database step" }); return false; }
    if (!result.ok) { setError(result.error); return false; }
    return true;
  };

  async function send() {
    setBusy(true);
    setError("");
    setSuccess("");
    let result;
    if (mode === "assign") result = await accountsApi.send({ mode: "assign", documentId: item.id, recipientIds: eligible, dueDate, note });
    else if (live) result = await accountsApi.shareLive({ kind: item.kind, itemId: item.id, recipientIds: eligible, permission });
    else result = await accountsApi.shareCopy({ kind: item.kind, id: item.id, component: item.component, recipientIds: eligible });
    setBusy(false);
    if (!handle(result)) return;
    const results = result.data.results || [];
    const okCount = results.filter((entry) => entry.ok).length;
    const failed = results.filter((entry) => !entry.ok);
    const what = mode === "assign" ? "Assigned" : live ? `Shared (${permission === "edit" ? "can edit" : "can view"})` : "Sent a copy of";
    const message = `${what} “${item.name}” with ${okCount} ${okCount === 1 ? "person" : "people"}${failed.length ? ` · ${failed.length} could not be sent: ${failed[0].error}` : ""}.`;
    onDone?.(message);
    if (live && mode === "share") {
      setSuccess(message);
      setPicked([]);
      await loadAccess();
    } else onClose?.();
  }

  async function changeAccess(entry, next) {
    setError("");
    const result = next === "remove" ? await accountsApi.revokeGrant(entry.id) : await accountsApi.changePermission(entry.id, next);
    if (handle(result)) { setSuccess(next === "remove" ? `${who(entry.grantee)} no longer has access.` : `${who(entry.grantee)} ${next === "edit" ? "can now edit" : "can now only view"}.`); await loadAccess(); }
  }

  if (!item) return null;
  const heading = mode === "assign" ? "Assign" : "Share with…";
  const noOne = connections && !rows.length;

  return (
    <div className="tw-scope fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Share" className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-[0_24px_64px_rgba(0,0,0,0.25)]" onClick={(event) => event.stopPropagation()}>
        <p className={kicker}>{heading} · {word}</p>
        <h3 className="m-0 mt-1 truncate text-base font-bold text-ink">{item.name}</h3>

        {setup ? <div className="mt-3"><SetupNotice compact migration={setup.migration || SHARING_MIGRATION} title={setup.title} /></div> : !deliverable.ok ? (
          <p className="m-0 mt-3 text-sm text-soft-ink">{notMine ? "This was shared with you, so only its owner can share it with other people." : deliverable.error}</p>
        ) : (
          <div className="mt-3 grid gap-3">
            {assignable ? (
              <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="How to send">
                {[["share", "Share with permissions"], ["assign", "Assign with a due date"]].map(([value, label]) => (
                  <button key={value} type="button" role="tab" aria-selected={mode === value} onClick={() => { setMode(value); setPicked([]); }} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${mode === value ? "border-transparent bg-ink text-white" : "border-ink/15 bg-white text-soft-ink"}`}>{label}</button>
                ))}
              </div>
            ) : null}

            <div>
              <p className={`${kicker} mb-1.5`}>{mode === "assign" ? "Your students" : "People you are connected to"}</p>
              {connections === null ? <p className="m-0 text-sm text-soft-ink">Loading…</p> : rows.length ? (
                <>
                  {rows.length > 6 ? <input className={`${field} mb-1.5 w-full`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your network" aria-label="Search your network" /> : null}
                  <ul className="m-0 grid max-h-52 list-none gap-1 overflow-y-auto p-0">
                    {people.map((row) => {
                      const has = accessByPerson.get(row.other.id);
                      return (
                        <li key={row.other.id}>
                          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-ink/10 px-3 py-2 text-sm">
                            <input type="checkbox" checked={picked.includes(row.other.id)} onChange={() => toggle(row.other.id)} />
                            <span className="min-w-0 flex-1 truncate font-semibold text-ink">{who(row.other)}</span>
                            {has && mode === "share" ? <span className="text-[11px] text-[var(--accent-ink)]">{has.permission === "edit" ? "can edit" : "can view"}</span> : null}
                            <span className="text-[11px] text-soft-ink">{ROLE_LABEL[row.other.role]}</span>
                          </label>
                        </li>
                      );
                    })}
                    {!people.length ? <li className="px-1 py-2 text-sm text-soft-ink">Nobody matches “{query}”.</li> : null}
                  </ul>
                </>
              ) : <p className="m-0 text-sm text-soft-ink">{noOne && mode === "assign" ? "No connected students yet." : "You are not connected to anyone yet."} Add people in <strong>Connections</strong>; they have to accept first. You can only share with people you are connected to.</p>}
            </div>

            {mode === "share" && live ? (
              <fieldset className="m-0 grid gap-1.5 border-0 p-0">
                <legend className={`${kicker} mb-1.5 p-0`}>What can they do?</legend>
                {PERMISSIONS.map(([value, label, help]) => (
                  <label key={value} className={`flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 text-sm ${permission === value ? "border-[var(--accent)] bg-[rgba(0,113,227,0.05)]" : "border-ink/10"}`}>
                    <input type="radio" name="luna-share-permission" className="mt-1" checked={permission === value} onChange={() => setPermission(value)} />
                    <span><span className="block font-semibold text-ink">{label}</span><span className="block text-[11px] text-soft-ink">{help}</span></span>
                  </label>
                ))}
              </fieldset>
            ) : null}

            {mode === "assign" ? (
              <label className="grid gap-1 text-xs font-semibold text-soft-ink">
                Due date (optional)
                <input className={field} type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
              </label>
            ) : null}
            {mode === "assign" ? (
              <label className="grid gap-1 text-xs font-semibold text-soft-ink">
                Message (optional)
                <input className={field} value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Please do this before Friday" />
              </label>
            ) : null}

            <p className="m-0 text-[11px] text-soft-ink">
              {mode === "assign"
                ? `They receive a read-only copy in Shared documents / ${account.displayName}. Activities appear in their Activities with the due date; study plans come with the activities they use.`
                : live
                  ? `You stay the owner. They find it under Shared with me / ${account.displayName}, and only you can delete it, move it or share it again. ${item.kind === "folder" || item.kind === "subject" ? "Everything inside is included, also what you add later. " : item.document?.tags?.includes("study-plan") ? "A study plan comes with the documents it uses. " : ""}You can take access away at any time.`
                  : `They get their own copy of this ${word}: they can use it and change it, but it is not kept in sync with yours.`}
            </p>

            {success ? <p className="m-0 text-xs text-[var(--accent-ink)]" role="status">{success}</p> : null}
            {error ? <p className="m-0 text-xs text-[var(--color-danger)]" role="alert">{error}</p> : null}

            {live && access?.length ? (
              <div>
                <p className={`${kicker} mb-1.5`}>People with access</p>
                <ul className="m-0 grid list-none gap-1 p-0">
                  {access.map((entry) => (
                    <li key={entry.id} className="flex items-center gap-2 rounded-xl border border-ink/10 px-3 py-1.5 text-sm">
                      <span className="min-w-0 flex-1 truncate font-semibold text-ink">{who(entry.grantee)}</span>
                      <select className={`${field} py-1 text-xs`} value={entry.permission} aria-label={`What ${who(entry.grantee)} can do`} onChange={(event) => changeAccess(entry, event.target.value)}>
                        <option value="view">Can view</option>
                        <option value="edit">Can edit</option>
                      </select>
                      <button type="button" className={ghostBtn} onClick={() => changeAccess(entry, "remove")}>Remove</button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={ghostBtn} onClick={onClose}>{success ? "Done" : "Cancel"}</button>
          {deliverable.ok && !setup ? <button type="button" className={primaryBtn} disabled={busy || !eligible.length} onClick={send}>{busy ? "Sending…" : mode === "assign" ? "Assign" : live ? "Share" : "Send a copy"}</button> : null}
        </div>
      </div>
    </div>
  );
}
