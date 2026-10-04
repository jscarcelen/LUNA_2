/**
 * Who is making this request?
 *
 * `ownerUserIdFor(request)` is the one place the server decides whose data a request touches:
 *   - a valid session cookie  -> that account's id (the real platform, `/platform`)
 *   - anything else           -> the demo owner (the public demo, `/app`, exactly as before)
 *
 * A browser that is logged in AND looking at the demo (`/app`) is treated as the demo: the page's
 * Referer is checked, so the demo can never read or write a real account's workspace by accident.
 * That check can only ever move a request towards the shared demo owner, never towards an account, so
 * a forged Referer gains nothing. The account id comes from the signed cookie only — never from the
 * request body or query.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import {
  SESSION_COOKIE,
  SessionConfigError,
  clearSessionCookie,
  parseCookieHeader,
  resolveSessionSecret,
  serializeSessionCookie,
  signSession,
  verifySession
} from "./accountsCore.js";
import { getDemoOwnerUserId } from "./supabaseClient.js";

const headerOf = (request, name) => (typeof request?.headers?.get === "function" ? request.headers.get(name) : request?.headers?.[name]) || "";

/** Was this request made by the demo page (`/app`)? */
export function isDemoSurface(request) {
  const referer = String(headerOf(request, "referer") || "");
  if (!referer) return false;
  try {
    const path = new URL(referer).pathname;
    return path === "/app" || path.startsWith("/app/");
  } catch {
    return false;
  }
}

/** The verified session of a request, or null. Never throws: a missing production secret means "nobody is logged in". */
export function sessionFromRequest(request) {
  try {
    const token = parseCookieHeader(headerOf(request, "cookie"))[SESSION_COOKIE];
    if (!token) return null;
    return verifySession(token, resolveSessionSecret());
  } catch (error) {
    if (error instanceof SessionConfigError) return null;
    return null;
  }
}

/** The account id of the logged-in user, or "" (also "" on the demo surface). */
export function accountIdFor(request) {
  if (isDemoSurface(request)) return "";
  return sessionFromRequest(request)?.accountId || "";
}

/** Session account id, else the demo owner. */
export function ownerUserIdFor(request) {
  return accountIdFor(request) || getDemoOwnerUserId();
}

/** Is this request acting as a real account (not the demo)? */
export function isAccountRequest(request) {
  return Boolean(accountIdFor(request));
}

const ownerScope = new AsyncLocalStorage();

/**
 * Runs `work` with the request's owner pinned for everything it awaits — including a streamed response
 * created inside it, which keeps running after the handler has returned (the request headers may no
 * longer be readable by then). Streaming routes wrap their handler body in this.
 */
export function runAsOwner(ownerUserId, work) {
  return ownerScope.run(ownerUserId, work);
}

/**
 * Same as `ownerUserIdFor`, for deep server code that has no `request` (the AI pipeline): reads the
 * ambient request headers Next keeps for the current request, and falls back to the demo owner
 * anywhere that is not a request (unit tests, scripts).
 */
export async function currentOwnerUserId() {
  const scoped = ownerScope.getStore();
  if (scoped) return scoped;
  try {
    const { headers } = await import("next/headers");
    return ownerUserIdFor({ headers: await headers() });
  } catch {
    return getDemoOwnerUserId();
  }
}

const isSecure = (request) => process.env.NODE_ENV === "production" || String(headerOf(request, "x-forwarded-proto")).split(",")[0].trim() === "https";

/** The `Set-Cookie` value that logs `accountId` in. Throws SessionConfigError if production has no secret. */
export function sessionCookieFor(accountId, request) {
  return serializeSessionCookie(signSession(accountId, resolveSessionSecret()), { secure: isSecure(request) });
}

export function loggedOutCookie(request) {
  return clearSessionCookie({ secure: isSecure(request) });
}
