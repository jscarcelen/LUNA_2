/**
 * Small helpers the /api/accounts/* route handlers share: the session -> account step, same-origin
 * checks, and one place that turns errors into responses (a missing table becomes `setupNeeded`).
 */
import { NextResponse } from "next/server";
import { LinkError, SessionConfigError, isSameOrigin, isSetupNeededError, setupNeededBody } from "./accountsCore.js";
import { findAccountById } from "./accountsRepository.js";
import { loggedOutCookie, sessionFromRequest } from "./session.js";
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

/** @returns {Promise<{ account: object } | { response: Response }>} the logged-in account row, or the 401 to send. */
export async function requireAccount(request) {
  const session = sessionFromRequest(request);
  if (!session) return { response: json({ error: "Please log in.", account: null }, 401) };
  const account = await findAccountById(session.accountId);
  if (!account) {
    const response = json({ error: "Please log in.", account: null }, 401);
    response.headers.append("Set-Cookie", loggedOutCookie(request));
    return { response };
  }
  return { account };
}

export function errorResponse(error) {
  if (isSetupNeededError(error)) return json(setupNeededBody(), 503);
  if (error instanceof LinkError) return json({ error: error.message, code: error.code }, error.status);
  if (error instanceof SessionConfigError) return json({ error: error.message }, 500);
  console.error("[api/accounts]", error);
  return json({ error: "Something went wrong. Please try again." }, 500);
}
