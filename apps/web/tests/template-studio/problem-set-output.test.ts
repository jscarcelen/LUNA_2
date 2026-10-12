import { describe, expect, it } from "vitest";
import { buildOutputDocument, itemsToBlocks, planOutput } from "../../modules/template-studio/output/outputDocument";
import { layoutDocument } from "../../modules/template-studio/engine/layout";
import { normalizeTemplate } from "../../modules/template-studio/engine/migrate";

const items: any[] = [
  { question: "Solve $2x+3=11$", type: "numeric", options: [], answer: "4", units: "m", worked_solution: "1. subtract 3: $2x=8$\n2. divide by 2: $x=4$" },
  { question: "Pick the price", type: "multiple-choice", options: ["$45", "$55", "$60"], answer: "55", worked_solution: "1. 50 × 1.1\n2. = 55" }
];
const build = (rows: any[]) => {
  const plan: any = planOutput({ blocks: itemsToBlocks(rows) as any, title: "Problem set", framed: false });
  const doc: any = buildOutputDocument(plan, {}, {});
  return { doc, template: normalizeTemplate(doc.compiled.templateV3) as any };
};
const linesOf = (template: any, data: any, layoutIndex: number, viewIndex: number) => {
  const layout = template.layouts[layoutIndex];
  const laid: any = layoutDocument(template, data, { layoutId: layout.id, viewId: layout.views[viewIndex].id });
  return { pages: laid.pages, text: laid.pages.flatMap((page: any) => page.items).filter((item: any) => item.type === "text").map((item: any) => (item.lines || []).join("|")) };
};

describe("a problem set as a document", () => {
  it("carries the unit and the worked steps into the answer key, and not into the student view", () => {
    const { doc, template } = build(items);
    expect(linesOf(template, doc.data, 0, 0).text.join("\n")).not.toContain("subtract 3");
    const key = linesOf(template, doc.data, 0, 1).text.join("\n");
    expect(key).toContain("4 m|1. subtract 3");
    expect(key).toContain("B · $55|1. 50 × 1.1|2. = 55"); // the answer "55" finds the option "$55"
  });
  it("a row with only the title or the suitability note does not turn the output into an automatic layout", () => {
    const blocks = itemsToBlocks([{ title: "Set 1", suitability: "" }, ...items]) as any[];
    expect(blocks).toHaveLength(2);
    const { doc } = build([{ title: "Set 1" }, ...items]);
    expect(doc.layouts.map((layout: any) => layout.label)).toEqual(["A4", "Letter", "Slides 16:9"]);
    expect(doc.views.map((view: any) => view.name)).toEqual(["Student view", "Answer key"]);
  });
  it("the slides are real 16:9 slides, one question each", () => {
    const { doc, template } = build(items);
    const layout = template.layouts[2];
    expect([layout.canvas.width, layout.canvas.height]).toEqual([254, 143]);
    const { pages } = linesOf(template, doc.data, 2, 0);
    const withQuestion = pages.filter((page: any) => page.items.some((item: any) => item.type === "text" && /Solve|Pick the price/.test((item.lines || []).join(" "))));
    expect(withQuestion).toHaveLength(2);
    for (const page of withQuestion) expect(page.items.filter((item: any) => item.type === "text" && /Solve|Pick the price/.test((item.lines || []).join(" ")))).toHaveLength(1);
  });
});
