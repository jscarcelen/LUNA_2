import { describe, expect, it } from "vitest";
import { buildEvidence, masteryOf, topicMastery } from "../../modules/performance/mastery";
import { analyseErrors, classifyError, decideError, groupOf, isQuantitative, verdictOfWrong } from "../../modules/performance/errors";

const daysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString();
const attempt = (results, at = daysAgo(1)) => ({ learner: "A", at, resourceId: `r${at}`, results });
const right = (topic, extra = {}) => ({ id: `${topic}-${Math.random()}`, topic, correct: true, verdict: "correct", score: 1, prompt: "A question", given: "x", expected: "x", ...extra });
const wrong = (topic, extra = {}) => ({ id: `${topic}-${Math.random()}`, topic, correct: false, prompt: "A question", given: "something else", expected: "the answer", ...extra });

const groupFor = (row, context = {}) => decideError(row, context).group;

describe("which of the three a wrong answer is", () => {
  it("a wrong answer to a question that needs no maths is topic knowledge, never analytical", () => {
    // The user's complaint: a conceptual question tagged as an analytical error.
    const cases = [
      { prompt: "Which of the following is NOT a function of the cell membrane?", given: "Transport", expected: "Producing ATP", skill: "concept" },
      { prompt: "What is the difference between mitosis and meiosis?", given: "There is none", expected: "Meiosis halves the chromosomes", skill: "analysis" },
      { prompt: "Classify the sentence", given: "A main clause", expected: "A subordinate clause" },
      { prompt: "Define inflation", given: "When prices fall", expected: "A general rise in prices over time", kind: "text" },
      { prompt: "Which is the capital of Australia?", given: "Sydney", expected: "Canberra", kind: "choice" }
    ];
    for (const row of cases) {
      for (const topicAccuracy of [0.1, 0.5, 0.95]) {
        expect(groupFor({ ...row, correct: false }, { topicAccuracy, topicEvidence: 10 })).toBe("knowledge");
      }
      expect(groupOf(classifyError(row, { topicAccuracy: 0.8 }))).toBe("knowledge");
    }
  });

  it("a wrong answer to a question that needs maths is analytical", () => {
    expect(groupFor({ prompt: "Calculate 6 × 7", given: "45", expected: "42" })).toBe("analytical");
    expect(groupFor({ prompt: "Obtain the result", given: "no solution", expected: "x = 4", skill: "calculation" })).toBe("analytical");
    expect(groupFor({ prompt: "Which value is the mean?", given: "9", expected: "7.5", kind: "choice" })).toBe("analytical"); // numeric expected answer
    expect(classifyError({ given: "48", expected: "54" }, { topicAccuracy: 0.8 })).toBe("calculation");
    expect(classifyError({ prompt: "Solve 3x = 12", given: "x = 36", expected: "x = 4" }, { topicAccuracy: 0.3 })).toBe("procedural");
  });

  it("a close answer is accuracy, in maths and out of it", () => {
    expect(groupFor({ prompt: "Define osmosis", given: "the movement of water", expected: "movement of water across a membrane", verdict: "close" })).toBe("accuracy");
    expect(groupFor({ prompt: "Calculate the area", given: "12.4", expected: "12.57", verdict: "close", skill: "calculation" })).toBe("accuracy");
    // Without a stored verdict, a number a rounding away, a wrong sign or a typo is close too.
    expect(groupFor({ prompt: "Calculate the ratio", given: "1.27", expected: "1.25" })).toBe("accuracy");
    expect(groupFor({ prompt: "Calculate the change", given: "-12", expected: "12" })).toBe("accuracy");
    expect(groupFor({ prompt: "Name the organelle", given: "mitocondria", expected: "mitochondria" })).toBe("accuracy");
    expect(verdictOfWrong({ given: "mitocondria", expected: "mitochondria" })).toBe("close");
    // A multiple-choice pick is never "close".
    expect(verdictOfWrong({ given: "B", expected: "C", kind: "choice" })).toBe("incorrect");
  });

  it("a blank is accuracy only on a topic the learner otherwise knows (>= 70% elsewhere)", () => {
    const blank = { prompt: "Define osmosis", given: "", expected: "movement of water" };
    expect(groupFor(blank, { topicAccuracy: 0.9, topicEvidence: 8 })).toBe("accuracy");
    expect(groupFor(blank, { topicAccuracy: 0.7, topicEvidence: 8 })).toBe("accuracy");
    expect(groupFor(blank, { topicAccuracy: 0.69, topicEvidence: 8 })).toBe("knowledge");
    expect(groupFor(blank, { topicAccuracy: 0.2, topicEvidence: 8 })).toBe("knowledge");
    // One lucky answer is not "otherwise strong".
    expect(groupFor(blank, { topicAccuracy: 1, topicEvidence: 1 })).toBe("knowledge");
    // Even a maths question left blank on a weak topic is a knowledge gap, not an analytical one.
    expect(groupFor({ prompt: "Calculate 6 × 7", given: "", expected: "42" }, { topicAccuracy: 0.1, topicEvidence: 5 })).toBe("knowledge");
    expect(classifyError(blank, { topicAccuracy: 0.9 })).toBe("incomplete");
    expect(classifyError(blank, { topicAccuracy: 0.1 })).toBe("gap");
  });

  it("explains itself", () => {
    expect(decideError({ prompt: "Define inflation", given: "falling prices", expected: "rising prices" }, {})).toMatchObject({ group: "knowledge", quantitative: false });
    expect(decideError({ prompt: "Calculate 2 + 2", given: "5", expected: "4" }, {}).reason).toMatch(/maths/);
    expect(isQuantitative({ prompt: "Calculate 2 + 2", expected: "4" })).toBe(true);
  });
});

describe("the evidence uses what the grader stored", () => {
  it("prefers the stored errorCause to guessing, and keeps verdict, score and feedback", () => {
    const rows = buildEvidence([attempt([
      // Heuristics alone would say analytical (numeric expected answer); the grader read it and said knowledge.
      wrong("Facts", { prompt: "How many sides has a hexagon?", expected: "6", given: "a shape", errorCause: "knowledge", verdict: "incorrect", score: 0, feedback: "A hexagon has six sides.", graded: "ai" }),
      wrong("Algebra", { prompt: "Solve 3x = 12", expected: "4", given: "9", errorCause: "analytical", verdict: "incorrect", score: 0, graded: "ai" }),
      wrong("Biology", { prompt: "Define osmosis", expected: "movement of water", given: "movement of salt in water", errorCause: "accuracy", verdict: "close", score: 0.5, graded: "ai" })
    ])]);
    expect(rows.map((row) => [row.errorCause, row.verdict, row.graded])).toEqual([["knowledge", "incorrect", "ai"], ["analytical", "incorrect", "ai"], ["accuracy", "close", "ai"]]);
    expect(rows[0].feedback).toBe("A hexagon has six sides.");
    const analysis = analyseErrors(rows);
    expect(analysis.rows.map((row) => row.errorType)).toEqual(["knowledge", "analytical", "accuracy"]);
    expect(analysis.rows[0].reason).toMatch(/graded/);
    expect(analysis.types.map((type) => type.count).sort()).toEqual([1, 1, 1]);
  });

  it("re-reads old attempts without a stored cause by the new rules", () => {
    const rows = buildEvidence([attempt([
      wrong("Cells", { prompt: "Which is NOT an organelle?", given: "Nucleus", expected: "Femur", skill: "concept" }),
      wrong("Arithmetic", { prompt: "Calculate 12 × 12", given: "124", expected: "144" }),
      wrong("Cells", { prompt: "Name the organelle", given: "mitocondria", expected: "mitochondria" }),
      wrong("Biology", { prompt: "Define osmosis", given: "", expected: "movement of water" }),
      ...Array.from({ length: 4 }, () => right("Biology"))
    ])]);
    const byTopicPrompt = Object.fromEntries(analyseErrors(rows).rows.map((row) => [row.prompt, row.errorType]));
    expect(byTopicPrompt["Which is NOT an organelle?"]).toBe("knowledge");
    expect(byTopicPrompt["Calculate 12 × 12"]).toBe("analytical");
    expect(byTopicPrompt["Name the organelle"]).toBe("accuracy");
    // Four right answers on Biology elsewhere: the blank is a lapse.
    expect(byTopicPrompt["Define osmosis"]).toBe("accuracy");
  });

  it("always lists the three kinds and the shares add up", () => {
    const analysis = analyseErrors(buildEvidence([attempt([wrong("T", { prompt: "Define x", given: "y", expected: "z" }), right("T"), right("T")])]));
    expect(analysis.types.map((type) => type.id).sort()).toEqual(["accuracy", "analytical", "knowledge"]);
    expect(analysis.types.reduce((sum, type) => sum + type.share, 0)).toBeCloseTo(1, 5);
  });
});

describe("mastery counts a close answer for part of a right one", () => {
  const topicOf = (results) => masteryOf(buildEvidence([attempt(results)]).filter((row) => row.topic === "Cells"));
  const set = (extra) => Array.from({ length: 10 }, () => extra.kind === "right" ? right("Cells") : wrong("Cells", extra));

  it("a close answer is worth more than a wrong one and less than a right one", () => {
    const allWrong = topicOf(set({ verdict: "incorrect", score: 0 }));
    const allClose = topicOf(set({ verdict: "close", score: 0.5 }));
    const allRight = topicOf(set({ kind: "right" }));
    expect(allWrong.accuracy).toBe(0);
    expect(allClose.accuracy).toBeCloseTo(0.5, 5);
    expect(allRight.accuracy).toBe(1);
    expect(allClose.mastery).toBeGreaterThan(allWrong.mastery);
    expect(allClose.mastery).toBeLessThan(allRight.mastery);
  });

  it("uses the grader's score when it gave one, and 0.5 when it did not", () => {
    expect(topicOf(set({ verdict: "close", score: 0.8 })).accuracy).toBeCloseTo(0.8, 5);
    expect(topicOf(set({ verdict: "close" })).accuracy).toBeCloseTo(0.5, 5);
  });

  it("a close answer is still a mistake to analyse, and it counts as accuracy", () => {
    const rows = buildEvidence([attempt([wrong("Cells", { verdict: "close", score: 0.5, errorCause: "accuracy" }), right("Cells")])]);
    expect(rows[0].correct).toBe(false);
    expect(analyseErrors(rows).rows[0].errorType).toBe("accuracy");
    expect(topicMastery(rows)[0].accuracy).toBeCloseTo(0.75, 5);
  });
});
