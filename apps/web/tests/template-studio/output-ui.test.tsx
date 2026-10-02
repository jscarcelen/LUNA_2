import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { OutputPreviewPane, OutputStylePanel } from "../../modules/template-studio/output/OutputDesigner";
import { buildOutputDocument, itemsToBlocks, planOutput } from "../../modules/template-studio/output/outputDocument";

const plan = planOutput({
  blocks: itemsToBlocks([
    { question: "What is 2+2?", type: "multiple-choice", options: ["3", "4"], answer: "4" },
    { question: "True?", type: "true-false", options: ["True", "False"], answer: "True" }
  ])!,
  title: "Quiz",
  framed: true
})!;

describe("output designer UI", () => {
  it("lists every component with its Template Studio family and colours", () => {
    const html = renderToString(createElement(OutputStylePanel, { plan, styles: {}, onStylesChange: () => undefined, savedTemplates: [{ id: "t1", name: "My exam look" }] }));
    for (const text of ["Exam header", "Multiple choice", "True / false", "Footer", "One color for all", "Apply a saved template", "My exam look", "Blue", "Graphite"]) expect(html).toContain(text);
    expect(html).not.toContain("Output fields");
  });

  it("shows the page-size x view matrix", () => {
    const doc = buildOutputDocument(plan, {});
    const html = renderToString(createElement(OutputPreviewPane, { doc, selection: { layoutIndex: 0, viewIndex: 0 }, onSelection: () => undefined, dataJson: "[]", rawText: "", filename: "Quiz" }));
    for (const text of ["Student view", "Answer key", "A4", "Letter", "Slides 16:9", "Preview", "Data", "Raw"]) expect(html).toContain(text);
  });
});
