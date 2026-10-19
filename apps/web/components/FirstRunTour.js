"use client";

import { useEffect, useState } from "react";
import { TOUR_EVENT, TOUR_KEY, tourStepsFor } from "./helpContent";

/**
 * A short tour of the sections (four for a student or teacher, three for a parent, each in that role's words). It opens once for a new browser (remembered in localStorage), and again
 * whenever someone chooses "Take the tour" in a page's "?" help. A step plays a short clip when it has one.
 */
export function FirstRunTour({ role = "student" }) {
  const TOUR_STEPS = tourStepsFor(role);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    try { if (window.localStorage.getItem(TOUR_KEY) !== "1") setOpen(true); } catch { /* storage unavailable: skip the automatic tour */ }
    const show = () => { setIndex(0); setOpen(true); };
    window.addEventListener(TOUR_EVENT, show);
    return () => window.removeEventListener(TOUR_EVENT, show);
  }, []);
  function close() {
    setOpen(false);
    try { window.localStorage.setItem(TOUR_KEY, "1"); } catch { /* ignore */ }
  }
  if (!open) return null;
  const step = TOUR_STEPS[Math.min(index, TOUR_STEPS.length - 1)];
  const last = index === TOUR_STEPS.length - 1;
  return (
    <div className="tw-scope fixed inset-0 z-[400] grid place-items-center bg-black/40 p-4" onClick={close}>
      <div role="dialog" aria-modal="true" aria-label="Quick tour" className="grid w-full max-w-sm gap-3 rounded-[18px] bg-white p-6 text-center shadow-[0_24px_72px_rgba(0,0,0,0.25)]" onClick={(event) => event.stopPropagation()}>
        {step.video ? <video src={step.video} autoPlay loop muted playsInline className="w-full rounded-xl" /> : <span aria-hidden className="mx-auto grid size-16 place-items-center rounded-full bg-[var(--accent-soft)] text-3xl text-[var(--accent)]">{step.icon}</span>}
        <h3 className="m-0 text-lg font-bold text-ink">{step.title}</h3>
        <p className="m-0 text-sm text-soft-ink">{step.text}</p>
        <div className="flex justify-center gap-1.5" aria-hidden>
          {TOUR_STEPS.map((entry, position) => <span key={entry.id} className={`size-1.5 rounded-full ${position === index ? "bg-[var(--accent)]" : "bg-ink/15"}`} />)}
        </div>
        <div className="flex justify-between gap-2">
          <button type="button" className="rounded-full px-4 py-2 text-sm font-semibold text-soft-ink hover:text-ink" onClick={close}>{last ? "Close" : "Skip"}</button>
          <button type="button" className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white hover:bg-[#0077ed]" onClick={() => (last ? close() : setIndex(index + 1))}>{last ? "Got it" : "Next"}</button>
        </div>
      </div>
    </div>
  );
}
