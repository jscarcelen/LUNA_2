"use client";

import { ghostBtn } from "../../ui";

export interface FloatingToolbarProps {
  count: number;
  canUngroup: boolean;
  onGroup: () => void;
  onUngroup: () => void;
  onAlign: (how: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/** Appears above the canvas when something is selected — direct manipulation instead of configuration. */
export function FloatingToolbar({ count, canUngroup, onGroup, onUngroup, onAlign, onDuplicate, onDelete }: FloatingToolbarProps) {
  if (!count) return null;
  const btn = `${ghostBtn} px-3 py-1 text-xs`;
  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-full border border-ink/10 bg-white/95 px-2 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
      <span className="px-2 text-[11px] font-semibold text-soft-ink">{count} selected</span>
      {canUngroup ? <button type="button" className={btn} onClick={onUngroup}>Ungroup</button> : <button type="button" className={`${btn} border-[var(--accent)]/40 text-[var(--accent-ink)]`} onClick={onGroup}>Group</button>}
      <span className="mx-1 h-4 w-px bg-ink/10" />
      {[["left", "⇤"], ["hcenter", "↔"], ["right", "⇥"], ["top", "⤒"], ["vcenter", "↕"], ["bottom", "⤓"]].map(([key, glyph]) => (
        <button key={key} type="button" className={`${btn} px-2`} title={`Align ${key}`} onClick={() => onAlign(key)}>{glyph}</button>
      ))}
      <button type="button" className={btn} onClick={() => onAlign("fitWidth")}>Full width</button>
      <span className="mx-1 h-4 w-px bg-ink/10" />
      <button type="button" className={btn} onClick={onDuplicate}>Duplicate</button>
      <button type="button" className={`${btn} text-[var(--color-danger)]`} onClick={onDelete}>Delete</button>
    </div>
  );
}
