"use client";

/**
 * Phone only: the sections you use most, in reach of a thumb, like the tab bar of a native app.
 * The other sections (Home, Activities, Performance, Templates) are in the menu button at the top left. Hidden on larger screens by CSS.
 */
const PREFERRED = ["workspaces", "plans", "ai-tools", "marketplace"];

export function BottomTabs({ navItems = [], page, onPageChange }) {
  const picked = PREFERRED.map((key) => navItems.find((item) => item.key === key)).filter(Boolean);
  const items = (picked.length >= 3 ? picked : navItems.slice(0, 4)).slice(0, 4);
  const isCurrent = (item) => page === item.key || (item.match ? String(page).startsWith(item.match) : false);
  return (
    <nav className="bottom-tabs" aria-label="Main sections">
      {items.map((item) => (
        <button key={item.key} type="button" className={isCurrent(item) ? "bottom-tab on" : "bottom-tab"} onClick={() => onPageChange(item.key)} aria-current={isCurrent(item) ? "page" : undefined}>
          <span className="bottom-tab-icon" aria-hidden>{item.icon || "•"}</span>
          <span className="bottom-tab-label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
