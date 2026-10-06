import { describe, expect, it } from "vitest";
import { authorizeWorkspaceAction, planDeadlineRefusal } from "../../lib/workspaceGuard.js";
import { DUE_OWN_PREFIX, dueInfoOf, isProtectedTag, sharedEditAllowed } from "../../modules/accounts/shared.js";
import { remapPlanForRecipient } from "../../lib/sharingRepository.js";
import { buildPlan, daysUntil, newDeadline, newItem, nextDeadline, planProgress, upcoming, visibleDeadlines } from "../../modules/plans/plan.js";
import {
  applyExamDateCancel, applyExamDateChange, checkDeadlineEdit, compareDeadlines, deadlineOrigin, dueSentence, examDeadline, examLinksIn,
  isImposed, linkPlanToExamDate, senderSetBy, shortDate, unbackedClaims
} from "../../modules/plans/deadlines.js";
import { conceptPriority, rankConcepts, rankDeadlines } from "../../modules/plans/priorityEngine.js";
import { nextSteps, rankPlans } from "../../modules/dashboard/home.js";

const iso = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const TEACHER = { id: "t-1", displayName: "Prof. Rivera" };
const imposed = (date, over = {}) => ({ id: over.id || "dl-t", title: "Hand-in", date, kind: "hand_in", setBy: senderSetBy(TEACHER), ...over });
const own = (date, over = {}) => ({ id: over.id || "dl-own", title: "My deadline", date, kind: "milestone", setBy: { kind: "self" }, ...over });

describe("who set a deadline", () => {
  it("knows an explicit sender, an explicit own deadline, and a deadline of a received copy that says nothing", () => {
    expect(deadlineOrigin(imposed("2026-12-01"))).toMatchObject({ imposed: true, locked: true, by: "Prof. Rivera", byId: "t-1" });
    expect(deadlineOrigin(own("2026-12-01"))).toMatchObject({ imposed: false, locked: false, label: "Your deadline" });
    expect(deadlineOrigin({ id: "x", date: "2026-12-01" })).toMatchObject({ imposed: false });
    // a legacy deadline in a plan that was sent to you was set by whoever sent it...
    expect(deadlineOrigin({ id: "x", date: "2026-12-01" }, { receivedFrom: { id: "t-1", name: "Prof. Rivera" } })).toMatchObject({ imposed: true, by: "Prof. Rivera" });
    // ...unless it is marked as yours
    expect(deadlineOrigin(own("2026-12-01"), { receivedFrom: { id: "t-1", name: "Prof. Rivera" } }).imposed).toBe(false);
    expect(deadlineOrigin(imposed("2026-12-01", { setBy: { kind: "sender", accountId: "t", name: "" } })).by).toBe("your teacher");
  });

  it("phrases a date the way notifications and emails do", () => {
    expect(shortDate("2026-10-24")).toBe("24 Oct");
    expect(dueSentence("2026-10-24", "Prof. Rivera")).toBe("due 24 Oct, set by Prof. Rivera");
    expect(dueSentence("2026-10-24")).toBe("due 24 Oct");
    expect(dueSentence("")).toBe("");
  });

  it("new deadlines made by the owner say so", () => {
    expect(newDeadline("Mock", "2026-11-01", "mock").setBy).toEqual({ kind: "self" });
  });
});

describe("a deadline set by the sender cannot be edited or removed by the receiver", () => {
  const before = { kind: "study-plan", deadlines: [imposed("2026-12-01"), own("2026-11-20")] };

  it("accepts anything that leaves the imposed deadlines exactly as they were, own deadlines included", () => {
    expect(checkDeadlineEdit(before, { ...before }).ok).toBe(true);
    expect(checkDeadlineEdit(before, { ...before, deadlines: [before.deadlines[0], own("2026-11-10", { id: "dl-own" }), own("2026-11-05", { id: "dl-new" })] }).ok).toBe(true);
    expect(checkDeadlineEdit(before, { ...before, deadlines: [before.deadlines[0]] }).ok).toBe(true);
    expect(checkDeadlineEdit(before, { ...before, name: "Renamed" }).ok).toBe(true);
  });

  it("refuses to change the date, the title or the kind, to remove it, or to take the lock off", () => {
    const attempts = [
      [{ ...imposed("2026-12-15") }, own("2026-11-20")],
      [{ ...imposed("2026-12-01"), title: "Whatever" }, own("2026-11-20")],
      [{ ...imposed("2026-12-01"), kind: "exam" }, own("2026-11-20")],
      [own("2026-11-20")],
      [{ ...imposed("2026-12-01"), setBy: { kind: "self" } }, own("2026-11-20")],
      [{ ...imposed("2026-12-01"), setBy: senderSetBy({ id: "someone-else", displayName: "Other" }) }, own("2026-11-20")]
    ];
    for (const deadlines of attempts) {
      const verdict = checkDeadlineEdit(before, { ...before, deadlines });
      expect(verdict.ok).toBe(false);
      expect(verdict.error).toContain("Prof. Rivera");
      expect(verdict.error).toContain("cannot be changed or removed");
    }
  });

  it("treats a brand-new 'imposed' deadline as a claim that only a real exam date can back", () => {
    const claim = examDeadline({ id: "exam-1", title: "Midterm", date: "2026-12-05", senderId: "t-1", senderName: "Prof. Rivera" });
    const verdict = checkDeadlineEdit({ deadlines: [] }, { deadlines: [claim, own("2026-11-01")] });
    expect(verdict).toMatchObject({ ok: true });
    expect(verdict.claims).toEqual([claim]);
    const dates = new Map([["exam-1", { senderId: "t-1", recipientId: "me", date: "2026-12-05" }]]);
    expect(unbackedClaims([claim], dates, "me")).toEqual([]);
    expect(unbackedClaims([claim], new Map(), "me")).toEqual([claim]);
    expect(unbackedClaims([claim], dates, "someone-else")).toEqual([claim]);
    expect(unbackedClaims([{ ...claim, date: "2026-12-06" }], dates, "me")).toHaveLength(1);
    expect(unbackedClaims([{ ...claim, setBy: senderSetBy({ id: "t-2", displayName: "X" }) }], dates, "me")).toHaveLength(1);
    expect(unbackedClaims([claim], new Map([["exam-1", { senderId: "t-1", recipientId: "me", date: "2026-12-05", revoked: true }]]), "me")).toHaveLength(1);
  });
});

describe("the server refuses a student who edits an imposed deadline, and allows their own", () => {
  const ME = "student-1";
  const planContent = (deadlines) => JSON.stringify({ kind: "study-plan", name: "Maths", deadlines, items: [], goals: [] });
  const facts = (content, tags = ["study-plan"], extra = {}) => ({
    workspaceOwner: new Map([["w1", ME]]),
    subjects: new Map([["s1", { workspaceId: "w1", name: "Maths" }]]),
    folders: new Map(),
    documents: new Map([["plan", { subjectId: "s1", name: "Maths.plan.json", tags, folderIds: [], content }]]),
    ...extra
  });
  const update = (content, newDeadlines, extra) => authorizeWorkspaceAction({ action: "updateGeneratedDocument", payload: { subjectId: "s1", documentId: "plan", file: { name: "Maths.plan.json", content: planContent(newDeadlines) } }, ownerUserId: ME, facts: facts(content, ["study-plan"], extra) });
  const exam = (id = "exam-1") => examDeadline({ id, title: "Midterm", date: "2026-12-05", senderId: "t-1", senderName: "Prof. Rivera" });
  const examRow = new Map([["exam-1", { senderId: "t-1", recipientId: ME, date: "2026-12-05" }]]);

  it("lets a student add, change and remove their own deadlines next to a locked one", () => {
    const content = planContent([exam(), own("2026-11-20")]);
    expect(update(content, [exam(), own("2026-11-20"), own("2026-11-10", { id: "dl-2" })], { examDates: examRow }).ok).toBe(true);
    expect(update(content, [exam(), own("2026-11-25")], { examDates: examRow }).ok).toBe(true);
    expect(update(content, [exam()], { examDates: examRow }).ok).toBe(true);
  });

  it("answers 403 when the locked deadline is changed or removed", () => {
    const content = planContent([exam(), own("2026-11-20")]);
    const moved = update(content, [{ ...exam(), date: "2026-12-20" }, own("2026-11-20")], { examDates: examRow });
    expect(moved).toMatchObject({ ok: false, status: 403 });
    expect(moved.error).toContain("Prof. Rivera");
    expect(update(content, [own("2026-11-20")], { examDates: examRow })).toMatchObject({ ok: false, status: 403 });
    const unlocked = { ...exam(), setBy: { kind: "self" } };
    expect(update(content, [unlocked, own("2026-11-20")], { examDates: examRow })).toMatchObject({ ok: false, status: 403 });
  });

  it("refuses a made-up teacher deadline, accepts one that follows a real exam date", () => {
    const empty = planContent([]);
    expect(update(empty, [exam()])).toMatchObject({ ok: false, status: 403 });
    expect(update(empty, [exam()], { examDates: new Map() })).toMatchObject({ ok: false, status: 403 });
    expect(update(empty, [exam()], { examDates: examRow }).ok).toBe(true);
    // creating a new plan that follows the date goes through the same check
    const create = (deadlines, examDates) => authorizeWorkspaceAction({ action: "saveGeneratedQuizDocument", payload: { subjectId: "s1", tags: ["study-plan"], file: { name: "p", content: planContent(deadlines) } }, ownerUserId: ME, facts: facts(empty, ["study-plan"], { examDates }) });
    expect(create([exam()], examRow).ok).toBe(true);
    expect(create([exam()], undefined)).toMatchObject({ ok: false, status: 403 });
    expect(create([own("2026-12-01")], undefined).ok).toBe(true);
  });

  it("a plan someone sent (a received copy) keeps the sender's deadlines and lets the receiver add their own", () => {
    const sent = JSON.stringify({ kind: "study-plan", name: "Exam plan", deadlines: [imposed("2026-12-01")], items: [{ id: "i1", title: "Quiz", dueDate: "2026-11-10", doneAt: "" }] });
    const withOwn = JSON.stringify({ kind: "study-plan", name: "Exam plan", deadlines: [imposed("2026-12-01"), own("2026-11-15")], items: [{ id: "i1", title: "Quiz", dueDate: "2026-11-10", doneAt: "" }] });
    const earlierOwn = JSON.stringify({ ...JSON.parse(withOwn), deadlines: [imposed("2026-12-01"), own("2026-11-12")], documentId: "copy", receivedFrom: { id: "t-1", name: "x" } });
    const moved = JSON.stringify({ ...JSON.parse(sent), deadlines: [imposed("2026-12-20")] });
    const removed = JSON.stringify({ ...JSON.parse(sent), deadlines: [] });
    const unmarked = JSON.stringify({ ...JSON.parse(sent), deadlines: [imposed("2026-12-01"), { id: "dl-x", title: "Mine", date: "2026-11-15", kind: "exam" }] });
    expect(sharedEditAllowed(sent, withOwn)).toBe(true);
    expect(sharedEditAllowed(withOwn, earlierOwn)).toBe(true);
    expect(sharedEditAllowed(sent, moved)).toBe(false);
    expect(sharedEditAllowed(sent, removed)).toBe(false);
    expect(sharedEditAllowed(sent, unmarked)).toBe(false);
    // steps: the receiver's own date next to the given one is allowed, the given one is not theirs to change
    const ownStep = JSON.stringify({ ...JSON.parse(sent), items: [{ id: "i1", title: "Quiz", dueDate: "2026-11-10", ownDueDate: "2026-11-08", doneAt: "" }] });
    const moveStep = JSON.stringify({ ...JSON.parse(sent), items: [{ id: "i1", title: "Quiz", dueDate: "2026-11-20", doneAt: "" }] });
    expect(sharedEditAllowed(sent, ownStep)).toBe(true);
    expect(sharedEditAllowed(sent, moveStep)).toBe(false);
  });

  it("the guard applies it through updateGeneratedDocument on a received copy", () => {
    const sent = JSON.stringify({ kind: "study-plan", name: "Exam plan", deadlines: [imposed("2026-12-01")], items: [] });
    const run = (next) => authorizeWorkspaceAction({ action: "updateGeneratedDocument", payload: { subjectId: "s1", documentId: "plan", file: { name: "Maths.plan.json", content: next } }, ownerUserId: ME, facts: facts(sent, ["study-plan", "shared-by:t-1", "assigned-by:t-1"]) });
    expect(run(JSON.stringify({ ...JSON.parse(sent), deadlines: [imposed("2026-12-01"), own("2026-11-20")] })).ok).toBe(true);
    expect(run(JSON.stringify({ ...JSON.parse(sent), deadlines: [] }))).toMatchObject({ ok: false, status: 403 });
  });

  it("a due date on an assigned activity cannot be changed or removed; the receiver's own date goes next to it", () => {
    const tags = ["resource", "activity", "shared-by:t-1", "assigned-by:t-1", "due-by:t-1", "due:2026-11-01"];
    const run = (requested) => authorizeWorkspaceAction({ action: "updateDocumentMeta", payload: { subjectId: "s1", documentId: "quiz", folderIds: [], tags: requested }, ownerUserId: ME, facts: { ...facts("x"), documents: new Map([["quiz", { subjectId: "s1", name: "Quiz", tags, folderIds: [], content: "" }]]) } });
    const changed = run(["resource", "activity", "due:2026-12-24"]);
    expect(changed.ok).toBe(true);
    expect(changed.payload.tags).toEqual(expect.arrayContaining(["due:2026-11-01", "due-by:t-1", "shared-by:t-1", "assigned-by:t-1"]));
    expect(changed.payload.tags).not.toContain("due:2026-12-24");
    const removed = run(["resource", "activity"]);
    expect(removed.payload.tags).toContain("due:2026-11-01");
    const added = run(["resource", "activity", "due-own:2026-10-28", "due-by:someone-else"]);
    expect(added.payload.tags).toContain("due-own:2026-10-28");
    expect(added.payload.tags).not.toContain("due-by:someone-else");
    expect(added.payload.tags.filter((tag) => tag.startsWith("due-by:"))).toEqual(["due-by:t-1"]);
  });

  it("a student cannot give their own document a 'set by' tag", () => {
    expect(isProtectedTag("due-by:t-1")).toBe(true);
    expect(isProtectedTag("due-own:2026-10-28")).toBe(false);
    const created = authorizeWorkspaceAction({ action: "saveGeneratedQuizDocument", payload: { subjectId: "s1", tags: ["resource", "due-by:t-9", "due:2026-11-01"], file: { name: "n", content: "{}" } }, ownerUserId: ME, facts: facts("") });
    expect(created.payload.tags).toEqual(["resource", "due:2026-11-01"]);
  });

  it("planDeadlineRefusal is the same check for any caller", () => {
    expect(planDeadlineRefusal(planContent([imposed("2026-12-01")]), planContent([]), { examDates: new Map(), accountId: ME })).toContain("Prof. Rivera");
    expect(planDeadlineRefusal(planContent([]), "not a plan", { examDates: new Map(), accountId: ME })).toBe("");
  });
});

describe("what is imposed on a document's own due date", () => {
  it("reads the sender's date and the receiver's own date separately and the earlier one as the date", () => {
    expect(dueInfoOf({ tags: ["activity", "assigned-by:t-1", "due-by:t-1", "due:2026-11-01", "due-own:2026-10-28"] })).toEqual({ imposed: { date: "2026-11-01", byId: "t-1" }, own: { date: "2026-10-28" }, date: "2026-10-28" });
    expect(dueInfoOf({ tags: ["activity", "due:2026-11-01"] })).toEqual({ imposed: null, own: { date: "2026-11-01" }, date: "2026-11-01" });
    // assigned copies from before the origin was recorded: the date was the sender's
    expect(dueInfoOf({ tags: ["activity", "assigned-by:t-1", "shared-by:t-1", "due:2026-11-01"] }).imposed).toEqual({ date: "2026-11-01", byId: "t-1" });
    expect(dueInfoOf({ tags: [] })).toEqual({ imposed: null, own: null, date: "" });
    expect(DUE_OWN_PREFIX).toBe("due-own:");
  });

  it("assigning stamps every deadline of the plan as the sender's", () => {
    const original = { items: [], goals: [], materialIds: [], deadlines: [{ id: "d1", title: "Exam", date: "2026-12-01", kind: "exam", setBy: { kind: "self" } }] };
    const copy = remapPlanForRecipient(original, new Map(), { senderId: "t-1", senderName: "Prof. Rivera", dueDate: "2026-11-20" });
    expect(copy.deadlines.map((deadline) => [deadline.date, deadline.setBy.kind, deadline.setBy.name])).toEqual([["2026-12-01", "sender", "Prof. Rivera"], ["2026-11-20", "sender", "Prof. Rivera"]]);
    expect(original.deadlines[0].setBy.kind).toBe("self");
  });
});

describe("an imposed deadline ranks above an equal own one", () => {
  const rowOf = (id, plan) => ({ document: { id }, plan: { ...plan, documentId: id }, subjectId: "s", subjectName: "S", workspaceId: "w" });

  it("picks the imposed deadline as the plan's next one on the same day, and shows both when both exist", () => {
    const plan = buildPlan({ name: "P", deadlines: [own(iso(5), { id: "a" }), imposed(iso(5), { id: "b" }), own(iso(2), { id: "c" })] });
    expect(nextDeadline(plan).id).toBe("c");
    const sameDay = buildPlan({ name: "P", deadlines: [own(iso(5), { id: "a" }), imposed(iso(5), { id: "b" })] });
    expect(nextDeadline(sameDay).id).toBe("b");
    expect(visibleDeadlines(plan).map((deadline) => deadline.id)).toEqual(["c", "b"]);
    expect(visibleDeadlines(buildPlan({ name: "P", deadlines: [own(iso(3))] }))).toHaveLength(1);
    expect(visibleDeadlines(buildPlan({ name: "P" }))).toEqual([]);
    expect([own("2026-12-01"), imposed("2026-12-01")].sort(compareDeadlines).map(isImposed)).toEqual([true, false]);
    expect(rankDeadlines([own("2026-12-05", { id: "late" }), own("2026-12-01", { id: "own" }), imposed("2026-12-01", { id: "imp" })]).map((deadline) => deadline.id)).toEqual(["imp", "own", "late"]);
  });

  it("lists the imposed one first in 'what needs doing now' (and a step of a received plan before the learner's own)", () => {
    const mine = rowOf("mine", buildPlan({ name: "Mine", deadlines: [own(iso(2))] }));
    const theirs = rowOf("theirs", buildPlan({ name: "Theirs", deadlines: [imposed(iso(2))] }));
    const list = upcoming([mine, theirs], [], 7);
    expect(list.map((entry) => [entry.planId, entry.imposed, entry.setByName])).toEqual([["theirs", true, "Prof. Rivera"], ["mine", false, ""]]);
    const stepMine = rowOf("m2", buildPlan({ name: "M", items: [newItem({ title: "Own step", dueDate: iso(1), resourceId: "r1" })] }));
    const stepTheirs = rowOf("t2", { ...buildPlan({ name: "T", items: [newItem({ title: "Given step", dueDate: iso(1), resourceId: "r2" })] }), receivedFrom: { id: "t-1", name: "Prof. Rivera" } });
    expect(upcoming([stepMine, stepTheirs], [], 7).map((entry) => entry.title)).toEqual(["Given step", "Own step"]);
  });

  it("counts the earlier of a step's given date and the learner's own as its date", () => {
    const plan = buildPlan({ name: "P", items: [{ ...newItem({ title: "Quiz", dueDate: iso(5), resourceId: "r" }), ownDueDate: iso(-1) }] });
    expect(planProgress(plan, []).late).toHaveLength(1);
    expect(upcoming([rowOf("p", plan)], [], 7)[0]).toMatchObject({ dueDate: iso(-1), days: -1 });
  });

  it("ranks Home's plans: on the same deadline day the plan with a teacher's date comes first; nearer still wins", () => {
    const rows = [
      rowOf("own", buildPlan({ name: "A own", deadlines: [own(iso(4))], items: [newItem({ title: "s", resourceId: "r1" })] })),
      rowOf("imp", buildPlan({ name: "B imposed", deadlines: [imposed(iso(4))], items: [newItem({ title: "s", resourceId: "r2" })] })),
      rowOf("near", buildPlan({ name: "C near", deadlines: [own(iso(1))], items: [newItem({ title: "s", resourceId: "r3" })] }))
    ];
    expect(rankPlans(rows, []).map((entry) => entry.plan.name)).toEqual(["C near", "B imposed", "A own"]);
    expect(rankPlans(rows, []).find((entry) => entry.document.id === "imp").imposed).toBe(true);
  });

  it("orders Home's next steps the same way", () => {
    const entries = rankPlans([
      rowOf("own", buildPlan({ name: "Own", items: [newItem({ title: "Own step", dueDate: iso(3), resourceId: "r1" })] })),
      rowOf("imp", { ...buildPlan({ name: "Sent", items: [newItem({ title: "Sent step", dueDate: iso(3), resourceId: "r2" })] }), receivedFrom: { id: "t-1", name: "Prof. Rivera" } })
    ], []);
    const steps = nextSteps(entries);
    expect(steps.map((step) => [step.title, step.imposed, step.setByName])).toEqual([["Sent step", true, "Prof. Rivera"], ["Own step", false, ""]]);
  });

  it("scores a concept studied for an imposed exam above the same concept for an equal own date", () => {
    const concept = { id: "c", importance: 0.8 };
    const state = { mastery: 0.3 };
    const date = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    expect(conceptPriority(state, concept, date, { imposed: true })).toBeGreaterThan(conceptPriority(state, concept, date));
    expect(conceptPriority(state, concept, null, { imposed: true })).toBe(conceptPriority(state, concept, null));
    const ranked = rankConcepts([concept], { c: state }, { examDate: date, examImposed: true });
    expect(ranked[0].priority).toBe(conceptPriority(state, concept, date, { imposed: true }));
    expect(daysUntil(date)).toBe(5);
  });
});

describe("exam dates move and cancel the plans that follow them", () => {
  const exam = { id: "exam-1", title: "Midterm", date: "2026-12-05", senderId: "t-1", senderName: "Prof. Rivera" };

  it("links a plan to a date (locked), refreshes the same link, and lists what a plan follows", () => {
    const plan = { name: "P", deadlines: [own("2026-11-01")] };
    const linked = linkPlanToExamDate(plan, exam);
    expect(linked.deadlines).toHaveLength(2);
    expect(linked.deadlines[1]).toMatchObject({ examDateId: "exam-1", kind: "exam", date: "2026-12-05", setBy: { kind: "sender", accountId: "t-1", name: "Prof. Rivera" } });
    expect(linkPlanToExamDate(linked, { ...exam, date: "2026-12-07" }).deadlines).toHaveLength(2);
    expect(examLinksIn(linked)).toEqual(["exam-1"]);
  });

  it("moves the deadline with the date and leaves everything else alone", () => {
    const linked = linkPlanToExamDate({ name: "P", deadlines: [own("2026-11-01")] }, exam);
    const moved = applyExamDateChange(linked, { ...exam, title: "Midterm (room 4)", date: "2026-12-12" });
    expect(moved.changed).toBe(true);
    expect(moved.plan.deadlines.find((deadline) => deadline.examDateId === "exam-1")).toMatchObject({ date: "2026-12-12", title: "Midterm (room 4)" });
    expect(moved.plan.deadlines.find((deadline) => deadline.id === "dl-own" || deadline.setBy.kind === "self").date).toBe("2026-11-01");
    expect(applyExamDateChange(moved.plan, { ...exam, title: "Midterm (room 4)", date: "2026-12-12" }).changed).toBe(false);
    expect(applyExamDateChange({ deadlines: [own("2026-11-01")] }, exam).changed).toBe(false);
  });

  it("keeps the date as the student's own editable deadline when the exam is cancelled", () => {
    const linked = linkPlanToExamDate({ name: "P", deadlines: [] }, exam);
    const cancelled = applyExamDateCancel(linked, exam);
    expect(cancelled.changed).toBe(true);
    expect(cancelled.plan.deadlines).toHaveLength(1);
    expect(cancelled.plan.deadlines[0]).toMatchObject({ date: "2026-12-05", setBy: { kind: "self" }, cancelledFrom: "Prof. Rivera" });
    expect(cancelled.plan.deadlines[0].examDateId).toBeUndefined();
    expect(isImposed(cancelled.plan.deadlines[0])).toBe(false);
    // and now the student may edit it: the guard has nothing locked
    expect(checkDeadlineEdit(cancelled.plan, { deadlines: [] }).ok).toBe(true);
  });
});
