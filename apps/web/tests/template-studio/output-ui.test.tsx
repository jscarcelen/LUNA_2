import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { OutputPreviewPane, OutputStylePanel } from "../../modules/template-studio/output/OutputDesigner";
import { groupTemplates } from "../../modules/template-studio/output/TemplatePicker";
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
    for (const text of ["Exam header", "Multiple choice", "True / false", "Footer", "One color for all", "Apply a saved template", "Choose a template…", "Blue", "Graphite"]) expect(html).toContain(text);
    expect(html).not.toContain("Output fields");
  });

  it("shows the page-size x view matrix", () => {
    const doc = buildOutputDocument(plan, {});
    const html = renderToString(createElement(OutputPreviewPane, { doc, selection: { layoutIndex: 0, viewIndex: 0 }, onSelection: () => undefined, filename: "Quiz" }));
    for (const text of ["Student view", "Answer key", "A4", "Letter", "Slides 16:9", "Preview"]) expect(html).toContain(text);
    for (const text of ["Raw", "Data"]) expect(html).not.toContain(`>${text}<`);
  });

  it("groups saved templates by folder, named folders first and unfiled last", () => {
    const groups = groupTemplates([{ id: "1", name: "Loose" }, { id: "2", name: "Exams", folderId: "Maths" }, { id: "3", name: "Cards", folderId: "Biology" }, { id: "4", name: "Legacy", folderId: "tpl-folder-root" }]);
    expect(groups.map((group) => group.folder)).toEqual(["Biology", "Maths", ""]);
    expect(groups[2].items.map((entry) => entry.row.name)).toEqual(["Loose", "Legacy"]);
  });
});
