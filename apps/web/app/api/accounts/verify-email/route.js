/**
 * POST /api/accounts/verify-email   Body: { token }
 * Uses the one-time link from the confirmation email up and marks the email as confirmed. No session is
 * needed (the token is the proof); the page shows a button so mail scanners that open links cannot use it up.
 * Confirming also attaches requests other people sent to this address and sends the requests typed at sign-up.
 */
import { limits } from "../../../../lib/accountLimits.js";
import { verifyEmailWithToken } from "../../../../lib/accountFlows.js";
import { clientIp, errorResponse, json, rejectCrossSite, rejectUnconfigured, rejectUnlessVerificationReady } from "../../../../lib/accountsApi.js";
import { publicBaseUrl } from "../../../../lib/mailer.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const byAddress = limits.verifyByAddress;

export async function POST(request) {
  const blocked = rejectCrossSite(request) || rejectUnconfigured() || (await rejectUnlessVerificationReady());
  if (blocked) return blocked;
  const ip = clientIp(request);
  if (byAddress.isBlocked(ip)) return json({ error: "Too many attempts. Try again in a few minutes." }, 429);
  byAddress.fail(ip);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Send JSON." }, 400);
  }
  try {
    const result = await verifyEmailWithToken(String(body?.token || ""), publicBaseUrl(request));
    if (!result.ok) return json({ error: "This link is invalid or has expired. Log in and ask for a new one from the banner at the top.", invalidLink: true }, 400);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
