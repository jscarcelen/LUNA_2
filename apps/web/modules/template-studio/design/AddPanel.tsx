"use client";

import { useEffect, useMemo, useState } from "react";
import { ACCENT_PRESETS, blockFamilies, builtInBlocks, readBlockLibrary, type AccentPreset, type BlockDef } from "../engine/blocks";
import { card, fieldBase, kicker } from "../ui";
import { ComponentChat } from "./ComponentChat";

export interface AddPanelProps {
  onAdd: (type: string) => void;
  onOpenSequence?: () => void;
  onAddBlock: (block: BlockDef, options: { accent: AccentPreset; toggles: Record<string, boolean> }) => void;
  onPublishBlock?: (block: BlockDef) => void;
  onRemoveBlock?: (block: BlockDef) => void;
  /** IDs of blocks currently in the template (from origin.blockId). */
  selectedBlockIds?: string[];
  /** Toggle a block on/off — active=false means remove it from the template. */
  onToggleBlock?: (block: BlockDef, options: { accent: AccentPreset; toggles: Record<string, boolean> }, active: boolean) => void;
  hint: string;
  libraryVersion?: number;
  /** Composer: components + AI fields + document data (no static elements). */
  blocksOnly?: boolean;
  /** Composer: add a once field filled from a user input (date, topic…). */
  onAddDataField?: (name: string) => void;
}

/* ─── UI Category mapping ─────────────────────────────────── */
const CATEGORIES = [
  { id: "structure",  label: "Structure",     emoji: "▔", bg: "#f0fdf4", ink: "#166534", border: "#bbf7d0" },
  { id: "questions",  label: "Questions",     emoji: "❶", bg: "#dbeafe", ink: "#1d4ed8", border: "#bfdbfe" },
  { id: "games",      label: "Cards & Games", emoji: "🃏", bg: "#fdf4ff", ink: "#7e22ce", border: "#e9d5ff" },
] as const;

type CatId = typeof CATEGORIES[number]["id"];

/** Every question type — multiple choice to worksheets — is a question; documents are structure; the rest are games. */
function uiCat(block: BlockDef): CatId {
  if (block.category === "structure") return "structure";
  if (block.category === "questions" || block.category === "kids") return "questions";
  return "games";
}

/** Default accent and toggles for a block when first added. */
function defaultOptions(block: BlockDef): { accent: AccentPreset; toggles: Record<string, boolean> } {
  const accent = ACCENT_PRESETS[0];
  const toggles = Object.fromEntries((block.options || []).map((o) => [o.key, o.key === "answer" ? false : o.default]));
  return { accent, toggles };
}

/* ─── Variant card ────────────────────────────────────────── */
function VariantCard({
  block,
  active,
  catInk,
  catBg,
  catBorder,
  onToggle,
}: {
  block: BlockDef;
  active: boolean;
  catInk: string;
  catBg: string;
  catBorder: string;
  onToggle: (active: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(!active)}
      className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition ${
        active
          ? "border-[var(--accent)]/40 bg-[var(--accent-soft)] shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
          : "border-ink/10 bg-white hover:border-ink/20 hover:bg-[var(--surface-soft)]"
      }`}
      title={block.description}
    >
      {/* Colour swatch + icon */}
      <span
        className="grid size-9 shrink-0 place-items-center rounded-xl text-sm font-bold"
        style={{ background: active ? catBg : "var(--surface-soft)", color: active ? catInk : "#6b7280", border: active ? `1px solid ${catBorder}` : "1px solid transparent" }}
      >
        {block.icon}
      </span>

      {/* Label */}
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-semibold leading-tight text-ink">
          {block.variant || block.name}
        </span>
        {block.description ? (
          <span className="line-clamp-1 block text-[10px] leading-snug text-soft-ink">
            {block.description}
          </span>
        ) : null}
      </span>

      {/* Checkbox */}
      <span
        className={`grid size-5 shrink-0 place-items-center rounded-full border-2 transition ${
          active ? "border-[var(--accent)] bg-[var(--accent)]" : "border-ink/25 bg-white"
        }`}
      >
        {active ? <span className="text-[10px] font-bold text-white">✓</span> : null}
      </span>
    </button>
  );
}

/* ─── Family group ────────────────────────────────────────── */
function FamilyGroup({
  family,
  variants,
  selectedBlockIds,
  cat,
  onToggle,
}: {
  family: string;
  variants: BlockDef[];
  selectedBlockIds: Set<string>;
  cat: (typeof CATEGORIES)[number];
  onToggle: (block: BlockDef, active: boolean) => void;
}) {
  const activeCount = variants.filter((b) => selectedBlockIds.has(b.id)).length;
  const [open, setOpen] = useState(activeCount > 0);

  // Re-open when a variant becomes active externally (e.g. from AI generation)
  useEffect(() => { if (activeCount > 0 && !open) setOpen(true); }, [activeCount]);

  return (
    <div className="min-w-0">
      {/* Family header row */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left transition hover:bg-[var(--surface-soft)]"
      >
        <span className="min-w-0 flex-1 text-[12px] font-semibold text-ink">{family}</span>
        {activeCount > 0 ? (
          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: cat.bg, color: cat.ink }}>
            {activeCount} selected
          </span>
        ) : null}
        <span className="text-[10px] text-soft-ink">{open ? "▲" : "▼"}</span>
      </button>

      {/* Variants */}
      {open ? (
        <div className="mt-1 grid gap-1 pl-1">
          {variants.map((block) => (
            <VariantCard
              key={block.id}
              block={block}
              active={selectedBlockIds.has(block.id)}
              catInk={cat.ink}
              catBg={cat.bg}
              catBorder={cat.border}
              onToggle={(active) => onToggle(block, active)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ─── Category accordion ──────────────────────────────────── */
function CategoryAccordion({
  cat,
  families,
  selectedBlockIds,
  onToggle,
}: {
  cat: (typeof CATEGORIES)[number];
  families: { family: string; variants: BlockDef[] }[];
  selectedBlockIds: Set<string>;
  onToggle: (block: BlockDef, active: boolean) => void;
}) {
  const totalActive = families.reduce((n, f) => n + f.variants.filter((b) => selectedBlockIds.has(b.id)).length, 0);
  const [open, setOpen] = useState(totalActive > 0 || cat.id === "structure");

  useEffect(() => { if (totalActive > 0 && !open) setOpen(true); }, [totalActive]);

  return (
    <div className="min-w-0">
      {/* Category header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition"
        style={{
          background: open ? cat.bg : "white",
          borderColor: open ? cat.border : "rgba(0,0,0,0.08)",
        }}
      >
        <span className="text-base">{cat.emoji}</span>
        <span className="flex-1 text-[13px] font-bold" style={{ color: cat.ink }}>{cat.label}</span>
        {totalActive > 0 ? (
          <span className="rounded-full border px-2 py-0.5 text-[10px] font-bold" style={{ background: "white", color: cat.ink, borderColor: cat.border }}>
            {totalActive}
          </span>
        ) : null}
        <span className="text-[10px]" style={{ color: cat.ink }}>{open ? "▲" : "▼"}</span>
      </button>

      {/* Families */}
      {open ? (
        <div className="mt-2 grid gap-2 pl-1">
          {families.map((f) => (
            <FamilyGroup
              key={f.family}
              family={f.family}
              variants={f.variants}
              selectedBlockIds={selectedBlockIds}
              cat={cat}
              onToggle={onToggle}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ─── Main component ──────────────────────────────────────── */
export function AddPanel({
  onAdd: _onAdd,
  onOpenSequence: _onOpenSequence,
  onAddBlock,
  onPublishBlock: _onPublishBlock,
  onRemoveBlock,
  selectedBlockIds: selectedBlockIdsProp = [],
  onToggleBlock,
  hint: _hint,
  libraryVersion = 0,
  blocksOnly = false,
  onAddDataField,
}: AddPanelProps) {
  const [library, setLibrary] = useState<BlockDef[]>([]);
  const [customData, setCustomData] = useState("");
  useEffect(() => { setLibrary(readBlockLibrary()); }, [libraryVersion]);

  const selectedIds = useMemo(() => new Set(selectedBlockIdsProp), [selectedBlockIdsProp]);

  // Group built-in blocks by UI category → family
  const byCategory = useMemo(() => {
    const all = builtInBlocks();
    const map = new Map<CatId, Map<string, BlockDef[]>>();
    for (const cat of CATEGORIES) map.set(cat.id, new Map());
    for (const block of all) {
      const catId = uiCat(block);
      const catMap = map.get(catId)!;
      const fam = block.family || block.name;
      if (!catMap.has(fam)) catMap.set(fam, []);
      catMap.get(fam)!.push(block);
    }
    return map;
  }, []);

  function handleToggle(block: BlockDef, active: boolean) {
    const opts = defaultOptions(block);
    if (onToggleBlock) {
      onToggleBlock(block, opts, active);
    } else if (active) {
      onAddBlock(block, opts);
    }
  }

  return (
    <div className={`${card} min-w-0 overflow-hidden p-3`} style={{ maxHeight: "calc(100vh - 140px)", overflowY: "auto" }}>
      <p className={`${kicker} px-1 mb-3`}>Components</p>
      <p className="m-0 mb-3 px-1 text-[10.5px] text-soft-ink leading-snug">
        Select the formats you want. The agent uses only what you pick here — it decides the order and how many of each.
      </p>

      {/* 4 category accordions */}
      <div className="grid gap-2">
        {CATEGORIES.map((cat) => {
          const catMap = byCategory.get(cat.id)!;
          const families = [...catMap.entries()].map(([family, variants]) => ({ family, variants }));
          if (!families.length) return null;
          return (
            <CategoryAccordion
              key={cat.id}
              cat={cat}
              families={families}
              selectedBlockIds={selectedIds}
              onToggle={handleToggle}
            />
          );
        })}
      </div>

      {/* Document data (for composer) */}
      {onAddDataField ? (
        <div className="mt-4 min-w-0">
          <p className="m-0 mb-1 flex items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-soft-ink">
            Document data
            <span className="rounded-full bg-[var(--accent-soft)] px-1.5 text-[9px] normal-case tracking-normal text-[var(--accent-ink)]">user</span>
          </p>
          <p className="m-0 mb-2 px-1 text-[10.5px] text-soft-ink">Values the user types when running the agent — date, topic, course.</p>
          <div className="flex flex-wrap gap-1 px-1">
            {["Date", "Topic", "Course", "Teacher", "Class"].map((name) => (
              <button key={name} type="button" className="rounded-full border border-ink/10 px-2.5 py-0.5 text-[11px] font-semibold text-ink hover:bg-[var(--surface-soft)]" onClick={() => onAddDataField(name)}>＋ {name}</button>
            ))}
          </div>
          <div className="mt-1.5 flex gap-1 px-1">
            <input className={`${fieldBase} min-w-0 flex-1 py-1 text-xs`} value={customData} onChange={(e) => setCustomData(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && customData.trim()) { onAddDataField(customData.trim()); setCustomData(""); } }} placeholder="Other, e.g. School" />
            <button type="button" className="rounded-full bg-[var(--accent)] px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40" disabled={!customData.trim()} onClick={() => { onAddDataField(customData.trim()); setCustomData(""); }}>Add</button>
          </div>
        </div>
      ) : null}

      {/* Custom / library blocks */}
      {library.length > 0 ? (
        <div className="mt-4 min-w-0">
          <p className="m-0 mb-1.5 flex items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-soft-ink">My blocks</p>
          <div className="grid gap-1">
            {library.map((block) => (
              <VariantCard
                key={block.id}
                block={block}
                active={selectedIds.has(block.id)}
                catInk="#6b7280"
                catBg="var(--surface-soft)"
                catBorder="rgba(0,0,0,0.08)"
                onToggle={(active) => {
                  if (active) onAddBlock(block, defaultOptions(block));
                  else if (onRemoveBlock) onRemoveBlock(block);
                }}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* Custom block builder */}
      {!blocksOnly ? (
        <div className="mt-4 min-w-0">
          <p className="m-0 mb-1.5 flex items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-soft-ink">Custom block</p>
          <ComponentChat onBuilt={(block) => { setLibrary(readBlockLibrary()); onAddBlock(block, defaultOptions(block)); }} />
        </div>
      ) : null}
    </div>
  );
}
