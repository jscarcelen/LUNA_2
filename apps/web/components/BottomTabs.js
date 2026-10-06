"use client";

/**
 * Phone only: the sections you use most, in reach of a thumb, like the tab bar of a native app.
 * The other sections (Home, Activities, Performance, Templates) are in the menu button at the top left. Hidden on larger screens by CSS.
 */
const PREFERRED = ["workspaces", "plans", "ai-tools", "marketplace"];

/** Line icons in the style of system glyphs: 24px grid, round caps, drawn in currentColor. */
const GLYPHS = {
  workspaces: (
    <>
      <path d="M3.5 7.5a2 2 0 0 1 2-2h3.6a2 2 0 0 1 1.5.7l1 1.1a2 2 0 0 0 1.5.7h5.4a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2z" />
      <path d="M3.5 10.5h17" />
    </>
  ),
  plans: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      <path d="m9 15 2 2 4-4" />
    </>
  ),
  "ai-tools": (
    <>
      <path d="M11 3.5 12.9 9l5.6 1.9-5.6 1.9L11 18.4 9.1 12.8 3.5 10.9 9.1 9z" />
      <path d="M18.5 14.5v5M16 17h5" />
    </>
  ),
  marketplace: (
    <>
      <path d="M5 9.5h14l-1 10.2a1.5 1.5 0 0 1-1.5 1.3h-9A1.5 1.5 0 0 1 6 19.7z" />
      <path d="M8.5 9.5V8a3.5 3.5 0 0 1 7 0v1.5" />
    </>
  )
};

export function BottomTabs({ navItems = [], page, onPageChange }) {
  const picked = PREFERRED.map((key) => navItems.find((item) => item.key === key)).filter(Boolean);
  const items = (picked.length >= 3 ? picked : navItems.slice(0, 4)).slice(0, 4);
  const isCurrent = (item) => page === item.key || (item.match ? String(page).startsWith(item.match) : false);
  return (
    <nav className="bottom-tabs" aria-label="Main sections">
      {items.map((item) => {
        const on = isCurrent(item);
        const glyph = GLYPHS[item.key];
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
