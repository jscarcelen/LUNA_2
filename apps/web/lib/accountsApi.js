/**
 * Small helpers the /api/accounts/* route handlers share: the session -> account step, same-origin
 * checks, and one place that turns errors into responses (a missing table becomes `setupNeeded`).
 */
import { NextResponse } from "next/server";
import { LinkError, SHARING_MIGRATION, SessionConfigError, VERIFICATION_MIGRATION, isSameOrigin, isSetupNeededError, setupNeededBody } from "./accountsCore.js";
import { findAccountById, supportsVerification } from "./accountsRepository.js";
import { freshSessionFromRequest, loggedOutCookie } from "./session.js";
import { isSupabaseConfigured } from "./supabaseClient.js";

export const json = (body, status = 200) => NextResponse.json(body, { status });

export function clientIp(request) {
  return String(request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || String(request.headers.get("x-real-ip") || "") || "unknown";
}

/** Run before anything that changes state. */
export function rejectCrossSite(request) {
  return isSameOrigin(request.headers) ? null : json({ error: "Cross-site requests are not allowed." }, 403);
}

export function rejectUnconfigured() {
  return isSupabaseConfigured() ? null : json({ error: "Supabase is not configured (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY).", hint: "Accounts are stored in Supabase." }, 500);
}

/**
 * For routes that only exist with the verification migration (confirm email, reset password, settings,
 * notifications): answers `503 setupNeeded` naming that migration while it is not applied.
 * @returns {Promise<Response | null>}
 */
export async function rejectUnlessVerificationReady() {
  return (await supportsVerification()) ? null : json(setupNeededBody(VERIFICATION_MIGRATION), 503);
}

/**
 * @returns {Promise<{ account: object } | { response: Response }>} the logged-in account row, or the 401 to send.
 * A session issued before the account's last password change is refused (and its cookie cleared).
 */
export async function requireAccount(request) {
  const session = await freshSessionFromRequest(request);
  const account = session ? await findAccountById(session.accountId) : null;
  if (!account) {
    const response = json({ error: "Please log in.", account: null }, 401);
    response.headers.append("Set-Cookie", loggedOutCookie(request));
    return { response };
  }
  return { account };
}

export function errorResponse(error) {
  if (isSetupNeededError(error)) {
    const message = String(error?.message || "");
    return json(setupNeededBody(/account_tokens/.test(message) ? VERIFICATION_MIGRATION : /share_grants/.test(message) ? SHARING_MIGRATION : undefined), 503);
  }
  // The sharing migration is not applied yet: a clear 503 that names it.
  if (error instanceof LinkError && error.setup) return json({ ...error.setup, error: error.message, code: error.code }, 503);
  if (error instanceof LinkError) return json({ error: error.message, code: error.code }, error.status);
  if (error instanceof SessionConfigError) return json({ error: error.message }, 500);
  console.error("[api/accounts]", error);
  return json({ error: "Something went wrong. Please try again." }, 500);
}
