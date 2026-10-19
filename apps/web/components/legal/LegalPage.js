const T = { accent: "#0071e3", ink: "#1d1d1f", sub: "#6e6e73", line: "#e5e5ea", bg: "#f5f5f7", paper: "#ffffff" };
const NAV = [["/terms", "Terms", "Condiciones"], ["/privacy", "Privacy", "Privacidad"], ["/ai", "AI notice", "Aviso de IA"]];

/** Shared layout of /terms, /privacy and /ai: plain, readable, no scripts. `doc` comes from lib/legalTexts.js. */
export function LegalPage({ doc, lang = "en" }) {
  const q = `?lang=${lang}`;
  return (
    <main style={{ minHeight: "100vh", background: T.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: T.ink, padding: "32px 16px" }}>
      <article style={{ maxWidth: 760, margin: "0 auto", background: T.paper, borderRadius: 22, padding: "clamp(22px, 5vw, 44px)", boxShadow: "0 1px 2px rgba(0,0,0,.05)", lineHeight: 1.65, fontSize: 15 }}>
        <nav aria-label="Legal" style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20, fontSize: 14, fontWeight: 600 }}>
          <a href="/" style={{ color: T.accent, textDecoration: "none" }}>← LUNA</a>
          {NAV.map(([href, label, es]) => <a key={href} href={`${href}${q}`} style={{ color: T.accent, textDecoration: "none" }}>{lang === "es" ? es : label}</a>)}
          <span style={{ marginLeft: "auto" }}>{lang === "es" ? <a href="?lang=en" style={{ color: T.sub, textDecoration: "none" }}>English</a> : <a href="?lang=es" style={{ color: T.sub, textDecoration: "none" }}>Español</a>}</span>
        </nav>
        <h1 style={{ fontSize: 30, margin: "0 0 6px", letterSpacing: "-0.02em" }}>{doc.title}</h1>
        <p style={{ margin: "0 0 18px", color: T.sub, fontSize: 13 }}>{lang === "es" ? "Versión" : "Version"} {doc.updated}</p>
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
