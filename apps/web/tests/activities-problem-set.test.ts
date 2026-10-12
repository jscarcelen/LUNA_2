import { describe, expect, it } from "vitest";
import { buildActivity, gradeActivity } from "../modules/activities/engine/activity";

const fields: any[] = [{ id: "i", name: "items", type: "array", children: [] }];

describe("a problem-set item becomes a question with its worked answer", () => {
  it("makes a numeric question and shows the step-by-step solution, unit and key maths", () => {
    const activity = buildActivity(fields, { items: [{ question: "A firm sells 40 units at $12. Revenue? Give your answer in dollars.", type: "numeric", options: [], answer: "480", units: "$", worked_solution: "1. Revenue = price × quantity.\n2. 12 × 40 = 480.", math_concepts: "basic arithmetic; percentages and ratios", explanation: "Total revenue." }] });
    const [question] = activity.questions;
    expect(question.kind).toBe("number");
    expect(question.answer).toBe("480");
    expect(question.steps).toEqual(["1. Revenue = price × quantity.", "2. 12 × 40 = 480."]); // one string per step, LaTeX kept raw
    expect(question.explanation).not.toContain("Step by step");
    expect(question.explanation).toContain("Unit: $");
    expect(question.explanation).toContain("Key math concepts: basic arithmetic; percentages and ratios");
  });
  it("splits a one-line numbered solution into steps and keeps its formulas as LaTeX", () => {
    const activity = buildActivity(fields, { items: [{ question: "Solve 2x+3=11.", type: "numeric", answer: "4", worked_solution: "Step 1: $2x = 11 - 3 = 8$ Step 2: $x = \\frac{8}{2} = 4$" }] });
    expect(activity.questions[0].steps).toEqual(["Step 1: $2x = 11 - 3 = 8$", "Step 2: $x = \\frac{8}{2} = 4$"]);
  });
  it("keeps true / false and multiple choice working", () => {
    const activity = buildActivity(fields, { items: [
      { question: "Which is the price after a 10% rise from $50?", type: "multiple-choice", options: ["$45", "$55", "$60", "$5"], answer: "$55", explanation: "x" },
      { question: "Demand is elastic when |e| > 1.", type: "true-false", options: ["True", "False"], answer: "True", explanation: "x" }
    ] });
    expect(activity.questions.map((question) => question.kind)).toEqual(["choice", "choice"]);
  });
});

describe("questions carry the skills they need into the attempt", () => {
  const rows = [
    { question: "Differentiate 3x^2 and give f'(2).", type: "numeric", answer: "12", requires_skills: ["Derivatives", "made-up-skill"], units: "" },
    { question: "Find the derivative of x^3 at x = 2.", type: "numeric", answer: "12" },
    { question: "What does GDP stand for?", type: "short-answer", answer: "Gross domestic product" }
  ];
  it("normalises declared tags, infers missing ones, and tags pure recall with none", () => {
    const [declared, inferred, recall] = buildActivity(fields, { items: rows }).questions;
    expect(declared.skills).toEqual(["derivatives"]);
    expect(inferred.skills).toContain("derivatives");
    expect(recall.skills).not.toContain("derivatives");
  });
  it("copies the skills onto every answered question", () => {
    const activity = buildActivity(fields, { items: rows });
    const attempt = (gradeActivity as any)(activity, Object.fromEntries(activity.questions.map((question: any) => [question.id, "0"])), {}) as any;
    expect(attempt.results[0].skills).toEqual(["derivatives"]);
    expect(attempt.results[0].correct).toBe(false);
  });
});

describe("the learner's working travels with the answer", () => {
  it("keeps the notes, a flag for the photo and the full-answer tick, but never the photo itself", () => {
    const activity = buildActivity(fields, { items: [{ question: "Differentiate x^2 at x=3", type: "numeric", answer: "6" }] });
    const id = activity.questions[0].id;
    const attempt = (gradeActivity as any)(activity, { [id]: "9" }, undefined, {}, {}, { [id]: { text: "2x = 6?", image: "data:image/jpeg;base64,AAAA", full: true } }) as any;
    expect(attempt.results[0].work).toEqual({ text: "2x = 6?", hasImage: true, full: true });
    expect(JSON.stringify(attempt)).not.toContain("base64");
    const bare = (gradeActivity as any)(activity, { [id]: "9" }, undefined, {}, {}, {}) as any;
    expect(bare.results[0].work).toBeUndefined();
  });
});

