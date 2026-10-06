import { describe, expect, it } from "vitest";
import {
  LinkError,
  SESSION_COOKIE,
  SessionConfigError,
  authorizeDelivery,
  classifyDeliverable,
  clearSessionCookie,
  createRateLimiter,
  decideLinkRequest,
  hashPassword,
  isSameOrigin,
  isSetupNeededError,
  isValidEmail,
  kindForRoles,
  kindForRequest,
  hasGuardianPowers,
  linkFitsAccounts,
  normalizeDisplayName,
  normalizeEmail,
  pairKey,
  parseCookieHeader,
  publicAccount,
  relationsFor,
  resolveSessionSecret,
  serializeSessionCookie,
  setupNeededBody,
  signSession,
  transitionLink,
  validatePassword,
  verifyPassword,
  verifySession
} from "../../lib/accountsCore.js";

describe("email and name rules", () => {
  it("normalises emails to trimmed lowercase", () => {
    expect(normalizeEmail("  Maria.G@Example.COM ")).toBe("maria.g@example.com");
    expect(normalizeEmail(null)).toBe("");
  });
  it("accepts ordinary addresses and rejects junk", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail(" Teacher+LUNA@school.edu ")).toBe(true);
    for (const bad of ["", "no-at.com", "a@b", "a b@c.com", "@c.com", "a@@c.com"]) expect(isValidEmail(bad)).toBe(false);
    expect(isValidEmail(`${"a".repeat(250)}@b.com`)).toBe(false);
  });
  it("collapses whitespace in display names and caps their length", () => {
    expect(normalizeDisplayName("  Prof.   Rivera ")).toBe("Prof. Rivera");
    expect(normalizeDisplayName("x".repeat(200))).toHaveLength(80);
  });
});

describe("password rules", () => {
  it("needs at least 8 characters", () => {
    expect(validatePassword("short7!").ok).toBe(false);
    expect(validatePassword("long-enough").ok).toBe(true);
  });
  it("rejects absurdly long passwords and the email itself", () => {
    expect(validatePassword("x".repeat(201)).ok).toBe(false);
    expect(validatePassword("Maria@Example.com", "maria@example.com").ok).toBe(false);
  });
});

describe("password hashing", () => {
  it("verifies the right password and nothing else", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("correct horse batterY", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });
  it("salts: the same password hashes differently each time", async () => {
    expect(await hashPassword("same-password")).not.toBe(await hashPassword("same-password"));
  });
  it("refuses malformed or tampered stored hashes instead of crashing", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "plaintext")).toBe(false);
    expect(await verifyPassword("x", "scrypt$16384$8$1$AAAA")).toBe(false);
    // a row rewritten to ask for an enormous work factor is refused outright
    expect(await verifyPassword("x", "scrypt$1073741824$8$1$AAAA$AAAA")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$16384$8$1$AAAA$AAAA")).toBe(false);
  });
});

describe("session tokens", () => {
  const secret = "s".repeat(40);
  const now = 1_800_000_000_000;

  it("round-trips the account id", () => {
    const token = signSession("acc-1", secret, { now });
    expect(verifySession(token, secret, { now: now + 1000 })).toMatchObject({ accountId: "acc-1" });
  });
  it("expires", () => {
    const token = signSession("acc-1", secret, { now, ttlSeconds: 60 });
    expect(verifySession(token, secret, { now: now + 59_000 })).not.toBeNull();
    expect(verifySession(token, secret, { now: now + 61_000 })).toBeNull();
  });
  it("rejects a token signed with another secret", () => {
    expect(verifySession(signSession("acc-1", secret, { now }), "t".repeat(40), { now })).toBeNull();
  });
  it("rejects a tampered payload (a different account id) and a tampered signature", () => {
    const [version, body, signature] = signSession("acc-1", secret, { now }).split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "acc-2", iat: now / 1000, exp: now / 1000 + 9999 })).toString("base64url");
    expect(verifySession(`${version}.${forged}.${signature}`, secret, { now })).toBeNull();
    expect(verifySession(`${version}.${body}.${signature.slice(0, -2)}AA`, secret, { now })).toBeNull();
    expect(verifySession(`v2.${body}.${signature}`, secret, { now })).toBeNull();
  });
  it("rejects garbage without throwing", () => {
    for (const junk of ["", undefined, null, "a.b", "a.b.c.d", "v1..", "v1.%%%.%%%"]) expect(verifySession(junk, secret, { now })).toBeNull();
  });
});

describe("session secret", () => {
  it("uses LUNA_SESSION_SECRET when it is long enough", () => {
    expect(resolveSessionSecret({ LUNA_SESSION_SECRET: "k".repeat(32), NODE_ENV: "production" })).toBe("k".repeat(32));
  });
  it("refuses a short secret anywhere", () => {
    expect(() => resolveSessionSecret({ LUNA_SESSION_SECRET: "short", NODE_ENV: "development" })).toThrow(SessionConfigError);
  });
  it("falls back to a development value outside production", () => {
    expect(resolveSessionSecret({ NODE_ENV: "development" }).length).toBeGreaterThanOrEqual(32);
    expect(resolveSessionSecret({})).toBe(resolveSessionSecret({ NODE_ENV: "test" }));
  });
  it("refuses to run production without the variable", () => {
    expect(() => resolveSessionSecret({ NODE_ENV: "production" })).toThrow(/LUNA_SESSION_SECRET/);
  });
});

describe("cookies", () => {
  it("sets an HttpOnly, SameSite=Lax cookie, Secure on https", () => {
    const cookie = serializeSessionCookie("tok", { secure: true });
    expect(cookie).toContain(`${SESSION_COOKIE}=tok`);
    for (const part of ["HttpOnly", "SameSite=Lax", "Path=/", "Secure", "Max-Age="]) expect(cookie).toContain(part);
    expect(serializeSessionCookie("tok", { secure: false })).not.toContain("Secure");
  });
  it("clears the cookie", () => {
    expect(clearSessionCookie()).toMatch(/Max-Age=0/);
  });
  it("parses a Cookie header", () => {
    expect(parseCookieHeader("a=1; luna_session=abc%2E; b=two=2")).toEqual({ a: "1", luna_session: "abc.", b: "two=2" });
    expect(parseCookieHeader("")).toEqual({});
  });
});

describe("same-origin check", () => {
  const headers = (map) => new Headers(map);
  it("lets requests without an Origin through and blocks other sites", () => {
    expect(isSameOrigin(headers({ host: "luna.app" }))).toBe(true);
    expect(isSameOrigin(headers({ host: "luna.app", origin: "https://luna.app" }))).toBe(true);
    expect(isSameOrigin(headers({ host: "luna.app", origin: "https://evil.example" }))).toBe(false);
    expect(isSameOrigin(headers({ host: "luna.app", origin: "not a url" }))).toBe(false);
    expect(isSameOrigin(headers({ "x-forwarded-host": "luna.app", host: "internal:3000", origin: "https://luna.app" }))).toBe(true);
  });
});

describe("rate limiter", () => {
  it("blocks after the limit and frees up when the window passes", () => {
    let time = 0;
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000, now: () => time });
    limiter.fail("k"); limiter.fail("k");
    expect(limiter.isBlocked("k")).toBe(false);
    limiter.fail("k");
    expect(limiter.isBlocked("k")).toBe(true);
    expect(limiter.retryAfterMs("k")).toBeGreaterThan(0);
    expect(limiter.isBlocked("other")).toBe(false);
    time = 1500;
    expect(limiter.isBlocked("k")).toBe(false);
  });
  it("reset clears a key", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });
    limiter.fail("k");
    expect(limiter.isBlocked("k")).toBe(true);
    limiter.reset("k");
    expect(limiter.isBlocked("k")).toBe(false);
  });
});

describe("which accounts may be linked", () => {
  it("keeps the teacher and parent powers for their own pairs, in either order", () => {
    expect(kindForRoles("teacher", "student")).toBe("teacher_student");
    expect(kindForRoles("student", "teacher")).toBe("teacher_student");
    expect(kindForRoles("parent", "student")).toBe("parent_student");
    expect(kindForRoles("student", "parent")).toBe("parent_student");
  });
  it("makes every other pair of roles a peer connection (the network is open)", () => {
    for (const [a, b] of [["teacher", "parent"], ["parent", "teacher"], ["student", "student"], ["teacher", "teacher"], ["parent", "parent"]]) expect(kindForRoles(a, b)).toBe("peer");
    expect(kindForRoles("admin", "student")).toBeNull();
  });
  it("lets every role ask every role", () => {
    for (const role of ["teacher", "parent", "student"]) expect(relationsFor(role)).toEqual(["student", "teacher", "parent"]);
    expect(relationsFor("nobody")).toEqual([]);
  });
  it("guesses the kind of a request to an address with no account from the role hinted, else peer", () => {
    expect(kindForRequest("teacher", "student")).toBe("teacher_student");
    expect(kindForRequest("parent", "student")).toBe("parent_student");
    expect(kindForRequest("teacher", "teacher")).toBe("peer");
    expect(kindForRequest("teacher", "")).toBe("peer");
    expect(kindForRequest("teacher", "wizard")).toBe("peer");
  });
  it("gives a student's performance and assigning only to teacher_student / parent_student links, never to a peer", () => {
    const link = (kind) => ({ status: "accepted", kind });
    expect(hasGuardianPowers(link("teacher_student"), "teacher", "student")).toBe(true);
    expect(hasGuardianPowers(link("parent_student"), "parent", "student")).toBe(true);
    expect(hasGuardianPowers(link("peer"), "teacher", "student")).toBe(false);
    expect(hasGuardianPowers(link("peer"), "parent", "student")).toBe(false);
    expect(hasGuardianPowers(link("teacher_student"), "parent", "student")).toBe(false); // wrong kind for the roles
    expect(hasGuardianPowers(link("teacher_student"), "student", "teacher")).toBe(false); // a student has no such power over a teacher
    expect(hasGuardianPowers(link("teacher_student"), "teacher", "teacher")).toBe(false);
    expect(hasGuardianPowers({ status: "pending", kind: "teacher_student" }, "teacher", "student")).toBe(false);
    expect(hasGuardianPowers(null, "teacher", "student")).toBe(false);
  });
  it("makes the pair key independent of who asked", () => {
    expect(pairKey("teacher_student", "T@x.com", "s@x.com")).toBe(pairKey("teacher_student", "s@x.com", "t@x.com"));
    expect(pairKey("teacher_student", "a@x.com", "b@x.com")).not.toBe(pairKey("parent_student", "a@x.com", "b@x.com"));
  });
  it("checks that a stored by-email request still fits once the person has signed up", () => {
    expect(linkFitsAccounts("teacher_student", "teacher", "student")).toBe(true);
    expect(linkFitsAccounts("teacher_student", "teacher", "parent")).toBe(false);
    expect(linkFitsAccounts("peer", "teacher", "parent")).toBe(true);
  });
});

describe("link state machine", () => {
  const pending = { requesterId: "T", targetId: "S", status: "pending" };
  it("only the person asked can accept or decline", () => {
    expect(transitionLink(pending, "S", "accept")).toBe("accepted");
    expect(transitionLink(pending, "S", "decline")).toBe("declined");
    expect(() => transitionLink(pending, "T", "accept")).toThrow(LinkError);
    expect(() => transitionLink(pending, "T", "decline")).toThrow(/Only the person who was asked/);
  });
  it("only the person who asked can cancel, and only while pending", () => {
    expect(transitionLink(pending, "T", "cancel")).toBe("revoked");
    expect(() => transitionLink(pending, "S", "cancel")).toThrow(LinkError);
    expect(() => transitionLink({ ...pending, status: "accepted" }, "T", "cancel")).toThrow(/no longer open/);
  });
  it("either side can remove an accepted link, nobody can remove a pending one", () => {
    const accepted = { ...pending, status: "accepted" };
    expect(transitionLink(accepted, "T", "remove")).toBe("revoked");
    expect(transitionLink(accepted, "S", "remove")).toBe("revoked");
    expect(() => transitionLink(pending, "T", "remove")).toThrow(/not connected/);
  });
  it("answers on a closed request fail", () => {
    for (const status of ["accepted", "declined", "revoked"]) expect(() => transitionLink({ ...pending, status }, "S", "accept")).toThrow(/no longer open/);
  });
  it("strangers can do nothing", () => {
    for (const action of ["accept", "decline", "cancel", "remove"]) expect(() => transitionLink(pending, "X", action)).toThrow(/not yours/);
  });
  it("a request to a person without an account cannot be answered by anyone else", () => {
    const waiting = { requesterId: "T", targetId: "", status: "pending" };
    expect(() => transitionLink(waiting, "S", "accept")).toThrow(LinkError);
  });
  it("rejects unknown actions", () => {
    expect(() => transitionLink(pending, "S", "explode")).toThrow(/Unknown action/);
  });
});

describe("what happens when someone asks to link", () => {
  const row = (over) => ({ requesterId: "T", status: "pending", respondedAt: "", ...over });
  it("creates when there is nothing yet", () => {
    expect(decideLinkRequest(null, "T").type).toBe("create");
  });
  it("is idempotent while pending, and a request in the other direction is the second yes", () => {
    expect(decideLinkRequest(row(), "T").type).toBe("already_pending");
    expect(decideLinkRequest(row(), "S").type).toBe("accept_existing");
  });
  it("does not duplicate an accepted link", () => {
    expect(decideLinkRequest(row({ status: "accepted" }), "S").type).toBe("already_linked");
  });
  it("reopens revoked links and, after a day, declined ones", () => {
    expect(decideLinkRequest(row({ status: "revoked" }), "T").type).toBe("reopen");
    const now = Date.parse("2026-10-04T12:00:00Z");
    const declined = row({ status: "declined", respondedAt: "2026-10-04T10:00:00Z" });
    expect(decideLinkRequest(declined, "T", now).type).toBe("cooldown");
    expect(decideLinkRequest(declined, "S", now).type).toBe("reopen");
    expect(decideLinkRequest(declined, "T", now + 25 * 3600 * 1000).type).toBe("reopen");
  });
});

describe("who may send what to whom", () => {
  const teacher = { id: "T", role: "teacher" };
  const student = { id: "S", role: "student" };
  const parent = { id: "P", role: "parent" };
  const link = (over) => ({ requesterId: "T", targetId: "S", status: "accepted", kind: "teacher_student", ...over });

  it("allows sharing and assigning along an accepted link", () => {
    expect(authorizeDelivery({ mode: "share", sender: teacher, recipient: student, link: link() }).ok).toBe(true);
    expect(authorizeDelivery({ mode: "assign", sender: teacher, recipient: student, link: link() }).ok).toBe(true);
  });
  it("lets a student share back, but not assign", () => {
    expect(authorizeDelivery({ mode: "share", sender: student, recipient: teacher, link: link() }).ok).toBe(true);
    const verdict = authorizeDelivery({ mode: "assign", sender: student, recipient: teacher, link: link() });
    expect(verdict.ok).toBe(false);
    expect(verdict.status).toBe(403);
  });
  it("needs an accepted link", () => {
    for (const status of ["pending", "declined", "revoked"]) expect(authorizeDelivery({ mode: "share", sender: teacher, recipient: student, link: link({ status }) }).ok).toBe(false);
    expect(authorizeDelivery({ mode: "share", sender: teacher, recipient: student, link: null }).ok).toBe(false);
  });
  it("needs the link to be between exactly these two accounts", () => {
    expect(authorizeDelivery({ mode: "share", sender: teacher, recipient: { id: "S2", role: "student" }, link: link() }).ok).toBe(false);
    expect(authorizeDelivery({ mode: "share", sender: { id: "T2", role: "teacher" }, recipient: student, link: link() }).ok).toBe(false);
  });
  it("sharing works over any kind of connection, assigning only over teacher_student / parent_student", () => {
    expect(authorizeDelivery({ mode: "share", sender: parent, recipient: student, link: link({ requesterId: "P", kind: "parent_student" }) }).ok).toBe(true);
    expect(authorizeDelivery({ mode: "share", sender: student, recipient: { id: "S2", role: "student" }, link: link({ requesterId: "S", targetId: "S2", kind: "peer" }) }).ok).toBe(true);
    expect(authorizeDelivery({ mode: "share", sender: teacher, recipient: parent, link: link({ targetId: "P", kind: "peer" }) }).ok).toBe(true);
    // a teacher cannot assign through a link of the wrong kind, even to a student
    expect(authorizeDelivery({ mode: "assign", sender: teacher, recipient: student, link: link({ kind: "parent_student" }) }).ok).toBe(false);
    expect(authorizeDelivery({ mode: "assign", sender: teacher, recipient: student, link: link({ kind: "peer" }) }).status).toBe(403);
    expect(authorizeDelivery({ mode: "assign", sender: teacher, recipient: parent, link: link({ targetId: "P", kind: "peer" }) }).ok).toBe(false);
  });
  it("refuses sending to yourself, to nobody, and unknown modes", () => {
    expect(authorizeDelivery({ mode: "share", sender: teacher, recipient: teacher, link: link() }).ok).toBe(false);
    expect(authorizeDelivery({ mode: "share", sender: teacher, recipient: null, link: link() }).status).toBe(404);
    expect(authorizeDelivery({ mode: "teleport", sender: teacher, recipient: student, link: link() }).ok).toBe(false);
  });
});

describe("what kind of document is being sent", () => {
  it("recognises plans, activities, resources and plain documents", () => {
    expect(classifyDeliverable({ tags: ["study-plan"] }, "share")).toEqual({ ok: true, itemType: "plan" });
    expect(classifyDeliverable({ tags: ["resource", "activity"] }, "assign")).toEqual({ ok: true, itemType: "activity" });
    expect(classifyDeliverable({ tags: ["resource"] }, "share")).toEqual({ ok: true, itemType: "resource" });
    expect(classifyDeliverable({ tags: [] }, "share")).toEqual({ ok: true, itemType: "document" });
  });
  it("only activities and plans can be assigned", () => {
    expect(classifyDeliverable({ tags: ["resource"] }, "assign").ok).toBe(false);
    expect(classifyDeliverable({ tags: [] }, "assign").ok).toBe(false);
  });
  it("never sends bookkeeping documents or forwards a received copy", () => {
    for (const tag of ["doc-notes", "activity-attempt", "ai-agent", "study-goal"]) expect(classifyDeliverable({ tags: [tag] }, "share").ok).toBe(false);
    expect(classifyDeliverable({ tags: ["resource", "shared-by:abc"] }, "share").ok).toBe(false);
  });
});

describe("recognising a missing accounts table", () => {
  it("catches Postgres 42P01 and PostgREST PGRST205 for our tables", () => {
    expect(isSetupNeededError({ code: "42P01", message: 'relation "public.accounts" does not exist' })).toBe(true);
    expect(isSetupNeededError({ code: "PGRST205", message: "Could not find the table 'public.account_links' in the schema cache" })).toBe(true);
    expect(isSetupNeededError({ code: "PGRST205", message: "Could not find the table 'public.shared_items' in the schema cache" })).toBe(true);
  });
  it("does not mistake other errors, or other tables, for it", () => {
    expect(isSetupNeededError({ code: "23505", message: "duplicate key value violates unique constraint accounts_email_unique" })).toBe(false);
    expect(isSetupNeededError({ code: "42P01", message: 'relation "public.feature_requests" does not exist' })).toBe(false);
    expect(isSetupNeededError(new Error("network down"))).toBe(false);
    expect(isSetupNeededError(null)).toBe(false);
  });
  it("explains the one database step", () => {
    const body = setupNeededBody();
    expect(body.setupNeeded).toBe(true);
    expect(body.error).toMatch(/Accounts need one database step: apply supabase\/migrations\/202610040001_accounts_links_sharing\.sql/);
  });
});

describe("what the browser may see of an account", () => {
  it("never includes the password hash", () => {
    const shown = publicAccount({ id: "1", email: "a@b.co", display_name: "A", role: "student", under_13: true, password_hash: "secret" });
    expect(shown).toEqual({ id: "1", email: "a@b.co", displayName: "A", role: "student", under13: true });
    expect(publicAccount(null)).toBeNull();
  });
});
