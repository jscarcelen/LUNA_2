import katex from "katex";
import { KATEX_FACES, KATEX_RULES } from "./katexAssets.generated.js";

/**
 * Typeset maths for HTML documents.
 *
 * A formula is rendered by KaTeX into HTML (no MathML copy: smaller). The stylesheet — KaTeX's rules
 * plus only the fonts the document actually uses, inlined as base64 — travels with the document, so
 * an exported .html file renders its formulas offline and the preview iframe needs no network.
 */

const escapeHtml = (value = "") => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const cache = new Map();

/** KaTeX HTML for a formula, or null when it does not parse (the caller shows the source instead). */
export function katexHtml(tex, display = false) {
  const key = `${display ? "D" : "T"}|${tex}`;
  if (cache.has(key)) return cache.get(key);
  let html = null;
  try {
    html = katex.renderToString(String(tex || ""), { displayMode: Boolean(display), throwOnError: true, strict: "ignore", trust: false, output: "html" });
  } catch {
    html = null;
  }
  if (cache.size > 3000) cache.clear();
  cache.set(key, html);
  return html;
}

/** One formula as it appears in a line: typeset, or — when KaTeX cannot read it — its source in a code span. */
export function mathSpanHtml(seg) {
  const html = katexHtml(seg.tex, seg.display);
  const inner = html || `<code class="lm-raw">${escapeHtml(seg.display ? `$$${seg.tex}$$` : `$${seg.tex}$`)}</code>`;
  return seg.shrink && seg.shrink < 1 ? `<span style="font-size:${seg.shrink.toFixed(3)}em">${inner}</span>` : inner;
}

/** Which KaTeX fonts a piece of KaTeX HTML needs. */
const FONT_TRIGGERS = [
  ["KaTeX_Main-Regular", /./],
  ["KaTeX_Math-Italic", /./],
  ["KaTeX_Main-Bold", /mathbf|textbf|boldsymbol|bold/],
  ["KaTeX_Main-Italic", /mathit|textit|mainit|\bit\b/],
  ["KaTeX_Main-BoldItalic", /boldsymbol|mathbfit/],
  ["KaTeX_Math-BoldItalic", /boldsymbol|mathbfit/],
  ["KaTeX_AMS-Regular", /amsrm/],
  ["KaTeX_Size1-Regular", /size1|small-op/],
  ["KaTeX_Size2-Regular", /size2|large-op/],
  ["KaTeX_Size3-Regular", /size3/],
  ["KaTeX_Size4-Regular", /size4/],
  ["KaTeX_Caligraphic-Regular", /mathcal|mathscr/],
  ["KaTeX_SansSerif-Regular", /mathsf|textsf/],
  ["KaTeX_Typewriter-Regular", /mathtt|texttt/]
];

/** Class names KaTeX uses, to decide which fonts to embed. */
const classesOf = (html) => [...new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap((match) => match[1].split(/\s+/)))].join(" ");

export const MATH_OVERRIDES = ".katex{font-size:1.1em;white-space:normal;line-height:1.2}.katex-display{margin:0;text-align:center;display:block}.katex-display>.katex{display:block;white-space:normal;text-align:center}.lm{display:block;white-space:pre-wrap;overflow-wrap:anywhere}.lm-d{text-align:center}.lm-raw{font-family:'SF Mono',Menlo,Consolas,monospace;font-size:.9em}";

/**
 * The `<style>` to put in front of a document whose HTML contains KaTeX output (empty when it has
 * none): KaTeX's rules, the fonts that HTML needs, and Luna's overrides.
 */
export function mathStyleTag(html) {
  if (!html || !html.includes('class="katex')) return "";
  const used = classesOf(html);
  const faces = FONT_TRIGGERS.filter(([file, pattern]) => KATEX_FACES[file] && pattern.test(used)).map(([file]) => KATEX_FACES[file]);
  return `<style data-luna-katex>${faces.join("")}${KATEX_RULES}${MATH_OVERRIDES}</style>`;
}
