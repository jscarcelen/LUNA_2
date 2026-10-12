import { describe, expect, it } from "vitest";
// @ts-ignore - plain JS modules
import { cellOf, overviewColumns, skillOverview, topicGroups, topicSplit } from "../modules/performance/skillOverview.js";

const row = (topic: string, skills: string[], correct: boolean) => ({ topic, skills, blame: [] as string[], correct, prompt: "", at: "" });
const many = (topic: string, skills: string[], right: number, wrong: number) => [...Array(right).fill(0).map(() => row(topic, skills, true)), ...Array(wrong).fill(0).map(() => row(topic, skills, false))];

describe("skills grid columns", () => {
  const rows = [...many("Balance sheet", ["algebra"], 1, 3), ...many("Income", ["percentages"], 4, 0), ...many("Goal", ["optimisation"], 0, 2), ...many("Goal", ["spelling"], 1, 0)];
  it("keeps only the skills that matter and groups them under their family", () => {
    const groups = overviewColumns(rows);
    expect(groups.map((group: any) => group.family.label)).toEqual(["Quantitative"]);
    // optimisation: two answers and weak, kept; spelling: one right answer, dropped.
    expect(groups[0].skills.map((skill: any) => skill.id).sort()).toEqual(["algebra", "optimisation", "percentages"]);
  });
  it("shows every answered skill when expanded", () => {
    const groups = overviewColumns(rows, { expanded: true });
    expect(groups.map((group: any) => group.family.id)).toEqual(["quant", "langlearn"]);
  });
  it("still draws something when there is little evidence", () => {
    expect(overviewColumns([row("A", ["algebra"], true)]).flatMap((group: any) => group.skills).length).toBe(1);
  });
});

describe("a cell and the topics behind it", () => {
  it("does not blame a skill for a mistake the grader pinned on another", () => {
    const rows = [{ ...row("T", ["algebra", "derivatives"], false), blame: ["derivatives"] }, row("T", ["algebra"], true)];
    expect(cellOf(rows, "algebra")).toEqual({ asked: 2, wrong: 0, acc: 1 });
    expect(cellOf(rows, "derivatives")).toEqual({ asked: 1, wrong: 1, acc: 0 });
    expect(cellOf(rows, "limits")).toBeNull();
  });
  it("splits a cell by topic, most answered first, with each topic's share", () => {
    const rows = [...many("Balance sheet", ["algebra"], 1, 2), ...many("Income", ["algebra"], 1, 0), ...many("Other", ["limits"], 3, 0)];
    const split = topicSplit(rows, "algebra");
    expect(split.map((entry: any) => entry.topic)).toEqual(["Balance sheet", "Income"]);
    expect(split[0].share).toBeCloseTo(0.75);
    expect(topicGroups(rows).map((group: any) => group.topic)).toEqual(["Balance sheet", "Other", "Income"]);
  });
});

describe("the workspace overview", () => {
  const doc = (id: string, tags: string[], content: unknown) => ({ id, tags, content: JSON.stringify(content), folderIds: [] });
  const resource = (id: string) => doc(id, ["resource"], { kind: "resource", name: id, meta: {} });
  const plan = (id: string, name: string, resourceIds: string[]) => doc(id, ["study-plan"], { kind: "study-plan", name, items: resourceIds.map((resourceId) => ({ resourceId })) });
  const attemptDoc = (id: string, resourceId: string, topic: string, correct: boolean) => doc(id, ["activity-attempt"], { learner: "Ana", activityDocumentId: resourceId, attempt: { activityId: resourceId, at: "2026-10-10T10:00:00Z", score: correct ? 1 : 0, total: 1, results: [{ topic, skills: ["algebra"], correct }] } });

  it("lists each subject's study plans, and answers on a resource in no plan under their own row", () => {
    const workspace = { subjects: [
      { id: "s1", name: "Accounting", documents: [resource("r1"), resource("r2"), plan("p1", "Midterm", ["r1"]), attemptDoc("a1", "r1", "Balance sheet", false), attemptDoc("a2", "r2", "Income", true)] },
      { id: "s2", name: "Statistics", documents: [] }
    ] };
    const overview = skillOverview(workspace);
    expect(overview.subjects.map((subject: any) => subject.name)).toEqual(["Accounting"]);
    expect(overview.subjects[0].plans.map((entry: any) => entry.name)).toEqual(["Midterm", "Outside a study plan"]);
    expect(overview.rows).toHaveLength(2);
  });
  it("applies the screen's filter", () => {
    const workspace = { subjects: [{ id: "s1", name: "Accounting", documents: [resource("r1"), plan("p1", "Midterm", ["r1"]), attemptDoc("a1", "r1", "T", true)] }] };
    expect(skillOverview(workspace, () => false).subjects).toEqual([]);
  });
});
