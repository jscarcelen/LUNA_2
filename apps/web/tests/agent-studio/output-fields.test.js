import { describe, expect, it } from "vitest";
import { addOutputField, buildMappingRows, mergeKey } from "../../modules/ai-tools/tools/agent-builder/outputFields";

const slot = (name, frequency = "loop") => ({ id: `${name}-${Math.random()}`, name, label: name, dataType: "string", frequency });

describe("mapping rows", () => {
  it("treats singular, plural and differently spaced names as one slot", () => {
    expect(mergeKey("Questions")).toBe(mergeKey("Question"));
    expect(mergeKey("Answer options")).toBe(mergeKey("answer_option"));
    expect(mergeKey("Difficulties")).toBe(mergeKey("Difficulty"));
  });

  it("merges the same slot across question designs, keeping every underlying name", () => {
    const rows = buildMappingRows([
      slot("Questions", "once"),
      slot("Question"),
      slot("Question"),
      slot("Question text"),
      slot("Answer")
    ]);
    // "Question text" is a different slot: only names that mean the same thing merge.
    // The row takes the plainest of the merged names.
    expect(rows.map((row) => row.label)).toEqual(["Question", "Question text", "Answer"]);
    const questions = rows[0];
    expect(questions.count).toBe(3);
    expect(questions.names).toEqual(["Questions", "Question"]);
    // A slot that repeats anywhere is a per-item slot.
    expect(questions.frequency).toBe("loop");
  });

  it("keeps genuinely different slots apart", () => {
    const rows = buildMappingRows([slot("Title", "once"), slot("Subtitle", "once"), slot("Topic")]);
    expect(rows).toHaveLength(3);
  });
});

describe("adding an output field to an agent", () => {
  const agent = {
    name: "Quiz",
    template: { fields: [{ name: "Question", type: "string" }] },
    outputJsonSchema: {
      type: "object",
      properties: { items: { type: "array", items: { type: "object", properties: { Question: { type: "string" } }, required: ["Question"] } } },
      required: ["items"]
    },
    spec: { outputSchema: [{ id: "f1", name: "Questions", type: "array", children: [{ id: "f2", name: "item", type: "object", children: [{ id: "f3", name: "Question", type: "text" }] }] }] }
  };

  it("adds a per-item field to the fields, the JSON schema and the recipe", () => {
    const next = addOutputField(agent, { name: "Question number", type: "number" });
    expect(next.template.fields.map((field) => field.name)).toContain("Question number");
    expect(next.outputJsonSchema.properties.items.items.properties["Question number"]).toEqual({ type: "number" });
    expect(next.outputJsonSchema.properties.items.items.required).toContain("Question number");
    expect(next.spec.outputSchema[0].children[0].children.map((field) => field.name)).toContain("Question number");
    // The original is untouched.
    expect(agent.template.fields).toHaveLength(1);
  });

  it("adds a once-per-document field at the root of the output", () => {
    const next = addOutputField(agent, { name: "Title", frequency: "once" });
    expect(next.outputJsonSchema.properties.title).toEqual({ type: "string" });
    expect(next.outputJsonSchema.required).toContain("title");
    expect(next.spec.outputSchema.map((field) => field.name)).toContain("Title");
    expect(next.template.fields.find((field) => field.name === "Title").repeatScope).toBe("once");
  });

  it("ignores a name the agent already produces", () => {
    expect(addOutputField(agent, { name: "question" })).toBe(agent);
  });
});
