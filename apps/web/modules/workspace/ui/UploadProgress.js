"use client";

import { estimateRemaining, formatBytes } from "../uploadPlan";
import { useT } from "../../../lib/i18n/LocaleProvider.js";

/**
 * The upload panel: files done and remaining, the time left, and any file that could not be uploaded with the
 * reason. Stays until closed once something failed, so nothing is missed.
 *
 * @param {{ total: number, done: number, doneBytes: number, totalBytes: number, startedAt: number, now: number, current: string, destination: string, failures: { name: string, reason: string }[], finished: boolean }} progress
 */
export function UploadProgress({ progress, onClose }) {
  const t = useT();
  if (!progress) return null;
  const { total, done, failures, finished } = progress;
  const remaining = Math.max(0, total - done - failures.length);
  const handled = done + failures.length;
  const percent = total ? Math.round((handled / total) * 100) : 0;
  const eta = finished ? "" : estimateRemaining({ doneBytes: progress.doneBytes, totalBytes: progress.totalBytes, elapsedMs: progress.now - progress.startedAt });
  return (
    <div className="tw-scope fixed bottom-4 left-4 z-50 grid w-[min(24rem,calc(100vw-2rem))] gap-2 rounded-[18px] border border-ink/10 bg-white p-4 shadow-[0_16px_48px_rgba(0,0,0,0.2)]" role="status" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 text-sm font-bold text-ink">{finished ? (failures.length ? t("courses.upload.finishedProblems") : t("courses.upload.finished")) : t("courses.upload.uploading")}</p>
          {progress.destination ? <p className="m-0 truncate text-xs text-soft-ink">{t("courses.upload.to", { destination: progress.destination })}</p> : null}
        </div>
        {finished ? <button type="button" className="rounded-full px-2 text-lg leading-none text-soft-ink hover:text-ink" aria-label={t("common.close")} onClick={onClose}>×</button> : null}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-soft)]" aria-hidden>
        <div className="h-full rounded-full bg-[var(--accent)] transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      <p className="m-0 text-xs text-ink">
        {t("courses.upload.done", { done, total })}{remaining ? ` · ${t("courses.upload.remaining", { count: remaining })}` : ""}{failures.length ? ` · ${t("courses.upload.failed", { count: failures.length })}` : ""}
        {progress.totalBytes ? ` · ${t("courses.upload.bytes", { done: formatBytes(progress.doneBytes), total: formatBytes(progress.totalBytes) })}` : ""}
        {eta ? ` · ${t("courses.upload.left", { eta })}` : ""}
      </p>
      {!finished && progress.current ? <p className="m-0 truncate text-xs text-soft-ink">{t("courses.upload.now", { name: progress.current })}</p> : null}
      {failures.length ? (
        <ul className="m-0 grid max-h-40 gap-1 overflow-y-auto pl-4 text-xs text-ink">
          {failures.map((failure, index) => <li key={`${failure.name}-${index}`}><strong>{failure.name}</strong>: {failure.reason}</li>)}
        </ul>
      ) : null}
    </div>
  );
}
