import { describe, expect, it } from "vitest";
import en from "../../lib/i18n/messages/en.js";
import es from "../../lib/i18n/messages/es.js";
import { detectLocale, interpolate, makeT, parseAcceptLanguage, translate, translatePlural, formatDate } from "../../lib/i18n/index.js";

const placeholders = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("message catalogues", () => {
  it("en and es have exactly the same keys", () => {
    const missingInEs = Object.keys(en).filter((key) => !(key in es));
    const extraInEs = Object.keys(es).filter((key) => !(key in en));
    expect({ missingInEs, extraInEs }).toEqual({ missingInEs: [], extraInEs: [] });
  });

  it("every key has the same {placeholders} in both languages", () => {
    const bad = Object.keys(en).filter((key) => key in es && placeholders(en[key]).join() !== placeholders(es[key]).join());
    expect(bad).toEqual([]);
  });

  it("every message is a non-empty string", () => {
    for (const catalogue of [en, es]) for (const [key, value] of Object.entries(catalogue)) expect(typeof value === "string" && value.length > 0, key).toBe(true);
  });

  it("plural keys come in one/other pairs", () => {
    for (const catalogue of [en, es]) for (const key of Object.keys(catalogue)) {
      if (key.endsWith(".one")) expect(catalogue[`${key.slice(0, -4)}.other`], key).toBeTruthy();
      if (key.endsWith(".other") && !(`${key.slice(0, -6)}.one` in catalogue)) { /* "other" alone is allowed */ }
    }
  });
});

describe("translate", () => {
  it("interpolates {name}", () => {
    expect(interpolate("Hi {name}", { name: "Ana" })).toBe("Hi Ana");
    expect(interpolate("Hi {name}", {})).toBe("Hi {name}");
  });
  it("uses the language asked for", () => {
    expect(translate("en", "landing.nav.login")).toBe("Log in");
    expect(translate("es", "landing.nav.login")).toBe("Iniciar sesión");
  });
  it("returns the key when nothing has it", () => {
    expect(translate("es", "nope.nothing")).toBe("nope.nothing");
  });
  it("falls back to English for a key Spanish does not have", () => {
    const key = "auth.signup";
    const saved = es[key];
    delete es[key];
    try { expect(translate("es", key)).toBe(en[key]); } finally { es[key] = saved; }
  });
  it("picks the plural form", () => {
    expect(translatePlural("en", "auth.done.queued", 1)).toMatch(/^The 1 connection request /);
    expect(translatePlural("en", "auth.done.queued", 3)).toMatch(/^The 3 connection requests /);
    expect(makeT("es").plural("auth.done.queued", 2)).toMatch(/^Las 2 solicitudes/);
  });
  it("formats dates in the UI language", () => {
    expect(formatDate("2026-10-19T12:00:00Z", "en", { month: "long", timeZone: "UTC" })).toBe("October");
    expect(formatDate("2026-10-19T12:00:00Z", "es", { month: "long", timeZone: "UTC" })).toBe("octubre");
  });
});

describe("locale detection", () => {
  it("defaults to English", () => {
    expect(detectLocale()).toBe("en");
    expect(detectLocale({ acceptLanguage: "fr-FR,de;q=0.8" })).toBe("en");
  });
  it("uses Spanish when the browser prefers it", () => {
    expect(parseAcceptLanguage("es-MX,es;q=0.9,en;q=0.8")).toBe("es");
    expect(parseAcceptLanguage("en-US,en;q=0.9,es;q=0.8")).toBe("en");
    expect(parseAcceptLanguage("fr;q=0.9,es;q=0.5")).toBe("es");
    expect(parseAcceptLanguage("es;q=0,en")).toBe("en");
  });
  it("the cookie wins over the header", () => {
    expect(detectLocale({ cookie: "en", acceptLanguage: "es-ES" })).toBe("en");
    expect(detectLocale({ cookie: "es", acceptLanguage: "en-US" })).toBe("es");
    expect(detectLocale({ cookie: "xx", acceptLanguage: "es" })).toBe("es");
  });
});
