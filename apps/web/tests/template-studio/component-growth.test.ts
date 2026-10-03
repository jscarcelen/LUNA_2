import { describe, expect, it } from "vitest";
import { buildOutputDocument, itemsToBlocks, planOutput } from "../../modules/template-studio/output/outputDocument";
import { layoutDocument } from "../../modules/template-studio/engine/layout";

const longLine = "A very long heading that cannot possibly fit on a single line of an A4 page however small the margins are made";
const sentence = "The income statement provides insights into the operating, financing and investing activities of the firm over a period. ";

function page(blocks: any[], pageIndex = 0) {
  const plan: any = planOutput({ blocks, title: "Doc" });
  const doc: any = buildOutputDocument(plan, {});
  const layout = doc.template.layouts[0];
  const result = layoutDocument(doc.template, doc.data, { layoutId: layout.id });
  return result.pages[pageIndex].items as any[];
}
const texts = (items: any[]) => items.filter((item) => item.type === "text");
const rects = (items: any[]) => items.filter((item) => item.type === "rect");

describe("components grow from the top down", () => {
  it("a heading that wraps pushes its accent rule below the text", () => {
    const items = page([{ type: "paragraph", text: "Intro." }, { type: "heading", text: longLine, level: 1 }, { type: "paragraph", text: "After." }]);
    const heading = texts(items).find((item) => item.lines.join(" ").includes("A very long heading"));
    expect(heading.lines.length).toBeGreaterThan(1);
    const rule = rects(items).find((item) => item.h < 2 && item.w > 15 && item.w < 30 && item.y > heading.y);
    expect(rule).toBeTruthy();
    expect(rule.y).toBeGreaterThanOrEqual(heading.y + heading.h - 1.5);
  });

  it("numbered rows grow with their text, never overlap, and have a gap between them", () => {
    const items = page([{ type: "paragraph", text: "Intro." }, { type: "bullet_list", items: [sentence.repeat(2)] }, { type: "divider" }, { type: "bullet_list", items: [sentence.repeat(2)] }, { type: "divider" }, { type: "bullet_list", items: ["Short."] }]);
    const rows = rects(items).filter((item) => item.w > 100).sort((a, b) => a.y - b.y);
    expect(rows.length).toBe(3);
    for (let index = 1; index < rows.length; index += 1) expect(rows[index].y - (rows[index - 1].y + rows[index - 1].h)).toBeGreaterThan(1);
    // each row's text stays inside its row
    for (const row of rows) for (const text of texts(items).filter((item) => item.y >= row.y && item.y < row.y + row.h && item.x > 10 && item.w > 100)) expect(text.y + text.h).toBeLessThanOrEqual(row.y + row.h + 0.5);
  });

  it("the left mark of a paragraph is short, not the whole paragraph", () => {
    const items = page([{ type: "paragraph", text: sentence.repeat(8) }]);
    const paragraph = texts(items).find((item) => item.lines.join(" ").includes("income statement"));
    const mark = rects(items).find((item) => item.w < 2 && item.h > 3);
    expect(paragraph.h).toBeGreaterThan(30);
    expect(mark.h).toBeLessThanOrEqual(10);
    expect(mark.y).toBeLessThanOrEqual(paragraph.y + 1);
  });

  it("table cells are all top-aligned even when a neighbour wraps", () => {
    const items = page([{ type: "paragraph", text: "Intro." }, { type: "vocabulary", word: "Enterprise Value", translation: sentence.repeat(2), example: "Short example." }]);
    const word = texts(items).find((item) => item.lines.join(" ").includes("Enterprise Value"));
    const example = texts(items).find((item) => item.lines.join(" ").includes("Short example"));
    expect(Math.abs(example.y - word.y)).toBeLessThan(0.5);
  });

  it("a title that wraps to two lines does not run into the content below the header", () => {
    const items = page([{ type: "document_header", title: "Key Concepts in Accounting: A Comprehensive Overview of Firm Valuation and Financial Statements" }, { type: "paragraph", text: "First paragraph of the body." }]);
    const title = texts(items).find((item) => item.lines.join(" ").includes("Key Concepts"));
    const body = texts(items).find((item) => item.lines.join(" ").includes("First paragraph"));
    expect(title.lines.length).toBeGreaterThan(1);
    expect(body.y).toBeGreaterThanOrEqual(title.y + title.h - 0.5);
  });
});


describe("question cards with their answers", () => {
  const long = "The primary goal of a for-profit firm is to maximize current shareholder value, which is estimated through enterprise value and the cost of capital over the long run.";
  const items: any[] = [
    { type: "multiple-choice", question: "What is the primary goal of a for-profit firm?", options: ["Maximizing value", "Market share", "Lower costs", "Satisfaction"], answer: "A", explanation: long.slice(0, 110), topic: "t" },
    { type: "true-false", question: "Deferred revenues are recognized immediately upon receipt.", answer: "false", explanation: "", topic: "t" },
    { type: "short-answer", question: "Explain why the median resists outliers.", answer: long, explanation: "", topic: "t" }
  ];
  const passages = [{ documentId: "d", documentName: "Accounting.pdf", chunkIndex: 2, heading: "2. Balance sheet", page: 2, content: "Deferred revenues are those recognized a bit later. The primary goal of a for-profit firm is to maximize current shareholder value. The median resists outliers because extreme values do not move the middle." }];
  const build = (subject = "Accounting") => {
    const plan: any = planOutput({ blocks: itemsToBlocks(items) as any, title: "Accounting Fundamentals · Quiz 1", framed: true, passages, subject, agentName: "Quiz Generator" });
    const doc: any = buildOutputDocument(plan, {});
    const layout = doc.template.layouts[0];
    const key = layout.views.find((view: any) => /answer/i.test(view.name));
    return { plan, doc, pages: layoutDocument(doc.template, doc.data, { layoutId: layout.id, viewId: key.id }).pages as any[] };
  };

  it("asks 'How sure are you?' on true / false too", () => {
    const text = build().pages.flatMap((p) => p.items).filter((i: any) => i.type === "text").map((i: any) => i.lines.join(" ")).join("\n");
    expect((text.match(/How sure are you\?/g) || []).length).toBe(3);
  });

  it("the true / false answer is a full-width green band that says False", () => {
    const items2 = build().pages.flatMap((p) => p.items);
    const word = items2.find((i: any) => i.type === "text" && /^false$/i.test(i.lines.join(" ")) && i.style.fontWeight === "bold");
    expect(word, JSON.stringify(items2.filter((i: any) => i.type === "text").map((i: any) => i.lines.join(" ")).slice(0, 40))).toBeTruthy();
    const band = items2.filter((i: any) => i.type === "rect" && i.w > 150 && i.h < 15).find((i: any) => word.y >= i.y - 0.5 && word.y + word.h <= i.y + i.h + 0.5);
    expect(band, JSON.stringify({ word: [word.x, word.y, word.w, word.h], rects: items2.filter((i: any) => i.type === "rect").map((i: any) => [i.x, i.y, i.w, i.h].map(Math.round)).slice(0, 30) })).toBeTruthy();
  });

  it("the answer band covers every line of a long answer", () => {
    const all = build().pages.flatMap((p) => p.items);
    const answer = all.find((i: any) => i.type === "text" && i.lines.join(" ").includes("maximize current shareholder value, which") && i.style.fontWeight === "bold");
    expect(answer.lines.length).toBeGreaterThan(1);
    const band = all.filter((i: any) => i.type === "rect" && i.w > 150).find((i: any) => answer.y >= i.y - 0.5 && answer.y < i.y + i.h);
    expect(answer.y + answer.h).toBeLessThanOrEqual(band.y + band.h + 0.6);
  });

  it("the blue edge runs the whole card, answer and source included, and cards do not touch", () => {
    const pages = build().pages;
    const first = pages[0].items as any[];
    const cards = first.filter((i) => i.type === "rect" && i.w > 150 && i.h > 25).sort((a, b) => a.y - b.y);
    const edges = first.filter((i) => i.type === "rect" && i.w < 3 && i.h > 20).sort((a, b) => a.y - b.y);
    expect(cards.length).toBeGreaterThanOrEqual(2);
    for (const card of cards) {
      const edge = edges.find((e) => Math.abs(e.y - card.y) < 0.6);
      expect(edge, "edge for card at " + card.y).toBeTruthy();
      expect(Math.abs(edge.y + edge.h - (card.y + card.h))).toBeLessThan(0.8);
    }
    for (let i = 1; i < cards.length; i += 1) expect(cards[i].y - (cards[i - 1].y + cards[i - 1].h)).toBeGreaterThanOrEqual(3.5);
  });

  it("the footer reads subject – what it is, and can be changed", () => {
    const { plan, doc } = build();
    expect(plan.footerText).toBe("Accounting – Quiz");
    const footer = (styles: any) => {
      const d: any = buildOutputDocument(plan, styles);
      const layout = d.template.layouts[0];
      return layoutDocument(d.template, d.data, { layoutId: layout.id }).pages[0].items.filter((i: any) => i.type === "text").map((i: any) => i.lines.join(" ")).join("|");
    };
    expect(footer({})).toContain("Accounting – Quiz");
    expect(footer({ "block-footer": { text: "My file name" } })).toContain("My file name");
    void doc;
  });
});


describe("quiz on slides", () => {
  const cite = { documentId: "d", documentName: "Accounting.pdf", chunkIndex: 2, headingPath: "2. Balance sheet", page: 2 };
  const items: any[] = [
    { type: "multiple-choice", question: "¿Cuál de las siguientes opciones NO es un componente del estado de resultados?", options: ["Ingresos", "Gastos", "Activos", "Ganancias"], answer: "Activos", explanation: "Los activos se reflejan en el balance general.", _sourceResolved: cite },
    { type: "true-false", question: "La ecuación contable es Activos = Pasivos + Patrimonio.", answer: "Verdadero", explanation: "", _sourceResolved: cite }
  ];
  const passages = [{ documentId: "d", documentName: "Accounting.pdf", chunkIndex: 2, heading: "2. Balance sheet", page: 2, content: "Assets = Liabilities + Shareholder's Equity. Assets are reported in the balance sheet, not in the income statement." }];
  const build = () => {
    const plan: any = planOutput({ blocks: itemsToBlocks(items) as any, title: "Contabilidad Básica · Quiz 1", framed: true, passages, subject: "Contabilidad Básica" });
    const doc: any = buildOutputDocument(plan, {});
    const layout = doc.template.layouts.find((l: any) => l.class === "slides");
    const key = layout.views.find((v: any) => /answer/i.test(v.name));
    return { layout, pages: layoutDocument(doc.template, doc.data, { layoutId: layout.id, viewId: key.id }).pages as any[] };
  };

  it("the cover has the title in the middle of its panel and no Name / Date lines", () => {
    const cover = build().pages[0].items as any[];
    expect(cover.some((i) => i.type === "line" && i.w > 30 && i.h < 1 && i.y < 100)).toBe(false);
    const panel = cover.filter((i) => i.type === "rect" && i.w > 100).sort((a, b) => b.w * b.h - a.w * a.h)[0];
    const title = cover.find((i) => i.type === "text" && i.lines.join(" ").includes("Contabilidad Básica · Quiz 1") && i.style.fontWeight === "bold");
    expect(Math.abs((title.y + title.h / 2) - (panel.y + panel.h / 2))).toBeLessThan(3);
    // the blue bar is as tall as the panel, not as tall as the hidden Name / Date row
    const bar = cover.find((i) => i.type === "rect" && i.w < 3 && i.h > 10);
    expect(Math.abs(bar.h - panel.h)).toBeLessThan(1);
  });

  it("each question sits in the middle of its slide, scaled up, with its source — even when the quiz is in another language than the document", () => {
    const { pages, layout } = build();
    const slide = pages[1];
    const card = slide.items.find((i: any) => i.type === "rect" && i.w > 150 && i.h > 40);
    expect(card.h).toBeGreaterThan(60); // an A4 card is 52 + 10 mm; scaled for the slide it is bigger
    const free = (slide.height - card.h);
    expect(card.y).toBeGreaterThan(layout.margins.top + 1); // not stuck to the top
    expect(card.y + card.h).toBeLessThan(slide.height - 1);
    expect(free).toBeGreaterThan(0);
    const text = slide.items.filter((i: any) => i.type === "text").map((i: any) => i.lines.join(" ")).join("\n");
    expect(text).toMatch(/Fuente|Source/);
    expect(text).toContain("Accounting.pdf");
  });
});
