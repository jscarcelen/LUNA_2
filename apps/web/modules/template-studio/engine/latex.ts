/**
 * Maths embedded in generated text.
 *
 * Agents write formulas the way textbooks do — `$S_x^2 = \frac{1}{n-1}\sum (x_i - \bar{x})^2$` —
 * and every export (HTML, PDF, Word, PowerPoint, the on-platform activity) draws plain text. Raw
 * LaTeX in a question is unreadable, so the maths is converted once, here, into the characters a
 * reader expects: fractions, superscripts, Greek letters and operators.
 *
 * This is deliberately a typographic conversion, not a typesetting engine: it keeps one line of
 * text, so it works identically in a PDF box, a Word run and a slide.
 */

const SYMBOLS: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η",
  theta: "θ", vartheta: "ϑ", iota: "ι", kappa: "κ", lambda: "λ", mu: "µ", nu: "ν", xi: "ξ", pi: "π",
  rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ", phi: "φ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
  sum: "∑", prod: "∏", int: "∫", iint: "∬", oint: "∮", partial: "∂", nabla: "∇", infty: "∞",
  times: "×", div: "÷", cdot: "·", pm: "±", mp: "∓", ast: "∗", star: "⋆",
  leq: "≤", le: "≤", geq: "≥", ge: "≥", neq: "≠", ne: "≠", approx: "≈", equiv: "≡", sim: "∼", propto: "∝",
  in: "∈", notin: "∉", subset: "⊂", subseteq: "⊆", supset: "⊃", supseteq: "⊇", cup: "∪", cap: "∩",
  forall: "∀", exists: "∃", neg: "¬", land: "∧", lor: "∨", emptyset: "∅", angle: "∠", perp: "⊥",
  rightarrow: "→", to: "→", leftarrow: "←", leftrightarrow: "↔", Rightarrow: "⇒", Leftrightarrow: "⇔",
  ldots: "…", dots: "…", cdots: "⋯", degree: "°", circ: "°", percent: "%", sqrt: "√", therefore: "∴",
  ll: "≪", gg: "≫", mathbb: "", mathrm: "", displaystyle: "", limits: "", left: "", right: "", quad: " ", qquad: "  "
};

const SUPERSCRIPT: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ", T: "ᵀ" };
const SUBSCRIPT: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎", a: "ₐ", e: "ₑ", i: "ᵢ", j: "ⱼ", k: "ₖ", m: "ₘ", n: "ₙ", o: "ₒ", p: "ₚ", r: "ᵣ", s: "ₛ", t: "ₜ", u: "ᵤ", v: "ᵥ", x: "ₓ" };

const COMBINING = { bar: "̄", hat: "̂", vec: "⃗", dot: "̇", tilde: "̃" } as const;

/** Reads `{...}` (balanced) or a single token after a command. */
function takeGroup(input: string, start: number): { body: string; end: number } {
  if (input[start] !== "{") {
    const single = input.slice(start, start + 1);
    return { body: single, end: start + single.length };
  }
  let depth = 0;
  for (let index = start; index < input.length; index += 1) {
    if (input[index] === "{") depth += 1;
    else if (input[index] === "}") {
      depth -= 1;
      if (depth === 0) return { body: input.slice(start + 1, index), end: index + 1 };
    }
  }
  return { body: input.slice(start + 1), end: input.length };
}

function script(body: string, table: Record<string, string>, marker: string): string {
  const converted = [...body].map((char) => table[char] || (char === " " ? "" : null));
  if (converted.every((char) => char !== null)) return converted.join("");
  return body.length === 1 ? `${marker}${body}` : `${marker}(${body})`;
}

/** One maths expression (without its delimiters) in readable characters. */
export function latexToUnicode(source: string): string {
  let out = "";
  let index = 0;
  const input = String(source || "");
  while (index < input.length) {
    const char = input[index];
    if (char === "\\") {
      const match = /^\\([a-zA-Z]+|[\\,;:!{}%&$#_ ])/.exec(input.slice(index));
      if (!match) { out += char; index += 1; continue; }
      const name = match[1];
      index += match[0].length;
      if (name === "frac" || name === "dfrac" || name === "tfrac") {
        const numerator = takeGroup(input, index);
        const denominator = takeGroup(input, numerator.end);
        index = denominator.end;
        const top = latexToUnicode(numerator.body);
        const bottom = latexToUnicode(denominator.body);
        const simple = /^[\w.]+$/.test(top) && /^[\w.]+$/.test(bottom);
        out += simple ? `${top}/${bottom}` : `(${top})/(${bottom})`;
        continue;
      }
      if (name === "sqrt") {
        const body = takeGroup(input, index);
        index = body.end;
        const inner = latexToUnicode(body.body);
        out += inner.length === 1 ? `√${inner}` : `√(${inner})`;
        continue;
      }
      if (name in COMBINING) {
        const body = takeGroup(input, index);
        index = body.end;
        out += `${latexToUnicode(body.body)}${COMBINING[name as keyof typeof COMBINING]}`;
        continue;
      }
      if (name === "text" || name === "mathrm" || name === "mathbf" || name === "mathit" || name === "operatorname" || name === "mathbb" || name === "boldsymbol") {
        const body = takeGroup(input, index);
        index = body.end;
        out += latexToUnicode(body.body);
        continue;
      }
      if (name === "," || name === ";" || name === ":" || name === " ") { out += " "; continue; }
      if (name === "\\") { out += " "; continue; }
      if (name in SYMBOLS) { out += SYMBOLS[name]; continue; }
      if (/^[{}%&$#_]$/.test(name)) { out += name; continue; }
      // Unknown command: keep the word, it is usually a function name (\log, \max…).
      out += name;
      continue;
    }
    if (char === "^" || char === "_") {
      const body = takeGroup(input, index + 1);
      index = body.end;
      out += script(latexToUnicode(body.body), char === "^" ? SUPERSCRIPT : SUBSCRIPT, char);
      continue;
    }
    if (char === "{" || char === "}") { index += 1; continue; }
    if (char === "&") { index += 1; out += " "; continue; }
    out += char;
    index += 1;
  }
  return out.replace(/[ \t]{2,}/g, " ").trim();
}

const MATH_PATTERN = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$([^$\n]+?)\$|\\\(([\s\S]+?)\\\)/g;

/** True when the text carries LaTeX worth converting. */
export function hasMath(text: string): boolean {
  MATH_PATTERN.lastIndex = 0;
  return MATH_PATTERN.test(String(text || ""));
}

/**
 * Converts every maths span embedded in a piece of text, leaving the prose untouched. Text with no
 * maths comes back unchanged, so this is safe to run over everything a template draws.
 */
export function renderMath(text: string): string {
  const value = String(text ?? "");
  if (!value.includes("$") && !value.includes("\\")) return value;
  const converted = value.replace(MATH_PATTERN, (_match, display, bracket, inline, paren) => latexToUnicode(display ?? bracket ?? inline ?? paren ?? ""));
  // A bare formula with no delimiters at all (agents sometimes forget them).
  if (converted === value && /\\(frac|sqrt|sum|int|bar|alpha|beta|theta|pi|sigma|le|ge|neq|times|cdot)\b/.test(value)) return latexToUnicode(value);
  return converted;
}
