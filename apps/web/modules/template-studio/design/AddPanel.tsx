"use client";

import { useEffect, useMemo, useState } from "react";
import { listComponents } from "../engine/registry";
import { ACCENT_PRESETS, BLOCK_CATEGORY_LABELS, builtInBlocks, readBlockLibrary, type AccentPreset, type BlockCategory, type BlockDef } from "../engine/blocks";
import { card, kicker } from "../ui";

export interface AddPanelProps {
  onAdd: (type: string) => void;
  onAddBlock: (block: BlockDef, options: { accent: AccentPreset; toggles: Record<string, boolean> }) => void;
  onPublishBlock?: (block: BlockDef) => void;
  onRemoveBlock?: (block: BlockDef) => void;
  hint: string;
  /** Bumped by the parent when the user saves a block so the library re-reads. */
  libraryVersion?: number;
}

const ORDER: BlockCategory[] = ["questions", "cards", "structure", "custom"];

/** Miniature of a block: accent-tinted card with the block glyph — enough to recognise it at a glance. */
function BlockPreview({ block, accent }: { block: BlockDef; accent: AccentPreset }) {
  return (
    <span className="relative grid h-14 w-full place-items-center overflow-hidden rounded-lg border" style={{ background: accent.tint, borderColor: `${accent.main}33` }}>
      <span className="absolute left-2 top-2 h-1 w-8 rounded-full" style={{ background: accent.main }} />
      <span className="absolute left-2 top-4 h-0.5 w-12 rounded-full bg-ink/15" />
      <span className="absolute left-2 top-[22px] h-0.5 w-10 rounded-full bg-ink/10" />
      <span className="text-lg font-bold" style={{ color: accent.main }}>{block.icon}</span>
    </span>
  );
}

export function AddPanel({ onAdd, onAddBlock, onPublishBlock, onRemoveBlock, hint, libraryVersion = 0 }: AddPanelProps) {
  const [tab, setTab] = useState<"elements" | "blocks">("elements");
  const [accentId, setAccentId] = useState(ACCENT_PRESETS[0].id);
  const [active, setActive] = useState<BlockDef | null>(null);
  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  const [library, setLibrary] = useState<BlockDef[]>([]);
  useEffect(() => { setLibrary(readBlockLibrary()); }, [libraryVersion]);

  const accent = ACCENT_PRESETS.find((item) => item.id === accentId) || ACCENT_PRESETS[0];
  const elements = listComponents().filter((component) => component.addable);
  const blocks = useMemo(() => [...builtInBlocks(), ...library], [library]);

  function pick(block: BlockDef) {
    setActive(block);
    setToggles(Object.fromEntries((block.options || []).map((option) => [option.key, option.default])));
  }

  return (
    <div className={`${card} p-3`}>
      <div className="flex items-center justify-between gap-2 px-1">
        <p className={kicker}>Add</p>
        <div className="flex gap-0.5 rounded-lg bg-[var(--surface-soft)] p-0.5">
          {([["elements", "Elements"], ["blocks", "Blocks"]] as const).map(([value, label]) => (
            <button key={value} type="button" onClick={() => setTab(value)} className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${tab === value ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink"}`}>{label}</button>
          ))}
        </div>
      </div>

      {tab === "elements" ? (
        <>
          <p className="m-0 mb-2 mt-1 px-1 text-[11px] text-soft-ink">{hint}</p>
          <div className="grid grid-cols-2 gap-1">
            {elements.map((item) => (
              <button key={item.type} type="button" onClick={() => onAdd(item.type)} className={`flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-center transition hover:bg-[var(--surface-soft)] ${item.group === "static" ? "text-ink" : "text-[var(--accent-ink)]"}`}>
                <span className="grid size-8 place-items-center rounded-lg bg-[var(--surface-soft)] text-sm font-bold">{item.icon}</span>
                <span className="text-[11px] font-semibold">{item.label}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="m-0 mb-2 mt-1 px-1 text-[11px] text-soft-ink">Ready-made objects with their fields included. Pick one, choose a colour, insert.</p>
          <div className="mb-2 flex items-center gap-1 px-1">
            {ACCENT_PRESETS.map((preset) => (
              <button key={preset.id} type="button" title={preset.label} onClick={() => setAccentId(preset.id)} className={`size-5 rounded-full border-2 transition ${accentId === preset.id ? "scale-110 border-ink" : "border-white"}`} style={{ background: preset.main, boxShadow: "0 0 0 1px rgba(0,0,0,0.08)" }} />
            ))}
          </div>
          <div className="grid max-h-[46vh] gap-2 overflow-y-auto pr-0.5">
            {ORDER.map((category) => {
              const list = blocks.filter((block) => block.category === category);
              if (!list.length && category !== "custom") return null;
              return (
                <div key={category}>
                  <p className="m-0 mb-1 px-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-soft-ink">{BLOCK_CATEGORY_LABELS[category]}</p>
                  {!list.length ? <p className="m-0 px-1 text-[11px] text-soft-ink">Select a group on the canvas and use “Save as block”.</p> : null}
                  <div className="grid gap-1">
                    {list.map((block) => {
                      const open = active?.id === block.id;
                      return (
                        <div key={block.id} className={`rounded-xl border transition ${open ? "border-[var(--accent)]/40 bg-white shadow-[0_4px_14px_rgba(0,0,0,0.06)]" : "border-transparent hover:bg-[var(--surface-soft)]"}`}>
                          <button type="button" onClick={() => (open ? setActive(null) : pick(block))} className="flex w-full items-center gap-2 px-2 py-1.5 text-left">
                            <span className="w-14 shrink-0"><BlockPreview block={block} accent={accent} /></span>
                            <span className="min-w-0">
                              <span className="block truncate text-[12px] font-semibold text-ink">{block.name}</span>
                              <span className="block text-[10.5px] leading-snug text-soft-ink">{block.description}</span>
                            </span>
                          </button>
                          {open ? (
                            <div className="grid gap-1.5 px-2 pb-2">
                              {(block.options || []).length ? (
                                <div className="flex flex-wrap gap-1">
                                  {(block.options || []).map((option) => (
                                    <label key={option.key} className={`inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${toggles[option.key] ? "border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "border-ink/10 text-soft-ink"}`}>
                                      <input type="checkbox" className="sr-only" checked={Boolean(toggles[option.key])} onChange={(event) => setToggles((prev) => ({ ...prev, [option.key]: event.target.checked }))} />
                                      {option.label}
                                    </label>
                                  ))}
                                </div>
                              ) : null}
                              <div className="flex flex-wrap gap-1">
                                <button type="button" className="rounded-full bg-[var(--accent)] px-3 py-1 text-[11px] font-semibold text-white hover:bg-[#0077ed]" onClick={() => onAddBlock(block, { accent, toggles })}>Insert</button>
                                {!block.builtIn && onPublishBlock ? <button type="button" className="rounded-full border border-ink/15 px-3 py-1 text-[11px] font-semibold text-ink hover:bg-[var(--surface-soft)]" onClick={() => onPublishBlock(block)}>Sell in Marketplace</button> : null}
                                {!block.builtIn && onRemoveBlock ? <button type="button" className="rounded-full px-2 py-1 text-[11px] font-semibold text-[var(--color-danger)]" onClick={() => onRemoveBlock(block)}>Remove</button> : null}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
