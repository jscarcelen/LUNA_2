"use client";

import { useEffect, useMemo, useState } from "react";
import { ACCENT_PRESETS, builtInBlocks, instantiateBlock, type AccentPreset, type BlockDef } from "./engine/blocks";
import { buildSampleData } from "./engine/sample";
import { compileForSave } from "./adapters/agentTemplate";
import { createId, createTemplate, createView } from "./engine/model";
import type { Element, GroupElement, Template } from "./engine/types";
import { ElementView } from "./design/canvas/ElementView";
import { card, kicker, primaryBtn, ghostBtn, fieldBase } from "./ui";

/* ─── Structure types ────────────────────────────────────────────── */
type StructureType = "quiz" | "document" | "game";
type Step = 1 | 2 | 3 | 4;

const STRUCTURE_TYPES: { id: StructureType; emoji: string; label: string; desc: string }[] = [
  { id: "quiz",     emoji: "📝", label: "Quiz / Exam",          desc: "Fixed header (title, name, date). Add question types and worksheets." },
  { id: "document", emoji: "📄", label: "Document / Summary",   desc: "Headings, paragraphs, bullets, callouts, tables — all included, you just style them." },
  { id: "game",     emoji: "🃏", label: "Flashcard / Game",     desc: "Compact header + one game format (flashcard or puzzle)." },
];

/* ─── Fixed blocks per type ──────────────────────────────────────── */
const QUIZ_FIXED_IDS     = ["block-header-exam", "block-footer"];
const DOCUMENT_BLOCK_IDS = ["block-header-minimal", "block-section-header", "block-document", "block-key-points", "block-callout", "block-vocabulary-row", "block-footer"];
const GAME_FIXED_IDS     = ["block-header-minimal"];

/* ─── Interactive blocks for quiz step 2 ─────────────────────────── */
const QUIZ_QUESTIONS: { id: string; label: string; icon: string; desc: string }[] = [
  { id: "block-exam-question",     label: "Multiple choice",         icon: "❶",  desc: "Numbered question with lettered options." },
  { id: "block-open-question",     label: "Open answer",             icon: "✍",  desc: "Question with a blank writing area." },
  { id: "block-true-false",        label: "True / False",            icon: "◎",  desc: "Binary choice question." },
  { id: "block-question-compact",  label: "Compact (2 columns)",     icon: "❶❶", desc: "Fits more questions per page." },
  { id: "block-section-questions", label: "Sections with questions", icon: "§❶", desc: "Group questions under numbered sections." },
  { id: "block-answer-box",        label: "Answer key box",          icon: "✓",  desc: "Highlighted correct answer with explanation." },
];
const QUIZ_WORKSHEETS: { id: string; label: string; icon: string; desc: string }[] = [
  { id: "block-fill-blanks",   label: "Fill in the blanks",  icon: "Aa", desc: "Sentences with a missing word." },
  { id: "block-match-pairs",   label: "Match the pairs",     icon: "⋯",  desc: "Connect words, images, or translations." },
  { id: "block-math-practice", label: "Math practice set",   icon: "±",  desc: "Numbered operations with working and answer boxes." },
  { id: "block-word-search",   label: "Word search",         icon: "▩",  desc: "Letter grid with words to find." },
  { id: "block-pair-puzzle",   label: "Pair puzzle",         icon: "▦",  desc: "Cut-apart matching tiles." },
  { id: "block-square-puzzle", label: "Square puzzle",       icon: "▦",  desc: "16-tile edge-matching grid." },
  { id: "block-tracing",       label: "Tracing",             icon: "✎",  desc: "Large letters between writing lines." },
  { id: "block-cut-paste",     label: "Cut and paste",       icon: "✂",  desc: "Category boxes with cut-out words." },
];

/* ─── Game options ───────────────────────────────────────────────── */
const GAME_OPTIONS: { id: string; emoji: string; label: string; desc: string; primaryBlockId: string | null; familyIds: string[]; disabled?: boolean }[] = [
  { id: "flashcard", emoji: "🃏", label: "Flashcard deck", desc: "Front / back cards — great for vocabulary and key concepts.", primaryBlockId: "block-flashcard", familyIds: ["block-flashcard", "block-flashcard-single"] },
  { id: "puzzle",    emoji: "🧩", label: "Word puzzle",    desc: "Coming soon.", primaryBlockId: null, familyIds: [], disabled: true },
];

/* ─── Helpers ────────────────────────────────────────────────────── */
function findBlock(id: string): BlockDef | undefined {
  return builtInBlocks().find((b) => b.id === id);
}

/** Never auto-enable "answer" — it is controlled by view (student view hides it, answer key shows it).
 * All other options default to ON so teachers see the richest preview first. */
function defaultToggles(block: BlockDef): Record<string, boolean> {
  return Object.fromEntries((block.options || []).map((o) => [o.key, o.key === "answer" ? false : true]));
}

/**
 * Maps each block ID to the list of block IDs that are genuine visual-design alternatives
 * (same concept / same AI fields, different visual style).
 * Siblings share the same entry — both point to the same array.
 */
const DESIGN_VARIANTS: Record<string, string[]> = {
  // Multiple choice question: standard card vs. kids playful card
  "block-exam-question":    ["block-exam-question", "block-mc-kids"],
  "block-mc-kids":          ["block-exam-question", "block-mc-kids"],
  // Compact MC: no kids variant yet, single entry keeps the UI consistent
  "block-question-compact": ["block-question-compact"],
  // Open answer
  "block-open-question":    ["block-open-question"],
  // True / False
  "block-true-false":       ["block-true-false"],
  // Section + questions (combined block)
  "block-section-questions":["block-section-questions"],
  // Mixed question (agent picks type)
  "block-question-mixed":   ["block-question-mixed"],
  // Flashcard: grid view vs. one-per-page
  "block-flashcard":        ["block-flashcard", "block-flashcard-single"],
  "block-flashcard-single": ["block-flashcard", "block-flashcard-single"],
};

function accentOf(id: string, map: Map<string, string>): AccentPreset {
  return ACCENT_PRESETS.find((a) => a.id === (map.get(id) || "blue")) || ACCENT_PRESETS[0];
}

/* ─── Layout scaling helpers ─────────────────────────────────────── */
// All block child elements are built against PAGE.width = 186 (A4 content width).
// When assembling for Letter (192mm) or Slides (230mm), the outer group frame is already
// overridden to contentW, but child elements inside each group keep their A4 coordinates.
// These helpers recursively scale inner x-positions and widths so every format looks right.

const A4_CONTENT_W = 186; // PAGE.width — the reference all blocks are built against

function scaleElement(el: Element, ratio: number): Element {
  const scaled: Element = {
    ...el,
    frame: {
      ...el.frame,
      x: +(el.frame.x * ratio).toFixed(2),
      w: +(el.frame.w * ratio).toFixed(2),
    },
  };
  if (scaled.type === "group") {
    return {
      ...scaled,
      children: (scaled as GroupElement).children.map((child) => scaleElement(child, ratio)),
    } as GroupElement;
  }
  return scaled;
}

/**
 * Scales only the *children* of a top-level group element to the new content width.
 * The outer group frame is already set correctly by assembleTemplate; we must not touch it.
 */
function scaleGroupChildren(el: Element, toContentW: number): Element {
  if (el.type !== "group" || Math.abs(toContentW - A4_CONTENT_W) < 0.5) return el;
  const ratio = toContentW / A4_CONTENT_W;
  return {
    ...el,
    children: (el as GroupElement).children.map((child) => scaleElement(child, ratio)),
  } as GroupElement;
}

/* ─── assembleTemplate ───────────────────────────────────────────── */
// All blocks go on ONE tall page (no page-break splitting — the renderer handles CSS pagination).
// Blocks with an "answer" toggle produce two element sets: student view (answer=false) and
// answer key view (answer=true), each restricted via element.visibility.views.
function assembleTemplate(
  name: string,
  canvasW: number,
  canvasH: number,
  selections: { block: BlockDef; accent: AccentPreset; toggles: Record<string, boolean> }[]
): Template {
  let template = createTemplate(name);
  const margins = template.layouts[0].margins;
  const contentW = canvasW - margins.left - margins.right;

  const hasAnswerToggle = selections.some((s) => (s.block.options || []).some((o) => o.key === "answer"));
  const studentView = { ...template.layouts[0].views[0], name: "Student view" };
  const answerKey = hasAnswerToggle ? createView("Answer key") : null;
  const views = answerKey ? [studentView, answerKey] : [studentView];

  let curY = margins.top;
  const allElements: ReturnType<typeof instantiateBlock>["elements"] = [];
  let currentFields = template.fields;

  for (const { block, accent, toggles } of selections) {
    const blockHasAnswer = (block.options || []).some((o) => o.key === "answer");

    if (blockHasAnswer && answerKey) {
      // Student view: answer hidden, element visible only in student view
      const studentResult = instantiateBlock(block, currentFields, { accent, toggles: { ...toggles, answer: false } });
      currentFields = studentResult.fields;
      let yOff = curY;
      const studentPlaced = studentResult.elements.map((el) => {
        const isEveryPage = el.type === "group" && (el as GroupElement).pageScope?.mode === "every";
        if (isEveryPage) return { ...el, frame: { ...el.frame, x: margins.left, w: contentW }, visibility: { views: [studentView.id] } };
        const y = yOff; yOff += el.frame.h + 2;
        return { ...el, frame: { ...el.frame, x: margins.left, y, w: contentW }, visibility: { views: [studentView.id] } };
      });
      allElements.push(...studentPlaced);

      // Answer key: answer shown, element visible only in answer key view
      const keyResult = instantiateBlock(block, currentFields, { accent, toggles: { ...toggles, answer: true } });
      let yOff2 = curY;
      const keyPlaced = keyResult.elements.map((el) => {
        const isEveryPage = el.type === "group" && (el as GroupElement).pageScope?.mode === "every";
        if (isEveryPage) return { ...el, frame: { ...el.frame, x: margins.left, w: contentW }, visibility: { views: [answerKey.id] } };
        const y = yOff2; yOff2 += el.frame.h + 2;
        return { ...el, frame: { ...el.frame, x: margins.left, y, w: contentW }, visibility: { views: [answerKey.id] } };
      });
      allElements.push(...keyPlaced);

      curY = yOff + 2;
    } else {
      const result = instantiateBlock(block, currentFields, { accent, toggles });
      currentFields = result.fields;
      let yOff = curY;
      const placed = result.elements.map((el) => {
        // pageScope:"every" elements (header/footer) keep their original y position
        // and do NOT advance the flow cursor — the renderer repeats them on every page.
        const isEveryPage = el.type === "group" && (el as GroupElement).pageScope?.mode === "every";
        if (isEveryPage) return { ...el, frame: { ...el.frame, x: margins.left, w: contentW } };
        const y = yOff; yOff += el.frame.h + 2;
        return { ...el, frame: { ...el.frame, x: margins.left, y, w: contentW } };
      });
      allElements.push(...placed);
      // Only advance curY for non-pageScope elements
      const hasFlowEl = result.elements.some((el) => !(el.type === "group" && (el as GroupElement).pageScope?.mode === "every"));
      if (hasFlowEl) curY = yOff + 2;
    }
  }

  const totalH = Math.max(canvasH, curY + margins.bottom);
  const fmts: { label: string; w: number; h: number; isSlides?: boolean; class?: "paged" | "slides" }[] = canvasW < 200
    ? [{ label: "Cards", w: canvasW, h: totalH }]
    : [
        { label: "A4",          w: 210, h: totalH },
        { label: "Letter",      w: 216, h: totalH },
        { label: "Slides 16:9", w: 254, h: 143, isSlides: true },
      ];
  const baseLayout = { ...template.layouts[0], views };
  const layouts = fmts.map((fmt, i) => {
    // Scale inner element coordinates to match this format's content width.
    // Outer group frames are already set to contentW in the placement loop above;
    // child elements need their x-positions and widths scaled proportionally.
    const fmtContentW = fmt.w - margins.left - margins.right;
    const scaledElements = allElements.map((el) => scaleGroupChildren(el, fmtContentW));
    const page = { ...template.layouts[0].pages[0], elements: scaledElements };
    const base = i === 0
      ? { ...baseLayout, pages: [page], canvas: { ...baseLayout.canvas, width: fmt.w, height: fmt.h } }
      : { ...baseLayout, pages: [page], id: createId("layout"), name: fmt.label, canvas: { ...baseLayout.canvas, width: fmt.w, height: fmt.h }, views: views.map((v) => ({ ...v, id: createId("view") })) };
    return fmt.isSlides ? { ...base, class: "slides" as const } : base;
  });
  return { ...template, fields: currentFields, layouts };
}

/* ─── BlockThumbnail ─────────────────────────────────────────────── */
function BlockThumbnail({ block, accent, toggles = {}, scale = 0.35, maxW = 180 }: {
  block: BlockDef; accent: AccentPreset; toggles?: Record<string, boolean>; scale?: number; maxW?: number;
}) {
  const { fields, elements } = useMemo(
    () => instantiateBlock(block, [], { accent, toggles }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [block.id, accent.id, JSON.stringify(toggles)]
  );
  const el = elements[0];
  if (!el) return <div className="h-16 rounded-xl bg-[var(--surface-soft)]" />;
  const w = Math.min(el.frame.w * scale, maxW);
  const h = el.frame.h * scale;
  return (
    <div className="overflow-hidden rounded-xl border border-ink/10 bg-white" style={{ width: w + 8, height: h + 8, flexShrink: 0 }}>
      <ElementView element={{ ...el, frame: { ...el.frame, x: 4 / scale, y: 4 / scale } } as any} scale={scale} selectedIds={[]} fields={fields} sampleMode sampleValues={{}} onPointerDown={() => undefined} onResizeStart={() => undefined} />
    </div>
  );
}

/* ─── VisualizeModal ─────────────────────────────────────────────── */
function VisualizeModal({ block: initialBlock, accentId: initialAccentId, toggles, allBlocks, onClose, onConfirm }: {
  block: BlockDef; accentId: string; toggles: Record<string, boolean>; allBlocks: BlockDef[];
  onClose: () => void; onConfirm?: (blockId: string, accentId: string) => void;
}) {
  const [localBlockId, setLocalBlockId] = useState(initialBlock.id);
  const [localAccentId, setLocalAccentId] = useState(initialAccentId || "blue");
  // Sync with parent when the selected format/color changes outside the modal
  useEffect(() => { setLocalBlockId(initialBlock.id); }, [initialBlock.id]);
  useEffect(() => { setLocalAccentId(initialAccentId || "blue"); }, [initialAccentId]);
  const block = allBlocks.find((b) => b.id === localBlockId) || initialBlock;
  const accent = ACCENT_PRESETS.find((a) => a.id === localAccentId) || ACCENT_PRESETS[0];
  // Show format variants using the DESIGN_VARIANTS map (same logic as FormatCard)
  const designIds = DESIGN_VARIANTS[initialBlock.id];
  const familyVariants: BlockDef[] = designIds
    ? designIds.map((id) => allBlocks.find((b) => b.id === id)).filter(Boolean) as BlockDef[]
    : allBlocks.filter((b) => b.family === block.family && b.category === block.category);
  const { fields, elements } = useMemo(() => instantiateBlock(block, [], { accent, toggles }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [localBlockId, localAccentId, JSON.stringify(toggles)]);
  const el = elements[0];
  const scale = el ? Math.min(2.4, 760 / Math.max(40, el.frame.w)) : 1;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={onClose}>
      <div className={`${card} max-h-[94vh] w-full max-w-4xl overflow-auto p-8`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-soft-ink">{block.family}</span>
            <h3 className="m-0 text-xl font-bold text-ink">{block.variant || block.name}</h3>
          </div>
          <div className="flex items-center gap-2">
            {onConfirm && <button type="button" onClick={() => { onConfirm(localBlockId, localAccentId); onClose(); }} className={`${primaryBtn} px-4 py-2 text-sm`}>Use this style ✓</button>}
            <button type="button" onClick={onClose} className={`${ghostBtn} px-3`}>✕ Close</button>
          </div>
        </div>
        {familyVariants.length > 1 && (
          <div className="mb-4">
            <p className={`${kicker} mb-2`}>Format</p>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {familyVariants.map((v) => {
                const sel = v.id === localBlockId;
                return (
                  <button key={v.id} type="button" onClick={() => setLocalBlockId(v.id)}
                    className={`flex shrink-0 flex-col items-center gap-1.5 rounded-xl border-2 p-2 transition ${sel ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-transparent bg-[var(--surface-soft)] hover:border-ink/20"}`}>
                    <BlockThumbnail block={v} accent={accent} toggles={toggles} scale={0.22} maxW={90} />
                    <span className="text-[10px] font-semibold" style={{ color: sel ? "var(--accent-ink)" : "#6b7280" }}>{v.variant || v.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="mb-5">
          <p className={`${kicker} mb-2`}>Color</p>
          <div className="flex flex-wrap gap-2">
            {ACCENT_PRESETS.map((preset) => {
              const sel = preset.id === localAccentId;
              return (
                <button key={preset.id} type="button" onClick={() => setLocalAccentId(preset.id)}
                  className={`flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-[12px] font-semibold transition ${sel ? "border-[var(--accent)]" : "border-transparent bg-[var(--surface-soft)]"}`}
                  style={{ background: sel ? preset.tint : undefined }}>
                  <span className="size-3 rounded-full" style={{ background: preset.main }} />
                  <span style={{ color: sel ? preset.main : "#6b7280" }}>{preset.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        {el ? (
          <div className="overflow-auto rounded-xl border border-ink/10 bg-[#f0f0f3] p-5">
            <div className="relative bg-white shadow-sm" style={{ width: el.frame.w * scale + 24, minHeight: el.frame.h * scale + 24 }}>
              <ElementView element={{ ...el, frame: { ...el.frame, x: 12 / scale, y: 12 / scale } } as any} scale={scale} selectedIds={[]} fields={fields} sampleMode sampleValues={{}} onPointerDown={() => undefined} onResizeStart={() => undefined} />
            </div>
          </div>
        ) : <p className="m-0 text-sm text-soft-ink">No preview available.</p>}
        <p className="m-0 mt-4 text-[12px] text-soft-ink">{block.description}</p>
      </div>
    </div>
  );
}

/* ─── PagePreviewModal ───────────────────────────────────────────── */
function PagePreviewModal({ template, layoutIndex, viewIndex, onClose }: {
  template: Template; layoutIndex: number; viewIndex: number; onClose: () => void;
}) {
  const [html, setHtml] = useState("");
  const layout = template.layouts[layoutIndex] || template.layouts[0];
  const view = layout?.views[viewIndex] || layout?.views[0];
  const compiled = useMemo(() => compileForSave(template, ""), [template]);
  const sampleData = useMemo(() => buildSampleData(template, 2), [template]);
  useMemo(() => {
    if (!compiled || !view) return;
    setHtml("");
    fetch("/api/templates/render-preview", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template: compiled, sampleData, format: "html", layoutId: layout.id, viewId: view.id }),
    }).then((r) => r.json()).then((payload) => {
      setHtml(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#e5e5ea;}body{padding:10mm;}</style></head><body>${payload.html || ""}</body></html>`);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout?.id, view?.id]);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60" onClick={onClose}>
      <div className="flex items-center justify-between bg-white/95 px-6 py-3 shadow" onClick={(e) => e.stopPropagation()}>
        <span className="font-bold text-ink">{view?.name || "Preview"} — {layout?.name || "A4"}</span>
        <button type="button" onClick={onClose} className={`${ghostBtn} px-3`}>✕ Close</button>
      </div>
      <div className="flex-1 overflow-auto" onClick={(e) => e.stopPropagation()}>
        {html ? <iframe title="Preview" sandbox="" srcDoc={html} className="h-full w-full border-0" /> : <div className="flex h-full items-center justify-center text-white/70">Loading preview…</div>}
      </div>
    </div>
  );
}

/* ─── WizardHeader ───────────────────────────────────────────────── */
function WizardHeader({ step, onBack }: { step: number; onBack: () => void }) {
  const titles: Record<number, [string, string]> = {
    1: ["Create a template",    "Choose the type of output this template will produce."],
    2: ["What can it contain?", "Select the components you want to include."],
    3: ["How should it look?",  "Pick a format design and color for each component."],
    4: ["Preview your template","Review each component, then preview the full document."],
  };
  const [title, subtitle] = titles[step] || titles[1];
  return (
    <div className={`${card} p-5`}>
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} className={`${ghostBtn} px-3 text-sm`}>‹ Back</button>
        <div className="ml-auto flex gap-1.5">
          {[1, 2, 3, 4].map((n) => <span key={n} className={`h-1.5 w-6 rounded-full transition ${n === step ? "bg-[var(--accent)]" : n < step ? "bg-[var(--accent)]/40" : "bg-ink/15"}`} />)}
        </div>
        <span className="text-[11px] font-semibold text-soft-ink">Step {step} of 4</span>
      </div>
      <h2 className="m-0 mt-4 text-2xl font-bold tracking-tight text-ink">{title}</h2>
      <p className="m-0 mt-0.5 text-sm text-soft-ink">{subtitle}</p>
    </div>
  );
}

/* ─── FormatCard (step 3 per-component card) ─────────────────────── */
function FormatCard({ origId, block: origBlock, allBlocks, blockFormats, blockAccents, blockToggles, openBlocks, onSelectFormat, onSelectColor, onToggleOption, onToggleOpen, onVisualize }: {
  origId: string; block: BlockDef; allBlocks: BlockDef[];
  blockFormats: Map<string, string>; blockAccents: Map<string, string>; blockToggles: Map<string, Record<string, boolean>>;
  openBlocks: Set<string>; onSelectFormat: (origId: string, blockId: string) => void;
  onSelectColor: (origId: string, accentId: string) => void; onToggleOption: (origId: string, key: string, val: boolean) => void;
  onToggleOpen: (origId: string) => void; onVisualize: (origId: string, block: BlockDef) => void;
}) {
  const currentBlockId = blockFormats.get(origId) || origId;
  const currentBlock = allBlocks.find((b) => b.id === currentBlockId) || origBlock;
  const selectedAccentId = blockAccents.get(origId);
  const isFormatted = !!selectedAccentId;
  const isOpen = openBlocks.has(origId) || !isFormatted;
  const selectedAccent = ACCENT_PRESETS.find((a) => a.id === selectedAccentId) || null;
  const previewAccent = selectedAccent || ACCENT_PRESETS[0];
  const defToggles = defaultToggles(currentBlock);
  const toggles = { ...defToggles, ...(blockToggles.get(origId) || {}) };
  // Show format design gallery for all blocks; use DESIGN_VARIANTS map when available,
  // otherwise fall back to all blocks in the same family (for future-proofing).
  const designIds = DESIGN_VARIANTS[origId];
  const variants: BlockDef[] = designIds
    ? designIds.map((id) => allBlocks.find((b) => b.id === id)).filter(Boolean) as BlockDef[]
    : allBlocks.filter((b) => b.family === origBlock.family && b.category === origBlock.category);

  return (
    <div className={`${card} mt-3 overflow-hidden transition-all`} style={{ border: isFormatted ? "2px solid #16a34a" : undefined }}>
      <button type="button" onClick={() => onToggleOpen(origId)} className="flex w-full items-center gap-3 px-5 py-4 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-soft-ink">{currentBlock.family}</span>
          <span className="block text-[15px] font-bold text-ink">{currentBlock.variant || currentBlock.name}</span>
        </span>
        {isFormatted && selectedAccent
          ? <span className="flex shrink-0 items-center gap-1.5 rounded-full border-2 border-green-600 bg-green-50 px-3 py-1 text-[12px] font-semibold text-green-700"><span className="size-3 rounded-full" style={{ background: selectedAccent.main }} />{selectedAccent.label} ✓</span>
          : <span className="shrink-0 rounded-full border border-ink/15 px-3 py-1 text-[11px] text-soft-ink">Pick a style</span>}
        <span className="text-[10px] text-soft-ink">{isOpen ? "▲" : "▼"}</span>
      </button>
      {isOpen ? (
        <div className="border-t border-ink/10 px-5 pb-5 pt-4">
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <p className={`${kicker}`}>Format design</p>
              {variants.length === 1 && (
                <span className="rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-[10px] text-soft-ink">More designs coming soon</span>
              )}
            </div>
            <div className="flex gap-2.5 overflow-x-auto pb-1">
              {variants.map((v) => {
                const sel = v.id === currentBlockId;
                return (
                  <button key={v.id} type="button" onClick={() => onSelectFormat(origId, v.id)}
                    className={`flex shrink-0 flex-col items-center gap-1.5 rounded-xl border-2 p-2 transition ${sel ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-transparent bg-[var(--surface-soft)] hover:border-ink/20"}`}>
                    <BlockThumbnail block={v} accent={previewAccent} toggles={toggles} scale={0.25} maxW={100} />
                    <span className="text-[10px] font-semibold" style={{ color: sel ? "var(--accent-ink)" : "#6b7280" }}>{v.variant || v.name}</span>
                    {sel && <span className="text-[9px] font-bold text-[var(--accent)]">✓ Selected</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <p className={`${kicker} mb-2`}>Color style</p>
          <div className="flex flex-wrap gap-2">
            {ACCENT_PRESETS.map((preset) => {
              const sel = selectedAccentId === preset.id;
              return (
                <button key={preset.id} type="button" onClick={() => onSelectColor(origId, preset.id)}
                  className={`flex items-center gap-2 rounded-full border-2 px-4 py-2 text-[12px] font-semibold transition ${sel ? "border-green-600 shadow-sm" : "border-ink/15 hover:border-ink/30"}`}
                  style={{ background: sel ? preset.tint : "white" }}>
                  <span className="size-3 rounded-full" style={{ background: preset.main }} />
                  {preset.label}
                  {sel && <span className="text-green-600">✓</span>}
                </button>
              );
            })}
          </div>
          {(currentBlock.options || []).filter((o) => o.key !== "answer").length > 0 && (
            <div className="mt-4">
              <p className={`${kicker} mb-2`}>Options</p>
              <div className="grid gap-1.5">
                {(currentBlock.options || []).filter((o) => o.key !== "answer").map((opt) => {
                  const val = blockToggles.get(origId)?.[opt.key] ?? defaultToggles(currentBlock)[opt.key];
                  return (
                    <label key={opt.key} className="flex cursor-pointer items-center gap-2 text-[13px] text-ink">
                      <input type="checkbox" checked={val} onChange={(e) => onToggleOption(origId, opt.key, e.target.checked)} className="accent-[var(--accent)]" />
                      {opt.label}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <button type="button" onClick={() => onVisualize(origId, currentBlock)} className="rounded-full border border-ink/15 px-4 py-1.5 text-[12px] font-semibold text-soft-ink hover:border-[var(--accent)]/50">Visualize full size ↗</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ─── Main Wizard ────────────────────────────────────────────────── */
export interface TemplateWizardProps {
  onSave: (template: Template, savedId?: string) => Promise<void>;
  onCancel: () => void;
  editTemplate?: { template: Template; savedId: string };
}

export function TemplateWizard({ onSave, onCancel, editTemplate }: TemplateWizardProps) {
  const [step, setStep] = useState<Step>(editTemplate ? 4 : 1);
  const [name, setName] = useState(editTemplate?.template.name || "");
  const [structureType, setStructureType] = useState<StructureType>("quiz");
  const [selectedInteractiveIds, setSelectedInteractiveIds] = useState<Set<string>>(
    () => new Set(["block-exam-question", "block-open-question", "block-true-false"])
  );
  const [selectedGameOptionId, setSelectedGameOptionId] = useState<string>("flashcard");
  const [blockFormats, setBlockFormats] = useState<Map<string, string>>(new Map());
  const [blockAccents, setBlockAccents] = useState<Map<string, string>>(new Map());
  const [blockToggles, setBlockToggles] = useState<Map<string, Record<string, boolean>>>(new Map());
  const [openBlocks, setOpenBlocks] = useState<Set<string>>(new Set());
  const [visualizeTarget, setVisualizeTarget] = useState<{ origId: string | null; block: BlockDef } | null>(null);
  const [pagePreview, setPagePreview] = useState<{ template: Template; layoutIndex: number; viewIndex: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const allBlocks = useMemo(() => builtInBlocks(), []);

  const resolvedSelections = useMemo(() => {
    const out: { origId: string; block: BlockDef; accent: AccentPreset; toggles: Record<string, boolean>; isFixed: boolean }[] = [];
    function addBlock(origId: string, isFixed: boolean) {
      const currentId = blockFormats.get(origId) || origId;
      const block = findBlock(currentId) || findBlock(origId);
      if (!block) return;
      const accent = isFixed ? ACCENT_PRESETS[0] : accentOf(origId, blockAccents);
      const toggles = { ...defaultToggles(block), ...(blockToggles.get(origId) || {}) };
      out.push({ origId, block, accent, toggles, isFixed });
    }
    if (structureType === "quiz") {
      for (const id of QUIZ_FIXED_IDS) addBlock(id, true);
      for (const q of [...QUIZ_QUESTIONS, ...QUIZ_WORKSHEETS]) if (selectedInteractiveIds.has(q.id)) addBlock(q.id, false);
    } else if (structureType === "document") {
      for (const id of DOCUMENT_BLOCK_IDS) addBlock(id, false);
    } else {
      for (const id of GAME_FIXED_IDS) addBlock(id, true);
      const gameOpt = GAME_OPTIONS.find((g) => g.id === selectedGameOptionId);
      if (gameOpt?.primaryBlockId) addBlock(gameOpt.primaryBlockId, false);
    }
    return out;
  }, [structureType, selectedInteractiveIds, selectedGameOptionId, blockFormats, blockAccents, blockToggles]);

  const stylableBlocks = useMemo(() => resolvedSelections.filter((s) => !s.isFixed), [resolvedSelections]);
  // For the "all formatted" check, only require non-fixed styleable blocks to have a color.
  // Fixed blocks (header/footer) are pre-styled by the block builder; picking a color is optional.
  const requiredBlocks = useMemo(() => structureType === "document" ? [] : stylableBlocks, [structureType, stylableBlocks]);
  const allFormatted = useMemo(() => requiredBlocks.length === 0 || requiredBlocks.every((s) => blockAccents.has(s.origId)), [requiredBlocks, blockAccents]);
  const canvasW = structureType === "game" ? 148 : 210;
  const canvasH = structureType === "game" ? 105 : 297;

  const assembledTemplate = useMemo(() => {
    if (!resolvedSelections.length) return null;
    return assembleTemplate(name || "Untitled", canvasW, canvasH, resolvedSelections.map(({ block, accent, toggles }) => ({ block, accent, toggles })));
  }, [resolvedSelections, name, canvasW, canvasH]);

  const canProceedStep2 = structureType === "quiz" ? selectedInteractiveIds.size > 0 : structureType === "document" ? true : !!selectedGameOptionId;

  function selectFormat(origId: string, blockId: string) { setBlockFormats((c) => new Map(c).set(origId, blockId)); }
  function selectColor(origId: string, accentId: string) {
    setBlockAccents((c) => new Map(c).set(origId, accentId));
    setOpenBlocks((c) => { const n = new Set(c); n.delete(origId); return n; });
  }
  function applyColorToAll(accentId: string) {
    setBlockAccents((c) => { const n = new Map(c); for (const s of resolvedSelections) n.set(s.origId, accentId); return n; });
    setOpenBlocks(new Set());
  }
  function toggleOption(origId: string, key: string, val: boolean) {
    setBlockToggles((c) => { const prev = c.get(origId) || {}; return new Map(c).set(origId, { ...prev, [key]: val }); });
  }
  function toggleOpen(origId: string) {
    setOpenBlocks((c) => { const n = new Set(c); n.has(origId) ? n.delete(origId) : n.add(origId); return n; });
  }
  function handleVisualizeConfirm(blockId: string, accentId: string) {
    if (!visualizeTarget?.origId) return;
    const origId = visualizeTarget.origId;
    setBlockFormats((c) => new Map(c).set(origId, blockId));
    setBlockAccents((c) => new Map(c).set(origId, accentId));
    setOpenBlocks((c) => { const n = new Set(c); n.delete(origId); return n; });
  }
  async function handleSave() {
    if (!assembledTemplate) return;
    setSaving(true);
    try { await onSave(assembledTemplate, editTemplate?.savedId); } finally { setSaving(false); }
  }

  /* ─── Step 1 ─────────────────────────────────────────────────────── */
  if (step === 1) {
    return (
      <div className={`${card} tw-scope mx-auto max-w-2xl p-8`}>
        <button type="button" onClick={onCancel} className={`${ghostBtn} mb-6 px-3 text-sm`}>‹ Back to templates</button>
        <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--accent-ink)]">New template</span>
        <h2 className="m-0 mt-4 text-3xl font-bold tracking-tight text-ink">Create a template</h2>
        <p className="m-0 mt-1 text-sm text-soft-ink">Templates tell the AI how to format and present its output.</p>
        <label className="mt-6 block">
          <span className="mb-1.5 block text-sm font-semibold text-ink">Template name</span>
          <input className={`${fieldBase} w-full text-base`} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Year 7 Maths Exam, Vocabulary Flashcards…" autoFocus />
        </label>
        <div className="mt-6">
          <span className="mb-2 block text-sm font-semibold text-ink">Output type</span>
          <div className="grid gap-3">
            {STRUCTURE_TYPES.map((t) => (
              <button key={t.id} type="button" onClick={() => setStructureType(t.id)}
                className={`flex items-center gap-4 rounded-2xl border-2 p-5 text-left transition ${structureType === t.id ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-md" : "border-ink/10 bg-white hover:border-[var(--accent)]/40"}`}>
                <span className="text-3xl">{t.emoji}</span>
                <div className="flex-1">
                  <span className="block text-[14px] font-bold text-ink">{t.label}</span>
                  <span className="mt-0.5 block text-[12px] text-soft-ink">{t.desc}</span>
                </div>
                <span className={`grid size-5 shrink-0 place-items-center rounded-full border-2 transition ${structureType === t.id ? "border-[var(--accent)] bg-[var(--accent)]" : "border-ink/25 bg-white"}`}>
                  {structureType === t.id ? <span className="text-[10px] font-bold text-white">✓</span> : null}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <button type="button" disabled={!name.trim()} onClick={() => setStep(2)} className={`${primaryBtn} px-8 py-2.5 disabled:opacity-40`}>Next ›</button>
        </div>
      </div>
    );
  }

  /* ─── Step 2 ─────────────────────────────────────────────────────── */
  if (step === 2) {
    return (
      <div className="tw-scope mx-auto max-w-2xl">
        <WizardHeader step={2} onBack={() => setStep(1)} />

        {/* Quiz */}
        {structureType === "quiz" && (
          <>
            <div className={`${card} mt-3 p-5`}>
              <div className="mb-4 flex items-center gap-2 rounded-xl bg-green-50 px-4 py-2.5">
                <span className="text-sm">📝</span>
                <span className="text-[12px] font-semibold text-green-800">Always included: Exam header (title, name, date) · Page footer</span>
              </div>
              <p className={`${kicker} mb-3`}>Questions</p>
              <div className="grid gap-1.5">
                {QUIZ_QUESTIONS.map((q) => {
                  const active = selectedInteractiveIds.has(q.id);
                  return (
                    <button key={q.id} type="button" onClick={() => setSelectedInteractiveIds((c) => { const n = new Set(c); n.has(q.id) ? n.delete(q.id) : n.add(q.id); return n; })}
                      className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${active ? "border-[var(--accent)]/40 bg-[var(--accent-soft)]" : "border-ink/10 bg-white hover:border-ink/25"}`}>
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl text-sm font-bold" style={{ background: active ? "#dbeafe" : "var(--surface-soft)", color: active ? "#1d4ed8" : "#6b7280" }}>{q.icon}</span>
                      <span className="flex-1"><span className="block text-[13px] font-semibold text-ink">{q.label}</span><span className="block text-[11px] text-soft-ink">{q.desc}</span></span>
                      <span className={`grid size-5 shrink-0 place-items-center rounded-full border-2 transition ${active ? "border-[var(--accent)] bg-[var(--accent)]" : "border-ink/25 bg-white"}`}>{active && <span className="text-[10px] font-bold text-white">✓</span>}</span>
                    </button>
                  );
                })}
              </div>
              <p className={`${kicker} mb-3 mt-5`}>Worksheets</p>
              <div className="grid gap-1.5">
                {QUIZ_WORKSHEETS.map((q) => {
                  const active = selectedInteractiveIds.has(q.id);
                  return (
                    <button key={q.id} type="button" onClick={() => setSelectedInteractiveIds((c) => { const n = new Set(c); n.has(q.id) ? n.delete(q.id) : n.add(q.id); return n; })}
                      className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${active ? "border-orange-400/50 bg-orange-50" : "border-ink/10 bg-white hover:border-ink/25"}`}>
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl text-sm font-bold" style={{ background: active ? "#fff7ed" : "var(--surface-soft)", color: active ? "#9a3412" : "#6b7280" }}>{q.icon}</span>
                      <span className="flex-1"><span className="block text-[13px] font-semibold text-ink">{q.label}</span><span className="block text-[11px] text-soft-ink">{q.desc}</span></span>
                      <span className={`grid size-5 shrink-0 place-items-center rounded-full border-2 transition ${active ? "border-orange-400 bg-orange-400" : "border-ink/25 bg-white"}`}>{active && <span className="text-[10px] font-bold text-white">✓</span>}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-4 flex items-center justify-end gap-3">
              {selectedInteractiveIds.size === 0 && <span className="text-[12px] text-soft-ink">Select at least one component</span>}
              <button type="button" disabled={!canProceedStep2} onClick={() => setStep(3)} className={`${primaryBtn} px-8 py-2.5 disabled:opacity-40`}>Next: Style ›</button>
            </div>
          </>
        )}

        {/* Document */}
        {structureType === "document" && (
          <>
            <div className={`${card} mt-3 p-5`}>
              <p className="m-0 mb-4 text-sm text-soft-ink">All these components are automatically included. Click Next to customize how each one looks.</p>
              <div className="grid gap-1.5">
                {DOCUMENT_BLOCK_IDS.map((id) => {
                  const block = findBlock(id);
                  if (!block) return null;
                  return (
                    <div key={id} className="flex items-center gap-3 rounded-xl border border-ink/8 bg-[var(--surface-soft)] px-4 py-2.5">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-green-50 text-sm font-bold text-green-700">{block.icon || "▔"}</span>
                      <span className="flex-1"><span className="block text-[13px] font-semibold text-ink">{block.variant || block.name}</span><span className="block text-[11px] text-soft-ink">{block.description}</span></span>
                      <span className="text-[11px] font-semibold text-green-600">Included ✓</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setStep(3)} className={`${primaryBtn} px-8 py-2.5`}>Next: Style ›</button>
            </div>
          </>
        )}

        {/* Game */}
        {structureType === "game" && (
          <>
            <div className={`${card} mt-3 p-5`}>
              <div className="mb-4 flex items-center gap-2 rounded-xl bg-green-50 px-4 py-2.5">
                <span className="text-sm">🃏</span>
                <span className="text-[12px] font-semibold text-green-800">Always included: Game header (topic, name, date)</span>
              </div>
              <p className={`${kicker} mb-3`}>Choose one game format</p>
              <div className="grid gap-3">
                {GAME_OPTIONS.map((opt) => {
                  const sel = selectedGameOptionId === opt.id;
                  return (
                    <button key={opt.id} type="button" disabled={opt.disabled} onClick={() => !opt.disabled && setSelectedGameOptionId(opt.id)}
                      className={`flex items-center gap-4 rounded-2xl border-2 p-5 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${sel ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-md" : "border-ink/10 bg-white hover:border-[var(--accent)]/40"}`}>
                      <span className="text-3xl">{opt.emoji}</span>
                      <div className="flex-1"><span className="block text-[14px] font-bold text-ink">{opt.label}</span><span className="block text-[12px] text-soft-ink">{opt.desc}</span></div>
                      <span className={`grid size-5 shrink-0 place-items-center rounded-full border-2 transition ${sel ? "border-[var(--accent)] bg-[var(--accent)]" : "border-ink/25 bg-white"}`}>{sel && <span className="text-[10px] font-bold text-white">✓</span>}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" disabled={!canProceedStep2} onClick={() => setStep(3)} className={`${primaryBtn} px-8 py-2.5 disabled:opacity-40`}>Next: Style ›</button>
            </div>
          </>
        )}
      </div>
    );
  }

  /* ─── Step 3 ─────────────────────────────────────────────────────── */
  if (step === 3) {
    const remaining = requiredBlocks.filter((s) => !blockAccents.has(s.origId)).length;
    return (
      <>
      <div className="tw-scope mx-auto max-w-2xl">
        <WizardHeader step={3} onBack={() => setStep(2)} />
        <div className={`${card} mt-3 p-4`}>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[12px] font-semibold text-soft-ink">Apply one color to all:</span>
              <div className="flex flex-wrap gap-1.5">
                {ACCENT_PRESETS.map((preset) => (
                  <button key={preset.id} type="button" onClick={() => applyColorToAll(preset.id)}
                    className="flex items-center gap-1.5 rounded-full border border-ink/15 px-3 py-1 text-[11px] font-semibold text-soft-ink transition hover:border-[var(--accent)]/50 hover:bg-[var(--accent-soft)]">
                    <span className="size-2.5 rounded-full" style={{ background: preset.main }} />{preset.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="border-t border-ink/8 pt-3 flex flex-wrap items-center gap-3">
              <span className="text-[12px] font-semibold text-soft-ink">Force one format for all question types:</span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: "standard", label: "Standard", icon: "❶", desc: "Classic numbered question card" },
                  { id: "kids",     label: "Kids style", icon: "🎨", desc: "Larger options, playful layout" },
                  { id: "compact",  label: "Compact",    icon: "❶❶", desc: "Smaller, two columns — fits more per page" },
                ].map((style) => {
                  const MAP: Record<string, Record<string, string>> = {
                    standard: { "block-exam-question": "block-exam-question", "block-mc-kids": "block-exam-question", "block-open-question": "block-open-question", "block-true-false": "block-true-false" },
                    kids:     { "block-exam-question": "block-mc-kids", "block-mc-kids": "block-mc-kids", "block-open-question": "block-open-question", "block-true-false": "block-true-false" },
                    compact:  { "block-exam-question": "block-question-compact", "block-mc-kids": "block-question-compact", "block-open-question": "block-open-question", "block-true-false": "block-true-false" },
                  };
                  return (
                    <button key={style.id} type="button" title={style.desc}
                      onClick={() => {
                        const mapping = MAP[style.id] || {};
                        setBlockFormats((c) => {
                          const n = new Map(c);
                          for (const [from, to] of Object.entries(mapping)) {
                            const entry = resolvedSelections.find((s) => s.origId === from || s.block.id === from);
                            if (entry) n.set(entry.origId, to);
                          }
                          return n;
                        });
                      }}
                      className="flex items-center gap-1.5 rounded-full border border-ink/15 px-3 py-1 text-[11px] font-semibold text-soft-ink transition hover:border-purple-300 hover:bg-purple-50">
                      <span>{style.icon}</span>{style.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        {/* Fixed structure blocks (header, footer) — always in the template, but still styleable */}
        {resolvedSelections.filter((s) => s.isFixed).length > 0 && (
          <div className="mt-4">
            <p className={`${kicker} mb-2 px-1`}>Structure (always included)</p>
            {resolvedSelections.filter((s) => s.isFixed).map(({ origId, block }) => (
              <FormatCard key={origId} origId={origId} block={block} allBlocks={allBlocks}
                blockFormats={blockFormats} blockAccents={blockAccents} blockToggles={blockToggles} openBlocks={openBlocks}
                onSelectFormat={selectFormat} onSelectColor={selectColor} onToggleOption={toggleOption} onToggleOpen={toggleOpen}
                onVisualize={(id, b) => setVisualizeTarget({ origId: id, block: b })} />
            ))}
          </div>
        )}
        {/* Interactive / content blocks */}
        {stylableBlocks.length > 0 && (
          <div className="mt-4">
            {resolvedSelections.filter((s) => s.isFixed).length > 0 && (
              <p className={`${kicker} mb-2 px-1`}>Content</p>
            )}
            {stylableBlocks.map(({ origId, block }) => (
              <FormatCard key={origId} origId={origId} block={block} allBlocks={allBlocks}
                blockFormats={blockFormats} blockAccents={blockAccents} blockToggles={blockToggles} openBlocks={openBlocks}
                onSelectFormat={selectFormat} onSelectColor={selectColor} onToggleOption={toggleOption} onToggleOpen={toggleOpen}
                onVisualize={(id, b) => setVisualizeTarget({ origId: id, block: b })} />
            ))}
          </div>
        )}
        {stylableBlocks.length === 0 && resolvedSelections.filter((s) => s.isFixed).length === 0 && (
          <div className={`${card} mt-3 p-5`}><p className="m-0 text-sm text-soft-ink">No components — go back to add some.</p></div>
        )}
        <div className="mt-4 flex items-center justify-end gap-3">
          {!allFormatted && remaining > 0 && <span className="text-[12px] text-soft-ink">{remaining} component{remaining !== 1 ? "s" : ""} still need a style</span>}
          <button type="button" disabled={!allFormatted} onClick={() => setStep(4)} className={`${primaryBtn} px-8 py-2.5 disabled:opacity-40`}>Next: Preview ›</button>
        </div>
      </div>
      {visualizeTarget && (() => {
        const origId = visualizeTarget.origId;
        const currentId = origId ? (blockFormats.get(origId) || origId) : visualizeTarget.block.id;
        const block = allBlocks.find((b) => b.id === currentId) || visualizeTarget.block;
        const accentId = origId ? (blockAccents.get(origId) || "blue") : "blue";
        const defs = defaultToggles(block);
        const tgls = origId ? { ...defs, ...(blockToggles.get(origId) || {}) } : defs;
        return <VisualizeModal block={block} accentId={accentId} toggles={tgls} allBlocks={allBlocks} onClose={() => setVisualizeTarget(null)} onConfirm={origId ? handleVisualizeConfirm : undefined} />;
      })()}
      </>
    );
  }

  /* ─── Step 4 ─────────────────────────────────────────────────────── */
  const views = assembledTemplate?.layouts[0]?.views || [];
  const hasInteractive = resolvedSelections.some((s) => s.block.category !== "structure");
  const previewFormats = structureType === "game"
    ? [{ label: "Cards", i: 0 }]
    : [{ label: "A4", i: 0 }, { label: "Letter", i: 1 }, { label: "Slides 16:9", i: 2 }];

  return (
    <div className="tw-scope mx-auto max-w-4xl">
      <WizardHeader step={4} onBack={() => setStep(3)} />

      <div className={`${card} mt-3 p-5`}>
        <div className="mb-4 flex items-center justify-between">
          <p className={`${kicker}`}>Components — {resolvedSelections.length} total</p>
          <button type="button" onClick={() => setStep(3)} className={`${ghostBtn} px-4 py-1.5 text-[12px]`}>✏ Edit components</button>
        </div>
        <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          {resolvedSelections.map(({ origId, block, accent, toggles, isFixed }) => (
            <div key={origId} className="flex flex-col items-center gap-2">
              <div className="relative">
                <BlockThumbnail block={block} accent={accent} toggles={toggles} scale={0.55} maxW={340} />
                {isFixed && <span className="absolute -right-1 -top-1 rounded-full bg-green-600 px-1.5 py-0.5 text-[9px] font-bold text-white">Fixed</span>}
              </div>
              <span className="max-w-full truncate text-center text-[12px] font-semibold text-ink">{block.variant || block.name}</span>
              <span className="text-[10px] text-soft-ink">{block.family}</span>
            </div>
          ))}
        </div>
      </div>

      {assembledTemplate && (
        <div className={`${card} mt-3 p-5`}>
          <p className={`${kicker} mb-1`}>Full document preview</p>
          <p className="m-0 mb-4 text-[12px] text-soft-ink">Click any cell to open a full-page preview with sample content.</p>
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-1.5 text-sm">
              <thead>
                <tr>
                  <th className="w-36 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-soft-ink" />
                  {previewFormats.map((fmt) => <th key={fmt.label} className="py-2 text-center text-[11px] font-semibold uppercase tracking-[0.1em] text-soft-ink">{fmt.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {views.map((view, viewIdx) => {
                  if (!hasInteractive && viewIdx > 0) return null;
                  return (
                    <tr key={view.id}>
                      <td className="py-1.5 pr-3 text-[13px] font-semibold text-ink">{view.name}</td>
                      {previewFormats.map((fmt) => (
                        <td key={fmt.label} className="text-center">
                          <button type="button" onClick={(e) => { e.stopPropagation(); setPagePreview({ template: assembledTemplate, layoutIndex: fmt.i, viewIndex: viewIdx }); }}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-ink/15 bg-white px-4 py-2 text-[12px] font-semibold text-ink transition hover:border-[var(--accent)]/60 hover:bg-[var(--accent-soft)] hover:shadow-md">
                            📄 Preview
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

      <div className={`${card} mt-3 p-5`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="m-0 text-base font-bold text-ink">{name || "Untitled template"}</p>
            <p className="m-0 text-[12px] text-soft-ink">
              {STRUCTURE_TYPES.find((t) => t.id === structureType)?.label} · {resolvedSelections.length} component{resolvedSelections.length !== 1 ? "s" : ""} · {views.length} view{views.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button type="button" disabled={saving || !resolvedSelections.length} onClick={handleSave} className={`${primaryBtn} shrink-0 px-8 py-2.5 text-base disabled:opacity-50`}>
            {saving ? "Saving…" : editTemplate ? "Save changes" : "Save template"}
          </button>
        </div>
      </div>

      {visualizeTarget && (() => {
        const origId = visualizeTarget.origId;
        // Always show the CURRENT block (reflects format changes made in the FormatCard while modal is open)
        const currentId = origId ? (blockFormats.get(origId) || origId) : visualizeTarget.block.id;
        const block = allBlocks.find((b) => b.id === currentId) || visualizeTarget.block;
        const accentId = origId ? (blockAccents.get(origId) || "blue") : "blue";
        const defs = defaultToggles(block);
        const toggles = origId ? { ...defs, ...(blockToggles.get(origId) || {}) } : defs;
        return <VisualizeModal block={block} accentId={accentId} toggles={toggles} allBlocks={allBlocks} onClose={() => setVisualizeTarget(null)} onConfirm={origId ? handleVisualizeConfirm : undefined} />;
      })()}
      {pagePreview && <PagePreviewModal template={pagePreview.template} layoutIndex={pagePreview.layoutIndex} viewIndex={pagePreview.viewIndex} onClose={() => setPagePreview(null)} />}
    </div>
  );
}
