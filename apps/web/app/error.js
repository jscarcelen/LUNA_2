"use client";
import { useT } from "../lib/i18n/LocaleProvider.js";

/** A page crashed: say so and offer to retry, rather than leaving a blank screen. */
export default function ErrorPage({ error, reset }) {
  const t = useT();
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f5f5f7", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", padding: 24 }}>
      <div style={{ maxWidth: 420, background: "#fff", borderRadius: 18, padding: 28, textAlign: "center", boxShadow: "0 8px 24px rgba(0,0,0,0.08)" }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>{t("misc.error.title")}</h1>
        <p style={{ color: "#6e6e73", fontSize: 14, lineHeight: 1.5 }}>{t("misc.error.body")} {error?.digest ? t("misc.error.ref", { ref: error.digest }) : ""}</p>
        <button type="button" onClick={() => reset()} style={{ border: 0, borderRadius: 999, background: "#0071e3", color: "#fff", fontWeight: 600, fontSize: 14, padding: "10px 20px", cursor: "pointer" }}>{t("misc.error.retry")}</button>
        <p style={{ margin: "14px 0 0" }}><a href="/" style={{ color: "#0071e3", fontSize: 13 }}>{t("misc.error.back")}</a></p>
      </div>
    </main>
  );
}
