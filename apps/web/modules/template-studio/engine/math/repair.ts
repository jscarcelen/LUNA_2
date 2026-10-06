/**
 * Making the maths in generated text valid.
 *
 * Models write formulas in many broken ways: `\( … \)` instead of `$ … $`, doubled backslashes
 * (`\\frac`), Unicode inside the dollars (`$S²ₓ = √(…)$`), a formula copied from a PDF as flattened
 * text (`S²ₓ = (1)/(n-1) ∑ᵢ₌₁ⁿ(xᵢ − x̄)²`), a stray dollar sign, a missing brace. This module repairs
 * the common cases deterministically and checks every formula by running KaTeX on it, so what is
 * stored is maths that really renders. A formula that no local fix rescues is reported (for one
 * optional model pass) and, as a last resort, shown as a code span instead of broken markup.
 */
import katex from "katex";
import { splitRich, type RichSeg } from "./richText";

/** Does KaTeX accept the formula? */
export function isValidTex(tex: string, display = false): boolean {
  try {
    katex.renderToString(String(tex || ""), { displayMode: display, throwOnError: true, strict: "ignore", trust: false, output: "html" });
    return true;
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------- Unicode → LaTeX */

const GREEK: Record<string, string> = {
  α: "alpha", β: "beta", γ: "gamma", δ: "delta", ε: "varepsilon", ζ: "zeta", η: "eta", θ: "theta", ϑ: "vartheta", ι: "iota", κ: "kappa", λ: "lambda", μ: "mu", µ: "mu", ν: "nu", ξ: "xi", π: "pi", ρ: "rho", σ: "sigma", ς: "varsigma", τ: "tau", υ: "upsilon", φ: "varphi", ϕ: "phi", χ: "chi", ψ: "psi", ω: "omega",
  Γ: "Gamma", Δ: "Delta", Θ: "Theta", Λ: "Lambda", Ξ: "Xi", Π: "Pi", Σ: "Sigma", Φ: "Phi", Ψ: "Psi", Ω: "Omega"
};
const OPERATORS: Record<string, string> = {
  "−": "-", "–": "-", "—": "-", "×": "\\times ", "·": "\\cdot ", "⋅": "\\cdot ", "÷": "\\div ", "±": "\\pm ", "∓": "\\mp ", "≤": "\\leq ", "≥": "\\geq ", "≠": "\\neq ", "≈": "\\approx ", "≡": "\\equiv ", "∼": "\\sim ", "∝": "\\propto ",
  "∞": "\\infty ", "∑": "\\sum ", "∏": "\\prod ", "∫": "\\int ", "∂": "\\partial ", "∇": "\\nabla ", "∈": "\\in ", "∉": "\\notin ", "⊂": "\\subset ", "⊆": "\\subseteq ", "∪": "\\cup ", "∩": "\\cap ", "∀": "\\forall ", "∃": "\\exists ", "∅": "\\emptyset ",
  "→": "\\to ", "←": "\\leftarrow ", "↔": "\\leftrightarrow ", "⇒": "\\Rightarrow ", "⇔": "\\Leftrightarrow ", "∧": "\\land ", "∨": "\\lor ", "°": "^{\\circ}", "′": "'", "…": "\\ldots ", "∠": "\\angle ", "⊥": "\\perp ", "≪": "\\ll ", "≫": "\\gg ", "∘": "\\circ ", "ℝ": "\\mathbb{R}", "ℕ": "\\mathbb{N}", "ℤ": "\\mathbb{Z}", "ℚ": "\\mathbb{Q}", "ℂ": "\\mathbb{C}"
};
const SUPERSCRIPT = "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱ";
const SUPERSCRIPT_TO = "0123456789+-=()ni";
const SUBSCRIPT = "₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑᵢⱼₖₘₙₒₚᵣₛₜᵤᵥₓ";
const SUBSCRIPT_TO = "0123456789+-=()aeijkmnoprstuvx";
const COMBINING: Record<string, string> = { "̄": "bar", "̅": "overline", "̂": "hat", "̃": "tilde", "̇": "dot", "̈": "ddot", "⃗": "vec", "̌": "check" };

/**
 * Unicode maths characters → LaTeX, for text that is already known to be maths: `S²ₓ` → `S_x^{2}`,
 * `x̄` → `\bar{x}`, `√(a+b)` → `\sqrt{a+b}`, `(1)/(n-1)` → `\frac{1}{n-1}`, `∑ᵢ₌₁ⁿ` → `\sum_{i=1}^{n}`.
 */
export function unicodeToTex(input: string): string {
  const chars = [...input.normalize("NFD")];
  let out = "";
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    const next = chars[i + 1];
    if (next && COMBINING[next] && /[A-Za-zͰ-Ͽ]/.test(ch)) {
      out += `\\${COMBINING[next]}{${GREEK[ch] ? `\\${GREEK[ch]}` : ch}}`;
      i += 1;
      continue;
    }
    if (COMBINING[ch]) continue;
    // A run of super/subscript characters becomes one braced script.
    const sup = SUPERSCRIPT.indexOf(ch);
    const sub = SUBSCRIPT.indexOf(ch);
    if (sup >= 0 || sub >= 0) {
      const table = sup >= 0 ? SUPERSCRIPT : SUBSCRIPT;
      const map = sup >= 0 ? SUPERSCRIPT_TO : SUBSCRIPT_TO;
      let run = "";
      let j = i;
      while (j < chars.length && table.indexOf(chars[j]) >= 0) { run += map[table.indexOf(chars[j])]; j += 1; }
      out += `${sup >= 0 ? "^" : "_"}{${run}}`;
      i = j - 1;
      continue;
    }
    if (ch === "√") {
      // √ followed by a parenthesised group or one token.
      const rest = chars.slice(i + 1).join("");
      const group = /^\(((?:[^()]|\([^()]*\))*)\)/.exec(rest);
      if (group) { out += `\\sqrt{${unicodeToTex(group[1])}}`; i += [...group[0]].length; continue; }
      const token = /^\s*([A-Za-z0-9Ͱ-Ͽ]+)/.exec(rest);
      if (token) { out += `\\sqrt{${unicodeToTex(token[1])}}`; i += [...token[0]].length; continue; }
      out += "\\sqrt{}";
      continue;
    }
    if (GREEK[ch]) { out += `\\${GREEK[ch]} `; continue; }
    out += OPERATORS[ch] ?? ch;
  }
  // (a)/(b) written as flattened fractions; merge the scripts of a big operator.
  out = out.replace(/\(([^()]+)\)\s*\/\s*\(([^()]+)\)/g, "\\frac{$1}{$2}");
  out = out.replace(/_\{([^{}]*)\}\^\{([^{}]*)\}/g, "_{$1}^{$2}");
  return out.replace(/\s{2,}/g, " ").replace(/\s+([_^])/g, "$1").trim();
}

const hasUnicodeMath = (text: string) => /[^\x00-\x7f]/.test(text) && /[Ͱ-Ͽ⁰-₟±×·←-⋿̀-ͯ√∑]/.test(text);

/* ---------------------------------------------------------------- local fixes for a formula KaTeX rejects */

function balanceBraces(tex: string): string {
  let depth = 0;
  let out = "";
  for (let i = 0; i < tex.length; i += 1) {
    const ch = tex[i];
    if (ch === "\\") { out += ch + (tex[i + 1] ?? ""); i += 1; continue; }
    if (ch === "{") depth += 1;
    if (ch === "}") { if (depth === 0) continue; depth -= 1; }
    out += ch;
  }
  return out + "}".repeat(depth);
}

const KNOWN_COMMANDS = "frac|dfrac|tfrac|binom|sum|prod|int|iint|oint|sqrt|bar|hat|vec|tilde|dot|ddot|overline|underline|text|textbf|mathbf|mathrm|mathit|mathbb|mathcal|left|right|begin|end|cdot|cdots|ldots|times|div|pm|mp|leq|geq|neq|approx|equiv|sim|propto|infty|partial|nabla|lim|log|ln|sin|cos|tan|exp|max|min|sup|inf|det|sigma|Sigma|mu|pi|Pi|theta|Theta|lambda|Lambda|alpha|beta|gamma|Gamma|delta|Delta|epsilon|varepsilon|omega|Omega|rho|tau|phi|Phi|psi|Psi|chi|eta|zeta|kappa|nu|xi|quad|qquad|to|rightarrow|leftarrow|Rightarrow|Leftrightarrow|in|notin|subset|subseteq|cup|cap|forall|exists|operatorname|angle|perp|circ|prime|mid|ne|le|ge";

/** A command KaTeX does not know at all (as opposed to a known one used with the wrong arguments). */
function isUnknownCommand(command: string): boolean {
  try {
    katex.renderToString(command, { throwOnError: true, strict: "ignore", output: "html" });
    return false;
  } catch (error) {
    return /Undefined control sequence/i.test(String((error as Error)?.message || error));
  }
}

/**
 * Fixes applied even to a formula KaTeX accepts, because its acceptance hides the mistake: a doubled
 * backslash (`\\frac`, as it comes out of a badly escaped JSON string) is a valid line break followed
 * by the word "frac", and Unicode maths characters render but are not LaTeX.
 */
function normaliseTex(tex: string): string {
  let out = tex;
  out = out.replace(new RegExp(`\\\\\\\\(?=(?:${KNOWN_COMMANDS})(?![a-zA-Z]))`, "g"), "\\");
  if (hasUnicodeMath(out)) out = unicodeToTex(out);
  return out.trim();
}

const FIXES: ((tex: string) => string)[] = [
  (tex) => tex.replace(/\\\\(?=[a-zA-Z])/g, "\\"), // \\frac → \frac
  (tex) => tex.replace(/\\\\(?=[{}_^()[\]|,;:!])/g, "\\"),
  (tex) => tex.replace(/(^|[^\\])%/g, "$1\\%").replace(/(^|[^\\])#/g, "$1\\#"),
  (tex) => tex.replace(/\\(bold|bf)\b/g, "\\mathbf").replace(/\\(le)(?![a-zA-Z])/g, "\\leq").replace(/\\dots(?![a-zA-Z])/g, "\\ldots").replace(/\\(?:rm|it)\b/g, ""),
  balanceBraces,
  (tex) => tex.replace(/\\(?:left|right)(?![a-zA-Z])\s*/g, ""), // mismatched \left / \right
  (tex) => tex.replace(/\\begin\{[^}]*\}|\\end\{[^}]*\}/g, ""),
  (tex) => tex.replace(/\\\\\s*$/, "").replace(/&/g, " "),
  (tex) => tex.replace(/[_^]\s*$/, "").replace(/([_^])\s*([_^])/g, "$1{}$2"),
  (tex) => tex.replace(/\\[a-zA-Z]+/g, (command) => (isUnknownCommand(command) ? command.slice(1) : command))
];

/** The formula with the first set of local fixes that makes it parse, or null. Fixes are tried alone, then stacked. */
export function repairTex(tex: string, display = false): string | null {
  const original = normaliseTex(String(tex || ""));
  if (!original) return null;
  if (isValidTex(original, display)) return original;
  let stacked = original;
  for (const fix of FIXES) {
    const alone = fix(original).trim();
    if (alone && alone !== original && isValidTex(alone, display)) return alone;
    stacked = fix(stacked).trim();
    if (stacked && isValidTex(stacked, display)) return stacked;
  }
  return null;
}

/* ---------------------------------------------------------------- formulas written as flattened text */

const STRONG_SIGNAL = /[∑∏∫√]|\)\s*\/\s*\(|[̄̅̂̃⃗]|[⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ₀₁₂₃₄₅₆₇₈₉ₐₑᵢⱼₖₘₙₒₚᵣₛₜᵤᵥₓ].*[⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ₀₁₂₃₄₅₆₇₈₉ₐₑᵢⱼₖₘₙₒₚᵣₛₜᵤᵥₓ]/;
const MATHISH = /[=+−*/^()∑∏∫√±≤≥≠≈≡∞⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ₀₁₂₃₄₅₆₇₈₉ₐₑᵢⱼₖₘₙₒₚᵣₛₜᵤᵥₓ̀-ͯ⃗]/;
const PROSE_LETTER = new Set(["a", "e", "o", "u", "y", "i", "A", "O", "Y", "E", "U"]);

/**
 * Plain-text maths copied from a PDF (`S²ₓ = (1)/(n - 1) ∑ᵢ₌₁ⁿ(xᵢ - x̄)²`) written between dollars.
 * Only runs with a strong maths signal (a sum, root or integral sign, a flattened fraction, an
 * accent mark or several sub/superscripts) are touched, so ordinary prose and numbers are left alone.
 */
export function liftPlainMath(text: string): string {
  if (!hasUnicodeMath(text) && !/\)\s*\/\s*\(/.test(text)) return text;
  const tokens = text.split(/(\s+)/);
  const isMathToken = (token: string, index: number): boolean => {
    if (!token.trim()) return false;
    const bare = token.replace(/^[(]+|[).,;:!?]+$/g, "");
    if (/^\d+(?:[.,]\d+)?$/.test(bare)) return true;
    if (MATHISH.test(token) || /^[-−]$/.test(token)) return true;
    if (/^[A-Za-zͰ-Ͽ]$/.test(bare)) return !PROSE_LETTER.has(bare) || (/[=+−]/.test(tokens[index - 2] || "") && /[=+−]/.test(tokens[index + 2] || ""));
    return /^[Ͱ-Ͽ]+$/.test(bare);
  };
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (!isMathToken(tokens[i], i)) { out.push(tokens[i]); i += 1; continue; }
    let end = i;
    for (let j = i; j < tokens.length; j += 1) {
      if (/^\s+$/.test(tokens[j])) continue;
      if (isMathToken(tokens[j], j)) end = j; else break;
    }
    let run = tokens.slice(i, end + 1).join("");
    // Sentence punctuation after the run stays outside the dollars.
    const trailing = /[.,;:!?]+$/.exec(run)?.[0] || "";
    if (trailing) run = run.slice(0, -trailing.length);
    if (STRONG_SIGNAL.test(run) && !/\$/.test(run)) out.push(`$${unicodeToTex(run)}$${trailing}`);
    else out.push(tokens.slice(i, end + 1).join(""));
    i = end + 1;
  }
  return out.join("");
}

/* ---------------------------------------------------------------- whole texts */

export interface MathRepair { text: string; changed: boolean; invalid: { tex: string; display: boolean }[] }

const delimit = (seg: Extract<RichSeg, { t: "math" }>, tex: string) => (seg.display ? `$$${tex}$$` : `$${tex}$`);

/** `\(…\)` → `$…$`, `\[…\]` → `$$…$$` (splitRich already reads both; this writes the canonical form). */

/**
 * Repairs the maths in a text: canonical delimiters, formulas copied as flattened Unicode lifted into
 * LaTeX, Unicode and backslash mistakes fixed, every formula validated with KaTeX, stray dollar
 * signs escaped (`\$`). Formulas no local fix can save stay in the text (so a model can be asked to
 * fix them) and are listed in `invalid`.
 */
export function repairMathText(input: string): MathRepair {
  const original = String(input ?? "");
  if (!original) return { text: "", changed: false, invalid: [] };
  const invalid: MathRepair["invalid"] = [];
  const pieces: string[] = [];
  const first = splitRich(original);
  // 1 · flattened maths in the prose becomes $…$ first, then the text is read again.
  const lifted = first.map((seg) => (seg.t === "text" ? liftPlainMath(seg.text) : seg.t === "math" ? delimit(seg, seg.tex) : seg.t === "link" ? `[${seg.text}](${seg.href})` : "")).join("");
  const segs = lifted === original ? first : splitRich(lifted);
  for (const seg of segs) {
    if (seg.t === "text") { pieces.push(seg.text.replace(/\$/g, "\\$")); continue; }
    if (seg.t === "link") { pieces.push(`[${seg.text}](${seg.href})`); continue; }
    const fixed = repairTex(seg.tex, seg.display);
    if (fixed === null) { invalid.push({ tex: seg.tex, display: seg.display }); pieces.push(delimit(seg, seg.tex)); continue; }
    pieces.push(delimit(seg, fixed));
  }
  const text = pieces.join("");
  return { text, changed: text !== original, invalid };
}

/** Formulas of a text that KaTeX still rejects (after `repairMathText`). */
export function invalidFormulas(text: string): { tex: string; display: boolean }[] {
  return splitRich(String(text ?? "")).filter((seg): seg is Extract<RichSeg, { t: "math" }> => seg.t === "math").filter((seg) => !isValidTex(seg.tex, seg.display)).map((seg) => ({ tex: seg.tex, display: seg.display }));
}

/** Replaces each formula KaTeX rejects with a code span, so nothing broken is shown as maths. */
export function codeSpanInvalid(input: string): string {
  const text = String(input ?? "");
  if (!text.includes("$") && !text.includes("\\(") && !text.includes("\\[")) return text;
  return splitRich(text).map((seg) => {
    if (seg.t === "text") return seg.text.replace(/\$/g, "\\$");
    if (seg.t === "link") return `[${seg.text}](${seg.href})`;
    return isValidTex(seg.tex, seg.display) ? delimit(seg, seg.tex) : `\`${seg.tex.replace(/`/g, "'")}\``;
  }).join("");
}

/** Replaces one specific formula (as the model fixed it) wherever it occurs in the text. */
export function replaceFormula(text: string, from: string, to: string): string {
  return splitRich(String(text ?? "")).map((seg) => {
    if (seg.t === "text") return seg.text.replace(/\$/g, "\\$");
    if (seg.t === "link") return `[${seg.text}](${seg.href})`;
    return delimit(seg, seg.tex === from ? to : seg.tex);
  }).join("");
}
