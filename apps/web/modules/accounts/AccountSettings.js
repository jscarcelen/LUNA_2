"use client";

import { useEffect, useState } from "react";
import { PHONE_HELP, normalizePhone } from "../../lib/phone.js";
import { accountsApi } from "./api";
import { resendMessage } from "./PlatformNotice";
import { SetupNotice } from "./SetupNotice";
import { field, ghostBtn, kicker, primaryBtn } from "./ui";

const label = "mb-1 block text-xs font-semibold text-ink";
const hint = "m-0 mt-1 text-[11px] leading-snug text-soft-ink";
const errorText = "m-0 mt-1 text-xs text-[var(--color-danger)]";

function Section({ title, children }) {
  return (
    <section className="border-t border-ink/10 py-4 first:border-t-0 first:pt-0">
      <p className={`${kicker} mb-2`}>{title}</p>
      {children}
    </section>
  );
}

/**
 * Account settings (opened from the profile menu): the email and whether it is confirmed, the phone
 * (one per account, not verified by SMS yet) and the password. Phone and password changes ask for the
 * current password. Changing the password ends every other session.
 */
export function AccountSettings({ account, onClose }) {
  const [current, setCurrent] = useState(account);
  const [resend, setResend] = useState({ busy: false, message: null });
  const [phone, setPhone] = useState(account.phone || "");
  const [phonePassword, setPhonePassword] = useState("");
  const [phoneState, setPhoneState] = useState({ busy: false, error: "", ok: "", needsSetup: false });
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", passwordConfirm: "" });
  const [pwState, setPwState] = useState({ busy: false, error: "", ok: "" });
  const mismatch = pw.passwordConfirm.length > 0 && pw.newPassword !== pw.passwordConfirm;

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function resendEmail() {
    setResend({ busy: true, message: null });
    setResend({ busy: false, message: resendMessage(await accountsApi.resendVerification()) });
  }

  async function savePhone(event) {
    event.preventDefault();
    if (phoneState.busy) return;
    const parsed = normalizePhone(phone, { required: false });
    if (!parsed.ok) return setPhoneState({ busy: false, error: parsed.error, ok: "", needsSetup: false });
    setPhoneState({ busy: true, error: "", ok: "", needsSetup: false });
    const result = await accountsApi.updatePhone(phone, phonePassword);
    if (result.ok) {
      setCurrent(result.data.account);
      setPhone(result.data.account.phone || "");
      setPhonePassword("");
      return setPhoneState({ busy: false, error: "", ok: result.data.account.phone ? "Saved. It is not verified yet." : "Phone removed.", needsSetup: false });
    }
    setPhoneState({ busy: false, error: result.error, ok: "", needsSetup: result.setupNeeded });
  }

  async function savePassword(event) {
    event.preventDefault();
    if (pwState.busy) return;
    if (pw.newPassword !== pw.passwordConfirm) return setPwState({ busy: false, error: "The two passwords do not match.", ok: "" });
    setPwState({ busy: true, error: "", ok: "" });
    const result = await accountsApi.changePassword(pw);
    if (result.ok) {
      setPw({ currentPassword: "", newPassword: "", passwordConfirm: "" });
      return setPwState({ busy: false, error: "", ok: "Password changed. You were signed out on your other devices." });
    }
    setPwState({ busy: false, error: result.error, ok: "" });
  }

  return (
    <div className="tw-scope fixed inset-0 z-[300] flex items-end justify-center bg-black/40 p-3 sm:items-center" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <div role="dialog" aria-modal="true" aria-label="Account settings" className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-[18px] bg-white p-5 shadow-[0_24px_72px_rgba(0,0,0,0.2)]">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="m-0 text-lg font-bold text-ink">Account settings</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="h-8 w-8 rounded-full bg-[var(--surface-soft)] text-lg text-soft-ink">×</button>
        </div>

        <Section title="Email">
          <p className="m-0 text-sm text-ink [overflow-wrap:anywhere]">{current.email}</p>
          {current.emailVerified ? (
            <p className="m-0 mt-1 text-xs font-semibold text-[#1a7f37]">Confirmed</p>
          ) : (
            <>
              <p className="m-0 mt-1 text-xs font-semibold text-[#b25e00]">Not confirmed yet</p>
              <p className={hint}>Until it is confirmed you cannot connect with other people, share or assign work.</p>
              <button type="button" className={`${ghostBtn} mt-2`} onClick={resendEmail} disabled={resend.busy}>{resend.busy ? "Sending…" : "Resend confirmation email"}</button>
              {resend.message ? <p role={resend.message.tone === "error" ? "alert" : "status"} className={resend.message.tone === "error" ? errorText : hint}>{resend.message.text}{resend.message.link ? <> <a className="font-semibold text-[var(--accent-ink)] underline" href={resend.message.link}>Open the link</a></> : null}</p> : null}
            </>
          )}
        </Section>

        <Section title="Phone">
          <form onSubmit={savePhone} className="flex flex-col gap-2" noValidate>
            <div>
              <label htmlFor="luna-set-phone" className={label}>Phone number</label>
              <input id="luna-set-phone" type="tel" inputMode="tel" autoComplete="tel" className={`${field} w-full`} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+1 415 555 2671" />
              <p className={hint}>{PHONE_HELP} One phone per account. {current.phone ? "Not verified yet: we do not send SMS codes yet." : "Leave empty to have none."}</p>
            </div>
            <div>
              <label htmlFor="luna-set-phone-pw" className={label}>Current password</label>
              <input id="luna-set-phone-pw" type="password" autoComplete="current-password" className={`${field} w-full`} value={phonePassword} onChange={(event) => setPhonePassword(event.target.value)} />
            </div>
            {phoneState.needsSetup ? <SetupNotice compact /> : phoneState.error ? <p role="alert" className={errorText}>{phoneState.error}</p> : null}
            {phoneState.ok ? <p role="status" className="m-0 text-xs text-[#1a7f37]">{phoneState.ok}</p> : null}
            <div><button type="submit" className={primaryBtn} disabled={phoneState.busy}>{phoneState.busy ? "Saving…" : "Save phone"}</button></div>
          </form>
        </Section>

        <Section title="Password">
          <form onSubmit={savePassword} className="flex flex-col gap-2" noValidate>
            <div>
              <label htmlFor="luna-pw-current" className={label}>Current password</label>
              <input id="luna-pw-current" type="password" autoComplete="current-password" className={`${field} w-full`} value={pw.currentPassword} onChange={(event) => setPw({ ...pw, currentPassword: event.target.value })} />
            </div>
            <div>
              <label htmlFor="luna-pw-new" className={label}>New password</label>
              <input id="luna-pw-new" type="password" autoComplete="new-password" className={`${field} w-full`} value={pw.newPassword} onChange={(event) => setPw({ ...pw, newPassword: event.target.value })} placeholder="At least 8 characters" />
            </div>
            <div>
              <label htmlFor="luna-pw-confirm" className={label}>Repeat new password</label>
              <input id="luna-pw-confirm" type="password" autoComplete="new-password" aria-invalid={mismatch || undefined} aria-describedby={mismatch ? "luna-pw-mismatch" : undefined} className={`${field} w-full ${mismatch ? "!border-[var(--color-danger)]" : ""}`} value={pw.passwordConfirm} onChange={(event) => setPw({ ...pw, passwordConfirm: event.target.value })} />
              {mismatch ? <p id="luna-pw-mismatch" role="alert" className={errorText}>The two passwords do not match.</p> : null}
            </div>
            {pwState.error && !mismatch ? <p role="alert" className={errorText}>{pwState.error}</p> : null}
            {pwState.ok ? <p role="status" className="m-0 text-xs text-[#1a7f37]">{pwState.ok}</p> : null}
            <div><button type="submit" className={primaryBtn} disabled={pwState.busy || mismatch}>{pwState.busy ? "Saving…" : "Change password"}</button></div>
          </form>
        </Section>
      </div>
    </div>
  );
}
