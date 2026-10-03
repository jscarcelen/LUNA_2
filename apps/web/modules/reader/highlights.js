/**
 * Highlighting for the reader, without touching the page: ranges are registered with the CSS Custom
 * Highlight API, so the document (or an interactive quiz that React re-renders) is never modified.
 * A highlight is stored as text offsets plus the words themselves; when the text moves a little
 * (an answer appears, the document is re-rendered) it is found again from those words.
 */

export const HIGHLIGHT_COLORS = [
  { id: "yellow", label: "Yellow", css: "#fff176" },
  { id: "orange", label: "Orange", css: "#ffcc80" },
  { id: "green", label: "Green", css: "#a5d6a7" },
  { id: "blue", label: "Blue", css: "#90caf9" },
  { id: "pink", label: "Pink", css: "#f8bbd0" },
  { id: "purple", label: "Purple", css: "#ce93d8" }
];

export const supportsHighlights = () => typeof CSS !== "undefined" && "highlights" in CSS && typeof globalThis.Highlight !== "undefined";
const nameOf = (color) => `luna-hl-${color}`;

function textNodes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
  return nodes;
}

/** Where a live Range sits in the root's text, as an anchor others can find again. */
export function anchorFromRange(root, range, color) {
  let start = 0;
  let found = null;
  let end = 0;
  for (const node of textNodes(root)) {
    const length = node.nodeValue.length;
    if (node === range.startContainer) found = start + range.startOffset;
    if (node === range.endContainer) { end = start + range.endOffset; break; }
    start += length;
  }
  if (found === null || end <= found) return null;
  const full = root.textContent || "";
  const text = full.slice(found, end);
  if (!text.trim()) return null;
  return { id: `hl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, color, start: found, text, prefix: full.slice(Math.max(0, found - 24), found), createdAt: new Date().toISOString() };
}

/** Finds an anchor's text again: at its offset, else at the occurrence that has the same words before it. */
function locate(full, anchor) {
  if (full.slice(anchor.start, anchor.start + anchor.text.length) === anchor.text) return anchor.start;
  const candidates = [];
  for (let at = full.indexOf(anchor.text); at !== -1; at = full.indexOf(anchor.text, at + 1)) candidates.push(at);
  if (!candidates.length) return -1;
  const withPrefix = candidates.find((at) => full.slice(Math.max(0, at - anchor.prefix.length), at) === anchor.prefix);
  if (withPrefix !== undefined) return withPrefix;
  return candidates.sort((a, b) => Math.abs(a - anchor.start) - Math.abs(b - anchor.start))[0];
}

function rangeAt(root, nodes, from, to) {
  const range = document.createRange();
  let position = 0;
  let startSet = false;
  for (const node of nodes) {
    const length = node.nodeValue.length;
    if (!startSet && from < position + length) { range.setStart(node, from - position); startSet = true; }
    if (startSet && to <= position + length) { range.setEnd(node, to - position); return range; }
    position += length;
  }
  return null;
}

export function clearHighlights() {
  if (!supportsHighlights()) return;
  for (const color of HIGHLIGHT_COLORS) CSS.highlights.delete(nameOf(color.id));
}

/** Paints the anchors (or nothing, when `visible` is false). Returns how many were placed. */
export function paintHighlights(root, anchors, visible = true) {
  if (!supportsHighlights() || !root) return 0;
  clearHighlights();
  if (!visible) return 0;
  const full = root.textContent || "";
  const nodes = textNodes(root);
  const byColor = new Map();
  let placed = 0;
  for (const anchor of anchors || []) {
    const at = locate(full, anchor);
    if (at < 0) continue;
    const range = rangeAt(root, nodes, at, at + anchor.text.length);
    if (!range) continue;
    if (!byColor.has(anchor.color)) byColor.set(anchor.color, []);
    byColor.get(anchor.color).push(range);
    placed += 1;
  }
  for (const [color, ranges] of byColor) CSS.highlights.set(nameOf(color), new globalThis.Highlight(...ranges));
  return placed;
}

/** Anchors that overlap the given one (used to remove a highlight by selecting over it). */
export function overlapping(anchors, anchor, full) {
  const from = locate(full, anchor) >= 0 ? locate(full, anchor) : anchor.start;
  const to = from + anchor.text.length;
  return (anchors || []).filter((other) => {
    const at = locate(full, other);
    const start = at >= 0 ? at : other.start;
    return start < to && start + other.text.length > from;
  });
}
