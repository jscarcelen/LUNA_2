import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./fakeDb.js";

const mail = vi.hoisted(() => ({ sent: [], fail: false }));
const templates = vi.hoisted(() => ({ rows: [] }));

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
    listDocumentBlockTemplates: async (owner) => templates.rows.filter((row) => row.ownerUserId === owner),
    saveDocumentBlockTemplate: async (owner, payload) => {
      const existing = templates.rows.find((row) => row.ownerUserId === owner && row.name === payload.name);
      const row = { ...payload, id: existing?.id || `tpl-${templates.rows.length + 1}`, ownerUserId: owner };
      templates.rows = [...templates.rows.filter((entry) => entry !== existing), row];
      return row;
    },
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
    if (mail.fail) throw new Error("provider down");
    mail.sent.push(message);
    return { delivered: true, provider: "test" };
  })
}));

const core = await import("../../lib/accountsCore.js");
const { clearAccountLimits } = await import("../../lib/accountLimits.js");
const repo = await import("../../lib/accountsRepository.js");
const grants = await import("../../lib/grantsRepository.js");
const copies = await import("../../lib/copyShareRepository.js");
const grantsRoute = await import("../../app/api/accounts/grants/route.js");
const copyRoute = await import("../../app/api/accounts/share-copy/route.js");
const linksRoute = await import("../../app/api/accounts/links/route.js");
const { signSession, resolveSessionSecret, SESSION_COOKIE } = core;

let counter = 0;
const cookieFor = (id) => ({ cookie: `${SESSION_COOKIE}=${encodeURIComponent(signSession(id, resolveSessionSecret()))}`, host: "luna.test", "x-forwarded-proto": "https" });
const post = (route, path, who, body, extraHeaders = {}) => route.POST(new Request(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.5.0.${++counter}`, ...cookieFor(who.id), ...extraHeaders }, body: JSON.stringify(body) }));
const get = (route, path, who) => route.GET(new Request(`http://localhost${path}`, { headers: cookieFor(who.id) }));
const postGrants = (who, body, headers) => post(grantsRoute, "/api/accounts/grants", who, body, headers);
const postCopy = (who, body, headers) => post(copyRoute, "/api/accounts/share-copy", who, body, headers);

const account = (over) => db.add("accounts", { password_hash: "x", display_name: over.email, under_13: false, failed_logins: 0, locked_until: null, email_verified_at: new Date().toISOString(), phone: null, phone_verified_at: null, password_changed_at: null, notifications_seen_at: null, pending_invites: null, ...over });
const connect = (a, b, kind = "peer", over = {}) => db.add("account_links", { kind, requester_id: a.id, requester_email: a.email, target_id: b.id, target_email: b.email, status: "accepted", pair_key: `${kind}:${[a.email, b.email].sort().join("|")}`, ...over });
const live = () => db.table("share_grants").filter((row) => !row.revoked_at);

let teacher;
let maria;
let tom;
let elena;
let zed;
let ws;
let maths;
let unit;
let chapter;
let lesson;
let exam;

function addFolder(subject, name, parent = null) {
  return db.add("folders", { subject_id: subject.id, name, parent_folder_id: parent?.id || null });
}
function addDocument(subject, name, tags = [], content = "text", folders = []) {
  const doc = db.add("documents", { subject_id: subject.id, folder_id: folders[0]?.id || null, name, content, preview: name, size_bytes: content.length, source_type: tags.length ? "generated" : "uploaded" });
  for (const tag of tags) {
    let topic = db.table("topic_tags").find((row) => row.subject_id === subject.id && row.tag === tag);
    if (!topic) topic = db.add("topic_tags", { subject_id: subject.id, tag });
    db.add("document_tags", { document_id: doc.id, topic_tag_id: topic.id });
  }
  for (const folder of folders) db.add("document_folders", { document_id: doc.id, folder_id: folder.id });
  return doc;
}

beforeEach(() => {
  db.reset();
  templates.rows = [];
  repo.resetSchemaCache();
  repo.resetSharingCache();
  clearAccountLimits();
  mail.sent.length = 0;
  mail.fail = false;
  teacher = account({ email: "rivera@school.edu", display_name: "Prof. Rivera", role: "teacher" });
  maria = account({ email: "maria@home.com", display_name: "Maria", role: "student" });
  tom = account({ email: "tom@home.com", display_name: "Tom", role: "student" });
  elena = account({ email: "elena@home.com", display_name: "Elena", role: "parent" });
  zed = account({ email: "zed@home.com", display_name: "Zed", role: "student" });
  connect(teacher, maria, "teacher_student");
  connect(teacher, elena, "peer");
  connect(maria, tom, "peer");
  ws = db.add("workspaces", { owner_user_id: teacher.id, name: "My workspace" });
  maths = db.add("subjects", { workspace_id: ws.id, name: "Maths" });
  unit = addFolder(maths, "Unit 1");
  chapter = addFolder(maths, "Chapter", unit);
  lesson = addDocument(maths, "Lesson 1.docx", [], "lesson text", [chapter]);
  exam = addDocument(maths, "Exam.docx", [], "exam text");
});

describe("sharing a document, folder or topic as a live share", () => {
  it("a teacher shares a folder with a connection as 'can edit': one grant, owner stays the owner", async () => {
    const done = await grants.shareItem({ owner: teacher, kind: "folder", itemId: unit.id, recipientIds: [maria.id], permission: "edit" });
    expect(done.results).toEqual([expect.objectContaining({ recipientId: maria.id, ok: true, created: true })]);
    expect(live()).toHaveLength(1);
    expect(live()[0]).toMatchObject({ owner_id: teacher.id, grantee_id: maria.id, item_kind: "folder", item_id: unit.id, permission: "edit", item_name: "Unit 1" });
    // nothing was copied
    expect(db.table("documents")).toHaveLength(2);
  });

  it("any connection can receive it: a student shares with a student (peer), a teacher with a parent", async () => {
    const hers = db.add("workspaces", { owner_user_id: maria.id, name: "My workspace" });
    const hersSubject = db.add("subjects", { workspace_id: hers.id, name: "Biology" });
    const notes = addDocument(hersSubject, "Cells.docx");
    expect((await grants.shareItem({ owner: maria, kind: "document", itemId: notes.id, recipientIds: [tom.id], permission: "view" })).results[0].ok).toBe(true);
    expect((await grants.shareItem({ owner: teacher, kind: "subject", itemId: maths.id, recipientIds: [elena.id], permission: "view" })).results[0].ok).toBe(true);
    expect(live().map((row) => `${row.item_kind}:${row.permission}`).sort()).toEqual(["document:view", "subject:view"]);
  });

  it("refuses anyone who is not an accepted connection, server-side, and writes nothing", async () => {
    const done = await grants.shareItem({ owner: teacher, kind: "folder", itemId: unit.id, recipientIds: [zed.id, tom.id, "ghost"], permission: "view" });
    expect(done.results.every((result) => !result.ok)).toBe(true);
    expect(done.results[0]).toMatchObject({ status: 403 });
    expect(done.results[2]).toMatchObject({ status: 404 });
    expect(live()).toHaveLength(0);
    // a pending, a declined and an ended request are not connections either
    for (const status of ["pending", "declined", "revoked"]) {
      db.table("account_links").length = 0;
      connect(teacher, zed, "peer", { status });
      expect((await grants.shareItem({ owner: teacher, kind: "folder", itemId: unit.id, recipientIds: [zed.id], permission: "view" })).results[0].ok).toBe(false);
    }
    expect(live()).toHaveLength(0);
  });

  it("only the owner can share: not a grantee, not a stranger, whatever the permission", async () => {
    await grants.shareItem({ owner: teacher, kind: "folder", itemId: unit.id, recipientIds: [maria.id], permission: "edit" });
    await expect(grants.shareItem({ owner: maria, kind: "folder", itemId: unit.id, recipientIds: [tom.id], permission: "view" })).rejects.toMatchObject({ status: 404 });
    await expect(grants.shareItem({ owner: maria, kind: "document", itemId: lesson.id, recipientIds: [tom.id], permission: "view" })).rejects.toMatchObject({ status: 404 });
    await expect(grants.shareItem({ owner: zed, kind: "document", itemId: lesson.id, recipientIds: [teacher.id], permission: "view" })).rejects.toMatchObject({ status: 404 });
    expect(live()).toHaveLength(1);
  });

  it("sharing again changes the permission of the same grant instead of piling up rows", async () => {
    await grants.shareItem({ owner: teacher, kind: "document", itemId: lesson.id, recipientIds: [maria.id], permission: "view" });
    const second = await grants.shareItem({ owner: teacher, kind: "document", itemId: lesson.id, recipientIds: [maria.id], permission: "edit" });
    expect(second.results[0]).toMatchObject({ ok: true, created: false, changed: true });
    expect(live()).toHaveLength(1);
    expect(live()[0].permission).toBe("edit");
    const same = await grants.shareItem({ owner: teacher, kind: "document", itemId: lesson.id, recipientIds: [maria.id], permission: "edit" });
    expect(same.results[0]).toMatchObject({ created: false, changed: false });
  });

  it("validates the request: kind, permission, at least one person, a confirmed email", async () => {
    await expect(grants.shareItem({ owner: teacher, kind: "workspace", itemId: ws.id, recipientIds: [maria.id], permission: "view" })).rejects.toMatchObject({ code: "bad_request" });
    await expect(grants.shareItem({ owner: teacher, kind: "folder", itemId: unit.id, recipientIds: [maria.id], permission: "owner" })).rejects.toMatchObject({ code: "bad_permission" });
    await expect(grants.shareItem({ owner: teacher, kind: "folder", itemId: unit.id, recipientIds: [], permission: "view" })).rejects.toMatchObject({ code: "bad_request" });
    const unconfirmed = { ...teacher, email_verified_at: null };
    await expect(grants.shareItem({ owner: unconfirmed, kind: "folder", itemId: unit.id, recipientIds: [maria.id], permission: "view" })).rejects.toMatchObject({ code: "email_unverified", status: 403 });
    expect(live()).toHaveLength(0);
  });

  it("does not share Luna's private bookkeeping, received copies, or what was shared with you", async () => {
    const notes = addDocument(maths, "Lesson 1 · notes.json", ["doc-notes"]);
    const agent = addDocument(maths, "Tutor.agent.json", ["ai-agent"]);
    const copy = addDocument(maths, "From someone", ["shared-by:somebody"]);
    for (const doc of [notes, agent, copy]) await expect(grants.shareItem({ owner: teacher, kind: "document", itemId: doc.id, recipientIds: [maria.id], permission: "view" })).rejects.toMatchObject({ status: 400 });
    const mine = db.add("workspaces", { owner_user_id: maria.id, name: "My workspace" });
    const sharedWithMe = db.add("subjects", { workspace_id: mine.id, name: "Shared with me" });
    const ownerFolder = addFolder(sharedWithMe, "Prof. Rivera");
    await expect(grants.shareItem({ owner: maria, kind: "folder", itemId: ownerFolder.id, recipientIds: [tom.id], permission: "view" })).rejects.toMatchObject({ code: "not_shareable" });
    await expect(grants.shareItem({ owner: maria, kind: "subject", itemId: sharedWithMe.id, recipientIds: [tom.id], permission: "view" })).rejects.toMatchObject({ code: "not_shareable" });
    expect(live()).toHaveLength(0);
  });

  it("a study plan travels with the documents it uses and its own folder (same permission), but not the structural folders", async () => {
    const plans = addFolder(maths, "Study plans");
    const planFolder = addFolder(maths, "Exam plan", plans);
    const quiz = addDocument(maths, "Quiz", ["resource", "activity"], "{}", [planFolder]);
    const plan = addDocument(maths, "Exam plan", ["study-plan"], JSON.stringify({ kind: "study-plan", name: "Exam plan", items: [{ id: "i1", resourceId: quiz.id }, { id: "i2", resourceId: "not-mine" }], goals: [{ id: "g", resourceIds: [lesson.id] }], materialIds: [exam.id] }), [planFolder]);
    const loose = addDocument(maths, "Plan in the root", ["study-plan"], JSON.stringify({ kind: "study-plan", name: "x", items: [] }), [plans]);
    const done = await grants.shareItem({ owner: teacher, kind: "document", itemId: plan.id, recipientIds: [maria.id], permission: "view" });
    expect(done.results[0]).toMatchObject({ ok: true, extra: 4 });
    expect(live().map((row) => `${row.item_kind}:${row.item_id}`).sort()).toEqual([`document:${plan.id}`, `document:${quiz.id}`, `document:${lesson.id}`, `document:${exam.id}`, `folder:${planFolder.id}`].sort());
    // a plan filed directly under the structural "Study plans" folder shares only itself
    await grants.shareItem({ owner: teacher, kind: "document", itemId: loose.id, recipientIds: [elena.id], permission: "view" });
    expect(live().filter((row) => row.grantee_id === elena.id).map((row) => row.item_kind)).toEqual(["document"]);
  });

  it("answers a clear setupNeeded 503 naming the migration while it is not applied, and reads degrade quietly", async () => {
    db.drop("share_grants");
    repo.resetSharingCache();
    await expect(grants.shareItem({ owner: teacher, kind: "folder", itemId: unit.id, recipientIds: [maria.id], permission: "view" })).rejects.toMatchObject({ status: 503, code: "setup_needed" });
    const response = await postGrants(teacher, { action: "share", kind: "folder", itemId: unit.id, recipientIds: [maria.id], permission: "view" });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ setupNeeded: true, migration: expect.stringContaining("202610060001_network_sharing_grants.sql") });
    expect(await grants.listGrantOverview(teacher)).toEqual({ given: [], received: [], supported: false });
    expect(await grants.listGrantsOnItem(teacher, { kind: "folder", id: unit.id })).toEqual([]);
    expect(await grants.loadGrantContext(maria.id)).toEqual({ grants: [], connections: new Set() });
    expect(await grants.revokeGrantsBetween(teacher.id, maria.id)).toBe(0);
    await grants.purgeGrantsFor("folder", [unit.id]);
  });
});

describe("managing who has access", () => {
  let shared;
  beforeEach(async () => {
    shared = (await grants.shareItem({ owner: teacher, kind: "folder", itemId: unit.id, recipientIds: [maria.id, elena.id], permission: "view" })).results;
  });

  it("the owner sees who has access and how; nobody else does", async () => {
    const list = await grants.listGrantsOnItem(teacher, { kind: "folder", id: unit.id });
    expect(list.map((row) => [row.grantee.displayName, row.permission]).sort()).toEqual([["Elena", "view"], ["Maria", "view"]]);
    expect(list[0].grantee).not.toHaveProperty("password_hash");
    await expect(grants.listGrantsOnItem(maria, { kind: "folder", id: unit.id })).rejects.toMatchObject({ status: 404 });
    await expect(grants.listGrantsOnItem(zed, { kind: "folder", id: unit.id })).rejects.toMatchObject({ status: 404 });
  });

  it("the owner changes a permission, takes access away, and the grantee can leave", async () => {
    const [forMaria, forElena] = shared;
    await grants.changeGrantPermission(teacher, forMaria.grantId, "edit");
    expect(live().find((row) => row.id === forMaria.grantId).permission).toBe("edit");
    await expect(grants.changeGrantPermission(teacher, forMaria.grantId, "owner")).rejects.toMatchObject({ code: "bad_permission" });
    await grants.revokeGrant(teacher, forMaria.grantId);
    expect(live().map((row) => row.grantee_id)).toEqual([elena.id]);
    await grants.leaveGrant(elena, forElena.grantId);
    expect(live()).toHaveLength(0);
    // history is kept, and a new share starts a new grant
    expect(db.table("share_grants")).toHaveLength(2);
    await grants.shareItem({ owner: teacher, kind: "folder", itemId: unit.id, recipientIds: [maria.id], permission: "view" });
    expect(live()).toHaveLength(1);
  });

  it("nobody else can change, revoke or leave someone else's share", async () => {
    const [forMaria] = shared;
    await expect(grants.changeGrantPermission(maria, forMaria.grantId, "edit")).rejects.toMatchObject({ status: 404 });
    await expect(grants.revokeGrant(maria, forMaria.grantId)).rejects.toMatchObject({ status: 404 });
    await expect(grants.leaveGrant(elena, forMaria.grantId)).rejects.toMatchObject({ status: 404 });
    await expect(grants.leaveGrant(teacher, forMaria.grantId)).rejects.toMatchObject({ status: 404 });
    expect(live()).toHaveLength(2);
    expect(live().every((row) => row.permission === "view")).toBe(true);
  });

  it("shows both sides the overview, and only for connections that still exist", async () => {
    const mine = await grants.listGrantOverview(teacher);
    expect(mine.given).toHaveLength(2);
    expect(mine.given[0]).toMatchObject({ itemKind: "folder", itemName: "Unit 1", permission: "view" });
    const hers = await grants.listGrantOverview(maria);
    expect(hers.received).toMatchObject([{ itemKind: "folder", itemName: "Unit 1", owner: { displayName: "Prof. Rivera", role: "teacher" } }]);
    db.table("account_links").find((row) => row.target_id === maria.id && row.requester_id === teacher.id).status = "revoked";
    expect((await grants.listGrantOverview(maria)).received).toEqual([]);
    expect(await grants.activeGrantsFor(maria.id)).toEqual([]);
  });

  it("ending the connection ends the access in both directions at once", async () => {
    const link = db.table("account_links").find((row) => row.requester_id === teacher.id && row.target_id === maria.id);
    const hers = db.add("workspaces", { owner_user_id: maria.id, name: "My workspace" });
    const bio = db.add("subjects", { workspace_id: hers.id, name: "Biology" });
    const cells = addDocument(bio, "Cells.docx");
    await grants.shareItem({ owner: maria, kind: "document", itemId: cells.id, recipientIds: [teacher.id], permission: "edit" });
    expect(live()).toHaveLength(3);
    const response = await post(linksRoute, "/api/accounts/links", maria, { action: "remove", linkId: link.id });
    expect(response.status).toBe(200);
    expect(live().map((row) => row.grantee_id)).toEqual([elena.id]);
  });

  it("deleting the original removes the grants on it", async () => {
    await grants.purgeGrantsFor("folder", [unit.id]);
    expect(live()).toHaveLength(0);
  });
});

describe("the share route", () => {
  it("shares for the logged-in account only, answers per person, and emails the person once an hour", async () => {
    const response = await postGrants(teacher, { action: "share", kind: "folder", itemId: unit.id, recipientIds: [maria.id], permission: "edit" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ itemName: "Unit 1", permission: "edit", results: [{ recipientId: maria.id, ok: true }] });
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]).toMatchObject({ to: "maria@home.com" });
    expect(mail.sent[0].subject).toContain("“Unit 1”");
    expect(mail.sent[0].text).toMatch(/you can edit it/);
    expect(mail.sent[0].text).toMatch(/changed in the original/);
    expect(mail.sent[0].text).not.toMatch(/password|lesson text/i);
    // another share to the same person within the hour sends no second email
    await postGrants(teacher, { action: "share", kind: "document", itemId: exam.id, recipientIds: [maria.id], permission: "view" });
    expect(mail.sent).toHaveLength(1);
    // a different person gets their own
    await postGrants(teacher, { action: "share", kind: "document", itemId: exam.id, recipientIds: [elena.id], permission: "view" });
    expect(mail.sent.map((message) => message.to)).toEqual(["maria@home.com", "elena@home.com"]);
    expect(mail.sent[1].text).toMatch(/view only/);
  });

  it("escapes names in the email and never puts the content in it", async () => {
    teacher.display_name = "<script>alert(1)</script> Rivera";
    await postGrants(teacher, { action: "share", kind: "document", itemId: lesson.id, recipientIds: [maria.id], permission: "view" });
    expect(mail.sent[0].html).not.toContain("<script>");
    expect(mail.sent[0].html).toContain("&lt;script&gt;");
    expect(mail.sent[0].html).not.toContain("lesson text");
    expect(mail.sent[0].subject).toContain("Lesson 1.docx");
  });

  it("an hour later it may email again", async () => {
    await postGrants(teacher, { action: "share", kind: "folder", itemId: unit.id, recipientIds: [maria.id], permission: "view" });
    for (const row of db.table("share_grants")) row.notified_at = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    await postGrants(teacher, { action: "share", kind: "document", itemId: exam.id, recipientIds: [maria.id], permission: "view" });
    expect(mail.sent).toHaveLength(2);
  });

  it("never fails because the email failed", async () => {
    mail.fail = true;
    const response = await postGrants(teacher, { action: "share", kind: "folder", itemId: unit.id, recipientIds: [maria.id], permission: "view" });
    expect(response.status).toBe(200);
    expect(live()).toHaveLength(1);
  });

  it("answers 403 and shares nothing for someone who is not a connection", async () => {
    const response = await postGrants(teacher, { action: "share", kind: "folder", itemId: unit.id, recipientIds: [zed.id], permission: "view" });
    expect(response.status).toBe(403);
    expect(live()).toHaveLength(0);
    expect(mail.sent).toHaveLength(0);
  });

  it("reports the people that failed next to the ones that worked", async () => {
    const response = await postGrants(teacher, { action: "share", kind: "folder", itemId: unit.id, recipientIds: [maria.id, zed.id], permission: "view" });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.results.map((result) => [result.recipientId === maria.id ? "maria" : "zed", result.ok])).toEqual([["maria", true], ["zed", false]]);
    expect(mail.sent.map((message) => message.to)).toEqual(["maria@home.com"]);
  });

  it("needs a login, a same-site request and a known action", async () => {
    const anonymous = await grantsRoute.POST(new Request("http://localhost/api/accounts/grants", { method: "POST", headers: { "content-type": "application/json", host: "luna.test" }, body: "{}" }));
    expect(anonymous.status).toBe(401);
    const crossSite = await postGrants(teacher, { action: "share", kind: "folder", itemId: unit.id, recipientIds: [maria.id], permission: "view" }, { origin: "https://evil.test" });
    expect(crossSite.status).toBe(403);
    expect(live()).toHaveLength(0);
    expect((await postGrants(teacher, { action: "teleport" })).status).toBe(400);
  });

  it("an id in the body is never trusted for ownership: a grantee cannot change or revoke an owner's grant", async () => {
    const body = await (await postGrants(teacher, { action: "share", kind: "folder", itemId: unit.id, recipientIds: [maria.id], permission: "view" })).json();
    const grantId = body.results[0].grantId;
    expect((await postGrants(maria, { action: "permission", grantId, permission: "edit" })).status).toBe(404);
    expect((await postGrants(maria, { action: "revoke", grantId })).status).toBe(404);
    expect(live()[0].permission).toBe("view");
    expect((await postGrants(maria, { action: "leave", grantId })).status).toBe(200);
    expect(live()).toHaveLength(0);
  });

  it("lists who has access to an item (owner only) and the overview", async () => {
    await postGrants(teacher, { action: "share", kind: "folder", itemId: unit.id, recipientIds: [maria.id], permission: "view" });
    const list = await (await get(grantsRoute, `/api/accounts/grants?kind=folder&id=${unit.id}`, teacher)).json();
    expect(list.grants).toMatchObject([{ permission: "view", grantee: { displayName: "Maria" } }]);
    expect((await get(grantsRoute, `/api/accounts/grants?kind=folder&id=${unit.id}`, maria)).status).toBe(404);
    const overview = await (await get(grantsRoute, "/api/accounts/grants", maria)).json();
    expect(overview).toMatchObject({ supported: true, given: [], received: [{ itemName: "Unit 1" }] });
  });
});

describe("notifications for shares", () => {
  it("the bell says who shared what and with which permission, and counts as unread", async () => {
    await grants.shareItem({ owner: teacher, kind: "folder", itemId: unit.id, recipientIds: [maria.id], permission: "edit" });
    const result = await repo.listNotifications(maria);
    expect(result.events).toMatchObject([{ type: "grant", title: "Unit 1", permission: "edit", itemKind: "folder", person: { displayName: "Prof. Rivera" }, unread: true }]);
    expect(result.unreadCount).toBe(1);
    const { describeEvent } = await import("../../modules/accounts/bellText.js");
    expect(describeEvent(result.events[0])).toBe("Prof. Rivera shared “Unit 1” with you (can edit)");
    expect(describeEvent({ ...result.events[0], permission: "view" })).toBe("Prof. Rivera shared “Unit 1” with you (can view)");
  });
  it("a revoked share is no longer announced, and the sharer is not notified of their own share", async () => {
    const done = await grants.shareItem({ owner: teacher, kind: "folder", itemId: unit.id, recipientIds: [maria.id], permission: "view" });
    expect((await repo.listNotifications(teacher)).events).toHaveLength(0);
    await grants.revokeGrant(teacher, done.results[0].grantId);
    expect((await repo.listNotifications(maria)).events).toHaveLength(0);
  });
  it("works without the sharing migration", async () => {
    db.drop("share_grants");
    repo.resetSharingCache();
    expect((await repo.listNotifications(maria)).events).toEqual([]);
  });
});

describe("agents, templates and components are shared as copies", () => {
  const agentJson = (extra = {}) => JSON.stringify({ name: "Quiz maker", description: "Makes quizzes", questions: [{ id: "q1", text: "How many?" }], template: { fields: [{ name: "q" }] }, savedOutput: { secret: "last run on the teacher's material" }, ...extra });

  it("copies an agent into the recipient's own workspace, labelled and without the saved output", async () => {
    const agent = addDocument(maths, "Quiz maker.agent.json", ["ai-agent"], agentJson());
    const mariaWs = db.add("workspaces", { owner_user_id: maria.id, name: "My workspace" });
    const biology = db.add("subjects", { workspace_id: mariaWs.id, name: "Biology" });
    const done = await copies.shareCopy({ sender: teacher, kind: "agent", id: agent.id, recipientIds: [maria.id] });
    expect(done.results).toEqual([{ recipientId: maria.id, ok: true }]);
    const copy = db.table("documents").find((row) => row.subject_id === biology.id);
    expect(copy.name).toBe("Quiz maker.agent.json");
    const content = JSON.parse(copy.content);
    expect(content).toMatchObject({ name: "Quiz maker", sharedFrom: { accountId: teacher.id, name: "Prof. Rivera" } });
    expect(content).not.toHaveProperty("savedOutput");
    expect(content).not.toHaveProperty("installedFrom");
    const tags = db.table("document_tags").filter((row) => row.document_id === copy.id).map((row) => db.table("topic_tags").find((tag) => tag.id === row.topic_tag_id).tag).sort();
    expect(tags).toEqual(["ai-agent", `shared-from:${teacher.id}`]);
    expect(tags.some((tag) => tag.startsWith("shared-by:"))).toBe(false); // not read-only: it is their own copy
    expect(db.table("shared_items")).toMatchObject([{ item_type: "agent", mode: "share", sender_id: teacher.id, recipient_id: maria.id, title: "Quiz maker", copy_document_id: copy.id }]);
    // the sender's agent is untouched and sharing again refreshes the same copy
    expect(JSON.parse(db.table("documents").find((row) => row.id === agent.id).content)).toHaveProperty("savedOutput");
    await copies.shareCopy({ sender: teacher, kind: "agent", id: agent.id, recipientIds: [maria.id] });
    expect(db.table("documents").filter((row) => row.subject_id === biology.id)).toHaveLength(1);
  });

  it("puts the copy in a plain topic for someone who has none yet, never in the Shared documents or Shared with me topics", async () => {
    const agent = addDocument(maths, "Quiz maker.agent.json", ["ai-agent"], agentJson());
    const tomWs = db.add("workspaces", { owner_user_id: tom.id, name: "My workspace" });
    db.add("subjects", { workspace_id: tomWs.id, name: "Shared documents" });
    db.add("subjects", { workspace_id: tomWs.id, name: "Shared with me" });
    connect(teacher, tom, "peer");
    await copies.shareCopy({ sender: teacher, kind: "agent", id: agent.id, recipientIds: [tom.id] });
    const topic = db.table("subjects").find((row) => row.workspace_id === tomWs.id && row.name === "General");
    expect(topic).toBeTruthy();
    expect(db.table("documents").filter((row) => row.subject_id === topic.id)).toHaveLength(1);
  });

  it("refuses agents that are not the sender's own: other people's, marketplace purchases, and non-agents", async () => {
    const bought = addDocument(maths, "Bought.agent.json", ["ai-agent"], agentJson({ installedFrom: { listingId: "l1" } }));
    await expect(copies.shareCopy({ sender: teacher, kind: "agent", id: bought.id, recipientIds: [maria.id] })).rejects.toMatchObject({ code: "not_shareable" });
    await expect(copies.shareCopy({ sender: teacher, kind: "agent", id: lesson.id, recipientIds: [maria.id] })).rejects.toMatchObject({ status: 404 });
    const hers = db.add("workspaces", { owner_user_id: maria.id, name: "My workspace" });
    const herAgent = addDocument(db.add("subjects", { workspace_id: hers.id, name: "Bio" }), "Hers.agent.json", ["ai-agent"], agentJson());
    await expect(copies.shareCopy({ sender: teacher, kind: "agent", id: herAgent.id, recipientIds: [maria.id] })).rejects.toMatchObject({ status: 404 });
    expect(db.table("shared_items")).toHaveLength(0);
  });

  it("copies a template through the template library of the recipient", async () => {
    templates.rows = [{ id: "t1", ownerUserId: teacher.id, name: "Exam A4", description: "Clean exam", templateV3: { v: 3 }, dataFields: [{ name: "q" }], createdAt: "x", updatedAt: "y", sourceDocumentId: "doc" }];
    const done = await copies.shareCopy({ sender: teacher, kind: "template", id: "t1", recipientIds: [maria.id] });
    expect(done.results[0].ok).toBe(true);
    const copy = templates.rows.find((row) => row.ownerUserId === maria.id);
    expect(copy).toMatchObject({ name: "Exam A4 (shared by Prof. Rivera)", templateV3: { v: 3 }, dataFields: [{ name: "q" }], sourceDocumentId: "" });
    expect(copy.description).toMatch(/^Shared by Prof. Rivera\./);
    expect(templates.rows.find((row) => row.id === "t1").name).toBe("Exam A4");
    expect(db.table("shared_items")).toMatchObject([{ item_type: "template", recipient_id: maria.id }]);
    await expect(copies.shareCopy({ sender: maria, kind: "template", id: "t1", recipientIds: [tom.id] })).rejects.toMatchObject({ status: 404 });
  });

  it("delivers a component as a shared item the recipient's app imports once", async () => {
    const block = { id: "block-custom-1", name: "Red card", description: "d", category: "custom", icon: "x", fields: [{ id: "f", name: "q", type: "string" }], elements: [{ id: "e", type: "text" }] };
    const done = await copies.shareCopy({ sender: teacher, kind: "component", component: block, recipientIds: [maria.id, tom.id] });
    expect(done.results.map((result) => result.ok)).toEqual([true, false]); // tom is not the teacher's connection
    const pending = await copies.listPendingComponents(maria.id);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ title: "Red card", sender: { displayName: "Prof. Rivera" }, block: { name: "Red card", builtIn: false, author: "Prof. Rivera", sharedFrom: { accountId: teacher.id } } });
    expect(pending[0].block.id).toBe(`shared-${teacher.id.slice(0, 8)}-block-custom-1`);
    expect(await copies.listPendingComponents(tom.id)).toEqual([]);
    expect(await copies.markComponentsImported(tom.id, [pending[0].id])).toBe(0); // somebody else's item cannot be marked
    expect(await copies.markComponentsImported(maria.id, [pending[0].id])).toBe(1);
    expect(await copies.listPendingComponents(maria.id)).toEqual([]);
  });

  it("validates components and cleans what it forwards", () => {
    const good = { id: "b1", name: "Card", fields: [], elements: [], builtIn: false, extra: 1 };
    expect(copies.componentCopyFor(good, teacher)).toMatchObject({ name: "Card", builtIn: false, extra: 1 });
    expect(() => copies.componentCopyFor(null, teacher)).toThrow(/Choose a component/);
    expect(() => copies.componentCopyFor({ ...good, builtIn: true }, teacher)).toThrow(/Built-in/);
    expect(() => copies.componentCopyFor({ id: "b1", name: "x" }, teacher)).toThrow(/not a valid component/);
    expect(() => copies.componentCopyFor({ ...good, elements: ["x".repeat(copies.MAX_COMPONENT_BYTES)] }, teacher)).toThrow(/too large/);
    expect(() => copies.componentCopyFor([], teacher)).toThrow(core.LinkError);
  });

  it("routes: emails once, rejects strangers, needs the migration, and imports through the inbox", async () => {
    const block = { id: "b1", name: "Card", fields: [], elements: [] };
    const bad = await postCopy(teacher, { kind: "component", component: block, recipientIds: [zed.id] });
    expect(bad.status).toBe(403);
    expect(mail.sent).toHaveLength(0);
    const ok = await postCopy(teacher, { kind: "component", component: block, recipientIds: [maria.id] });
    expect(ok.status).toBe(200);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].subject).toContain("“Card”");
    expect(mail.sent[0].text).toMatch(/own copy/);
    const inbox = await (await get(copyRoute, "/api/accounts/share-copy", maria)).json();
    expect(inbox.components).toHaveLength(1);
    const marked = await (await postCopy(maria, { kind: "imported", ids: [inbox.components[0].id] })).json();
    expect(marked).toEqual({ imported: 1 });
    expect((await (await get(copyRoute, "/api/accounts/share-copy", maria)).json()).components).toEqual([]);
    const notes = await repo.listNotifications(maria);
    expect(notes.events[0]).toMatchObject({ type: "shared", itemType: "component", title: "Card" });
    db.drop("share_grants");
    repo.resetSharingCache();
    const noSetup = await postCopy(teacher, { kind: "component", component: block, recipientIds: [maria.id] });
    expect(noSetup.status).toBe(503);
    expect(await noSetup.json()).toMatchObject({ setupNeeded: true });
    expect((await (await get(copyRoute, "/api/accounts/share-copy", maria)).json()).components).toEqual([]);
  });
});
