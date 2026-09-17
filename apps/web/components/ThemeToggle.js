"use client";

import { useEffect, useState } from "react";

export const THEME_STORAGE_KEY = "luna-theme";

function readStoredTheme() {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === "dark" || value === "light" ? value : "";
  } catch {
    return "";
  }
}

function systemTheme() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

/**
 * Light/dark switch. The effective theme is the stored choice, else the OS preference.
 * app/layout.js applies the same rule before first paint so there is no flash.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    const initial = readStoredTheme() || systemTheme();
    setTheme(initial);
    applyTheme(initial);
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (readStoredTheme()) return;
      const next = systemTheme();
      setTheme(next);
      applyTheme(next);
    };
    media?.addEventListener?.("change", onChange);
    return () => media?.removeEventListener?.("change", onChange);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Preference simply won't persist.
    }
  }

  const isDark = theme === "dark";
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
    >
      <span className={`theme-toggle-track ${isDark ? "dark" : ""}`}>
        <span className="theme-toggle-thumb">
          {isDark ? (
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
          )}
        </span>
      </span>
    </button>
  );
}
