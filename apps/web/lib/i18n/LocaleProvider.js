"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_LOCALE, LOCALES, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, formatDate, makeT, normalizeLocale, setActiveLocale } from "./index.js";

const LocaleContext = createContext({ locale: DEFAULT_LOCALE, setLocale: () => {}, t: makeT(DEFAULT_LOCALE) });

export function writeLocaleCookie(locale) {
  try { document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`; } catch { /* ignore */ }
}

/** Gives every client component the UI language (`initialLocale` comes from the server, see app/layout.js). */
export function LocaleProvider({ initialLocale = DEFAULT_LOCALE, children }) {
  const [locale, setLocaleState] = useState(normalizeLocale(initialLocale) || DEFAULT_LOCALE);
  setActiveLocale(locale);
  const setLocale = useCallback((next) => {
    const value = normalizeLocale(next);
    if (!value) return;
    writeLocaleCookie(value);
    setLocaleState(value);
  }, []);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  const value = useMemo(() => ({ locale, setLocale, t: makeT(locale) }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/** `const t = useT(); t("nav.home"); t("home.hello", { name }); t.plural("plans.items", n)` */
export function useT() { return useContext(LocaleContext).t; }
export function useLocale() {
  const { locale, setLocale } = useContext(LocaleContext);
  return { locale, setLocale, locales: LOCALES, formatDate: (value, options) => formatDate(value, locale, options) };
}
