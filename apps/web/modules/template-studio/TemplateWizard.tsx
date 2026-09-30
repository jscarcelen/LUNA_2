"use client";

import { useEffect, useMemo, useState } from "react";
import { ACCENT_PRESETS, builtInBlocks, instantiateBlock, type AccentPreset, type BlockDef } from "./engine/blocks";
import { buildSampleData } from "./engine/sample";
import { compileForSave } from "./adapters/agentTemplate";
import { createId, createTemplate, createView } from "./engine/model";
import type { Template } from "./engine/types";
import { ElementView } from "./design/canvas/ElementView";
import { card, kicker, primaryBtn, ghostBtn, fieldBase } from "./ui";

/* ─── Categories ─────────────────────────────────────────────────── */
const CATEGORIES = [
  { id: "structure",  label: "Structure",     emoji: "▔", locked: true,  bg: "#f0fdf4", ink: "#166534", border: "#bbf7d0" },
  { id: "questions",  label: "Questions",     emoji: "❶", locked: false, bg: "#dbeafe", ink: "#1d4ed8", border: "#bfdbfe" },
  { id: "worksheets", label: "Worksheets",    emoji: "✍", locked: false, bg: "#fff7ed", ink: "#9a3412", border: "#fed7aa" },
  { id: "games",      label: "Cards & Games", emoji: "🃏", locked: false, bg: "#fdf4ff", ink: "#7e22ce", border: "#e9d5ff" },
] as const;
type CatId = typeof CATEGORIES[number]["id"];

const WORKSHEET_FAMILIES = new Set(["Fill in the blanks", "Match the pairs", "Math practice set", "Cut and paste", "Tracing"]);

// Excluded from the wizard UI
const EXCLUDED_BLOCK_IDS = new Set(["block-question-mixed", "block-mc-kids"]);

function uiCat(block: BlockDef): CatId {
  if (block.category === "structure") return "structure";
  if (block.category === "questions" || (block.category === "kids" && block.family === "Question card")) return "questions";
  if (WORKSHEET_FAMILIES.has(block.family || "")) return "worksheets";
  return "games";
}

// User-friendly names for structure blocks
const STRUCTURE_LABELS: Record<string, string> = {
  "block-header-exam":    "Activity header",
  "block-header-minimal": "Page header",
  "block-footer":         "Page footer",
  "block-section-header": "Section heading",
  "block-callout":        "Callout box",
  "block-document":       "Document body",
  "block-key-points":     "Key points / Numbered list",
};

function blockLabel(block: BlockDef): string {
  return STRUCTURE_LABELS[block.id] || block.variant || block.name;
}

/* ─── Preview formats for the matrix ───────────────────────────────── */
const PREVIEW_FORMATS = [
  { id: "a4",     label: "A4",         emoji: "📄", w: 210, h: 297 },
  { id: "letter", label: "Letter",     emoji: "📃", w: 216, h: 279 },
  { id: "slides", label: "Slides 16:9",emoji: "🖥", w: 254, h: 143 },
];

/* ─── Detect block IDs from an existing saved template ──────────────── */
function detectBlockIds(template: Template): Set<string> {
  const ids = new Set<string>();
  const walk = (elements: any[]) => {
    for (const el of elements) {
      if (el.origin?.blockId) ids.add(el.origin.blockId);
      if (el.children) walk(el.children);
    }
  };
  for (const layout of template.layouts) {
    for (const page of layout.pages) walk(page.elements);
  }
  return ids;
}

/* ─── Assemble Template ──────────────────────────────────────────────── */
function assembleTemplate(
  name: string,
  templateType: "document" | "cards",
  selections: { block: BlockDef; accent: AccentPreset; toggles: Record<string, boolean> }[]
): Template {
  const mainW = templateType === "cards" ? 148 : 210;
  const mainH = templateType === "cards" ? 105 : 297;

  let template = createTemplate(name);
  template = {
    ...template,
    layouts: template.layouts.map((l, i) =>
      i === 0 ? { ...l, canvas: { ...l.canvas, width: mainW, height: mainH } } : l
    ),
  };

  const margins = template.layouts[0].margins;
  const contentW = mainW - margins.left - margins.right;

  for (const { block, accent, toggles } of selections) {
    const { fields, elements } = instantiateBlock(block, template.fields, { accent, toggles });
    const page = template.layouts[0].pages[0];
    const lastY = page.elements.length
      ? Math.max(...page.elements.map((e) => e.frame.y + e.frame.h))
      : margins.top;
    const placed = elements.map((el, i) => ({
      ...el,
      frame: { ...el.frame, x: margins.left, y: lastY + 4 + i * 2, w: contentW },
    }));
    template = {
      ...template,
      fields,
      layouts: template.layouts.map((l, li) =>
        li === 0
          ? { ...l, pages: l.pages.map((p, pi) => pi === 0 ? { ...p, elements: [...p.elements, ...placed] } : p) }
          : l
      ),
    };
  }

  const hasInteractive = selections.some((s) => s.block.category !== "structure");
  const studentView = { ...template.layouts[0].views[0], name: "Student view" };
  const views = hasInteractive ? [studentView, createView("Answer key")] : [studentView];
  const baseLayout = { ...template.layouts[0], views };

  // Build one layout per preview format
  const layouts = PREVIEW_FORMATS.map((fmt, i) => {
    if (i === 0) return { ...baseLayout, canvas: { ...baseLayout.canvas, width: fmt.w, height: fmt.h } };
    return {
      ...baseLayout,
      id: createId("layout"),
      name: fmt.label,
      canvas: { ...baseLayout.canvas, width: fmt.w, height: fmt.h },
      views: views.map((v) => ({ ...v, id: createId("view") })),
    };
  });

  return { ...template, layouts };
}

/* ─── BlockThumbnail ─────────────────────────────────────────────────── */
function BlockThumbnail({ block, accent, toggles = {}, scale = 0.35, maxW = 180 }: {
  block: BlockDef;
  accent: AccentPreset;
  toggles?: Record<string, boolean>;
  scale?: number;
  maxW?: number;
}) {
  const { fields, elements } = useMemo(
    () => instantiateBlock(block, [], { accent, toggles }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [block.id, accent.id, JSON.stringify(toggles)]
  );
  const el = elements[0];
  if (!el) return <div className="h-20 rounded-xl bg-[var(--surface-soft)]" />;
  const w = Math.min(el.frame.w * scale, maxW);
  const h = el.frame.h * scale;
  return (
    <div className="overflow-hidden rounded-xl border border-ink/10 bg-white" style={{ width: w + 8, height: h + 8, flexShrink: 0 }}>
      <ElementView
        element={{ ...el, frame: { ...el.frame, x: 4 / scale, y: 4 / scale } } as any}
        scale={scale}
        selectedIds={[]}
        fields={fields}
        sampleMode
        sampleValues={{}}
        onPointerDown={() => undefined}
        onResizeStart={() => undefined}
      />
    </div>
  );
}

/* ─── VisualizeModal ─────────────────────────────────────────────────── */
function VisualizeModal({ block, accent, toggles, onClose }: {
  block: BlockDef;
  accent: AccentPreset;
  toggles: Record<string, boolean>;
  onClose: () => void;
}) {
  const { fields, elements } = useMemo(
    () => instantiateBlock(block, [], { accent, toggles }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [block.id, accent.id, JSON.stringify(toggles)]
  );
  const el = elements[0];
  const scale = el ? Math.min(2.4, 760 / Math.max(40, el.frame.w)) : 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={onClose}>
      <div className={`${card} max-h-[94vh] w-full max-w-4xl overflow-auto p-8`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-soft-ink">{block.family}</span>
            <h3 className="m-0 text-xl font-bold text-ink">{blockLabel(block)}</h3>
          </div>
          <button type="button" onClick={onClose} className={`${ghostBtn} px-3`}>✕ Close</button>
        </div>
        {el ? (
          <div className="overflow-auto rounded-xl border border-ink/10 bg-[#f0f0f3] p-5">
            <div className="relative bg-white shadow-sm" style={{ width: el.frame.w * scale + 24, minHeight: el.frame.h * scale + 24 }}>
              <ElementView
                element={{ ...el, frame: { ...el.frame, x: 12 / scale, y: 12 / scale } } as any}
                scale={scale}
                selectedIds={[]}
                fields={fields}
                sampleMode
                sampleValues={{}}
                onPointerDown={() => undefined}
                onResizeStart={() => undefined}
              />
            </div>
          </div>
        ) : <p className="text-sm text-soft-ink">No preview available.</p>}
        <p className="m-0 mt-4 text-[12px] text-soft-ink">{block.description}</p>
      </div>
    </div>
  );
}

/* ─── PagePreviewModal ───────────────────────────────────────────────── */
function PagePreviewModal({ template, layoutIndex, viewIndex, onClose }: {
  template: Template;
  layoutIndex: number;
  viewIndex: number;
  onClose: () => void;
}) {
  const [html, setHtml] = useState("");
  const layout = template.layouts[layoutIndex] || template.layouts[0];
  const view = layout?.views[viewIndex] || layout?.views[0];
  const compiled = useMemo(() => compileForSave(template, ""), [template]);
  const sampleData = useMemo(() => buildSampleData(template, 3), [template]);

  useEffect(() => {
    if (!compiled || !view) return;
    setHtml("");
    fetch("/api/templates/render-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template: compiled, sampleData, format: "html", layoutId: layout.id, viewId: view.id }),
    }).then((r) => r.json()).then((payload) => {
      setHtml(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#e5e5ea;}body{padding:10mm;}</style></head><body>${payload.html || ""}</body></html>`);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout?.id, view?.id]);

  const fmtLabel = PREVIEW_FORMATS[layoutIndex]?.label || "A4";
  const viewName = view?.name || "Preview";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60" onClick={onClose}>
      <div className="flex items-center justify-between bg-white/95 px-6 py-3 shadow" onClick={(e) => e.stopPropagation()}>
        <span className="font-bold text-ink">{viewName} — {fmtLabel} preview</span>
        <button type="button" onClick={onClose} className={`${ghostBtn} px-3`}>✕ Close</button>
      </div>
      <div className="flex-1 overflow-auto" onClick={(e) => e.stopPropagation()}>
        {html
          ? <iframe title="Preview" sandbox="" srcDoc={html} className="h-full w-full border-0" />
          : <div className="flex h-full items-center justify-center text-white/70">Loading preview…</div>}
      </div>
    </div>
  );
}

/* ─── WizardHeader ───────────────────────────────────────────────────── */
function WizardHeader({ step, title, subtitle, onBack }: { step: number; title: string; subtitle: string; onBack: () => void }) {
  return (
    <div className={`${card} p-5`}>
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} className={`${ghostBtn} px-3 text-sm`}>‹ Back</button>
        <div className="ml-auto flex gap-1.5">
          {[1, 2, 3, 4].map((n) => (
            <span key={n} className={`h-1.5 w-6 rounded-full transition ${n === step ? "bg-[var(--accent)]" : n < step ? "bg-[var(--accent)]/40" : "bg-ink/15"}`} />
          ))}
        </div>
        <span className="text-[11px] font-semibold text-soft-ink">Step {step} of 4</span>
      </div>
      <h2 className="m-0 mt-4 text-2xl font-bold tracking-tight text-ink">{title}</h2>
      <p className="m-0 mt-0.5 text-sm text-soft-ink">{subtitle}</p>
    </div>
  );
}

/* ─── Main Wizard ────────────────────────────────────────────────────── */
type Step = 1 | 2 | 3 | 4;

export interface TemplateWizardProps {
  onSave: (template: Template, savedId?: string) => Promise<void>;
  onCancel: () => void;
  editTemplate?: { template: Template; savedId: string };
}

export function TemplateWizard({ onSave, onCancel, editTemplate }: TemplateWizardProps) {
  const [step, setStep] = useState<Step>(editTemplate ? 4 : 1);
  const [name, setName] = useState(editTemplate?.template.name || "");
  const [templateType, setTemplateType] = useState<"document" | "cards">("document");

  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(() => {
    if (editTemplate) return detectBlockIds(editTemplate.template);
    const init = new Set<string>();
    builtInBlocks()
      .filter((b) => b.category === "structure" && !EXCLUDED_BLOCK_IDS.has(b.id))
      .forEach((b) => init.add(b.id));
    return init;
  });

  // Per-block color accent (blockId → accentId). When editing, default everything to blue.
  const [blockAccents, setBlockAccents] = useState<Map<string, string>>(() => {
    if (!editTemplate) return new Map();
    const map = new Map<string, string>();
    for (const id of detectBlockIds(editTemplate.template)) map.set(id, "blue");
    return map;
  });

  const [blockToggles, setBlockToggles] = useState<Map<string, Record<string, boolean>>>(new Map());
  // Tracks which format-selection cards are manually open
  const [openBlocks, setOpenBlocks] = useState<Set<string>>(new Set());
  const [visualizeBlock, setVisualizeBlock] = useState<BlockDef | null>(null);
  const [pagePreview, setPagePreview] = useState<{ template: Template; layoutIndex: number; viewIndex: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const allBlocks = useMemo(() => builtInBlocks().filter((b) => !EXCLUDED_BLOCK_IDS.has(b.id)), []);

  const byCategory = useMemo(() => {
    const map = new Map<CatId, BlockDef[]>();
    for (const cat of CATEGORIES) map.set(cat.id, []);
    for (const block of allBlocks) map.get(uiCat(block))?.push(block);
    return map;
  }, [allBlocks]);

  // Ordered selections; question options default to ALL ON
  const selectedBlocks = useMemo(() => {
    const out: { block: BlockDef; accent: AccentPreset; toggles: Record<string, boolean> }[] = [];
    for (const cat of CATEGORIES) {
      for (const block of byCategory.get(cat.id) || []) {
        if (!selectedBlockIds.has(block.id)) continue;
        const isInteractive = block.category !== "structure";
        const defaults = Object.fromEntries(
          (block.options || []).map((o) => [o.key, isInteractive ? true : o.default])
        );
        const toggles = { ...defaults, ...(blockToggles.get(block.id) || {}) };
        const accentId = blockAccents.get(block.id) || "blue";
        const accent = ACCENT_PRESETS.find((a) => a.id === accentId) || ACCENT_PRESETS[0];
        out.push({ block, accent, toggles });
      }
    }
    return out;
  }, [selectedBlockIds, blockToggles, blockAccents, byCategory]);

  const nonStructureSelected = useMemo(
    () => selectedBlocks.filter((s) => s.block.category !== "structure"),
    [selectedBlocks]
  );

  const allFormatted = useMemo(
    () => nonStructureSelected.length === 0 || nonStructureSelected.every((s) => blockAccents.has(s.block.id)),
    [nonStructureSelected, blockAccents]
  );

  const assembledTemplate = useMemo(
    () => selectedBlocks.length ? assembleTemplate(name || "Untitled", templateType, selectedBlocks) : null,
    [selectedBlocks, name, templateType]
  );

  function toggleBlock(id: string) {
    setSelectedBlockIds((cur) => { const next = new Set(cur); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  function setToggle(blockId: string, key: string, val: boolean) {
    setBlockToggles((cur) => {
      const prev = cur.get(blockId) || {};
      return new Map(cur).set(blockId, { ...prev, [key]: val });
    });
  }

  function selectFormat(blockId: string, accentId: string) {
    setBlockAccents((cur) => new Map(cur).set(blockId, accentId));
    setOpenBlocks((cur) => { const next = new Set(cur); next.delete(blockId); return next; });
  }

  function toggleOpen(blockId: string) {
    setOpenBlocks((cur) => {
      const next = new Set(cur);
      next.has(blockId) ? next.delete(blockId) : next.add(blockId);
      return next;
    });
  }

  function visualizeModalFor(block: BlockDef) {
    const accentId = blockAccents.get(block.id) || "blue";
    const accent = ACCENT_PRESETS.find((a) => a.id === accentId) || ACCENT_PRESETS[0];
    const isInteractive = block.category !== "structure";
    const toggles = {
      ...Object.fromEntries((block.options || []).map((o) => [o.key, isInteractive ? true : o.default])),
      ...(blockToggles.get(block.id) || {}),
    };
    return { block, accent, toggles };
  }

  async function handleSave() {
    if (!assembledTemplate) return;
    setSaving(true);
    try { await onSave(assembledTemplate, editTemplate?.savedId); } finally { setSaving(false); }
  }

  /* ─── Step 1 ──────────────────────────────────────────────────────── */
  if (step === 1) {
    return (
      <div className={`${card} mx-auto max-w-2xl p-8`}>
        <button type="button" onClick={onCancel} className={`${ghostBtn} mb-6 px-3 text-sm`}>‹ Back to templates</button>
        <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--accent-ink)]">New template</span>
        <h2 className="m-0 mt-4 text-3xl font-bold tracking-tight text-ink">Create a template</h2>
        <p className="m-0 mt-1 text-sm text-soft-ink">A template defines which component types the AI can produce and how they look.</p>

        <label className="mt-6 block">
          <span className="mb-1.5 block text-sm font-semibold text-ink">Template name</span>
          <input
            className={`${fieldBase} w-full text-base`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Year 7 Maths Exam, Vocabulary Flashcards…"
            autoFocus
          />
        </label>

        <div className="mt-6">
          <span className="mb-2 block text-sm font-semibold text-ink">What kind of output?</span>
          <div className="grid grid-cols-2 gap-3">
            {([
              { id: "document", emoji: "📄", label: "Document / Presentation", desc: "A4, Letter or slides — great for exams, worksheets and guides." },
              { id: "cards",    emoji: "🃏", label: "Cards / Flashcards / Game", desc: "Compact cards, flashcard decks and learning games." },
            ] as const).map((opt) => (
              <button key={opt.id} type="button" onClick={() => setTemplateType(opt.id)}
                className={`flex flex-col items-start gap-3 rounded-2xl border-2 p-5 text-left transition ${templateType === opt.id ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-md" : "border-ink/10 bg-white hover:border-[var(--accent)]/40 hover:shadow"}`}>
                <span className="text-3xl">{opt.emoji}</span>
                <div className="flex-1">
                  <span className="block text-[14px] font-bold text-ink">{opt.label}</span>
                  <span className="mt-0.5 block text-[12px] text-soft-ink">{opt.desc}</span>
                </div>
                <span className={`grid size-5 place-items-center rounded-full border-2 transition ${templateType === opt.id ? "border-[var(--accent)] bg-[var(--accent)]" : "border-ink/25 bg-white"}`}>
                  {templateType === opt.id ? <span className="text-[10px] font-bold text-white">✓</span> : null}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button type="button" disabled={!name.trim()} onClick={() => setStep(2)} className={`${primaryBtn} px-8 py-2.5 disabled:opacity-40`}>
            Next: Pick components ›
          </button>
        </div>
      </div>
    );
  }

  /* ─── Step 2: component selection ─────────────────────────────────── */
  if (step === 2) {
    return (
      <div className="tw-scope mx-auto max-w-2xl">
        <WizardHeader step={2} title="What can the agent produce?" subtitle="Tick each component type you want. Structure is always included." onBack={() => setStep(1)} />
        <div className={`${card} mt-3 p-5`}>
          {CATEGORIES.map((cat) => {
            const blocks = byCategory.get(cat.id) || [];
            if (!blocks.length) return null;
            const activeCnt = blocks.filter((b) => selectedBlockIds.has(b.id)).length;
            return (
              <div key={cat.id} className="mb-4 last:mb-0">
                <div className="mb-2 flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: cat.bg, border: `1px solid ${cat.border}` }}>
                  <span className="text-base">{cat.emoji}</span>
                  <span className="flex-1 text-[13px] font-bold" style={{ color: cat.ink }}>{cat.label}</span>
                  {cat.locked
                    ? <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold" style={{ borderColor: cat.border, color: cat.ink }}>Always included</span>
                    : activeCnt > 0 ? <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold" style={{ borderColor: cat.border, color: cat.ink }}>{activeCnt} selected</span> : null}
                </div>
                <div className="grid gap-1.5 pl-2">
                  {blocks.map((block) => {
                    const active = selectedBlockIds.has(block.id);
                    const locked = cat.locked;
                    return (
                      <button key={block.id} type="button" disabled={locked} onClick={() => !locked && toggleBlock(block.id)}
                        className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${active ? "border-[var(--accent)]/40 bg-[var(--accent-soft)]" : locked ? "border-ink/10 bg-[var(--surface-soft)] opacity-75" : "border-ink/10 bg-white hover:border-ink/25 hover:bg-[var(--surface-soft)]"}`}>
                        {/* Icon badge */}
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl text-sm font-bold"
                          style={{ background: active ? cat.bg : "var(--surface-soft)", color: active ? cat.ink : "#6b7280", border: active ? `1px solid ${cat.border}` : "1px solid transparent" }}>
                          {block.icon || cat.emoji}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-semibold text-ink">{blockLabel(block)}</span>
                          <span className="line-clamp-1 block text-[11px] text-soft-ink">{block.description}</span>
                        </span>
                        <span className={`grid size-5 shrink-0 place-items-center rounded-full border-2 transition ${active ? "border-[var(--accent)] bg-[var(--accent)]" : "border-ink/25 bg-white"}`}>
                          {active ? <span className="text-[10px] font-bold text-white">✓</span> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex justify-end">
          <button type="button" className={`${primaryBtn} px-8 py-2.5`} onClick={() => setStep(3)}>
            Next: Choose style ›
          </button>
        </div>
      </div>
    );
  }

  /* ─── Step 3: per-component format gallery ─────────────────────────── */
  if (step === 3) {
    const remaining = nonStructureSelected.filter((s) => !blockAccents.has(s.block.id)).length;
    return (
      <div className="tw-scope mx-auto max-w-2xl">
        <WizardHeader step={3} title="How should it look?" subtitle="Pick a color style for each component — all must be chosen to continue." onBack={() => setStep(2)} />

        {nonStructureSelected.map(({ block, toggles }) => {
          const selectedAccentId = blockAccents.get(block.id);
          const isFormatted = !!selectedAccentId;
          const isOpen = openBlocks.has(block.id) || !isFormatted;
          const selectedAccent = ACCENT_PRESETS.find((a) => a.id === selectedAccentId) || null;

          return (
            <div key={block.id} className={`${card} mt-3 overflow-hidden transition-all`}
              style={{ border: isFormatted ? "2px solid #16a34a" : undefined }}>
              {/* Card header / toggle */}
              <button type="button" onClick={() => toggleOpen(block.id)}
                className="flex w-full items-center gap-3 px-5 py-4 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-soft-ink">{block.family}</span>
                  <span className="block text-[15px] font-bold text-ink">{blockLabel(block)}</span>
                </span>
                {isFormatted && selectedAccent ? (
                  <span className="flex shrink-0 items-center gap-1.5 rounded-full border-2 border-green-600 bg-green-50 px-3 py-1 text-[12px] font-semibold text-green-700">
                    <span className="size-3 rounded-full" style={{ background: selectedAccent.main }} />
                    {selectedAccent.label} ✓
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full border border-ink/15 px-3 py-1 text-[11px] text-soft-ink">Pick a style</span>
                )}
                <span className="text-[10px] text-soft-ink">{isOpen ? "▲" : "▼"}</span>
              </button>

              {isOpen ? (
                <div className="border-t border-ink/10 px-5 pb-5 pt-4">
                  {/* Scrollable color gallery */}
                  <p className={`${kicker} mb-3`}>Choose a color style</p>
                  <div className="flex gap-2.5 overflow-x-auto pb-2">
                    {ACCENT_PRESETS.map((preset) => {
                      const sel = selectedAccentId === preset.id;
                      return (
                        <button key={preset.id} type="button" onClick={() => selectFormat(block.id, preset.id)}
                          className={`flex shrink-0 flex-col items-center gap-1.5 rounded-xl border-2 p-2 transition ${sel ? "border-green-600 shadow-md" : "border-transparent hover:border-ink/20"}`}
                          style={{ background: sel ? preset.tint : "var(--surface-soft)" }}>
                          <BlockThumbnail block={block} accent={preset} toggles={toggles} scale={0.28} maxW={110} />
                          <div className="flex items-center gap-1">
                            <span className="size-2.5 rounded-full" style={{ background: preset.main }} />
                            <span className="text-[10px] font-semibold" style={{ color: sel ? preset.main : "#6b7280" }}>{preset.label}</span>
                            {sel ? <span className="text-[10px] text-green-600">✓</span> : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Options */}
                  {(block.options || []).length > 0 && (
                    <div className="mt-4">
                      <p className={`${kicker} mb-2`}>Options</p>
                      <div className="grid gap-1.5">
                        {(block.options || []).map((opt) => {
                          const val = blockToggles.get(block.id)?.[opt.key] ?? (block.category !== "structure" ? true : opt.default);
                          return (
                            <label key={opt.key} className="flex cursor-pointer items-center gap-2 text-[13px] text-ink">
                              <input type="checkbox" checked={val} onChange={(e) => setToggle(block.id, opt.key, e.target.checked)} className="accent-[var(--accent)]" />
                              {opt.label}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {selectedAccent && (
                    <div className="mt-4 flex justify-end">
                      <button type="button" onClick={() => setVisualizeBlock(block)}
                        className="rounded-full border border-ink/15 px-4 py-1.5 text-[12px] font-semibold text-soft-ink hover:border-[var(--accent)]/50 hover:text-[var(--accent-ink)]">
                        Visualize full size ↗
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}

        {nonStructureSelected.length === 0 && (
          <div className={`${card} mt-3 p-5`}>
            <p className="m-0 text-sm text-soft-ink">Only structure components selected — nothing to style here.</p>
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-3">
          {!allFormatted && remaining > 0 && (
            <span className="text-[12px] text-soft-ink">{remaining} component{remaining !== 1 ? "s" : ""} still need a style</span>
          )}
          <button type="button" disabled={!allFormatted} onClick={() => setStep(4)} className={`${primaryBtn} px-8 py-2.5 disabled:opacity-40`}>
            Next: Preview ›
          </button>
        </div>

        {visualizeBlock && (() => {
          const { block, accent, toggles } = visualizeModalFor(visualizeBlock);
          return <VisualizeModal block={block} accent={accent} toggles={toggles} onClose={() => setVisualizeBlock(null)} />;
        })()}
      </div>
    );
  }

  /* ─── Step 4: preview gallery + matrix + save ──────────────────────── */
  const views = assembledTemplate?.layouts[0]?.views || [];
  const hasInteractive = selectedBlocks.some((s) => s.block.category !== "structure");

  return (
    <div className="tw-scope mx-auto max-w-4xl">
      <WizardHeader step={4} title="Preview your template" subtitle="Review each component, then see how the full document looks." onBack={() => setStep(3)} />

      {/* Component gallery — bigger thumbnails */}
      <div className={`${card} mt-3 p-5`}>
        <p className={`${kicker} mb-3`}>Components — {selectedBlocks.length} selected</p>
        <div className="flex flex-wrap gap-5">
          {selectedBlocks.map(({ block, accent: a, toggles }) => (
            <div key={block.id} className="flex flex-col items-center gap-2">
              <div className="group relative cursor-pointer" onClick={() => setVisualizeBlock(block)}>
                <BlockThumbnail block={block} accent={a} toggles={toggles} scale={0.52} maxW={240} />
                <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/0 transition group-hover:bg-black/10">
                  <span className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-ink opacity-0 shadow-sm transition group-hover:opacity-100">Visualize ↗</span>
                </div>
              </div>
              <span className="max-w-[240px] truncate text-center text-[12px] font-semibold text-ink">{blockLabel(block)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Preview matrix: views × formats */}
      {assembledTemplate && (
        <div className={`${card} mt-3 p-5`}>
          <p className={`${kicker} mb-1`}>Full document preview</p>
          <p className="m-0 mb-4 text-[12px] text-soft-ink">Click any cell to open a full-page preview with sample content.</p>
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-1.5 text-sm">
              <thead>
                <tr>
                  <th className="w-36 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-soft-ink" />
                  {PREVIEW_FORMATS.map((fmt) => (
                    <th key={fmt.id} className="py-2 text-center text-[11px] font-semibold uppercase tracking-[0.1em] text-soft-ink">
                      {fmt.emoji} {fmt.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {views.map((view, viewIdx) => {
                  if (!hasInteractive && viewIdx > 0) return null;
                  return (
                    <tr key={view.id}>
                      <td className="py-1.5 pr-3 text-[13px] font-semibold text-ink">{view.name}</td>
                      {PREVIEW_FORMATS.map((fmt, fmtIdx) => (
                        <td key={fmt.id} className="text-center">
                          <button type="button"
                            onClick={() => setPagePreview({ template: assembledTemplate, layoutIndex: fmtIdx, viewIndex: viewIdx })}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-ink/15 bg-white px-4 py-2 text-[12px] font-semibold text-ink transition hover:border-[var(--accent)]/60 hover:bg-[var(--accent-soft)] hover:shadow-md">
                            <span>📄</span> Preview
                          </button>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Save */}
      <div className={`${card} mt-3 p-5`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="m-0 text-base font-bold text-ink">{name || "Untitled template"}</p>
            <p className="m-0 text-[12px] text-soft-ink">
              {templateType === "cards" ? "Cards / Games" : "Document / Presentation"} · {selectedBlocks.length} component{selectedBlocks.length !== 1 ? "s" : ""} · {views.length} view{views.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button type="button" disabled={saving || !selectedBlocks.length} onClick={handleSave}
            className={`${primaryBtn} shrink-0 px-8 py-2.5 text-base disabled:opacity-50`}>
            {saving ? "Saving…" : editTemplate ? "Save changes" : "Save template"}
          </button>
        </div>
      </div>

      {visualizeBlock && (() => {
        const { block, accent, toggles } = visualizeModalFor(visualizeBlock);
        return <VisualizeModal block={block} accent={accent} toggles={toggles} onClose={() => setVisualizeBlock(null)} />;
      })()}
      {pagePreview && (
        <PagePreviewModal
          template={pagePreview.template}
          layoutIndex={pagePreview.layoutIndex}
          viewIndex={pagePreview.viewIndex}
          onClose={() => setPagePreview(null)}
        />
      )}
    </div>
  );
}
