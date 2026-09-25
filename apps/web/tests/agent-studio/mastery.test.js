import { describe, expect, it } from "vitest";
import { buildEvidence, classTopicCoverage, learnerSubjectMatrix, masteryOf, nextActions, overallMastery, statusOf, topicMastery } from "../../modules/performance/mastery";
import { analyseErrors, classifyError } from "../../modules/performance/errors";

const daysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString();

const attempt = ({ learner = "A", at = daysAgo(1), results }) => ({ learner, at, resourceId: `r${at}`, results });
const q = (topic, correct, extra = {}) => ({ id: `${topic}-${Math.random()}`, topic, correct, difficulty: "medium", prompt: `${topic}?`, expected: "4", given: correct ? "4" : "7", ...extra });

describe("mastery", () => {
  it("does not treat a handful of easy answers as mastery", () => {
    const thin = masteryOf(buildEvidence([attempt({ results: [q("Fractions", true), q("Fractions", true), q("Fractions", true)] })]));
    expect(thin.accuracy).toBe(1);
    // Three questions is not evidence of mastery, however perfect the score.
    expect(thin.mastery).toBeLessThan(70);
    expect(thin.coverage).toBeLessThan(0.5);

    const solid = masteryOf(buildEvidence([attempt({ results: Array.from({ length: 12 }, () => q("Fractions", true, { difficulty: "hard" })) })]));
    expect(solid.mastery).toBeGreaterThanOrEqual(85);
    expect(statusOf(solid.mastery).id).toBe("mastered");
  });

  it("weighs recent answers more than old ones", () => {
    const improving = buildEvidence([
      attempt({ at: daysAgo(20), results: Array.from({ length: 6 }, () => q("Ratios", false)) }),
      attempt({ at: daysAgo(1), results: Array.from({ length: 6 }, () => q("Ratios", true)) })
    ]);
    const declining = buildEvidence([
      attempt({ at: daysAgo(20), results: Array.from({ length: 6 }, () => q("Ratios", true)) }),
      attempt({ at: daysAgo(1), results: Array.from({ length: 6 }, () => q("Ratios", false)) })
    ]);
    expect(masteryOf(improving).mastery).toBeGreaterThan(masteryOf(declining).mastery);
    expect(masteryOf(improving).trend).toBeGreaterThan(0);
    expect(masteryOf(declining).trend).toBeLessThan(0);
  });

  it("measures retention only when a topic comes back after a gap", () => {
    const sameDay = masteryOf(buildEvidence([attempt({ results: Array.from({ length: 8 }, () => q("Decimals", true)) })]));
    expect(sameDay.retention).toBeNull();
    const delayed = masteryOf(buildEvidence([
      attempt({ at: daysAgo(30), results: Array.from({ length: 5 }, () => q("Decimals", true)) }),
      attempt({ at: daysAgo(2), results: [q("Decimals", true), q("Decimals", false), q("Decimals", true)] })
    ]));
    expect(delayed.retention).toBeCloseTo(2 / 3, 2);
  });

  it("summarises topics into what is mastered and what needs work", () => {
    const evidence = buildEvidence([
      attempt({ results: [...Array.from({ length: 12 }, () => q("Fractions", true)), ...Array.from({ length: 12 }, () => q("Ratios", false))] })
    ]);
    const topics = topicMastery(evidence);
    const overall = overallMastery(topics);
    expect(topics[0].topic).toBe("Ratios");
    expect(overall.topicCount).toBe(2);
    expect(overall.strongOrBetter).toBe(1);
    expect(overall.toImprove).toBe(1);
    const actions = nextActions(topics, analyseErrors(evidence).byTopic);
    expect(actions[0].topic).toBe("Ratios");
    expect(actions[0].questions).toBe(10);
  });

  it("reads a class by topic and by subject", () => {
    const evidence = buildEvidence([
      { learner: "Anna", at: daysAgo(1), resourceId: "r1", results: Array.from({ length: 10 }, () => q("Ratios", true)) },
      { learner: "Ben", at: daysAgo(1), resourceId: "r2", results: Array.from({ length: 10 }, () => q("Ratios", false)) }
    ], { subjectOf: (entry) => (entry.learner === "Anna" ? "Maths" : "Maths") });
    const coverage = classTopicCoverage(evidence);
    expect(coverage[0].topic).toBe("Ratios");
    expect(coverage[0].learners).toBe(2);
    expect(coverage[0].mastered).toBe(1);
    const matrix = learnerSubjectMatrix(evidence);
    expect(matrix.subjects).toEqual(["Maths"]);
    expect(matrix.rows).toHaveLength(2);
  });
});

describe("error taxonomy", () => {
  it("tells a slip from a misconception", () => {
    // Close numeric answer on a topic that is otherwise fine: the arithmetic slipped.
    expect(classifyError({ given: "48", expected: "54" }, { topicAccuracy: 0.8, repeats: 1 })).toBe("calculation");
    // The same wrong answer again and again: the idea itself is wrong.
    expect(classifyError({ given: "adds them", expected: "multiplies them" }, { topicAccuracy: 0.3, repeats: 3 })).toBe("conceptual");
    // Nothing written, on a topic that is mostly wrong: a prerequisite is missing.
    expect(classifyError({ given: "", expected: "0.75" }, { topicAccuracy: 0.2, repeats: 2 })).toBe("gap");
    // A single miss on a topic they know: careless.
    expect(classifyError({ given: "north", expected: "south" }, { topicAccuracy: 0.9, repeats: 1 })).toBe("careless");
  });

  it("turns the mistakes into shares that can be acted on", () => {
    const evidence = buildEvidence([attempt({ results: [
      q("Ratios", false, { given: "adds", expected: "multiplies" }),
      q("Ratios", false, { given: "adds", expected: "multiplies" }),
      q("Ratios", true),
      q("Decimals", false, { given: "", expected: "0.75" })
    ] })]);
    const analysis = analyseErrors(evidence);
    expect(analysis.total).toBe(3);
    expect(analysis.types[0].share).toBeCloseTo(2 / 3, 2);
    expect(analysis.byTopic.get("Ratios")[0].id).toBe("conceptual");
  });
});

describe("what certainty says about a mistake", () => {
  it("treats sure-and-wrong as a misconception, not a slip", () => {
    // Same wrong answer, same strong topic — only the learner's certainty differs.
    const slip = classifyError({ given: "cats breathe through gills", expected: "lungs", confidence: "" }, { topicAccuracy: 0.8 });
    const misconception = classifyError({ given: "cats breathe through gills", expected: "lungs", confidence: "high" }, { topicAccuracy: 0.8 });
    expect(slip).toBe("careless");
    expect(misconception).toBe("conceptual");
  });

  it("treats a guess on a weak topic as a gap", () => {
    expect(classifyError({ given: "b", expected: "c", confidence: "low" }, { topicAccuracy: 0.45 })).toBe("gap");
  });
});
