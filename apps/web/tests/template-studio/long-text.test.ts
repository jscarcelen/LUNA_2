import { describe, expect, it } from "vitest";
import { buildOutputDocument, itemsToBlocks, planOutput } from "../../modules/template-studio/output/outputDocument";
import { layoutDocument } from "../../modules/template-studio/engine/layout";

const sentence = "The cash flow statement reconciles the beginning and ending balance of cash by classifying every movement as operating, investing or financing activity. ";
const longText = sentence.repeat(60); // ≈ 9,000 characters: well over a page
const blocks: any[] = [
  { type: "heading", text: "Summary", level: 1 },
  { type: "paragraph", text: longText },
  { type: "paragraph", text: "A short closing paragraph." }
];

function layoutFor(layoutIndex: number) {
  const plan: any = planOutput({ blocks, title: "Summary", framed: false });
  const doc: any = buildOutputDocument(plan, {});
  const layout = doc.template.layouts[layoutIndex];
  return { doc, layout, result: layoutDocument(doc.template, doc.data, { layoutId: layout.id }) };
}

const textItems = (pages: any[]) => pages.flatMap((page) => page.items).filter((item: any) => item.type === "text" && item.lines.join(" ").includes("cash flow statement"));

describe("long text in the output document", () => {
  it("keeps its font size and runs onto more pages in a paged layout", () => {
    const paged = layoutFor(doc0());
    const sizes = new Set(textItems(paged.result.pages).map((item: any) => item.style.fontSize));
    expect(paged.layout.class).toBe("paged");
    expect(paged.result.pages.length).toBeGreaterThan(1);
    expect(sizes.size).toBe(1);
    // every line of the long text is still there, split over the pages
    const all = textItems(paged.result.pages).flatMap((item: any) => item.lines).join(" ");
    expect((all.match(/cash flow statement/g) || []).length).toBe(60);
    // nothing runs past the bottom of its page
    for (const page of paged.result.pages) for (const item of page.items as any[]) expect(item.y + item.h).toBeLessThanOrEqual(page.height + 0.5);
  });

  it("on slides a component stays on one slide, shrinking its text to fit", () => {
    const slides = layoutFor(slideIndex());
    expect(slides.layout.class).toBe("slides");
    const paragraphSlides = slides.result.pages.filter((page: any) => page.items.some((item: any) => item.type === "text" && item.lines.join(" ").includes("cash flow statement")));
    expect(paragraphSlides.length).toBe(1);
  });
});

function doc0() { return 0; }
function slideIndex() {
  const plan: any = planOutput({ blocks, title: "Summary", framed: false });
  const doc: any = buildOutputDocument(plan, {});
  return doc.template.layouts.findIndex((layout: any) => layout.class === "slides");
}

describe("a long question in a document with a footer", () => {
  it("stays above the footer on every page and never leaves the page", () => {
    const sentence = "The cash flow statement reconciles the beginning and ending balance of cash by classifying every movement. ";
    const items: any[] = Array.from({ length: 12 }, (_, i) => ({ type: "multiple-choice", question: `Q${i + 1}. ${sentence.repeat(i === 3 ? 90 : 2)}`, options: ["A one", "B two", "C three", "D four"], answer: "B two", explanation: sentence, topic: "t", difficulty: "easy" }));
    const plan: any = planOutput({ blocks: itemsToBlocks(items) as any, title: "Quiz", framed: true });
    expect(plan.end).toContain("block-footer");
    const doc: any = buildOutputDocument(plan, {});
    const layout = doc.template.layouts.find((l: any) => l.class === "paged");
    const result = layoutDocument(doc.template, doc.data, { layoutId: layout.id });
    expect(result.pages.length).toBeGreaterThan(3);
    for (const page of result.pages as any[]) {
      const footer = page.items.filter((item: any) => item.type === "text" && /^Page \d+/.test(item.lines[0] || ""));
      expect(footer.length).toBeGreaterThan(0);
      const footerTop = Math.min(...footer.map((item: any) => item.y));
      for (const item of page.items) {
        expect(item.y + item.h).toBeLessThanOrEqual(page.height + 0.5);
        if (item.y < footerTop - 0.5) expect(item.y + item.h).toBeLessThanOrEqual(footerTop + 0.5);
      }
    }
  });
});
