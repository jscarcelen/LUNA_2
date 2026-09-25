import { describe, expect, it } from "vitest";
import { createField, createGroup, createPage, createShape, createTemplate, createText, defaultStyle } from "../../modules/template-studio/engine/model";
import { critiqueTemplate, polishTemplate } from "../../modules/template-studio/engine/critique";
import { createExamTemplate } from "../../modules/template-studio/engine/starters";

/** A template with the three mistakes a generator makes most often. */
function messyTemplate() {
  const template = createTemplate("Messy");
  const question = createField("Question", "text");
  const answer = createField("Answer", "text");
  const items = createField("Items", "array", { children: [createField("item", "object", { children: [question, answer] })] });
  template.fields = [items];
  template.layouts[0].pages = [createPage({
    elements: [
      createGroup({
        name: "Item", frame: { x: 12, y: 12, w: 186, h: 20 }, layout: { mode: "free", gap: 0 },
        repeat: { fieldId: items.id, mode: "flow" },
        children: [
          // A badge with no card behind it: the design reaches for a shape and then forgets the background.
          createShape("ellipse", { frame: { x: 0, y: 0, w: 6, h: 6 }, style: defaultStyle({ fill: "#0071e3", stroke: "" }) }),
          createText({ type: "field", fieldId: question.id }, { frame: { x: 0, y: 0, w: 120, h: 8 }, style: defaultStyle({ fontSize: 11 }) }),
          // Sits on top of the question, and is far too small to read.
          createText({ type: "field", fieldId: answer.id }, { frame: { x: 10, y: 2, w: 120, h: 8 }, style: defaultStyle({ fontSize: 4 }) })
        ]
      })
    ]
  })];
  return template;
}

describe("the design critic", () => {
  it("finds overlapping text, unreadable type and blocks with no card", () => {
    const issues = critiqueTemplate(messyTemplate());
    const kinds = issues.map((issue) => issue.kind);
    expect(kinds).toContain("overlap");
    expect(kinds).toContain("tiny_text");
    expect(kinds).toContain("no_card");
  });

  it("repairs what it finds and says how much it fixed", () => {
    const result = polishTemplate(messyTemplate());
    expect(result.fixed).toBeGreaterThan(0);
    expect(result.after.filter((issue) => issue.kind === "tiny_text")).toHaveLength(0);
    expect(result.after.filter((issue) => issue.kind === "overlap")).toHaveLength(0);
  });

  it("leaves a hand-made template alone", () => {
    const issues = critiqueTemplate(createExamTemplate());
    expect(issues.filter((issue) => issue.kind === "overlap" || issue.kind === "tiny_text" || issue.kind === "off_page")).toHaveLength(0);
  });
});
