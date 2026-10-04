"use client";

import { useEffect, useMemo, useState } from "react";
import { ROLE_LABEL, accountsApi } from "./api";
import { SetupNotice } from "./SetupNotice";
import { classifyDeliverable } from "./shared";
import { field, ghostBtn, kicker, primaryBtn } from "./ui";

/**
 * "Share with…": send a document or generated resource (or, for a teacher or parent, assign an
 * activity or a study plan with a due date) to people you are connected to. The receiver gets a read-only
 * copy under "Shared documents / <your name>". Who may receive what is decided on the server.
 */
export function ShareDialog({ account, document, onClose, onDone }) {
  const [connections, setConnections] = useState(null);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [picked, setPicked] = useState([]);
  const [mode, setMode] = useState("share");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    accountsApi.connections().then((result) => {
      if (!live) return;
      if (result.setupNeeded) setSetupNeeded(true);
      else if (!result.ok) setError(result.error);
      else setConnections(result.data.connections);
    });
    return () => { live = false; };
  }, []);

  const canAssignRole = account.role === "teacher" || account.role === "parent";
  const assignable = canAssignRole && classifyDeliverable(document, "assign").ok;
  const deliverable = classifyDeliverable(document, "share");
  const people = useMemo(() => (connections?.accepted || []).map((row) => row.other).filter((other) => other.id && (mode !== "assign" || other.role === "student")), [connections, mode]);

  function toggle(id) { setPicked((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id])); }

  async function send() {
    setBusy(true);
    setError("");
    const result = await accountsApi.send({ mode, documentId: document.id, recipientIds: picked.filter((id) => people.some((person) => person.id === id)), dueDate: mode === "assign" ? dueDate : "", note });
    setBusy(false);
    if (result.setupNeeded) { setSetupNeeded(true); return; }
    if (!result.ok) { setError(result.error); return; }
    const results = result.data.results || [];
    const okCount = results.filter((entry) => entry.ok).length;
    const failed = results.filter((entry) => !entry.ok);
    onDone?.(`${mode === "assign" ? "Assigned" : "Shared"} “${document.name}” with ${okCount} ${okCount === 1 ? "person" : "people"}${failed.length ? ` · ${failed.length} could not be sent: ${failed[0].error}` : ""}.`);
    onClose?.();
  }

  return (
    <div className="tw-scope fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Share" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-[0_24px_64px_rgba(0,0,0,0.25)]" onClick={(event) => event.stopPropagation()}>
        <p className={kicker}>{mode === "assign" ? "Assign" : "Share with…"}</p>
        <h3 className="m-0 mt-1 truncate text-base font-bold text-ink">{document.name}</h3>

        {setupNeeded ? <div className="mt-3"><SetupNotice compact /></div> : !deliverable.ok ? (
          <p className="m-0 mt-3 text-sm text-soft-ink">{deliverable.error}</p>
        ) : (
          <div className="mt-3 grid gap-3">
            {assignable ? (
              <div className="flex gap-1.5" role="tablist" aria-label="How to send">
                {[["share", "Share (read-only copy)"], ["assign", "Assign with a due date"]].map(([value, label]) => (
                  <button key={value} type="button" role="tab" aria-selected={mode === value} onClick={() => { setMode(value); setPicked([]); }} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${mode === value ? "border-transparent bg-ink text-white" : "border-ink/15 bg-white text-soft-ink"}`}>{label}</button>
                ))}
              </div>
            ) : null}

            <div>
              <p className={`${kicker} mb-1.5`}>{mode === "assign" ? "Students" : "People you are connected to"}</p>
              {connections === null ? <p className="m-0 text-sm text-soft-ink">Loading…</p> : people.length ? (
                <ul className="m-0 grid max-h-52 list-none gap-1 overflow-y-auto p-0">
                  {people.map((person) => (
                    <li key={person.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-ink/10 px-3 py-2 text-sm">
                        <input type="checkbox" checked={picked.includes(person.id)} onChange={() => toggle(person.id)} />
                        <span className="min-w-0 flex-1 truncate font-semibold text-ink">{person.displayName || person.email}</span>
                        <span className="text-[11px] text-soft-ink">{ROLE_LABEL[person.role]}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : <p className="m-0 text-sm text-soft-ink">{mode === "assign" ? "No connected students yet." : "You are not connected to anyone yet."} Add them in <strong>Connections</strong>; they have to accept first.</p>}
            </div>

            {mode === "assign" ? (
              <label className="grid gap-1 text-xs font-semibold text-soft-ink">
                Due date (optional)
                <input className={field} type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
              </label>
            ) : null}
            <label className="grid gap-1 text-xs font-semibold text-soft-ink">
              Message (optional)
              <input className={field} value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Please do this before Friday" />
            </label>
            <p className="m-0 text-[11px] text-soft-ink">
              They receive a read-only copy in <strong>Shared documents / {account.displayName}</strong>. They can read it, highlight it and take their own notes, but not change it.
              {mode === "assign" ? " Activities appear in their Activities with the due date; study plans come with the activities they use." : ""}
            </p>
            {error ? <p className="m-0 text-xs text-[var(--color-danger)]" role="alert">{error}</p> : null}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={ghostBtn} onClick={onClose}>Cancel</button>
          {deliverable.ok && !setupNeeded ? <button type="button" className={primaryBtn} disabled={busy || !picked.length} onClick={send}>{busy ? "Sending…" : mode === "assign" ? "Assign" : "Share"}</button> : null}
        </div>
      </div>
    </div>
  );
}
