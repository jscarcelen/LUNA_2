import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./fakeDb.js";

const mail = vi.hoisted(() => ({ sent: [] }));

vi.mock("../../lib/supabaseClient.js", async () => {
  const { db: fake } = await import("./fakeDb.js");
  return { createSupabaseAdminClient: () => fake.client, isSupabaseConfigured: () => true, getDemoOwnerUserId: () => "demo" };
});
vi.mock("../../lib/workspacesRepository.js", async () => {
  const { db: fake } = await import("./fakeDb.js");
  return {
    createWorkspace: async (name, owner) => fake.add("workspaces", { name, owner_user_id: owner }),
    createSubject: async (workspaceId, name) => fake.add("subjects", { workspace_id: workspaceId, name }),
    createFolder: async (subjectId, name, parent) => fake.add("folders", { subject_id: subjectId, name, parent_folder_id: parent || null }),
    listWorkspaceTree: async () => [],
    updateDocumentMeta: async () => {}
  };
});
vi.mock("../../lib/mailer.js", async (importOriginal) => ({
  ...(await importOriginal()),
  sendMail: vi.fn(async (message) => {
    mail.sent.push(message);
    return { delivered: true, provider: "test" };
  })
}));

const core = await import("../../lib/accountsCore.js");
const { clearAccountLimits, limits } = await import("../../lib/accountLimits.js");
const repo = await import("../../lib/accountsRepository.js");
const groupsRepo = await import("../../lib/groupsRepository.js");
const exams = await import("../../lib/examDatesRepository.js");
const examRoute = await import("../../app/api/accounts/exam-dates/route.js");
const linksRoute = await import("../../app/api/accounts/links/route.js");
const { guardWorkspaceAction } = await import("../../lib/workspaceGuard.js");
const { normalizeExamInput, sortExamDates, planableExamDates } = await import("../../modules/accounts/examDates.js");
const { describeEvent } = await import("../../modules/accounts/bellText.js");
const { examPlanStatus } = await import("../../modules/accounts/groupData.js");
const { isImposed } = await import("../../modules/plans/deadlines.js");

const { signSession, resolveSessionSecret, SESSION_COOKIE } = core;

let counter = 0;
const cookieFor = (id) => ({ cookie: `${SESSION_COOKIE}=${encodeURIComponent(signSession(id, resolveSessionSecret()))}`, host: "luna.test", "x-forwarded-proto": "https" });
const post = (who, body) => examRoute.POST(new Request("http://localhost/api/accounts/exam-dates", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.7.0.${++counter}`, ...cookieFor(who.id) }, body: JSON.stringify(body) }));
const get = (who) => examRoute.GET(new Request("http://localhost/api/accounts/exam-dates", { headers: cookieFor(who.id) }));

const account = (over) => db.add("accounts", { password_hash: "x", display_name: over.email, under_13: false, failed_logins: 0, locked_until: null, email_verified_at: new Date().toISOString(), phone: null, phone_verified_at: null, password_changed_at: null, notifications_seen_at: null, pending_invites: null, ...over });
const connect = (a, b, kind = "teacher_student") => db.add("account_links", { kind, requester_id: a.id, requester_email: a.email, target_id: b.id, target_email: b.email, status: "accepted", pair_key: `${kind}:${[a.email, b.email].sort().join("|")}` });

const future = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

let teacher;
let other;
let maria;
let tom;
let zed;
let group;

/** A study plan document in a student's workspace, stored the way the plans page stores it (raw JSON). */
function planFor(student, deadlines = [], extra = {}) {
  const workspace = db.table("workspaces").find((row) => row.owner_user_id === student.id) || db.add("workspaces", { owner_user_id: student.id, name: "My workspace" });
  const subject = db.table("subjects").find((row) => row.workspace_id === workspace.id) || db.add("subjects", { workspace_id: workspace.id, name: "Maths" });
  const content = JSON.stringify({ kind: "study-plan", name: "Maths plan", deadlines, items: [{ id: "i1", title: "Do the quiz", dueDate: future(3) }], goals: [], ...extra });
  const doc = db.add("documents", { subject_id: subject.id, folder_id: null, name: "Maths plan.plan.json", content, preview: "1 steps", size_bytes: content.length, source_type: "generated" });
  let topic = db.table("topic_tags").find((row) => row.subject_id === subject.id && row.tag === "study-plan");
  if (!topic) topic = db.add("topic_tags", { subject_id: subject.id, tag: "study-plan" });
  db.add("document_tags", { document_id: doc.id, topic_tag_id: topic.id });
  return doc;
}
const planBody = (doc) => JSON.parse(db.table("documents").find((row) => row.id === doc.id).content);

beforeEach(async () => {
  db.reset();
  repo.resetSchemaCache();
  repo.resetSharingCache();
  groupsRepo.resetGroupsCache();
  clearAccountLimits();
  mail.sent.length = 0;
  teacher = account({ email: "rivera@school.edu", display_name: "Prof. Rivera", role: "teacher" });
  other = account({ email: "other@school.edu", display_name: "Prof. Other", role: "teacher" });
  maria = account({ email: "maria@home.com", display_name: "Maria", role: "student" });
  tom = account({ email: "tom@home.com", display_name: "Tom", role: "student" });
  zed = account({ email: "zed@home.com", display_name: "Zed", role: "student" });
  connect(teacher, maria);
  connect(teacher, tom);
  connect(other, zed);
  group = await groupsRepo.createGroup(teacher, { name: "Group A", memberIds: [maria.id, tom.id] });
});

describe("what a sender may type", () => {
  it("needs a title and a real date, refuses the past when sending, trims the rest", () => {
    expect(normalizeExamInput({ title: "  ", date: "2026-12-01" }, { today: "2026-10-05" }).ok).toBe(false);
    expect(normalizeExamInput({ title: "Midterm", date: "31/12/2026" }, { today: "2026-10-05" }).ok).toBe(false);
    expect(normalizeExamInput({ title: "Midterm", date: "2026-10-01" }, { today: "2026-10-05" })).toMatchObject({ ok: false, error: "That date is in the past." });
    expect(normalizeExamInput({ title: "Midterm", date: "2026-10-01" }, { today: "2026-10-05", allowPast: true }).ok).toBe(true);
    const ok = normalizeExamInput({ title: "  Maths   midterm ", date: "2026-12-01", subjectHint: " Algebra ", notes: " bring a calculator " }, { today: "2026-10-05" });
    expect(ok.value).toEqual({ title: "Maths midterm", date: "2026-12-01", subjectHint: "Algebra", notes: "bring a calculator" });
  });

  it("sorts soonest first with past dates last and offers only upcoming, visible ones for planning", () => {
    const list = [{ id: "a", title: "A", date: "2026-10-01" }, { id: "b", title: "B", date: "2026-12-01" }, { id: "c", title: "C", date: "2026-11-01", dismissedAt: "x" }, { id: "d", title: "D", date: "2026-10-20" }];
    expect(sortExamDates(list, "2026-10-05").map((entry) => entry.id)).toEqual(["d", "c", "b", "a"]);
    expect(planableExamDates(list, "2026-10-05").map((entry) => entry.id)).toEqual(["d", "b"]);
  });
});

describe("sending an exam date", () => {
  it("goes to a group and to individuals, one row per student, each student once, the rows sharing one batch", async () => {
    const sent = await exams.sendExamDate({ sender: teacher, input: { title: "Maths midterm", date: future(30), subjectHint: "Algebra", notes: "Units 4-6" }, groupIds: [group.id], recipientIds: [maria.id] });
    expect(sent.results.map((entry) => entry.recipientId).sort()).toEqual([maria.id, tom.id].sort());
    expect(sent.summary).toMatchObject({ delivered: 2, skipped: { not_connected: 0, already_has_it: 0, failed: 0 } });
    const rows = db.table("exam_dates");
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.batch_id)).size).toBe(1);
    expect(rows.every((row) => row.sender_id === teacher.id && row.group_id === group.id && row.subject_hint === "Algebra" && !row.revoked_at)).toBe(true);
  });

  it("reports people who are not connected, never sends twice, and refuses non-guardians and bad input", async () => {
    const first = await exams.sendExamDate({ sender: teacher, input: { title: "Midterm", date: future(20) }, recipientIds: [maria.id, zed.id] });
    expect(first.results.find((entry) => entry.recipientId === zed.id)).toMatchObject({ ok: false, reason: "not_connected" });
    expect(first.summary).toMatchObject({ delivered: 1, skipped: { not_connected: 1 } });
    const again = await exams.sendExamDate({ sender: teacher, input: { title: "midterm", date: future(20) }, recipientIds: [maria.id] });
    expect(again.summary).toMatchObject({ delivered: 0, skipped: { already_has_it: 1 } });
    expect(db.table("exam_dates")).toHaveLength(1);
    await expect(exams.sendExamDate({ sender: maria, input: { title: "x", date: future(5) }, recipientIds: [tom.id] })).rejects.toMatchObject({ status: 403 });
    await expect(exams.sendExamDate({ sender: teacher, input: { title: "x", date: "2020-01-01" }, recipientIds: [maria.id] })).rejects.toMatchObject({ status: 400 });
    await expect(exams.sendExamDate({ sender: teacher, input: { title: "x", date: future(5) } })).rejects.toMatchObject({ status: 400 });
    // another teacher's group is nobody's: no rows
    await expect(exams.sendExamDate({ sender: other, input: { title: "x", date: future(5) }, groupIds: [group.id] })).rejects.toMatchObject({ status: 404 });
    expect(db.table("exam_dates")).toHaveLength(1);
  });

  it("is limited per hour like every batch", async () => {
    for (let index = 0; index < 599; index += 1) limits.batchDeliveriesBySender.fail(teacher.id);
    await expect(exams.sendExamDate({ sender: teacher, input: { title: "x", date: future(5) }, groupIds: [group.id] })).rejects.toMatchObject({ status: 429 });
    expect(db.table("exam_dates")).toHaveLength(0);
  });

  it("answers 503 setupNeeded naming the migration until it is applied, and reads as 'not supported'", async () => {
    db.drop("exam_dates", "exam_date_plans", "account_groups", "account_group_members");
    groupsRepo.resetGroupsCache(); // (a "yes" is remembered for good in production: tables do not disappear there)
    const sendResponse = await post(teacher, { action: "send", title: "Midterm", date: future(9), recipientIds: [maria.id] });
    expect(sendResponse.status).toBe(503);
    expect(await sendResponse.json()).toMatchObject({ setupNeeded: true, migration: core.GROUPS_MIGRATION });
    expect(await (await get(maria)).json()).toMatchObject({ supported: false, examDates: [] });
    expect(await (await get(teacher)).json()).toMatchObject({ supported: false, items: [] });
  });

  it("the route sends, mails each student once after the response, and can share a plan of the sender's at the same time", async () => {
    const ws = db.add("workspaces", { owner_user_id: teacher.id, name: "My workspace" });
    const subject = db.add("subjects", { workspace_id: ws.id, name: "Maths" });
    const content = JSON.stringify({ kind: "study-plan", name: "Revision plan", deadlines: [], items: [], goals: [] });
    const plan = db.add("documents", { subject_id: subject.id, folder_id: null, name: "Revision.plan.json", content, preview: "", size_bytes: content.length, source_type: "generated" });
    const topic = db.add("topic_tags", { subject_id: subject.id, tag: "study-plan" });
    db.add("document_tags", { document_id: plan.id, topic_tag_id: topic.id });
    const response = await post(teacher, { action: "send", title: "Maths midterm", date: future(30), subjectHint: "Algebra", groupIds: [group.id], shareDocumentId: plan.id });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.summary.delivered).toBe(2);
    expect(body.shared.summary.delivered).toBe(2);
    expect(db.table("share_grants").filter((row) => row.item_id === plan.id)).toHaveLength(2);
    expect(mail.sent.map((message) => message.to).sort()).toEqual([maria.email, tom.email].sort());
    expect(mail.sent[0].subject).toContain("Maths midterm");
    expect(mail.sent[0].text).toContain("set by Prof. Rivera");
    // a document that is not the sender's is refused before anything is sent
    const stranger = await post(other, { action: "send", title: "Midterm", date: future(9), recipientIds: [zed.id], shareDocumentId: plan.id });
    expect(stranger.status).toBe(404);
    expect(db.table("exam_dates")).toHaveLength(2);
  });
});

describe("what the student sees", () => {
  it("lists live dates from people they are still connected to, soonest first, with the sender's name", async () => {
    await exams.sendExamDate({ sender: teacher, input: { title: "Later", date: future(40) }, recipientIds: [maria.id] });
    await exams.sendExamDate({ sender: teacher, input: { title: "Sooner", date: future(10), notes: "Room 4" }, recipientIds: [maria.id, tom.id] });
    const listed = await exams.listForRecipient(maria);
    expect(listed.examDates.map((entry) => [entry.title, entry.senderName, entry.notes])).toEqual([["Sooner", "Prof. Rivera", "Room 4"], ["Later", "Prof. Rivera", ""]]);
    expect((await exams.listForRecipient(tom)).examDates).toHaveLength(1);
    expect((await exams.listForRecipient(zed)).examDates).toEqual([]);
    const viaRoute = await (await get(maria)).json();
    expect(viaRoute.examDates).toHaveLength(2);
  });

  it("hides a date from the card on request, and when the connection ends the dates stop", async () => {
    const sent = await exams.sendExamDate({ sender: teacher, input: { title: "Midterm", date: future(15) }, recipientIds: [maria.id, tom.id] });
    const mine = sent.rows.find((row) => row.recipient_id === maria.id);
    await exams.setDismissed(maria, mine.id, true);
    expect((await exams.listForRecipient(maria)).examDates[0].dismissedAt).toBeTruthy();
    await exams.setDismissed(maria, mine.id, false);
    expect((await exams.listForRecipient(maria)).examDates[0].dismissedAt).toBe("");
    // someone else's row is "not found"
    await expect(exams.setDismissed(maria, sent.rows.find((row) => row.recipient_id === tom.id).id, true)).rejects.toMatchObject({ status: 404 });
    const link = db.table("account_links").find((row) => row.target_id === tom.id);
    await post(teacher, { action: "send", title: "Other", date: future(4), recipientIds: [tom.id] });
    expect((await (await linksRoute.POST(new Request("http://localhost/api/accounts/links", { method: "POST", headers: { "content-type": "application/json", ...cookieFor(teacher.id) }, body: JSON.stringify({ action: "remove", linkId: link.id }) }))).json()).message).toBe("Connection removed.");
    expect((await exams.listForRecipient(tom)).examDates).toEqual([]);
  });

  it("rings the bell: a new date, a moved date and a cancelled date, each in words", async () => {
    const sent = await exams.sendExamDate({ sender: teacher, input: { title: "Midterm", date: future(20), subjectHint: "Algebra" }, recipientIds: [maria.id] });
    const first = await repo.listNotifications(maria);
    expect(first.events.map((event) => event.type)).toEqual(["exam_date"]);
    expect(describeEvent(first.events[0])).toMatch(/^Prof\. Rivera sent you an exam date: “Midterm” \(Algebra\), \d+ \w{3}$/);
    // moved a minute later
    const row = db.table("exam_dates")[0];
    row.updated_at = new Date(Date.now() + 60000).toISOString();
    row.exam_date = future(25);
    const moved = await repo.listNotifications(maria);
    expect(moved.events[0].type).toBe("exam_date_changed");
    expect(describeEvent(moved.events[0])).toContain("plans that follow it moved too");
    row.revoked_at = new Date(Date.now() + 120000).toISOString();
    const cancelled = await repo.listNotifications(maria);
    expect(cancelled.events[0].type).toBe("exam_date_cancelled");
    expect(describeEvent(cancelled.events[0])).toContain("keeps the date as your own deadline");
    expect(sent.rows).toHaveLength(1);
  });
});

describe("plans linked to an exam date", () => {
  async function sendTo(...students) {
    const sent = await exams.sendExamDate({ sender: teacher, input: { title: "Maths midterm", date: future(30), subjectHint: "Algebra" }, recipientIds: students.map((student) => student.id) });
    return { sent, row: (student) => sent.rows.find((entry) => entry.recipient_id === student.id) };
  }

  it("a plan can be tied to the date after the fact: the server writes the locked deadline and remembers the link", async () => {
    const { row } = await sendTo(maria);
    const plan = planFor(maria, [{ id: "dl-own", title: "Mine", date: future(25), kind: "milestone", setBy: { kind: "self" } }]);
    const linked = await exams.linkPlanToExam(maria, row(maria).id, plan.id);
    expect(linked).toEqual({ examDateId: row(maria).id, planDocumentId: plan.id });
    const deadlines = planBody(plan).deadlines;
    expect(deadlines).toHaveLength(2);
    const imposed = deadlines.find((deadline) => deadline.examDateId === row(maria).id);
    expect(imposed).toMatchObject({ kind: "exam", title: "Maths midterm", date: row(maria).exam_date, setBy: { kind: "sender", accountId: teacher.id, name: "Prof. Rivera" } });
    expect(isImposed(imposed)).toBe(true);
    expect(db.table("exam_date_plans")).toEqual([expect.objectContaining({ exam_date_id: row(maria).id, plan_document_id: plan.id })]);
    expect(db.table("exam_dates").find((entry) => entry.id === row(maria).id).accepted_at).toBeTruthy();
    expect((await exams.listForRecipient(maria)).examDates[0].linkedPlanIds).toEqual([plan.id]);
  });

  it("cannot be tied to somebody else's date or plan, a cancelled date, or a document that is not a plan", async () => {
    const { row } = await sendTo(maria, tom);
    const mariasPlan = planFor(maria);
    const tomsPlan = planFor(tom);
    await expect(exams.linkPlanToExam(maria, row(tom).id, mariasPlan.id)).rejects.toMatchObject({ status: 404 });
    await expect(exams.linkPlanToExam(maria, row(maria).id, tomsPlan.id)).rejects.toMatchObject({ status: 404 });
    await expect(exams.linkPlanToExam(maria, row(maria).id, "nope")).rejects.toMatchObject({ status: 404 });
    await exams.cancelBatch(teacher, row(maria).batch_id);
    await expect(exams.linkPlanToExam(maria, row(maria).id, mariasPlan.id)).rejects.toMatchObject({ status: 404 });
    expect(planBody(mariasPlan).deadlines).toEqual([]);
  });

  it("a plan saved with the deadline is registered by the workspace route's hook, and the guard backs it with the real date", async () => {
    const { row } = await sendTo(maria);
    const plan = planFor(maria);
    const claim = { id: "dl-x", title: "Maths midterm", date: row(maria).exam_date, kind: "exam", setBy: { kind: "sender", accountId: teacher.id, name: "Prof. Rivera" }, examDateId: row(maria).id };
    const content = JSON.stringify({ kind: "study-plan", name: "Maths plan", deadlines: [claim], items: [], goals: [] });
    const saved = { action: "updateGeneratedDocument", ownerUserId: maria.id, loadExamDates: exams.loadExamDatesMap, client: db.client, payload: { subjectId: db.table("documents").find((entry) => entry.id === plan.id).subject_id, documentId: plan.id, file: { name: "Maths plan.plan.json", content } } };
    expect((await guardWorkspaceAction(saved)).ok).toBe(true);
    // somebody else's date id is not accepted
    const forged = { ...saved, payload: { ...saved.payload, file: { ...saved.payload.file, content: content.replace(row(maria).id, "00000000-0000-4000-8000-0000000000ff") } } };
    expect(await guardWorkspaceAction(forged)).toMatchObject({ ok: false, status: 403 });
    expect(await exams.syncPlanLinks(maria.id, plan.id, content)).toBe(1);
    expect(db.table("exam_date_plans")).toHaveLength(1);
    // a plan that stops following the date loses the link
    expect(await exams.syncPlanLinks(maria.id, plan.id, content.replace("examDateId", "oldId"))).toBe(0);
  });

  it("moving the date moves every linked plan's deadline, with the notification, and leaves each student's own deadlines", async () => {
    const { row } = await sendTo(maria, tom);
    const mine = planFor(maria, [{ id: "dl-own", title: "Mine", date: future(25), kind: "milestone", setBy: { kind: "self" } }]);
    const toms = planFor(tom);
    const unlinked = planFor(maria);
    await exams.linkPlanToExam(maria, row(maria).id, mine.id);
    await exams.linkPlanToExam(tom, row(tom).id, toms.id);
    const batchId = row(maria).batch_id;
    const result = await exams.updateBatch(teacher, batchId, { date: future(45), title: "Maths midterm (room 4)" });
    expect(result).toMatchObject({ plansUpdated: 2, changedDate: true });
    for (const doc of [mine, toms]) {
      const imposed = planBody(doc).deadlines.find((deadline) => deadline.examDateId);
      expect(imposed).toMatchObject({ date: future(45), title: "Maths midterm (room 4)", setBy: { kind: "sender", name: "Prof. Rivera" } });
    }
    expect(planBody(mine).deadlines.find((deadline) => deadline.id === "dl-own").date).toBe(future(25));
    expect(planBody(unlinked).deadlines).toEqual([]);
    expect(db.table("exam_dates").every((entry) => entry.exam_date === future(45) && entry.title === "Maths midterm (room 4)")).toBe(true);
    // the student's list and their bell show the new date
    expect((await exams.listForRecipient(maria)).examDates[0].date).toBe(future(45));
    // only the sender can change it; a cancelled date cannot be edited; bad input is refused
    await expect(exams.updateBatch(other, batchId, { date: future(50) })).rejects.toMatchObject({ status: 404 });
    await expect(exams.updateBatch(maria, batchId, { date: future(50) })).rejects.toMatchObject({ status: 403 });
    await expect(exams.updateBatch(teacher, batchId, { title: "" })).rejects.toMatchObject({ status: 400 });
    // changing only the notes touches no plan
    expect((await exams.updateBatch(teacher, batchId, { notes: "Bring a ruler" })).plansUpdated).toBe(0);
  });

  it("cancelling hides the date and leaves each plan its deadline as the student's own, unlocked", async () => {
    const { row } = await sendTo(maria);
    const plan = planFor(maria);
    await exams.linkPlanToExam(maria, row(maria).id, plan.id);
    const cancelled = await exams.cancelBatch(teacher, row(maria).batch_id);
    expect(cancelled).toMatchObject({ cancelled: 1, plansUpdated: 1 });
    const deadlines = planBody(plan).deadlines;
    expect(deadlines).toHaveLength(1);
    expect(deadlines[0]).toMatchObject({ date: row(maria).exam_date, setBy: { kind: "self" }, cancelledFrom: "Prof. Rivera" });
    expect(deadlines[0].examDateId).toBeUndefined();
    expect((await exams.listForRecipient(maria)).examDates).toEqual([]);
    expect(db.table("exam_date_plans")).toHaveLength(0);
    expect((await exams.loadExamDatesMap(maria.id)).size).toBe(0);
    // cancelling twice is harmless; the other teacher cannot cancel it
    expect((await exams.cancelBatch(teacher, row(maria).batch_id)).cancelled).toBe(0);
    await expect(exams.cancelBatch(other, row(maria).batch_id)).rejects.toMatchObject({ status: 404 });
  });

  it("the routes mail the change and the cancellation, one email per student", async () => {
    const { row } = await sendTo(maria, tom);
    mail.sent.length = 0;
    const batchId = row(maria).batch_id;
    expect((await post(teacher, { action: "update", batchId, date: future(60) })).status).toBe(200);
    expect(mail.sent).toHaveLength(2);
    expect(mail.sent[0].subject).toContain("moved");
    mail.sent.length = 0;
    const done = await (await post(teacher, { action: "cancel", batchId })).json();
    expect(done.items[0].cancelled).toBe(true);
    expect(mail.sent).toHaveLength(2);
    expect(mail.sent[0].text).toContain("cancelled");
    expect((await post(maria, { action: "cancel", batchId })).status).toBe(403);
  });
});

describe("the teacher's list: who has planned", () => {
  it("shows each recipient, whether a plan is linked to the date, and (read-only) how far it is", async () => {
    const sent = await exams.sendExamDate({ sender: teacher, input: { title: "Maths midterm", date: future(30) }, groupIds: [group.id] });
    const maria_row = sent.rows.find((row) => row.recipient_id === maria.id);
    const plan = planFor(maria);
    await exams.linkPlanToExam(maria, maria_row.id, plan.id);
    const listed = await exams.listSent(teacher);
    expect(listed.items).toHaveLength(1);
    const item = listed.items[0];
    expect(item).toMatchObject({ title: "Maths midterm", groups: ["Group A"], cancelled: false });
    expect(item.recipients.map((entry) => [entry.displayName, entry.planned, entry.connected]).sort()).toEqual([["Maria", true, true], ["Tom", false, true]]);
    expect((await exams.listSent(other)).items).toEqual([]);

    // the completion % is read from the student's redacted tree, as the link-authorised route returns it
    const content = planBody(plan);
    const attempt = { kind: "activity-attempt", activityDocumentId: "r1", learner: "Maria", attempt: { at: new Date().toISOString(), score: 1, total: 1, results: [] } };
    const tree = { student: { id: maria.id }, workspaces: [{ id: "w", subjects: [{ id: "s", documents: [
      { id: plan.id, name: "p", tags: ["study-plan"], content: JSON.stringify({ ...content, items: [{ id: "i1", title: "Quiz", resourceId: "r1" }, { id: "i2", title: "Read", resourceId: "" }] }) },
      { id: "r1", name: "Quiz", tags: ["resource", "activity"], content: JSON.stringify({ kind: "resource", name: "Quiz", meta: {}, activity: { id: "a1", questions: [{ id: "q" }] } }) },
      { id: "att", name: "attempt", tags: ["activity-attempt"], content: JSON.stringify(attempt) }
    ] }] }] };
    expect(examPlanStatus(tree, maria_row.id)).toMatchObject({ planned: true, ratio: 0.5 });
    expect(examPlanStatus(tree, "another-date")).toMatchObject({ planned: false });
  });

  it("lists cancelled dates after the live ones and marks them", async () => {
    const first = await exams.sendExamDate({ sender: teacher, input: { title: "Old", date: future(10) }, recipientIds: [maria.id] });
    await exams.sendExamDate({ sender: teacher, input: { title: "New", date: future(50) }, recipientIds: [maria.id] });
    await exams.cancelBatch(teacher, first.batchId);
    const listed = await exams.listSent(teacher);
    expect(listed.items.map((item) => [item.title, item.cancelled])).toEqual([["New", false], ["Old", true]]);
  });
});
