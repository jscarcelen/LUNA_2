"use client";

/**
 * What a screen shows when it has nothing yet: one sentence on what the screen is for, and one button for the
 * first thing to do. Every list in the app uses this, so an empty screen never looks broken.
 */
export function EmptyState({ title, text, action, onAction, secondary, onSecondary }) {
  return (
    <div className="tw-scope grid justify-items-center gap-2 rounded-2xl bg-[var(--surface-soft)] px-6 py-8 text-center">
      <p className="m-0 text-base font-bold text-ink">{title}</p>
      {text ? <p className="m-0 max-w-md text-sm text-soft-ink">{text}</p> : null}
      <div className="mt-1 flex flex-wrap justify-center gap-2">
        {action ? <button type="button" className="inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#0077ed]" onClick={onAction}>{action}</button> : null}
        {secondary ? <button type="button" className="inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-white/70" onClick={onSecondary}>{secondary}</button> : null}
      </div>
    </div>
  );
}
