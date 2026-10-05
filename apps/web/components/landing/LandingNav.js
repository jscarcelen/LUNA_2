"use client";
import { useEffect, useState } from "react";
import { LunaLogo } from "../brand/LunaLogo.js";

export const TABS = [
  { id: "home", label: "Home" },
  { id: "demo", label: "Demo" },
  { id: "pricing", label: "Pricing", soon: true },
  { id: "training", label: "Training", soon: true }
];

/**
 * Wide screens: the sections sit in the bar. Phones (<= 760px): the bar keeps the logo, Try demo and
 * Log in; the sections (and Sign up) fold into a menu.
 */
export function LandingNav({ tab, setTab, onSignIn, onSignUp }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const pick = (id) => { setTab(id); setOpen(false); };
  return (
    <>
      <header className={`lp-nav${scrolled ? " is-scrolled" : ""}`}>
        <a className="lp-brand" href="/" aria-label="LUNA home" onClick={(e) => { e.preventDefault(); pick("home"); window.scrollTo({ top: 0 }); }}>
          <LunaLogo size={28} />
        </a>
        <nav className="lp-tabs" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={`lp-tab${tab === t.id ? " on" : ""}${t.soon ? " soon" : ""}`} aria-current={tab === t.id ? "page" : undefined} onClick={() => pick(t.id)}>
              {t.label}{t.soon ? <span className="lp-pill">Soon</span> : null}
            </button>
          ))}
          <a className="lp-tab lp-tab-link" href="/app">Try demo <span aria-hidden>↗</span></a>
        </nav>
        <div className="lp-actions">
          <a className="lp-btn lp-btn-ghost lp-try" href="/app">Try demo</a>
          <button type="button" className="lp-btn lp-btn-primary" onClick={onSignIn}>Log in</button>
          <button type="button" className="lp-btn lp-btn-ghost lp-desktop-only" onClick={onSignUp}>Sign up</button>
          <button type="button" className="lp-burger" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{open ? "✕" : "☰"}</button>
        </div>
      </header>
      {open ? (
        <div className="lp-menu" role="menu">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="menuitem" className={tab === t.id ? "on" : ""} onClick={() => pick(t.id)}>
              {t.label}{t.soon ? <span className="lp-pill">Soon</span> : null}
            </button>
          ))}
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onSignUp(); }}>Sign up</button>
        </div>
      ) : null}
    </>
  );
}
