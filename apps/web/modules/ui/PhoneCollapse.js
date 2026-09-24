"use client";

import { useEffect, useState } from "react";

/** True on phone-sized screens. Kept in one place so the breakpoint matches globals.css. */
export function usePhone(query = "(max-width: 760px)") {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    const sync = () => setPhone(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [query]);
  return phone;
}

/**
 * A block that stays exactly as it is on a computer and folds behind a single line on a phone —
 * filter bars, toolbars and other controls that would otherwise push the content off the screen.
 * `activeCount` shows how many choices are hidden, so nothing is silently in effect.
 */
export function PhoneCollapse({ label, activeCount = 0, defaultOpen = false, children }) {
  const phone = usePhone();
  const [open, setOpen] = useState(defaultOpen);
  if (!phone) return children;
  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center justify-between gap-2 rounded-xl border border-ink/12 bg-white px-3 py-2 text-sm font-semibold text-ink"
      >
        <span className="flex items-center gap-2">
          {label}
          {activeCount ? <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--accent-ink)]">{activeCount}</span> : null}
        </span>
        <span aria-hidden className="text-soft-ink">{open ? "▴" : "▾"}</span>
      </button>
      {open ? children : null}
    </div>
  );
}
