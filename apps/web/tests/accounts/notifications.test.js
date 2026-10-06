import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./fakeDb.js";

const mail = vi.hoisted(() => ({ sent: [], fail: false }));

vi.mock("../../lib/supabaseClient.js", async () => {
  const { db: fake } = await import("./fakeDb.js");
  return { createSupabaseAdminClient: () => fake.client, isSupabaseConfigured: () => true, getDemoOwnerUserId: () => "demo" };
});
vi.mock("../../lib/workspacesRepository.js", async () => {
  const { db: fake } = await import("./fakeDb.js");
  return { createWorkspace: async (name, owner) => fake.add("workspaces", { name, owner_user_id: owner }), listWorkspaceTree: async () => [] };
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
const flows = await import("../../lib/accountFlows.js");
const linksRoute = await import("../../app/api/accounts/links/route.js");
const notificationsRoute = await import("../../app/api/accounts/notifications/route.js");
const { signSession, resolveSessionSecret, SESSION_COOKIE } = core;

const DAY = 24 * 3600 * 1000;
const BASE = "https://luna.test";
let counter = 0;
const cookieFor = (id) => ({ cookie: `${SESSION_COOKIE}=${encodeURIComponent(signSession(id, resolveSessionSecret()))}`, host: "luna.test", "x-forwarded-proto": "https" });
const postLinks = (account, body) => linksRoute.POST(new Request("http://localhost/api/accounts/links", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.2.0.${++counter}`, ...cookieFor(account.id) }, body: JSON.stringify(body) }));
const account = (over) => db.add("accounts", { password_hash: "x", display_name: over.email, under_13: false, failed_logins: 0, locked_until: null, email_verified_at: new Date().toISOString(), phone: null, phone_verified_at: null, password_changed_at: null, notifications_seen_at: null, pending_invites: null, ...over });
const link = () => db.table("account_links")[0];

let teacher;
let student;
let parent;
beforeEach(() => {
  db.reset();
  repo.resetSchemaCache();
  repo.resetSharingCache();
  clearAccountLimits();
  mail.sent.length = 0;
  mail.fail = false;
  teacher = account({ email: "rivera@school.edu", display_name: "Prof. Rivera", role: "teacher" });
  student = account({ email: "maria@home.com", display_name: "Maria", role: "student" });
  parent = account({ email: "elena@home.com", display_name: "Elena", role: "parent" });
});

describe("the bell (derived from links and shared items)", () => {
  it("lists requests waiting for you, with who asked, and counts them", async () => {
    await repo.requestLink(teacher, { email: student.email, relation: "student" });
    const result = await repo.listNotifications(student);
    expect(result.pendingCount).toBe(1);
    expect(result.unreadCount).toBe(1);
    expect(result.pendingRequests[0]).toMatchObject({ type: "link_request", linkId: link().id, actionable: true, person: { displayName: "Prof. Rivera", role: "teacher", email: "rivera@school.edu" } });
    // the person who asked has nothing waiting
    expect((await repo.listNotifications(teacher)).pendingCount).toBe(0);
  });

  it("tells the person who asked when the request is accepted or declined", async () => {
    await repo.requestLink(teacher, { email: student.email, relation: "student" });
    await repo.requestLink(parent, { email: student.email, relation: "student" });
    const [first, second] = db.table("account_links");
    await repo.changeLink(student, first.id, "accept");
    await repo.changeLink(student, second.id, "decline");
    expect((await repo.listNotifications(teacher)).events).toMatchObject([{ type: "link_accepted", person: { displayName: "Maria" }, unread: true }]);
    expect((await repo.listNotifications(parent)).events).toMatchObject([{ type: "link_declined" }]);
    // the one who answered is not notified of their own answer
    expect((await repo.listNotifications(student)).events).toHaveLength(0);
    expect((await repo.listNotifications(student)).pendingCount).toBe(0);
  });

  it("lists work shared or assigned to you", async () => {
    db.add("shared_items", { mode: "assign", item_type: "activity", title: "Fractions quiz", sender_id: teacher.id, recipient_id: student.id, due_date: "2026-11-01", updated_at: new Date().toISOString() });
    db.add("shared_items", { mode: "share", item_type: "document", title: "Notes", sender_id: parent.id, recipient_id: student.id, updated_at: new Date(Date.now() - 1000).toISOString() });
    db.add("shared_items", { mode: "share", item_type: "document", title: "Not mine", sender_id: parent.id, recipient_id: teacher.id, updated_at: new Date().toISOString() });
    const events = (await repo.listNotifications(student)).events;
    expect(events.map((event) => event.type)).toEqual(["assigned", "shared"]);
    expect(events[0]).toMatchObject({ title: "Fractions quiz", dueDate: "2026-11-01", person: { displayName: "Prof. Rivera" } });
  });

  it("drops anything older than 30 days", async () => {
    db.add("shared_items", { mode: "share", item_type: "document", title: "Old", sender_id: teacher.id, recipient_id: student.id, updated_at: new Date(Date.now() - 40 * DAY).toISOString() });
    expect((await repo.listNotifications(student)).events).toHaveLength(0);
  });

  it("'seen' clears the unread events but a waiting request keeps counting until answered", async () => {
    db.add("shared_items", { mode: "share", item_type: "document", title: "Notes", sender_id: teacher.id, recipient_id: student.id, updated_at: new Date().toISOString() });
    await repo.requestLink(parent, { email: student.email, relation: "student" });
    expect((await repo.listNotifications(student)).unreadCount).toBe(2);
    await repo.markNotificationsSeen(student.id, new Date(Date.now() + 1000));
    const after = await repo.listNotifications(await repo.findAccountById(student.id));
    expect(after.unreadCount).toBe(1);
    expect(after.events[0].unread).toBe(false);
    await repo.changeLink(student, link().id, "decline");
    expect((await repo.listNotifications(await repo.findAccountById(student.id))).unreadCount).toBe(0);
  });

  it("works through the route, 401 without a session, and POST seen", async () => {
    await repo.requestLink(teacher, { email: student.email, relation: "student" });
    expect((await notificationsRoute.GET(new Request("http://localhost/api/accounts/notifications"))).status).toBe(401);
    const response = await notificationsRoute.GET(new Request("http://localhost/api/accounts/notifications", { headers: cookieFor(student.id) }));
    expect(await response.json()).toMatchObject({ pendingCount: 1, unreadCount: 1, seenSupported: true, emailVerified: true });
    const seen = await notificationsRoute.POST(new Request("http://localhost/api/accounts/notifications", { method: "POST", headers: { "content-type": "application/json", ...cookieFor(student.id) }, body: JSON.stringify({ action: "seen" }) }));
    expect(await seen.json()).toEqual({ ok: true, supported: true });
    expect(db.table("accounts").find((row) => row.id === student.id).notifications_seen_at).toBeTruthy();
  });

  it("on the old schema still shows requests, with no 'seen' memory", async () => {
    db.legacySchema();
    const legacyStudent = db.add("accounts", { email: "kid@home.com", password_hash: "x", display_name: "Kid", role: "student", under_13: false });
    const legacyTeacher = db.add("accounts", { email: "t@school.edu", password_hash: "x", display_name: "T", role: "teacher", under_13: false });
    await repo.requestLink(legacyTeacher, { email: legacyStudent.email, relation: "student" });
    const result = await repo.listNotifications(legacyStudent);
    expect(result).toMatchObject({ pendingCount: 1, unreadCount: 1, seenSupported: false });
    expect(await repo.markNotificationsSeen(legacyStudent.id)).toBe(false);
  });
});

describe("the words in the bell", () => {
  it("describes each kind of event and gives short relative times", async () => {
    const { describeEvent, timeAgo } = await import("../../modules/accounts/bellText.js");
    const person = { displayName: "Prof. Rivera", email: "r@s.edu" };
    expect(describeEvent({ type: "link_request", person })).toBe("Prof. Rivera wants to connect with you");
    expect(describeEvent({ type: "link_accepted", person })).toBe("Prof. Rivera accepted your connection request");
    expect(describeEvent({ type: "link_declined", person: { email: "r@s.edu" } })).toBe("r@s.edu declined your connection request");
    expect(describeEvent({ type: "assigned", person, title: "Quiz", dueDate: "2026-11-01" })).toBe("Prof. Rivera assigned you “Quiz” (due 2026-11-01)");
    expect(describeEvent({ type: "shared", person, title: "Notes" })).toBe("Prof. Rivera shared “Notes” with you");
    const now = Date.now();
    expect(timeAgo(new Date(now - 20000), now)).toBe("just now");
    expect(timeAgo(new Date(now - 5 * 60000), now)).toBe("5 min ago");
    expect(timeAgo(new Date(now - 3 * 3600000), now)).toBe("3 h ago");
    expect(timeAgo(new Date(now - 2 * DAY), now)).toBe("2 d ago");
    expect(timeAgo("garbage", now)).toBe("");
  });
});

describe("the email when a request arrives", () => {
  it("is sent through the route with only the sender's name, role and email, and a link to Connections", async () => {
    const response = await postLinks(teacher, { action: "request", email: "Maria@Home.com", relation: "student" });
    expect(response.status).toBe(200);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]).toMatchObject({ to: "maria@home.com", subject: "Prof. Rivera wants to connect with you on Luna" });
    expect(mail.sent[0].links).toEqual([`${BASE}/platform?page=connections`]);
    expect(mail.sent[0].text).toContain("Prof. Rivera (teacher, rivera@school.edu)");
    expect(link().notified_at).toBeTruthy();
  });

  it("never emails the same pair twice within 24 hours, then may again", async () => {
    await postLinks(teacher, { action: "request", email: student.email, relation: "student" });
    await postLinks(teacher, { action: "request", email: student.email, relation: "student" }); // already pending
    await repo.changeLink(teacher, link().id, "cancel");
    await postLinks(teacher, { action: "request", email: student.email, relation: "student" }); // asked again at once
    expect(mail.sent).toHaveLength(1);
    link().notified_at = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
    await repo.changeLink(teacher, link().id, "cancel");
    await postLinks(teacher, { action: "request", email: student.email, relation: "student" });
    expect(mail.sent).toHaveLength(2);
  });

  it("invites someone with no account yet, once per week per pair, with honest minimal content", async () => {
    await postLinks(teacher, { action: "request", email: "newkid@home.com", relation: "student" });
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].subject).toBe("Prof. Rivera invited you to connect on Luna");
    expect(mail.sent[0].links).toEqual([`${BASE}/login?mode=signup`]);
    expect(mail.sent[0].text).toMatch(/no tracking/i);

    link().notified_at = new Date(Date.now() - 3 * DAY).toISOString(); // 3 days later: a day would be enough for a member, a week is not for a stranger
    await repo.changeLink(teacher, link().id, "cancel");
    await postLinks(teacher, { action: "request", email: "newkid@home.com", relation: "student" });
    expect(mail.sent).toHaveLength(1);

    link().notified_at = new Date(Date.now() - 8 * DAY).toISOString();
    await repo.changeLink(teacher, link().id, "cancel");
    await postLinks(teacher, { action: "request", email: "newkid@home.com", relation: "student" });
    expect(mail.sent).toHaveLength(2);
  });

  it("treats an unconfirmed account like a stranger: invitation email, nothing attached", async () => {
    account({ email: "unconfirmed@home.com", role: "student", email_verified_at: null });
    await postLinks(teacher, { action: "request", email: "unconfirmed@home.com", relation: "student" });
    expect(mail.sent[0].subject).toContain("invited you");
    expect(link().target_id).toBeNull();
  });

  it("treats an address whose account has another role like any other connection (it can be a peer), and the answer is the same", async () => {
    const other = await postLinks(teacher, { action: "request", email: parent.email, relation: "student" });
    const unknown = await postLinks(teacher, { action: "request", email: "ghost@nowhere.com", relation: "student" });
    expect((await other.json()).message).toBe((await unknown.json()).message);
    expect(mail.sent.map((message) => message.to).sort()).toEqual(["elena@home.com", "ghost@nowhere.com"]);
    expect(db.table("account_links").find((row) => row.target_email === parent.email).kind).toBe("peer");
  });

  it("never fails the request when the mail fails", async () => {
    mail.fail = true;
    const response = await postLinks(teacher, { action: "request", email: student.email, relation: "student" });
    expect(response.status).toBe(200);
    expect(link().status).toBe("pending");
    expect(link().notified_at ?? null).toBeNull();
  });

  it("caps the emails one sender can cause in a day", async () => {
    for (let index = 0; index < 30; index += 1) db.add("account_links", { kind: "teacher_student", requester_id: teacher.id, requester_email: teacher.email, target_id: null, target_email: `s${index}@x.com`, status: "pending", pair_key: `k${index}`, notified_at: new Date().toISOString() });
    await postLinks(teacher, { action: "request", email: student.email, relation: "student" });
    expect(mail.sent).toHaveLength(0);
  });

  it("is slowed down per sender in memory as well (20 an hour)", async () => {
    for (let index = 0; index < 22; index += 1) await postLinks(teacher, { action: "request", email: `kid${index}@home.com`, relation: "student" });
    expect(mail.sent).toHaveLength(20);
  });

  it("sends nothing on the old schema (no stored timestamps to dedupe with)", async () => {
    db.legacySchema();
    const legacyTeacher = db.add("accounts", { email: "t@school.edu", password_hash: "x", display_name: "T", role: "teacher", under_13: false });
    const response = await postLinks(legacyTeacher, { action: "request", email: "kid@home.com", relation: "student" });
    expect(response.status).toBe(200);
    expect(mail.sent).toHaveLength(0);
  });
});

describe("the email when a request is accepted", () => {
  it("goes to the person who asked, once per 24 hours", async () => {
    await repo.requestLink(teacher, { email: student.email, relation: "student" });
    const response = await postLinks(student, { action: "accept", linkId: link().id });
    expect(response.status).toBe(200);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]).toMatchObject({ to: "rivera@school.edu", subject: "Maria accepted your connection on Luna" });
    expect(mail.sent[0].text).toContain("Maria (student, maria@home.com)");
    await flows.notifyLinkAccepted(student, link().id, BASE);
    expect(mail.sent).toHaveLength(1);
  });

  it("is also sent when asking someone who already asked you (the second yes)", async () => {
    await repo.requestLink(teacher, { email: student.email, relation: "student" });
    await postLinks(student, { action: "request", email: teacher.email, relation: "teacher" });
    expect(link().status).toBe("accepted");
    expect(mail.sent.map((message) => message.to)).toEqual(["rivera@school.edu"]);
  });

  it("is not sent for a decline", async () => {
    await repo.requestLink(teacher, { email: student.email, relation: "student" });
    await postLinks(student, { action: "decline", linkId: link().id });
    expect(mail.sent).toHaveLength(0);
  });
});
