import { describe, expect, it } from "vitest";
import { buildOutputDocument, itemsToBlocks, planOutput } from "../../modules/template-studio/output/outputDocument";
import { layoutDocument } from "../../modules/template-studio/engine/layout";
import { sidesFromCards } from "../../modules/template-studio/engine/derive";

const cards: any[] = [{ front: "abstracción", back: "abstraction" }, { front: "ambigüedad", back: "ambiguity" }, { front: "coherencia", back: "coherence" }];

function build() {
  const plan: any = planOutput({ blocks: itemsToBlocks(cards) as any, title: "Advanced Vocabulary · Spanish → English", framed: true });
  const doc: any = buildOutputDocument(plan, {});
  const layout = doc.template.layouts[0];
  const pagesOf = (viewName: string) => layoutDocument(doc.template, doc.data, { layoutId: layout.id, viewId: layout.views.find((v: any) => v.name === viewName).id }).pages as any[];
  return { doc, layout, pagesOf };
}
const texts = (page: any) => page.items.filter((i: any) => i.type === "text").map((i: any) => i.lines.join(" "));

describe("flashcards", () => {
  it("turns cards into a front page and a back page each", () => {
    expect(sidesFromCards(cards)).toEqual([
      { label: "FRONT", text: "abstracción" }, { label: "BACK", text: "abstraction" },
      { label: "FRONT", text: "ambigüedad" }, { label: "BACK", text: "ambiguity" },
      { label: "FRONT", text: "coherencia" }, { label: "BACK", text: "coherence" }
    ]);
  });

  it("has two views: both sides on one page, and one side per page", () => {
    const { layout } = build();
    expect(layout.views.map((v: any) => v.name)).toEqual(["Both sides on one page", "One side per page"]);
  });

  it("both sides on one page: a cover, then one page per card — no blank pages in between", () => {
    const pages = build().pagesOf("Both sides on one page");
    expect(pages.length).toBe(1 + cards.length);
    expect(texts(pages[0]).join(" ")).toContain("Advanced Vocabulary");
    pages.slice(1).forEach((page, index) => {
      expect(texts(page)).toContain(cards[index].front);
      expect(texts(page)).toContain(cards[index].back);
    });
  });

  it("the middle line runs the card's whole width and sits in the middle", () => {
    const page = build().pagesOf("Both sides on one page")[1];
    const outline = page.items.find((i: any) => i.type === "rect" && i.h > 60);
    const line = page.items.find((i: any) => i.type === "line" && i.w > 50);
    expect(Math.abs(line.x - outline.x)).toBeLessThan(0.6);
    expect(Math.abs(line.w - outline.w)).toBeLessThan(0.6);
    expect(Math.abs((line.y - outline.y) - outline.h / 2)).toBeLessThan(2);
  });

  it("one side per page: front, back, front, back… and no cover", () => {
    const pages = build().pagesOf("One side per page");
    expect(pages.length).toBe(cards.length * 2);
    const seq = pages.map((page) => texts(page));
    cards.forEach((card, index) => {
      expect(seq[index * 2]).toContain("FRONT");
      expect(seq[index * 2]).toContain(card.front);
      expect(seq[index * 2 + 1]).toContain("BACK");
      expect(seq[index * 2 + 1]).toContain(card.back);
    });
  });
});
