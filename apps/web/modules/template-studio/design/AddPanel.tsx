"use client";

import { useEffect, useMemo, useState } from "react";
import { listComponents } from "../engine/registry";
import { ACCENT_PRESETS, builtInBlocks, readBlockLibrary, type AccentPreset, type BlockDef } from "../engine/blocks";
import { card, fieldBase, kicker } from "../ui";

export interface AddPanelProps {
  onAdd: (type: string) => void;
  onAddBlock: (block: BlockDef, options: { accent: AccentPreset; toggles: Record<string, boolean> }) => void;
  onPublishBlock?: (block: BlockDef) => void;
  onRemoveBlock?: (block: BlockDef) => void;
  hint: string;
  libraryVersion?: number;
}

const BASIC_ORDER = ["text", "heading", "image", "rect", "line", "table"];
const AI_ORDER = ["field", "field_image"];

function Tile({ icon, label, onClick, tone = "static", disabled = false, title }: { icon: string; label: string; onClick: () => void; tone?: "static" | "ai"; disabled?: boolean; title?: string }) {
  return (
    <button type="button" disabled={disabled} title={title} onClick={onClick} className={`flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-center transition hover:bg-[var(--surface-soft)] disabled:opacity-40 ${tone === "ai" ? "text-[var(--accent-ink)]" : "text-ink"}`}>
      <span className={`grid size-9 place-items-center rounded-lg text-sm font-bold ${tone === "ai" ? "bg-[var(--accent-soft)]" : "bg-[var(--surface-soft)]"}`}>{icon}</span>
      <span className="text-[11px] font-semibold">{label}</span>
    </button>
  );
}

function BlockPreview({ block, accent }: { block: BlockDef; accent: AccentPreset }) {
  return (
    <span className="relative grid h-12 w-full place-items-center overflow-hidden rounded-lg border" style={{ background: accent.tint, borderColor: `${accent.main}33` }}>
      <span className="absolute left-2 top-2 h-1 w-8 rounded-full" style={{ background: accent.main }} />
      <span className="absolute left-2 top-4 h-0.5 w-12 rounded-full bg-ink/15" />
      <span className="absolute left-2 top-[22px] h-0.5 w-10 rounded-full bg-ink/10" />
      <span className="text-base font-bold" style={{ color: accent.main }}>{block.icon}</span>
    </span>
  );
}

function Section({ title, children, badge }: { title: string; children: React.ReactNode; badge?: string }) {
  return (
    <div className="min-w-0">
      <p className="m-0 mb-1 flex items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-soft-ink">{title}{badge ? <span className="rounded-full bg-[var(--accent-soft)] px-1.5 text-[9px] normal-case tracking-normal text-[var(--accent-ink)]">{badge}</span> : null}</p>
      {children}
    </div>
  );
}

/** Add: Basic · AI fields · Premium · Custom — one scrolling panel with search. */
export function AddPanel({ onAdd, onAddBlock, onPublishBlock, onRemoveBlock, hint, libraryVersion = 0 }: AddPanelProps) {
  const [query, setQuery] = useState("");
  const [accentId, setAccentId] = useState(ACCENT_PRESETS[0].id);
  const [active, setActive] = useState<BlockDef | null>(null);
  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  const [library, setLibrary] = useState<BlockDef[]>([]);
  useEffect(() => { setLibrary(readBlockLibrary()); }, [libraryVersion]);
  const accent = ACCENT_PRESETS.find((item) => item.id === accentId) || ACCENT_PRESETS[0];
  const components = listComponents();
  const q = query.trim().toLowerCase();
  const match = (text: string) => !q || text.toLowerCase().includes(q);
  const basic = BASIC_ORDER.map((type) => components.find((c) => c.type === type)).filter((c): c is NonNullable<typeof c> => Boolean(c) && match(c!.label));
  const ai = AI_ORDER.map((type) => components.find((c) => c.type === type)).filter((c): c is NonNullable<typeof c> => Boolean(c) && match(c!.label));
  const premium = useMemo(() => builtInBlocks().filter((b) => match(`${b.name} ${b.description}`)), [q]);
  const custom = library.filter((b) => match(`${b.name} ${b.description}`));

  function pick(block: BlockDef) {
    setActive(block);
    setToggles(Object.fromEntries((block.options || []).map((option) => [option.key, option.default])));
  }

  const blockRow = (block: BlockDef) => {
    const open = active?.id === block.id;
    return (
      <div key={block.id} className={`rounded-xl border transition ${open ? "border-[var(--accent)]/40 bg-white shadow-[0_4px_14px_rgba(0,0,0,0.06)]" : "border-transparent hover:bg-[var(--surface-soft)]"}`}>
        <button type="button" onClick={() => (open ? setActive(null) : pick(block))} className="flex w-full min-w-0 items-center gap-2 overflow-hidden px-2 py-1.5 text-left">
          <span className="w-12 shrink-0"><BlockPreview block={block} accent={accent} /></span>
          <span className="min-w-0"><span className="block truncate text-[12px] font-semibold text-ink">{block.name}</span><span className="block truncate text-[10.5px] text-soft-ink">{block.description}</span></span>
        </button>
        {open ? (
          <div className="grid gap-1.5 px-2 pb-2">
            <div className="flex items-center gap-1">
              {ACCENT_PRESETS.map((preset) => <button key={preset.id} type="button" title={preset.label} onClick={() => setAccentId(preset.id)} className={`size-4.5 rounded-full border-2 transition ${accentId === preset.id ? "scale-110 border-ink" : "border-white"}`} style={{ background: preset.main, boxShadow: "0 0 0 1px rgba(0,0,0,0.08)", width: 18, height: 18 }} />)}
            </div>
            {(block.options || []).length ? (
              <div className="flex flex-wrap gap-1">
                {(block.options || []).map((option) => (
                  <label key={option.key} className={`inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${toggles[option.key] ? "border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "border-ink/10 text-soft-ink"}`}>
                    <input type="checkbox" className="sr-only" checked={Boolean(toggles[option.key])} onChange={(event) => setToggles((prev) => ({ ...prev, [option.key]: event.target.checked }))} />{option.label}
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
  };

  return (
    <div className={`${card} min-w-0 overflow-hidden p-3`}>
      <p className={`${kicker} px-1`}>Add</p>
      <input className={`${fieldBase} mt-2 w-full py-1.5 text-xs`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search elements…" />
      <p className="m-0 mt-1.5 px-1 text-[10.5px] text-soft-ink">{hint}</p>
      <div className="mt-3 grid max-h-[58vh] min-w-0 gap-4 overflow-y-auto overflow-x-hidden pr-0.5" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
        {basic.length ? <Section title="Basic"><div className="grid grid-cols-3 gap-0.5">{basic.map((c) => <Tile key={c.type} icon={c.icon} label={c.label} disabled={c.type === "table"} title={c.type === "table" ? "Coming soon" : undefined} onClick={() => onAdd(c.type)} />)}</div></Section> : null}
        {ai.length ? <Section title="AI fields" badge="content"><div className="grid grid-cols-3 gap-0.5">{ai.map((c) => <Tile key={c.type} icon={c.icon} label={c.label} tone="ai" onClick={() => onAdd(c.type)} />)}</div><p className="m-0 mt-1 px-1 text-[10.5px] text-soft-ink">Where generated content goes. Give it a name, a type, and whether it repeats.</p></Section> : null}
        {premium.length ? <Section title="Premium" badge="★"><div className="grid gap-1">{premium.map(blockRow)}</div></Section> : null}
        <Section title="Custom"><div className="grid gap-1">{custom.map(blockRow)}{!custom.length ? <p className="m-0 px-1 text-[10.5px] text-soft-ink">Select elements on the canvas → <strong>Save as block</strong> to reuse them here.</p> : null}</div></Section>
      </div>
    </div>
  );
}
