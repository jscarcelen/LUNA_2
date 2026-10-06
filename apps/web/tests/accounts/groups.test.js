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
    updateDocumentMeta: async (subjectId, documentId, { folderIds = [], tags = [] }) => {
      const doc = fake.table("documents").find((row) => row.id === documentId);
      doc.folder_id = folderIds[0] || null;
      for (const row of fake.table("document_tags").filter((entry) => entry.document_id === documentId)) fake.table("document_tags").splice(fake.table("document_tags").indexOf(row), 1);
      for (const tag of tags) {
        let topic = fake.table("topic_tags").find((row) => row.subject_id === subjectId && row.tag === tag);
        if (!topic) topic = fake.add("topic_tags", { subject_id: subjectId, tag });
        fake.add("document_tags", { document_id: documentId, topic_tag_id: topic.id });
      }
    }
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
const grants = await import("../../lib/grantsRepository.js");
const batch = await import("../../lib/batchSend.js");
const shareRoute = await import("../../app/api/accounts/share/route.js");
const grantsRoute = await import("../../app/api/accounts/grants/route.js");
const groupsRoute = await import("../../app/api/accounts/groups/route.js");
const membersRoute = await import("../../app/api/accounts/linked/members/route.js");
const linksRoute = await import("../../app/api/accounts/links/route.js");
const rules = await import("../../modules/accounts/groups.js");

const { signSession, resolveSessionSecret, SESSION_COOKIE } = core;

/* ------------------------------------------------------------------ the pure rules */

describe("group rules (pure)", () => {
  const groups = new Map([["gA", { name: "Group A", memberIds: ["m1", "m2", "m3"] }], ["gB", { name: "Group B", memberIds: ["m3", "m4"] }]]);

  it("resolves groups and individuals into one list, each person once, and says why", () => {
    const { recipients, groupsUsed } = rules.resolveRecipients({ groupIds: ["gA", "gB"], individualIds: ["m1", "x9"], groups });
    expect(recipients.map((entry) => entry.id)).toEqual(["m1", "m2", "m3", "m4", "x9"]);
    expect(recipients.find((entry) => entry.id === "m3").via).toEqual(["Group A", "Group B"]);
    expect(recipients.find((entry) => entry.id === "m1")).toMatchObject({ via: ["Group A"], individual: true });
    expect(groupsUsed).toEqual([{ id: "gA", name: "Group A", count: 3 }, { id: "gB", name: "Group B", count: 2 }]);
  });

  it("ignores a group that is not the owner's and reports it", () => {
    const { recipients, unknownGroups } = rules.resolveRecipients({ groupIds: ["someone-elses"], individualIds: [], groups });
    expect(recipients).toEqual([]);
    expect(unknownGroups).toEqual(["someone-elses"]);
  });

  it("describes a selection as 'Group A (3) + 2 individuals' and counts overlaps once", () => {
    const stats = rules.selectionStats({ groupIds: ["gA"], individualIds: ["m1", "m9", "m8"], groups });
    expect(stats.line).toBe("Group A (3) + 2 individuals");
    expect(stats.people).toBe(5);
    expect(rules.selectionStats({ groupIds: ["gA", "gB"], individualIds: [], groups }).people).toBe(4);
    expect(rules.describeSelection({ groupsUsed: [], individuals: 1 })).toBe("1 individual");
  });

  it("keeps a member only while their link exists (stored membership is not enough)", () => {
    const rows = [{ groupId: "gA", memberId: "m1" }, { groupId: "gA", memberId: "m2" }, { groupId: "gB", memberId: "m2" }];
    const active = rules.activeMembership(rows, new Set(["m2"]));
    expect([...active.entries()]).toEqual([["gA", ["m2"]], ["gB", ["m2"]]]);
    expect(rules.groupsOfMember(rows, new Set(["m2"]), "m1")).toEqual([]);
    expect(rules.groupsOfMember(rows, new Set(["m2"]), "m2")).toEqual(["gA", "gB"]);
  });

  it("summarises a batch per person: delivered, skipped (not connected / already has it / failed), deferred", () => {
    const summary = rules.summarizeResults([
      { ok: true }, { ok: true }, { ok: true, alreadyHadIt: true },
      { ok: false, status: 403 }, { ok: false, status: 404 }, { ok: false, status: 500 }, { ok: false, reason: "failed" },
      { deferred: true }
    ]);
    expect(summary).toEqual({ delivered: 2, skipped: { not_connected: 2, already_has_it: 1, failed: 2 }, deferred: 1, total: 8 });
    expect(rules.summaryLine(summary)).toBe("Delivered to 2 people · skipped: 2 not connected, 1 already had it, 2 failed · 1 not processed yet, send again to finish");
  });

  it("limits colours to the palette and cleans names", () => {
    expect(rules.normalizeColour("#D7003A")).toBe("#d7003a");
    expect(rules.normalizeColour("url(javascript:1)")).toBe(rules.DEFAULT_GROUP_COLOUR);
    expect(rules.normalizeGroupName("  Class   3B  ")).toBe("Class 3B");
    expect(rules.canOwnGroups("student")).toBe(false);
    expect(rules.canOwnGroups("teacher") && rules.canOwnGroups("parent")).toBe(true);
  });

  it("runs a pool in order and defers what the time budget does not reach", async () => {
    const seen = [];
    let clock = 0;
    const results = await rules.runPool([1, 2, 3, 4, 5], async (value) => { seen.push(value); clock += 10; return { ok: true, value }; }, { concurrency: 1, deadline: 25, now: () => clock });
    expect(results.map((entry) => (entry.deferred ? "deferred" : entry.value))).toEqual([1, 2, 3, "deferred", "deferred"]);
    expect(seen).toEqual([1, 2, 3]);
    const failed = await rules.runPool([1], async () => { throw new Error("boom"); });
    expect(failed[0]).toMatchObject({ ok: false, reason: "failed" });
  });
});

/* ------------------------------------------------------------------ the world */

let counter = 0;
const cookieFor = (id) => ({ cookie: `${SESSION_COOKIE}=${encodeURIComponent(signSession(id, resolveSessionSecret()))}`, host: "luna.test", "x-forwarded-proto": "https" });
const post = (route, path, who, body) => route.POST(new Request(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.6.0.${++counter}`, ...cookieFor(who.id) }, body: JSON.stringify(body) }));
const get = (route, path, who) => route.GET(new Request(`http://localhost${path}`, { headers: cookieFor(who.id) }));

const account = (over) => db.add("accounts", { password_hash: "x", display_name: over.email, under_13: false, failed_logins: 0, locked_until: null, email_verified_at: new Date().toISOString(), phone: null, phone_verified_at: null, password_changed_at: null, notifications_seen_at: null, pending_invites: null, ...over });
const connect = (a, b, kind = "teacher_student", over = {}) => db.add("account_links", { kind, requester_id: a.id, requester_email: a.email, target_id: b.id, target_email: b.email, status: "accepted", pair_key: `${kind}:${[a.email, b.email].sort().join("|")}`, ...over });

let teacher;
let other;
let parent;
let maria;
let tom;
let ana;
let zed;
let maths;
let lesson;
let quiz;

function addDocument(subject, name, tags = [], content = "text") {
  const doc = db.add("documents", { subject_id: subject.id, folder_id: null, name, content, preview: name, size_bytes: content.length, source_type: tags.length ? "generated" : "uploaded" });
  for (const tag of tags) {
    let topic = db.table("topic_tags").find((row) => row.subject_id === subject.id && row.tag === tag);
    if (!topic) topic = db.add("topic_tags", { subject_id: subject.id, tag });
    db.add("document_tags", { document_id: doc.id, topic_tag_id: topic.id });
  }
  return doc;
}

beforeEach(() => {
  db.reset();
  repo.resetSchemaCache();
  repo.resetSharingCache();
  groupsRepo.resetGroupsCache();
  clearAccountLimits();
  mail.sent.length = 0;
  teacher = account({ email: "rivera@school.edu", display_name: "Prof. Rivera", role: "teacher" });
  other = account({ email: "other@school.edu", display_name: "Prof. Other", role: "teacher" });
  parent = account({ email: "elena@home.com", display_name: "Elena", role: "parent" });
  maria = account({ email: "maria@home.com", display_name: "Maria", role: "student" });
  tom = account({ email: "tom@home.com", display_name: "Tom", role: "student" });
  ana = account({ email: "ana@home.com", display_name: "Ana", role: "student" });
  zed = account({ email: "zed@home.com", display_name: "Zed", role: "student" });
  connect(teacher, maria);
  connect(teacher, tom);
  connect(teacher, ana);
  connect(other, zed);
  connect(parent, ana, "parent_student");
  const ws = db.add("workspaces", { owner_user_id: teacher.id, name: "My workspace" });
  maths = db.add("subjects", { workspace_id: ws.id, name: "Maths" });
  lesson = addDocument(maths, "Lesson 1.docx");
  quiz = addDocument(maths, "Integration quiz", ["resource", "activity"], JSON.stringify({ kind: "resource", name: "Integration quiz", activity: { questions: [{ id: "q1" }] } }));
});

/* ------------------------------------------------------------------ membership rules */

describe("groups: who can be in one", () => {
  it("a student can be in several groups, and the page reads them back", async () => {
    const a = await groupsRepo.createGroup(teacher, { name: "Group A", colour: "#2f9e5b", memberIds: [maria.id, tom.id] });
    const b = await groupsRepo.createGroup(teacher, { name: "Group B", memberIds: [tom.id, ana.id] });
    const listed = await groupsRepo.listGroups(teacher);
    expect(listed.groups.map((group) => [group.name, group.memberIds.sort()])).toEqual([["Group A", [maria.id, tom.id].sort()], ["Group B", [tom.id, ana.id].sort()]]);
    expect(await groupsRepo.groupIdsOfStudent(teacher, tom.id)).toEqual([a.id, b.id]);
    expect(listed.students.map((student) => student.id).sort()).toEqual([maria.id, tom.id, ana.id].sort());
  });

  it("the per-student 'Groups…' choice puts the student in exactly the chosen groups", async () => {
    const a = await groupsRepo.createGroup(teacher, { name: "Group A", memberIds: [maria.id] });
    const b = await groupsRepo.createGroup(teacher, { name: "Group B", memberIds: [] });
    await groupsRepo.setMemberGroups(teacher, maria.id, [b.id]);
    expect(await groupsRepo.groupIdsOfStudent(teacher, maria.id)).toEqual([b.id]);
    await groupsRepo.setMemberGroups(teacher, maria.id, [a.id, b.id]);
    expect((await groupsRepo.groupIdsOfStudent(teacher, maria.id)).sort()).toEqual([a.id, b.id].sort());
    await expect(groupsRepo.setMemberGroups(teacher, maria.id, ["not-mine"])).rejects.toMatchObject({ status: 404 });
  });

  it("refuses accounts the owner is not connected to as teacher/parent: strangers, peers, another teacher's student", async () => {
    await expect(groupsRepo.createGroup(teacher, { name: "X", memberIds: [zed.id] })).rejects.toMatchObject({ status: 403 });
    connect(teacher, zed, "peer", { pair_key: "peer:zed-teacher" });
    await expect(groupsRepo.createGroup(teacher, { name: "X", memberIds: [zed.id] })).rejects.toMatchObject({ status: 403 });
    const group = await groupsRepo.createGroup(teacher, { name: "Y", memberIds: [maria.id] });
    await expect(groupsRepo.addMembers(teacher, group.id, [zed.id])).rejects.toMatchObject({ status: 403 });
    // ana is the parent's child and the teacher's student: each only through their own kind of link
    await expect(groupsRepo.createGroup(parent, { name: "Kids", memberIds: [maria.id] })).rejects.toMatchObject({ status: 403 });
    expect((await groupsRepo.createGroup(parent, { name: "Kids", memberIds: [ana.id] })).memberCount).toBe(1);
    expect(db.table("account_group_members").some((row) => row.member_id === zed.id)).toBe(false);
  });

  it("only a teacher or a parent can have groups", async () => {
    await expect(groupsRepo.createGroup(maria, { name: "Mine", memberIds: [] })).rejects.toMatchObject({ status: 403 });
    await expect(groupsRepo.listGroups(maria)).rejects.toMatchObject({ status: 403 });
  });

  it("never shows or lets anyone touch another teacher's group (same 404 as for nothing)", async () => {
    const mine = await groupsRepo.createGroup(teacher, { name: "Private", memberIds: [maria.id] });
    expect((await groupsRepo.listGroups(other)).groups).toEqual([]);
    await expect(groupsRepo.updateGroup(other, mine.id, { name: "Hijacked" })).rejects.toMatchObject({ status: 404 });
    await expect(groupsRepo.deleteGroup(other, mine.id)).rejects.toMatchObject({ status: 404 });
    await expect(groupsRepo.addMembers(other, mine.id, [zed.id])).rejects.toMatchObject({ status: 404 });
    await expect(groupsRepo.removeMembers(other, mine.id, [maria.id])).rejects.toMatchObject({ status: 404 });
    await expect(groupsRepo.groupMemberEvidence(other, { groupId: mine.id }, async () => ({}))).rejects.toMatchObject({ status: 404 });
    const resolved = await groupsRepo.resolveBatchRecipients(other, { groupIds: [mine.id], individualIds: [] });
    expect(resolved.recipients).toEqual([]);
    expect(resolved.unknownGroups).toEqual([mine.id]);
    expect(db.table("account_groups")[0].name).toBe("Private");
  });

  it("when the connection ends the student drops out of every group view and send, even before the rows are cleaned up", async () => {
    const group = await groupsRepo.createGroup(teacher, { name: "Group A", memberIds: [maria.id, tom.id] });
    db.table("account_links").find((row) => row.requester_id === teacher.id && row.target_id === tom.id).status = "revoked";
    // stored membership is still there...
    expect(db.table("account_group_members")).toHaveLength(2);
    // ...but every read goes through the live links
    expect((await groupsRepo.listGroups(teacher)).groups[0].memberIds).toEqual([maria.id]);
    expect((await groupsRepo.resolveBatchRecipients(teacher, { groupIds: [group.id] })).recipients.map((entry) => entry.id)).toEqual([maria.id]);
    const seen = [];
    const evidence = await groupsRepo.groupMemberEvidence(teacher, { groupId: group.id }, async (_owner, id) => { seen.push(id); return { student: { id }, workspaces: [] }; });
    expect(seen).toEqual([maria.id]);
    expect(evidence.total).toBe(1);
    // an explicit list of ids cannot bring him back either
    const byIds = await groupsRepo.groupMemberEvidence(teacher, { studentIds: [tom.id, maria.id] }, async (_owner, id) => ({ student: { id }, workspaces: [] }));
    expect(byIds.members.map((entry) => entry.student.id)).toEqual([maria.id]);
    expect(byIds.skipped).toBe(1);
  });

  it("removing a connection through the links route also tidies the memberships, so a later re-connection does not bring the student back silently", async () => {
    await groupsRepo.createGroup(teacher, { name: "Group A", memberIds: [maria.id, tom.id] });
    const link = db.table("account_links").find((row) => row.requester_id === teacher.id && row.target_id === tom.id);
    const response = await post(linksRoute, "/api/accounts/links", teacher, { action: "remove", linkId: link.id });
    expect(response.status).toBe(200);
    expect(db.table("account_group_members").map((row) => row.member_id)).toEqual([maria.id]);
  });

  it("deleting a group never deletes or disconnects a student", async () => {
    const group = await groupsRepo.createGroup(teacher, { name: "Group A", memberIds: [maria.id, tom.id] });
    await groupsRepo.deleteGroup(teacher, group.id);
    expect(db.table("account_groups")).toHaveLength(0);
    expect(db.table("account_group_members")).toHaveLength(0);
    expect(db.table("accounts").filter((row) => row.role === "student")).toHaveLength(4);
    expect(db.table("account_links").filter((row) => row.status === "accepted")).toHaveLength(5);
    expect((await groupsRepo.listGroups(teacher)).students).toHaveLength(3);
  });

  it("caps a group at 200 students, names are unique per owner, and colours stay in the palette", async () => {
    const many = [];
    for (let index = 0; index < 201; index += 1) {
      const student = account({ email: `s${index}@home.com`, display_name: `S${index}`, role: "student" });
      connect(teacher, student, "teacher_student", { pair_key: `ts:${index}` });
      many.push(student.id);
    }
    await expect(groupsRepo.createGroup(teacher, { name: "Too big", memberIds: many })).rejects.toMatchObject({ status: 400 });
    const group = await groupsRepo.createGroup(teacher, { name: "Full", memberIds: many.slice(0, 200) });
    expect(group.memberCount).toBe(200);
    await expect(groupsRepo.addMembers(teacher, group.id, [many[200]])).rejects.toMatchObject({ status: 400 });
    await expect(groupsRepo.createGroup(teacher, { name: "full" })).rejects.toMatchObject({ status: 409 });
    expect((await groupsRepo.createGroup(teacher, { name: "Odd", colour: "red; background:url(x)" })).colour).toBe(rules.DEFAULT_GROUP_COLOUR);
  });

  it("answers 503 setupNeeded naming the migration until it is applied", async () => {
    db.drop("account_groups", "account_group_members");
    const response = await get(groupsRoute, "/api/accounts/groups", teacher);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ setupNeeded: true, migration: core.GROUPS_MIGRATION });
    expect(core.GROUPS_MIGRATION).toContain("202610070001_groups_exam_dates.sql");
  });

  it("the routes work end to end for the owner and reject a student", async () => {
    const created = await (await post(groupsRoute, "/api/accounts/groups", teacher, { action: "create", name: "Class 3B", memberIds: [maria.id] })).json();
    expect(created.group.name).toBe("Class 3B");
    expect(created.groups).toHaveLength(1);
    expect((await post(groupsRoute, "/api/accounts/groups", maria, { action: "create", name: "Nope" })).status).toBe(403);
    const renamed = await (await post(groupsRoute, "/api/accounts/groups", teacher, { action: "update", groupId: created.group.id, name: "Class 3C" })).json();
    expect(renamed.groups[0].name).toBe("Class 3C");
  });
});

describe("the members' evidence, one page at a time", () => {
  it("returns members page by page, authorised per member, in name order", async () => {
    const group = await groupsRepo.createGroup(teacher, { name: "Group A", memberIds: [maria.id, tom.id, ana.id] });
    const load = async (_owner, id) => ({ student: { id }, workspaces: [] });
    const first = await groupsRepo.groupMemberEvidence(teacher, { groupId: group.id, offset: 0, limit: 2 }, load);
    expect(first).toMatchObject({ total: 3, hasMore: true, nextOffset: 2 });
    expect(first.members.map((entry) => entry.student.id)).toEqual([ana.id, maria.id]);
    const second = await groupsRepo.groupMemberEvidence(teacher, { groupId: group.id, offset: first.nextOffset, limit: 2 }, load);
    expect(second.hasMore).toBe(false);
    expect(second.members.map((entry) => entry.student.id)).toEqual([tom.id]);
  });

  it("the route answers 404 for somebody else's group", async () => {
    const group = await groupsRepo.createGroup(teacher, { name: "Group A", memberIds: [maria.id] });
    expect((await get(membersRoute, `/api/accounts/linked/members?groupId=${group.id}`, other)).status).toBe(404);
    expect((await get(membersRoute, `/api/accounts/linked/members?groupId=${group.id}`, teacher)).status).toBe(200);
  });
});

/* ------------------------------------------------------------------ sending to a group */

describe("sharing with groups", () => {
  it("one result per person, each person once even when groups overlap, and a second send says 'already has it'", async () => {
    const a = await groupsRepo.createGroup(teacher, { name: "Group A", memberIds: [maria.id, tom.id] });
    const b = await groupsRepo.createGroup(teacher, { name: "Group B", memberIds: [tom.id, ana.id] });
    const first = await grants.shareItem({ owner: teacher, kind: "document", itemId: lesson.id, groupIds: [a.id, b.id], recipientIds: [maria.id], permission: "view" });
    expect(first.results.map((entry) => entry.recipientId).sort()).toEqual([maria.id, tom.id, ana.id].sort());
    expect(first.summary).toMatchObject({ delivered: 3, skipped: { not_connected: 0, already_has_it: 0, failed: 0 } });
    expect(first.results.find((entry) => entry.recipientId === tom.id).via).toEqual(["Group A", "Group B"]);
    expect(db.table("share_grants").filter((row) => !row.revoked_at)).toHaveLength(3);
    const again = await grants.shareItem({ owner: teacher, kind: "document", itemId: lesson.id, groupIds: [a.id, b.id], permission: "view" });
    expect(again.summary).toMatchObject({ delivered: 0, skipped: { already_has_it: 3 } });
    expect(db.table("share_grants").filter((row) => !row.revoked_at)).toHaveLength(3);
    const upgraded = await grants.shareItem({ owner: teacher, kind: "document", itemId: lesson.id, groupIds: [a.id], permission: "edit" });
    expect(upgraded.summary.delivered).toBe(2);
  });

  it("skips people who are not connected (a former member, a stranger typed in) with the right reason, and still delivers to the rest", async () => {
    const group = await groupsRepo.createGroup(teacher, { name: "Group A", memberIds: [maria.id, tom.id] });
    db.table("account_links").find((row) => row.requester_id === teacher.id && row.target_id === tom.id).status = "revoked";
    const done = await grants.shareItem({ owner: teacher, kind: "document", itemId: lesson.id, groupIds: [group.id], recipientIds: [zed.id], permission: "view" });
    expect(done.results.map((entry) => [entry.recipientId, entry.ok])).toEqual([[maria.id, true], [zed.id, false]]);
    expect(done.summary).toMatchObject({ delivered: 1, skipped: { not_connected: 1, already_has_it: 0, failed: 0 } });
    expect(db.table("share_grants").some((row) => row.grantee_id === tom.id)).toBe(false);
    expect(db.table("share_grants").some((row) => row.grantee_id === zed.id)).toBe(false);
  });

  it("the route takes groupIds, returns the summary, and sends one email per person after the response", async () => {
    const group = await groupsRepo.createGroup(teacher, { name: "Group A", memberIds: [maria.id, tom.id] });
    const response = await post(grantsRoute, "/api/accounts/grants", teacher, { action: "share", kind: "document", itemId: lesson.id, groupIds: [group.id], recipientIds: [], permission: "view" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.summary.delivered).toBe(2);
    expect(body.groupsUsed).toEqual([{ id: group.id, name: "Group A", count: 2 }]);
    expect(mail.sent.map((message) => message.to).sort()).toEqual([maria.email, tom.email].sort());
    expect(mail.sent.every((message) => message.subject.includes("Prof. Rivera"))).toBe(true);
  });

  it("someone else's group id delivers to nobody and answers 404", async () => {
    const group = await groupsRepo.createGroup(teacher, { name: "Group A", memberIds: [maria.id] });
    const response = await post(grantsRoute, "/api/accounts/grants", other, { action: "share", kind: "document", itemId: lesson.id, groupIds: [group.id], permission: "view" });
    // `other` does not own the document either; either way nothing is written
    expect([403, 404]).toContain(response.status);
    expect(db.table("share_grants")).toHaveLength(0);
  });
});

describe("assigning to a group", () => {
  it("assigns with a due date set by the sender to every member, one result and one email each", async () => {
    const group = await groupsRepo.createGroup(teacher, { name: "Group A", memberIds: [maria.id, tom.id] });
    const response = await post(shareRoute, "/api/accounts/share", teacher, { mode: "assign", documentId: quiz.id, groupIds: [group.id], recipientIds: [maria.id, ana.id], dueDate: "2026-12-01", note: "Before the exam" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.summary).toMatchObject({ delivered: 3, skipped: { not_connected: 0, already_has_it: 0, failed: 0 } });
    expect(body.results.map((entry) => entry.recipientId).sort()).toEqual([maria.id, tom.id, ana.id].sort());
    // every copy carries the imposed date: due: + due-by:<teacher>
    const copies = db.table("shared_items").map((row) => row.copy_document_id);
    expect(copies).toHaveLength(3);
    for (const id of copies) {
      const tags = db.table("document_tags").filter((row) => row.document_id === id).map((row) => db.table("topic_tags").find((tag) => tag.id === row.topic_tag_id).tag);
      expect(tags).toContain("due:2026-12-01");
      expect(tags).toContain(`due-by:${teacher.id}`);
    }
    // one email each, saying who set the date
    expect(mail.sent).toHaveLength(3);
    expect(mail.sent[0].text).toContain("due 1 Dec, set by Prof. Rivera");
    // sending the same thing again changes nothing: "already has it" for everybody who is up to date
    const again = await (await post(shareRoute, "/api/accounts/share", teacher, { mode: "assign", documentId: quiz.id, groupIds: [group.id], dueDate: "2026-12-01" })).json();
    expect(again.summary.delivered + again.summary.skipped.already_has_it).toBe(2);
    expect(db.table("shared_items")).toHaveLength(3);
  });

  it("refuses the whole request for a document that is not the sender's, before anything is written", async () => {
    const group = await groupsRepo.createGroup(teacher, { name: "Group A", memberIds: [maria.id] });
    const response = await post(shareRoute, "/api/accounts/share", other, { mode: "assign", documentId: quiz.id, groupIds: [group.id], recipientIds: [zed.id], dueDate: "2026-12-01" });
    expect(response.status).toBe(404);
    expect(db.table("shared_items")).toHaveLength(0);
  });

  it("a parent can assign to their group of children, and nobody can assign to peers", async () => {
    const pws = db.add("workspaces", { owner_user_id: parent.id, name: "My workspace" });
    const psub = db.add("subjects", { workspace_id: pws.id, name: "Home" });
    const task = addDocument(psub, "Reading quiz", ["resource", "activity"], JSON.stringify({ kind: "resource", name: "Reading", activity: { questions: [{ id: "q" }] } }));
    const kids = await groupsRepo.createGroup(parent, { name: "Kids", memberIds: [ana.id] });
    const ok = await (await post(shareRoute, "/api/accounts/share", parent, { mode: "assign", documentId: task.id, groupIds: [kids.id], dueDate: "2026-12-02" })).json();
    expect(ok.summary.delivered).toBe(1);
    const peerResponse = await post(shareRoute, "/api/accounts/share", parent, { mode: "assign", documentId: task.id, recipientIds: [teacher.id] });
    expect(peerResponse.status).toBeGreaterThanOrEqual(400);
  });
});

describe("rate limits and the time budget for big sends", () => {
  it("a sender can reach a bounded number of people an hour: a batch over the remainder is refused up front, nothing written", async () => {
    const group = await groupsRepo.createGroup(teacher, { name: "Group A", memberIds: [maria.id, tom.id] });
    for (let index = 0; index < 599; index += 1) limits.batchDeliveriesBySender.fail(teacher.id);
    const response = await post(shareRoute, "/api/accounts/share", teacher, { mode: "assign", documentId: quiz.id, groupIds: [group.id], dueDate: "2026-12-01" });
    expect(response.status).toBe(429);
    expect((await response.json()).code).toBe("rate_limited");
    expect(db.table("shared_items")).toHaveLength(0);
    expect(() => batch.reserveDeliveries(teacher.id, 1)).not.toThrow();
  });

  it("more than 200 people in one request is refused", () => {
    expect(() => batch.reserveDeliveries(teacher.id, 201)).toThrow(/at most 200/);
  });

  it("people the time budget does not reach come back as deferred, never as failed", async () => {
    const group = await groupsRepo.createGroup(teacher, { name: "Group A", memberIds: [maria.id, tom.id, ana.id] });
    const prepared = await batch.prepareBatch(teacher, { groupIds: [group.id] });
    let calls = 0;
    const { results, summary } = await batch.runBatch(teacher, prepared, async () => { calls += 1; return { ok: true }; }, { budgetMs: -1 });
    expect(calls).toBe(0);
    expect(results.every((entry) => entry.deferred)).toBe(true);
    expect(summary).toMatchObject({ delivered: 0, deferred: 3 });
    // deferred people were not counted against the hourly limit
    expect(limits.batchDeliveriesBySender.count(teacher.id)).toBe(0);
  });

  it("mail never blocks or changes the answer: a failing mailer still delivers", async () => {
    const mailer = await import("../../lib/mailer.js");
    mailer.sendMail.mockImplementationOnce(async () => { throw new Error("provider down"); });
    const group = await groupsRepo.createGroup(teacher, { name: "Group A", memberIds: [maria.id, tom.id] });
    const response = await post(shareRoute, "/api/accounts/share", teacher, { mode: "assign", documentId: quiz.id, groupIds: [group.id], dueDate: "2026-12-01" });
    expect(response.status).toBe(200);
    expect((await response.json()).summary.delivered).toBe(2);
  });
});
