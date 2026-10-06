import { describe, expect, it } from "vitest";
import { codeSpanInvalid, invalidFormulas, isValidTex, liftPlainMath, repairMathText, repairTex, unicodeToTex } from "../../modules/template-studio/engine/math/repair";

describe("repairing formulas models write badly", () => {
  it("turns \\( \\) and \\[ \\] into dollar delimiters", () => {
    expect(repairMathText("La media \\(\\bar{x}\\) y \\[x^2\\]").text).toBe("La media $\\bar{x}$ y $$x^2$$");
  });

  it("fixes double-escaped backslashes", () => {
    const fixed = repairMathText("Es $\\\\frac{1}{n}\\\\sum x_i$.");
    expect(fixed.text).toBe("Es $\\frac{1}{n}\\sum x_i$.");
    expect(fixed.invalid).toEqual([]);
  });

  it("converts Unicode maths inside the dollars", () => {
    const fixed = repairMathText("Varianza $S²ₓ = √(a+b) ± x̄ ≤ α$");
    expect(fixed.invalid).toEqual([]);
    expect(fixed.text).toContain("\\sqrt{a+b}");
    expect(fixed.text).toContain("\\pm");
    expect(fixed.text).toContain("\\leq");
    expect(fixed.text).toContain("\\bar{x}");
    expect(fixed.text).toContain("\\alpha");
    expect(fixed.text).not.toMatch(/[²ₓ√±≤α]/);
  });

  it("rebuilds a formula copied from a PDF as flattened text", () => {
    const lifted = liftPlainMath("La varianza es S²ₓ = (1)/(n-1) ∑ᵢ₌₁ⁿ(xᵢ - x̄)² para la muestra.");
    expect(lifted).toMatch(/^La varianza es \$.+\$ para la muestra\.$/);
    const tex = /\$(.+)\$/.exec(lifted)![1];
    expect(tex).toContain("\\frac{1}{n-1}");
    expect(tex).toContain("\\sum_{i=1}^{n}");
    expect(tex).toContain("\\bar{x}");
    expect(isValidTex(tex)).toBe(true);
  });

  it("leaves ordinary prose and numbers alone", () => {
    expect(liftPlainMath("Aprobaron 25 de 30 alumnos (83 %) en 2020.")).toBe("Aprobaron 25 de 30 alumnos (83 %) en 2020.");
  });

  it("fixes an unclosed brace and a stray \\left", () => {
    expect(repairTex("\\frac{a}{b")).toBe("\\frac{a}{b}");
    expect(isValidTex(repairTex("\\left( x + 1 ")!)).toBe(true);
  });

  it("escapes a currency dollar instead of leaving an unbalanced $", () => {
    const fixed = repairMathText("Cuesta $40,000 hoy y $5,000 mañana.");
    expect(fixed.text).toBe("Cuesta \\$40,000 hoy y \\$5,000 mañana.");
    expect(repairMathText(fixed.text).text).toBe(fixed.text);
  });

  it("reports a formula nothing can rescue and shows it as a code span", () => {
    const fixed = repairMathText("Mira $\\frac{a}$ aquí");
    expect(fixed.invalid.length + invalidFormulas(fixed.text).length).toBeGreaterThan(0);
    const shown = codeSpanInvalid(fixed.text);
    expect(shown).not.toContain("$");
    expect(shown).toContain("`");
  });

  it("converts the characters on their own", () => {
    expect(unicodeToTex("xᵢ - x̄")).toBe("x_{i} - \\bar{x}");
    expect(unicodeToTex("(1)/(n-1)")).toBe("\\frac{1}{n-1}");
  });
});
