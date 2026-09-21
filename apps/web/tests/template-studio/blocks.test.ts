import { describe, expect, it } from "vitest";
import { createField, createTemplate, walkElements } from "../../modules/template-studio/engine/model";
import { layoutDocument } from "../../modules/template-studio/engine/layout";
import { buildSampleData } from "../../modules/template-studio/engine/sample";
import { ACCENT_PRESETS, blockFromElements, builtInBlocks, instantiateBlock } from "../../modules/template-studio/engine/blocks";
import type { GroupElement } from "../../modules/template-studio/engine/types";

const byName = (name: string) => builtInBlocks().find((block) => block.name === name)!;

describe("blocks", () => {
  it("inserting a block adds its fields, remaps ids and binds elements to the new ids", () => {
    const template = createTemplate("T");
    const { fields, elements } = instantiateBlock(byName("Exam question"), template.fields);
    const questions = fields.find((field) => field.name === "Questions")!;
    expect(questions.type).toBe("array");
    const group = elements[0] as GroupElement;
    expect(group.repeat?.fieldId).toBe(questions.id);
    const ids = new Set<string>();
    walkElements(elements, (element) => { ids.add(element.id); });
    const originalIds = new Set<string>();
    walkElements(byName("Exam question").elements, (element) => { originalIds.add(element.id); });
    expect([...ids].some((id) => originalIds.has(id))).toBe(false);
  });

  it("reuses an existing array with the same name instead of duplicating it", () => {
    const template = createTemplate("T");
    const question = createField("Question", "rich_text");
    template.fields = [createField("Questions", "array", { children: [createField("item", "object", { children: [question] })] })];
    const { fields, elements } = instantiateBlock(byName("Open question"), template.fields);
    expect(fields.filter((field) => field.name === "Questions")).toHaveLength(1);
    const item = fields[0].children![0];
    expect(item.children!.map((field) => field.name)).toEqual(["Question", "Points"]);
    let bound = "";
    walkElements(elements, (element) => { if (element.type === "text" && element.source.type === "field" && element.placeholder?.startsWith("Explain")) bound = element.source.fieldId; });
    expect(bound).toBe(question.id);
  });

  it("applies toggles and the chosen accent", () => {
    const { elements } = instantiateBlock(byName("Exam question"), [], { accent: ACCENT_PRESETS[2], toggles: { number: false, points: true, answer: false } });
    const names: string[] = [];
    const colours: string[] = [];
    walkElements(elements, (element) => { names.push(element.name || ""); colours.push(element.style.fill || "", element.style.stroke || "", element.style.color || ""); });
    expect(names).not.toContain("Number");
    expect(names).not.toContain("Answer");
    expect(names).toContain("Points");
    expect(colours).toContain(ACCENT_PRESETS[2].main);
    expect(colours).toContain(ACCENT_PRESETS[2].tint);
    expect(colours).not.toContain(ACCENT_PRESETS[0].main);
    expect(colours).not.toContain(ACCENT_PRESETS[0].tint);
  });

  it("numbers repeated items with {{n}} and lays out sample data", () => {
    const template = createTemplate("T");
    const { fields, elements } = instantiateBlock(byName("Key points"), template.fields);
    template.fields = fields;
    template.layouts[0].pages[0].elements = elements;
    const data = buildSampleData(template, 3);
    const result = layoutDocument(template, data);
    const texts = result.pages.flatMap((page) => page.items.filter((item) => item.type === "text").map((item) => (item as { lines: string[] }).lines.join(" ")));
    expect(texts).toContain("1");
    expect(texts).toContain("3");
  });

  it("saving a selection as a block keeps only the fields it uses", () => {
    const template = createTemplate("T");
    const { fields, elements } = instantiateBlock(byName("Document structure"), template.fields);
    const unused = createField("Unused", "text");
    const block = blockFromElements(elements, [...fields, unused], { name: "My doc" });
    expect(block.fields.map((field) => field.name)).toEqual(["Title", "Subtitle", "Sections"]);
    const sections = block.fields[2];
    expect(sections.children).toHaveLength(1);
    expect(sections.children![0].type).toBe("object");
    expect(sections.children![0].children!.map((field) => field.name)).toEqual(["Heading", "Body"]);
    expect(block.category).toBe("custom");
    // and it round-trips through insertion
    const again = instantiateBlock(block, []);
    expect(again.fields.map((field) => field.name)).toEqual(["Title", "Subtitle", "Sections"]);
  });
});

describe("simple design + families", () => {
  it("stacks top-level blocks in order inside the margins and keeps footers pinned", async () => {
    const { createLayout, stackElements, simpleOrder } = await import("../../modules/template-studio/engine/model");
    const layout = createLayout("Doc", "a4-portrait");
    const header = instantiateBlock(byName("Header"), []).elements[0];
    const section = instantiateBlock(byName("Section + questions"), []).elements[0];
    const footer = instantiateBlock(builtInBlocks().find((b) => b.id === "block-footer")!, []).elements[0];
    const stacked = stackElements(simpleOrder([section, footer, header].map((e, i) => ({ ...e, frame: { ...e.frame, y: e.id === footer.id ? 280 : 100 - i * 10 } })), layout), layout);
    expect(stacked[0].frame.y).toBe(layout.margins.top);
    expect(stacked[1].frame.y).toBe(layout.margins.top + stacked[0].frame.h + 4);
    expect(stacked[2].frame.y).toBe(280);
    expect(stacked[0].frame.w).toBe(layout.canvas.width - layout.margins.left - layout.margins.right);
  });

  it("groups blocks into families with variants and nested section lists lay out per section", async () => {
    const { blockFamilies } = await import("../../modules/template-studio/engine/blocks");
    const families = blockFamilies(builtInBlocks());
    expect(families.find((f) => f.family === "Question card")!.variants.length).toBeGreaterThanOrEqual(3);
    const template = createTemplate("T");
    const { fields, elements } = instantiateBlock(byName("Section + questions"), template.fields);
    template.fields = fields;
    template.layouts[0].pages[0].elements = elements;
    const data = { sections: [{ section_title: "A", section_intro: "", questions: [{ question: "q1", options: ["x", "y"], answer: "x" }, { question: "q2", options: ["x"], answer: "x" }] }, { section_title: "B", section_intro: "", questions: [{ question: "q3", options: ["z"], answer: "z" }] }] };
    const result = layoutDocument(template, data);
    const texts = result.pages.flatMap((page) => page.items.filter((item) => item.type === "text").map((item) => (item as { lines: string[] }).lines.join(" ")));
    expect(texts).toContain("SECTION 2");
    expect(texts.filter((t) => /^q[123]$/.test(t))).toHaveLength(3);
  });
});

describe("one-of designs (show only when)", () => {
  it("renders the variant matching each item's Type and fits its height", () => {
    const template = createTemplate("T");
    const { fields, elements } = instantiateBlock(byName("Question (any type)"), template.fields, { toggles: { number: true, answer: false } });
    template.fields = fields;
    template.layouts[0].pages[0].elements = elements;
    const data = { questions: [{ type: "multiple_choice", question: "MC?", options: ["a", "b"], answer: "a" }, { type: "true_false", question: "TF?", options: [], answer: "true" }, { type: "open", question: "Open?", options: [], answer: "" }] };
    const result = layoutDocument(template, data);
    const texts = result.pages.flatMap((page) => page.items.filter((item) => item.type === "text").map((item) => (item as { lines: string[] }).lines.join(" ")));
    expect(texts).toContain("MC?");
    expect(texts).toContain("TF?");
    expect(texts).toContain("Open?");
    expect(texts.filter((t) => t === "True")).toHaveLength(1);
    expect(texts.filter((t) => t === "a")).toHaveLength(1);
    // Sample data cycles through the Type options so every design shows up in previews.
    const sample = buildSampleData(template, 3) as { questions: { type: string }[] };
    expect(sample.questions.map((q) => q.type)).toEqual(["multiple_choice", "true_false", "open"]);
  });
});

describe("agent-ordered content + placement", () => {
  it("builds a sequence block from chosen designs and lays items out by Type in agent order", async () => {
    const { buildSequenceBlock } = await import("../../modules/template-studio/engine/blocks");
    const lib = builtInBlocks();
    const pick = (id: string) => lib.find((b) => b.id === id)!;
    const seq = buildSequenceBlock([{ block: pick("block-section-header"), typeValue: "section" }, { block: pick("block-exam-question"), typeValue: "mc" }, { block: pick("block-callout"), typeValue: "callout" }], "Content");
    const template = createTemplate("T");
    const { fields, elements } = instantiateBlock(seq, template.fields);
    template.fields = fields;
    template.layouts[0].pages[0].elements = elements;
    const item = fields[0].children![0].children!.map((f) => f.name);
    expect(fields[0].name).toBe("Content");
    expect(item).toContain("Type");
    expect(item).toContain("Section title");
    expect(item).toContain("Question");
    expect(item).toContain("Note");
    const data = { content: [{ type: "section", section_title: "Part A" }, { type: "mc", question: "Q1?", options: ["a", "b"], answer: "a" }, { type: "callout", note: "Tip!" }, { type: "mc", question: "Q2?", options: ["c"], answer: "c" }] } as unknown as Parameters<typeof layoutDocument>[1];
    const result = layoutDocument(template, data);
    const texts = result.pages.flatMap((page) => page.items.filter((i) => i.type === "text").map((i) => (i as { lines: string[] }).lines.join(" ")));
    expect(texts.indexOf("Part A")).toBeLessThan(texts.indexOf("Q1?"));
    expect(texts.indexOf("Q1?")).toBeLessThan(texts.indexOf("Tip!"));
    expect(texts.indexOf("Tip!")).toBeLessThan(texts.indexOf("Q2?"));
  });

  it("a fixed block caps the flow above it and a new_page block starts on a fresh page", () => {
    const template = createTemplate("T");
    const { fields, elements } = instantiateBlock(byName("Exam question"), template.fields);
    template.fields = fields;
    const flow = elements[0];
    const fixed = { ...instantiateBlock(byName("Callout"), fields).elements[0], placement: "fixed" as const, frame: { x: 12, y: 150, w: 186, h: 16 } };
    template.layouts[0].pages[0].elements = [flow, fixed];
    const result = layoutDocument(template, buildSampleData(template, 6));
    const firstPage = result.pages[0];
    const calloutOnFirst = firstPage.items.find((i) => i.elementId === fixed.id);
    expect(calloutOnFirst && calloutOnFirst.y).toBe(150);
    const questionBottoms = firstPage.items.filter((i) => i.type === "rect" && i.y < 150 && i.h > 20).map((i) => i.y + i.h);
    expect(Math.max(...questionBottoms)).toBeLessThanOrEqual(150 + 0.5);
    expect(result.pages.length).toBeGreaterThan(1);
    const np = { ...instantiateBlock(byName("Key points"), fields).elements[0], placement: "new_page" as const };
    template.layouts[0].pages[0].elements = [flow, np];
    const result2 = layoutDocument(template, buildSampleData(template, 2));
    expect(result2.pages.length).toBe(2);
  });
});

describe("migration of stored compositions", () => {
  it("keeps a v3 template object intact (agent output compositions round-trip)", async () => {
    const { migrateToV3, normalizeTemplate } = await import("../../modules/template-studio/engine/migrate");
    const template = createTemplate("Summary generator");
    const { fields, elements } = instantiateBlock(byName("Header"), template.fields);
    template.fields = fields;
    template.layouts[0].pages[0].elements = elements;
    const back = normalizeTemplate(migrateToV3(JSON.parse(JSON.stringify(template))));
    expect(back.layouts[0].pages[0].elements.map((e) => e.name)).toEqual(["Header"]);
    expect(back.fields.map((f) => f.name)).toEqual(fields.map((f) => f.name));
  });
});

describe("activities", () => {
  it("derives questions from generated data and grades an attempt", async () => {
    const { buildActivity, gradeActivity } = await import("../../modules/activities/engine/activity");
    const template = createTemplate("Quiz");
    const seq = instantiateBlock(byName("Multiple choice (kids)"), template.fields);
    const blanks = instantiateBlock(byName("Fill in the blanks"), seq.fields);
    const pairs = instantiateBlock(byName("Match the pairs"), blanks.fields);
    const data = {
      title: "Animals",
      questions: [{ question: "Which animal says moo?", options: ["Cow", "Cat"], answer: "Cow" }, { question: "Which flies?", options: ["Dog", "Bird"], answer: "B" }],
      sentences: [{ sentence: "The ____ is shining.", answer: "sun" }],
      pairs: [{ left: "Apple", right: "Manzana" }, { left: "Dog", right: "Perro" }]
    } as unknown as Record<string, unknown>;
    const activity = buildActivity(pairs.fields, data);
    expect(activity.title).toBe("Animals");
    expect(activity.questions.map((q) => q.kind)).toEqual(["choice", "choice", "text", "match"]);
    expect(activity.questions[1].answer).toBe("Bird");
    const attempt = gradeActivity(activity, { questions_1: "Cow", questions_2: "Dog", sentences_1: " Sun ", pairs_match: { Apple: "Manzana", Dog: "Perro" } });
    expect(attempt.score).toBe(3);
    expect(attempt.total).toBe(4);
    expect(attempt.results[1].correct).toBe(false);
  });
});

describe("component DSL", () => {
  it("converts a chatbot component into a repeating grid block with visible fields", async () => {
    const { blockFromDsl } = await import("../../modules/template-studio/engine/componentDsl");
    const block = blockFromDsl({
      name: "Word pairs 3×3", description: "match pairs", fields: [{ name: "Title", type: "text" }],
      list: { name: "WordPairs", itemFields: [{ name: "Word", type: "text" }, { name: "Match", type: "text" }, { name: "Answer", type: "text" }], columns: 3 },
      header: [{ kind: "text", text: "Match the pairs", x: 0, y: 0, w: 186, h: 10, size: 18, bold: true, align: "center" }, { kind: "field", field: "Title", x: 0, y: 10, w: 186, h: 6 }],
      elements: [{ kind: "box", x: 0, y: 0, w: 59, h: 30, fill: "#e3f1ff", radius: 3 }, { kind: "field", field: "Word", x: 3, y: 3, w: 53, h: 10, size: 12, bold: true }, { kind: "field", field: "Match", x: 3, y: 16, w: 53, h: 10, size: 12 }, { kind: "field", field: "Answer", x: 3, y: 27, w: 53, h: 4, size: 6.5 }],
      height: 32, headerHeight: 18
    });
    expect(block.fields.map((f) => f.name)).toEqual(["Title", "WordPairs"]);
    const template = createTemplate("T");
    const { fields, elements } = instantiateBlock(block, template.fields);
    template.fields = fields;
    template.layouts[0].pages[0].elements = elements;
    const result = layoutDocument(template, buildSampleData(template, 6));
    const texts = result.pages[0].items.filter((i) => i.type === "text").map((i) => (i as { lines: string[] }).lines.join(" "));
    expect(texts.filter((t) => /^Word( \(\d\))?$/.test(t))).toHaveLength(6);
    const rects = result.pages[0].items.filter((i) => i.type === "rect");
    expect(rects.length).toBeGreaterThanOrEqual(6);
    expect(Math.max(...rects.map((r) => r.x + r.w))).toBeLessThanOrEqual(198.5);
  });
});

describe("tile puzzle activity", () => {
  it("turns edge tiles into one rebuild-the-grid question and grades placement", async () => {
    const { buildActivity, gradeActivity } = await import("../../modules/activities/engine/activity");
    const template = createTemplate("P");
    const { fields } = instantiateBlock(byName("Square puzzle"), template.fields);
    const tiles = Array.from({ length: 4 }, (_, i) => ({ top: i < 2 ? "" : `t${i}`, right: i % 2 === 0 ? `r${i}` : "", bottom: i < 2 ? `b${i}` : "", left: i % 2 === 1 ? `l${i}` : "" }));
    const activity = buildActivity(fields, { title: "Puzzle", tiles } as unknown as Record<string, unknown>);
    expect(activity.questions.map((q) => q.kind)).toEqual(["tiles"]);
    expect(activity.questions[0].columns).toBe(2);
    expect(gradeActivity(activity, { tiles_tiles: [0, 1, 2, 3] }).score).toBe(1);
    expect(gradeActivity(activity, { tiles_tiles: [1, 0, 2, 3] }).score).toBe(0);
  });
});
