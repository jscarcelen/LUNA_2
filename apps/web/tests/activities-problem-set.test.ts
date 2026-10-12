import { describe, expect, it } from "vitest";
import { buildActivity } from "../modules/activities/engine/activity";

const fields: any[] = [{ id: "i", name: "items", type: "array", children: [] }];

describe("a problem-set item becomes a question with its worked answer", () => {
  it("makes a numeric question and shows the step-by-step solution, unit and key maths", () => {
    const activity = buildActivity(fields, { items: [{ question: "A firm sells 40 units at $12. Revenue? Give your answer in dollars.", type: "numeric", options: [], answer: "480", units: "$", worked_solution: "1. Revenue = price × quantity.\n2. 12 × 40 = 480.", math_concepts: "basic arithmetic; percentages and ratios", explanation: "Total revenue." }] });
    const [question] = activity.questions;
    expect(question.kind).toBe("number");
    expect(question.answer).toBe("480");
    expect(question.explanation).toContain("Step by step:");
    expect(question.explanation).toContain("Unit: $");
    expect(question.explanation).toContain("Key math concepts: basic arithmetic; percentages and ratios");
  });
  it("keeps true / false and multiple choice working", () => {
    const activity = buildActivity(fields, { items: [
      { question: "Which is the price after a 10% rise from $50?", type: "multiple-choice", options: ["$45", "$55", "$60", "$5"], answer: "$55", explanation: "x" },
      { question: "Demand is elastic when |e| > 1.", type: "true-false", options: ["True", "False"], answer: "True", explanation: "x" }
    ] });
    expect(activity.questions.map((question) => question.kind)).toEqual(["choice", "choice"]);
  });
});
