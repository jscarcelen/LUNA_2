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
