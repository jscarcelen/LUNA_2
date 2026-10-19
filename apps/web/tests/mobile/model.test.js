import { describe, expect, it } from "vitest";
import { activityType, displayName, dueText, homeModel, libraryGroups, planTasks, progressModel, studyActivities, uploadSubjects } from "../../modules/mobile/model.js";
import { planRowsOf, rankPlans } from "../../modules/dashboard/home.js";
import { joinAttempts } from "../../modules/performance/metrics.js";
import { desktopPageFor, isMobileRoot, mobileTabOf, mobileTabs, sectionOf } from "../../components/navModel.js";
import { makeT } from "../../lib/i18n/index.js";
import es from "../../lib/i18n/messages/es/mobile.js";
import en from "../../lib/i18n/messages/en/mobile.js";

const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

const quiz = (id, title, questions, extra = {}) => ({
  id,
  name: `${title}.resource.json`,
  sourceType: "generated",
  tags: ["resource", "activity", ...(extra.tags || [])],
  updatedAt: extra.updatedAt || "2026-10-10T10:00:00Z",
  folderIds: [],
  content: JSON.stringify({ kind: "resource", name: title, meta: { agentId: extra.agentId || "quiz-generator" }, activity: { id: `act-${id}`, title, questions } })
});

const attempt = (id, activityDocumentId, activityId, score, total, results, at = "2026-10-15T10:00:00Z") => ({
  id,
  name: "attempt.json",
  sourceType: "generated",
  tags: ["activity-attempt"],
  content: JSON.stringify({ kind: "activity-attempt", activityDocumentId, activityId, learner: "Maria", attempt: { activityId, activityTitle: "x", at, score, total, results } })
});

const question = (id, topic = "Fractions") => ({ id, kind: "choice", prompt: `Q ${id}`, options: ["a", "b"], answer: "a", topic });

function workspace({ withPlan = false, withAttempts = true } = {}) {
  const maths = {
    id: "s-maths",
    name: "Maths",
    folders: [{ id: "f-up", name: "Uploaded material", parentFolderId: "" }],
    documents: [
      { id: "d-notes", name: "Fractions notes.pdf", sourceType: "uploaded", tags: [], folderIds: ["f-up"], updatedAt: "2026-10-01T10:00:00Z" },
      quiz("q-done", "Fractions quiz", [question("1"), question("2"), question("3"), question("4")]),
      quiz("q-new", "Decimals quiz", [question("1", "Decimals"), question("2", "Decimals")], { tags: [`due:${day(2)}`] }),
      ...(withAttempts ? [attempt("a1", "q-done", "act-q-done", 1, 4, [
        { id: "1", kind: "choice", correct: true, topic: "Fractions", verdict: "correct", score: 1 },
        { id: "2", kind: "choice", correct: false, topic: "Fractions", verdict: "incorrect", score: 0, given: "b", expected: "a" },
        { id: "3", kind: "choice", correct: false, topic: "Fractions", verdict: "incorrect", score: 0, given: "b", expected: "a" },
        { id: "4", kind: "choice", correct: false, topic: "Fractions", verdict: "incorrect", score: 0, given: "b", expected: "a" }
      ])] : []),
      ...(withPlan ? [{
        id: "p1",
        name: "Maths exam.plan.json",
        sourceType: "generated",
        tags: ["study-plan"],
        content: JSON.stringify({ kind: "study-plan", name: "Maths exam", colour: "#0071e3", deadlines: [{ id: "dl", title: "Exam", date: day(10), kind: "exam" }], goals: [], items: [
          { id: "i1", title: "Do the decimals quiz", kind: "activity", resourceId: "q-new", dueDate: day(1), minutes: 30, doneAt: "" },
          { id: "i2", title: "Read chapter 2", kind: "read", resourceId: "", dueDate: day(3), minutes: 30, doneAt: "" },
          { id: "i3", title: "Fractions quiz", kind: "activity", resourceId: "q-done", dueDate: day(-1), minutes: 30, doneAt: "" }
        ] })
      }] : [])
    ]
  };
  const shared = { id: "s-shared", name: "Shared documents", folders: [], documents: [{ id: "d-shared", name: "Worksheet.docx", sourceType: "uploaded", tags: ["shared-by:abc"], folderIds: [] }] };
  return { id: "w1", subjects: [maths, shared] };
}

describe("phone app model", () => {
  it("names things the way a student reads them", () => {
    expect(displayName("Cell biology.pdf")).toBe("Cell biology");
    expect(displayName("Fractions quiz.resource.json")).toBe("Fractions quiz");
    expect(activityType({ meta: { agentId: "math-problem-set" }, activity: { questions: [question("1")] } })).toBe("Problem set");
    expect(activityType({ activity: { questions: [{ kind: "flashcard" }, { kind: "flashcard" }] } })).toBe("Flashcards");
  });

  it("lists material and what Luna made by subject, without attempts or plans, and searches", () => {
    const groups = libraryGroups(workspace({ withPlan: true }));
    expect(groups.map((group) => group.subjectName)).toEqual(["Maths", "Shared documents"]);
    const maths = groups[0].items;
    expect(maths.map((item) => item.id).sort()).toEqual(["d-notes", "q-done", "q-new"]);
    expect(maths.find((item) => item.id === "d-notes")).toMatchObject({ kind: "source", type: "PDF", typeId: "pdf", folderName: "Uploaded material", playable: false });
    expect(maths.find((item) => item.id === "q-new")).toMatchObject({ kind: "made", type: "Quiz", typeId: "quiz", playable: true, name: "Decimals quiz" });
    expect(groups[1].shared).toBe(true);
    expect(libraryGroups(workspace(), "decimal").flatMap((group) => group.items).map((item) => item.id)).toEqual(["q-new"]);
    expect(uploadSubjects(workspace()).map((subject) => subject.id)).toEqual(["s-maths"]);
  });

  it("suggests activities with a real reason: started first, then due, then mistakes to go over", () => {
    const rows = studyActivities(workspace(), { drafts: {} });
    expect(rows.map((row) => row.documentId)).toEqual(["q-new", "q-done"]);
    expect(rows[0].reason).toBe("Due in 2 days");
    expect(rows[1].reason).toMatch(/^Last time: 1 of 4/);
    const withDraft = studyActivities(workspace(), { drafts: { "q-done": { answered: 2, total: 4 } } });
    expect(withDraft[0].documentId).toBe("q-done");
    expect(withDraft[0].reason).toBe("You started this · 2 of 4 answered");
  });

  it("Home's next step comes from the plan first, then from an activity, and is empty when there is nothing", () => {
    const fromPlan = homeModel(workspace({ withPlan: true }));
    // The fractions step already has an attempt, so it counts as done; the next open step is the decimals quiz.
    expect(fromPlan.next).toMatchObject({ source: "plan", title: "Do the decimals quiz", topic: "Maths exam", subject: "Maths", documentId: "q-new", late: false });
    const fromActivity = homeModel(workspace());
    expect(fromActivity.next).toMatchObject({ source: "activity", documentId: "q-new" });
    const empty = homeModel({ id: "w", subjects: [{ id: "s", name: "Maths", folders: [], documents: [] }] });
    expect(empty.next).toBeNull();
    expect(empty.hasMaterial).toBe(false);
    expect(empty.continueItems).toEqual([]);
    expect(empty.upcoming).toEqual([]);
  });

  it("Home lists what was left half-way and at most two upcoming items", () => {
    const model = homeModel(workspace({ withPlan: true }), { drafts: { "q-new": { answered: 1, total: 2 } }, examDates: [{ id: "e1", title: "Maths final", date: day(20), senderName: "Prof. Rivera" }] });
    expect(model.continueItems).toEqual([expect.objectContaining({ documentId: "q-new", answered: 1, total: 2 })]);
    expect(model.upcoming).toHaveLength(2);
    expect(model.upcoming[0].title).toBe("Read chapter 2");
  });

  it("turns plans into steps with a status", () => {
    const ws = workspace({ withPlan: true });
    const rows = planRowsOf(ws);
    const entries = rankPlans(rows, joinAttempts(ws.subjects.flatMap((subject) => subject.documents)), { limit: 10 });
    const [plan] = planTasks(entries, rows, ws, { "q-new": { answered: 1, total: 2 } });
    expect(plan).toMatchObject({ name: "Maths exam", done: 1, total: 3 });
    const byId = Object.fromEntries(plan.steps.map((step) => [step.id, step]));
    expect(byId.i3.status).toBe("done");
    expect(byId.i1.status).toBe("started");
    expect(byId.i2).toMatchObject({ status: "todo", playable: false, resourceId: "" });
    expect(plan.steps[plan.steps.length - 1].id).toBe("i3");
  });

  it("shows no progress before a first activity, and real mastery after", () => {
    expect(progressModel(workspace({ withAttempts: false })).hasData).toBe(false);
    const model = progressModel(workspace());
    expect(model.hasData).toBe(true);
    expect(model.overall.questions).toBe(4);
    expect(model.topics[0].topic).toBe("Fractions");
    expect(model.weak.map((entry) => entry.topic)).toEqual(["Fractions"]);
    expect(model.recent[0]).toMatchObject({ resourceId: "q-done", score: 1, total: 4, subject: "Maths" });
  });

  it("writes dates in plain words", () => {
    expect(dueText(day(0))).toBe("Due today");
    expect(dueText(day(1))).toBe("Due tomorrow");
    expect(dueText(day(3))).toBe("Due in 3 days");
    expect(dueText(day(-2))).toBe("2 days late");
    expect(dueText("")).toBe("");
  });

  it("speaks Spanish when the app does, with the same keys in both languages", () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    const t = makeT("es");
    expect(dueText(day(1), t)).toBe("Para mañana");
    expect(studyActivities(workspace(), {}, t)[1].reason).toMatch(/^La última vez: 1 de 4/);
    expect(libraryGroups(workspace(), "", t)[0].items.find((item) => item.id === "q-new").type).toBe("Test");
  });
});

describe("phone navigation", () => {
  it("has four student tabs and lights the right one on pages reached from it", () => {
    expect(mobileTabs().map((tab) => tab.label)).toEqual(["Home", "Study", "Library", "Progress"]);
    expect(mobileTabs(makeT("es")).map((tab) => tab.label)).toEqual(["Inicio", "Estudiar", "Biblioteca", "Progreso"]);
    expect(mobileTabOf("dashboard")).toBe("home");
    expect(mobileTabOf("study?view=plan")).toBe("study");
    expect(mobileTabOf("plans?open=1")).toBe("study");
    expect(mobileTabOf("workspaces?doc=1")).toBe("library");
    expect(mobileTabOf("ai-tool:quiz-generator?docs=a")).toBe("library");
    expect(mobileTabOf("performance")).toBe("progress");
    expect(mobileTabOf("connections")).toBe("");
  });

  it("opens the website page for a phone page on a larger screen", () => {
    expect(desktopPageFor("library?add=1")).toBe("workspaces");
    expect(desktopPageFor("study")).toBe("activities");
    expect(desktopPageFor("study?view=plan")).toBe("plans");
    expect(desktopPageFor("plans?open=3")).toBe("plans?open=3");
    expect(isMobileRoot("library?add=1")).toBe(true);
    expect(isMobileRoot("plans")).toBe(false);
    expect(sectionOf("library")).toBe("study");
  });
});
