import { describe, expect, it } from "vitest";
import { createExamStarter, createFlashcardStarter, createField, createGroup, createLayout, createTemplate, createText, createView, flattenFields } from "../../modules/template-studio/engine/model";
import { layoutDocument } from "../../modules/template-studio/engine/layout";
import { buildSampleData } from "../../modules/template-studio/engine/sample";
import { applyMapping, proposeMapping, schemaFromAgentFields } from "../../modules/template-studio/engine/mapping";
import { migrateToV3, normalizeTemplate } from "../../modules/template-studio/engine/migrate";
import { renderHtml } from "../../modules/template-studio/engine/renderers";

const quizData = (count: number) => ({
  items: Array.from({ length: count }, (_, i) => ({ question: `Question ${i + 1} ${"lorem ipsum dolor ".repeat(i % 4)}`, options: ["a", "b", "c", "d"], answer: "correct-answer", topic: "Algebra" }))
});

describe("layout engine", () => {
  it("flows a repeating group across pages and repeats 'every page' headers", () => {
    const template = createExamStarter();
    const result = layoutDocument(template, quizData(14));
    expect(result.pages.length).toBeGreaterThan(1);
    expect(result.pages[1].continuation).toBe(true);
    const headerOnContinuation = result.pages[1].items.some((item) => item.type === "text" && item.lines.join(" ").includes("Mathematics 101"));
    expect(headerOnContinuation).toBe(true);
    const nameLineOnContinuation = result.pages[1].items.some((item) => item.type === "text" && item.lines.join(" ").startsWith("Name:"));
    expect(nameLineOnContinuation).toBe(false); // first-page scope
    expect(result.itemCounts[template.layouts[0].pages[0].elements[4].id]).toBe(14);
    expect(result.overflows).toHaveLength(0);
  });

  it("renders nested repeats (options inside each question) record-major", () => {
    const template = createExamStarter();
    const result = layoutDocument(template, quizData(2));
    const texts = result.pages[0].items.filter((item) => item.type === "text").map((item) => (item.type === "text" ? item.lines[0] : ""));
    const q1 = texts.indexOf("Question 1");
    const q2 = texts.findIndex((line) => line.startsWith("Question 2"));
    const optionsBetween = texts.slice(q1, q2).filter((line) => ["a", "b", "c", "d"].includes(line)).length;
    expect(q1).toBeGreaterThan(-1);
    expect(q2).toBeGreaterThan(q1);
    expect(optionsBetween).toBe(4);
  });

  it("hides view-scoped elements unless the view is active", () => {
    const template = createExamStarter();
    const layout = template.layouts[0];
    const student = layout.views[0].id;
    const answerKey = layout.views[1].id;
    const withoutAnswers = layoutDocument(template, quizData(1), { viewId: student });
    const withAnswers = layoutDocument(template, quizData(1), { viewId: answerKey });
    const hasAnswer = (pages: typeof withAnswers.pages) => pages[0].items.some((item) => item.type === "text" && item.lines[0] === "correct-answer");
    expect(hasAnswer(withoutAnswers.pages)).toBe(false);
    expect(hasAnswer(withAnswers.pages)).toBe(true);
  });

  it("emits one page per item for page-repeat groups", () => {
    const template = createFlashcardStarter();
    const result = layoutDocument(template, { items: [{ front: "a", back: "b", topic: "t" }, { front: "c", back: "d", topic: "t" }, { front: "e", back: "f", topic: "t" }] });
    expect(result.pages).toHaveLength(3);
    expect(result.pages[2].itemIndex).toBe(3);
  });

  it("applies view overrides (style/hidden) without duplicating pages", () => {
    const template = createTemplate("t");
    const layout = template.layouts[0];
    const text = createText({ type: "static", value: "Hello" });
    layout.pages[0].elements = [text];
    const view = createView("Loud", { overrides: { [text.id]: { style: { fontSize: 30 } } } });
    layout.views.push(view);
    const result = layoutDocument(template, {}, { viewId: view.id });
    const item = result.pages[0].items[0];
    expect(item.type === "text" && item.style.fontSize).toBe(30);
  });

  it("moves a flowing element that does not fit to the next page", () => {
    const template = createTemplate("t");
    template.layouts[0].pages[0].elements = [createText({ type: "static", value: "x".repeat(4000) }, { frame: { x: 12, y: 280, w: 50, h: 8 } })];
    const flowing = layoutDocument(template, {});
    expect(flowing.pages.length).toBe(2);
    expect(flowing.overflows.length).toBe(0);
  });

  it("lets a fixed block sit in the margin band, but reports one that runs off the page", () => {
    // Footers live below the bottom margin by design, so only the paper's edge binds them.
    const template = createTemplate("t");
    template.layouts[0].pages[0].elements = [createText({ type: "static", value: "Page 1" }, { placement: "fixed", frame: { x: 12, y: 288, w: 60, h: 6 } })];
    expect(layoutDocument(template, {}).overflows).toHaveLength(0);
    template.layouts[0].pages[0].elements = [createText({ type: "static", value: "x".repeat(4000) }, { placement: "fixed", frame: { x: 12, y: 290, w: 50, h: 8 } })];
    expect(layoutDocument(template, {}).overflows).toHaveLength(1);
  });
});

describe("sample data + mapping", () => {
  it("builds sample data shaped like the field tree", () => {
    const template = createExamStarter();
    const data = buildSampleData(template, 4) as any;
    expect(data.items).toHaveLength(4);
    expect(data.items[0].options).toHaveLength(3);
    expect(typeof data.items[0].question).toBe("string");
  });

  it("proposes mappings from an agent schema and applies them", () => {
    const template = createExamStarter();
    const schema = schemaFromAgentFields([
      { name: "question_text", type: "string" },
      { name: "options", type: "array" },
      { name: "answer", type: "string" },
      { name: "topic", type: "string" }
    ]);
    const proposals = proposeMapping(template.fields, schema);
    const byName = Object.fromEntries(flattenFields(template.fields).map((entry) => [entry.field.name, proposals.find((p) => p.fieldId === entry.field.id)?.path]));
    expect(byName.items).toBe("items");
    expect(byName.Question).toBe("items[].question_text");
    expect(byName.Options).toBe("items[].options");
    expect(byName.Answer).toBe("items[].answer");
    const mapping = Object.fromEntries(proposals.map((p) => [p.fieldId, p.path]));
    const reshaped = applyMapping(template.fields, mapping, { items: [{ question_text: "Q?", options: ["x", "y"], answer: "x", topic: "T" }] }) as any;
    expect(reshaped.items[0].question).toBe("Q?");
    expect(reshaped.items[0].options).toEqual(["x", "y"]);
  });
});

describe("migration", () => {
  it("migrates a v2 docModel template into a v3 flow group with fields", () => {
    const v2 = {
      name: "Old",
      docModel: { format: "a4-portrait", pageSize: { width: 210, height: 297 }, pages: [{ id: "p1", background: null, elements: [
        { id: "t", type: "text", x: 12, y: 12, w: 100, h: 8, content: "Title" },
        { id: "g", type: "group", x: 12, y: 30, w: 186, h: 40, repeat: { source: "items" }, children: [
          { id: "q", type: "field", x: 0, y: 0, w: 150, h: 8, path: "question", display: "text" },
          { id: "o", type: "field", x: 0, y: 10, w: 150, h: 20, path: "options", display: "choices" }
        ] }
      ] }] }
    };
    const template = migrateToV3(v2);
    expect(template.version).toBe(3);
    expect(template.fields.find((field) => field.name === "items")?.children?.[0].children?.map((field) => field.name)).toEqual(["question", "options"]);
    const result = layoutDocument(template, { items: [{ question: "Q1", options: ["a", "b"] }, { question: "Q2", options: ["c"] }] });
    const lines = result.pages[0].items.filter((item) => item.type === "text").map((item) => (item.type === "text" ? item.lines[0] : ""));
    expect(lines).toEqual(["Title", "Q1", "a", "b", "Q2", "c"]);
  });

  it("migrates legacy dataFields templates and normalises partial JSON", () => {
    const legacy = { name: "Legacy", dataFields: [{ name: "front", repeatScope: "per-output" }, { name: "back", repeatScope: "per-output" }] };
    const template = normalizeTemplate(legacy);
    expect(template.layouts[0].pages[0].elements.some((element) => element.type === "group")).toBe(true);
    expect(normalizeTemplate({ version: 3, name: "x", fields: [], layouts: [] }).layouts).toHaveLength(1);
  });
});

describe("renderers", () => {
  it("renders HTML pages through the shared layout", () => {
    const template = createExamStarter();
    const { html, pageCount } = renderHtml(template, quizData(3));
    expect(pageCount).toBe(1);
    expect(html).toContain("University Examination");
    expect((html.match(/<section class="doc-page"/g) || []).length).toBe(1);
  });
  it("creates a Presentation layout with the slides class", () => {
    const layout = createLayout("Presentation", "slides-16-9");
    expect(layout.class).toBe("slides");
    expect(layout.canvas.width).toBe(254);
    const group = createGroup({ repeat: { fieldId: createField("x", "array").id, mode: "grid", columns: 2 } });
    expect(group.repeat?.mode).toBe("grid");
  });
});
