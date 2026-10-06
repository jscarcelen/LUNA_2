/**
 * A small maths typesetter: LaTeX → boxes with drawing operations.
 *
 * KaTeX typesets maths as HTML, which only a browser can draw. PDF, however, is written with pdf-lib
 * and its fourteen standard fonts, so there is no browser to ask. This module parses LaTeX with
 * KaTeX's own parser (every macro and command KaTeX understands) and lays the tree out with TeX's
 * rules in simplified form — stacked fractions, radicals, limits on big operators, scripts, accents,
 * stretchy delimiters, matrices — and emits glyph / rule / path operations in "em" units. The PDF
 * renderer draws those; the layout engine uses the same boxes to estimate widths.
 *
 * Fonts: Times (roman, italic, bold) for letters and digits, Symbol for Greek and operators.
 * `MathEnv` says how wide a glyph is and which font can draw it, so the real pdf-lib metrics can be
 * plugged in (PDF) or the built-in estimates used (layout).
 */
import katex from "katex";
import { MATH_SYMBOLS, TEXT_SYMBOLS } from "./symbolTable";

export type FontId = "rm" | "it" | "bf" | "bi" | "sy" | "ss" | "tt";
export type Op =
  | { t: "g"; f: FontId; s: string; x: number; y: number; size: number }
  | { t: "r"; x: number; y: number; w: number; h: number }
  | { t: "l"; x1: number; y1: number; x2: number; y2: number; lw: number }
  | { t: "p"; pts: number[][]; lw: number };
type Cls = "ord" | "op" | "bin" | "rel" | "open" | "close" | "punct" | "inner";
export interface MBox { w: number; h: number; d: number; ops: Op[]; cls: Cls; isChar?: boolean; italic?: number }
export interface MathEnv {
  /** Advance width of `text` set in `font`, in em at size 1. */
  width(font: FontId, text: string): number;
  /** Can this font draw the character? */
  supports(font: FontId, ch: string): boolean;
}

/* ---------------------------------------------------------------- metrics (estimates; pdf-lib's real ones replace them for PDF) */

const TIMES_ROMAN = "250 333 408 500 500 833 778 180 333 333 500 564 250 333 250 278 500 500 500 500 500 500 500 500 500 500 278 278 564 564 564 444 921 722 667 667 722 611 556 722 722 333 389 722 611 889 722 722 556 722 667 556 611 722 722 944 722 722 611 333 278 333 469 500 333 444 500 444 500 444 333 500 500 278 278 500 278 778 500 500 500 500 333 389 278 500 500 722 500 500 444 480 200 480 541".split(" ").map(Number);
const TIMES_ITALIC = "250 333 420 500 500 833 778 214 333 333 500 675 250 333 250 278 500 500 500 500 500 500 500 500 500 500 333 333 675 675 675 500 920 611 611 667 722 611 611 722 722 333 444 667 556 833 667 722 611 722 611 500 556 722 611 833 611 556 556 389 278 389 422 500 333 500 500 444 500 444 278 500 500 278 278 444 278 722 500 500 500 500 389 389 278 500 444 667 444 444 389 400 275 400 541".split(" ").map(Number);
const SYMBOL_WIDTH: Record<string, number> = { "∑": 0.713, "∏": 0.823, "∫": 0.274, "√": 0.549, "∞": 0.713, "−": 0.549, "±": 0.549, "×": 0.549, "÷": 0.549, "≤": 0.549, "≥": 0.549, "≠": 0.549, "≈": 0.549, "≡": 0.549, "→": 0.987, "←": 0.987, "↔": 0.987, "⇒": 0.987, "⇔": 0.987, "⇐": 0.987, "∈": 0.713, "∉": 0.713, "⊂": 0.713, "⊆": 0.713, "∪": 0.768, "∩": 0.768, "∂": 0.494, "∇": 0.713, "∀": 0.713, "∃": 0.549, "∅": 0.823, "⋅": 0.25, "∗": 0.5, "∼": 0.549, "∝": 0.713, "∠": 0.768, "⊥": 0.658, "′": 0.247, "∧": 0.603, "∨": 0.603, "∴": 0.863 };

function approxWidth(font: FontId, text: string): number {
  let sum = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) || 0;
    if (font === "sy") { sum += SYMBOL_WIDTH[ch] ?? (code >= 0x391 && code <= 0x3c9 ? 0.62 : 0.6); continue; }
    if (code >= 32 && code <= 126) {
      const table = font === "it" || font === "bi" ? TIMES_ITALIC : TIMES_ROMAN;
      sum += (table[code - 32] || 500) / 1000 * (font === "bf" || font === "bi" ? 1.04 : font === "ss" ? 1.05 : font === "tt" ? 1.2 : 1);
    } else sum += code === 0xa0 ? 0.25 : 0.56;
  }
  return sum;
}

const SYMBOL_SET = new Set([...("αβγδεζηθικλμνξοπρςστυφχψωϑϒϕϖΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ•…′″ℑ℘ℜℵ←↑→↓↔⇐⇑⇒⇓⇔∀∂∃∅∇∈∉∋∏∑−∗√∝∞∠∧∨∩∪∫∴∼≅≈≠≡≤≥⊂⊃⊄⊆⊇⊕⊗⊥⋅〈〉±×÷°")]);
const approxSupports = (font: FontId, ch: string): boolean => {
  if (font === "sy") return SYMBOL_SET.has(ch);
  const code = ch.codePointAt(0) || 0;
  return code >= 32 && code < 127 || ["×", "÷", "±", "·", "°", "µ", "¬", "¼", "½", "¾", "²", "³", "¹", "•", "…", "–", "—"].includes(ch);
};
export const APPROX_ENV: MathEnv = { width: approxWidth, supports: approxSupports };

/* ---------------------------------------------------------------- TeX constants (em) */

const AXIS = 0.25;
const RULE = 0.04;
const XHEIGHT = 0.43;
const SCALE = [1, 1, 0.7, 0.5];
const THIN = 3 / 18, MED = 4 / 18, THICK = 5 / 18;

interface Style { size: 0 | 1 | 2 | 3; cramped?: boolean }
const D: Style = { size: 0 }, T: Style = { size: 1 }, S: Style = { size: 2 }, SS: Style = { size: 3 };
const sup = (style: Style): Style => ({ size: Math.min(3, style.size < 2 ? 2 : 3) as Style["size"] });
const fracStyle = (style: Style): Style => ({ size: Math.min(3, style.size + 1) as Style["size"], cramped: style.cramped });

interface Ctx { env: MathEnv; style: Style; font?: FontId; mode: "math" | "text" }

/* vertical extents of a character, in em at size 1 (height above baseline, depth below) */
function charExtent(font: FontId, ch: string): { h: number; d: number } {
  if (font === "sy") {
    if (ch === "∑" || ch === "∏") return { h: 0.752, d: 0.108 };
    if (ch === "∫") return { h: 0.916, d: 0.107 };
    if (ch === "√") return { h: 0.9, d: 0.1 };
    if (/[αβγδεζηθικλμνξοπρςστυφχψω]/.test(ch)) return { h: ch === "β" || ch === "δ" || ch === "ζ" || ch === "θ" || ch === "λ" || ch === "ξ" ? 0.7 : 0.48, d: /[βγζηξρςφχψμ]/.test(ch) ? 0.22 : 0.02 };
    if (/[−±×÷≤≥≠≈≡∼∝∗⋅]/.test(ch)) return { h: 0.58, d: 0.06 };
    if (/[→←↔⇒⇔⇐]/.test(ch)) return { h: 0.5, d: 0 };
    return { h: 0.68, d: 0.02 };
  }
  if (/[A-Z0-9]/.test(ch)) return { h: 0.676, d: 0 };
  if (/[bdfhklt]/.test(ch)) return { h: 0.683, d: 0 };
  if (/[gjpqy]/.test(ch)) return { h: 0.45, d: 0.22 };
  if (/[a-z]/.test(ch)) return { h: 0.45, d: 0 };
  if (/[()[\]{}|/]/.test(ch)) return { h: 0.75, d: 0.25 };
  if (/[+=<>±×÷−]/.test(ch)) return { h: 0.58, d: 0.08 };
  if (/[,;]/.test(ch)) return { h: 0.1, d: 0.17 };
  if (/[.:]/.test(ch)) return { h: 0.1, d: 0 };
  return { h: 0.68, d: 0 };
}

const GREEK_ALIAS: Record<string, string> = { "ϵ": "ε", "ɛ": "ε", "ϱ": "ρ", "ϰ": "κ", "ς": "σ" };
const TEXT_ALIAS: Record<string, string> = { "−": "−", "∗": "∗", "⋅": "⋅", "·": "·", "′": "′", "″": "″", "∣": "|", "∥": "‖", "⟨": "〈", "⟩": "〉", "〈": "〈", "〉": "〉", " ": " " };
const DOUBLE_STRUCK: Record<string, string> = { "ℝ": "R", "ℕ": "N", "ℤ": "Z", "ℚ": "Q", "ℂ": "C", "ℙ": "P", "ℍ": "H", "ℓ": "l", "ℏ": "ħ" };
/** Last resort for characters no font here can draw: the closest readable spelling. */
const SPELLED: Record<string, string> = { "≪": "<<", "≫": ">>", "∓": "-/+", "∘": "o", "∖": "\\", "ℏ": "h", "ħ": "h", "⟂": "⊥", "⊤": "T", "∎": "[]", "□": "[]", "⋯": "...", "⋮": ":", "⋱": "...", "⟶": "→", "⟹": "⇒", "⟺": "⇔", "↦": "→", "↗": "→", "↘": "→", "≃": "≈", "≅": "≈", "≲": "≤", "≳": "≥", "⩽": "≤", "⩾": "≥", "ℵ": "ℵ", "⊊": "⊂", "⊋": "⊃", "∄": "∃", "∁": "c", "⊢": "|-", "⊨": "|=", "…": "..." };

/** One glyph run as a box: picks the first font that can draw every character. */
function glyphs(text: string, ctx: Ctx, preferred: FontId, cls: Cls, scale: number): MBox {
  let ops: Op[] = [];
  let x = 0;
  let h = 0;
  let d = 0;
  for (const original of text) {
    let ch = TEXT_ALIAS[original] || GREEK_ALIAS[original] || original;
    let font: FontId = preferred;
    if (!ctx.env.supports(font, ch)) {
      const order: FontId[] = /[Ͱ-Ͽ←-⋿]/.test(ch) ? ["sy", "rm", "it"] : ["rm", "sy", "it"];
      const found = order.find((candidate) => ctx.env.supports(candidate, ch));
      if (found) font = found;
      else {
        const spelled = DOUBLE_STRUCK[ch] || SPELLED[ch] || "?";
        for (const piece of spelled) {
          const f = ctx.env.supports(preferred, piece) ? preferred : ctx.env.supports("rm", piece) ? "rm" : "sy";
          const width = ctx.env.width(f, piece) * scale;
          const ext = charExtent(f, piece);
          ops.push({ t: "g", f, s: piece, x, y: 0, size: scale });
          x += width; h = Math.max(h, ext.h * scale); d = Math.max(d, ext.d * scale);
        }
        continue;
      }
    }
    // Greek is upright in Symbol; Latin letters in math are italic Times — already chosen by the caller.
    const width = ctx.env.width(font, ch) * scale;
    const ext = charExtent(font, ch);
    ops.push({ t: "g", f: font, s: ch, x, y: 0, size: scale });
    x += width;
    h = Math.max(h, ext.h * scale);
    d = Math.max(d, ext.d * scale);
  }
  // Merge neighbouring runs in one font into a single draw call.
  const merged: Op[] = [];
  for (const op of ops) {
    const last = merged[merged.length - 1];
    if (last && last.t === "g" && op.t === "g" && last.f === op.f && last.size === op.size && Math.abs(last.x + ctx.env.width(last.f, last.s) * last.size - op.x) < 1e-6) merged[merged.length - 1] = { ...last, s: last.s + op.s };
    else merged.push(op);
  }
  ops = merged;
  return { w: x, h, d, ops, cls, isChar: [...text].length === 1 };
}

const move = (box: MBox, dx: number, dy: number): Op[] => box.ops.map((op): Op => {
  if (op.t === "g") return { ...op, x: op.x + dx, y: op.y + dy };
  if (op.t === "r") return { ...op, x: op.x + dx, y: op.y + dy };
  if (op.t === "l") return { ...op, x1: op.x1 + dx, y1: op.y1 + dy, x2: op.x2 + dx, y2: op.y2 + dy };
  return { ...op, pts: op.pts.map(([px, py]) => [px + dx, py + dy]) };
});

const blank = (w = 0): MBox => ({ w, h: 0, d: 0, ops: [], cls: "ord" });

const CLASS_INDEX: Record<Cls, number> = { ord: 0, op: 1, bin: 2, rel: 3, open: 4, close: 5, punct: 6, inner: 7 };
/** TeX's inter-atom spacing: 0 none, 1 thin, 2 medium, 3 thick (rows: left atom; columns: ord op bin rel open close punct inner). */
const SPACING: Record<Cls, number[]> = {
  ord: [0, 1, 2, 3, 0, 0, 0, 1],
  op: [1, 1, 0, 3, 0, 0, 0, 1],
  bin: [2, 2, 0, 0, 2, 0, 0, 2],
  rel: [3, 3, 0, 0, 3, 0, 0, 3],
  open: [0, 0, 0, 0, 0, 0, 0, 0],
  close: [0, 1, 2, 3, 0, 0, 0, 1],
  punct: [1, 1, 0, 1, 1, 1, 1, 1],
  inner: [1, 1, 2, 3, 1, 0, 1, 1]
};

/** Boxes side by side on one baseline, with TeX's inter-atom spacing. */
function hlist(boxes: MBox[], style: Style, spaced = true): MBox {
  if (!boxes.length) return blank();
  const list = boxes.map((box) => ({ ...box }));
  // A binary operator with nothing sensible on its left (or right) is a sign, not an operator.
  list.forEach((box, index) => {
    if (box.cls !== "bin") return;
    const before = list[index - 1]?.cls;
    const after = list[index + 1];
    if (!before || ["bin", "op", "rel", "open", "punct"].includes(before) || !after || ["rel", "close", "punct"].includes(after.cls)) box.cls = "ord";
  });
  const script = style.size >= 2;
  const gap = (left: Cls, right: Cls): number => {
    if (!spaced) return 0;
    const row = SPACING[left];
    const code = row ? row[CLASS_INDEX[right]] : 0;
    if (code === 1) return script ? 0 : THIN;
    if (code === 2) return script ? 0 : MED;
    if (code === 3) return script ? 0 : THICK;
    return 0;
  };
  let x = 0;
  let h = 0;
  let d = 0;
  const ops: Op[] = [];
  list.forEach((box, index) => {
    if (index > 0) x += gap(list[index - 1].cls, box.cls);
    ops.push(...move(box, x, 0));
    x += box.w;
    h = Math.max(h, box.h);
    d = Math.max(d, box.d);
  });
  const first = list[0].cls;
  const last = list[list.length - 1].cls;
  return { w: x, h, d, ops, cls: list.length === 1 ? list[0].cls : first === "open" && last === "close" ? "inner" : "ord" };
}

/* ---------------------------------------------------------------- delimiters */

/** An arc as a polyline: used for parentheses and braces that must grow with their content. */
function arc(cx: number, cy: number, rx: number, ry: number, from: number, to: number, steps = 10): number[][] {
  const out: number[][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = from + (to - from) * (i / steps);
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return out;
}

/** A delimiter stretched to cover [-depth, height] (em), drawn with strokes. */
const DELIMITER_NAMES: Record<string, string> = { "\\{": "{", "\\}": "}", "\\lbrace": "{", "\\rbrace": "}", "\\lbrack": "[", "\\rbrack": "]", "\\langle": "⟨", "\\rangle": "⟩", "\\lvert": "|", "\\rvert": "|", "\\vert": "|", "\\lVert": "‖", "\\rVert": "‖", "\\Vert": "‖", "\\|": "‖", "\\lfloor": "⌊", "\\rfloor": "⌋", "\\lceil": "⌈", "\\rceil": "⌉", "\\backslash": "\\", "\\lgroup": "(", "\\rgroup": ")", "\\uparrow": "|", "\\downarrow": "|", "∣": "|", "∥": "‖", "〈": "⟨", "〉": "⟩" };

function delimiter(rawChar: string, height: number, depth: number, ctx: Ctx, scale: number): MBox {
  const char = DELIMITER_NAMES[rawChar] || (rawChar.startsWith("\\") ? MATH_SYMBOLS[rawChar]?.[0] || rawChar : rawChar);
  if (!char || char === ".") return blank(0.1 * scale);
  const total = height + depth;
  // Small enough for the font's own glyph.
  if (total <= 1.15 * scale && /^[()[\]|]$/.test(char)) return { ...glyphs(char, ctx, "rm", "ord", scale), cls: "ord" };
  const lw = 0.045 * scale;
  const bottom = -depth - 0.02;
  const top = height + 0.02;
  const mid = (top + bottom) / 2;
  const w = Math.min(0.5, 0.2 + total * 0.06);
  const pad = 0.05;
  const make = (ops: Op[], width: number): MBox => ({ w: width + pad, h: height, d: depth, ops, cls: "ord" });
  switch (char) {
    case "(": case ")": {
      const wide = Math.min(0.32, 0.16 + total * 0.05);
      const pts: number[][] = [];
      for (let i = 0; i <= 14; i += 1) {
        const t = -1 + (2 * i) / 14;
        const curve = wide * (0.1 + 0.9 * t * t);
        pts.push([char === "(" ? curve + 0.03 : wide + 0.03 - curve, mid + t * (total / 2)]);
      }
      return make([{ t: "p", pts, lw }], wide + 0.04);
    }
    case "[": return make([{ t: "p", pts: [[0.2, top], [0.06, top], [0.06, bottom], [0.2, bottom]], lw }], 0.25);
    case "]": return make([{ t: "p", pts: [[0.02, top], [0.16, top], [0.16, bottom], [0.02, bottom]], lw }], 0.25);
    case "|": case "∣": case "\\vert": return make([{ t: "l", x1: 0.05, y1: top, x2: 0.05, y2: bottom, lw }], 0.12);
    case "‖": case "∥": case "\\Vert": return make([{ t: "l", x1: 0.04, y1: top, x2: 0.04, y2: bottom, lw }, { t: "l", x1: 0.13, y1: top, x2: 0.13, y2: bottom, lw }], 0.2);
    case "{": return make([{ t: "p", pts: [[0.3, top], [0.18, top - 0.02], [0.16, top - 0.12], [0.16, mid + 0.1], [0.12, mid + 0.04], [0.04, mid], [0.12, mid - 0.04], [0.16, mid - 0.1], [0.16, bottom + 0.12], [0.18, bottom + 0.02], [0.3, bottom]], lw }], 0.33);
    case "}": return make([{ t: "p", pts: [[0.04, top], [0.16, top - 0.02], [0.18, top - 0.12], [0.18, mid + 0.1], [0.22, mid + 0.04], [0.3, mid], [0.22, mid - 0.04], [0.18, mid - 0.1], [0.18, bottom + 0.12], [0.16, bottom + 0.02], [0.04, bottom]], lw }], 0.33);
    case "⟨": case "〈": case "<": case "\\langle": return make([{ t: "p", pts: [[0.22, top], [0.06, mid], [0.22, bottom]], lw }], 0.27);
    case "⟩": case "〉": case ">": case "\\rangle": return make([{ t: "p", pts: [[0.04, top], [0.2, mid], [0.04, bottom]], lw }], 0.27);
    case "⌊": return make([{ t: "p", pts: [[0.06, top], [0.06, bottom], [0.2, bottom]], lw }], 0.25);
    case "⌋": return make([{ t: "p", pts: [[0.16, top], [0.16, bottom], [0.02, bottom]], lw }], 0.25);
    case "⌈": return make([{ t: "p", pts: [[0.2, top], [0.06, top], [0.06, bottom]], lw }], 0.25);
    case "⌉": return make([{ t: "p", pts: [[0.02, top], [0.16, top], [0.16, bottom]], lw }], 0.25);
    case "/": return make([{ t: "l", x1: 0.02, y1: bottom, x2: 0.22, y2: top, lw }], 0.25);
    case "\\": return make([{ t: "l", x1: 0.02, y1: top, x2: 0.22, y2: bottom, lw }], 0.25);
    default: return glyphs(char, ctx, "rm", "ord", scale);
  }
}

/* ---------------------------------------------------------------- tree → boxes */

const SPACE_TEXT: Record<string, number> = { "\\ ": 0.25, "\\space": 0.25, "\\nobreakspace": 0.25, " ": 0.25, "~": 0.25, "\\!": -THIN, "\\,": THIN, "\\thinspace": THIN, "\\:": MED, "\\medspace": MED, "\\;": THICK, "\\thickspace": THICK, "\\enspace": 0.5, "\\quad": 1, "\\qquad": 2, "\\negthinspace": -THIN };
const MU: Record<string, number> = { em: 1, mu: 1 / 18, ex: XHEIGHT, pt: 0.1, mm: 0.2845, cm: 2.845, bp: 0.1, pc: 1.2, in: 7.227, sp: 0, dd: 0.1, cc: 1.2, nd: 0.1, nc: 1.2 };

const FONT_FOR: Record<string, FontId> = { mathbf: "bf", mathrm: "rm", mathit: "it", mathsf: "ss", mathtt: "tt", mathbb: "bf", mathcal: "it", mathfrak: "rm", mathscr: "it", boldsymbol: "bi", bm: "bi", textbf: "bf", textrm: "rm", textit: "it", textsf: "ss", texttt: "tt", textnormal: "rm", mathnormal: "it", mathbfit: "bi" };

type Node = any;

function build(node: Node, ctx: Ctx): MBox {
  if (!node) return blank();
  const scale = SCALE[ctx.style.size];
  switch (node.type) {
    case "ordgroup": return nodesToBox(node.body || [], ctx);
    case "mathord": case "textord": case "atom": case "op-token": case "accent-token": return symbolBox(node, ctx);
    case "spacing": return blank((SPACE_TEXT[node.text] ?? 0.25) * scale);
    case "kern": {
      const dim = node.dimension || {};
      return blank((Number(dim.number) || 0) * (MU[dim.unit] ?? 0.1) * scale);
    }
    case "color": case "color-token": case "href": case "cancel": case "enclose": case "tag": case "raw": case "html": case "htmlmathml": {
      if (node.type === "htmlmathml") {
        const alt: Node[] = (node.mathml || []).flatMap((entry: Node) => (entry.type === "mclass" ? entry.body || [] : [entry]));
        if (alt.length === 1 && alt[0].text === "\u0338") return Object.assign(blank(), { slash: true });
        if (alt.length === 1 && typeof alt[0].text === "string" && alt[0].text.length === 1 && alt[0].text !== "\u0338") return { ...build(alt[0], ctx), cls: "rel" };
        return nodesToBox(node.html || [], ctx);
      }
      if (node.type === "enclose" && /cancel/.test(String(node.label))) {
        const inner = nodesToBox(node.body ? [node.body] : [], ctx);
        return { ...inner, ops: [...inner.ops, { t: "l", x1: 0, y1: -inner.d, x2: inner.w, y2: inner.h, lw: 0.03 * scale }] };
      }
      return node.body ? (Array.isArray(node.body) ? nodesToBox(node.body, ctx) : build(node.body, ctx)) : blank();
    }
    case "styling": {
      const next: Style = node.style === "display" ? D : node.style === "script" ? S : node.style === "scriptscript" ? SS : T;
      return nodesToBox(node.body || [], { ...ctx, style: next });
    }
    case "sizing": case "phantom": case "hphantom": case "vphantom": case "smash": case "lap": case "rlap": case "llap": case "mathchoice": case "verb": {
      if (node.type === "phantom" || node.type === "hphantom") { const inner = nodesToBox(node.body || [], ctx); return { ...inner, ops: [] }; }
      if (node.type === "vphantom") { const inner = nodesToBox(node.body || [], ctx); return { ...inner, w: 0, ops: [] }; }
      if (node.type === "smash") { const inner = build(node.body, ctx); return { ...inner, h: 0, d: 0 }; }
      return node.body ? (Array.isArray(node.body) ? nodesToBox(node.body, ctx) : build(node.body, ctx)) : blank();
    }
    case "font": {
      const key = String(node.font || "").replace(/^\\/, "");
      const font = FONT_FOR[key];
      return build(node.body, font ? { ...ctx, font } : ctx);
    }
    case "text": {
      const key = String(node.font || "").replace(/^\\/, "");
      const font = FONT_FOR[key] || "rm";
      const inner = nodesToBox(node.body || [], { ...ctx, font, mode: "text" });
      return { ...inner, cls: "ord" };
    }
    case "mclass": {
      const inner = nodesToBox(node.body || [], ctx);
      const cls = String(node.mclass || "").replace(/^m/, "") as Cls;
      return { ...inner, cls: (["ord", "op", "bin", "rel", "open", "close", "punct", "inner"] as Cls[]).includes(cls) ? cls : inner.cls };
    }
    case "operatorname": {
      const inner = nodesToBox(node.body || [], { ...ctx, font: "rm" });
      return { ...inner, cls: "op", italic: 0 };
    }
    case "supsub": return supsub(node, ctx);
    case "genfrac": return genfrac(node, ctx);
    case "sqrt": return sqrt(node, ctx);
    case "accent": return accent(node, ctx);
    case "accentUnder": {
      const base = build(node.base, ctx);
      return { ...base, d: base.d + 0.12 * scale, ops: [...base.ops, { t: "l", x1: 0, y1: -base.d - 0.08 * scale, x2: base.w, y2: -base.d - 0.08 * scale, lw: RULE * scale }] };
    }
    case "overline": {
      const body = build(node.body, ctx);
      const y = body.h + 3 * RULE * scale;
      return { ...body, h: y + RULE * scale, ops: [...body.ops, { t: "r", x: 0, y, w: body.w, h: RULE * scale }] };
    }
    case "underline": {
      const body = build(node.body, ctx);
      const y = -body.d - 3 * RULE * scale - RULE * scale;
      return { ...body, d: -y, ops: [...body.ops, { t: "r", x: 0, y, w: body.w, h: RULE * scale }] };
    }
    case "op": return opBox(node, ctx, null, null);
    case "leftright": return leftright(node, ctx);
    case "middle": return delimiter(String(node.delim || ""), 0.75, 0.25, ctx, scale);
    case "delimsizing": return delimiter(String(node.delim || ""), (Number(String(node.size)) || 1) * 0.6 + 0.4, (Number(String(node.size)) || 1) * 0.6 + 0.4 - 0.5, ctx, scale);
    case "array": return array(node, ctx);
    case "horizBrace": {
      const base = build(node.base, ctx);
      const over = !node.isOver === false;
      const y = over ? base.h + 0.12 * scale : -base.d - 0.12 * scale;
      return { ...base, h: over ? base.h + 0.3 * scale : base.h, d: over ? base.d : base.d + 0.3 * scale, ops: [...base.ops, { t: "p", pts: [[0, y], [0, y + (over ? 0.1 : -0.1) * scale], [base.w, y + (over ? 0.1 : -0.1) * scale], [base.w, y]], lw: 0.03 * scale }] };
    }
    case "xArrow": {
      const top = node.body ? build(node.body, { ...ctx, style: sup(ctx.style) }) : blank();
      const bottom = node.below ? build(node.below, { ...ctx, style: sup(ctx.style) }) : blank();
      const w = Math.max(top.w, bottom.w) + 0.9 * scale;
      const y = AXIS * scale;
      const ops: Op[] = [{ t: "l", x1: 0, y1: y, x2: w, y2: y, lw: 0.04 * scale }, { t: "p", pts: [[w - 0.15 * scale, y + 0.09 * scale], [w, y], [w - 0.15 * scale, y - 0.09 * scale]], lw: 0.04 * scale }, ...move(top, (w - top.w) / 2, y + 0.12 * scale + top.d), ...move(bottom, (w - bottom.w) / 2, y - 0.12 * scale - bottom.h)];
      return { w, h: y + 0.12 * scale + top.d + top.h, d: Math.max(0, bottom.h + bottom.d + 0.12 * scale - y), ops, cls: "rel" };
    }
    case "pmb": case "includegraphics": case "internal": return blank();
    default: {
      if (Array.isArray(node.body)) return nodesToBox(node.body, ctx);
      if (node.body && typeof node.body === "object") return build(node.body, ctx);
      return blank();
    }
  }
}

function nodesToBox(nodes: Node[], ctx: Ctx): MBox {
  const boxes: MBox[] = [];
  let slash = false;
  for (const child of nodes) {
    const box = build(child, ctx);
    if ((box as MBox & { slash?: boolean }).slash) { slash = true; continue; }
    if (slash) {
      // `\not\in`: KaTeX writes the slash as a combining mark in front of the symbol it strikes.
      box.ops = [...box.ops, { t: "l", x1: box.w * 0.2, y1: -0.1, x2: box.w * 0.8, y2: 0.7, lw: 0.04 }];
      slash = false;
    }
    boxes.push(box);
  }
  return hlist(boxes, ctx.style, ctx.mode === "math");
}

function symbolBox(node: Node, ctx: Ctx): MBox {
  const scale = SCALE[ctx.style.size];
  let text = String(node.text ?? "");
  const mathMode = node.mode === "math" && ctx.mode === "math";
  if (text.startsWith("\\")) {
    const entry = (mathMode ? MATH_SYMBOLS : TEXT_SYMBOLS)[text] || MATH_SYMBOLS[text] || TEXT_SYMBOLS[text];
    if (entry) text = entry[0];
  }
  let cls: Cls = "ord";
  if (node.type === "atom") cls = ({ bin: "bin", rel: "rel", open: "open", close: "close", punct: "punct", inner: "inner" } as Record<string, Cls>)[node.family] || "ord";
  if (mathMode) {
    if (text === "-") text = "−";
    else if (text === "*") text = "∗";
    else if (text === "'") text = "′";
    else if (text === "\\prime") text = "′";
    else if (text === "|") cls = "ord";
    else if (text === ",") cls = "punct";
  }
  const isLetter = /^[A-Za-z]$/.test(text);
  const isGreek = /^[Ͱ-Ͽ]$/.test(text);
  let font: FontId = ctx.font || "rm";
  if (!ctx.font) {
    if (mathMode && node.type === "mathord" && (isLetter || isGreek)) font = isGreek ? "sy" : "it";
    else if (isGreek) font = "sy";
    else font = "rm";
  } else if (isGreek) font = "sy";
  if (ctx.mode === "math" && ctx.font === "bf" && DOUBLE_STRUCK[text]) text = DOUBLE_STRUCK[text];
  if (ctx.mode === "math" && DOUBLE_STRUCK[text] && !ctx.font) font = "bf";
  const box = glyphs(text, ctx, font, cls, scale);
  if (font === "it" && isLetter) box.italic = 0.05 * scale;
  return box;
}

function supsub(node: Node, ctx: Ctx): MBox {
  const base = node.base;
  if (base && base.type === "op") return opBox(base, ctx, node.sup, node.sub);
  if (base && base.type === "operatorname" && (base.alwaysHandleSupSub || base.limits) && ctx.style.size === 0) return opBox(base, ctx, node.sup, node.sub);
  const baseBox = build(base, ctx);
  return withScripts(baseBox, node.sup, node.sub, ctx);
}

function withScripts(baseBox: MBox, supNode: Node, subNode: Node, ctx: Ctx): MBox {
  const scale = SCALE[ctx.style.size];
  const sstyle = sup(ctx.style);
  const supBox = supNode ? build(supNode, { ...ctx, style: sstyle }) : null;
  const subBox = subNode ? build(subNode, { ...ctx, style: sstyle }) : null;
  const s = SCALE[sstyle.size];
  const isChar = Boolean(baseBox.isChar);
  const supDrop = 0.386 * s;
  const subDrop = 0.05 * s;
  let u = isChar ? 0 : baseBox.h - supDrop;
  let v = isChar ? 0 : baseBox.d + subDrop;
  const supMin = (ctx.style.size === 0 ? 0.413 : ctx.style.cramped ? 0.289 : 0.363) * scale;
  const ops: Op[] = [...baseBox.ops];
  const italic = baseBox.italic || 0;
  const gapX = 0.03 * scale;
  let h = baseBox.h;
  let d = baseBox.d;
  let w = baseBox.w;
  if (supBox && !subBox) {
    u = Math.max(u, supMin, supBox.d + 0.25 * XHEIGHT * scale);
    ops.push(...move(supBox, baseBox.w + italic + gapX, u));
    h = Math.max(h, u + supBox.h);
    w = baseBox.w + italic + gapX + supBox.w + 0.03 * scale;
  } else if (subBox && !supBox) {
    v = Math.max(v, 0.15 * scale, subBox.h - 0.8 * XHEIGHT * scale);
    ops.push(...move(subBox, baseBox.w + gapX, -v));
    d = Math.max(d, v + subBox.d);
    w = baseBox.w + gapX + subBox.w + 0.03 * scale;
  } else if (supBox && subBox) {
    u = Math.max(u, supMin, supBox.d + 0.25 * XHEIGHT * scale);
    v = Math.max(v, 0.247 * scale);
    const clearance = 4 * RULE * scale;
    if (u - supBox.d - (subBox.h - v) < clearance) {
      v = clearance - (u - supBox.d) + subBox.h;
      const psi = 0.8 * XHEIGHT * scale - (u - supBox.d);
      if (psi > 0) { u += psi; v -= psi; }
    }
    ops.push(...move(supBox, baseBox.w + italic + gapX, u), ...move(subBox, baseBox.w + gapX, -v));
    h = Math.max(h, u + supBox.h);
    d = Math.max(d, v + subBox.d);
    w = baseBox.w + gapX + Math.max(supBox.w + italic, subBox.w) + 0.03 * scale;
  }
  return { w, h, d, ops, cls: baseBox.cls };
}

/** Big operators: sums, products, integrals, limits and named functions (sin, lim, …). */
function opBox(node: Node, ctx: Ctx, supNode: Node, subNode: Node): MBox {
  const scale = SCALE[ctx.style.size];
  const display = ctx.style.size === 0;
  let core: MBox;
  let isSymbol = false;
  if (node.type === "operatorname") {
    core = { ...nodesToBox(node.body || [], { ...ctx, font: "rm" }), cls: "op" };
  } else if (node.symbol) {
    isSymbol = true;
    const raw = String(node.name || "");
    const char = ({ "\\sum": "∑", "\\prod": "∏", "\\int": "∫", "\\iint": "∫∫", "\\iiint": "∫∫∫", "\\oint": "∫", "\\coprod": "∏", "\\bigcup": "∪", "\\bigcap": "∩", "\\bigvee": "∨", "\\bigwedge": "∧", "\\bigoplus": "⊕", "\\bigotimes": "⊗", "\\smallint": "∫" } as Record<string, string>)[raw] || raw.replace(/^\\/, "") || "∑";
    const factor = display ? 1.55 : 1.0;
    const font: FontId = "sy";
    const ext = charExtent(font, char[0]);
    const g = glyphs(char, ctx, font, "op", scale * factor);
    const midGlyph = (ext.h - ext.d) / 2 * scale * factor;
    const shift = AXIS * scale - midGlyph;
    core = { w: g.w, h: ext.h * scale * factor + shift, d: Math.max(0, ext.d * scale * factor - shift), ops: move(g, 0, shift), cls: "op" };
  } else {
    const name = String(node.name || "").replace(/^\\/, "");
    core = { ...glyphs(name, ctx, "rm", "op", scale), cls: "op" };
  }
  const limitsMode = Boolean(node.limits) && (display || node.alwaysHandleSupSub);
  const supBox = supNode ? build(supNode, { ...ctx, style: sup(ctx.style) }) : null;
  const subBox = subNode ? build(subNode, { ...ctx, style: sup(ctx.style) }) : null;
  if (!supBox && !subBox) return { ...core, w: core.w + (isSymbol ? 0.06 * scale : 0.03 * scale), cls: "op" };
  if (!limitsMode) {
    // Scripts beside the symbol (inline sums, every integral).
    const s = withScripts({ ...core, isChar: false }, supNode, subNode, ctx);
    return { ...s, cls: "op" };
  }
  // Limits above and below, centred on the symbol.
  const w = Math.max(core.w, supBox?.w || 0, subBox?.w || 0);
  const gap = 0.11 * scale;
  const ops: Op[] = move(core, (w - core.w) / 2, 0);
  let h = core.h;
  let d = core.d;
  if (supBox) { const y = core.h + gap + supBox.d; ops.push(...move(supBox, (w - supBox.w) / 2, y)); h = y + supBox.h; }
  if (subBox) { const y = -(core.d + gap + subBox.h); ops.push(...move(subBox, (w - subBox.w) / 2, y)); d = -y + subBox.d; }
  return { w, h, d, ops, cls: "op" };
}

function genfrac(node: Node, ctx: Ctx): MBox {
  const outer = node.size === "display" ? D : node.size === "text" ? T : node.size === "script" ? S : ctx.style;
  const style = { ...ctx.style, size: outer.size };
  const scale = SCALE[style.size];
  const inner = fracStyle(style);
  const num = build(node.numer, { ...ctx, style: inner });
  const den = build(node.denom, { ...ctx, style: inner });
  const display = style.size === 0;
  const hasBar = node.hasBarLine !== false;
  const t = RULE * scale;
  let u = (display ? 0.677 : 0.394) * scale;
  let v = (display ? 0.686 : 0.345) * scale;
  const axis = AXIS * scale;
  if (hasBar) {
    const clearance = (display ? 3 : 1) * t;
    if (u - num.d - (axis + t / 2) < clearance) u = clearance + axis + t / 2 + num.d;
    if (axis - t / 2 - (den.h - v) < clearance) v = clearance + den.h - axis + t / 2;
  } else {
    const clearance = (display ? 7 : 3) * t;
    const gap = u - num.d - (den.h - v);
    if (gap < clearance) { const extra = (clearance - gap) / 2; u += extra; v += extra; }
  }
  const pad = 0.1 * scale;
  const w = Math.max(num.w, den.w) + pad * 2;
  const ops: Op[] = [...move(num, (w - num.w) / 2, u), ...move(den, (w - den.w) / 2, -v)];
  if (hasBar) ops.push({ t: "r", x: pad * 0.4, y: axis - t / 2, w: w - pad * 0.8, h: t });
  const frac: MBox = { w, h: u + num.h, d: v + den.d, ops, cls: "ord" };
  if (node.leftDelim || node.rightDelim) {
    const height = Math.max(frac.h, axis + 0.5 * scale);
    const depth = Math.max(frac.d, 0.5 * scale - axis);
    const left = delimiter(String(node.leftDelim || ""), height, depth, ctx, scale);
    const right = delimiter(String(node.rightDelim || ""), height, depth, ctx, scale);
    return hlist([left, frac, right], ctx.style, false);
  }
  return frac;
}

function sqrt(node: Node, ctx: Ctx): MBox {
  const scale = SCALE[ctx.style.size];
  const body = nodesToBox(node.body ? [node.body] : [], { ...ctx, style: { ...ctx.style, cramped: true } });
  const t = RULE * scale;
  const gap = (ctx.style.size === 0 ? 0.14 : 0.1) * scale;
  const top = body.h + gap + t;
  const bottom = body.d;
  const total = top + bottom;
  const rw = (0.5 + Math.min(0.25, total * 0.1)) * scale;
  const yRule = top - t / 2;
  const lw = 0.045 * scale;
  const ops: Op[] = [
    { t: "p", pts: [[0.02 * scale, -bottom + total * 0.52], [0.13 * scale + rw * 0.1, -bottom + total * 0.58], [rw * 0.56, -bottom], [rw, yRule], [rw + body.w + 0.08 * scale, yRule]], lw },
    ...move(body, rw + 0.03 * scale, 0)
  ];
  let w = rw + 0.03 * scale + body.w + 0.08 * scale;
  if (node.index) {
    const index = build(node.index, { ...ctx, style: SS });
    ops.push(...move(index, 0.08 * scale, -bottom + total * 0.62));
    const shift = Math.max(0, index.w - 0.2 * scale);
    const shifted = ops.map((op): Op => op.t === "g" ? { ...op, x: op.x + shift } : op.t === "r" ? { ...op, x: op.x + shift } : op.t === "l" ? { ...op, x1: op.x1 + shift, x2: op.x2 + shift } : { ...op, pts: op.pts.map(([x, y]) => [x + shift, y]) });
    w += shift;
    return { w, h: top, d: bottom, ops: shifted, cls: "ord" };
  }
  return { w, h: top, d: bottom, ops, cls: "ord" };
}

function accent(node: Node, ctx: Ctx): MBox {
  const scale = SCALE[ctx.style.size];
  const base = build(node.base, ctx);
  const label = String(node.label || "");
  const lw = 0.04 * scale;
  const gap = 0.07 * scale;
  const y = Math.max(base.h, XHEIGHT * scale) + gap;
  const stretchy = !base.isChar && /widehat|widetilde|overline|overrightarrow|overleftarrow|widecheck/.test(label);
  const span = stretchy || !base.isChar ? base.w : Math.min(base.w, 0.5 * scale);
  const cx = base.w / 2 + (base.isChar ? 0.04 * scale : 0);
  const x0 = Math.max(0, cx - span / 2);
  const ops: Op[] = [...base.ops];
  let top = y;
  switch (label) {
    case "\\bar": case "\\overline": case "\\=":
      ops.push({ t: "l", x1: x0, y1: y, x2: x0 + span, y2: y, lw }); top = y + lw; break;
    case "\\hat": case "\\widehat": case "\\check": case "\\widecheck": case "\\^": {
      const hw = Math.max(0.12 * scale, span / 2);
      const flip = label.includes("check");
      ops.push({ t: "p", pts: [[cx - hw, y], [cx, y + (flip ? -1 : 1) * 0.12 * scale], [cx + hw, y]].map(([x, yy]) => [x, flip ? yy + 0.12 * scale : yy]), lw }); top = y + 0.13 * scale; break;
    }
    case "\\tilde": case "\\widetilde": case "\\~": {
      const hw = Math.max(0.14 * scale, span / 2);
      ops.push({ t: "p", pts: [[cx - hw, y], [cx - hw / 2, y + 0.07 * scale], [cx, y + 0.02 * scale], [cx + hw / 2, y + 0.09 * scale], [cx + hw, y + 0.04 * scale]], lw }); top = y + 0.1 * scale; break;
    }
    case "\\vec": case "\\overrightarrow": case "\\Overrightarrow": {
      ops.push({ t: "l", x1: x0, y1: y + 0.04 * scale, x2: x0 + span, y2: y + 0.04 * scale, lw }, { t: "p", pts: [[x0 + span - 0.07 * scale, y + 0.09 * scale], [x0 + span, y + 0.04 * scale], [x0 + span - 0.07 * scale, y - 0.01 * scale]], lw }); top = y + 0.1 * scale; break;
    }
    case "\\overleftarrow": {
      ops.push({ t: "l", x1: x0, y1: y + 0.04 * scale, x2: x0 + span, y2: y + 0.04 * scale, lw }, { t: "p", pts: [[x0 + 0.07 * scale, y + 0.09 * scale], [x0, y + 0.04 * scale], [x0 + 0.07 * scale, y - 0.01 * scale]], lw }); top = y + 0.1 * scale; break;
    }
    case "\\dot": ops.push({ t: "r", x: cx - 0.03 * scale, y: y + 0.02 * scale, w: 0.06 * scale, h: 0.06 * scale }); top = y + 0.09 * scale; break;
    case "\\ddot": ops.push({ t: "r", x: cx - 0.1 * scale, y: y + 0.02 * scale, w: 0.06 * scale, h: 0.06 * scale }, { t: "r", x: cx + 0.04 * scale, y: y + 0.02 * scale, w: 0.06 * scale, h: 0.06 * scale }); top = y + 0.09 * scale; break;
    case "\\acute": ops.push({ t: "l", x1: cx - 0.03 * scale, y1: y, x2: cx + 0.07 * scale, y2: y + 0.11 * scale, lw }); top = y + 0.12 * scale; break;
    case "\\grave": ops.push({ t: "l", x1: cx + 0.03 * scale, y1: y, x2: cx - 0.07 * scale, y2: y + 0.11 * scale, lw }); top = y + 0.12 * scale; break;
    case "\\breve": ops.push({ t: "p", pts: arc(cx, y + 0.1 * scale, 0.09 * scale, 0.09 * scale, Math.PI * 1.15, Math.PI * 1.85, 6), lw }); top = y + 0.1 * scale; break;
    default:
      ops.push({ t: "l", x1: x0, y1: y, x2: x0 + span, y2: y, lw }); top = y + lw;
  }
  return { w: base.w, h: Math.max(base.h, top), d: base.d, ops, cls: base.cls, isChar: base.isChar };
}

function leftright(node: Node, ctx: Ctx): MBox {
  const scale = SCALE[ctx.style.size];
  const body = nodesToBox(node.body || [], ctx);
  const axis = AXIS * scale;
  // TeX: the delimiter covers the content symmetrically about the axis, at least 90 % of it.
  const half = Math.max(body.h - axis, body.d + axis, 0.5 * scale);
  const height = axis + half * 1.04;
  const depth = half * 1.04 - axis;
  const left = delimiter(String(node.left || "."), height, depth, ctx, scale);
  const right = delimiter(String(node.right || "."), height, depth, ctx, scale);
  const out = hlist([left, body, right], ctx.style, false);
  out.cls = "inner";
  return out;
}

function array(node: Node, ctx: Ctx): MBox {
  const scale = SCALE[ctx.style.size];
  const cellStyle: Style = node.arraystretch !== undefined && ctx.style.size === 0 ? D : (node.style === "display" ? D : T);
  const rows: MBox[][] = (node.body || []).map((row: Node[]) => row.map((cell: Node) => {
    const content = cell && cell.type === "styling" ? build(cell, { ...ctx, style: cellStyle }) : build(cell, { ...ctx, style: cellStyle });
    return content;
  }));
  const columnCount = Math.max(0, ...rows.map((row) => row.length));
  const aligns: string[] = [];
  const specs: Node[] = (node.cols || []).filter((spec: Node) => spec?.type === "align");
  for (let c = 0; c < columnCount; c += 1) aligns.push(String(specs[c]?.align || (node.cols ? "c" : "c")));
  const widths = Array.from({ length: columnCount }, (_, c) => Math.max(0, ...rows.map((row) => row[c]?.w || 0)));
  const colSep = (node.colSeparationType === "align" || node.colSeparationType === "alignat" ? 0 : 0.5) * scale;
  const rowGap = 0.22 * scale;
  const strutH = 0.7 * scale * (Number(node.arraystretch) || 1);
  const strutD = 0.3 * scale * (Number(node.arraystretch) || 1);
  const heights = rows.map((row) => Math.max(strutH, ...row.map((cell) => cell.h)));
  const depths = rows.map((row) => Math.max(strutD, ...row.map((cell) => cell.d)));
  const ops: Op[] = [];
  let y = 0;
  const baselines: number[] = [];
  rows.forEach((_, index) => {
    if (index === 0) y = 0; else y -= depths[index - 1] + rowGap + heights[index];
    baselines.push(y);
  });
  const totalH = heights[0] ?? 0;
  const totalD = rows.length ? -baselines[rows.length - 1] + depths[rows.length - 1] : 0;
  const mid = (totalH + totalD) / 2;
  const shift = AXIS * scale - (totalH - mid); // centre the grid on the math axis
  let x = 0;
  for (let c = 0; c < columnCount; c += 1) {
    if (c > 0) x += colSep * (node.colSeparationType === "align" && c % 2 === 0 ? 2 : 1) * 1;
    rows.forEach((row, r) => {
      const cell = row[c];
      if (!cell) return;
      const align = aligns[c] || "c";
      const dx = align === "r" ? widths[c] - cell.w : align === "l" ? 0 : (widths[c] - cell.w) / 2;
      ops.push(...move(cell, x + dx, baselines[r] + shift));
    });
    x += widths[c] + (c < columnCount - 1 ? colSep : 0);
  }
  return { w: x, h: totalH + shift, d: totalD - shift, ops, cls: "ord" };
}

/* ---------------------------------------------------------------- public API */

const parseSettings = (display: boolean) => ({ displayMode: display, throwOnError: true, strict: "ignore" as const, trust: false, output: "html" as const });

/** Parse tree of a formula, or null when KaTeX cannot read it. */
export function parseMath(tex: string, display = false): Node[] | null {
  try {
    return (katex as unknown as { __parse(expression: string, settings: unknown): Node[] }).__parse(String(tex || ""), parseSettings(display));
  } catch {
    return null;
  }
}

/** Typesets `tex` into a box (em units at font size 1); null when the formula does not parse. */
export function typesetMath(tex: string, options: { display?: boolean; env?: MathEnv } = {}): MBox | null {
  const tree = parseMath(tex, Boolean(options.display));
  if (!tree) return null;
  const ctx: Ctx = { env: options.env || APPROX_ENV, style: options.display ? D : T, mode: "math" };
  try {
    return nodesToBox(tree, ctx);
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------- shared estimates for the layout engine */

const cache = new Map<string, { w: number; h: number; d: number } | null>();

/** Estimated size of a formula in em at font size 1: width, height above the baseline, depth below. */
export function estimateMath(tex: string, display = false): { w: number; h: number; d: number } | null {
  const key = `${display ? "D" : "T"}|${tex}`;
  if (cache.has(key)) return cache.get(key) || null;
  const box = typesetMath(tex, { display });
  const out = box ? { w: box.w, h: box.h, d: box.d } : null;
  if (cache.size > 2000) cache.clear();
  cache.set(key, out);
  return out;
}

/**
 * The vertical extent KaTeX's HTML will take, in em of the formula's own font, read from the strut
 * KaTeX puts in every formula. This is what the browser really needs, so the layout reserves it.
 */
export function katexExtent(tex: string, display = false): { h: number; d: number } | null {
  try {
    const html = katex.renderToString(String(tex || ""), { displayMode: display, throwOnError: true, strict: "ignore", output: "html" });
    let h = 0;
    let d = 0;
    for (const match of html.matchAll(/class="(?:katex-)?strut" style="height:([\d.]+)em;(?:vertical-align:(-?[\d.]+)em;)?/g)) {
      const height = Number(match[1]) || 0;
      const align = Number(match[2]) || 0;
      // `height` is the whole strut; `vertical-align` (negative) is how far it hangs below the baseline.
      d = Math.max(d, -align);
      h = Math.max(h, height + align);
    }
    return h || d ? { h, d } : null;
  } catch {
    return null;
  }
}
