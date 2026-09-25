/**
 * The interface critic.
 *
 * The design critic reads laid-out documents; this one reads the app itself. It runs in the page,
 * against the real DOM at the real size, and reports what a careful eye would: text spilling out of
 * its box, controls overlapping, a row that pushes the page sideways, tap targets too small for a
 * thumb, text too pale to read, a control wider than the phone. Every check is something that can
 * be seen, so a fix can be verified rather than argued about.
 *
 * It is used three ways: from the dev panel (⌥⇧U), from a test harness driving the browser, and
 * after any UI change — a change that adds issues is not finished.
 */

export const SEVERITY = { blocker: 3, major: 2, minor: 1 };

const TEXT_TAGS = new Set(["P", "SPAN", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "A", "BUTTON", "LABEL", "TD", "TH", "DIV"]);
const TAP_MIN = 32; // css px — below this a control is awkward on a phone
const CONTRAST_MIN = 3.2;

const luminance = (rgb) => {
  const [r, g, b] = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Returns [r, g, b, a]; a fully transparent colour is not a colour at all. */
const parseColour = (value) => {
  const match = String(value || "").match(/rgba?\(([^)]+)\)/);
  if (!match) return null;
  const parts = match[1].split(/[,\s/]+/).filter(Boolean).map((part) => Number(part.trim()));
  const alpha = parts.length >= 4 ? parts[3] : 1;
  if (!alpha) return null;
  return [parts[0], parts[1], parts[2], alpha];
};

/** What a translucent colour actually looks like once it is painted over what is behind it. */
const over = (front, back) => front.slice(0, 3).map((channel, index) => channel * front[3] + back[index] * (1 - front[3]));

const contrast = (front, back) => {
  const a = parseColour(front);
  if (!a || !back) return null;
  const text = over(a, back);
  const [light, dark] = [luminance(text), luminance(back)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

/**
 * What is actually behind some text: every translucent background from the element outwards,
 * painted over each other. Luna's tinted chips are 10% accent over white, and judging them against
 * the raw accent colour would condemn text that reads perfectly well.
 */
function backgroundOf(element) {
  const layers = [];
  let current = element;
  while (current && current !== document.documentElement) {
    const raw = getComputedStyle(current).backgroundColor;
    const colour = parseColour(raw);
    if (!colour) {
      // A colour in a syntax this cannot read (oklab, color-mix) — better to say nothing than to
      // report a contrast failure that is not there.
      if (raw && !/^(transparent|rgba\(0, 0, 0, 0\))$/.test(raw.trim())) return null;
    } else {
      layers.push(colour);
      if (colour[3] >= 1) break;
    }
    current = current.parentElement;
  }
  let result = [255, 255, 255];
  for (const layer of layers.reverse()) result = over(layer, result);
  return result;
}

const describe = (element) => {
  const text = (element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 48);
  const name = element.getAttribute("aria-label") || element.getAttribute("title") || text;
  return name || `${element.tagName.toLowerCase()}${element.className ? `.${String(element.className).split(" ")[0]}` : ""}`;
};

const visible = (element) => {
  const style = getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
  // Something nobody can click is not something anybody can misuse: scrims, overlays, ghosts.
  if (style.pointerEvents === "none" && ["BUTTON", "A", "SELECT", "INPUT"].includes(element.tagName)) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};

/**
 * Audits what is on screen. `root` defaults to the document body.
 * Returns issues newest-worst first, each naming the element so a fix can be aimed.
 */
export function auditUI(root = typeof document === "undefined" ? null : document.body, options = {}) {
  if (!root) return { issues: [], checked: 0, width: 0 };
  const { maxElements = 4000 } = options;
  const issues = [];
  const add = (kind, severity, message, element) => issues.push({ kind, severity, message, target: describe(element), selector: pathOf(element) });
  // The critic's own badge and panel are not part of the interface being judged.
  const elements = [...root.querySelectorAll("*")].filter((element) => !element.closest(".ui-critic")).slice(0, maxElements).filter(visible);

  // 1. Text spilling out of its box.
  for (const element of elements) {
    if (!TEXT_TAGS.has(element.tagName)) continue;
    const style = getComputedStyle(element);
    if (style.overflow !== "visible" && style.overflow !== "clip") continue;
    const hasOwnText = [...element.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim());
    if (!hasOwnText) continue;
    const overflowX = element.scrollWidth - element.clientWidth;
    const overflowY = element.scrollHeight - element.clientHeight;
    if (overflowX > 2 && style.whiteSpace === "nowrap" && style.textOverflow !== "ellipsis") {
      add("overflow-text", SEVERITY.major, `“${describe(element)}” is ${Math.round(overflowX)}px wider than its box and is not truncated.`, element);
    } else if (overflowY > 4 && (style.position === "absolute" || element.parentElement?.clientHeight < element.scrollHeight - 4)) {
      add("overflow-text", SEVERITY.minor, `“${describe(element)}” is ${Math.round(overflowY)}px taller than the space it was given.`, element);
    }
  }

  // 2. Controls sitting on top of each other.
  const controls = elements.filter((element) => ["BUTTON", "A", "SELECT", "INPUT", "TEXTAREA"].includes(element.tagName));
  for (let i = 0; i < controls.length; i += 1) {
    for (let j = i + 1; j < controls.length; j += 1) {
      const a = controls[i].getBoundingClientRect();
      const b = controls[j].getBoundingClientRect();
      if (controls[i].contains(controls[j]) || controls[j].contains(controls[i])) continue;
      const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (overlapX > 4 && overlapY > 4) {
        add("overlap", SEVERITY.blocker, `“${describe(controls[i])}” and “${describe(controls[j])}” overlap by ${Math.round(overlapX)}×${Math.round(overlapY)}px.`, controls[i]);
        break;
      }
    }
  }

  // 3. The page scrolls sideways.
  const doc = document.documentElement;
  if (doc.scrollWidth - doc.clientWidth > 2) {
    const widest = elements.filter((element) => element.getBoundingClientRect().right > doc.clientWidth + 2).sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)[0];
    if (widest) add("page-scroll", SEVERITY.blocker, `The page scrolls sideways by ${Math.round(doc.scrollWidth - doc.clientWidth)}px — “${describe(widest)}” reaches past the right edge.`, widest);
  }

  // 4. Tap targets and controls too small or too wide for the screen.
  for (const element of controls) {
    const rect = element.getBoundingClientRect();
    if (rect.width > doc.clientWidth + 1) add("too-wide", SEVERITY.major, `“${describe(element)}” is wider than the screen (${Math.round(rect.width)}px).`, element);
    if (window.innerWidth <= 820 && (rect.height < TAP_MIN || rect.width < 24) && (element.textContent || "").trim()) {
      add("tap-target", SEVERITY.minor, `“${describe(element)}” is ${Math.round(rect.width)}×${Math.round(rect.height)}px — small for a thumb.`, element);
    }
  }

  // 5. Text nobody can read against what is behind it.
  for (const element of elements) {
    if (!TEXT_TAGS.has(element.tagName)) continue;
    const hasOwnText = [...element.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim().length > 2);
    if (!hasOwnText) continue;
    const style = getComputedStyle(element);
    const ratio = contrast(style.color, backgroundOf(element));
    if (ratio !== null && ratio < CONTRAST_MIN && Number.parseFloat(style.fontSize) < 20) {
      add("contrast", SEVERITY.major, `“${describe(element)}” has a contrast ratio of ${ratio.toFixed(1)}:1 against its background.`, element);
    }
  }

  // 6. Empty interactive elements — a button nobody can read.
  for (const element of controls) {
    const wrapping = element.closest("label");
    const named = element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`) : null;
    const label = (element.textContent || "").trim()
      || element.getAttribute("aria-label")
      || element.getAttribute("title")
      || element.getAttribute("placeholder")
      || (wrapping ? (wrapping.textContent || "").trim() : "")
      || (named ? (named.textContent || "").trim() : "");
    if (!label) add("unlabelled", SEVERITY.minor, `A ${element.tagName.toLowerCase()} has no label a screen reader could use.`, element);
  }

  const seen = new Set();
  const unique = issues.filter((issue) => {
    const key = `${issue.kind}|${issue.selector}|${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    issues: unique.sort((a, b) => b.severity - a.severity),
    checked: elements.length,
    width: window.innerWidth,
    blockers: unique.filter((issue) => issue.severity === SEVERITY.blocker).length
  };
}

function pathOf(element) {
  const parts = [];
  let current = element;
  while (current && current.nodeType === 1 && parts.length < 4) {
    const tag = current.tagName.toLowerCase();
    const cls = String(current.className || "").split(" ").filter(Boolean)[0];
    parts.unshift(cls ? `${tag}.${cls}` : tag);
    current = current.parentElement;
  }
  return parts.join(" > ");
}

if (typeof window !== "undefined") {
  // Available from the console and to test harnesses driving the browser.
  window.lunaAuditUI = auditUI;
}
