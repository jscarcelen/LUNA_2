/**
 * Assembling a document out of chosen components (shared by the Template Wizard and the agent
 * "Configure output" step): component alternatives, default options, and the multi-page-size,
 * multi-view template builder. Pure functions — no React.
 */
import { ACCENT_PRESETS, FLASH_BOTH, FLASH_SIDES, builtInBlocks, instantiateBlock, type AccentPreset, type BlockDef } from "./blocks";
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
 * The formats of a component: the designs of its family that carry the same fields, so swapping
 * one for another never changes what the AI has to produce. Most families have a single design.
 */
export function variantsOf(block: BlockDef, all: BlockDef[] = builtInBlocks()): BlockDef[] {
  const same = all.filter((candidate) => candidate.family === block.family && candidate.category === block.category);
  return same.some((candidate) => candidate.id === block.id) ? same : [block];
}

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

/**
 * Slides are 254 mm wide, so a card drawn for an A4 column is both small and sparse there. On slides
 * everything is scaled up together — positions, heights, type, rules and corners — so the card keeps
 * its proportions and reads from a distance.
 */
function scaleUniform(el: Element, ratio: number): Element {
  const style = el.style as Record<string, unknown>;
  const scaled = {
    ...el,
    frame: { x: +(el.frame.x * ratio).toFixed(2), y: +(el.frame.y * ratio).toFixed(2), w: +(el.frame.w * ratio).toFixed(2), h: +(el.frame.h * ratio).toFixed(2) },
    style: {
      ...el.style,
      ...(typeof style.fontSize === "number" ? { fontSize: +(style.fontSize * ratio).toFixed(2) } : {}),
      ...(typeof style.strokeWidth === "number" ? { strokeWidth: +(style.strokeWidth * ratio).toFixed(2) } : {}),
      ...(typeof style.radius === "number" ? { radius: +(style.radius * ratio).toFixed(2) } : {})
    }
  } as Element;
  if (scaled.type === "group") {
    const group = scaled as GroupElement;
    return { ...group, layout: { ...group.layout, gap: +((group.layout.gap ?? 0) * ratio).toFixed(2) }, ...(group.designedBottom ? { designedBottom: group.designedBottom * ratio } : {}), children: group.children.map((child) => scaleUniform(child, ratio)) } as GroupElement;
  }
  return scaled;
}

/** A top-level block for a slide: width as given by `fit`, everything inside scaled up with it. */
function scaleForSlide(el: Element, toContentW: number): Element {
  if (el.type !== "group") return el;
  const group = el as GroupElement;
  if (group.pageScope?.mode === "every") return scaleGroupChildren(el, toContentW); // footers keep their size
  const ratio = toContentW / A4_CONTENT_W;
  return {
    ...group,
    frame: { ...group.frame, h: +(group.frame.h * ratio).toFixed(2) },
    layout: { ...group.layout, gap: +((group.layout.gap ?? 0) * ratio).toFixed(2) },
    ...(group.designedBottom ? { designedBottom: group.designedBottom * ratio } : {}),
    children: group.children.map((child) => scaleUniform(child, ratio))
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
  // Flashcards come in two views: both sides on one page, and one side per page.
  const hasFlashcards = selections.some((s) => s.block.id === "block-flashcard-single");
  const sidesView = hasFlashcards && !answerKey ? createView("One side per page") : null;
  const bothView = sidesView ? { ...studentView, name: "Both sides on one page" } : null;
  const views = answerKey ? [studentView, answerKey] : sidesView && bothView ? [bothView, sidesView] : [studentView];
  const viewIds: Record<string, string> = bothView && sidesView ? { [FLASH_BOTH]: bothView.id, [FLASH_SIDES]: sidesView.id } : {};
  /** Turns the flashcard placeholders into real view ids; a cover or title ("first page") belongs to the both-sides view only. */
  const resolveViews = (el: Element): Element => {
    if (!sidesView || !bothView) return el;
    const wanted = el.visibility?.views;
    if (wanted) return { ...el, visibility: { ...el.visibility, views: wanted.map((id) => viewIds[id] || id) } };
    if (el.type === "group" && (el as GroupElement).pageScope?.mode === "first") return { ...el, visibility: { ...el.visibility, views: [bothView.id] } };
    return el;
  };

  let currentFields = template.fields;

  /**
   * Places every selected block one under the other. Built twice when needed: slides leave out the
   * Name / Date lines (nobody writes their name on a slide), the paged sizes keep them.
   */
  const place = (override: Record<string, boolean>) => {
    let curY = margins.top;
    const placedElements: ReturnType<typeof instantiateBlock>["elements"] = [];
    for (const { block, accent, toggles: chosen } of selections) {
      const toggles = { ...chosen, ...override };
      const blockHasAnswer = (block.options || []).some((o) => o.key === "answer");
      const place1 = (result: ReturnType<typeof instantiateBlock>, visibleIn?: string) => {
        let yOff = curY;
        const placed = result.elements.map((el) => {
          // pageScope:"every" elements (header/footer) keep their original y position
          // and do NOT advance the flow cursor — the renderer repeats them on every page.
          const isEveryPage = el.type === "group" && (el as GroupElement).pageScope?.mode === "every";
          const visibility = visibleIn ? { visibility: { views: [visibleIn] } } : {};
          if (isEveryPage) return { ...el, frame: { ...el.frame, x: margins.left, w: contentW }, ...visibility };
          const y = yOff; yOff += el.frame.h + 2;
          return { ...el, frame: { ...el.frame, x: margins.left, y, w: contentW }, ...visibility };
        });
        return { placed, bottom: yOff, hasFlow: result.elements.some((el) => !(el.type === "group" && (el as GroupElement).pageScope?.mode === "every")) };
      };
      if (blockHasAnswer && answerKey) {
        // Student view: answer hidden, element visible only in student view
        const student = instantiateBlock(block, currentFields, { accent, toggles: { ...toggles, answer: false } });
        currentFields = student.fields;
        const studentPlaced = place1(student, studentView.id);
        placedElements.push(...studentPlaced.placed);
        // Answer key: answer shown, element visible only in answer key view
        const key = instantiateBlock(block, currentFields, { accent, toggles: { ...toggles, answer: true } });
        placedElements.push(...place1(key, answerKey.id).placed);
        curY = studentPlaced.bottom + 2;
      } else {
        const result = instantiateBlock(block, currentFields, { accent, toggles });
        currentFields = result.fields;
        const single = place1(result);
        placedElements.push(...single.placed);
        if (single.hasFlow) curY = single.bottom + 2;
      }
    }
    return { elements: placedElements.map(resolveViews), bottom: curY };
  };

  const paged = place({});
  const allElements = paged.elements;
  // A slide cover is a centred title: the logo mark and the Name / Date lines have no place on it.
  const hasCoverExtras = selections.some((s) => (s.block.options || []).some((o) => o.key === "namedate" || o.key === "logo"));
  const slideElements = hasCoverExtras ? place({ namedate: false, logo: false }).elements : allElements;

  // Real page sizes: content that does not fit continues on the next page (the footer stays at the
  // bottom of each one) instead of stretching a single page.
  const fmts: { label: string; w: number; h: number; isSlides?: boolean; class?: "paged" | "slides" }[] = canvasW < 200
    ? [{ label: "Cards", w: canvasW, h: canvasH }]
    : [
        { label: "A4",          w: 210, h: 297 },
        { label: "Letter",      w: 216, h: 279 },
        { label: "Slides 16:9", w: 254, h: 143, isSlides: true },
      ];
  const baseLayout = { ...template.layouts[0], views };
  const layouts = fmts.map((fmt, i) => {
    // Scale inner element coordinates to match this format's content width.
    // Outer group frames are already set to contentW in the placement loop above;
    // child elements need their x-positions and widths scaled proportionally.
    const fmtContentW = fmt.w - margins.left - margins.right;
    // Outer frames are placed at the first size's content width; every size gets its own, so the
    // cards (border, fill) are as wide as the contents scaled to them.
    // Page furniture is drawn for A4 (297 mm): a footer keeps its distance from the bottom edge of every page size.
    const fit = (el: Element): Element => {
      const isFooter = el.type === "group" && (el as GroupElement).pageScope?.mode === "every" && el.frame.y >= 150;
      return { ...el, frame: { ...el.frame, w: fmtContentW, ...(isFooter ? { y: fmt.h - (297 - el.frame.y) } : {}) } };
    };
    const source = fmt.isSlides ? slideElements : allElements;
    const scale = (el: Element) => (fmt.isSlides ? scaleForSlide(fit(el), fmtContentW) : scaleGroupChildren(fit(el), fmtContentW));
    if (i === 0) {
      const scaledElements = source.map(scale);
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
    const scaledElements = source.map((el) => (fmt.isSlides ? scaleForSlide(fit(remapVis(el)), fmtContentW) : scaleGroupChildren(fit(remapVis(el)), fmtContentW)));
    const page = { ...template.layouts[0].pages[0], elements: scaledElements };
    const base = { ...baseLayout, pages: [page], id: createId("layout"), name: fmt.label, canvas: { ...baseLayout.canvas, width: fmt.w, height: fmt.h }, views: newViews };
    return fmt.isSlides ? { ...base, class: "slides" as const } : base;
  });
  return { ...template, fields: currentFields, layouts };
}

