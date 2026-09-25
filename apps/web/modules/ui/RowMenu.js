"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The "…" menu for a row of actions.
 *
 * A file row used to carry eleven buttons side by side, which on a narrow window pushed the name
 * out of its box and, on a phone, off the screen entirely. A row now shows the one or two actions
 * people reach for and hides the rest behind this menu, so a row is always as wide as the row.
 */
export function RowMenu({ items = [], label = "More actions", align = "right" }) {
  const [open, setOpen] = useState(false);
  const holder = useRef(null);
  const usable = items.filter(Boolean);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!holder.current?.contains(event.target)) setOpen(false); };
    const escape = (event) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", escape); };
  }, [open]);

  if (!usable.length) return null;

  return (
    <span ref={holder} className="relative shrink-0">
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-expanded={open}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-ink/15 bg-white text-sm font-semibold text-ink transition hover:bg-[var(--surface-soft)]"
        onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }}
      >
        ⋯
      </button>
      {open ? (
        <span className={`absolute ${align === "right" ? "right-0" : "left-0"} top-full z-40 mt-1 grid w-48 gap-0.5 rounded-xl border border-ink/12 bg-white p-1 shadow-[0_12px_32px_rgba(0,0,0,0.16)]`}>
          {usable.map((item) => (
            <button
              key={item.label}
              type="button"
              title={item.title || item.label}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium hover:bg-[var(--surface-soft)] ${item.danger ? "text-[var(--color-danger)]" : "text-ink"}`}
              onClick={(event) => { event.stopPropagation(); setOpen(false); item.onSelect?.(); }}
            >
              {item.icon ? <span aria-hidden className="w-4 text-center">{item.icon}</span> : null}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </button>
          ))}
        </span>
      ) : null}
    </span>
  );
}
