import { describe, expect, it } from "vitest";
import { blocksToReaderHtml } from "../modules/reader/documentHtml.js";

describe("reader document", () => {
  const blocks: any[] = [
    { type: "document_header", title: "Key Concepts in Accounting" },
    { type: "heading", text: "Balance sheet", level: 1 },
    { type: "paragraph", text: "Assets = Liabilities + **Equity**; see $A = L + E$." },
    { type: "bullet_list", title: "Remember", items: ["Current assets", "Non-current assets"] },
    { type: "callout", text: "Land is not depreciated.", callout_type: "tip" },
    { type: "vocabulary", word: "Depreciation", translation: "Allocation of cost", example: "100k over 5 years" },
    { type: "vocabulary", word: "Amortization", translation: "Same, for intangibles", example: "" }
  ];

  it("turns typed blocks into a clean reading page", () => {
    const html = blocksToReaderHtml(blocks);
    expect(html).toContain("<h1>Key Concepts in Accounting</h1>");
    expect(html).toContain("<h2>Balance sheet</h2>");
    expect(html).toContain("<strong>Equity</strong>");
    expect(html).toContain("katex");
    expect(html).toContain("md-callout-tip");
    expect((html.match(/<table>/g) || []).length).toBe(1); // consecutive vocabulary rows share one table
    expect(html).toContain("Amortization");
  });

  it("adds a title when the document has none", () => {
    expect(blocksToReaderHtml([{ type: "paragraph", text: "Body" }], { title: "My summary" })).toContain("<h1>My summary</h1>");
  });
});
