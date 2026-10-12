import { describe, expect, it } from "vitest";
import { documentFigures, keyFigures, placeFigures } from "../../modules/ai-tools/pipeline/figures.js";
import { conformBlocks } from "../../modules/ai-tools/blocks/blockRegistry.js";
import { blocksToMarkdown } from "../../modules/ai-tools/pipeline/masterDocument.js";
import { renderInline } from "../../modules/reader/markdown.js";

const big = (n: number) => `data:image/jpeg;base64,${"A".repeat(n)}`;
const html = `<section data-page="2"><img alt="Slide 2 picture" src="${big(12000)}"></section><img src="${big(100)}"><section data-page="5"><img alt="Cell cycle" src="${big(20000)}"></section>`;

describe("figures in consolidated notes", () => {
  it("finds embedded pictures, skipping icons, with their page", () => {
    expect(documentFigures({ sourceRenderHtml: html }).map((f) => f.page)).toEqual([2, 5]);
  });
  it("places figures under sections that cite their document, and keeps them through conformBlocks, markdown and html", () => {
    const figures = keyFigures([{ id: "d1", name: "Bio.pdf", sourceRenderHtml: html }]);
    const sections = [
      { title: "A", blocks: [{ type: "paragraph", text: "x", sources: ["S1"] }] },
      { title: "B", blocks: [{ type: "paragraph", text: "y", sources: ["S2"] }, { type: "paragraph", text: "z", sources: ["S2"] }] }
    ];
    const { sections: placed, placed: count } = placeFigures(sections, figures, () => 0);
    expect(count).toBe(2);
    const blocks = conformBlocks(placed.flatMap((s) => s.figures));
    expect(blocks).toHaveLength(2);
    expect(blocks.map((b: any) => b.caption)).toContain("Cell cycle");
    const markdown = blocksToMarkdown(blocks);
    expect(markdown).toContain("![Cell cycle](data:image/jpeg;base64,");
    expect(renderInline(markdown.split("\n\n")[0])).toContain("<img");
  });
  it("drops a figure that is not an embedded image", () => {
    expect(conformBlocks([{ type: "figure", image: "http://x/y.png", caption: "c" }])).toEqual([]);
  });
});
