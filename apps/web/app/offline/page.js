export const metadata = { title: "Offline · LUNA" };

export default function OfflinePage() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>
      <div style={{ maxWidth: 360 }}>
        <h1 style={{ fontSize: 24, margin: "0 0 8px" }}>You are offline</h1>
        <p style={{ color: "#6e6e73", margin: "0 0 16px" }}>LUNA needs a connection to open your material and study plans. Nothing you did is lost.</p>
        <a href="/" style={{ display: "inline-block", padding: "10px 20px", borderRadius: 999, background: "#0071e3", color: "#fff", textDecoration: "none", fontWeight: 600 }}>Try again</a>
      </div>
    </main>
  );
}
