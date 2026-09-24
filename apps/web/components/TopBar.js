import { CreditsBadge } from "../modules/credits/CreditsBadge";

/**
 * On a computer this is the title, the site map and the credit badge, unchanged. On a phone the
 * site map would wrap into a block that covers the page, so there it becomes a single scrollable
 * row and the workspace rail hides behind the menu button.
 */
export function TopBar({ title, navItems, page, onPageChange, onOpenMenu }) {
  return (
    <header className="top-bar">
      <button className="mobile-menu-btn" type="button" onClick={onOpenMenu} aria-label="Open workspaces menu">
        <span aria-hidden>☰</span>
      </button>
      <div className="top-bar-title-wrap">
        <h2>{title}</h2>
      </div>
      <nav className="top-site-map" aria-label="Primary navigation">
        {navItems.map((item) => (
          <button
            key={item.key}
            className={page === item.key ? "top-map-item on" : "top-map-item"}
            onClick={() => onPageChange(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <CreditsBadge />
    </header>
  );
}
