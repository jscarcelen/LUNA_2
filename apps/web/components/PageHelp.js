"use client";

import { useEffect, useRef, useState } from "react";
import { TOUR_EVENT, helpFor } from "./helpContent";

/** The "?" button beside the page title: what this page is for, the one thing to try, and the tour. */
export function PageHelp({ page, role = "student" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const help = helpFor(page, role);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => { if (ref.current && !ref.current.contains(event.target)) setOpen(false); };
    const onKey = (event) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  useEffect(() => { setOpen(false); }, [page]);
  if (!help) return null;
  return (
    <span ref={ref} className="tw-scope relative inline-flex align-middle">
      <button type="button" aria-expanded={open} aria-label="What is this page?" title="What is this page?" className="grid size-6 place-items-center rounded-full border border-ink/20 text-xs font-bold text-soft-ink transition hover:bg-[var(--surface-soft)] hover:text-ink" onClick={() => setOpen((value) => !value)}>?</button>
      {open ? (
        <div role="dialog" aria-label="Help" className="absolute left-0 top-full z-50 mt-2 grid w-72 gap-2 rounded-2xl border border-ink/10 bg-white p-4 text-left shadow-[0_12px_32px_rgba(0,0,0,0.16)]">
          <p className="m-0 text-sm text-ink">{help.what}</p>
          <p className="m-0 text-sm text-soft-ink"><strong className="text-ink">Try:</strong> {help.tip}</p>
          <button type="button" className="justify-self-start text-xs font-semibold text-[var(--accent)] hover:underline" onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent(TOUR_EVENT)); }}>Take the 1-minute tour</button>
        </div>
      ) : null}
    </span>
  );
}
