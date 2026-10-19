"use client";

import { useState } from "react";
import { CreditsBadge } from "../modules/credits/CreditsBadge";
import { roleProfiles } from "./data";
import { ROLE_LABEL, accountsApi } from "../modules/accounts/api";
import { AccountSettings } from "../modules/accounts/AccountSettings";
import { NotificationsBell } from "../modules/accounts/NotificationsBell";
import { PageHelp } from "./PageHelp";
import { AskLunaMenu } from "../modules/chat/AskLunaMenu";
import { useT } from "../lib/i18n/LocaleProvider.js";
import { LanguageSwitch } from "../lib/i18n/LanguageSwitch.js";
import { LunaLogo } from "./brand/LunaLogo.js";

const initialsOf = (name) => String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("") || "?";

/**
 * Top bar: where you are on the left, who you are on the right. The account cluster holds the
 * credit balance, the storage left and the profile (which is also where the role is switched).
 *
 * `compact` is the student phone app on one of its four tab pages: the page draws its own large title, so the bar shows
 * the LUNA mark, and there is no menu button (the tabs are the navigation). `moreLinks` (`{ label, page }`) are the
 * website pages a phone student reaches from the profile menu instead of the side rail.
 */
export function TopBar({ title, shortTitle = "", page = "dashboard", role = "student", onRoleChange, onOpenMenu, onOpenPage, askLunaClaimed = false, account = null, onAccountChange, storage = { usedGb: 2.4, totalGb: 10 }, compact = false, hideMenuButton = false, moreLinks = [] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // In the real platform the profile is the logged-in account: its role is fixed, so there is no role switch, and it can log out.
  const profile = account
    ? { name: account.displayName, subtitle: `${ROLE_LABEL[account.role] ? t(`shell.role.${account.role}`) : account.role} · ${account.email}`, initials: initialsOf(account.displayName) }
    : (roleProfiles[role] || roleProfiles.student);
  async function logOut() {
    await accountsApi.logout();
    window.location.assign("/");
  }
  const pct = Math.max(0, Math.min(100, Math.round((storage.usedGb / storage.totalGb) * 100)));
  return (
    <>
    <header className={`top-bar${compact ? " top-bar-compact" : ""}`}>
      {hideMenuButton ? null : <button className="mobile-menu-btn" type="button" onClick={onOpenMenu} aria-label={t("shell.openMenu")}><span aria-hidden>☰</span></button>}
      <div className="top-bar-title-wrap">
        {compact ? <LunaLogo size={24} label="LUNA" /> : <h2>{shortTitle && shortTitle !== title ? <><span className="top-title-full">{title}</span><span className="top-title-short">{shortTitle}</span></> : title}</h2>}
        {compact ? null : <PageHelp page={page} role={role} />}
      </div>
      <div className="top-account">
        <LanguageSwitch className="top-lang" />
        <AskLunaMenu variant="bar" claimed={askLunaClaimed} />
        {account ? <NotificationsBell onOpenPage={onOpenPage} /> : null}
        <CreditsBadge />
        <div className="profile-wrap">
          <button type="button" className="profile-btn" onClick={() => setOpen((value) => !value)} aria-label={t("shell.account")}>
            <span className="avatar">{profile.initials}</span>
          </button>
          {open ? (
            <div className="profile-menu" onMouseLeave={() => setOpen(false)}>
              <p className="profile-menu-name">{profile.name}</p>
              <p className="profile-menu-sub">{profile.subtitle}</p>
              {account ? null : (
                <div className="role-switch" role="tablist" aria-label={t("shell.roleSelector")}>
                  {["student", "teacher", "parent"].map((value) => (
                    <button key={value} type="button" className={role === value ? "on" : ""} onClick={() => { onRoleChange?.(value); setOpen(false); }}>
                      {t(`shell.role.${value}`)}
                    </button>
                  ))}
                </div>
              )}
              <p className="profile-menu-storage">{t("shell.storage", { used: storage.usedGb, total: storage.totalGb })}</p>
              <div className="storage-meter"><span style={{ width: `${pct}%` }} /></div>
              {moreLinks.length ? (
                <nav className="profile-menu-more" aria-label={t("mobile.more")}>
                  {moreLinks.map((link) => <button key={link.page} type="button" onClick={() => { setOpen(false); onOpenPage?.(link.page); }}>{link.label}</button>)}
                </nav>
              ) : null}
              {account ? <button type="button" style={{ marginTop: 10, width: "100%", padding: "8px 12px", borderRadius: 980, border: "1px solid var(--line, #e5e5ea)", background: "#fff", color: "var(--ink, #1d1d1f)", fontSize: 13, fontWeight: 600, cursor: "pointer" }} onClick={() => { setOpen(false); onOpenPage?.("connections"); }}>{t("shell.people")}</button> : null}
              {account ? <button type="button" style={{ marginTop: 10, width: "100%", padding: "8px 12px", borderRadius: 980, border: "1px solid var(--line, #e5e5ea)", background: "#fff", color: "var(--ink, #1d1d1f)", fontSize: 13, fontWeight: 600, cursor: "pointer" }} onClick={() => { setOpen(false); setSettingsOpen(true); }}>{t("shell.settings")}{account.emailVerified === false ? t("shell.confirmEmail") : ""}</button> : null}
              {account ? <button type="button" className="profile-menu-logout" style={{ marginTop: 10, width: "100%", padding: "8px 12px", borderRadius: 980, border: "1px solid var(--line, #e5e5ea)", background: "#fff", color: "var(--ink, #1d1d1f)", fontSize: 13, fontWeight: 600, cursor: "pointer" }} onClick={logOut}>{t("shell.logout")}</button> : null}
            </div>
          ) : null}
        </div>
      </div>
    </header>
    {account && settingsOpen ? <AccountSettings account={account} onAccountChange={onAccountChange} onClose={() => setSettingsOpen(false)} /> : null}
    </>
  );
}
