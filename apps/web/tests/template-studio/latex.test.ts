import { describe, expect, it } from "vitest";
import { hasMath, latexToUnicode, renderMath } from "../../modules/template-studio/engine/latex";

describe("maths in generated text", () => {
  it("turns an inline formula into readable characters", () => {
    expect(renderMath("The variance is $S_x^2 = \\frac{1}{n-1}\\sum_{i=1}^{n}(x_i-\\bar{x})^2$ exactly."))
      .toBe("The variance is Sₓ² = (1)/(n-1)∑ᵢ₌₁ⁿ(xᵢ-x̄)² exactly.");
  });

  it("handles display maths, \\( \\) and \\[ \\] delimiters", () => {
    expect(renderMath("$$E = mc^2$$")).toBe("E = mc²");
    expect(renderMath("\\(a \\leq b\\)")).toBe("a ≤ b");
    expect(renderMath("\\[\\alpha + \\beta\\]")).toBe("α + β");
  });

  it("leaves prose and prices alone", () => {
    expect(renderMath("Plain question with no maths.")).toBe("Plain question with no maths.");
    expect(renderMath("It costs 4 dollars.")).toBe("It costs 4 dollars.");
  });

  it("converts a bare formula an agent forgot to delimit", () => {
    expect(renderMath("\\frac{a}{b} + \\sqrt{c}")).toBe("a/b + √c");
  });

  it("keeps simple fractions simple and parenthesises compound ones", () => {
    expect(latexToUnicode("\\frac{1}{2}")).toBe("1/2");
    expect(latexToUnicode("\\frac{x+1}{2}")).toBe("(x+1)/(2)");
  });

  it("falls back to ^( ) when a superscript has no characters of its own", () => {
    expect(latexToUnicode("x^{a+b}")).toBe("x^(a+b)");
  });

  it("detects whether text carries maths", () => {
    expect(hasMath("$x^2$")).toBe(true);
    expect(hasMath("no maths here")).toBe(false);
  });
});

import { createExamTemplate } from "../../modules/template-studio/engine/starters";
import { renderHtml, renderPdf } from "../../modules/template-studio/engine/renderers/index";

const mathData = {
  title: "Statistics test",
  questions: [{
    question: "Compute $S_x^2 = \\frac{1}{n-1}\\sum_{i=1}^{n}(x_i-\\bar{x})^2$.",
    options: ["$\\frac{1}{n}$", "$\\sqrt{\\alpha}$", "$x \\leq 5$"],
    answer: "$\\frac{1}{n}$",
    explanation: "Because $\\sigma^2 \\approx s^2$."
  }]
};

describe("maths in exports", () => {
  it("draws converted maths in HTML, never raw LaTeX", () => {
    const { html } = renderHtml(createExamTemplate(), mathData);
    expect(html).toContain("∑");
    expect(html).not.toContain("\\frac");
    expect(html).not.toContain("\\sum");
  });

  it("exports a PDF although the maths uses characters the standard font cannot draw", async () => {
    // pdf-lib's WinAnsi fonts throw on ∑ / x̄ — the renderer must spell them out instead.
    const pdf = await renderPdf(createExamTemplate(), mathData);
    expect(pdf.length).toBeGreaterThan(1000);
  });
});
