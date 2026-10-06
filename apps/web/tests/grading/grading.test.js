import { describe, expect, it } from "vitest";
import { applyGrades, causeFor, creditOf, gradeLocally, needsModel, scoreOf } from "../../modules/activities/grading.js";
import { gradeActivity } from "../../modules/activities/engine/activity";

const grade = (given, expected, language) => gradeLocally({ given, expected, language });

describe("local grading of written answers", () => {
  it("accepts an identical answer however it is written", () => {
    expect(grade("  Mitochondria. ", "mitochondria").verdict).toBe("correct");
    expect(grade("U.S.A.", "USA").verdict).toBe("correct");
    expect(grade("Ácido", "acido").verdict).toBe("correct");
  });

  it("settles blank answers without any model", () => {
    const blank = grade("   ", "mitochondria");
    expect(blank).toMatchObject({ verdict: "incorrect", score: 0, blank: true, makesSense: false });
  });

  it("compares numbers as numbers, within a tolerance", () => {
    expect(grade("3.14", "3.1416").verdict).toBe("correct"); // rounding
    expect(grade("0,75", "3/4").verdict).toBe("correct");
    expect(grade("42", "42 m").verdict).toBe("correct");
    expect(grade("48", "54").verdict).toBe("incorrect");
    expect(grade("1.27", "1.25")).toMatchObject({ verdict: "close", score: 0.5 });
  });

  it("calls a wrong sign, a wrong unit or swapped values close, not wrong", () => {
    expect(grade("-12", "12").verdict).toBe("close");
    expect(grade("12 cm", "12 m").verdict).toBe("close");
    expect(grade("(3, 2)", "(2, 3)").verdict).toBe("close");
  });

  it("judges words by the key terms of the expected answer", () => {
    expect(grade("Mitochondria produce the energy of the cell", "mitochondria produce energy").verdict).toBe("correct");
    expect(grade("They make energy", "mitochondria produce energy for the cell").verdict).not.toBe("correct");
    expect(grade("adds them", "multiplies them").verdict).toBe("incorrect");
    expect(grade("The liver", "the kidney").verdict).toBe("incorrect");
  });

  it("calls a typo close and a contradiction wrong", () => {
    expect(grade("mitocondria", "mitochondria").verdict).toBe("close");
    expect(grade("It is not a prime number", "It is a prime number").verdict).toBe("incorrect");
  });

  it("says when the text is not an answer at all", () => {
    expect(grade("qwrtpsdf", "photosynthesis").makesSense).toBe(false);
    expect(grade("????", "photosynthesis").makesSense).toBe(false);
    expect(grade("it makes sugar from light", "photosynthesis").makesSense).toBe(true);
  });

  it("writes its feedback in the learner's language", () => {
    expect(grade("x", "y", "es").feedback).toMatch(/respuesta esperada/);
    expect(grade("x", "y", "English").feedback).toMatch(/expected answer/);
  });

  it("sends only open answers that need judging to the model", () => {
    expect(needsModel({ kind: "choice", given: "a", expected: "b" })).toBe(false);
    expect(needsModel({ kind: "text", given: "", expected: "b" })).toBe(false);
    expect(needsModel({ kind: "text", given: "B ", expected: "b" })).toBe(false);
    expect(needsModel({ kind: "text", given: "42", expected: "43" })).toBe(false);
    expect(needsModel({ kind: "number", given: "42", expected: "43" })).toBe(false);
    expect(needsModel({ kind: "text", given: "it keeps water in", expected: "osmosis is the movement of water" })).toBe(true);
  });
});

describe("cause of a graded answer", () => {
  it("is accuracy for close, analytical for wrong maths, knowledge for wrong anything else", () => {
    expect(causeFor({ verdict: "correct", quantitative: true })).toBeNull();
    expect(causeFor({ verdict: "close", quantitative: true })).toBe("accuracy");
    expect(causeFor({ verdict: "close", quantitative: false })).toBe("accuracy");
    expect(causeFor({ verdict: "incorrect", quantitative: true })).toBe("analytical");
    expect(causeFor({ verdict: "incorrect", quantitative: false })).toBe("knowledge");
    // A blank has no cause until the rest of the topic is known.
    expect(causeFor({ verdict: "incorrect", quantitative: false, blank: true })).toBeNull();
  });
});

describe("the attempt", () => {
  const activity = {
    id: "a1", title: "Cells", meta: { createdAt: "" },
    questions: [
      { id: "q1", kind: "choice", prompt: "Which is NOT a part of the cell?", options: ["Nucleus", "Femur"], answer: "Femur", topic: "Cells", skill: "concept" },
      { id: "q2", kind: "text", prompt: "What do mitochondria do?", answer: "They produce energy for the cell", topic: "Cells", skill: "concept" },
      { id: "q3", kind: "text", prompt: "Calculate 6 × 7", answer: "42", topic: "Cells", skill: "calculation" },
      { id: "q4", kind: "text", prompt: "Define osmosis", answer: "movement of water", topic: "Cells" }
    ]
  };

  it("grades locally with a verdict and credit for every answer", () => {
    const attempt = gradeActivity(activity, { q1: "Femur", q2: "They produce energy for the cell", q3: "45", q4: "" });
    const byId = Object.fromEntries(attempt.results.map((row) => [row.id, row]));
    expect(byId.q1).toMatchObject({ verdict: "correct", score: 1, correct: true });
    expect(byId.q2).toMatchObject({ verdict: "correct", graded: "local" });
    expect(byId.q3).toMatchObject({ verdict: "incorrect", errorCause: "analytical", quantitative: true });
    expect(byId.q4).toMatchObject({ verdict: "incorrect", errorCause: null });
    expect(attempt.score).toBe(2);
    expect(attempt.total).toBe(4);
  });

  it("merges the model's grades: close earns partial credit and is not correct", () => {
    const local = gradeActivity(activity, { q1: "Femur", q2: "they make power", q3: "42", q4: "water goes through a membrane" });
    const merged = applyGrades(local, {
      q2: { verdict: "close", score: 0.6, feedback: "Right idea; say it is energy.", errorCause: "accuracy", makesSense: true, graded: "ai" },
      q4: { verdict: "incorrect", score: 0, feedback: "Not quite.", errorCause: "knowledge", makesSense: true, quantitative: false, graded: "ai" }
    });
    const byId = Object.fromEntries(merged.results.map((row) => [row.id, row]));
    expect(byId.q2).toMatchObject({ correct: false, verdict: "close", score: 0.6, graded: "ai", errorCause: "accuracy" });
    expect(byId.q4).toMatchObject({ correct: false, errorCause: "knowledge", graded: "ai" });
    expect(merged.score).toBeCloseTo(1 + 0.6 + 1 + 0, 5); // q1 + q2 + q3 + q4
    expect(merged.total).toBe(4);
    expect(scoreOf(merged.results).score).toBeCloseTo(2.6, 5);
  });

  it("gives close answers part of a point", () => {
    expect(creditOf({ correct: true })).toBe(1);
    expect(creditOf({ correct: false, verdict: "close", score: 0.6 })).toBe(0.6);
    expect(creditOf({ correct: false, verdict: "close" })).toBe(0.5);
    expect(creditOf({ correct: false, verdict: "incorrect", score: 0 })).toBe(0);
  });
});
