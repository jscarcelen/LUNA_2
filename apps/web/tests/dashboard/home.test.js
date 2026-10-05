import { describe, expect, it } from "vitest";
import { buildPlan, newDeadline, newItem, PLAN_TAG } from "../../modules/plans/plan";
import { coachInputFor, firstName, greeting, nextSteps, planRowsOf, rankPlans } from "../../modules/dashboard/home";

const iso = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

/** A workspace document that parsePlan accepts. */
const planDoc = (id, plan) => ({ id, name: `${plan.name}.plan.json`, tags: [PLAN_TAG], content: JSON.stringify(plan) });
const row = (id, plan, extra = {}) => ({ document: { id }, plan: { ...plan, documentId: id }, subjectId: "s", subjectName: "Subject", workspaceId: "w", ...extra });
const withDeadline = (name, days, items = [newItem({ title: "Step", resourceId: `r-${name}`, dueDate: iso(days ?? 1) })]) => buildPlan({ name, deadlines: days === null ? [] : [newDeadline("Exam", iso(days), "exam")], items });

describe("greeting", () => {
  it("uses the first name and drops titles and initials", () => {
    expect(firstName("Maria G.")).toBe("Maria");
    expect(firstName("Prof. Rivera")).toBe("Rivera");
    expect(firstName("  Elena   G.  ")).toBe("Elena");
    expect(firstName("")).toBe("");
    expect(greeting("Maria G.")).toBe("Hi Maria");
    expect(greeting("")).toBe("Hi");
    expect(greeting(undefined)).toBe("Hi");
  });
});

describe("planRowsOf", () => {
  it("finds the plans of every subject of the workspace", () => {
    const workspace = { id: "w", subjects: [
      { id: "s1", name: "Biology", documents: [planDoc("p1", withDeadline("Bio", 5)), { id: "d", name: "Notes", tags: [] }] },
      { id: "s2", name: "History", documents: [planDoc("p2", withDeadline("Hist", 9))] }
    ] };
    const rows = planRowsOf(workspace);
    expect(rows.map((entry) => [entry.document.id, entry.subjectName])).toEqual([["p1", "Biology"], ["p2", "History"]]);
    expect(planRowsOf(null)).toEqual([]);
  });
});

describe("rankPlans", () => {
  it("puts the closest upcoming deadline first and limits to four", () => {
    const rows = [row("a", withDeadline("A", 20)), row("b", withDeadline("B", 2)), row("c", withDeadline("C", 9)), row("d", withDeadline("D", 5)), row("e", withDeadline("E", 1)), row("f", withDeadline("F", 40))];
    const ranked = rankPlans(rows, []);
    expect(ranked.map((entry) => entry.plan.name)).toEqual(["E", "B", "D", "C"]);
    expect(rankPlans(rows, [], { limit: 2 })).toHaveLength(2);
  });

  it("ranks plans with a deadline still ahead before overdue ones, no-deadline ones and finished ones", () => {
    const finishedItem = newItem({ title: "Done", resourceId: "r-done", dueDate: iso(-5) });
    const rows = [
      row("none", withDeadline("No deadline", null)),
      row("over", withDeadline("Overdue", -3)),
      row("done", withDeadline("Finished", 1, [finishedItem])),
      row("soon", withDeadline("Soon", 4))
    ];
    const ranked = rankPlans(rows, [{ resourceId: "r-done", score: 1, total: 1 }]);
    expect(ranked.map((entry) => entry.plan.name)).toEqual(["Soon", "Overdue", "No deadline", "Finished"]);
  });

  it("breaks a tie on the deadline by the number of late steps", () => {
    const late = [newItem({ title: "Late", resourceId: "x", dueDate: iso(-2) }), newItem({ title: "Late 2", resourceId: "y", dueDate: iso(-1) })];
    const rows = [row("calm", withDeadline("Calm", 6)), row("late", withDeadline("Behind", 6, late))];
    expect(rankPlans(rows, []).map((entry) => entry.plan.name)).toEqual(["Behind", "Calm"]);
  });

  it("shows a parent plan once, with its sub-plans rolled in, and never a sub-plan on its own", () => {
    const parent = buildPlan({ name: "Final", deadlines: [newDeadline("Exam", iso(30), "exam")], items: [newItem({ title: "Past paper", resourceId: "p1" })] });
    const child = buildPlan({ name: "Equations", parentPlanId: "parent", deadlines: [newDeadline("Quiz", iso(3), "milestone")], items: [newItem({ title: "Quiz", resourceId: "c1" }), newItem({ title: "Drill", resourceId: "c2" })] });
    const ranked = rankPlans([row("parent", parent), row("child", child)], [{ resourceId: "c1", score: 1, total: 1 }]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].plan.name).toBe("Final");
    expect(ranked[0].children).toHaveLength(1);
    expect(ranked[0].progress.total).toBe(3);
    expect(ranked[0].progress.done).toBe(1);
    expect(ranked[0].days).toBe(3);
  });

  it("returns nothing for no plans", () => {
    expect(rankPlans([], [])).toEqual([]);
  });
});

describe("nextSteps", () => {
  it("lists late steps first, then the soonest, across the urgent plans", () => {
    const entries = rankPlans([
      row("a", withDeadline("A", 10, [newItem({ title: "A later", resourceId: "a1", dueDate: iso(5) })])),
      row("b", withDeadline("B", 12, [newItem({ title: "B late", resourceId: "b1", dueDate: iso(-1) }), newItem({ title: "B soon", resourceId: "b2", dueDate: iso(1) })]))
    ], []);
    const steps = nextSteps(entries, 5);
    expect(steps.map((step) => step.title)).toEqual(["B late", "B soon", "A later"]);
    expect(nextSteps(entries, 2)).toHaveLength(2);
  });
});

describe("coachInputFor", () => {
  it("is empty, without a plan summary, when there are no plans", () => {
    const input = coachInputFor([], [], []);
    expect(input.plan).toBeNull();
    expect(input.topics).toEqual([]);
    expect(input.errorTypes).toEqual([]);
  });

  it("summarises the urgent plans (names, steps done, late, next steps soonest first) even with no results yet", () => {
    const rows = [
      row("a", withDeadline("Biology", 4, [newItem({ title: "Cells quiz", resourceId: "r1", dueDate: iso(2) })])),
      row("b", withDeadline("History", 8, [newItem({ title: "Read ch. 3", dueDate: iso(-1) }), newItem({ title: "Essay", dueDate: iso(6) })]))
    ];
    const entries = rankPlans(rows, []);
    const input = coachInputFor(entries, [], rows);
    expect(input.plan.name).toBe("Biology · History");
    expect(input.plan.total).toBe(3);
    expect(input.plan.late).toBe(1);
    expect(input.plan.deadline).toBe(iso(4));
    expect(input.plan.upcoming.map((step) => step.title)).toEqual(["History: Read ch. 3", "Biology: Cells quiz", "History: Essay"]);
    expect(input.attemptCount).toBe(0);
  });

  it("does not prefix step titles when only one plan is read", () => {
    const rows = [row("a", withDeadline("Biology", 4, [newItem({ title: "Cells quiz", resourceId: "r1", dueDate: iso(2) })]))];
    const input = coachInputFor(rankPlans(rows, []), [], rows);
    expect(input.plan.name).toBe("Biology");
    expect(input.plan.upcoming[0].title).toBe("Cells quiz");
  });
});
