export function TopBar({ title, navItems, page, onPageChange }) {
  return (
    <header className="top-bar">
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
    </header>
  );
}
