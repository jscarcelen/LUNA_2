"use client";

import { useState } from "react";
import { CreditsBadge } from "../modules/credits/CreditsBadge";
import { roleProfiles } from "./data";
import { ROLE_LABEL, accountsApi } from "../modules/accounts/api";

const initialsOf = (name) => String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("") || "?";

/**
 * Top bar: where you are on the left, who you are on the right. The account cluster holds the
 * credit balance, the storage left and the profile (which is also where the role is switched).
 */
export function TopBar({ title, role = "student", onRoleChange, onOpenMenu, account = null, storage = { usedGb: 2.4, totalGb: 10 } }) {
  const [open, setOpen] = useState(false);
  // In the real platform the profile is the logged-in account: its role is fixed, so there is no role switch, and it can log out.
  const profile = account
    ? { name: account.displayName, subtitle: `${ROLE_LABEL[account.role] || account.role} · ${account.email}`, initials: initialsOf(account.displayName) }
    : (roleProfiles[role] || roleProfiles.student);
  async function logOut() {
    await accountsApi.logout();
    window.location.assign("/");
  }
  const pct = Math.max(0, Math.min(100, Math.round((storage.usedGb / storage.totalGb) * 100)));
  return (
    <header className="top-bar">
      <button className="mobile-menu-btn" type="button" onClick={onOpenMenu} aria-label="Open menu"><span aria-hidden>☰</span></button>
      <div className="top-bar-title-wrap">
        <h2>{title}</h2>
      </div>
      <div className="top-account">
        <CreditsBadge />
        <button type="button" className="storage-chip" title={`${storage.usedGb} GB of ${storage.totalGb} GB used`} onClick={() => setOpen(false)}>
          <span className="storage-chip-bar"><span style={{ width: `${pct}%` }} /></span>
          <span className="storage-chip-text">{(storage.totalGb - storage.usedGb).toFixed(1)} GB free</span>
        </button>
        <div className="profile-wrap">
          <button type="button" className="profile-btn" onClick={() => setOpen((value) => !value)} aria-label="Account">
            <span className="avatar">{profile.initials}</span>
          </button>
          {open ? (
            <div className="profile-menu" onMouseLeave={() => setOpen(false)}>
              <p className="profile-menu-name">{profile.name}</p>
              <p className="profile-menu-sub">{profile.subtitle}</p>
              {account ? null : (
                <div className="role-switch" role="tablist" aria-label="Role selector">
                  {["student", "teacher", "parent"].map((value) => (
                    <button key={value} type="button" className={role === value ? "on" : ""} onClick={() => { onRoleChange?.(value); setOpen(false); }}>
                      {value[0].toUpperCase() + value.slice(1)}
                    </button>
                  ))}
                </div>
              )}
              <p className="profile-menu-storage">{storage.usedGb} GB of {storage.totalGb} GB used</p>
              <div className="storage-meter"><span style={{ width: `${pct}%` }} /></div>
              {account ? <button type="button" className="profile-menu-logout" style={{ marginTop: 10, width: "100%", padding: "8px 12px", borderRadius: 980, border: "1px solid var(--line, #e5e5ea)", background: "#fff", color: "var(--ink, #1d1d1f)", fontSize: 13, fontWeight: 600, cursor: "pointer" }} onClick={logOut}>Log out</button> : null}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
