"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ROLE_LABEL, accountsApi } from "./api";
import { describeEvent, timeAgo } from "./bellText.js";

const POLL_MS = 60000;

const BellIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z" />
    <path d="M10 19a2 2 0 0 0 4 0" />
  </svg>
);

/**
 * The bell in the top bar: a badge with the number of requests waiting for you (plus anything new), and a
 * list with Accept / Decline right there. Polls every minute and whenever the tab gets focus. Everything is
 * derived on the server from your connections and what was shared with you.
 */
export function NotificationsBell({ onOpenPage }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const wrap = useRef(null);
  const stopped = useRef(false);

  const load = useCallback(async () => {
    if (stopped.current) return null;
    const result = await accountsApi.notifications();
    if (result.status === 401) {
      stopped.current = true; // logged out in another tab: stop asking
      return null;
    }
    if (result.ok) setData(result.data);
    return result.ok ? result.data : null;
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => { if (document.visibilityState !== "hidden") load(); }, POLL_MS);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === "Escape") setOpen(false); };
    const onDown = (event) => { if (wrap.current && !wrap.current.contains(event.target)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    setError("");
    if (next) {
      const fresh = await load();
      if (fresh?.events?.some((event) => event.unread)) {
        await accountsApi.markNotificationsSeen();
        // Keep what was new visible while the list is open; the badge no longer counts it.
        setData((current) => (current ? { ...current, unreadCount: current.pendingCount } : current));
      }
    }
  }

  async function answer(request, action) {
    setBusyId(request.linkId);
    setError("");
    const result = await accountsApi.changeLink(action, request.linkId);
    setBusyId("");
    if (!result.ok) setError(result.error);
    await load();
  }

  const count = data?.unreadCount || 0;
  const requests = data?.pendingRequests || [];
  const events = data?.events || [];
  return (
    <div ref={wrap} className="tw-scope relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={count ? `Notifications, ${count} new` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 bg-white text-ink transition hover:bg-[var(--surface-soft)]"
      >
        <BellIcon />
        {count ? (
          <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-[var(--accent)] px-1 text-center text-[10px] font-bold leading-[18px] text-white">{count > 99 ? "99+" : count}</span>
        ) : null}
      </button>
      {open ? (
        <div role="dialog" aria-label="Notifications" className="fixed inset-x-3 top-16 z-50 max-h-[70vh] overflow-y-auto rounded-2xl border border-ink/10 bg-white p-3 shadow-[0_12px_40px_rgba(0,0,0,0.16)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[360px]">
          <p className="m-0 mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-soft-ink">Notifications</p>
          {error ? <p role="alert" className="m-0 mb-2 rounded-xl bg-[rgba(255,59,48,0.08)] px-3 py-2 text-xs text-[var(--color-danger)]">{error}</p> : null}
          {!requests.length && !events.length ? <p className="m-0 px-1 py-4 text-center text-sm text-soft-ink">Nothing new. Connection requests and shared work will show up here.</p> : null}
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {requests.map((request) => (
              <li key={request.id} className="rounded-xl border border-ink/10 bg-[var(--surface-soft)] p-3">
                <p className="m-0 text-sm font-semibold text-ink [overflow-wrap:anywhere]">{describeEvent(request)}</p>
                <p className="m-0 mt-0.5 text-[11px] text-soft-ink [overflow-wrap:anywhere]">{ROLE_LABEL[request.person.role] || request.person.role} · {request.person.email} · {timeAgo(request.at)}</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" disabled={busyId === request.linkId} onClick={() => answer(request, "accept")} className="rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Accept</button>
                  <button type="button" disabled={busyId === request.linkId} onClick={() => answer(request, "decline")} className="rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-50">Decline</button>
                </div>
              </li>
            ))}
            {events.map((event) => (
              <li key={event.id} className={`rounded-xl px-3 py-2 ${event.unread ? "bg-[rgba(0,113,227,0.07)]" : ""}`}>
                <p className="m-0 text-sm text-ink [overflow-wrap:anywhere]">{describeEvent(event)}</p>
                <p className="m-0 mt-0.5 text-[11px] text-soft-ink">{timeAgo(event.at)}</p>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => { setOpen(false); onOpenPage?.("connections"); }} className="mt-3 w-full rounded-full border border-ink/15 bg-white px-3 py-2 text-xs font-semibold text-ink">See all in Connections</button>
        </div>
      ) : null}
    </div>
  );
}
