"use client";
import { useEffect, useState } from "react";
import { LunaLogo } from "../brand/LunaLogo.js";
import { useT } from "../../lib/i18n/LocaleProvider.js";
import { LanguageSwitch } from "../../lib/i18n/LanguageSwitch.js";

/** `label` is the English text; the screen shows t(`landing.nav.${id}`). */
export const TABS = [
  { id: "home", label: "Home" },
  { id: "demo", label: "Demo" },
  { id: "trust", label: "Trust" },
  { id: "pricing", label: "Pricing", soon: true },
  { id: "training", label: "Training", soon: true }
];

/**
 * Wide screens: the sections sit in the bar. Phones (<= 760px): the bar keeps the logo, Try demo and
 * Log in; the sections (and Sign up) fold into a menu.
 */
export function LandingNav({ tab, setTab, onSignIn, onSignUp }) {
  const t = useT();
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
        <a className="lp-brand" href="/" aria-label={t("landing.nav.homeAria")} onClick={(e) => { e.preventDefault(); pick("home"); window.scrollTo({ top: 0 }); }}>
          <LunaLogo size={28} />
        </a>
        <nav className="lp-tabs" aria-label={t("landing.nav.sectionsAria")}>
          {TABS.map((item) => (
            <button key={item.id} type="button" className={`lp-tab${tab === item.id ? " on" : ""}${item.soon ? " soon" : ""}`} aria-current={tab === item.id ? "page" : undefined} onClick={() => pick(item.id)}>
              {t(`landing.nav.${item.id}`)}{item.soon ? <span className="lp-pill">{t("landing.nav.soon")}</span> : null}
            </button>
          ))}
          <a className="lp-tab lp-tab-link" href="/app">{t("landing.nav.tryDemo")} <span aria-hidden>↗</span></a>
        </nav>
        <div className="lp-actions">
          <LanguageSwitch className="lp-lang" />
          <a className="lp-btn lp-btn-ghost lp-try" href="/app">{t("landing.nav.tryDemo")}</a>
          <button type="button" className="lp-btn lp-btn-primary" onClick={onSignIn}>{t("landing.nav.login")}</button>
          <button type="button" className="lp-btn lp-btn-ghost lp-desktop-only" onClick={onSignUp}>{t("landing.nav.signup")}</button>
          <button type="button" className="lp-burger" aria-label={t("landing.nav.menu")} aria-expanded={open} onClick={() => setOpen((v) => !v)}>{open ? "✕" : "☰"}</button>
        </div>
      </header>
      {open ? (
        <div className="lp-menu" role="menu">
          {TABS.map((item) => (
            <button key={item.id} type="button" role="menuitem" className={tab === item.id ? "on" : ""} onClick={() => pick(item.id)}>
              {t(`landing.nav.${item.id}`)}{item.soon ? <span className="lp-pill">{t("landing.nav.soon")}</span> : null}
            </button>
          ))}
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onSignUp(); }}>{t("landing.nav.signup")}</button>
        </div>
      ) : null}
    </>
  );
}
