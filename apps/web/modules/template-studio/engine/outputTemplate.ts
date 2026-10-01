/**
 * Assembling a document out of chosen components (shared by the Template Wizard and the agent
 * "Configure output" step): component alternatives, default options, and the multi-page-size,
 * multi-view template builder. Pure functions — no React.
 */
import { ACCENT_PRESETS, builtInBlocks, instantiateBlock, type AccentPreset, type BlockDef } from "./blocks";
import { createId, createTemplate, createView } from "./model";
import type { Element, GroupElement, Template } from "./types";

/* ─── Helpers ────────────────────────────────────────────────────── */
export function findBlock(id: string): BlockDef | undefined {
  return builtInBlocks().find((b) => b.id === id);
}

/** Never auto-enable "answer" — it is controlled by view (student view hides it, answer key shows it).
 * All other options default to ON so teachers see the richest preview first. */
export function defaultToggles(block: BlockDef): Record<string, boolean> {
  return Object.fromEntries((block.options || []).map((o) => [o.key, o.key === "answer" ? false : true]));
}

/**
 * Maps each block ID to the list of block IDs that are genuine visual-design alternatives
 * (same concept / same AI fields, different visual style).
 * Siblings share the same entry — both point to the same array.
 */
export const DESIGN_VARIANTS: Record<string, string[]> = {
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

export function accentOf(id: string, map: Map<string, string>): AccentPreset {
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
export function assembleTemplate(
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
    if (i === 0) {
      const scaledElements = allElements.map((el) => scaleGroupChildren(el, fmtContentW));
      const page = { ...template.layouts[0].pages[0], elements: scaledElements };
      const base = { ...baseLayout, pages: [page], canvas: { ...baseLayout.canvas, width: fmt.w, height: fmt.h } };
      return fmt.isSlides ? { ...base, class: "slides" as const } : base;
    }
    // Non-A4 layouts get fresh view IDs. Remap visibility.views so answer-toggle elements
    // remain visible — resolveView matches by view id, so stale original ids would filter them out.
    const newViews = views.map((v) => ({ ...v, id: createId("view") }));
    const viewIdMap = new Map(views.map((v, idx) => [v.id, newViews[idx].id]));
    const remapVis = (el: Element): Element => {
      if (!el.visibility?.views) return el;
      return { ...el, visibility: { ...el.visibility, views: el.visibility.views.map((vid) => viewIdMap.get(vid) ?? vid) } };
    };
    const scaledElements = allElements.map((el) => scaleGroupChildren(remapVis(el), fmtContentW));
    const page = { ...template.layouts[0].pages[0], elements: scaledElements };
    const base = { ...baseLayout, pages: [page], id: createId("layout"), name: fmt.label, canvas: { ...baseLayout.canvas, width: fmt.w, height: fmt.h }, views: newViews };
    return fmt.isSlides ? { ...base, class: "slides" as const } : base;
  });
  return { ...template, fields: currentFields, layouts };
}

