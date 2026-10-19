import { describe, expect, it } from "vitest";
// @ts-ignore - plain JS modules
import { renderInline, renderRich, repairLatexEscapes } from "../modules/reader/markdown.js";
// @ts-ignore
import { renderCanonicalDocumentToHtml } from "../modules/document-processing/renderers/htmlRenderer.js";

const visible = (html: string) => html.replace(/<annotation[\s\S]*?<\/annotation>/g, "").replace(/<[^>]+>/g, "");

describe("\\bar{x} in the reader", () => {
  it("typesets the accent instead of printing letters", () => {
    for (const source of ["The mean is $\\bar{x}$.", "The mean is \\bar{x}.", "The mean is bar{x}.", "The mean is \u0008ar{x}."]) {
      const html = renderRich(source);
      expect(html).toContain("katex");
      expect(visible(html)).not.toContain("barx");
      expect(html).toContain("katex-accent");
    }
  });
  it("handles \\bar over longer bodies and leaves ordinary words alone", () => {
    expect(renderInline("$\\bar{xy}$")).toContain("katex");
    expect(repairLatexEscapes("bark and barn")).toBe("bark and barn");
    expect(repairLatexEscapes("bar{x}")).toBe("\\bar{x}");
    expect(repairLatexEscapes("a\u000cat")).toBe("a\\fat");
  });
});

describe("empty Figure label", () => {
  it("draws nothing for a figure without picture, caption or description", () => {
    const doc = (block: object) => renderCanonicalDocumentToHtml({ sections: [{ blocks: [block] }] });
    const html = typeof doc({ type: "figure" }) === "string" ? doc({ type: "figure" }) : JSON.stringify(doc({ type: "figure" }));
    expect(html).not.toContain("Figure");
    expect(String(doc({ type: "figure", caption: "Mean and median" }))).toContain("Mean and median");
  });
  it("renders a markdown image reference only when it says something", () => {
    expect(renderInline("![](x.png)")).not.toContain("Figure");
    expect(renderInline("![Normal curve](x.png)")).toContain("Figure: Normal curve");
  });
});
