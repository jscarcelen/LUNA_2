"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { accountsApi } from "../accounts/api";
import { CREDITS_EVENT } from "../credits/credits";
import { formatDate, formatNumber } from "../../lib/i18n/index.js";
import { useT } from "../../lib/i18n/LocaleProvider.js";

const POLL_MS = 5 * 60 * 1000;
// An AI answer is written to the meter just after it reaches the browser: look again a moment later.
const AFTER_RUN_MS = 2500;

const AI_COLOR = "var(--accent)";
const STORAGE_COLOR = "#34c759";
const LOW_COLOR = "#ff9f0a";
const OUT_COLOR = "var(--color-danger, #d70015)";

export function formatBytes(bytes, locale) {
  const n = Math.max(0, Number(bytes) || 0);
  if (n >= 1024 ** 3) return `${formatNumber(Math.round((n / 1024 ** 3) * 10) / 10, locale)} GB`;
  if (n >= 1024 ** 2) return `${formatNumber(Math.round((n / 1024 ** 2) * 10) / 10, locale)} MB`;
  return `${formatNumber(Math.max(n ? 1 : 0, Math.round(n / 1024)), locale)} KB`;
}

const aiTone = (ai) => (ai.leftCredits <= 0 ? OUT_COLOR : 100 - ai.percentUsed <= 20 ? LOW_COLOR : AI_COLOR);
const storageTone = (storage) => (storage.percentUsed >= 100 ? OUT_COLOR : storage.percentUsed >= 80 ? LOW_COLOR : STORAGE_COLOR);

/** Two concentric rings: the outer one is the AI credits LEFT this month, the inner one the storage USED. */
function Rings({ aiLeft, aiColor, storageUsed, storageColor, size = 26 }) {
  const ring = (r, fraction, color, width) => {
    const length = 2 * Math.PI * r;
    return (
      <>
        <circle cx="16" cy="16" r={r} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth={width} />
        <circle cx="16" cy="16" r={r} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray={`${Math.max(0, Math.min(1, fraction)) * length} ${length}`} transform="rotate(-90 16 16)" style={{ transition: "stroke-dasharray 180ms var(--ease, ease)" }} />
      </>
    );
  };
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      {ring(13, aiLeft, aiColor, 4)}
      {ring(7, storageUsed, storageColor, 3.5)}
    </svg>
  );
}

function Bar({ percent, color }) {
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-soft)]">
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, percent))}%`, background: color, transition: "width 180ms var(--ease, ease)" }} />
    </div>
  );
}

function Row({ label, value, detail = "", percent, color }) {
  return (
    <li className="py-1.5">
      <div className="flex items-baseline justify-between gap-3 text-[13px] text-ink">
        <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
        <span className="shrink-0 font-semibold tabular-nums">{value}</span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--surface-soft)]"><div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, percent))}%`, background: color }} /></div>
        {detail ? <span className="shrink-0 text-[11px] text-soft-ink">{detail}</span> : null}
      </div>
    </li>
  );
}

const sectionTitle = "m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink";

/**
 * The usage circle in the top bar (logged-in accounts): the outer ring is how much of this month's AI credits is
 * left, the inner ring how much storage is used. Clicking it shows both, with what used the credits and what takes
 * the space. Hidden until the database step (migration 202610210003) is done.
 */
export function UsageMeter() {
  const t = useT();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const stopped = useRef(false);

  const load = useCallback(async () => {
    if (stopped.current) return;
    const result = await accountsApi.usage();
    if (result.status === 401 || (result.ok && !result.data?.account)) {
      stopped.current = true;
      setData(null);
      return;
    }
    if (result.ok) {
      setData(result.data);
      setFailed(false);
    } else {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
    let later = 0;
    const timer = window.setInterval(() => { if (document.visibilityState !== "hidden") load(); }, POLL_MS);
    const onRun = () => { window.clearTimeout(later); later = window.setTimeout(load, AFTER_RUN_MS); };
    window.addEventListener(CREDITS_EVENT, onRun);
    window.addEventListener("focus", load);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(later);
      window.removeEventListener(CREDITS_EVENT, onRun);
      window.removeEventListener("focus", load);
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

  if (!data?.ai || !data?.storage) return null;
  const { ai, storage } = data;
  const aiLeftPct = 100 - ai.percentUsed;
  const resets = formatDate(ai.resetsAt, t.locale, { day: "numeric", month: "long" });
  const n = (value) => formatNumber(value, t.locale);
  const maxActivity = Math.max(1, ...ai.byActivity.map((entry) => entry.credits));
  const maxKind = Math.max(1, ...storage.byKind.map((entry) => entry.bytes));

  return (
    <div ref={wrap} className="tw-scope relative">
      <button
        type="button"
        onClick={() => { const next = !open; setOpen(next); if (next) load(); }}
        aria-label={t("usage.button", { ai: aiLeftPct, storage: storage.percentUsed })}
        title={t("usage.title")}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 bg-white transition hover:bg-[var(--surface-soft)]"
      >
        <Rings aiLeft={aiLeftPct / 100} aiColor={aiTone(ai)} storageUsed={storage.percentUsed / 100} storageColor={storageTone(storage)} />
      </button>
      {open ? (
        <div role="dialog" aria-label={t("usage.title")} className="fixed inset-x-3 top-16 z-50 max-h-[75vh] overflow-y-auto rounded-2xl border border-ink/10 bg-white p-4 shadow-[0_12px_40px_rgba(0,0,0,0.16)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[340px]">
          {failed ? <p role="alert" className="m-0 mb-3 rounded-xl bg-[rgba(255,59,48,0.08)] px-3 py-2 text-xs text-[var(--color-danger)]">{t("usage.error")}</p> : null}

          <section aria-label={t("usage.ai")}>
            <p className={sectionTitle}><span aria-hidden="true" className="mr-1.5 inline-block size-2 rounded-full align-middle" style={{ background: aiTone(ai) }} />{t("usage.ai")}</p>
            <p className="m-0 mt-1 text-2xl font-bold text-ink">{t("usage.aiLeft", { left: n(ai.leftCredits) })}</p>
            <Bar percent={ai.percentUsed} color={aiTone(ai)} />
            <p className="m-0 mt-1.5 text-xs text-soft-ink">{t("usage.aiOf", { used: n(ai.usedCredits), limit: n(ai.limitCredits) })} · {t("usage.resets", { date: resets })}</p>
            {ai.leftCredits <= 0 ? <p role="status" className="m-0 mt-2 rounded-xl bg-[rgba(255,59,48,0.08)] px-3 py-2 text-xs text-ink">{t("usage.usedUp", { date: resets })}</p>
              : aiLeftPct <= 20 ? <p role="status" className="m-0 mt-2 rounded-xl bg-[rgba(255,159,10,0.12)] px-3 py-2 text-xs text-ink">{t("usage.aiLow")}</p> : null}
            <p className="m-0 mt-3 text-xs font-semibold text-ink">{t("usage.byActivity")}</p>
            {ai.byActivity.length ? (
              <ul className="m-0 list-none p-0">
                {ai.byActivity.map((entry) => (
                  <Row key={entry.activity} label={t(`usage.activity.${entry.activity}`)} value={t("usage.credits", { n: n(entry.credits) })} detail={t.plural("usage.uses", entry.uses, { count: n(entry.uses) })} percent={(entry.credits / maxActivity) * 100} color={AI_COLOR} />
                ))}
              </ul>
            ) : <p className="m-0 mt-1 text-xs text-soft-ink">{t("usage.nothingYet")}</p>}
            <p className="m-0 mt-2 text-[11px] leading-snug text-soft-ink">{t("usage.aiExplain")}</p>
          </section>

          <hr className="my-4 border-0 border-t border-ink/10" />

          <section aria-label={t("usage.storage")}>
            <p className={sectionTitle}><span aria-hidden="true" className="mr-1.5 inline-block size-2 rounded-full align-middle" style={{ background: storageTone(storage) }} />{t("usage.storage")}</p>
            <p className="m-0 mt-1 text-2xl font-bold text-ink">{t("usage.storageOf", { used: formatBytes(storage.usedBytes, t.locale), limit: formatBytes(storage.limitBytes, t.locale) })}</p>
            <Bar percent={storage.percentUsed} color={storageTone(storage)} />
            {storage.percentUsed >= 100 ? <p role="status" className="m-0 mt-2 rounded-xl bg-[rgba(255,59,48,0.08)] px-3 py-2 text-xs text-ink">{t("usage.storageFull")}</p>
              : storage.percentUsed >= 80 ? <p role="status" className="m-0 mt-2 rounded-xl bg-[rgba(255,159,10,0.12)] px-3 py-2 text-xs text-ink">{t("usage.storageLow")}</p> : null}
            {storage.byKind.length ? (
              <>
                <p className="m-0 mt-3 text-xs font-semibold text-ink">{t("usage.byKind")}</p>
                <ul className="m-0 list-none p-0">
                  {storage.byKind.map((entry) => <Row key={entry.kind} label={t(`usage.kind.${entry.kind}`)} value={formatBytes(entry.bytes, t.locale)} percent={(entry.bytes / maxKind) * 100} color={STORAGE_COLOR} />)}
                </ul>
                <p className="m-0 mt-3 text-xs font-semibold text-ink">{t("usage.biggest")}</p>
                <ul className="m-0 mt-1 list-none p-0">
                  {storage.biggest.map((file) => (
                    <li key={file.id} className="flex items-baseline justify-between gap-3 py-1 text-[13px] text-ink">
                      <span className="min-w-0 truncate" title={file.name}>{file.name}{file.subject ? <span className="text-soft-ink"> · {file.subject}</span> : null}</span>
                      <span className="shrink-0 font-semibold tabular-nums">{formatBytes(file.bytes, t.locale)}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : <p className="m-0 mt-2 text-xs text-soft-ink">{t("usage.noFiles")}</p>}
          </section>
        </div>
      ) : null}
    </div>
  );
}
