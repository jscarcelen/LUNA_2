import { describe, expect, it } from "vitest";
import { markdownToHtml } from "../modules/reader/markdown.js";

describe("reader markdown", () => {
  const md = [
    "<!-- page 6 -->", "", "## 3.5. Depreciation and amortization", "", "Depreciation for **tangible** assets, amortization for intangible. Land is not depreciated.", "",
    "$$", "\\text{Depreciation expense} = \\frac{\\text{Acquisition cost} - \\text{Salvage value}}{\\text{Useful life}}", "$$", "",
    "- Year 0: Dr. PPE 100K", "- Year 1: depreciation 20k", "",
    "| Year | PPE |", "| --- | --- |", "| 0 | 100K |", "| 1 | 80K |"
  ].join("\n");

  it("renders headings, bold, display LaTeX, lists, tables and page markers", () => {
    const html = markdownToHtml(md);
    expect(html).toContain("<h2>3.5. Depreciation and amortization</h2>");
    expect(html).toContain("<strong>tangible</strong>");
    expect(html).toContain("katex");
    expect(html).not.toContain("\\frac{");
    expect(html).toContain("<li");
    expect(html).toContain("<table>");
    expect(html).toContain("Page 6");
    expect(html).not.toContain("<!--");
  });

  it("marks the block that holds the quote", () => {
    const html = markdownToHtml(md, { quote: "Depreciation for tangible assets, amortization for intangible." });
    expect(html).toMatch(/<p class="hit" id="quote">Depreciation for/);
    const math = markdownToHtml(md, { quote: "\\text{Depreciation expense} = \\frac{\\text{Acquisition cost} - \\text{Salvage value}}" });
    expect(math).toContain('class="md-math hit"');
  });

  it("escapes anything that is not Markdown", () => {
    expect(markdownToHtml("<script>alert(1)</script> & <b>x</b>")).not.toContain("<script>");
  });
});
