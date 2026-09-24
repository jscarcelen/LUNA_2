import { describe, expect, it } from "vitest";
import { createField } from "../../modules/template-studio/engine/model";
import { templateFromFields } from "../../modules/template-studio/engine/autoTemplate";
import { assembleTemplate, type DesignedSection } from "../../modules/template-studio/engine/assemble";
import { buildSampleData } from "../../modules/template-studio/engine/sample";
import { layoutDocument } from "../../modules/template-studio/engine/layout";
import { importanceOf, templateFit } from "../../modules/template-studio/engine/fit";

const quizFields = () => [
  createField("Title", "text"),
  createField("Questions", "array", {
    sampleCount: 6,
    children: [createField("item", "object", {
      children: [
        createField("Question", "rich_text"),
        createField("Options", "array", { children: [createField("Option", "text")] }),
        createField("Answer", "text"),
        createField("Explanation", "text"),
        createField("Topic", "text")
      ]
    })]
  })
];

describe("a document designed from the output fields", () => {
  it("lays every field out, with the answers in their own view", () => {
    const template = templateFromFields(quizFields(), { name: "Quiz" });
    const views = template.layouts[0].views.map((view) => view.name);
    expect(views).toEqual(["Without answers", "With answers"]);
    const result = layoutDocument(template, buildSampleData(template, 6), {});
    expect(result.pages.length).toBeGreaterThan(0);
    expect(result.overflows).toHaveLength(0);
    const text = result.pages.flatMap((page) => page.items.flatMap((item: any) => item.lines || [])).join(" ");
    expect(text).toContain("What is the main function of chlorophyll");
    // The answer and the explanation belong to the answer view only.
    expect(text).not.toContain("It absorbs the light");
    expect(text).not.toContain("Chlorophyll captures light energy");
    const withAnswers = layoutDocument(template, buildSampleData(template, 6), { viewId: template.layouts[0].views[1].id })
      .pages.flatMap((page) => page.items.flatMap((item: any) => item.lines || [])).join(" ");
    expect(withAnswers).toContain("It absorbs the light");
  });

  it("puts one item per slide when asked for slides", () => {
    const template = templateFromFields(quizFields(), { kind: "slides" });
    expect(template.layouts[0].class).toBe("slides");
    // The list asks for 6 sample items, so a slide deck of 6 slides is expected.
    const result = layoutDocument(template, buildSampleData(template, 4), {});
    expect(result.pages.length).toBe(6);
  });
});

describe("assembling a described template", () => {
  const sections: DesignedSection[] = [
    {
      title: "Header", role: "header", repeats: false, placement: "flow", pageScope: "first",
      dsl: { name: "Header", description: "", fields: [{ name: "Topic", type: "text" }], list: null, height: 20, header: [], elements: [{ kind: "field", field: "Topic", x: 0, y: 0, w: 120, h: 10, size: 18, bold: true }] }
    },
    {
      title: "Words", role: "content", repeats: true, placement: "flow", pageScope: "page",
      dsl: {
        name: "Words", description: "", fields: [], height: 12, header: [{ kind: "text", text: "Word", x: 0, y: 0, w: 80, h: 6, size: 9 }],
        headerHeight: 8,
        list: { name: "Words", itemFields: [{ name: "Word", type: "text" }, { name: "Answer", type: "text" }] },
        elements: [{ kind: "field", field: "Word", x: 0, y: 0, w: 80, h: 6 }, { kind: "field", field: "Answer", x: 90, y: 0, w: 80, h: 6 }]
      }
    },
    {
      title: "Footer", role: "footer", repeats: false, placement: "fixed", pageScope: "every",
      dsl: { name: "Footer", description: "", fields: [], list: null, height: 6, header: [], elements: [{ kind: "text", text: "Page {{page}}", x: 0, y: 0, w: 60, h: 5, size: 8 }] }
    }
  ];

  it("stacks the sections, splits the repeating one across pages and keeps the footer on every page", () => {
    const template = assembleTemplate({ name: "Worksheet", canvas: "a4-portrait", views: [{ name: "Student", hideFields: ["Answer"] }, { name: "Teacher" }] }, sections);
    const data = buildSampleData(template, 40);
    const result = layoutDocument(template, data, {});
    expect(result.pages.length).toBeGreaterThan(1);
    // The footer is stamped once per page, never twice.
    const footers = result.pages.map((page) => page.items.filter((item: any) => (item.lines || []).join("").startsWith("Page ")).length);
    expect(footers.every((count) => count === 1)).toBe(true);
    // Words continue onto the second page instead of the section jumping whole.
    expect(result.pages[0].items.length).toBeGreaterThan(5);
  });

  it("hides the fields a view asks to hide", () => {
    const template = assembleTemplate({ name: "Worksheet", views: [{ name: "Student", hideFields: ["Answer"] }, { name: "Teacher" }] }, sections);
    const [student, teacher] = template.layouts[0].views;
    const answers = (viewId: string) => layoutDocument(template, buildSampleData(template, 3), { viewId })
      .pages.flatMap((page) => page.items.filter((item: any) => (item.lines || []).some((line: string) => line.startsWith("Answer")))).length;
    expect(answers(student.id)).toBe(0);
    expect(answers(teacher.id)).toBeGreaterThan(0);
  });
});

describe("template fit", () => {
  it("judges a template on the fields that carry the meaning", () => {
    const agentFields = [{ name: "Question" }, { name: "Answer" }, { name: "Topic" }, { name: "Difficulty" }];
    const complete = templateFit(agentFields, ["Question", "Answer", "Topic", "Difficulty"]);
    expect(complete.verdict).toBe("fits");
    const withoutExtras = templateFit(agentFields, ["Question", "Answer"]);
    expect(withoutExtras.missingEssential).toHaveLength(0);
    expect(withoutExtras.verdict).toBe("fits");
    const withoutAnswer = templateFit(agentFields, ["Question", "Topic", "Difficulty"]);
    expect(withoutAnswer.missingEssential.map((field) => field.name)).toEqual(["Answer"]);
    expect(withoutAnswer.verdict).not.toBe("fits");
  });

  it("reads importance from the field when the creator set it, and from the name otherwise", () => {
    expect(importanceOf({ name: "Topic" })).toBe("extra");
    expect(importanceOf({ name: "Question" })).toBe("essential");
    expect(importanceOf({ name: "Question", importance: "extra" })).toBe("extra");
  });
});
