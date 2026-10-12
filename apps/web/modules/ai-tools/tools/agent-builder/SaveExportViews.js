"use client";

import { useState } from "react";
import { OutputDownloads } from "../../../template-studio/output/OutputDesigner";

const primaryBtn = "inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0077ed] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";
const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-[var(--surface-soft)] disabled:opacity-50";
const sheet = "w-full max-w-xl rounded-[18px] border border-ink/8 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_60px_rgba(0,0,0,0.18)]";

/** A centred layer over the page with a close arrow at its top right. */
function Layer({ onClose, children, label }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/30 p-4" role="dialog" aria-modal="true" aria-label={label}>
      <div className={`${sheet} relative`}>
        {onClose ? <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 grid size-8 place-items-center rounded-full text-lg text-soft-ink transition hover:bg-[var(--surface-soft)] hover:text-ink">✕</button> : null}
        {children}
      </div>
    </div>
  );
}

/**
 * "Save and export": one button, two ways out. Save puts the result in the workspace (and, from the
 * save form, in Practice or a study plan); Download opens the matrix of views and paper sizes to pick from.
 */
export function SaveAndExportDialog({ doc, filename, onClose, onSave, onError, interactiveKind, onInteractiveHtml, canSave = true }) {
  const [mode, setMode] = useState("choose");
  return (
    <Layer onClose={onClose} label="Save and export">
      <p className="m-0 pr-8 text-lg font-bold text-ink">Save and export</p>
      {mode === "choose" ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button type="button" disabled={!canSave} onClick={onSave} className="grid gap-1 rounded-2xl border border-ink/10 p-4 text-left transition hover:border-[var(--accent)]/50 hover:bg-[var(--accent-soft)] disabled:opacity-50">
            <span className="text-sm font-bold text-ink">Save to my workspace</span>
            <span className="text-xs text-soft-ink">Choose where it is filed. You can add it to Practice or a study plan with a due date.</span>
          </button>
          <button type="button" onClick={() => setMode("download")} className="grid gap-1 rounded-2xl border border-ink/10 p-4 text-left transition hover:border-[var(--accent)]/50 hover:bg-[var(--accent-soft)]">
            <span className="text-sm font-bold text-ink">Download</span>
            <span className="text-xs text-soft-ink">Pick the views and paper sizes you want: PDF, Word, slides or the interactive file.</span>
          </button>
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          <OutputDownloads doc={doc} filename={filename} onError={onError} interactiveKind={interactiveKind} onInteractiveHtml={onInteractiveHtml} />
          <div><button type="button" className={ghostBtn} onClick={() => setMode("choose")}>← Back</button></div>
        </div>
      )}
    </Layer>
  );
}

/**
 * What the person sees while a result is being saved, and after: a progress bar with the share that
 * is left, then "Open" (the interactive version, to do the activity in Luna) and "View in workspace".
 */
export function SaveProgressView({ state, onOpen, onViewWorkspace, onClose, canOpen = true }) {
  const percent = Math.max(0, Math.min(100, Math.round(state.percent || 0)));
  const done = state.status === "done";
  const failed = state.status === "error";
  return (
    <Layer onClose={done || failed ? onClose : undefined} label={done ? "Saved" : "Saving"}>
      {failed ? (
        <div className="grid gap-3 pr-8">
          <p className="m-0 text-lg font-bold text-ink">It could not be saved</p>
          <p className="m-0 text-sm text-[var(--color-danger)]">{state.error || "Something went wrong."}</p>
          <div><button type="button" className={ghostBtn} onClick={onClose}>Close</button></div>
        </div>
      ) : done ? (
        <div className="grid gap-4 pr-8">
          <div>
            <p className="m-0 text-lg font-bold text-ink">Saved</p>
            <p className="m-0 mt-1 text-sm text-soft-ink">“{state.name}” is in your workspace{state.addedTo ? ` and in “${state.addedTo}”` : ""}.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primaryBtn} disabled={!canOpen} onClick={onOpen}>Open</button>
            <button type="button" className={ghostBtn} onClick={onViewWorkspace}>View in workspace</button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 pr-8">
          <p className="m-0 text-lg font-bold text-ink">Saving…</p>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-soft)]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            <div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300 ease-out" style={{ width: `${percent}%` }} />
          </div>
          <p className="m-0 text-xs text-soft-ink">{state.label || "Working"} · {100 - percent}% remaining</p>
        </div>
      )}
    </Layer>
  );
}
