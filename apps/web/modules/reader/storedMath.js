import katex from "katex";

/**
 * Maths already typeset in a stored document whose LaTeX was escaped twice: `\\bar{x}` is a valid KaTeX line break
 * followed by the word "bar", so the reader showed "barx". Such a formula keeps its source in `data-latex`; here it
 * is typeset again from the corrected source. Formulas without a doubled backslash are left exactly as stored.
 */
const DOUBLED = /\\{2,}(?=[a-zA-Z])/;

/** The formula with each run of backslashes before a command (`\\bar`, `\\\bar`) made single, when KaTeX accepts the result; else unchanged. */
export function repairDoubledLatex(latex = "", display = false) {
  const text = String(latex || "");
  if (!DOUBLED.test(text)) return text;
  const fixed = text.replace(/\\{2,}(?=[a-zA-Z])/g, "\\");
  try {
    katex.renderToString(fixed, { displayMode: display, throwOnError: true, strict: "ignore", output: "html" });
    return fixed;
  } catch {
    return text;
  }
}

function decode(value = "") {
  return String(value).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function encode(value = "") {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Index just past the element that opens at `start` (a `<span` or `<div`), counting nested tags of the same name. */
function endOfElement(html, start, tag) {
  const pattern = new RegExp(`<${tag}\\b[^>]*>|</${tag}\\s*>`, "gi");
  pattern.lastIndex = start;
  let depth = 0;
  for (let match = pattern.exec(html); match; match = pattern.exec(html)) {
    depth += match[0][1] === "/" ? -1 : 1;
    if (depth === 0) return match.index + match[0].length;
  }
  return -1;
}

export function repairStoredMath(html = "") {
  const source = String(html || "");
  if (!source.includes("nicer-latex")) return source;
  const opening = /<(span|div)\b[^>]*class="[^"]*nicer-latex[^"]*"[^>]*data-latex="([^"]*)"[^>]*>/gi;
  let out = "";
  let cursor = 0;
  for (let match = opening.exec(source); match; match = opening.exec(source)) {
    const latex = decode(match[2]);
    if (!DOUBLED.test(latex)) continue;
    const end = endOfElement(source, match.index, match[1]);
    if (end < 0) continue;
    const display = match[1].toLowerCase() === "div";
    const fixed = repairDoubledLatex(latex, display);
    if (fixed === latex) continue;
    let typeset;
    try {
      typeset = katex.renderToString(fixed, { displayMode: display, throwOnError: true, strict: "ignore", output: "html" });
    } catch {
      continue;
    }
    out += source.slice(cursor, match.index) + `<${match[1]} class="${display ? "math-display" : "math-inline"} nicer-latex" data-latex="${encode(fixed)}">${typeset}</${match[1]}>`;
    cursor = end;
    opening.lastIndex = end;
  }
  return out + source.slice(cursor);
}
