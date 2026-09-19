import type {
  DataObject, DataValue, Element, FieldDef, GroupElement, ID, LaidOutItem, LaidOutPage, LaidOutTextItem, Layout, LayoutResult, OverflowReport, Page, Style, Template,
  TextElement
} from "./types";
import { findField } from "./model";
import { resolveFieldValue, resolveSource, resolveView, richTextToLines, valueToText, type Scope } from "./resolve";

const MM_PER_PT = 0.352778;

/* ---------------------------------------------------------------- text metrics (shared estimate; PDF re-wraps with real glyphs) */

export function wrapText(text: string, widthMm: number, fontSizePt: number, bold = false): string[] {
  const avgCharMm = fontSizePt * MM_PER_PT * (bold ? 0.55 : 0.5);
  const maxChars = Math.max(4, Math.floor(widthMm / avgCharMm));
  const lines: string[] = [];
  for (const paragraph of String(text ?? "").split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length > maxChars && line) {
        lines.push(line);
        line = word;
      } else line = candidate;
    }
    if (line) lines.push(line);
  }
  return lines;
}

export function lineHeightMm(style: Style): number {
  return (style.fontSize || 11) * MM_PER_PT * (style.lineHeight || 1.35);
}

/* ---------------------------------------------------------------- element layout */

interface Ctx {
  fields: FieldDef[];
  overflows: OverflowReport[];
  itemCounts: Record<ID, number>;
  pageIndex: () => number;
}

interface Laid { items: LaidOutItem[]; bottom: number; right: number; height: number }

function textItem(element: TextElement, x: number, y: number, scopes: Scope[], ctx: Ctx): Laid {
  const { value, isField } = resolveSource(ctx.fields, element.source, scopes);
  const style = { fontFamily: "sans", fontSize: 11, fontWeight: "normal", color: "#1d1d1f", align: "left", lineHeight: 1.35, ...element.style } as LaidOutTextItem["style"];
  const hasValue = !isField || value !== undefined;
  const raw = isField && value === undefined ? (element.placeholder ? element.placeholder : `{${fieldName(ctx.fields, element)}}`) : valueToText(value);
  const paragraphs = element.format === "rich" ? richTextToLines(raw) : raw.split(/\r?\n/);
  const lines = paragraphs.flatMap((line) => wrapText(line, element.frame.w, style.fontSize, style.fontWeight === "bold"));
  const height = Math.max(element.frame.h, lines.length * lineHeightMm(style) + 1);
  const item: LaidOutTextItem = { type: "text", x, y, w: element.frame.w, h: height, style, lines, isField, fieldId: element.source.type === "field" ? element.source.fieldId : undefined, hasValue, elementId: element.id };
  return { items: [item], bottom: y + height, right: x + element.frame.w, height };
}

function fieldName(fields: FieldDef[], element: TextElement): string {
  return element.source.type === "field" ? findField(fields, element.source.fieldId)?.name || "field" : "";
}

function layoutElement(element: Element, originX: number, originY: number, scopes: Scope[], ctx: Ctx, limitBottom: number): Laid {
  const x = originX + element.frame.x;
  const y = originY + element.frame.y;
  const { w, h } = element.frame;
  switch (element.type) {
    case "text":
      return textItem(element, x, y, scopes, ctx);
    case "image": {
      const { value } = resolveSource(ctx.fields, element.source, scopes);
      return { items: [{ type: "image", x, y, w, h, style: element.style, src: typeof value === "string" ? value : "", elementId: element.id }], bottom: y + h, right: x + w, height: h };
    }
    case "rect":
    case "ellipse":
      return { items: [{ type: "rect", x, y, w, h, style: element.style, elementId: element.id, ellipse: element.type === "ellipse" }], bottom: y + h, right: x + w, height: h };
    case "line":
    case "arrow":
      return { items: [{ type: "line", x, y, w, h: Math.max(0.3, h), style: element.style, elementId: element.id, arrow: element.type === "arrow" }], bottom: y + h, right: x + w, height: h };
    case "table":
      return { items: [], bottom: y + h, right: x + w, height: h };
    case "group":
      return layoutGroup(element, x, y, scopes, ctx, limitBottom);
    default:
      return { items: [], bottom: y, right: x, height: 0 };
  }
}

/** Instances of a repeating group for the current scope. */
function repeatRecords(group: GroupElement, scopes: Scope[], ctx: Ctx): Scope[] {
  if (!group.repeat) return [scopes[0] || { data: null, index: 0 }];
  const value = resolveFieldValue(ctx.fields, group.repeat.fieldId, scopes);
  const list = Array.isArray(value) ? value : [];
  const records = list.length ? list : [null];
  ctx.itemCounts[group.id] = list.length;
  return records.map((data, index) => ({ data: data as DataValue, index }));
}

/** Normalises values for "show only when" comparisons: "Multiple choice" ≈ "multiple_choice". */
function normal(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

/** Conditional groups render only when their field equals the chosen value (booleans: "true"/"false"). */
export function isShown(element: Element, scopes: Scope[], ctx: Ctx): boolean {
  if (element.type !== "group" || !element.condition || !element.condition.fieldId) return true;
  const value = resolveFieldValue(ctx.fields, element.condition.fieldId, scopes);
  if (value === undefined) return true; // no data yet (design time) → show
  return normal(value) === normal(element.condition.equals);
}

/** Lays out the children of ONE instance at (x, y). Stacks by mode; nested repeats expand and push siblings. */
function layoutInstance(group: GroupElement, x: number, y: number, scopes: Scope[], ctx: Ctx, limitBottom: number): Laid {
  const items: LaidOutItem[] = [];
  const mode = group.layout.mode;
  const gap = group.layout.gap ?? 0;
  const children = mode === "free" ? group.children : [...group.children].sort((a, b) => (mode === "horizontal" ? a.frame.x - b.frame.x : a.frame.y - b.frame.y));
  let cursorX = 0;
  let cursorY = 0;
  let bottom = y;
  let right = x;
  let shift = 0; // free mode: how far content pushed things down

  const conditional = group.children.some((child) => child.type === "group" && child.condition?.fieldId);
  let designedBottom = 0;
  for (const child of children) {
    if (!isShown(child, scopes, ctx)) continue;
    designedBottom = Math.max(designedBottom, child.frame.y + child.frame.h);
    const nestedRepeat = child.type === "group" && child.repeat;
    if (mode === "free") {
      // Children keep their own positions; a taller-than-designed child pushes later (lower) siblings.
      const laid = nestedRepeat
        ? layoutRepeatedInline(child as GroupElement, x + child.frame.x, y + child.frame.y + shift, scopes, ctx)
        : layoutElement({ ...child, frame: { ...child.frame, y: child.frame.y + shift } } as Element, x, y, scopes, ctx, limitBottom);
      items.push(...laid.items);
      const designedBottom = y + child.frame.y + shift + child.frame.h;
      if (laid.bottom > designedBottom) shift += laid.bottom - designedBottom;
      bottom = Math.max(bottom, laid.bottom);
      right = Math.max(right, laid.right);
      continue;
    }
    if (mode === "grid") {
      const columns = Math.max(1, group.layout.columns || 2);
      const cellW = (group.frame.w - gap * (columns - 1)) / columns;
      const col = children.indexOf(child) % columns;
      const laid = nestedRepeat
        ? layoutRepeatedInline(child as GroupElement, x + col * (cellW + gap), y + cursorY, scopes, ctx)
        : layoutElement({ ...child, frame: { ...child.frame, x: 0, y: 0, w: Math.min(child.frame.w, cellW) } } as Element, x + col * (cellW + gap), y + cursorY, scopes, ctx, limitBottom);
      items.push(...laid.items);
      bottom = Math.max(bottom, laid.bottom);
      right = Math.max(right, laid.right);
      if (col === columns - 1) cursorY = bottom - y + gap;
      continue;
    }
    if (mode === "horizontal") {
      const laid = nestedRepeat
        ? layoutRepeatedInline(child as GroupElement, x + cursorX, y, scopes, ctx)
        : layoutElement({ ...child, frame: { ...child.frame, x: 0, y: 0 } } as Element, x + cursorX, y, scopes, ctx, limitBottom);
      items.push(...laid.items);
      cursorX += child.frame.w + gap;
      bottom = Math.max(bottom, laid.bottom);
      right = Math.max(right, laid.right);
      continue;
    }
    // vertical stack — keeps each child's x offset, ignores designed y
    const laid = nestedRepeat
      ? layoutRepeatedInline(child as GroupElement, x + child.frame.x, y + cursorY, scopes, ctx)
      : layoutElement({ ...child, frame: { ...child.frame, y: 0 } } as Element, x, y + cursorY, scopes, ctx, limitBottom);
    items.push(...laid.items);
    cursorY = laid.bottom - y + gap;
    bottom = Math.max(bottom, laid.bottom);
    right = Math.max(right, laid.right);
  }
  // With "one of" children the designed height is the tallest variant; fit the one actually shown.
  const pad = conditional ? Math.max(0, group.frame.h - Math.max(...group.children.map((child) => child.frame.y + child.frame.h), 0)) : 0;
  const height = conditional && mode === "free" ? Math.max(bottom - y + pad, 1) : Math.max(mode === "free" ? group.frame.h + shift : 0, bottom - y);
  void designedBottom;
  const chrome: LaidOutItem[] = group.style.fill || group.style.stroke ? [{ type: "rect", x, y, w: group.frame.w, h: height, style: group.style, elementId: group.id }] : [];
  return { items: [...chrome, ...items], bottom: y + height, right, height };
}

/** A repeating group nested inside another group: instances stack vertically (or in a grid) without pagination. */
function layoutRepeatedInline(group: GroupElement, x: number, y: number, scopes: Scope[], ctx: Ctx): Laid {
  const records = repeatRecords(group, scopes, ctx);
  const gap = group.layout.gap ?? 0;
  const items: LaidOutItem[] = [];
  let cursorY = y;
  let cursorX = x;
  let rowBottom = y;
  const columns = group.repeat?.mode === "grid" ? Math.max(1, group.repeat.columns || 2) : 1;
  const cellW = (group.frame.w - gap * (columns - 1)) / columns;
  records.forEach((record, index) => {
    const col = index % columns;
    if (columns > 1) {
      cursorX = x + col * (cellW + gap);
      if (col === 0 && index > 0) cursorY = rowBottom + gap;
    }
    const laid = layoutInstance({ ...group, frame: { ...group.frame, w: columns > 1 ? cellW : group.frame.w } }, cursorX, cursorY, [record, ...scopes], ctx, Infinity);
    items.push(...laid.items);
    rowBottom = Math.max(rowBottom, laid.bottom);
    if (columns === 1) cursorY = laid.bottom + gap;
  });
  const bottom = columns === 1 ? Math.max(y, cursorY - gap) : rowBottom;
  return { items, bottom, right: x + group.frame.w, height: bottom - y };
}

function layoutGroup(group: GroupElement, x: number, y: number, scopes: Scope[], ctx: Ctx, limitBottom: number): Laid {
  if (group.repeat) return layoutRepeatedInline(group, x, y, scopes, ctx);
  return layoutInstance(group, x, y, scopes, ctx, limitBottom);
}

/* ---------------------------------------------------------------- pages */

function backgroundOf(page: Page): LaidOutPage["background"] {
  const bg = page.background;
  if (bg.type === "image" || bg.type === "pdf") return bg.visible === false ? null : { src: bg.src, opacity: bg.opacity ?? 1 };
  if (bg.type === "color") return { color: bg.value };
  if (bg.type === "gradient") return { color: bg.from };
  return null;
}

function scopeMatches(element: Element, position: "first" | "middle" | "last" | "only", pageId: ID, isContinuation: boolean): boolean {
  const scope = element.pageScope;
  switch (scope.mode) {
    case "every": return true;
    case "first": return position === "first" || position === "only";
    case "last": return position === "last" || position === "only";
    case "selected": return scope.pageIds.includes(pageId);
    default: return !isContinuation;
  }
}

/**
 * Lays out one template page. Top-level flow groups paginate: an instance that would cross the
 * bottom margin opens a continuation page carrying the background and every element whose page
 * scope is "every" (or that sits above the group, for "page"-scoped headers).
 */
function layoutSourcePage(page: Page, layout: Layout, scopes: Scope[], ctx: Ctx, out: LaidOutPage[], itemIndex?: number): void {
  const { width, height } = layout.canvas;
  const limit = height - layout.margins.bottom;
  const makePage = (continuation: boolean): LaidOutPage => {
    const laid: LaidOutPage = { width, height, background: backgroundOf(page), items: [], sourcePageId: page.id, continuation, itemIndex };
    out.push(laid);
    return laid;
  };
  let current = makePage(false);
  const elements = [...page.elements].sort((a, b) => a.frame.y - b.frame.y);
  const isFlowGroup = (element: Element): element is GroupElement => element.type === "group" && Boolean(element.repeat) && element.repeat!.mode === "flow";
  // Anchored elements keep their designed position on every page they appear on: headers/footers,
  // first/last/selected-page elements and "fixed position" blocks. Everything else flows.
  const anchored = (element: Element) => element.pageScope.mode !== "page" || element.placement === "fixed";
  const staticElements = elements.filter((element) => anchored(element) && !isFlowGroup(element));
  const flowing = elements.filter((element) => !anchored(element) || isFlowGroup(element));
  const stamp = (target: LaidOutPage, continuation: boolean) => {
    for (const element of staticElements) {
      const header = continuation ? element.pageScope.mode === "every" : true;
      if (!header || !isShown(element, scopes, ctx)) continue;
      const laid = layoutElement(element, 0, 0, scopes, ctx, limit);
      target.items.push(...laid.items);
      if (laid.bottom > limit + 0.5) ctx.overflows.push({ elementId: element.id, pageIndex: out.indexOf(target), reason: "exceeds-page" });
    }
  };
  stamp(current, false);

  // Fixed blocks cap whatever flows above them on the first page (the flow continues on the next page).
  const fixedTops = elements.filter((element) => element.placement === "fixed" && !isFlowGroup(element)).map((element) => element.frame.y);
  const capFor = (element: Element, onFirstPage: boolean) => {
    if (!onFirstPage) return limit;
    const below = fixedTops.filter((top) => top >= element.frame.y + element.frame.h);
    return below.length ? Math.min(limit, Math.min(...below)) : limit;
  };

  // Sequential flow: each flowing element starts where the previous one ended, keeping the designed spacing.
  let cursor = layout.margins.top;
  let previousDesignedBottom = layout.margins.top;
  let onFirstPage = true;
  let firstFlowing = true;
  const newPage = (element: Element) => {
    current = makePage(true);
    stamp(current, true);
    onFirstPage = false;
    cursor = Math.max(layout.margins.top, element.type === "group" ? continuationTop(page, element as GroupElement, layout) : layout.margins.top);
  };
  for (const element of flowing) {
    if (!isShown(element, scopes, ctx)) continue;
    const designedGap = Math.max(0, element.frame.y - previousDesignedBottom);
    let y = firstFlowing ? element.frame.y : cursor + designedGap;
    firstFlowing = false;
    const group = element.type === "group" ? element : null;
    if (((group && group.pagination.breakBefore) || element.placement === "new_page") && current.items.length) {
      newPage(element);
      y = cursor;
    }
    if (isFlowGroup(element)) {
      const gap = element.layout.gap ?? 0;
      let pageLimit = capFor(element, onFirstPage) - (fixedTops.length ? gap : 0);
      let onPage = 0;
      let c = y;
      for (const record of repeatRecords(element, scopes, ctx)) {
        const recordScopes = [record, ...scopes];
        let laid = layoutInstance(element, element.frame.x, c, recordScopes, ctx, pageLimit);
        const tooMany = element.pagination.maxItemsPerPage ? onPage >= element.pagination.maxItemsPerPage : false;
        if ((laid.bottom > pageLimit && c > layout.margins.top && element.pagination.overflow === "continue") || tooMany) {
          newPage(element);
          c = cursor;
          onPage = 0;
          pageLimit = limit;
          laid = layoutInstance(element, element.frame.x, c, recordScopes, ctx, pageLimit);
        }
        if (laid.bottom > pageLimit + 0.5) ctx.overflows.push({ elementId: element.id, pageIndex: out.indexOf(current), reason: element.pagination.overflow === "clip" ? "clipped" : "exceeds-page" });
        current.items.push(...laid.items);
        c = laid.bottom + gap;
        onPage += 1;
      }
      cursor = Math.max(y, c - gap);
      if (element.pagination.breakAfter) newPage(element);
    } else {
      const pageLimit = capFor(element, onFirstPage);
      let laid = layoutElement({ ...element, frame: { ...element.frame, y } } as Element, 0, 0, scopes, ctx, pageLimit);
      if (laid.bottom > pageLimit + 0.5 && y > layout.margins.top + 0.5) {
        newPage(element);
        y = cursor;
        laid = layoutElement({ ...element, frame: { ...element.frame, y } } as Element, 0, 0, scopes, ctx, limit);
      }
      if (laid.bottom > limit + 0.5) ctx.overflows.push({ elementId: element.id, pageIndex: out.indexOf(current), reason: "exceeds-page" });
      current.items.push(...laid.items);
      cursor = laid.bottom;
    }
    previousDesignedBottom = element.frame.y + element.frame.h;
  }
}

/** Where continued items start on a new page: below the tallest "every"-scoped element that sits above the group. */
function continuationTop(page: Page, group: GroupElement, layout: Layout): number {
  const headers = page.elements.filter((element) => element.pageScope.mode === "every" && element.frame.y + element.frame.h <= group.frame.y);
  const bottom = headers.length ? Math.max(...headers.map((element) => element.frame.y + element.frame.h)) : 0;
  return Math.max(layout.margins.top, bottom + 3);
}

/**
 * Lays out a whole layout/view against data. Pages with a page-repeat group emit one page per item.
 * Page scopes "first"/"last" are resolved after all pages exist.
 */
export function layoutDocument(template: Template, data: DataObject, options: { layoutId?: ID; viewId?: ID | null } = {}): LayoutResult {
  const layout = template.layouts.find((item) => item.id === options.layoutId) || template.layouts[0];
  const ctx: Ctx = { fields: template.fields, overflows: [], itemCounts: {}, pageIndex: () => 0 };
  const out: LaidOutPage[] = [];
  if (!layout) return { pages: out, overflows: [], itemCounts: {} };
  const pages = resolveView(layout, options.viewId ?? null);
  const root: Scope[] = [{ data, index: 0 }];

  for (const page of pages) {
    const pageRepeat = page.elements.find((element): element is GroupElement => element.type === "group" && element.repeat?.mode === "page");
    if (pageRepeat) {
      const records = repeatRecords(pageRepeat, root, ctx);
      records.forEach((record) => {
        const clone: Page = { ...page, elements: page.elements.map((element) => (element.id === pageRepeat.id ? { ...element, repeat: null } as Element : element)) };
        layoutSourcePage(clone, layout, [record, ...root], ctx, out, record.index + 1);
      });
      continue;
    }
    layoutSourcePage(page, layout, root, ctx, out);
  }

  // Page numbers are only known now: substitute {{page}} / {{pages}} in static text.
  out.forEach((laidPage, index) => {
    for (const item of laidPage.items) {
      if (item.type !== "text" || item.isField) continue;
      if (item.lines.some((line) => line.includes("{{page"))) item.lines = item.lines.map((line) => line.replace(/\{\{page\}\}/g, String(index + 1)).replace(/\{\{pages\}\}/g, String(out.length)));
    }
  });

  // Resolve first/last page scopes now that the page count is known.
  const scoped = new Map<ID, Element>();
  for (const page of pages) for (const element of page.elements) if (element.pageScope.mode === "first" || element.pageScope.mode === "last" || element.pageScope.mode === "selected") scoped.set(element.id, element);
  if (scoped.size) {
    out.forEach((laidPage, index) => {
      const position = out.length === 1 ? "only" : index === 0 ? "first" : index === out.length - 1 ? "last" : "middle";
      laidPage.items = laidPage.items.filter((item) => {
        const element = scoped.get(item.elementId);
        return !element || scopeMatches(element, position, laidPage.sourcePageId, laidPage.continuation);
      });
      for (const element of scoped.values()) {
        const alreadyThere = laidPage.items.some((item) => item.elementId === element.id);
        if (!alreadyThere && scopeMatches(element, position, laidPage.sourcePageId, laidPage.continuation) && (position === "last" || position === "first")) {
          laidPage.items.push(...layoutElement(element, 0, 0, root, ctx, layout.canvas.height).items);
        }
      }
    });
  }
  out.forEach((laidPage, index) => {
    for (const item of laidPage.items) {
      if (item.type === "text" && !item.isField && item.lines.some((line) => line.includes("{{page"))) item.lines = item.lines.map((line) => line.replace(/\{\{page\}\}/g, String(index + 1)).replace(/\{\{pages\}\}/g, String(out.length)));
    }
  });
  return { pages: out, overflows: ctx.overflows, itemCounts: ctx.itemCounts };
}
