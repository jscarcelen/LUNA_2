import { getServerLocale } from "../../lib/i18n/server.js";
import { makeT } from "../../lib/i18n/index.js";

export async function generateMetadata() {
  const t = makeT(await getServerLocale());
  return { title: t("misc.offline.meta") };
}

export default async function OfflinePage() {
  const t = makeT(await getServerLocale());
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>
      <div style={{ maxWidth: 360 }}>
        <h1 style={{ fontSize: 24, margin: "0 0 8px" }}>{t("misc.offline.title")}</h1>
        <p style={{ color: "#6e6e73", margin: "0 0 16px" }}>{t("misc.offline.body")}</p>
        <a href="/" style={{ display: "inline-block", padding: "10px 20px", borderRadius: 999, background: "#0071e3", color: "#fff", textDecoration: "none", fontWeight: 600 }}>{t("misc.offline.retry")}</a>
      </div>
    </main>
  );
}
