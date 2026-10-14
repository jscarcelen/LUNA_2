const T = { accent: "#0071e3", ink: "#1d1d1f", sub: "#6e6e73", line: "#e5e5ea", bg: "#f5f5f7", paper: "#ffffff" };
const NAV = [["/terms", "Terms"], ["/privacy", "Privacy"], ["/ai", "AI notice"]];

/** Shared layout of /terms, /privacy and /ai: plain, readable, no scripts. `doc` comes from lib/legalTexts.js. */
export function LegalPage({ doc }) {
  return (
    <main style={{ minHeight: "100vh", background: T.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: T.ink, padding: "32px 16px" }}>
      <article style={{ maxWidth: 760, margin: "0 auto", background: T.paper, borderRadius: 22, padding: "clamp(22px, 5vw, 44px)", boxShadow: "0 1px 2px rgba(0,0,0,.05)", lineHeight: 1.65, fontSize: 15 }}>
        <nav aria-label="Legal" style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20, fontSize: 14, fontWeight: 600 }}>
          <a href="/" style={{ color: T.accent, textDecoration: "none" }}>← LUNA</a>
          {NAV.map(([href, label]) => <a key={href} href={href} style={{ color: doc.title.startsWith(label) ? T.ink : T.accent, textDecoration: "none" }}>{label}</a>)}
        </nav>
        <h1 style={{ fontSize: 30, margin: "0 0 6px", letterSpacing: "-0.02em" }}>{doc.title}</h1>
        <p style={{ margin: "0 0 18px", color: T.sub, fontSize: 13 }}>Version {doc.updated}</p>
        <p style={{ margin: "0 0 12px" }}>{doc.intro}</p>
        {doc.sections.map((section) => (
          <section key={section.h}>
            <h2 style={{ fontSize: 19, margin: "26px 0 8px" }}>{section.h}</h2>
            {(section.p || []).map((text) => <p key={text} style={{ margin: "0 0 10px" }}>{text}</p>)}
            {section.ul ? <ul style={{ margin: "0 0 10px", paddingLeft: 22 }}>{section.ul.map((item) => <li key={item} style={{ margin: "4px 0" }}>{item}</li>)}</ul> : null}
            {section.after ? <p style={{ margin: "0 0 10px" }}>{section.after}</p> : null}
          </section>
        ))}
      </article>
    </main>
  );
}
