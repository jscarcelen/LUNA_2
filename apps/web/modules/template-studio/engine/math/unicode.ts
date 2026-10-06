/**
 * LaTeX → readable Unicode, one line.
 *
 * The fallback for everything that cannot typeset maths (DOCX / PPTX text runs, the plain `lines` of
 * a laid-out text, search, previews). Fractions stay `a/b` when simple and `(a)/(b)` otherwise, big
 * operators keep their limits (`∑(i=1→n)`), accents become combining marks (`x̄`), matrices become
 * `(a, b; c, d)`. HTML and PDF do not use this: they draw the real thing.
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

const BIG_OPERATORS = new Set(["sum", "prod", "coprod", "int", "iint", "iiint", "oint", "bigcup", "bigcap", "bigvee", "bigwedge", "bigoplus", "bigotimes"]);
const DOUBLE_STRUCK: Record<string, string> = { R: "ℝ", N: "ℕ", Z: "ℤ", Q: "ℚ", C: "ℂ", P: "ℙ", H: "ℍ", E: "𝔼" };
const MATRIX_BRACKETS: Record<string, [string, string]> = { pmatrix: ["(", ")"], bmatrix: ["[", "]"], Bmatrix: ["{", "}"], vmatrix: ["|", "|"], Vmatrix: ["‖", "‖"], matrix: ["", ""], cases: ["{ ", ""], array: ["", ""], aligned: ["", ""], align: ["", ""], split: ["", ""], gathered: ["", ""] };

/** `^x` / `_x` right after a command or atom, in either order, skipping spaces. */
function takeScripts(input: string, from: number): { sub?: string; sup?: string; end: number } {
  let index = from;
  let sub: string | undefined;
  let sup: string | undefined;
  for (let guard = 0; guard < 2; guard += 1) {
    while (input[index] === " ") index += 1;
    const mark = input[index];
    if (mark !== "^" && mark !== "_") break;
    const body = takeGroup(input, index + 1);
    index = body.end;
    if (mark === "^") sup = latexToUnicode(body.body); else sub = latexToUnicode(body.body);
  }
  return { sub, sup, end: index };
}

/** One maths expression (without its delimiters) in readable characters. */
export function latexToUnicode(source: string): string {
  let out = "";
  let index = 0;
  const input = String(source || "");
  while (index < input.length) {
    const char = input[index];
    if (char === "\\") {
      const match = /^\\([a-zA-Z]+|[\\,;:!{}%&$#_ |])/.exec(input.slice(index));
      if (!match) { out += char; index += 1; continue; }
      const name = match[1];
      index += match[0].length;
      if (name === "begin" || name === "end") {
        const env = takeGroup(input, index);
        index = env.end;
        const brackets = MATRIX_BRACKETS[env.body.replace(/\*$/, "")];
        if (brackets) out += name === "begin" ? brackets[0] : brackets[1];
        if (name === "begin" && /^(?:array)$/.test(env.body)) index = takeGroup(input, index).end;
        continue;
      }
      if (name === "frac" || name === "dfrac" || name === "tfrac" || name === "binom" || name === "dbinom") {
        const numerator = takeGroup(input, index);
        const denominator = takeGroup(input, numerator.end);
        index = denominator.end;
        const top = latexToUnicode(numerator.body);
        const bottom = latexToUnicode(denominator.body);
        if (name.endsWith("binom")) { out += `C(${top}, ${bottom})`; continue; }
        const simple = /^[\w.]+$/.test(top) && /^[\w.]+$/.test(bottom);
        out += simple ? `${top}/${bottom}` : `(${top})/(${bottom})`;
        continue;
      }
      if (name === "sqrt") {
        let root = "";
        if (input[index] === "[") {
          const close = input.indexOf("]", index);
          if (close > 0) { root = latexToUnicode(input.slice(index + 1, close)); index = close + 1; }
        }
        const body = takeGroup(input, index);
        index = body.end;
        const inner = latexToUnicode(body.body);
        const sign = root === "3" ? "∛" : root === "4" ? "∜" : root ? `${script(root, SUPERSCRIPT, "^")}√` : "√";
        out += inner.length === 1 ? `${sign}${inner}` : `${sign}(${inner})`;
        continue;
      }
      if (name in COMBINING) {
        const body = takeGroup(input, index);
        index = body.end;
        out += `${latexToUnicode(body.body)}${COMBINING[name as keyof typeof COMBINING]}`;
        continue;
      }
      if (name === "overline" || name === "underline") {
        const body = takeGroup(input, index);
        index = body.end;
        out += [...latexToUnicode(body.body)].map((c) => `${c}${name === "overline" ? "̅" : "̲"}`).join("");
        continue;
      }
      if (name === "mathbb") {
        const body = takeGroup(input, index);
        index = body.end;
        out += [...latexToUnicode(body.body)].map((c) => DOUBLE_STRUCK[c] || c).join("");
        continue;
      }
      if (name === "text" || name === "textrm" || name === "textbf" || name === "textit" || name === "mathrm" || name === "mathbf" || name === "mathit" || name === "mathsf" || name === "mathtt" || name === "mathcal" || name === "mathfrak" || name === "operatorname" || name === "boldsymbol" || name === "mbox" || name === "bm") {
        const body = takeGroup(input, index);
        index = body.end;
        out += name.startsWith("text") || name === "mbox" ? body.body : latexToUnicode(body.body);
        continue;
      }
      if (BIG_OPERATORS.has(name)) {
        out += SYMBOLS[name] || name;
        const scripts = takeScripts(input, index);
        index = scripts.end;
        if (scripts.sub !== undefined || scripts.sup !== undefined) {
          // ∑(i=1→n): the limits stay readable instead of turning into tiny raised and lowered characters.
          out += scripts.sub !== undefined && scripts.sup !== undefined ? `(${scripts.sub}→${scripts.sup})` : scripts.sub !== undefined ? `(${scripts.sub})` : `^(${scripts.sup})`;
        }
        continue;
      }
      if (name === "," || name === ";" || name === ":" || name === " " || name === "!") { out += name === "!" ? "" : " "; continue; }
      if (name === "\\") { out += out.endsWith("(") || out.endsWith("[") ? "" : "; "; continue; }
      if (name === "|") { out += "‖"; continue; }
      if (name === "neq" || name === "ne") { out += "≠"; continue; }
      if (name === "not") { const next = input.slice(index).trimStart()[0]; out += next === "=" ? "" : "¬"; continue; }
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
    if (char === "&") { index += 1; out += ", "; continue; }
    out += char;
    index += 1;
  }
  return out.replace(/[ \t]{2,}/g, " ").replace(/\s*,\s*;/g, ";").trim();
}
