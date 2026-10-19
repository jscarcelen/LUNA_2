"use client";

import { useCallback, useEffect, useState } from "react";
import { accountsApi } from "./api";
import { SetupNotice } from "./SetupNotice";
import { card, field, ghostBtn, kicker, primaryBtn } from "./ui";
import { CLASS_CODES_MIGRATION, SCHOOL_CONSENT_STATEMENT, formatClassCode } from "./classCodeText";

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }
  return <button type="button" className={ghostBtn} onClick={copy}>{copied ? "Copied" : "Copy code"}</button>;
}

/** Teacher: create classes, show each code big, copy / regenerate / switch off, list the students who joined. */
function TeacherClasses() {
  const [classes, setClasses] = useState(null);
  const [setup, setSetup] = useState(false);
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const apply = useCallback((result) => {
    if (result.setupNeeded) { setSetup(true); return false; }
    if (!result.ok) { setError(result.error); return false; }
    setClasses(result.data.classes || []);
    return true;
  }, []);
  useEffect(() => { accountsApi.classes().then(apply); }, [apply]);

  async function run(promise) {
    setBusy(true);
    setError("");
    const ok = apply(await promise);
    setBusy(false);
    return ok;
  }

  async function create(event) {
    event.preventDefault();
    if (!name.trim()) return;
    if (await run(accountsApi.createClass({ name, schoolConsent: consent }))) { setName(""); setConsent(false); }
  }

  if (setup) return <SetupNotice compact migration={CLASS_CODES_MIGRATION} title="Class codes need one database step" />;

  return (
    <div className={`${card} p-5`}>
      <p className={kicker}>Your class code</p>
      <p className="m-0 mt-1 text-sm text-soft-ink">Create a class and give your students its code. They enter it when they sign up, or later in People, and are connected to you and added to the class straight away, with no request to accept.</p>

      {(classes || []).map((item) => (
        <div key={item.id} className="mt-3 rounded-xl border border-ink/10 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="m-0 text-sm font-semibold text-ink">{item.name}</p>
            <span className="text-[11px] text-soft-ink">{item.enabled ? "Joining is on" : "Joining is off"}{item.schoolConsent ? " · school consent for under-14s confirmed" : ""}</span>
          </div>
          <p className="m-0 mt-2 font-mono text-4xl font-bold tracking-[0.25em] text-ink" aria-label={`Class code ${item.code.split("").join(" ")}`} style={{ opacity: item.enabled ? 1 : 0.4 }}>{formatClassCode(item.code)}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <CopyButton text={item.code} />
            <button type="button" className={ghostBtn} disabled={busy} onClick={() => { if (window.confirm("Make a new code? The old one stops working, students already in the class stay.")) run(accountsApi.regenerateClassCode(item.id)); }}>New code</button>
            <button type="button" className={ghostBtn} disabled={busy} onClick={() => run(accountsApi.setClassEnabled(item.id, !item.enabled))}>{item.enabled ? "Turn joining off" : "Turn joining on"}</button>
          </div>
          <p className="m-0 mt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-soft-ink">Joined ({item.members.length})</p>
          {item.members.length ? (
            <ul className="m-0 mt-1 grid list-none gap-0.5 p-0 text-sm text-ink">
              {item.members.map((student) => <li key={student.id} className="truncate">{student.displayName || student.email}<span className="text-[11px] text-soft-ink">{student.displayName ? ` · ${student.email}` : ""}</span></li>)}
            </ul>
          ) : <p className="m-0 mt-1 text-xs text-soft-ink">Nobody has joined yet.</p>}
        </div>
      ))}

      <form className="mt-3 grid gap-2" onSubmit={create}>
        <div className="flex flex-wrap items-center gap-2">
          <input className={`${field} min-w-[12rem] flex-1`} value={name} maxLength={60} onChange={(event) => setName(event.target.value)} placeholder="Class name, for example 2B Biology" aria-label="Class name" />
          <button type="submit" className={primaryBtn} disabled={busy || !name.trim()}>Create class</button>
        </div>
        <label className="flex items-start gap-2 text-xs leading-5 text-ink">
          <input type="checkbox" className="mt-1" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
          <span>{SCHOOL_CONSENT_STATEMENT}. <span className="text-soft-ink">Leave it unticked if you are not sure: under-14s then still need a parent or guardian to agree by email.</span></span>
        </label>
      </form>
      {error ? <p className="m-0 mt-2 text-xs text-[var(--color-danger)]" role="alert">{error}</p> : null}
    </div>
  );
}

/** Student: join a class with a code. */
function StudentJoin({ onJoined }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [setup, setSetup] = useState(false);

  async function join(event) {
    event.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    const result = await accountsApi.joinClass(code);
    setBusy(false);
    if (result.setupNeeded) { setSetup(true); return; }
    if (!result.ok) { setError(result.error); return; }
    setMessage(`You joined ${result.data.joined?.className || "the class"}${result.data.joined?.teacherName ? ` with ${result.data.joined.teacherName}` : ""}.`);
    setCode("");
    onJoined?.();
  }

  if (setup) return <SetupNotice compact migration={CLASS_CODES_MIGRATION} title="Class codes need one database step" />;
  return (
    <div className={`${card} p-5`}>
      <p className={kicker}>Join a class with a code</p>
      <p className="m-0 mt-1 text-sm text-soft-ink">Your teacher can give you a 6-letter code. Enter it to join their class straight away.</p>
      <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={join}>
        <input className={`${field} w-40 font-mono uppercase tracking-[0.2em]`} value={code} maxLength={9} autoComplete="off" spellCheck={false} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="ABC DEF" aria-label="Class code" />
        <button type="submit" className={primaryBtn} disabled={busy || !code.trim()}>Join class</button>
      </form>
      {message ? <p className="m-0 mt-2 text-xs text-[var(--accent-ink)]" role="status">{message}</p> : null}
      {error ? <p className="m-0 mt-2 text-xs text-[var(--color-danger)]" role="alert">{error}</p> : null}
    </div>
  );
}

export function ClassCodeCard({ account, onChanged }) {
  if (account?.role === "teacher") return <TeacherClasses />;
  if (account?.role === "student") return <StudentJoin onJoined={onChanged} />;
  return null;
}
