/**
 * Maths embedded in generated text.
 *
 * Agents write formulas the way textbooks do — `$S_x^2 = \frac{1}{n-1}\sum (x_i - \bar{x})^2$`.
 * HTML and PDF typeset them for real (KaTeX / the box typesetter in `math/`); the plain-text
 * fallbacks (DOCX, PPTX, previews, search) get `latexToUnicode`'s readable characters.
 */
import { splitRich } from "./math/richText";
import { latexToUnicode } from "./math/unicode";

export { latexToUnicode };

/** True when the text carries a formula (between dollars or `\( \)` / `\[ \]`) — a price is not one. */
export function hasMath(text: string): boolean {
  return splitRich(String(text || "")).some((seg) => seg.t === "math");
}

/**
 * Converts every maths span embedded in a piece of text to plain Unicode, leaving the prose (and
 * links, and prices) untouched. Text with no maths comes back unchanged, so this is safe to run over
 * everything a template draws.
 */
export function renderMath(text: string): string {
  const value = String(text ?? "");
  if (!value.includes("$") && !value.includes("\\")) return value;
  const segs = splitRich(value);
  const converted = segs.map((seg) => (seg.t === "math" ? latexToUnicode(seg.tex) : seg.t === "link" ? `[${seg.text}](${seg.href})` : seg.text)).join("");
  // A bare formula with no delimiters at all (agents sometimes forget them).
  if (!segs.some((seg) => seg.t === "math") && /\\(frac|sqrt|sum|int|bar|alpha|beta|theta|pi|sigma|le|ge|neq|times|cdot)\b/.test(value)) return latexToUnicode(value);
  return converted;
}
