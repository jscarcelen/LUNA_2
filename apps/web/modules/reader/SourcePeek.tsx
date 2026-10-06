"use client";

import { sourceHref } from "../ai-tools/pipeline/sourceLinks.js";

/**
 * An original document opened in place, at the page or section a source tag points to. Used when a
 * source link is clicked inside Luna and the host has no reader of its own to open: the `/source`
 * page (the same HTML reader) is shown over the current screen and "Open in a new tab" keeps the
 * plain link working.
 */
export interface SourceTarget { documentId: string; page?: number; section?: string; chunk?: number; quote?: string }

export function SourcePeek({ target, onClose }: { target: SourceTarget | null; onClose?: () => void }) {
  if (!target?.documentId) return null;
  const href = sourceHref(target);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-3 sm:p-8" role="dialog" aria-modal="true" aria-label="Original document" onClick={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <div className="flex h-full max-h-[900px] w-full max-w-[860px] flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-ink/10 px-4 py-2.5">
          <p className="m-0 text-sm font-semibold text-ink">Original document</p>
          <div className="flex items-center gap-2">
            <a href={href} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[var(--accent)] no-underline hover:underline">Open in a new tab</a>
            <button type="button" onClick={onClose} className="rounded-full border border-ink/15 bg-white px-3 py-1 text-xs font-semibold text-ink hover:bg-[var(--surface-soft)]">Close</button>
          </div>
        </div>
        <iframe title="Original document" src={`${href}&embed=1`} className="h-full w-full flex-1 border-0" />
      </div>
    </div>
  );
}
