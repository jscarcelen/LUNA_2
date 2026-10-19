"use client";
import { useLocale } from "./LocaleProvider.js";

/** "EN | ES" toggle. The active language is bold; the other is a button. */
export function LanguageSwitch({ className = "", style }) {
  const { locale, setLocale } = useLocale();
  const item = (code) => (
    <button
      key={code}
      type="button"
      lang={code}
      aria-pressed={locale === code}
      aria-label={code === "en" ? "English" : "Español"}
      onClick={() => setLocale(code)}
      style={{ border: 0, background: "transparent", padding: "4px 6px", font: "inherit", fontSize: 12, fontWeight: locale === code ? 700 : 500, color: locale === code ? "var(--ink, #1d1d1f)" : "var(--muted, #6e6e73)", cursor: "pointer", minHeight: 28 }}
    >{code.toUpperCase()}</button>
  );
  return (
    <span className={`lang-switch ${className}`.trim()} role="group" aria-label="Language / Idioma" style={{ display: "inline-flex", alignItems: "center", gap: 0, ...style }}>
      {item("en")}<span aria-hidden style={{ color: "var(--muted, #6e6e73)", opacity: 0.5 }}>|</span>{item("es")}
    </span>
  );
}
