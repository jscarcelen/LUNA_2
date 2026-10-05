/**
 * POST /api/accounts/password-reset/request   Body: { email }
 * Always the same neutral answer, whether or not the email has an account. Rate limited per email and per
 * address (the limit counts every request, so hitting it says nothing about the account either). With no
 * email provider in production it answers `mailSetupNeeded` for every email alike and sends nothing.
 */
import { isValidEmail, normalizeEmail } from "../../../../../lib/accountsCore.js";
import { limits } from "../../../../../lib/accountLimits.js";
import { startPasswordReset } from "../../../../../lib/accountFlows.js";
import { clientIp, errorResponse, json, rejectCrossSite, rejectUnconfigured, rejectUnlessVerificationReady } from "../../../../../lib/accountsApi.js";
import { isMailConfigured, publicBaseUrl } from "../../../../../lib/mailer.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const byEmail = limits.resetByEmail;
const byAddress = limits.resetByAddress;
const NEUTRAL = "If that email has an account, we sent a link to reset the password. It works for one hour.";

export async function POST(request) {
  const blocked = rejectCrossSite(request) || rejectUnconfigured() || (await rejectUnlessVerificationReady());
  if (blocked) return blocked;
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Send JSON." }, 400);
  }
  const email = normalizeEmail(body?.email);
  if (!isValidEmail(email)) return json({ error: "Enter a valid email address." }, 400);
  const ip = clientIp(request);
  if (byEmail.isBlocked(email) || byAddress.isBlocked(ip)) return json({ error: "Too many requests. Try again in an hour." }, 429);
  byEmail.fail(email);
  byAddress.fail(ip);

  // Same answer for every email: decided before looking anything up.
  if (process.env.NODE_ENV === "production" && !isMailConfigured()) {
    return json({ error: "Email is not set up yet, so password reset emails cannot be sent. Ask the person who runs this Luna to configure email.", mailSetupNeeded: true }, 503);
  }
  try {
    const outcome = await startPasswordReset(email, publicBaseUrl(request));
    return json({ ok: true, message: NEUTRAL, ...(outcome?.devPreview ? { devPreview: outcome.devPreview } : {}) });
  } catch (error) {
    // Do not let a failure be the thing that tells a stranger the account exists.
    if (error?.code === "PGRST205" || error?.code === "42P01") return errorResponse(error);
    console.warn("[api/accounts/password-reset] could not start a reset:", error?.message || error);
    return json({ ok: true, message: NEUTRAL });
  }
}
