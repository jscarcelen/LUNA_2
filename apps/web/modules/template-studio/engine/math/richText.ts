/**
 * Text that carries maths and links.
 *
 * Generated text is plain strings with `$…$` (inline), `$$…$$` (display), `\(…\)`, `\[…\]` and
 * `[label](url)` links. `splitRich` cuts such a string into segments the layout engine measures and
 * the renderers draw: prose stays prose, formulas keep their raw LaTeX (so HTML can typeset them
 * with KaTeX and PDF with the box typesetter), links keep their label and address.
 *
 * A dollar sign is only the start of a formula when what follows really is one: "$40,000 and
 * $5,000" and "costs $5 each" are prices, not maths.
 */
import { latexToUnicode } from "./unicode";

export type RichSeg =
  | { t: "text"; text: string }
  | { t: "math"; tex: string; display: boolean; /** Scale (< 1) that keeps a formula wider than its line inside the margin. */ shrink?: number }
  | { t: "link"; text: string; href: string };

const isSpace = (ch: string | undefined) => ch === undefined || /\s/.test(ch);
const isDigit = (ch: string | undefined) => ch !== undefined && /\d/.test(ch);

/** Words of prose left once commands and \text{…} are removed. */
function proseWords(tex: string): number {
  return (tex.replace(/\\(?:text|textrm|textbf|textit|mbox|mathrm|operatorname)\s*\{[^}]*\}/g, " ").replace(/\\[a-zA-Z]+/g, " ").match(/[A-Za-z]{3,}/g) || []).length;
}

/** Does the text between two dollar signs read as a formula rather than a pair of prices or a sentence? */
export function looksLikeMath(tex: string): boolean {
  const value = tex.trim();
  if (!value) return false;
  if (/^[\d.,\s]+[kKmMbB]?%?$/.test(value) && !/[\\^_{}=+\-*/<>]/.test(value)) return false;
  if (/^\d[\d.,]*\s+[A-Za-z]{2,}/.test(value) && !/[\\^_{}=+*/<>]/.test(value)) return false;
  if (proseWords(value) >= 3) return false;
  return true;
}

/** End index (exclusive) of the inline formula that opens at `start` (just after its `$`), or -1. */
function closingDollar(text: string, start: number): number {
  for (let j = start; j < text.length; j += 1) {
    const ch = text[j];
    if (ch === "\n") return -1;
    if (ch === "\\") { j += 1; continue; }
    if (ch === "$") {
      // The first dollar ends the search: if it cannot close a formula (a space before it, a digit after it) the opening one was a price.
      if (text[j + 1] === "$" || isSpace(text[j - 1]) || isDigit(text[j + 1])) return -1;
      return j;
    }
  }
  return -1;
}

/** `[label](url)` at `start` (a "["): label may hold one level of brackets (`[[D1 p.1]](url)`). */
function linkAt(text: string, start: number): { label: string; href: string; end: number } | null {
  let depth = 0;
  let j = start;
  for (; j < text.length; j += 1) {
    if (text[j] === "\\") { j += 1; continue; }
    if (text[j] === "[") depth += 1;
    else if (text[j] === "]") { depth -= 1; if (depth === 0) break; }
    else if (text[j] === "\n") return null;
  }
  if (depth !== 0 || text[j + 1] !== "(") return null;
  const close = text.indexOf(")", j + 2);
  if (close < 0) return null;
  const href = text.slice(j + 2, close).trim();
  if (!/^(https?:\/\/|\/|mailto:)\S+$/i.test(href)) return null;
  return { label: text.slice(start + 1, j), href, end: close + 1 };
}

/** Cuts a string into prose, formulas and links. Strings with none of them come back as one text segment. */
export function splitRich(input: string): RichSeg[] {
  const text = String(input ?? "");
  if (!text.includes("$") && !text.includes("\\(") && !text.includes("\\[") && !text.includes("](")) return text ? [{ t: "text", text }] : [];
  const out: RichSeg[] = [];
  let buffer = "";
  const flush = () => { if (buffer) { out.push({ t: "text", text: buffer }); buffer = ""; } };
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\") {
      const next = text[i + 1];
      if (next === "$") { buffer += "$"; i += 2; continue; }
      if (next === "(" || next === "[") {
        const close = text.indexOf(next === "(" ? "\\)" : "\\]", i + 2);
        if (close > 0) {
          const tex = text.slice(i + 2, close).trim();
          if (tex) { flush(); out.push({ t: "math", tex, display: next === "[" }); i = close + 2; continue; }
        }
      }
      buffer += ch; i += 1; continue;
    }
    if (ch === "$") {
      if (text[i + 1] === "$") {
        const close = text.indexOf("$$", i + 2);
        if (close > 0 && text.slice(i + 2, close).trim()) { flush(); out.push({ t: "math", tex: text.slice(i + 2, close).trim(), display: true }); i = close + 2; continue; }
        buffer += "$$"; i += 2; continue;
      }
      if (!isSpace(text[i + 1])) {
        const close = closingDollar(text, i + 1);
        if (close > 0) {
          const tex = text.slice(i + 1, close);
          if (looksLikeMath(tex)) { flush(); out.push({ t: "math", tex: tex.trim(), display: false }); i = close + 1; continue; }
        }
      }
      buffer += ch; i += 1; continue;
    }
    if (ch === "[") {
      const link = linkAt(text, i);
      if (link) { flush(); out.push({ t: "link", text: link.label, href: link.href }); i = link.end; continue; }
    }
    buffer += ch; i += 1;
  }
  flush();
  return out;
}

export const hasRich = (segs: RichSeg[]): boolean => segs.some((seg) => seg.t !== "text");
export const hasMathSegment = (segs: RichSeg[]): boolean => segs.some((seg) => seg.t === "math");

/** Readable one-line text of segments: formulas as Unicode, links as their label. */
export function richToPlain(segs: RichSeg[]): string {
  return segs.map((seg) => (seg.t === "math" ? latexToUnicode(seg.tex) : seg.t === "link" ? seg.text : seg.text)).join("");
}

/* ---------------------------------------------------------------- where a long formula may wrap */

const BREAK_BEFORE = /^(?:\\(?:leq?|geq?|neq?|approx|equiv|sim|simeq|propto|pm|mp|times|cdot|div|to|rightarrow|leftarrow|Rightarrow|Leftrightarrow|leftrightarrow|in|subset|subseteq|cup|cap|ll|gg|land|lor|vee|wedge|oplus|otimes|circ|mapsto)(?![a-zA-Z])|[=+\-<>])/;
const BREAK_AFTER = /^(?:\\(?:quad|qquad)(?![a-zA-Z])|[,;])/;

/**
 * Where a formula can be broken over lines without breaking it: at the top level (outside braces,
 * \left…\right and environments), before relations and binary operators and after commas. Returns
 * the formula as consecutive pieces; joined again they are the original.
 */
export function breakMath(tex: string): string[] {
  const pieces: string[] = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  let previousSignificant = "";
  const cut = (at: number) => { if (at > start && tex.slice(start, at).trim()) { pieces.push(tex.slice(start, at)); start = at; } };
  while (i < tex.length) {
    const ch = tex[i];
    if (ch === "\\") {
      const rest = tex.slice(i);
      const name = /^\\([a-zA-Z]+|.)/.exec(rest)?.[1] || "";
      if (name === "begin" || name === "left") depth += 1;
      else if (name === "end" || name === "right") depth = Math.max(0, depth - 1);
      else if (depth === 0 && BREAK_BEFORE.test(rest) && previousSignificant && !/[\\^_({[]$/.test(previousSignificant)) cut(i);
      else if (depth === 0 && BREAK_AFTER.test(rest)) { const m = BREAK_AFTER.exec(rest); if (m) { i += m[0].length; cut(i); previousSignificant = ""; continue; } }
      i += 1 + name.length;
      if (name !== "begin" && name !== "end") previousSignificant = "x";
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      if (BREAK_BEFORE.test(ch) && previousSignificant && !/[\\^_({[=+\-<>]$/.test(previousSignificant) && tex[i - 1] !== "^" && tex[i - 1] !== "_") cut(i);
      else if (/[,;]/.test(ch)) { i += 1; cut(i); previousSignificant = ""; continue; }
    }
    if (!/\s/.test(ch)) previousSignificant = ch;
    i += 1;
  }
  cut(tex.length);
  return pieces.length ? pieces : [tex];
}
