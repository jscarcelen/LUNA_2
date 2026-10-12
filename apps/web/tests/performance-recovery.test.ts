import { describe, expect, it } from "vitest";
// @ts-ignore - plain JS module
import { errorRecovery, overallMastery } from "../modules/performance/mastery.js";

const day = 86400000;
const start = Date.UTC(2026, 8, 1);
const row = (topic: string, correct: boolean, days: number) => ({ topic, correct, time: start + days * day });

describe("errorRecovery (the Retention number)", () => {
  it("counts a topic as improved when the answers a week or more after its first mistake are better", () => {
    const evidence = [
      row("A", false, 0), row("A", false, 1), row("A", true, 8), row("A", true, 9), // improved
      row("B", false, 0), row("B", true, 2), row("B", false, 8), row("B", false, 10), // not improved
      row("C", true, 0), row("C", true, 9) // no mistakes: not part of it
    ];
    expect(errorRecovery(evidence)).toEqual({ value: 0.5, topics: 2, improved: 1, withErrors: 2 });
  });

  it("is not measured until a topic with mistakes has two follow-up answers", () => {
    const result = errorRecovery([row("A", false, 0), row("A", true, 8)]);
    expect(result.value).toBeNull();
    expect(result.withErrors).toBe(1);
  });
});

describe("overallMastery accuracy", () => {
  it("weights each topic's accuracy by the questions answered", () => {
    const topics = [{ mastery: 50, accuracy: 1, questions: 1 }, { mastery: 50, accuracy: 0, questions: 3 }];
    expect(overallMastery(topics).accuracy).toBeCloseTo(0.25);
  });
});
