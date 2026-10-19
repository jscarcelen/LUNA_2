import { describe, expect, it } from "vitest";
import katex from "katex";
import { repairDoubledLatex, repairStoredMath } from "../modules/reader/storedMath.js";

describe("stored maths with a doubled backslash", () => {
  it("typesets \\\\bar{x} again as \\bar{x}, keeps everything else", () => {
    const bad = katex.renderToString("\\\\bar{x}", { throwOnError: false });
    const html = `<p>mean (<span class="math-inline nicer-latex" data-latex="\\\\bar{x}">${bad}</span>). <span class="math-inline nicer-latex" data-latex="x^2">X</span></p>`;
    const out = repairStoredMath(html);
    expect(out).toContain('data-latex="\\bar{x}"');
    expect(out).not.toContain("katex-newline");
    expect(out).toContain('data-latex="x^2">X</span>');
    expect(out.startsWith("<p>mean (")).toBe(true);
    expect(out.endsWith("</p>")).toBe(true);
  });

  it("leaves a real line break alone", () => {
    expect(repairDoubledLatex("a \\\\ b")).toBe("a \\\\ b");
    expect(repairDoubledLatex("\\\\frac{1}{2}")).toBe("\\frac{1}{2}");
  });

  it("does nothing to HTML without stored maths", () => {
    expect(repairStoredMath("<p>hello</p>")).toBe("<p>hello</p>");
  });
});
