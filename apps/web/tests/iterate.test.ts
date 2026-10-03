import { describe, expect, it } from "vitest";
import { composeRefinementPrompt, describeResult } from "../modules/ai-tools/pipeline/iterateContext.js";
import { BLOCKS, buildJsonSchema, conformBlocks } from "../modules/ai-tools/blocks/blockRegistry.js";

const blocks = [
  { type: "document_header", title: "Cash flow" },
  { type: "question_mc", number: 1, question: "What is cash flow?", options: ["a", "b", "c", "d"], answer_index: 2, points: 2, explanation: "Because." },
  { type: "paragraph", text: "Some text" },
  { type: "question_tf", number: 2, statement: "Cash is profit.", is_true: false, points: 1, explanation: null }
];

describe("describeResult", () => {
  it("numbers the parts, counts questions in reading order and lists the output fields", () => {
    const { outline, fieldNames, count } = describeResult({ blocks });
    expect(count).toBe(4);
    expect(outline).toContain("[2] Question 1 (question_mc)");
    expect(outline).toContain("[4] Question 2 (question_tf)");
    expect(outline).toContain("explanation: Because.");
    expect(fieldNames).toEqual(expect.arrayContaining(["question", "options", "answer_index", "explanation", "statement"]));
    expect(fieldNames).not.toContain("type");
  });
  it("describes plain items too, hiding the internal fields", () => {
    const { outline, fieldNames } = describeResult({ items: [{ word: "cat", translation: "gato", _source: "S1" }] });
    expect(outline).toBe("[1] Item 1 — word: cat; translation: gato");
    expect(fieldNames).toEqual(["word", "translation"]);
  });
  it("stays within its budget on long results", () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ type: "paragraph", text: "x".repeat(500) + i }));
    expect(describeResult({ blocks: many, maxChars: 4000 }).outline.length).toBeLessThan(5200);
  });
});

describe("composeRefinementPrompt", () => {
  it("states the scope and the exact targets", () => {
    const text = composeRefinementPrompt("change question 3 to ask about leases", { scope: "specific_items", brief: "Rewrite question 3.", targets: [{ ref: "Question 3 [7]", change: "ask about leases" }], checklist: ["Question 3 is about leases"], relax: [], keep: ["Every other question word for word"], fields: [] });
    expect(text).toContain("SCOPE: ONLY the targets listed below");
    expect(text).toContain("Question 3 [7]: ask about leases");
    expect(text).toContain("KEEP:");
  });
  it("names the field for a change in every item", () => {
    const text = composeRefinementPrompt("more detail in the answers", { scope: "one_field_everywhere", brief: "Longer explanations.", targets: [], fields: ["explanation", "answer_guide"], checklist: [], relax: [], keep: [] });
    expect(text).toContain("the field(s) explanation, answer_guide in EVERY item");
  });
});

describe("blocks held to the registry", () => {
  it("the schema only allows the registry's block types", () => {
    const schema = buildJsonSchema(["heading", "question_mc"]);
    expect(schema.items.properties.type.enum).toEqual(["heading", "question_mc"]);
    expect(schema.items.additionalProperties).toBe(false);
  });
  it("drops leaked fields, coerces types and discards blocks missing their content", () => {
    const out = conformBlocks([
      { type: "heading", text: " Intro ", level: "2", options: ["leaked"] },
      { type: "question_mc", question: "Q?", options: ["a", "b"], answer_index: 5 },
      { type: "question_mc", question: "Q?", options: ["a", "b", "c", "d"], answer_index: 1, points: null },
      { type: "question_tf", statement: "S", is_true: "false" },
      { type: "paragraph", text: "" },
      { type: "invented", text: "x" },
      { type: "paragraph", text: "Kept", _source: "S2" }
    ]);
    expect(out.map((block) => block.type)).toEqual(["heading", "question_mc", "question_tf", "paragraph"]);
    expect(out[0]).toMatchObject({ text: "Intro", level: 2 });
    expect(out[0]).not.toHaveProperty("options");
    expect(out[2]).toMatchObject({ is_true: false });
    expect((out[3] as any)._source).toBe("S2");
    expect(Object.keys(BLOCKS).length).toBeGreaterThan(10);
  });
});
