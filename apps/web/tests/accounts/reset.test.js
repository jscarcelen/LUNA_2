import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./fakeDb.js";

const mail = vi.hoisted(() => ({ sent: [] }));

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
    mail.sent.push(message);
    return { delivered: true, provider: "test" };
  })
}));

const core = await import("../../lib/accountsCore.js");
const { clearAccountLimits } = await import("../../lib/accountLimits.js");
const repo = await import("../../lib/accountsRepository.js");
const tokens = await import("../../lib/accountTokens.js");
const session = await import("../../lib/session.js");
const revocation = await import("../../lib/sessionRevocation.js");
const requestRoute = await import("../../app/api/accounts/password-reset/request/route.js");
const confirmRoute = await import("../../app/api/accounts/password-reset/confirm/route.js");
const settingsRoute = await import("../../app/api/accounts/settings/route.js");
const meRoute = await import("../../app/api/accounts/me/route.js");
const { signSession, resolveSessionSecret, SESSION_COOKIE } = core;

let counter = 0;
const post = (handler, path, body, headers = {}) =>
  handler(new Request(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.1.0.${++counter}`, ...headers }, body: JSON.stringify(body) }));
const cookie = (id, now = Date.now()) => ({ cookie: `${SESSION_COOKIE}=${encodeURIComponent(signSession(id, resolveSessionSecret(), { now }))}` });
const tokenFrom = (message) => new URL(message.links[0]).searchParams.get("token");
const reset = (body, headers) => post(confirmRoute.POST, "/api/accounts/password-reset/confirm", body, headers);
const askReset = (email, headers) => post(requestRoute.POST, "/api/accounts/password-reset/request", { email }, headers);

let maria;
const OLD = "old password 1";
beforeEach(async () => {
  db.reset();
  repo.resetSchemaCache();
  clearAccountLimits();
  revocation.clearRevocationCache();
  mail.sent.length = 0;
  maria = db.add("accounts", {
    email: "maria@home.com", display_name: "Maria", role: "student", under_13: false, failed_logins: 3, locked_until: new Date(Date.now() + 600000).toISOString(),
    password_hash: await core.hashPassword(OLD), email_verified_at: null, phone: null, phone_verified_at: null, password_changed_at: null, notifications_seen_at: null, pending_invites: null
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("asking for a reset", () => {
  it("answers exactly the same for an account and for an unknown email", async () => {
    const known = await askReset("maria@home.com");
    const unknown = await askReset("nobody@nowhere.com");
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(known.status);
    expect(await unknown.json()).toEqual(await known.json());
    expect(mail.sent.map((message) => message.to)).toEqual(["maria@home.com"]); // only the real account got mail
  });

  it("sends a link to /reset-password whose token is stored only as a hash", async () => {
    await askReset("Maria@Home.com");
    expect(mail.sent[0].links[0]).toMatch(/\/reset-password\?token=[A-Za-z0-9_-]{43}$/);
    const token = tokenFrom(mail.sent[0]);
    expect(JSON.stringify(db.table("account_tokens"))).not.toContain(token);
    expect(db.table("account_tokens")[0]).toMatchObject({ kind: "reset_password", account_id: maria.id });
  });

  it("a second request replaces the first link", async () => {
    await askReset("maria@home.com");
    await askReset("maria@home.com");
    expect((await tokens.peekToken(tokenFrom(mail.sent[0]), "reset_password")).ok).toBe(false);
    expect((await tokens.peekToken(tokenFrom(mail.sent[1]), "reset_password")).ok).toBe(true);
  });

  it("is limited per email (3 an hour) and per address (10 an hour), whether or not the account exists", async () => {
    for (let index = 0; index < 3; index += 1) expect((await askReset("limited@x.com")).status).toBe(200);
    expect((await askReset("limited@x.com")).status).toBe(429);
    expect(mail.sent).toHaveLength(0); // unknown address: no mail, but the same limit applies
    const sameAddress = { "x-forwarded-for": "10.9.9.9" };
    for (let index = 0; index < 10; index += 1) expect((await askReset(`user${index}@x.com`, sameAddress)).status).toBe(200);
    expect((await askReset("another@x.com", sameAddress)).status).toBe(429);
  });

  it("rejects something that is not an email", async () => {
    expect((await askReset("not-an-email")).status).toBe(400);
  });

  it("in production without a mail provider says email is not set up, for every address alike, and sends nothing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("LUNA_SMTP_URL", "");
    vi.stubEnv("LUNA_MAIL_FROM", "");
    const known = await askReset("maria@home.com");
    const unknown = await askReset("nobody@nowhere.com");
    expect(known.status).toBe(503);
    const body = await known.json();
    expect(body.mailSetupNeeded).toBe(true);
    expect(await unknown.json()).toEqual(body);
    expect(mail.sent).toHaveLength(0);
    expect(db.table("account_tokens")).toHaveLength(0);
  });
});

describe("choosing the new password", () => {
  async function linkToken() {
    await askReset("maria@home.com");
    return tokenFrom(mail.sent[mail.sent.length - 1]);
  }

  it("needs the password twice and does not burn the link on a typo", async () => {
    const token = await linkToken();
    const mismatch = await reset({ token, password: "brand new pass", passwordConfirm: "brand new pasS" });
    expect(mismatch.status).toBe(400);
    expect((await mismatch.json()).error).toBe("The two passwords do not match.");
    expect((await reset({ token, password: "short", passwordConfirm: "short" })).status).toBe(400);
    expect((await tokens.peekToken(token, "reset_password")).ok).toBe(true);
    expect(await core.verifyPassword(OLD, db.table("accounts")[0].password_hash)).toBe(true);
  });

  it("changes the password, consumes the link, confirms the email, clears the lock and logs the browser in", async () => {
    const token = await linkToken();
    const response = await reset({ token, password: "brand new pass", passwordConfirm: "brand new pass" });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(SESSION_COOKIE);
    const row = db.table("accounts")[0];
    expect(await core.verifyPassword("brand new pass", row.password_hash)).toBe(true);
    expect(await core.verifyPassword(OLD, row.password_hash)).toBe(false);
    expect(row.email_verified_at).toBeTruthy(); // they proved they read that mailbox
    expect(row.password_changed_at).toBeTruthy();
    expect(row).toMatchObject({ failed_logins: 0, locked_until: null });
    expect(await response.json()).toMatchObject({ ok: true, account: { email: "maria@home.com", emailVerified: true } });
  });

  it("works once: replaying the same link fails, and so do wrong and expired ones", async () => {
    const token = await linkToken();
    expect((await reset({ token, password: "brand new pass", passwordConfirm: "brand new pass" })).status).toBe(200);
    const replay = await reset({ token, password: "another pass 22", passwordConfirm: "another pass 22" });
    expect(replay.status).toBe(400);
    expect((await replay.json()).invalidLink).toBe(true);
    expect((await reset({ token: "B".repeat(43), password: "another pass 22", passwordConfirm: "another pass 22" })).status).toBe(400);

    const fresh = await linkToken();
    db.table("account_tokens").find((row) => row.token_hash === tokens.hashToken(fresh)).expires_at = new Date(Date.now() - 1000).toISOString();
    expect((await reset({ token: fresh, password: "another pass 22", passwordConfirm: "another pass 22" })).status).toBe(400);
  });

  it("a reset link cannot be used as an email-confirmation link, and the other way round", async () => {
    const token = await linkToken();
    expect((await tokens.consumeToken(token, "verify_email")).ok).toBe(false);
    const { token: verifyToken } = await tokens.issueToken(maria.id, "verify_email");
    expect((await reset({ token: verifyToken, password: "brand new pass", passwordConfirm: "brand new pass" })).status).toBe(400);
  });

  it("drops requests queued at sign-up instead of sending them in the mailbox owner's name", async () => {
    maria.pending_invites = [{ email: "mom@home.com", relation: "parent" }];
    const token = await linkToken();
    await reset({ token, password: "brand new pass", passwordConfirm: "brand new pass" });
    expect(db.table("account_links")).toHaveLength(0);
    expect(db.table("accounts")[0].pending_invites).toBeNull();
  });

  it("invalidates every other reset link", async () => {
    const first = await linkToken();
    db.add("account_tokens", { account_id: maria.id, kind: "reset_password", token_hash: tokens.hashToken("Z".repeat(43)), expires_at: new Date(Date.now() + 3600000).toISOString(), used_at: null });
    await reset({ token: first, password: "brand new pass", passwordConfirm: "brand new pass" });
    expect(db.table("account_tokens").filter((row) => row.kind === "reset_password")).toHaveLength(0);
  });
});

describe("sessions issued before a password change", () => {
  it("stop working; sessions issued after it do", async () => {
    const before = cookie(maria.id, Date.now() - 20000);
    expect(await session.accountIdForFresh(new Request("http://localhost/x", { headers: before }))).toBe(maria.id);

    await askReset("maria@home.com");
    await reset({ token: tokenFrom(mail.sent[0]), password: "brand new pass", passwordConfirm: "brand new pass" });
    revocation.clearRevocationCache(); // as on another server instance

    expect(await session.accountIdForFresh(new Request("http://localhost/x", { headers: before }))).toBe("");
    expect(await session.ownerUserIdForFresh(new Request("http://localhost/x", { headers: before }))).toBe("demo");
    expect(await session.accountIdForFresh(new Request("http://localhost/x", { headers: cookie(maria.id) }))).toBe(maria.id);
    // the workspace route can tell "revoked" from "never logged in" and answers 401 instead of serving the demo data
    expect(await session.hasRevokedSession(new Request("http://localhost/x", { headers: before }))).toBe(true);
    expect(await session.hasRevokedSession(new Request("http://localhost/x", { headers: cookie(maria.id) }))).toBe(false);
    expect(await session.hasRevokedSession(new Request("http://localhost/x"))).toBe(false);
    // the old cookie is refused by the account routes too
    const refused = await meRoute.GET(new Request("http://localhost/api/accounts/me", { headers: before }));
    expect(refused.status).toBe(401);
    expect((await meRoute.GET(new Request("http://localhost/api/accounts/me", { headers: cookie(maria.id) }))).status).toBe(200);
  });

  it("the decision is made on whole seconds, like the token's issue time", () => {
    const session = { issuedAt: 1000 };
    expect(revocation.isSessionRevoked(session, new Date(1000 * 1000 + 900).toISOString())).toBe(false);
    expect(revocation.isSessionRevoked(session, new Date(1001 * 1000).toISOString())).toBe(true);
    expect(revocation.isSessionRevoked(session, "")).toBe(false);
  });

  it("are never revoked on the old schema (no password_changed_at column yet)", async () => {
    db.legacySchema();
    revocation.clearRevocationCache();
    expect(await session.accountIdForFresh(new Request("http://localhost/x", { headers: cookie(maria.id, Date.now() - 20000) }))).toBe(maria.id);
  });

  it("changing the password in settings signs out the other sessions and keeps this one", async () => {
    const other = cookie(maria.id, Date.now() - 20000);
    const response = await post(settingsRoute.POST, "/api/accounts/settings", { action: "password", currentPassword: OLD, newPassword: "settings new pass", passwordConfirm: "settings new pass" }, cookie(maria.id, Date.now() - 20000));
    expect(response.status).toBe(200);
    const fresh = response.headers.get("set-cookie").split(";")[0].replace(`${SESSION_COOKIE}=`, "");
    revocation.clearRevocationCache();
    expect(await session.accountIdForFresh(new Request("http://localhost/x", { headers: other }))).toBe("");
    expect(await session.accountIdForFresh(new Request("http://localhost/x", { headers: { cookie: `${SESSION_COOKIE}=${fresh}` } }))).toBe(maria.id);
  });
});

describe("account settings", () => {
  const settings = (body, id = maria.id) => post(settingsRoute.POST, "/api/accounts/settings", body, cookie(id));

  it("needs the current password to change the password or the phone, and limits wrong guesses", async () => {
    for (let index = 0; index < 5; index += 1) expect((await settings({ action: "phone", phone: "+14155552671", currentPassword: "wrong" })).status).toBe(403);
    expect((await settings({ action: "phone", phone: "+14155552671", currentPassword: OLD })).status).toBe(429);
    expect(db.table("accounts")[0].phone).toBeNull();
  });

  it("sets, changes and removes the phone; never verified; one account per number", async () => {
    const other = db.add("accounts", { email: "b@x.com", display_name: "B", role: "teacher", password_hash: await core.hashPassword(OLD), email_verified_at: null, phone: "+34612345678", phone_verified_at: null });
    const taken = await settings({ action: "phone", phone: "+34 612 34 56 78", currentPassword: OLD });
    expect(taken.status).toBe(409);
    expect((await taken.json()).error).toBe("That phone number is already linked to another account.");

    const ok = await settings({ action: "phone", phone: "+1 (415) 555-2671", currentPassword: OLD });
    expect(ok.status).toBe(200);
    expect(db.table("accounts")[0]).toMatchObject({ phone: "+14155552671", phone_verified_at: null });
    expect((await settings({ action: "phone", phone: "415 555 2671", currentPassword: OLD })).status).toBe(400);

    const removed = await settings({ action: "phone", phone: "", currentPassword: OLD });
    expect(removed.status).toBe(200);
    expect(db.table("accounts")[0].phone).toBeNull();
    expect(other.phone).toBe("+34612345678");
  });

  it("checks the new password twice here as well", async () => {
    const response = await settings({ action: "password", currentPassword: OLD, newPassword: "settings new pass", passwordConfirm: "different one" });
    expect(response.status).toBe(400);
    expect(await core.verifyPassword(OLD, db.table("accounts")[0].password_hash)).toBe(true);
  });

  it("is refused without a session", async () => {
    const response = await post(settingsRoute.POST, "/api/accounts/settings", { action: "password" });
    expect(response.status).toBe(401);
  });
});
