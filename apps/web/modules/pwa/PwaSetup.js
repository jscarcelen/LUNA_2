"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "luna.installHint.dismissed";

/** Registers the service worker, and on iPhone Safari (where there is no install prompt) shows how to add LUNA to the Home Screen. */
export function PwaSetup() {
  const [hint, setHint] = useState(false);
  useEffect(() => {
    if ("serviceWorker" in navigator && window.location.protocol === "https:") navigator.serviceWorker.register("/sw.js").catch(() => {});
    const ua = window.navigator.userAgent;
    const iPhone = /iPhone|iPad|iPod/.test(ua);
    const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    const installed = window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
    let dismissed = false;
    try { dismissed = window.localStorage.getItem(DISMISS_KEY) === "1"; } catch { /* storage unavailable */ }
    if (iPhone && safari && !installed && !dismissed) setHint(true);
  }, []);
  if (!hint) return null;
  const close = () => { try { window.localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ } setHint(false); };
  return (
    <div role="dialog" aria-label="Install LUNA" style={{ position: "fixed", left: 12, right: 12, bottom: "max(12px, env(safe-area-inset-bottom))", zIndex: 60, background: "#fff", border: "1px solid rgba(0,0,0,.1)", borderRadius: 16, padding: "12px 14px", boxShadow: "0 8px 28px rgba(0,0,0,.18)", fontSize: 13, color: "#1d1d1f" }}>
      <strong style={{ display: "block", marginBottom: 2 }}>Install LUNA on your iPhone</strong>
      Tap the Share button, then “Add to Home Screen”. LUNA then opens full screen like an app.
      <button type="button" onClick={close} style={{ display: "block", marginTop: 8, border: 0, background: "none", color: "#0071e3", fontWeight: 600, padding: 0 }}>Got it</button>
    </div>
  );
}
