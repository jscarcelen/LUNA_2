/**
 * Accounts — the pure logic (no database, no Next): email and password rules, password hashing,
 * signed session tokens, cookies, the rules of linking two accounts, who may send what to whom,
 * and how a missing table is recognised. Everything here is unit tested (tests/accounts).
 */
import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { classifyDeliverable } from "../modules/accounts/shared.js";

export { classifyDeliverable };

/* ------------------------------------------------------------------ constants */

export const ROLES = ["student", "teacher", "parent"];
/** `peer` is every other pair (student-student, teacher-teacher, parent-teacher, ...): it shares what is explicitly shared and nothing else. */
export const LINK_KINDS = ["teacher_student", "parent_student", "peer"];
export const LINK_STATUSES = ["pending", "accepted", "declined", "revoked"];
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;
export const SESSION_COOKIE = "luna_session";
export const SESSION_TTL_SECONDS = 14 * 24 * 60 * 60;
export const ACCOUNTS_MIGRATION = "supabase/migrations/202610040001_accounts_links_sharing.sql";
export const VERIFICATION_MIGRATION = "supabase/migrations/202610050001_account_verification_phone_tokens.sql";
export const SHARING_MIGRATION = "supabase/migrations/202610060001_network_sharing_grants.sql";
export const GROUPS_MIGRATION = "supabase/migrations/202610070001_groups_exam_dates.sql";
export const DECLINE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const TOKEN_KINDS = ["verify_email", "reset_password"];
export const TOKEN_TTL_MS = { verify_email: 48 * 60 * 60 * 1000, reset_password: 60 * 60 * 1000 };
const DEV_SESSION_SECRET = "luna-dev-session-secret-not-for-production";

/* ------------------------------------------------------------------ input rules */

/** Emails are compared lowercase and trimmed everywhere. */
export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function isValidEmail(email) {
  const value = normalizeEmail(email);
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

export function normalizeDisplayName(name) {
  return String(name || "").replace(/\s+/g, " ").trim().slice(0, 80);
}

export function isRole(role) {
  return ROLES.includes(role);
}

/** @returns {{ ok: boolean, error?: string }} */
export function validatePassword(password, email = "") {
  const value = String(password || "");
  if (value.length < MIN_PASSWORD_LENGTH) return { ok: false, error: `Use at least ${MIN_PASSWORD_LENGTH} characters for the password.` };
  if (value.length > MAX_PASSWORD_LENGTH) return { ok: false, error: `Use at most ${MAX_PASSWORD_LENGTH} characters for the password.` };
  if (email && value.toLowerCase() === normalizeEmail(email)) return { ok: false, error: "The password cannot be your email." };
  return { ok: true };
}

/**
 * Sign-up and reset forms ask for the password twice. Compared exactly (no trimming: a space is part of a
 * password), after the usual length rules.
 * @returns {{ ok: boolean, error?: string }}
 */
export function validatePasswordPair(password, confirm, email = "") {
  const rules = validatePassword(password, email);
  if (!rules.ok) return rules;
  if (typeof confirm !== "string" || confirm !== String(password)) return { ok: false, error: "The two passwords do not match." };
  return { ok: true };
}

/**
 * Has this account proved it owns its email? Rows from a database that has not had the verification
 * migration yet have no such column (`undefined`): there verification cannot exist, so they count as
 * verified and nothing is blocked. `null` means "not verified yet".
 */
export function isEmailVerified(row) {
  if (!row || typeof row !== "object") return false;
  const value = row.email_verified_at !== undefined ? row.email_verified_at : row.emailVerifiedAt;
  return value === undefined ? true : Boolean(value);
}

/** Link and share actions need a confirmed email. */
export function assertEmailVerified(row, what = "do this") {
  if (!isEmailVerified(row)) throw new LinkError("email_unverified", `Confirm your email first to ${what}. We sent you a link; you can ask for another one from the banner at the top.`, 403);
}

/** Did this database error come from a column of the verification migration not existing yet? */
export function isMissingColumnError(error) {
  if (!error) return false;
  const code = String(error.code || "");
  const message = String(error.message || error.details || "").toLowerCase();
  if (code !== "42703" && code !== "PGRST204" && code !== "PGRST200" && !message.includes("does not exist") && !message.includes("could not find")) return false;
  return /email_verified_at|phone|password_changed_at|notifications_seen_at|pending_invites|notified_at|accepted_notified_at/.test(message);
}

/* ------------------------------------------------------------------ password hashing */

const SCRYPT = { N: 16384, r: 8, p: 1, keyLength: 64 };

function scryptAsync(password, salt, keyLength, options) {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

/** `scrypt$N$r$p$salt$hash` — everything needed to verify later, so the cost can be raised without a migration. */
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(String(password), salt, SCRYPT.keyLength, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 });
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const N = Number(n);
  const R = Number(r);
  const P = Number(p);
  // A tampered row must not be able to ask for an absurd amount of memory.
  if (!Number.isInteger(N) || N < 1024 || N > 131072 || (N & (N - 1)) !== 0 || !Number.isInteger(R) || R < 1 || R > 16 || !Number.isInteger(P) || P < 1 || P > 4) return false;
  try {
    const expected = Buffer.from(hashB64, "base64");
    if (!expected.length) return false;
    const actual = await scryptAsync(String(password), Buffer.from(saltB64, "base64"), expected.length, { N, r: R, p: P, maxmem: 128 * N * R * 2 + 1024 * 1024 });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

let dummyHashPromise;
/** Verifying against this takes as long as a real check, so "no such account" and "wrong password" cost the same. */
export async function burnPasswordCheck(password) {
  dummyHashPromise = dummyHashPromise || hashPassword("luna-timing-equaliser");
  await verifyPassword(password, await dummyHashPromise);
  return false;
}

/* ------------------------------------------------------------------ sessions */

export class SessionConfigError extends Error {}

/**
 * The secret that signs session cookies. `LUNA_SESSION_SECRET` (32+ characters) is required in
 * production; elsewhere a fixed development value is used so `npm run dev` just works.
 */
export function resolveSessionSecret(env = process.env) {
  const configured = String(env.LUNA_SESSION_SECRET || "");
  if (configured) {
    if (configured.length < 32) throw new SessionConfigError("LUNA_SESSION_SECRET must be at least 32 characters.");
    return configured;
  }
  if (env.NODE_ENV === "production") throw new SessionConfigError("LUNA_SESSION_SECRET is not set. Set it (32+ random characters) before using accounts in production.");
  return DEV_SESSION_SECRET;
}

const b64u = (buffer) => Buffer.from(buffer).toString("base64url");
const hmac = (body, secret) => createHmac("sha256", secret).update(body).digest();

/** A token is `v1.<payload>.<signature>`; the payload says who and until when, the signature says we wrote it. */
export function signSession(accountId, secret, { now = Date.now(), ttlSeconds = SESSION_TTL_SECONDS } = {}) {
  const issuedAt = Math.floor(now / 1000);
  const body = b64u(JSON.stringify({ sub: String(accountId), iat: issuedAt, exp: issuedAt + ttlSeconds }));
  return `v1.${body}.${b64u(hmac(`v1.${body}`, secret))}`;
}

/** @returns {{ accountId: string, issuedAt: number, expiresAt: number } | null} null for anything that is not a live, untampered token. */
export function verifySession(token, secret, { now = Date.now() } = {}) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  const [version, body, signature] = parts;
  let given;
  try {
    given = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  const expected = hmac(`${version}.${body}`, secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload?.sub || typeof payload.exp !== "number" || payload.exp * 1000 <= now) return null;
    return { accountId: String(payload.sub), issuedAt: Number(payload.iat) || 0, expiresAt: payload.exp };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ cookies */

export function parseCookieHeader(header) {
  const jar = {};
  for (const piece of String(header || "").split(";")) {
    const index = piece.indexOf("=");
    if (index < 0) continue;
    const name = piece.slice(0, index).trim();
    if (!name || name in jar) continue;
    try {
      jar[name] = decodeURIComponent(piece.slice(index + 1).trim());
    } catch {
      jar[name] = piece.slice(index + 1).trim();
    }
  }
  return jar;
}

export function serializeSessionCookie(token, { secure = false, maxAge = SESSION_TTL_SECONDS } = {}) {
  return [`${SESSION_COOKIE}=${encodeURIComponent(token)}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAge}`, ...(secure ? ["Secure"] : [])].join("; ");
}

export function clearSessionCookie({ secure = false } = {}) {
  return [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0", "Expires=Thu, 01 Jan 1970 00:00:00 GMT", ...(secure ? ["Secure"] : [])].join("; ");
}

/**
 * A state-changing request must come from this site. Browsers always send Origin on cross-site POSTs;
 * a request without one (curl, server-side) is not a cross-site browser request and is let through.
 */
export function isSameOrigin(headers) {
  const get = (name) => (typeof headers?.get === "function" ? headers.get(name) : headers?.[name]) || "";
  const origin = String(get("origin") || "");
  if (!origin) return true;
  const host = String(get("x-forwarded-host") || get("host") || "");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ rate limiting */

/**
 * A small in-memory limiter (per server instance — a best-effort brake, not a guarantee, on serverless).
 * `fail` records an event, `isBlocked` says whether the key has used up its `limit` within `windowMs`.
 */
export function createRateLimiter({ limit, windowMs, now = () => Date.now() }) {
  const events = new Map();
  const recent = (key) => {
    const cutoff = now() - windowMs;
    const list = (events.get(key) || []).filter((time) => time > cutoff);
    if (list.length) events.set(key, list);
    else events.delete(key);
    return list;
  };
  return {
    isBlocked: (key) => recent(key).length >= limit,
    /** Events recorded for the key within the window. */
    count: (key) => recent(key).length,
    /** How many more events fit before the key is blocked. */
    remaining: (key) => Math.max(0, limit - recent(key).length),
    fail(key) {
      const list = recent(key);
      list.push(now());
      events.set(key, list);
      if (events.size > 5000) for (const stale of [...events.keys()].slice(0, 1000)) recent(stale);
      return list.length;
    },
    retryAfterMs(key) {
      const list = recent(key);
      return list.length >= limit ? Math.max(0, list[0] + windowMs - now()) : 0;
    },
    reset: (key) => { events.delete(key); },
    clear: () => { events.clear(); }
  };
}

/* ------------------------------------------------------------------ linking */

export class LinkError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * The relation between two accounts, decided by their roles. Teacher+student and parent+student keep their
 * role-specific powers (assigning work, seeing the student's performance); every other pair - student and
 * student, teacher and teacher, parent and teacher, parent and parent - is a `peer` connection that exposes
 * nothing but what is explicitly shared. Anyone can connect with anyone. Unknown roles give null.
 */
export function kindForRoles(roleA, roleB) {
  if (!isRole(roleA) || !isRole(roleB)) return null;
  const pair = [roleA, roleB].sort().join("+");
  if (pair === "student+teacher") return "teacher_student";
  if (pair === "parent+student") return "parent_student";
  return "peer";
}

/** The kind to store for a request to someone who has no (confirmed) account yet: from the role the requester hinted at, else peer. It is settled from the real roles when they sign up. */
export function kindForRequest(requesterRole, hintedRole) {
  return (isRole(hintedRole) && kindForRoles(requesterRole, hintedRole)) || "peer";
}

/** Which roles may an account of this role ask? Any: the network is open. */
export function relationsFor(role) {
  return isRole(role) ? [...ROLES] : [];
}

/**
 * Does this link give a teacher/parent the right to assign work to a student and to follow the student's
 * performance? Only the two role-specific kinds, between the right roles. A peer connection never does.
 */
export function hasGuardianPowers(link, guardianRole, studentRole) {
  if (!link || link.status !== "accepted") return false;
  if (studentRole !== "student" || (guardianRole !== "teacher" && guardianRole !== "parent")) return false;
  return (link.kind === "teacher_student" || link.kind === "parent_student") && kindForRoles(guardianRole, studentRole) === link.kind;
}

/** One row per pair and kind, whoever asked first: built from the two (unique) emails. */
export function pairKey(kind, emailA, emailB) {
  return `${kind}:${[normalizeEmail(emailA), normalizeEmail(emailB)].sort().join("|")}`;
}

/**
 * What to do when `requesterId` asks to link and a row for that pair may already exist.
 * @returns {{ type: "create" | "reopen" | "accept_existing" | "already_pending" | "already_linked" | "cooldown" }}
 */
export function decideLinkRequest(existing, requesterId, now = Date.now()) {
  if (!existing) return { type: "create" };
  if (existing.status === "accepted") return { type: "already_linked" };
  if (existing.status === "pending") return { type: existing.requesterId === requesterId ? "already_pending" : "accept_existing" };
  if (existing.status === "declined" && existing.requesterId === requesterId && existing.respondedAt && now - new Date(existing.respondedAt).getTime() < DECLINE_COOLDOWN_MS) return { type: "cooldown" };
  return { type: "reopen" };
}

/**
 * The link state machine. Both sides must agree: only the person asked can accept or decline, only the
 * person who asked can cancel, and either side can end an accepted link.
 *   pending --accept--> accepted      pending --decline--> declined      pending --cancel--> revoked
 *   accepted --remove--> revoked      (declined and revoked can be re-requested, see decideLinkRequest)
 */
export function transitionLink(link, actorId, action) {
  const isRequester = link.requesterId === actorId;
  const isTarget = Boolean(link.targetId) && link.targetId === actorId;
  if (!isRequester && !isTarget) throw new LinkError("forbidden", "That connection is not yours.", 403);
  if (action === "accept" || action === "decline") {
    if (link.status !== "pending") throw new LinkError("not_pending", "That request is no longer open.", 409);
    if (!isTarget) throw new LinkError("forbidden", "Only the person who was asked can answer a request.", 403);
    return action === "accept" ? "accepted" : "declined";
  }
  if (action === "cancel") {
    if (link.status !== "pending") throw new LinkError("not_pending", "That request is no longer open.", 409);
    if (!isRequester) throw new LinkError("forbidden", "Only the person who asked can cancel a request.", 403);
    return "revoked";
  }
  if (action === "remove") {
    if (link.status !== "accepted") throw new LinkError("not_linked", "You are not connected.", 409);
    return "revoked";
  }
  throw new LinkError("bad_action", "Unknown action.", 400);
}

/**
 * Does the kind stored with a by-email request match the real roles once the person exists? When it does
 * not, the kind is settled from the real roles (a teacher who asked for a "student" email that turned out to
 * be a parent becomes a peer connection: no student powers).
 */
export function linkFitsAccounts(kind, requesterRole, targetRole) {
  return kindForRoles(requesterRole, targetRole) === kind;
}

/* ------------------------------------------------------------------ sending things */

/**
 * May `sender` send something to `recipient`? Needs an accepted link between exactly these two accounts.
 * Anyone linked can SHARE (whatever the kind of connection); only a teacher or parent can ASSIGN, only to a
 * student, and only over a teacher_student / parent_student link (never a peer connection).
 * @returns {{ ok: true } | { ok: false, status: number, error: string }}
 */
export function authorizeDelivery({ mode, sender, recipient, link }) {
  const deny = (status, error) => ({ ok: false, status, error });
  if (!sender?.id || !recipient?.id) return deny(404, "That person was not found.");
  if (sender.id === recipient.id) return deny(400, "Choose someone else to send this to.");
  const ends = new Set([link?.requesterId, link?.targetId]);
  if (!link || link.status !== "accepted" || !ends.has(sender.id) || !ends.has(recipient.id)) return deny(403, "You can only send to accounts you are connected to (the connection must be accepted by both sides).");
  if (mode !== "share" && mode !== "assign") return deny(400, "Unknown way of sending.");
  if (mode === "assign") {
    if (!((sender.role === "teacher" || sender.role === "parent") && recipient.role === "student")) return deny(403, "Only a teacher or parent can assign work, and only to a student.");
    if (!hasGuardianPowers(link, sender.role, recipient.role)) return deny(403, "You can only assign work to a student you are connected to as their teacher or parent.");
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ setup detection */

const OUR_TABLES = /(^|[^a-z_])(accounts|account_links|shared_items|account_tokens|share_grants|account_groups|account_group_members|exam_dates|exam_date_plans)([^a-z_]|$)/;

/** Did this database error come from the accounts migration not having been applied yet? */
export function isSetupNeededError(error) {
  if (!error) return false;
  const code = String(error.code || "");
  const message = String(error.message || error.details || "").toLowerCase();
  return (code === "42P01" || code === "PGRST205" || code === "PGRST200") && OUR_TABLES.test(message);
}

export function setupNeededBody(migration = ACCOUNTS_MIGRATION) {
  return {
    error: `Accounts need one database step: apply ${migration} (Supabase SQL editor or MCP apply_migration), then reload.`,
    setupNeeded: true,
    migration
  };
}

/* ------------------------------------------------------------------ shapes sent to the browser */

/** The account as the browser may see it (never the hash). */
export function publicAccount(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name ?? row.displayName,
    role: row.role,
    under13: Boolean(row.under_13 ?? row.under13)
  };
}

/**
 * The account as its OWNER may see it: the public shape plus the private bits (phone, whether the email and
 * phone are confirmed). Never use this for someone else's account.
 */
export function ownAccount(row) {
  if (!row) return null;
  return {
    ...publicAccount(row),
    phone: row.phone || "",
    phoneVerified: Boolean(row.phone_verified_at),
    emailVerified: isEmailVerified(row)
  };
}
