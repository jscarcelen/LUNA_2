import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./fakeDb.js";

const mail = vi.hoisted(() => ({ sent: [], result: { delivered: true, provider: "test" } }));

vi.mock("../../lib/supabaseClient.js", async () => {
  const { db: fake } = await import("./fakeDb.js");
  return { createSupabaseAdminClient: () => fake.client, isSupabaseConfigured: () => true, getDemoOwnerUserId: () => "demo" };
});
vi.mock("../../lib/workspacesRepository.js", async () => {
  const { db: fake } = await import("./fakeDb.js");
  return {
    createWorkspace: async (name, owner) => fake.add("workspaces", { name, owner_user_id: owner }),
    listWorkspaceTree: async () => [],
    createSubject: async () => ({ id: "s" }),
    createFolder: async () => ({ id: "f" }),
    updateDocumentMeta: async () => ({})
  };
});
vi.mock("../../lib/mailer.js", async (importOriginal) => ({
  ...(await importOriginal()),
  sendMail: vi.fn(async (message) => {
    mail.sent.push(message);
    return mail.result;
  })
}));

const repo = await import("../../lib/accountsRepository.js");
const tokens = await import("../../lib/accountTokens.js");
const flows = await import("../../lib/accountFlows.js");
const sharing = await import("../../lib/sharingRepository.js");
const core = await import("../../lib/accountsCore.js");
const { clearAccountLimits } = await import("../../lib/accountLimits.js");
const signup = await import("../../app/api/accounts/signup/route.js");
const verifyRoute = await import("../../app/api/accounts/verify-email/route.js");
const resendRoute = await import("../../app/api/accounts/resend-verification/route.js");
const linksRoute = await import("../../app/api/accounts/links/route.js");
const { signSession, resolveSessionSecret, SESSION_COOKIE } = core;

let counter = 0;
const call = (handler, path, body, headers = {}) =>
  handler(new Request(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${++counter}`, ...headers }, body: JSON.stringify(body) }));
const cookieOf = (id) => ({ cookie: `${SESSION_COOKIE}=${encodeURIComponent(signSession(id, resolveSessionSecret()))}` });
const tokenFrom = (message) => new URL(message.links[0]).searchParams.get("token");
const form = (over = {}) => ({ displayName: "Maria", email: "maria@home.com", password: "correct horse", passwordConfirm: "correct horse", phone: "+1 415 555 2671", role: "student", ...over });
const unverified = (over) => db.add("accounts", { password_hash: "x", display_name: over.email, under_13: false, failed_logins: 0, locked_until: null, email_verified_at: null, phone: null, ...over });
const verified = (over) => unverified({ email_verified_at: new Date().toISOString(), ...over });

beforeEach(() => {
  db.reset();
  repo.resetSchemaCache();
  clearAccountLimits();
  mail.sent.length = 0;
  mail.result = { delivered: true, provider: "test" };
});

describe("one-time tokens", () => {
  it("stores only a SHA-256 hash, never the token", async () => {
    const account = verified({ email: "a@x.com" });
    const { token } = await tokens.issueToken(account.id, "verify_email");
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 random bytes
    const [row] = db.table("account_tokens");
    expect(row.token_hash).toBe(tokens.hashToken(token));
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(db.table("account_tokens"))).not.toContain(token);
    expect(row).toMatchObject({ account_id: account.id, kind: "verify_email", used_at: null });
  });

  it("expires after 48 hours for email and 1 hour for a reset", async () => {
    const account = verified({ email: "a@x.com" });
    const now = Date.now();
    const verify = await tokens.issueToken(account.id, "verify_email", { now });
    const reset = await tokens.issueToken(account.id, "reset_password", { now });
    expect(new Date(verify.expiresAt).getTime() - now).toBe(48 * 3600 * 1000);
    expect(new Date(reset.expiresAt).getTime() - now).toBe(3600 * 1000);
    expect((await tokens.peekToken(reset.token, "reset_password", { now: now + 59 * 60 * 1000 })).ok).toBe(true);
    expect((await tokens.consumeToken(reset.token, "reset_password", { now: now + 61 * 60 * 1000 })).ok).toBe(false);
    expect((await tokens.consumeToken(verify.token, "verify_email", { now: now + 47 * 3600 * 1000 })).ok).toBe(true);
  });

  it("works once: a replay fails", async () => {
    const account = verified({ email: "a@x.com" });
    const { token } = await tokens.issueToken(account.id, "verify_email");
    expect(await tokens.consumeToken(token, "verify_email")).toEqual({ ok: true, accountId: account.id });
    expect(await tokens.consumeToken(token, "verify_email")).toEqual({ ok: false });
    expect((await tokens.peekToken(token, "verify_email")).ok).toBe(false);
  });

  it("lets only one of two simultaneous uses win", async () => {
    const account = verified({ email: "a@x.com" });
    const { token } = await tokens.issueToken(account.id, "verify_email");
    const results = await Promise.all([tokens.consumeToken(token, "verify_email"), tokens.consumeToken(token, "verify_email")]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
  });

  it("a new token of the same kind invalidates the older ones; the other kind is untouched", async () => {
    const account = verified({ email: "a@x.com" });
    const first = await tokens.issueToken(account.id, "verify_email");
    const reset = await tokens.issueToken(account.id, "reset_password");
    const second = await tokens.issueToken(account.id, "verify_email");
    expect((await tokens.peekToken(first.token, "verify_email")).ok).toBe(false);
    expect((await tokens.peekToken(second.token, "verify_email")).ok).toBe(true);
    expect((await tokens.peekToken(reset.token, "reset_password")).ok).toBe(true);
  });

  it("refuses a token of the wrong kind, a malformed token and a guess", async () => {
    const account = verified({ email: "a@x.com" });
    const { token } = await tokens.issueToken(account.id, "verify_email");
    expect((await tokens.consumeToken(token, "reset_password")).ok).toBe(false);
    for (const bad of ["", "abc", "x".repeat(43), `${token}x`, undefined, null]) expect((await tokens.consumeToken(bad, "verify_email")).ok, String(bad)).toBe(false);
    expect((await tokens.consumeToken(token, "verify_email")).ok).toBe(true);
  });
});

describe("sign-up", () => {
  it("rejects two different passwords on the server, with the field named", async () => {
    const response = await call(signup.POST, "/api/accounts/signup", form({ passwordConfirm: "correct horsE" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "The two passwords do not match.", field: "passwordConfirm" });
    const missing = await call(signup.POST, "/api/accounts/signup", form({ passwordConfirm: undefined }));
    expect(missing.status).toBe(400);
    expect(db.table("accounts")).toHaveLength(0);
  });

  it("requires a phone with a country code and stores it as E.164, unverified", async () => {
    expect((await call(signup.POST, "/api/accounts/signup", form({ phone: "" }))).status).toBe(400);
    const national = await call(signup.POST, "/api/accounts/signup", form({ phone: "415 555 2671" }));
    expect(national.status).toBe(400);
    expect((await national.json()).field).toBe("phone");
    const ok = await call(signup.POST, "/api/accounts/signup", form());
    expect(ok.status).toBe(200);
    expect(db.table("accounts")[0]).toMatchObject({ phone: "+14155552671", phone_verified_at: null, email_verified_at: null });
    const body = await ok.json();
    expect(body.account).toMatchObject({ emailVerified: false, phone: "+14155552671", phoneVerified: false });
    expect(JSON.stringify(body)).not.toContain("password_hash");
  });

  it("allows one account per phone and does not say which email uses it", async () => {
    await call(signup.POST, "/api/accounts/signup", form());
    const response = await call(signup.POST, "/api/accounts/signup", form({ email: "other@home.com", phone: "001 (415) 555-2671" }));
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("That phone number is already linked to another account.");
    expect(JSON.stringify(body)).not.toContain("maria@home.com");
    expect(db.table("accounts")).toHaveLength(1);
  });

  it("also catches a phone clash that slips past the pre-check (the unique index)", async () => {
    const hash = await core.hashPassword("correct horse");
    await repo.insertAccount({ email: "a@x.com", passwordHash: hash, displayName: "A", role: "student", phone: "+14155552671" });
    await expect(repo.insertAccount({ email: "b@x.com", passwordHash: hash, displayName: "B", role: "student", phone: "+14155552671" })).rejects.toBeInstanceOf(repo.PhoneTakenError);
    await expect(repo.insertAccount({ email: "a@x.com", passwordHash: hash, displayName: "A2", role: "student", phone: "+34612345678" })).rejects.toBeInstanceOf(repo.EmailTakenError);
  });

  it("sends a confirmation email with a link to /verify-email and logs the person in", async () => {
    const response = await call(signup.POST, "/api/accounts/signup", form(), { host: "luna.test", "x-forwarded-proto": "https" });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(SESSION_COOKIE);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].to).toBe("maria@home.com");
    expect(mail.sent[0].links[0]).toMatch(/^https:\/\/luna\.test\/verify-email\?token=[A-Za-z0-9_-]{43}$/);
    expect((await response.json()).confirmation).toEqual({ delivered: true });
  });

  it("reports a missing mail provider without any link, and the account still works", async () => {
    mail.result = { delivered: false, provider: "none", mailSetupNeeded: true };
    const response = await call(signup.POST, "/api/accounts/signup", form());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.confirmation).toEqual({ delivered: false, mailSetupNeeded: true });
    expect(JSON.stringify(body)).not.toMatch(/verify-email|token/);
  });

  it("keeps the requests typed at sign-up for later instead of sending them", async () => {
    verified({ email: "mom@home.com", role: "parent", display_name: "Mom" });
    const response = await call(signup.POST, "/api/accounts/signup", form({ invites: [{ email: "Mom@Home.com", relation: "parent" }, { email: "maria@home.com", relation: "teacher" }, { email: "x@y.co", relation: "student" }] }));
    const body = await response.json();
    expect(body.invites).toEqual([]);
    expect(body.invitesQueued).toBe(1); // the self-request and the impossible relation are dropped
    expect(db.table("account_links")).toHaveLength(0);
    expect(db.table("accounts").find((row) => row.email === "maria@home.com").pending_invites).toEqual([{ email: "mom@home.com", relation: "parent" }]);
  });
});

describe("confirming the email", () => {
  async function signUp(over = {}) {
    await call(signup.POST, "/api/accounts/signup", form(over));
    return db.table("accounts").find((row) => row.email === (over.email || "maria@home.com"));
  }

  it("marks the account confirmed through the route, once", async () => {
    const account = await signUp();
    const token = tokenFrom(mail.sent[0]);
    const response = await call(verifyRoute.POST, "/api/accounts/verify-email", { token });
    expect(response.status).toBe(200);
    expect(account.email_verified_at).toBeTruthy();
    const again = await call(verifyRoute.POST, "/api/accounts/verify-email", { token });
    expect(again.status).toBe(400);
    expect((await again.json()).invalidLink).toBe(true);
  });

  it("answers the same for a wrong, expired or reused link", async () => {
    await signUp();
    const wrong = await call(verifyRoute.POST, "/api/accounts/verify-email", { token: "A".repeat(43) });
    expect(wrong.status).toBe(400);
    expect((await wrong.json()).error).toMatch(/invalid or has expired/);
  });

  it("attaches requests other people made to the address only after it is confirmed", async () => {
    const teacher = verified({ email: "rivera@school.edu", display_name: "Prof. Rivera", role: "teacher" });
    await repo.requestLink(teacher, { email: "maria@home.com", relation: "student" });
    expect(db.table("account_links")[0]).toMatchObject({ target_id: null, status: "pending" });

    const maria = await signUp(); // signing up with that address attaches nothing...
    expect(db.table("account_links")[0].target_id).toBeNull();
    expect((await repo.listConnections(maria)).incoming).toHaveLength(0);
    expect(await repo.attachPendingLinks(maria)).toBe(0);

    await call(verifyRoute.POST, "/api/accounts/verify-email", { token: tokenFrom(mail.sent[0]) }); // ...confirming it does
    expect(db.table("account_links")[0].target_id).toBe(maria.id);
    const incoming = (await repo.listConnections(maria)).incoming;
    expect(incoming).toHaveLength(1);
    expect(incoming[0].other.email).toBe("rivera@school.edu");
  });

  it("does not let someone who signed up with another person's address (unconfirmed) see or answer their requests", async () => {
    const teacher = verified({ email: "rivera@school.edu", role: "teacher", display_name: "Prof. Rivera" });
    const impostor = await signUp({ email: "victim@home.com", displayName: "Not the victim" });
    // The request is made after the impostor exists: the unconfirmed account is treated as "nobody yet".
    await repo.requestLink(teacher, { email: "victim@home.com", relation: "student" });
    const link = db.table("account_links")[0];
    expect(link.target_id).toBeNull();
    expect((await repo.listConnections(impostor)).incoming).toHaveLength(0);
    await expect(repo.changeLink(impostor, link.id, "accept")).rejects.toMatchObject({ code: "email_unverified" });
    expect((await repo.listNotifications(impostor)).pendingRequests).toHaveLength(0);
  });

  it("sends the requests typed at sign-up once the email is confirmed", async () => {
    verified({ email: "mom@home.com", role: "parent", display_name: "Mom" });
    const maria = await signUp({ invites: [{ email: "mom@home.com", relation: "parent" }, { email: "newteacher@school.edu", relation: "teacher" }] });
    await call(verifyRoute.POST, "/api/accounts/verify-email", { token: tokenFrom(mail.sent[0]) });
    const links = db.table("account_links");
    expect(links.map((row) => row.target_email).sort()).toEqual(["mom@home.com", "newteacher@school.edu"]);
    expect(links.every((row) => row.requester_id === maria.id && row.status === "pending")).toBe(true);
    expect(maria.pending_invites).toBeNull();
    // and the people asked were told (Mom has an account, the teacher gets an invitation)
    const recipients = mail.sent.slice(1).map((message) => message.to).sort();
    expect(recipients).toEqual(["mom@home.com", "newteacher@school.edu"]);
  });

  it("the resend button needs a session, is rate limited, and replaces the old link", async () => {
    const account = await signUp();
    const first = tokenFrom(mail.sent[0]);
    expect((await call(resendRoute.POST, "/api/accounts/resend-verification", {})).status).toBe(401);
    const headers = cookieOf(account.id);
    expect((await call(resendRoute.POST, "/api/accounts/resend-verification", {}, headers)).status).toBe(200);
    const second = tokenFrom(mail.sent[1]);
    expect(second).not.toBe(first);
    expect((await tokens.peekToken(first, "verify_email")).ok).toBe(false);
    expect((await call(resendRoute.POST, "/api/accounts/resend-verification", {}, headers)).status).toBe(200);
    expect((await call(resendRoute.POST, "/api/accounts/resend-verification", {}, headers)).status).toBe(200);
    const blocked = await call(resendRoute.POST, "/api/accounts/resend-verification", {}, headers);
    expect(blocked.status).toBe(429);
    expect(mail.sent).toHaveLength(4); // signup + 3 resends; the blocked one sent nothing
  });

  it("resend for an already confirmed account sends nothing", async () => {
    const account = verified({ email: "ok@x.com" });
    const response = await call(resendRoute.POST, "/api/accounts/resend-verification", {}, cookieOf(account.id));
    expect(await response.json()).toMatchObject({ ok: true, alreadyVerified: true });
    expect(mail.sent).toHaveLength(0);
  });
});

describe("what an unconfirmed account cannot do (enforced on the server)", () => {
  it("cannot send or accept connection requests", async () => {
    const me = unverified({ email: "me@x.com", role: "teacher" });
    const student = verified({ email: "kid@x.com", role: "student" });
    await expect(repo.requestLink(me, { email: student.email, relation: "student" })).rejects.toMatchObject({ code: "email_unverified", status: 403 });
    expect(db.table("account_links")).toHaveLength(0);

    const asked = verified({ email: "rivera@school.edu", role: "teacher" });
    await repo.requestLink(asked, { email: student.email, relation: "student" });
    const target = unverified({ email: "kid2@x.com", role: "student" });
    db.add("account_links", { kind: "teacher_student", requester_id: asked.id, requester_email: asked.email, target_id: target.id, target_email: target.email, status: "pending", pair_key: "k" });
    await expect(repo.changeLink(target, db.table("account_links")[1].id, "accept")).rejects.toMatchObject({ code: "email_unverified" });
    expect(db.table("account_links")[1].status).toBe("pending");
  });

  it("is refused through the API with a 403 that says why", async () => {
    const me = unverified({ email: "me@x.com", role: "teacher", display_name: "Me" });
    const response = await call(linksRoute.POST, "/api/accounts/links", { action: "request", email: "kid@x.com", relation: "student" }, cookieOf(me.id));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "email_unverified" });
    expect(mail.sent).toHaveLength(0);
  });

  it("cannot share or assign", async () => {
    const me = unverified({ email: "me@x.com", role: "teacher" });
    const student = verified({ email: "kid@x.com", role: "student" });
    for (const mode of ["share", "assign"]) {
      await expect(sharing.deliverDocument({ sender: me, recipientId: student.id, documentId: "d1", mode })).rejects.toMatchObject({ code: "email_unverified" });
    }
    expect(db.table("shared_items")).toHaveLength(0);
  });

  it("can still decline, cancel and use their own workspace", async () => {
    const asked = verified({ email: "rivera@school.edu", role: "teacher" });
    const me = unverified({ email: "kid@x.com", role: "student" });
    const link = db.add("account_links", { kind: "teacher_student", requester_id: asked.id, requester_email: asked.email, target_id: me.id, target_email: me.email, status: "pending", pair_key: "k" });
    expect(await repo.changeLink(me, link.id, "decline")).toBe("declined");
    expect((await repo.ensureFirstWorkspace(me.id))).toBeTruthy();
  });

  it("after confirming, the same actions work", async () => {
    const me = unverified({ email: "me@x.com", role: "teacher" });
    verified({ email: "kid@x.com", role: "student" });
    const { token } = await tokens.issueToken(me.id, "verify_email");
    const result = await flows.verifyEmailWithToken(token, "http://localhost");
    expect(result.ok).toBe(true);
    const fresh = await repo.findAccountById(me.id);
    expect((await repo.requestLink(fresh, { email: "kid@x.com", relation: "student" })).status).toBe("pending");
  });
});

describe("the old schema (migration not applied yet)", () => {
  beforeEach(() => db.legacySchema());

  it("sign-up still works: no phone stored, no email, nothing blocked", async () => {
    const response = await call(signup.POST, "/api/accounts/signup", form());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.confirmation).toBeNull();
    expect(body.account.emailVerified).toBe(true); // verification cannot exist yet, so nothing is gated
    expect(db.table("accounts")[0].phone).toBeUndefined();
    expect(mail.sent).toHaveLength(0);
  });

  it("still validates the password twice and the phone format", async () => {
    expect((await call(signup.POST, "/api/accounts/signup", form({ passwordConfirm: "nope nope" }))).status).toBe(400);
    expect((await call(signup.POST, "/api/accounts/signup", form({ phone: "12" }))).status).toBe(400);
  });

  it("sends invites and attaches requests immediately, as before", async () => {
    const teacher = db.add("accounts", { email: "rivera@school.edu", password_hash: "x", display_name: "R", role: "teacher", under_13: false });
    await repo.requestLink(teacher, { email: "maria@home.com", relation: "student" });
    await call(signup.POST, "/api/accounts/signup", form({ invites: [{ email: "mom@home.com", relation: "parent" }] }));
    const maria = db.table("accounts").find((row) => row.email === "maria@home.com");
    expect(db.table("account_links").find((row) => row.requester_email === "rivera@school.edu").target_id).toBe(maria.id);
    expect(db.table("account_links").some((row) => row.target_email === "mom@home.com")).toBe(true);
  });

  it("the new routes answer 503 setupNeeded naming the new migration", async () => {
    for (const [route, path] of [[verifyRoute, "/api/accounts/verify-email"], [resendRoute, "/api/accounts/resend-verification"]]) {
      const response = await call(route.POST, path, { token: "x" });
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ setupNeeded: true, migration: core.VERIFICATION_MIGRATION });
    }
  });

  it("picks the new columns up as soon as the migration is applied (no restart)", async () => {
    expect(await repo.supportsVerification()).toBe(false);
    db.reset();
    repo.resetSchemaCache();
    expect(await repo.supportsVerification()).toBe(true);
  });
});
