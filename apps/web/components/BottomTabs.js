"use client";

import { mobileTabOf, sectionOf } from "./navModel";
import { useT } from "../lib/i18n/LocaleProvider.js";

/**
 * Phone only: four destinations in reach of a thumb, like the tab bar of a native app. Hidden on larger screens by CSS.
 * Students get the phone app's tabs (Home, Study, Library, Progress: `item.tab`, see navModel `mobileTabs`); teachers and
 * parents get the same sections as the side rail.
 */

/** Line icons in the style of system glyphs: 24px grid, round caps, drawn in currentColor. */
const GLYPHS = {
  dashboard: (
    <>
      <path d="M4 11.2 12 4l8 7.2" />
      <path d="M6 10v9.5h12V10" />
      <path d="M10 19.5v-5h4v5" />
    </>
  ),
  study: (
    <>
      <path d="M3.5 7.5a2 2 0 0 1 2-2h3.6a2 2 0 0 1 1.5.7l1 1.1a2 2 0 0 0 1.5.7h5.4a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2z" />
      <path d="M3.5 10.5h17" />
    </>
  ),
  progress: (
    <>
      <path d="M4 19.5h16" />
      <path d="M7 16v-4M12 16V8M17 16v-7" />
    </>
  ),
  home: (
    <>
      <path d="M4 11.2 12 4l8 7.2" />
      <path d="M6 10v9.5h12V10" />
      <path d="M10 19.5v-5h4v5" />
    </>
  ),
  practice: (
    <>
      <path d="M5.5 4.5h9l4 4v11h-13z" />
      <path d="m8.5 13 2.2 2.2 4.6-4.7" />
    </>
  ),
  library: (
    <>
      <path d="M4.5 4.5h3.5v15H4.5zM10 4.5h3.5v15H10z" />
      <path d="m15.2 5.6 3.3-.9 3 14-3.3.8z" />
    </>
  ),
  create: (
    <>
      <path d="M11 3.5 12.9 9l5.6 1.9-5.6 1.9L11 18.4 9.1 12.8 3.5 10.9 9.1 9z" />
      <path d="M18.5 14.5v5M16 17h5" />
    </>
  )
};

export function BottomTabs({ navItems = [], page, onPageChange }) {
  const t = useT();
  const items = navItems.slice(0, 4);
  const isCurrent = (item) => (item.tab ? item.tab === mobileTabOf(page) : item.section ? item.section === sectionOf(page) : page === item.key);
  return (
    <nav className="bottom-tabs" aria-label={t("shell.mainSections")}>
      {items.map((item) => {
        const on = isCurrent(item);
        const glyph = GLYPHS[item.glyph || item.section || item.key];
        return (
          <button key={item.key} type="button" className={on ? "bottom-tab on" : "bottom-tab"} onClick={() => onPageChange(item.key)} aria-current={on ? "page" : undefined}>
            <span className="bottom-tab-icon" aria-hidden>
              {glyph ? (
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth={on ? 2.1 : 1.6} strokeLinecap="round" strokeLinejoin="round">{glyph}</svg>
              ) : item.icon || "•"}
            </span>
            <span className="bottom-tab-label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
