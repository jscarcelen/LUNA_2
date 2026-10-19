"use client";

import { useEffect, useRef, useState } from "react";
import { askLuna } from "./GlobalAskLuna";
import { openFeedback } from "../feedback/feedbackEvents";
import { useT } from "../../lib/i18n/LocaleProvider.js";

/**
 * The ONE small "Ask Luna" button of the app: it holds both the assistant ("Ask Luna") and "Send feedback", so two
 * floating buttons never cover a page. `variant="floating"` sits bottom-right on a computer (the page keeps bottom
 * padding for it); `variant="bar"` is the phone version, an icon in the top bar. When a reader shows its own Ask
 * Luna button (`claimed`), this becomes a plain feedback button.
 */
export function AskLunaMenu({ variant = "floating", claimed = false }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => { if (ref.current && !ref.current.contains(event.target)) setOpen(false); };
    const onKey = (event) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);
  const bar = variant === "bar";
  const wrap = bar ? "relative min-[761px]:hidden" : "fixed bottom-4 right-4 z-[45] max-[760px]:hidden";
  const pick = (action) => { setOpen(false); action(); };
  // A reader that shows its own "Ask Luna" leaves only feedback here: a plain feedback button, so the page never has two "Ask Luna".
  if (claimed) {
    return (
      <div className={`tw-scope ${wrap}`}>
        <button
          type="button"
          aria-label={t("misc.sendFeedback")}
          title={t("misc.sendFeedback")}
          onClick={openFeedback}
          className={bar
            ? "grid size-9 place-items-center rounded-full border border-ink/12 bg-white text-sm text-ink transition active:scale-95"
            : "inline-flex items-center gap-1.5 rounded-full border border-ink/12 bg-white px-3.5 py-2 text-xs font-semibold text-ink shadow-[var(--shadow)] transition hover:bg-[var(--surface-soft)] active:scale-95"}
        >
          <span aria-hidden>✎</span>{bar ? null : ` ${t("misc.sendFeedback")}`}
        </button>
      </div>
    );
  }
  const item = "block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-ink transition hover:bg-[var(--surface-soft)]";
  return (
    <div ref={ref} className={`tw-scope ${wrap}`}>
      <button
        type="button"
        aria-label={t("misc.ask")}
        aria-expanded={open}
        title={t("misc.ask")}
        onClick={() => setOpen((value) => !value)}
        className={bar
          ? "grid size-9 place-items-center rounded-full bg-[var(--accent)] text-sm text-white transition active:scale-95"
          : "inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-3.5 py-2 text-xs font-semibold text-white shadow-[0_6px_18px_rgba(0,113,227,0.3)] transition hover:bg-[#0077ed] active:scale-95"}
      >
        <span aria-hidden>✦</span>{bar ? null : ` ${t("misc.ask")}`}
      </button>
      {open ? (
        <div role="menu" className={`absolute ${bar ? "right-0 top-11" : "bottom-11 right-0"} z-[60] grid w-44 gap-0.5 rounded-2xl border border-ink/10 bg-white p-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.18)]`}>
          <button type="button" role="menuitem" className={item} onClick={() => pick(() => askLuna())}>{t("misc.ask")}</button>
          <button type="button" role="menuitem" className={item} onClick={() => pick(openFeedback)}>{t("misc.sendFeedback")}</button>
        </div>
      ) : null}
    </div>
  );
}
