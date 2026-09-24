"use client";

import { useEffect, useState } from "react";
import { appName } from "./data";

/**
 * The navigation rail: the Luna mark and the sections of the app, collapsible to icons.
 *
 * Workspaces, storage and the profile no longer live here — a workspace is chosen inside the
 * Workspaces page and the account sits in the top bar — so the rail is only ever about where you
 * are going. The collapsed state is remembered per browser.
 */
export function SideNav({ navItems = [], page, onPageChange, onClose }) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try { setCollapsed(window.localStorage.getItem("luna.nav.collapsed") === "1"); } catch { /* ignore */ }
  }, []);
  function toggle() {
    setCollapsed((value) => {
      const next = !value;
      try { window.localStorage.setItem("luna.nav.collapsed", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }
  const isCurrent = (item) => page === item.key || (item.match ? String(page).startsWith(item.match) : false);

  return (
    <aside className={`side-nav nav-rail${collapsed ? " nav-rail-collapsed" : ""}`}>
      <div className="nav-rail-brand">
        <span className="brand-dot" />
        {collapsed ? null : <span className="nav-rail-word">{appName}</span>}
        <button className="nav-rail-toggle" type="button" onClick={toggle} title={collapsed ? "Expand menu" : "Collapse menu"} aria-label={collapsed ? "Expand menu" : "Collapse menu"}>{collapsed ? "›" : "‹"}</button>
        <button className="mobile-close-btn" type="button" onClick={onClose} aria-label="Close menu">✕</button>
      </div>
      <nav className="nav-rail-items" aria-label="Sections">
        {navItems.map((item) => (
          <button
            key={item.key}
            type="button"
            className={isCurrent(item) ? "nav-rail-item on" : "nav-rail-item"}
            onClick={() => { onPageChange(item.key); onClose?.(); }}
            title={collapsed ? item.label : undefined}
          >
            <span className="nav-rail-icon" aria-hidden>{item.icon || "•"}</span>
            {collapsed ? null : <span className="nav-rail-label">{item.label}</span>}
          </button>
        ))}
      </nav>
    </aside>
  );
}
