"use client";

import { useEffect, useState } from "react";
import { TOUR_EVENT, tourStepsFor } from "./helpContent";
import { useT } from "../lib/i18n/LocaleProvider.js";
import { shouldAutoOpenTour, tourStorageKey } from "../lib/tourSeen.js";

/**
 * A short tour of the sections (four for a student or teacher, three for a parent, each in that role's words). It opens once per account (remembered on the account; the public demo remembers it per browser in localStorage), and again
 * whenever someone chooses "Take the tour" in a page's "?" help. A step plays a short clip when it has one.
 */
export function FirstRunTour({ role = "student", accountId = "", serverSeen = null }) {
  const t = useT();
  const TOUR_STEPS = tourStepsFor(role, t);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    try { if (shouldAutoOpenTour({ accountId, serverSeen, localValue: window.localStorage.getItem(tourStorageKey(accountId)) })) setOpen(true); } catch { /* storage unavailable: skip the automatic tour */ }
    const show = () => { setIndex(0); setOpen(true); };
    window.addEventListener(TOUR_EVENT, show);
    return () => window.removeEventListener(TOUR_EVENT, show);
  }, [accountId, serverSeen]);
  function close() {
    setOpen(false);
    try { window.localStorage.setItem(tourStorageKey(accountId), "1"); } catch { /* ignore */ }
    // Remembered on the account too (the real platform), so another browser or a shared Mac does not repeat it.
    if (accountId && serverSeen !== true) fetch("/api/accounts/tour", { method: "POST" }).catch(() => {});
  }
  if (!open) return null;
  const step = TOUR_STEPS[Math.min(index, TOUR_STEPS.length - 1)];
  const last = index === TOUR_STEPS.length - 1;
  return (
    <div className="tw-scope fixed inset-0 z-[400] grid place-items-center bg-black/40 p-4" onClick={close}>
      <div role="dialog" aria-modal="true" aria-label={t("tour.aria")} className="grid w-full max-w-sm gap-3 rounded-[18px] bg-white p-6 text-center shadow-[0_24px_72px_rgba(0,0,0,0.25)]" onClick={(event) => event.stopPropagation()}>
        {step.video ? <video src={step.video} autoPlay loop muted playsInline className="w-full rounded-xl" /> : <span aria-hidden className="mx-auto grid size-16 place-items-center rounded-full bg-[var(--accent-soft)] text-3xl text-[var(--accent)]">{step.icon}</span>}
        <h3 className="m-0 text-lg font-bold text-ink">{step.title}</h3>
        <p className="m-0 text-sm text-soft-ink">{step.text}</p>
        <div className="flex justify-center gap-1.5" aria-hidden>
          {TOUR_STEPS.map((entry, position) => <span key={entry.id} className={`size-1.5 rounded-full ${position === index ? "bg-[var(--accent)]" : "bg-ink/15"}`} />)}
        </div>
        <div className="flex justify-between gap-2">
          <button type="button" className="rounded-full px-4 py-2 text-sm font-semibold text-soft-ink hover:text-ink" onClick={close}>{last ? t("tour.close") : t("tour.skip")}</button>
          <button type="button" className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white hover:bg-[#0077ed]" onClick={() => (last ? close() : setIndex(index + 1))}>{last ? t("tour.done") : t("tour.next")}</button>
        </div>
      </div>
    </div>
  );
}
