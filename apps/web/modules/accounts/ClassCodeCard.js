"use client";

import { useState } from "react";
import { accountsApi } from "./api";
import { SetupNotice } from "./SetupNotice";
import { card, field, kicker, primaryBtn } from "./ui";
import { CLASS_CODES_MIGRATION } from "./classCodeText";
import { useT } from "../../lib/i18n/LocaleProvider.js";

/** Student: join a class with a code. */
function StudentJoin({ onJoined }) {
  const t = useT();
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
    setMessage(`${t("people.code.joinedClass", { name: result.data.joined?.className || t("people.code.theClass") })}${result.data.joined?.teacherName ? ` ${t("people.code.withTeacher", { name: result.data.joined.teacherName })}` : ""}.`);
    setCode("");
    onJoined?.();
  }

  if (setup) return <SetupNotice compact migration={CLASS_CODES_MIGRATION} title={t("people.code.dbStep")} />;
  return (
    <div className={`${card} p-5`}>
      <p className={kicker}>{t("people.code.joinTitle")}</p>
      <p className="m-0 mt-1 text-sm text-soft-ink">{t("people.code.joinIntro")}</p>
      <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={join}>
        <input className={`${field} w-40 font-mono uppercase tracking-[0.2em]`} value={code} maxLength={9} autoComplete="off" spellCheck={false} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="ABC DEF" aria-label={t("people.code.codeAria")} />
        <button type="submit" className={primaryBtn} disabled={busy || !code.trim()}>{t("people.code.join")}</button>
      </form>
      {message ? <p className="m-0 mt-2 text-xs text-[var(--accent-ink)]" role="status">{message}</p> : null}
      {error ? <p className="m-0 mt-2 text-xs text-[var(--color-danger)]" role="alert">{error}</p> : null}
    </div>
  );
}

/** The teacher's classes (codes included) are the gallery at the top of the page: ClassesGallery.js. */
export function ClassCodeCard({ account, onChanged }) {
  if (account?.role === "student") return <StudentJoin onJoined={onChanged} />;
  return null;
}
