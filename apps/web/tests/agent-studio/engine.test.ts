import { describe, expect, it } from "vitest";
import { createQuizSpec, createVocabularyFlashcardsSpec } from "../../modules/agent-studio/engine/model";
import { legacyFields, outputJsonSchema } from "../../modules/agent-studio/engine/schema";
import { compileAgent } from "../../modules/agent-studio/engine/compile";
import { validateOutput } from "../../modules/agent-studio/engine/validate";
import { applyPatches, applyQuickAction } from "../../modules/agent-studio/engine/improve";
import { runConfigFromSpec, specFromLegacy } from "../../modules/agent-studio/engine/migrate";
import { proposeMapping } from "../../modules/template-studio/engine/mapping";
import { createFlashcardStarter } from "../../modules/template-studio/engine/model";
import { schemaFromAgentFields } from "../../modules/template-studio/engine/mapping";

describe("schema", () => {
  it("generates strict JSON schema with items collection and descriptions", () => {
    const schema = outputJsonSchema(createVocabularyFlashcardsSpec().outputSchema) as any;
    expect(schema.properties.items.type).toBe("array");
    expect(schema.properties.items.items.properties.front.description).toBe("The word in language 1");
    expect(schema.properties.items.items.required).toEqual(["front", "back", "topic"]);
    expect(schema.additionalProperties).toBe(false);
  });
  it("flattens to legacy fields with descriptions", () => {
    const fields = legacyFields(createQuizSpec().outputSchema);
    expect(fields.map((f) => f.name)).toEqual(["question", "type", "options", "answer", "explanation", "topic", "difficulty"]);
    expect(fields[2].type).toBe("array");
    expect(fields[0].description).toContain("question text");
  });
});

describe("compiler", () => {
  it("renders instructions, output contract, user choices and examples", () => {
    const spec = createVocabularyFlashcardsSpec();
    const compiled = compileAgent(spec, { values: { [spec.inputs[0].id]: 5, [spec.inputs[1].id]: "French" } });
    expect(compiled.system).toContain("Create vocabulary flashcards");
    expect(compiled.system).toContain("front — The word in language 1 (text)");
    expect(compiled.system).toContain("Checks:");
    expect(compiled.user).toContain("Number of cards: 5");
    expect(compiled.user).toContain("Language 1: French");
    expect(compiled.user).toContain("Language 2: English (default)");
    expect(compiled.user).toContain("EXAMPLES OF GOOD OUTPUT");
    expect(compiled.model).toBe("gpt-4o-mini");
  });
});

describe("validation", () => {
  const spec = createVocabularyFlashcardsSpec();
  const count = spec.inputs[0].id;
  it("passes a correct output", () => {
    const checks = validateOutput(spec, { items: [{ front: "a", back: "b" }, { front: "c", back: "d" }] }, { [count]: 2 });
    expect(checks.every((c) => c.ok)).toBe(true);
    expect(checks.map((c) => c.rule)).toEqual(["valid_json", "required_fields", "count_matches_input", "no_duplicates"]);
  });
  it("flags count mismatch, duplicates and missing fields", () => {
    const checks = validateOutput(spec, { items: [{ front: "a" }, { front: "A", back: "x" }] }, { [count]: 3 });
    const byRule = Object.fromEntries(checks.map((c) => [c.rule, c.ok]));
    expect(byRule.required_fields).toBe(false);
    expect(byRule.count_matches_input).toBe(false);
    expect(byRule.no_duplicates).toBe(false);
  });
  it("checks answers against options for the quiz", () => {
    const quiz = createQuizSpec();
    const ok = validateOutput(quiz, { items: [{ question: "q", type: "t", options: ["x", "y"], answer: "y", explanation: "e", topic: "t", difficulty: "easy" }] });
    expect(ok.find((c) => c.rule === "answer_in_options")?.ok).toBe(true);
    const bad = validateOutput(quiz, { items: [{ question: "q", type: "t", options: ["x", "y"], answer: "z", explanation: "e", topic: "t", difficulty: "easy" }] });
    expect(bad.find((c) => c.rule === "answer_in_options")?.ok).toBe(false);
  });
});

describe("improve", () => {
  it("quick actions add a constraint and replace conflicting ones", () => {
    const spec = createVocabularyFlashcardsSpec();
    const harder = applyQuickAction(spec, "harder");
    expect(harder.spec.instructions.constraints.at(-1)).toContain("challenging");
    const easier = applyQuickAction(harder.spec, "easier");
    expect(easier.spec.instructions.constraints.some((c) => c.includes("challenging"))).toBe(false);
    expect(easier.changes).toHaveLength(1);
  });
  it("patches field descriptions by stable id", () => {
    const spec = createVocabularyFlashcardsSpec();
    const topic = spec.outputSchema[0].children![0].children![2];
    const { spec: next, changes } = applyPatches(spec, [{ target: "field.description", fieldId: topic.id, value: "One-word category" }]);
    expect(next.outputSchema[0].children![0].children![2].description).toBe("One-word category");
    expect(changes[0].path).toContain("Topic");
    expect(compileAgent(next).system).toContain("One-word category");
  });
});

describe("migration + integration", () => {
  it("round-trips a legacy agent config", () => {
    const legacy = { name: "Old", instructions: "Do X", questions: [{ id: "q1", text: "How many?", type: "number", required: true }, { id: "q2", text: "Level", type: "single-select", options: ["A", "B"] }], template: { fields: [{ name: "front", label: "Front", type: "string" }, { name: "tags", label: "Tags", type: "array" }] }, model: "gpt-4o", creativity: "low" };
    const spec = specFromLegacy(legacy);
    expect(spec.inputs.map((i) => i.type)).toEqual(["number", "choice"]);
    expect(spec.outputSchema[0].children![0].children!.map((f) => f.name)).toEqual(["Front", "Tags"]);
    const config = runConfigFromSpec(spec);
    expect(config.questions[1].options).toEqual(["A", "B"]);
    expect(config.template.fields.map((f) => f.name)).toEqual(["front", "tags"]);
    expect(config.outputJsonSchema).toBeTruthy();
    expect(config.model).toBe("gpt-4o");
  });
  it("a flashcard template maps onto the flashcard agent output", () => {
    const spec = createVocabularyFlashcardsSpec();
    const template = createFlashcardStarter();
    const schema = schemaFromAgentFields(legacyFields(spec.outputSchema));
    const proposals = proposeMapping(template.fields, schema);
    expect(proposals.map((p) => p.path).sort()).toEqual(["items", "items[].back", "items[].front", "items[].topic"]);
  });
});
