import { describe, expect, it } from "vitest";
import { assembleTemplate } from "../../modules/template-studio/engine/assemble";
import { buildSampleData } from "../../modules/template-studio/engine/sample";
import { layoutDocument } from "../../modules/template-studio/engine/layout";
import { critiqueTemplate, faultsOf } from "../../modules/template-studio/engine/critique";
import type { GroupElement } from "../../modules/template-studio/engine/types";

/** What the planner returns for "a quiz with a header, questions and a footer". */
const brief = {
  name: "Year 8 Biology Quiz",
  canvas: "a4-portrait",
  accent: "#0071e3",
  views: [{ name: "Student", description: "", hideFields: ["Answer"] }, { name: "Answer key", description: "", hideFields: [] }]
};
const sections = [
  { title: "Quiz header", role: "header", request: "", repeats: false, placement: "flow", pageScope: "first", blockName: "Header", blockOptions: ["namedate"], dsl: null },
  { title: "Questions", role: "content", request: "", repeats: true, placement: "flow", pageScope: "page", blockName: "Exam question", blockOptions: ["number", "points", "confidence"], dsl: null },
  { title: "Footer", role: "footer", request: "", repeats: false, placement: "fixed", pageScope: "every", blockName: "Footer", blockOptions: ["page"], dsl: null }
];

describe("a template assembled from house components", () => {
  const template = assembleTemplate(brief as never, sections as never);

  it("keeps the component's own card as the repeating item, not the options inside it", () => {
    const groups = template.layouts[0].pages[0].elements.filter((element): element is GroupElement => element.type === "group");
    const repeating = groups.filter((group) => group.repeat);
    expect(repeating).toHaveLength(1);
    const list = template.fields.find((field) => field.type === "array");
    // The card repeats per question; "Options" repeats inside it.
    expect(list?.name).toBe("Questions");
    expect(repeating[0].repeat?.fieldId).toBe(list?.id);
    expect(repeating[0].children.some((child) => child.type === "group" && child.repeat)).toBe(true);
  });

  it("actually draws one card per question, and passes the critic", () => {
    const data = buildSampleData(template, 6);
    const result = layoutDocument(template, data as never, {});
    // Six questions in the data, six question cards drawn — across as many pages as they need.
    const drawn = result.pages
      .flatMap((page) => page.items)
      .filter((item) => item.type === "text" && item.lines.join(" ").toLowerCase().includes("organelle"));
    expect(drawn).toHaveLength(6);
    expect(result.pages.length).toBeGreaterThan(1);
    expect(faultsOf(critiqueTemplate(template, data as never))).toEqual([]);
  });

  it("carries the options the planner switched on, including the confidence check", () => {
    const printed: string[] = [];
    const walk = (list: import("../../modules/template-studio/engine/types").Element[]) => {
      for (const element of list) {
        if (element.type === "text" && element.source.type === "static") printed.push(element.source.value);
        if (element.type === "group") walk(element.children);
      }
    };
    walk(template.layouts[0].pages[0].elements);
    expect(printed).toContain("How sure are you?");
  });
});
