import { describe, expect, it } from "vitest";
import { conceptNames, coverageOf, ensureCoverage, planCoverage } from "../../modules/plans/coverage.js";

const names = ["Assets", "Liabilities", "Equity", "Depreciation", "Cash flow"];
const step = (title: string, kind: string, concepts: string[], generate = ""): any => ({ id: title, title, kind, concepts, generate, resourceId: "", doneAt: "" });

describe("exhaustive plan coverage", () => {
  const items = [
    step("Read balance sheet", "read", ["Assets", "Liabilities"]),
    step("Quiz 1", "activity", ["Assets"], "quiz"),
    step("Flashcards", "activity", ["Equity"], "flashcards"),
    step("Final exam", "exam", ["Assets"], "exam")
  ];

  it("finds what is studied but never tested, and what is not studied at all", () => {
    const cov = coverageOf(items, names);
    expect(cov.missingTest).toEqual(["Liabilities", "Depreciation", "Cash flow"]);
    expect(cov.missingStudy).toEqual(["Depreciation", "Cash flow"]);
  });

  it("repairs the gaps: every concept tested, studied, and asked again in the final exam", () => {
    const { items: fixed, repairs } = ensureCoverage(items, names);
    const cov = planCoverage({ items: fixed }, names);
    expect(cov.complete).toBe(true);
    expect(fixed.find((item: any) => item.title === "Final exam").concepts.sort()).toEqual([...names].sort());
    expect(repairs.filter((entry: any) => entry.as === "test").map((entry: any) => entry.concept)).toEqual(["Liabilities", "Depreciation", "Cash flow"]);
    // spread over the testing steps instead of piled on one
    expect(fixed.find((item: any) => item.title === "Quiz 1").concepts.length).toBeLessThanOrEqual(3);
  });

  it("maps the planner's wording onto canonical names and drops invented concepts", () => {
    const { items: fixed } = ensureCoverage([step("Quiz", "activity", ["assets ", "Made up topic"], "quiz")], names);
    expect(fixed[0].concepts).toContain("Assets");
    expect(fixed[0].concepts).not.toContain("Made up topic");
  });

  it("does not demand tests from a plan that cannot test anything", () => {
    const readOnly = [step("Read", "read", ["Assets"])];
    expect(coverageOf(readOnly, names).missingTest).toEqual([]);
    expect(conceptNames([{ name: "A" }, { name: "A" }, { name: " B " }])).toEqual(["A", "B"]);
  });
});
