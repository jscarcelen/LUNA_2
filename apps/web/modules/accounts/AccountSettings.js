"use client";

import { useEffect, useState } from "react";
import { normalizePhone } from "../../lib/phone.js";
import { accountsApi } from "./api";
import { resendMessage } from "./PlatformNotice";
import { SetupNotice } from "./SetupNotice";
import { field, ghostBtn, kicker, primaryBtn } from "./ui";
import { LanguageSwitch } from "../../lib/i18n/LanguageSwitch.js";
import { useT } from "../../lib/i18n/LocaleProvider.js";
import { askConfirm } from "../ui/dialogs.js";

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
export function AccountSettings({ account, onClose, onAccountChange }) {
  const t = useT();
  const [current, setCurrentLocal] = useState(account);
  // Tell the app shell too, so the name on Home / the menu changes the moment it is saved.
  const setCurrent = (next) => { setCurrentLocal(next); if (next) onAccountChange?.(next); };
  const [resend, setResend] = useState({ busy: false, message: null });
  const [phone, setPhone] = useState(account.phone || "");
  const [phonePassword, setPhonePassword] = useState("");
  const [phoneState, setPhoneState] = useState({ busy: false, error: "", ok: "", needsSetup: false });
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", passwordConfirm: "" });
  const [pwState, setPwState] = useState({ busy: false, error: "", ok: "" });
  const [profile, setProfile] = useState({ age: "", plan: "free", ready: true });
  const [name, setName] = useState(account.displayName || "");
  const [profileState, setProfileState] = useState({ busy: false, error: "", ok: "", needsSetup: false });
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailState, setEmailState] = useState({ busy: false, error: "", ok: "" });
  const [link, setLink] = useState({ busy: false, message: "", error: "" });
  const mismatch = pw.passwordConfirm.length > 0 && pw.newPassword !== pw.passwordConfirm;

  useEffect(() => {
    let cancelled = false;
    accountsApi.me().then((result) => {
      if (cancelled || !result.ok || !result.data?.profile) return;
      setProfile({ age: result.data.profile.age ?? "", plan: result.data.profile.plan || "free", ready: result.data.profile.ready !== false });
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const [deletePw, setDeletePw] = useState({ value: "", busy: false, error: "" });
  async function deleteAccount(event) {
    event.preventDefault();
    if (deletePw.busy || !(await askConfirm({ message: t("misc.acct.confirmDelete"), confirmLabel: t("common.delete"), danger: true }))) return;
    setDeletePw({ ...deletePw, busy: true, error: "" });
    const result = await accountsApi.deleteAccount(deletePw.value);
    if (result.ok) { window.location.assign("/?deleted=1"); return; }
    setDeletePw({ value: "", busy: false, error: result.error });
  }

  async function resendEmail() {
    setResend({ busy: true, message: null });
    setResend({ busy: false, message: resendMessage(await accountsApi.resendVerification()) });
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (profileState.busy) return;
    setProfileState({ busy: true, error: "", ok: "", needsSetup: false });
    const patch = { displayName: name };
    if (profile.ready) { patch.age = profile.age === "" ? null : Number(profile.age); patch.plan = profile.plan; }
    const result = await accountsApi.updateProfile(patch);
    if (result.ok) {
      setCurrent(result.data.account);
      return setProfileState({ busy: false, error: "", ok: t("misc.acct.saved"), needsSetup: false });
    }
    setProfileState({ busy: false, error: result.error, ok: "", needsSetup: result.setupNeeded });
  }

  async function saveEmail(event) {
    event.preventDefault();
    if (emailState.busy) return;
    setEmailState({ busy: true, error: "", ok: "" });
    const result = await accountsApi.changeEmail(newEmail, emailPassword);
    if (result.ok) {
      setCurrent(result.data.account);
      setNewEmail("");
      setEmailPassword("");
      return setEmailState({ busy: false, error: "", ok: t("misc.acct.emailChanged") });
    }
    setEmailState({ busy: false, error: result.error, ok: "" });
  }

  async function sendResetLink() {
    setLink({ busy: true, message: "", error: "" });
    const result = await accountsApi.sendResetLink();
    setLink(result.ok ? { busy: false, message: result.data.message || t("misc.acct.linkSent"), error: "" } : { busy: false, message: "", error: result.error });
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
      return setPhoneState({ busy: false, error: "", ok: result.data.account.phone ? t("misc.acct.phoneSaved") : t("misc.acct.phoneRemoved"), needsSetup: false });
    }
    setPhoneState({ busy: false, error: result.error, ok: "", needsSetup: result.setupNeeded });
  }

  async function savePassword(event) {
    event.preventDefault();
    if (pwState.busy) return;
    if (pw.newPassword !== pw.passwordConfirm) return setPwState({ busy: false, error: t("misc.acct.mismatch"), ok: "" });
    setPwState({ busy: true, error: "", ok: "" });
    const result = await accountsApi.changePassword(pw);
    if (result.ok) {
      setPw({ currentPassword: "", newPassword: "", passwordConfirm: "" });
      return setPwState({ busy: false, error: "", ok: t("misc.acct.pwChanged") });
    }
    setPwState({ busy: false, error: result.error, ok: "" });
  }

  return (
    <div className="tw-scope fixed inset-0 z-[300] flex items-end justify-center bg-black/40 p-3 sm:items-center" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <div role="dialog" aria-modal="true" aria-label={t("misc.acct.title")} className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-[18px] bg-white p-5 shadow-[0_24px_72px_rgba(0,0,0,0.2)]">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="m-0 text-lg font-bold text-ink">{t("misc.acct.title")}</h2>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="h-8 w-8 rounded-full bg-[var(--surface-soft)] text-lg text-soft-ink">×</button>
        </div>

        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-[var(--surface-soft)] px-3 py-2">
          <span className="text-sm font-semibold text-ink">{t("misc.acct.language")}</span>
          <LanguageSwitch />
        </div>

        <Section title={t("misc.acct.profile")}>
          <form onSubmit={saveProfile} className="flex flex-col gap-2" noValidate>
            <div>
              <label htmlFor="luna-set-name" className={label}>{t("misc.acct.name")}</label>
              <input id="luna-set-name" type="text" autoComplete="name" maxLength={60} className={`${field} w-full`} value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div>
              <label htmlFor="luna-set-age" className={label}>{t("misc.acct.age")}</label>
              <input id="luna-set-age" type="number" inputMode="numeric" min={3} max={120} className={`${field} w-full`} value={profile.age} onChange={(event) => setProfile({ ...profile, age: event.target.value })} disabled={!profile.ready} placeholder={t("common.optional")} />
            </div>
            <div>
              <label htmlFor="luna-set-plan" className={label}>{t("misc.acct.plan")}</label>
              <select id="luna-set-plan" className={`${field} w-full`} value={profile.plan} onChange={(event) => setProfile({ ...profile, plan: event.target.value })} disabled={!profile.ready}>
                <option value="free">{t("misc.acct.free")}</option>
                <option value="paid">{t("misc.acct.paid")}</option>
              </select>
              <p className={hint}>{t("misc.acct.planHint")}</p>
            </div>
            {!profile.ready ? <p className={hint}>{t("misc.acct.profileLater")}</p> : null}
            {profileState.needsSetup ? <SetupNotice compact /> : profileState.error ? <p role="alert" className={errorText}>{profileState.error}</p> : null}
            {profileState.ok ? <p role="status" className="m-0 text-xs text-[#1a7f37]">{profileState.ok}</p> : null}
            <div><button type="submit" className={primaryBtn} disabled={profileState.busy}>{profileState.busy ? t("misc.acct.saving") : t("misc.acct.saveProfile")}</button></div>
          </form>
        </Section>

        <Section title={t("misc.acct.email")}>
          <p className="m-0 text-sm text-ink [overflow-wrap:anywhere]">{current.email}</p>
          {current.emailVerified ? (
            <p className="m-0 mt-1 text-xs font-semibold text-[#1a7f37]">{t("misc.acct.confirmed")}</p>
          ) : (
            <>
              <p className="m-0 mt-1 text-xs font-semibold text-[#b25e00]">{t("misc.acct.notConfirmed")}</p>
              <p className={hint}>{t("misc.acct.needConfirm")}</p>
              <button type="button" className={`${ghostBtn} mt-2`} onClick={resendEmail} disabled={resend.busy}>{resend.busy ? t("misc.acct.sending") : t("misc.acct.resend")}</button>
              {resend.message ? <p role={resend.message.tone === "error" ? "alert" : "status"} className={resend.message.tone === "error" ? errorText : hint}>{resend.message.text}{resend.message.link ? <> <a className="font-semibold text-[var(--accent-ink)] underline" href={resend.message.link}>{t("misc.acct.openLink")}</a></> : null}</p> : null}
            </>
          )}
          <form onSubmit={saveEmail} className="mt-3 flex flex-col gap-2 border-t border-ink/10 pt-3" noValidate>
            <div>
              <label htmlFor="luna-set-email" className={label}>{t("misc.acct.newEmail")}</label>
              <input id="luna-set-email" type="email" autoComplete="email" className={`${field} w-full`} value={newEmail} onChange={(event) => setNewEmail(event.target.value)} />
            </div>
            <div>
              <label htmlFor="luna-set-email-pw" className={label}>{t("misc.acct.currentPw")}</label>
              <input id="luna-set-email-pw" type="password" autoComplete="current-password" className={`${field} w-full`} value={emailPassword} onChange={(event) => setEmailPassword(event.target.value)} />
            </div>
            {emailState.error ? <p role="alert" className={errorText}>{emailState.error}</p> : null}
            {emailState.ok ? <p role="status" className="m-0 text-xs text-[#1a7f37]">{emailState.ok}</p> : null}
            <div><button type="submit" className={ghostBtn} disabled={emailState.busy || !newEmail.trim()}>{emailState.busy ? t("misc.acct.saving") : t("misc.acct.changeEmail")}</button></div>
          </form>
        </Section>

        <Section title={t("misc.acct.phone")}>
          <form onSubmit={savePhone} className="flex flex-col gap-2" noValidate>
            <div>
              <label htmlFor="luna-set-phone" className={label}>{t("misc.acct.phoneNumber")}</label>
              <input id="luna-set-phone" type="tel" inputMode="tel" autoComplete="tel" className={`${field} w-full`} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+1 415 555 2671" />
              <p className={hint}>{t("misc.acct.phoneHelp")} {t("misc.acct.onePhone")} {current.phone ? t("misc.acct.phoneNotVerified") : t("misc.acct.phoneEmpty")}</p>
            </div>
            <div>
              <label htmlFor="luna-set-phone-pw" className={label}>{t("misc.acct.currentPw")}</label>
              <input id="luna-set-phone-pw" type="password" autoComplete="current-password" className={`${field} w-full`} value={phonePassword} onChange={(event) => setPhonePassword(event.target.value)} />
            </div>
            {phoneState.needsSetup ? <SetupNotice compact /> : phoneState.error ? <p role="alert" className={errorText}>{phoneState.error}</p> : null}
            {phoneState.ok ? <p role="status" className="m-0 text-xs text-[#1a7f37]">{phoneState.ok}</p> : null}
            <div><button type="submit" className={primaryBtn} disabled={phoneState.busy}>{phoneState.busy ? t("misc.acct.saving") : t("misc.acct.savePhone")}</button></div>
          </form>
        </Section>

        <Section title={t("misc.acct.password")}>
          <div className="mb-3 border-b border-ink/10 pb-3">
            <p className={`${hint} mt-0 mb-2`}>{t("misc.acct.resetIntro", { email: current.email })}</p>
            <button type="button" className={ghostBtn} onClick={sendResetLink} disabled={link.busy}>{link.busy ? t("misc.acct.sending") : t("misc.acct.emailReset")}</button>
            {link.message ? <p role="status" className="m-0 mt-1 text-xs text-[#1a7f37]">{link.message}</p> : null}
            {link.error ? <p role="alert" className={errorText}>{link.error}</p> : null}
          </div>
          <form onSubmit={savePassword} className="flex flex-col gap-2" noValidate>
            <div>
              <label htmlFor="luna-pw-current" className={label}>{t("misc.acct.currentPw")}</label>
              <input id="luna-pw-current" type="password" autoComplete="current-password" className={`${field} w-full`} value={pw.currentPassword} onChange={(event) => setPw({ ...pw, currentPassword: event.target.value })} />
            </div>
            <div>
              <label htmlFor="luna-pw-new" className={label}>{t("misc.acct.newPw")}</label>
              <input id="luna-pw-new" type="password" autoComplete="new-password" className={`${field} w-full`} value={pw.newPassword} onChange={(event) => setPw({ ...pw, newPassword: event.target.value })} placeholder={t("misc.acct.atLeast8")} />
            </div>
            <div>
              <label htmlFor="luna-pw-confirm" className={label}>{t("misc.acct.repeatPw")}</label>
              <input id="luna-pw-confirm" type="password" autoComplete="new-password" aria-invalid={mismatch || undefined} aria-describedby={mismatch ? "luna-pw-mismatch" : undefined} className={`${field} w-full ${mismatch ? "!border-[var(--color-danger)]" : ""}`} value={pw.passwordConfirm} onChange={(event) => setPw({ ...pw, passwordConfirm: event.target.value })} />
              {mismatch ? <p id="luna-pw-mismatch" role="alert" className={errorText}>{t("misc.acct.mismatch")}</p> : null}
            </div>
            {pwState.error && !mismatch ? <p role="alert" className={errorText}>{pwState.error}</p> : null}
            {pwState.ok ? <p role="status" className="m-0 text-xs text-[#1a7f37]">{pwState.ok}</p> : null}
            <div><button type="submit" className={primaryBtn} disabled={pwState.busy || mismatch}>{pwState.busy ? t("misc.acct.saving") : t("misc.acct.changePw")}</button></div>
          </form>
        </Section>

        <Section title={t("misc.acct.data")}>
          <p className={hint}>{t("misc.acct.dataIntro")} {t("misc.acct.read")} <a className="text-[var(--accent)] underline" href="/privacy" target="_blank" rel="noopener">{t("misc.acct.privacy")}</a>, <a className="text-[var(--accent)] underline" href="/terms" target="_blank" rel="noopener">{t("misc.acct.terms")}</a> {t("misc.acct.and")} <a className="text-[var(--accent)] underline" href="/ai" target="_blank" rel="noopener">{t("misc.acct.aiNotice")}</a>.</p>
          <div className="mt-2"><a className={ghostBtn} href="/api/accounts/data" download>{t("misc.acct.download")}</a></div>
          <form onSubmit={deleteAccount} className="mt-3 flex flex-col gap-2 border-t border-ink/10 pt-3" noValidate>
            <p className="m-0 text-sm font-semibold text-ink">{t("misc.acct.deleteTitle")}</p>
            <p className={hint}>{t("misc.acct.deleteHint")}</p>
            <input id="luna-del-pw" type="password" aria-label={t("misc.acct.currentPw")} autoComplete="current-password" className={`${field} w-full`} value={deletePw.value} onChange={(event) => setDeletePw({ ...deletePw, value: event.target.value })} />
            {deletePw.error ? <p role="alert" className={errorText}>{deletePw.error}</p> : null}
            <div><button type="submit" className={`${ghostBtn} !text-[var(--color-danger)]`} disabled={deletePw.busy || !deletePw.value}>{deletePw.busy ? t("misc.acct.working") : t("misc.acct.deleteTitle")}</button></div>
          </form>
        </Section>
      </div>
    </div>
  );
}
