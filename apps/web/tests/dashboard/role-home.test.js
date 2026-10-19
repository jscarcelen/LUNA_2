import { describe, expect, it } from "vitest";
import { buildPlan, newDeadline, newItem, PLAN_TAG } from "../../modules/plans/plan";
import { classCardOf, howToHelp, standingOf, weeklySummaryOf } from "../../modules/dashboard/roleHome";
import { nextBestAction } from "../../modules/dashboard/home";

const iso = (days) => { const date = new Date(); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); };
const ago = (days) => new Date(Date.now() - days * 86400000).toISOString();
const planDoc = (id, plan) => ({ id, name: `${plan.name}.plan.json`, tags: [PLAN_TAG], content: JSON.stringify(plan) });
const quiz = (id) => ({ id, name: "Quiz.resource.json", tags: ["resource", "activity"], sourceType: "generated", content: JSON.stringify({ kind: "resource", name: "Quiz", activity: { id: `a-${id}`, title: "Quiz", questions: [] }, meta: {} }) });
const attempt = (activityId, correct, daysAgo = 1, topic = "Integrals") => ({
  id: `att-${activityId}-${correct}-${daysAgo}`, name: "attempt", tags: ["activity-attempt"], sourceType: "generated",
  content: JSON.stringify({ kind: "activity-attempt", activityDocumentId: activityId, learner: "", attempt: { at: ago(daysAgo), activityId: `a-${activityId}`, activityTitle: "Quiz", score: correct, total: 2, results: [{ id: "q1", correct: correct >= 1, topic }, { id: "q2", correct: correct >= 2, topic }] } })
});
const member = (id, name, documents) => ({ student: { id, displayName: name, email: `${id}@x.com` }, workspaces: [{ id: "w", subjects: [{ id: "s", name: "Maths", documents, folders: [] }] }] });

const goodPlan = planDoc("p1", buildPlan({ name: "Midterm", deadlines: [newDeadline("Exam", iso(10), "exam")], items: [newItem({ title: "Quiz 1", resourceId: "q-todo", dueDate: iso(3) })] }));
const latePlan = planDoc("p2", buildPlan({ name: "Midterm", deadlines: [newDeadline("Exam", iso(10), "exam")], items: [newItem({ title: "Quiz 1", resourceId: "q-not-done", dueDate: iso(-2) })] }));

describe("standingOf", () => {
  it("is on track with recent good work and nothing late", () => {
    const standing = standingOf(member("ana", "Ana", [quiz("q1"), attempt("q1", 2), goodPlan]));
    expect(standing.status).toBe("on-track");
    expect(standing.reasons).toEqual([]);
    expect(standing.dueThisWeek).toHaveLength(1);
  });
  it("is behind with a late step, saying why", () => {
    const standing = standingOf(member("bo", "Bo", [latePlan]));
    expect(standing.status).toBe("behind");
    expect(standing.reasons[0]).toBe("1 late step");
  });
  it("is behind when mastery is low, and new when there is nothing yet", () => {
    expect(standingOf(member("cy", "Cy", [quiz("q1"), attempt("q1", 0), attempt("q1", 0, 2)])).reasons.join()).toMatch(/mastery/);
    expect(standingOf(member("di", "Di", [])).status).toBe("new");
  });
});

describe("classCardOf", () => {
  const members = [member("ana", "Ana", [quiz("q1"), attempt("q1", 2), goodPlan]), member("bo", "Bo", [latePlan]), member("di", "Di", [quiz("q1"), attempt("q1", 2), goodPlan])];
  it("lists who is behind and what is due this week across the class", () => {
    const card = classCardOf({ key: "g1", name: "Year 10", members });
    expect(card.size).toBe(3);
    expect(card.behind.map((entry) => entry.name)).toEqual(["Bo"]);
    expect(card.headline).toBe("1 of 3 is behind");
    expect(card.due[0]).toMatchObject({ title: "Quiz 1", students: 2 });
  });
  it("says so when everyone is fine or the class is empty", () => {
    expect(classCardOf({ name: "A", members: [members[0]] }).headline).toBe("Everyone is on track");
    expect(classCardOf({ name: "B", members: [] }).headline).toBe("No students yet");
  });
});

describe("weeklySummaryOf (parent)", () => {
  it("reads on track with nothing late", () => {
    const summary = weeklySummaryOf(member("ana", "Ana G.", [quiz("q1"), attempt("q1", 2), goodPlan]));
    expect(summary).toMatchObject({ status: "on-track", firstName: "Ana", headline: "Ana is on track" });
  });
  it("names where the child struggles and gives ONE way to help", () => {
    const summary = weeklySummaryOf(member("bo", "Bo", [quiz("q1"), attempt("q1", 0), attempt("q1", 0, 2), latePlan]));
    expect(summary.status).toBe("behind");
    expect(summary.struggles[0].topic).toBe("Integrals");
    expect(summary.help.title).toBe("How to help with Integrals");
    expect(summary.help.steps.length).toBeGreaterThan(1);
  });
  it("has a gentle message for a child who has not started", () => {
    expect(weeklySummaryOf(member("di", "Di", []))).toMatchObject({ status: "new", help: null });
  });
});

describe("howToHelp", () => {
  it("is plain language built from the topic data", () => {
    const help = howToHelp({ topic: "Osmosis", mastery: 40, reason: "Topic knowledge gap", reasonId: "knowledge", questions: 10 }, "Maria");
    expect(help.intro).toContain("Maria is finding Osmosis (40% mastery)");
    expect(help.steps.join(" ")).toContain("in their own words");
  });
});

describe("the parent's Home never hands over the child's task", () => {
  it("has no Start step for a parent without their own plan steps", () => {
    const action = nextBestAction({ hasMaterial: true, hasPlans: true, steps: [], hasEvidence: false, role: "parent" });
    expect(action.cta).not.toBe("Start");
  });
});
