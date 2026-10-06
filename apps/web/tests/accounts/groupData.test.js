import { describe, expect, it } from "vitest";
import { GROUP_SUBJECT_ID, GROUP_WORKSPACE_ID, buildGroupWorkspaces, compareMembers, examPlanStatus, memberLabels, memberPlanRows, subjectNamesOf } from "../../modules/accounts/groupData.js";
import { joinAttempts } from "../../modules/performance/metrics.js";
import { byLearner, buildEvidence, classTopicMatrix } from "../../modules/performance/mastery.js";

const quiz = (id) => ({ id, name: "Quiz", tags: ["resource", "activity"], sourceType: "generated", content: JSON.stringify({ kind: "resource", name: "Quiz", meta: {}, activity: { id: `a-${id}`, questions: [{ id: "q1" }, { id: "q2" }] } }) });
const attempt = (activityId, correct, at = "2026-10-01T10:00:00Z") => ({
  id: `att-${activityId}-${correct}-${at}`, name: "attempt", tags: ["activity-attempt"], sourceType: "generated",
  content: JSON.stringify({ kind: "activity-attempt", activityDocumentId: activityId, learner: "", attempt: { at, activityId: `a-${activityId}`, activityTitle: "Quiz", score: correct, total: 2, results: [{ id: "q1", correct: correct >= 1, topic: "Integrals" }, { id: "q2", correct: correct >= 2, topic: "Integrals" }] } })
});
const plan = (id, over = {}) => ({ id, name: `${id}.plan.json`, tags: ["study-plan"], sourceType: "generated", content: JSON.stringify({ kind: "study-plan", name: "Maths plan", colour: "#0071e3", deadlines: [], goals: [], items: [{ id: "i1", title: "Do the quiz", resourceId: "q-ana" }, { id: "i2", title: "Read", resourceId: "" }], ...over }) });
const member = (id, name, documents, subjectName = "Maths") => ({ student: { id, displayName: name, email: `${name.toLowerCase()}@home.com` }, workspaces: [{ id: `w-${id}`, subjects: [{ id: `s-${id}`, name: subjectName, documents, folders: [] }] }] });

const ana = member("ana", "Ana", [quiz("q-ana"), attempt("q-ana", 2), plan("p-ana", { deadlines: [{ id: "d", title: "Midterm", date: "2026-12-01", kind: "exam", setBy: { kind: "sender", accountId: "t", name: "Prof. Rivera" }, examDateId: "ex-1" }] })]);
const bo = member("bo", "Bo", [quiz("q-bo"), attempt("q-bo", 0), plan("p-bo", { items: [{ id: "i1", title: "Do the quiz", resourceId: "q-not-done", dueDate: "2020-01-01" }], deadlines: [{ id: "d2", title: "Mine", date: "2026-12-01", kind: "exam", setBy: { kind: "self" } }] })], "Physics");

describe("a group read as a class", () => {
  it("labels every attempt with the student it belongs to, so the class panels work on a group", () => {
    const [workspace] = buildGroupWorkspaces([ana, bo], { groupName: "Group A" });
    expect(workspace).toMatchObject({ id: GROUP_WORKSPACE_ID, name: "Group A" });
    const [subject] = workspace.subjects;
    expect(subject.id).toBe(GROUP_SUBJECT_ID);
    const attempts = joinAttempts(subject.documents);
    expect(attempts.map((entry) => entry.learner).sort()).toEqual(["Ana", "Bo"]);
    const evidence = buildEvidence(attempts, { subjectOf: () => "Maths", conceptsOf: () => [] });
    // weakest first
    expect(byLearner(evidence).map((entry) => entry.learner)).toEqual(["Bo", "Ana"]);
    expect(classTopicMatrix(evidence).rows.map((row) => row.learner).sort()).toEqual(["Ana", "Bo"]);
    // the originals are not touched
    expect(JSON.parse(ana.workspaces[0].subjects[0].documents[1].content).learner).toBe("");
  });

  it("can be narrowed to one topic by name across the members", () => {
    expect(subjectNamesOf([ana, bo])).toEqual(["Maths", "Physics"]);
    const [workspace] = buildGroupWorkspaces([ana, bo], { subjectName: "Physics" });
    expect(workspace.subjects[0].name).toBe("Physics");
    expect(joinAttempts(workspace.subjects[0].documents).map((entry) => entry.learner)).toEqual(["Bo"]);
  });

  it("keeps two students with the same name apart", () => {
    const twin = { ...member("ana2", "Ana", [attempt("q-x", 1)]), student: { id: "ana2", displayName: "Ana", email: "ana2@home.com" } };
    const labels = memberLabels([ana, twin]);
    expect(labels.get("ana")).toBe("Ana (ana@home.com)");
    expect(labels.get("ana2")).toBe("Ana (ana2@home.com)");
    const learners = buildGroupWorkspaces([ana, twin])[0].subjects[0].documents.filter((document) => document.tags.includes("activity-attempt")).map((document) => JSON.parse(document.content).learner);
    expect(new Set(learners).size).toBe(2);
  });

  it("compares the members, weakest first, with how late they are and when they were last active", () => {
    const rows = compareMembers([ana, bo], { now: new Date("2026-10-11T10:00:00Z").getTime() });
    expect(rows.map((row) => row.name)).toEqual(["Bo", "Ana"]);
    expect(rows[0]).toMatchObject({ attempts: 1, late: 1, plans: 1, idleDays: 10 });
    expect(rows[1].mastery).toBeGreaterThan(rows[0].mastery);
    expect(compareMembers([member("c", "Cy", [])])[0]).toMatchObject({ mastery: null, attempts: 0, idleDays: null });
  });

  it("builds the study plans table with who set each deadline", () => {
    const rows = memberPlanRows([ana, bo, member("c", "Cy", [])]);
    const [anaRow, boRow, cyRow] = rows;
    expect(anaRow.plans[0]).toMatchObject({ name: "Maths plan", total: 2, done: 1, imposed: true, setBy: "Prof. Rivera", examDateId: "ex-1" });
    expect(boRow.plans[0]).toMatchObject({ imposed: false, setBy: "", late: 1 });
    expect(cyRow.plans).toEqual([]);
  });

  it("says whether a student has a plan for an exam date and how far along it is", () => {
    expect(examPlanStatus(ana, "ex-1")).toMatchObject({ planned: true, ratio: 0.5, plans: [{ name: "Maths plan", done: 1, total: 2 }] });
    expect(examPlanStatus(ana, "ex-2")).toEqual({ planned: false, plans: [], ratio: 0 });
    expect(examPlanStatus(bo, "ex-1").planned).toBe(false);
  });
});
