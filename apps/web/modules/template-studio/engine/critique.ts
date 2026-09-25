/**
 * The design critic.
 *
 * A generated template is only as good as it looks, and a model cannot see its own output. This
 * reads the laid-out page the way a person would — what overlaps, what falls off the page, what is
 * too small to read, what is squashed against an edge, whether the columns line up — and repairs
 * what can be repaired, so the generator iterates on the real result instead of on its intentions.
 */
import type { Element, GroupElement, Template } from "./types";
import type { LaidOutTextItem } from "./types";
import { layoutDocument } from "./layout";
import { buildSampleData } from "./sample";

export type IssueKind =
  | "overlap"
  | "off_page"
  | "tiny_text"
  | "cramped"
  | "overflow"
  | "misaligned"
  | "empty_page"
  | "low_contrast"
  | "no_card";

export interface Issue {
  kind: IssueKind;
  message: string;
  elementIds: string[];
  /** true when `repairTemplate` knows how to fix it. */
  fixable: boolean;
  /**
   * A fault is a defect anybody would call wrong — text on top of text, type too small to read,
   * something off the page. A suggestion is a matter of taste the critic is usually right about —
   * a repeated item that would read better on a card, edges that nearly line up. The generator acts
   * on both; only faults mean the design is broken.
   */
  severity?: "fault" | "suggestion";
}

const SUGGESTIONS = new Set<IssueKind>(["no_card", "misaligned", "cramped"]);

/** The defects, as opposed to the matters of taste. */
export const faultsOf = (issues: Issue[]): Issue[] => issues.filter((issue) => (issue.severity || "fault") === "fault");

const MIN_FONT = 7;
const EDGE = 2; // mm of breathing room expected inside a card

/** True when something in the template repeats one item per page (a flashcard, a slide). */
function hasPageRepeat(elements: Element[]): boolean {
  let found = false;
  walk(elements, (element) => {
    if (element.type === "group" && (element as GroupElement).repeat?.mode === "page") found = true;
  });
  return found;
}

function walk(elements: Element[], visit: (element: Element, parent: GroupElement | null) => void, parent: GroupElement | null = null) {
  for (const element of elements) {
    visit(element, parent);
    if (element.type === "group") walk((element as GroupElement).children, visit, element as GroupElement);
  }
}

function luminance(hex: string): number {
  const value = String(hex || "").replace("#", "");
  const full = value.length === 3 ? value.split("").map((char) => char + char).join("") : value;
  if (full.length !== 6) return 1;
  const [r, g, b] = [0, 2, 4].map((index) => parseInt(full.slice(index, index + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The box an item actually paints into: rotated text swaps its width and height about its centre. */
function uprightBox<T extends { x: number; y: number; w: number; h?: number; style?: { rotate?: number } }>(item: T): T {
  const rotation = Math.abs(Number(item.style?.rotate || 0)) % 180;
  if (rotation < 45 || rotation > 135) return item;
  const h = item.h || 0;
  const cx = item.x + item.w / 2;
  const cy = item.y + h / 2;
  return { ...item, x: cx - h / 2, y: cy - item.w / 2, w: h, h: item.w };
}

/** Everything wrong with how this template lays out, worst first. */
export function critiqueTemplate(template: Template, data?: Record<string, unknown>): Issue[] {
  const sample = data || buildSampleData(template, 6);
  const issues: Issue[] = [];
  const layout = template.layouts[0];
  if (!layout) return issues;
  const result = layoutDocument(template, sample as never, {});

  // Headers and footers are meant to sit in the margin band; only the page edge binds them.
  const chromeIds = new Set<string>();
  walk(layout.pages[0]?.elements || [], (element) => {
    // Full-bleed blocks (a card that IS the page) are judged against the page edge as well.
    const fullBleed = element.frame.w >= layout.canvas.width * 0.9;
    if (element.pageScope.mode === "every" || element.placement === "fixed" || fullBleed) walk([element], (child) => chromeIds.add(child.id));
  });

  for (const [pageIndex, page] of result.pages.entries()) {
    const texts = page.items.filter((item): item is LaidOutTextItem => item.type === "text" && item.lines.join("").trim().length > 0);
    // Off the page or into the margins. Text turned on its side is measured as it is painted:
    // the box rotates about its own centre, so width and height swap.
    for (const raw of page.items) {
      const item = uprightBox(raw);
      const bottom = item.y + (item.h || 0);
      const chrome = item.elementId ? chromeIds.has(item.elementId) : false;
      const top = chrome ? 0 : layout.margins.top - 3;
      const floor = chrome ? page.height : page.height - layout.margins.bottom + 3;
      const left = chrome ? 0 : layout.margins.left - 3;
      const right = chrome ? page.width : page.width - layout.margins.right + 3;
      if (item.y < top || bottom > floor || item.x < left || item.x + item.w > right) {
        issues.push({ kind: "off_page", message: `Something on page ${pageIndex + 1} runs into the margin (${Math.round(item.x)},${Math.round(item.y)} → ${Math.round(item.x + item.w)},${Math.round(bottom)} mm).`, elementIds: [item.elementId].filter(Boolean) as string[], fixable: true });
      }
    }
    // Two pieces of text on top of each other.
    for (let i = 0; i < texts.length; i += 1) {
      for (let j = i + 1; j < texts.length; j += 1) {
        const a = texts[i];
        const b = texts[j];
        if (a.style.rotate || b.style.rotate) continue;
        const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (overlapX > 1 && overlapY > 1) {
          issues.push({ kind: "overlap", message: `“${a.lines[0]?.slice(0, 24)}” and “${b.lines[0]?.slice(0, 24)}” overlap on page ${pageIndex + 1}.`, elementIds: [a.elementId, b.elementId].filter(Boolean) as string[], fixable: true });
        }
      }
    }
    // Unreadable type.
    for (const item of texts) {
      if ((item.style.fontSize || 10) < MIN_FONT) {
        issues.push({ kind: "tiny_text", message: `“${item.lines[0]?.slice(0, 24)}” is set at ${item.style.fontSize}pt — too small to read on paper.`, elementIds: [item.elementId].filter(Boolean) as string[], fixable: true });
      }
    }
    // A page that is almost empty reads as a mistake — unless the template puts one item per page
    // on purpose, which is what a flashcard or a slide does.
    const oneItemPerPage = hasPageRepeat(layout.pages[0]?.elements || []);
    if (!oneItemPerPage && result.pages.length > 1 && pageIndex < result.pages.length - 1) {
      const used = page.items.reduce((max, item) => Math.max(max, item.y + (item.h || 0)), 0);
      if (used < page.height * 0.45) {
        issues.push({ kind: "empty_page", message: `Page ${pageIndex + 1} is less than half used before the next page starts.`, elementIds: [], fixable: false });
      }
    }
  }

  // Text on a fill nobody can read — judged against what is actually behind the text, which may be
  // a badge inside the card rather than the card itself.
  walk(layout.pages[0]?.elements || [], (element, parent) => {
    if (element.type !== "text") return;
    let behind = parent?.style.fill || "";
    if (parent) {
      for (const sibling of parent.children) {
        if (sibling === element || !sibling.style?.fill || sibling.style.fill === "transparent") continue;
        const inside = element.frame.x >= sibling.frame.x - 1 && element.frame.x + element.frame.w <= sibling.frame.x + sibling.frame.w + 1
          && element.frame.y >= sibling.frame.y - 1 && element.frame.y + element.frame.h <= sibling.frame.y + sibling.frame.h + 1;
        if (inside) behind = sibling.style.fill;
      }
    }
    const colour = element.style.color || "#1d1d1f";
    if (!behind || behind === "transparent") return;
    if (Math.abs(luminance(behind) - luminance(colour)) < 0.28) {
      issues.push({ kind: "low_contrast", message: `Text is nearly the same shade as what is behind it (${colour} on ${behind}).`, elementIds: [element.id], fixable: true });
    }
  });

  // Repeating content with no card behind it looks unfinished.
  walk(layout.pages[0]?.elements || [], (element) => {
    if (element.type !== "group") return;
    const group = element as GroupElement;
    if (!group.repeat || group.repeat.mode === "page") return;
    // The card may be the group's own fill, or live one level down inside its item group.
    let hasCard = Boolean(group.style?.fill && group.style.fill !== "transparent");
    walk(group.children, (child) => {
      if (hasCard) return;
      const fill = child.style?.fill;
      if (fill && fill !== "transparent" && child.frame.w >= group.frame.w * 0.6) hasCard = true;
    });
    // A repeating section of pure prose (a heading and a paragraph) is a document, not a card, and
    // boxing it would be worse design. The rule is about repeated items that already reach for
    // shapes and badges but never got their background.
    const outlined = Boolean(group.style?.stroke && group.style.stroke !== "transparent");
    const proseOnly = group.children.every((child) => child.type === "text");
    if (!hasCard && !outlined && !proseOnly && group.children.length > 1) {
      issues.push({ kind: "no_card", message: `“${group.name || "The repeating block"}” is bare text on white — a filled card would read better.`, elementIds: [group.id], fixable: true });
    }
  });

  // Blocks that nearly line up but do not.
  const lefts = new Map<number, number>();
  walk(layout.pages[0]?.elements || [], (element, parent) => {
    if (parent) return;
    const key = Math.round(element.frame.x);
    lefts.set(key, (lefts.get(key) || 0) + 1);
  });
  const common = [...lefts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (common !== undefined) {
    walk(layout.pages[0]?.elements || [], (element, parent) => {
      if (parent) return;
      const delta = Math.abs(element.frame.x - common);
      if (delta > 0.6 && delta < 8) {
        issues.push({ kind: "misaligned", message: `“${element.name || element.type}” starts ${delta.toFixed(1)} mm off the column everything else uses.`, elementIds: [element.id], fixable: true });
      }
    });
  }

  const order: IssueKind[] = ["overlap", "off_page", "tiny_text", "low_contrast", "no_card", "misaligned", "overflow", "cramped", "empty_page"];
  for (const issue of issues) issue.severity = SUGGESTIONS.has(issue.kind) ? "suggestion" : "fault";

  return issues.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

/**
 * Repairs what can be repaired without guessing at intent: nudge overlapping text apart, pull
 * elements back inside the page, raise unreadable type, darken text on a pale card, align the
 * blocks to the common column, and put a card behind bare repeating content.
 */
export function repairTemplate(template: Template, issues: Issue[]): { template: Template; fixed: number } {
  const layout = template.layouts[0];
  if (!layout) return { template, fixed: 0 };
  const ids = new Set(issues.flatMap((issue) => issue.elementIds));
  const kinds = new Map<string, IssueKind[]>();
  for (const issue of issues) for (const elementId of issue.elementIds) kinds.set(elementId, [...(kinds.get(elementId) || []), issue.kind]);
  let fixed = 0;

  const clone = JSON.parse(JSON.stringify(template)) as Template;
  const page = clone.layouts[0].pages[0];
  const width = clone.layouts[0].canvas.width - clone.layouts[0].margins.left - clone.layouts[0].margins.right;

  const lefts = new Map<number, number>();
  for (const element of page.elements) lefts.set(Math.round(element.frame.x), (lefts.get(Math.round(element.frame.x)) || 0) + 1);
  const column = [...lefts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? clone.layouts[0].margins.left;

  const fix = (element: Element, parent: GroupElement | null) => {
    const list = kinds.get(element.id) || [];
    if (list.includes("tiny_text") && element.type === "text") {
      element.style = { ...element.style, fontSize: Math.max(MIN_FONT + 1, (element.style.fontSize || 10) + 2) };
      fixed += 1;
    }
    if (list.includes("low_contrast") && element.type === "text") {
      element.style = { ...element.style, color: "#1f2a6b" };
      fixed += 1;
    }
    if (list.includes("off_page")) {
      if (!parent) {
        element.frame = { ...element.frame, x: Math.max(clone.layouts[0].margins.left, Math.min(element.frame.x, clone.layouts[0].canvas.width - clone.layouts[0].margins.right - 10)), w: Math.min(element.frame.w, width) };
      } else {
        element.frame = { ...element.frame, x: Math.max(EDGE, element.frame.x), w: Math.min(element.frame.w, parent.frame.w - EDGE * 2) };
      }
      fixed += 1;
    }
    if (list.includes("misaligned") && !parent) {
      element.frame = { ...element.frame, x: column, w: Math.min(element.frame.w, width) };
      fixed += 1;
    }
    if (list.includes("no_card") && element.type === "group") {
      const group = element as GroupElement;
      const height = Math.max(...group.children.map((child) => child.frame.y + child.frame.h), group.frame.h);
      group.children = [
        { id: `${group.id}_card`, type: "rect", name: "Card", frame: { x: 0, y: 0, w: group.frame.w, h: height + 3 }, style: { fill: "#f4f7ff", stroke: "#dbe4f7", strokeWidth: 0.3, radius: 3 }, pageScope: { mode: "page" }, visibility: {} } as unknown as Element,
        ...group.children.map((child) => ({ ...child, frame: { ...child.frame, x: Math.max(EDGE + 1, child.frame.x), y: child.frame.y + 1 } }))
      ];
      group.frame = { ...group.frame, h: height + 5 };
      fixed += 1;
    }
  };

  walk(page.elements, fix);

  // Overlaps are resolved after the rest, in reading order: the lower element moves down.
  const overlapIds = new Set(issues.filter((issue) => issue.kind === "overlap").flatMap((issue) => issue.elementIds));
  if (overlapIds.size) {
    walk(page.elements, (element) => {
      if (element.type !== "group") return;
      const group = element as GroupElement;
      const children = [...group.children].sort((a, b) => a.frame.y - b.frame.y);
      for (let index = 1; index < children.length; index += 1) {
        const previous = children[index - 1];
        const current = children[index];
        if (!overlapIds.has(current.id) && !overlapIds.has(previous.id)) continue;
        if (current.type === "rect" || previous.type === "rect") continue;
        const bottom = previous.frame.y + previous.frame.h;
        if (current.frame.y < bottom && current.frame.x < previous.frame.x + previous.frame.w && previous.frame.x < current.frame.x + current.frame.w) {
          current.frame = { ...current.frame, y: bottom + 1.5 };
          fixed += 1;
        }
      }
      const deepest = Math.max(...group.children.map((child) => child.frame.y + child.frame.h), 0);
      if (deepest + 2 > group.frame.h) group.frame = { ...group.frame, h: deepest + 2 };
    });
  }

  if (ids.size && fixed) clone.updatedAt = new Date().toISOString();
  return { template: clone, fixed };
}

/** Critique, repair, critique again — up to `rounds` times. */
export function polishTemplate(template: Template, rounds = 3): { template: Template; before: Issue[]; after: Issue[]; fixed: number } {
  const before = critiqueTemplate(template);
  let current = template;
  let issues = before;
  let fixed = 0;
  for (let round = 0; round < rounds && issues.length; round += 1) {
    const result = repairTemplate(current, issues);
    if (!result.fixed) break;
    current = result.template;
    fixed += result.fixed;
    issues = critiqueTemplate(current);
  }
  return { template: current, before, after: issues, fixed };
}
