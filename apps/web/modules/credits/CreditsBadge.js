"use client";

import { useEffect, useState } from "react";
import { CREDITS_EVENT, formatLunas, readCredits, topUp } from "./credits";

/** Header account widget: remaining lunas (AI credit) with a small usage popover. */
export function CreditsBadge() {
  const [ledger, setLedger] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setLedger(readCredits());
    const onChange = (event) => setLedger(event.detail || readCredits());
    window.addEventListener(CREDITS_EVENT, onChange);
    return () => window.removeEventListener(CREDITS_EVENT, onChange);
  }, []);
  if (!ledger) return null;
  const pct = ledger.granted ? Math.max(0, Math.min(100, Math.round((ledger.balance / ledger.granted) * 100))) : 0;
  const low = pct < 15;
  return (
    <div className="tw-scope relative">
      <button type="button" onClick={() => setOpen((v) => !v)} title="Your AI credit (lunas)" className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition hover:bg-[var(--surface-soft)] ${low ? "border-[rgba(215,0,21,0.3)] text-[var(--color-danger)]" : "border-ink/10 text-ink"}`}>
        <span className="grid size-4 place-items-center rounded-full bg-[var(--accent)] text-[9px] font-black text-white">L</span>
        {formatLunas(ledger.balance)} lunas
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-40 mt-2 w-72 rounded-2xl border border-ink/10 bg-white p-4 shadow-[0_16px_40px_rgba(0,0,0,0.14)]" onMouseLeave={() => setOpen(false)}>
          <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink">AI credit</p>
          <p className="m-0 mt-1 text-2xl font-bold text-ink">{ledger.balance.toLocaleString("en-US")} <span className="text-sm font-semibold text-soft-ink">lunas</span></p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-soft)]"><div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} /></div>
          <p className="m-0 mt-1 text-[11px] text-soft-ink">{ledger.spent.toLocaleString("en-US")} used of {ledger.granted.toLocaleString("en-US")} · 1 luna = 1 AI token. Plans and top-ups coming soon.</p>
          {ledger.history.length ? (
            <ul className="m-0 mt-3 grid list-none gap-1 p-0">
              {ledger.history.slice(0, 4).map((entry, index) => (
                <li key={`${entry.at}-${index}`} className="flex items-center justify-between text-[11px] text-ink"><span className="truncate pr-2">{entry.agentName || "Agent run"}{entry.estimated ? " (est.)" : ""}</span><span className="shrink-0 font-semibold">−{entry.tokens.toLocaleString("en-US")}</span></li>
              ))}
            </ul>
          ) : null}
          <button type="button" className="mt-3 w-full rounded-full border border-ink/15 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-[var(--surface-soft)]" onClick={() => setLedger(topUp(250_000))}>Add 250k lunas (demo)</button>
        </div>
      ) : null}
    </div>
  );
}
