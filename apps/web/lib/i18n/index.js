/**
 * Tiny i18n core (no dependencies). Pure: safe on the server and in the browser.
 *
 *   translate("es", "nav.home")                       -> "Inicio"
 *   translate("es", "home.hello", { name: "Ana" })    -> "Hola, Ana"   ({name} interpolation)
 *   translatePlural("es", "plans.items", 3)           -> uses `plans.items.one` / `plans.items.other`, {count} filled in
 *
 * A key missing from Spanish falls back to English; a key missing from both returns the key itself.
 */
import en from "./messages/en.js";
import es from "./messages/es.js";

export const LOCALES = ["en", "es"];
export const DEFAULT_LOCALE = "en";
export const LOCALE_COOKIE = "luna_lang";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const MESSAGES = { en, es };
export const LOCALE_TAG = { en: "en-US", es: "es-ES" };

export function normalizeLocale(value) {
  const short = String(value || "").trim().toLowerCase().slice(0, 2);
  return LOCALES.includes(short) ? short : "";
}

/** The first language in an Accept-Language header that we support ("es-MX,es;q=0.9,en;q=0.8" -> "es"). */
export function parseAcceptLanguage(header) {
  const ranked = String(header || "")
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = q ? Number(q.slice(2)) : 1;
      return { tag: tag.trim(), weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((item) => item.tag && item.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  for (const item of ranked) {
    const locale = normalizeLocale(item.tag);
    if (locale) return locale;
  }
  return "";
}

/** Cookie first (the person chose), then the browser's language, then English. */
export function detectLocale({ cookie = "", acceptLanguage = "" } = {}) {
  return normalizeLocale(cookie) || parseAcceptLanguage(acceptLanguage) || DEFAULT_LOCALE;
}

export function interpolate(template, vars) {
  if (!vars) return template;
  return String(template).replace(/\{(\w+)\}/g, (whole, name) => (vars[name] === undefined || vars[name] === null ? whole : String(vars[name])));
}

export function lookup(locale, key) {
  const own = MESSAGES[locale]?.[key];
  if (typeof own === "string") return own;
  const fallback = MESSAGES[DEFAULT_LOCALE][key];
  return typeof fallback === "string" ? fallback : undefined;
}

export function translate(locale, key, vars) {
  const found = lookup(locale, key);
  return found === undefined ? key : interpolate(found, vars);
}

/** `key.one` for exactly 1, `key.other` otherwise; `{count}` is always available. */
export function translatePlural(locale, key, count, vars) {
  const form = Number(count) === 1 ? "one" : "other";
  const full = lookup(locale, `${key}.${form}`) !== undefined ? `${key}.${form}` : `${key}.other`;
  return translate(locale, full, { count, ...(vars || {}) });
}

export function makeT(locale) {
  const t = (key, vars) => translate(locale, key, vars);
  t.plural = (key, count, vars) => translatePlural(locale, key, count, vars);
  t.locale = locale;
  return t;
}

export const tEn = makeT("en");

// Client-side "current" locale for plain (non-React) helpers such as friendlyMessage. Never set on the server,
// where one module instance serves many requests.
let activeLocale = DEFAULT_LOCALE;
export function setActiveLocale(locale) {
  if (typeof window !== "undefined") activeLocale = normalizeLocale(locale) || DEFAULT_LOCALE;
}
export function getActiveLocale() { return activeLocale; }
export function tActive(key, vars) { return translate(activeLocale, key, vars); }
tActive.plural = (key, count, vars) => translatePlural(activeLocale, key, count, vars);

/** Date formatting in the UI language. */
export function formatDate(value, locale = DEFAULT_LOCALE, options = { day: "numeric", month: "short", year: "numeric" }) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(LOCALE_TAG[locale] || LOCALE_TAG.en, options).format(date);
}

export function formatNumber(value, locale = DEFAULT_LOCALE, options) {
  return new Intl.NumberFormat(LOCALE_TAG[locale] || LOCALE_TAG.en, options).format(value);
}

/** The language name the AI generators expect ("Spanish"), for prompts and `language` inputs. */
export const LANGUAGE_NAME = { en: "English", es: "Spanish" };
