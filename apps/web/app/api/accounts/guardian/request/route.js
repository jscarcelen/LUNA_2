/**
 * POST /api/accounts/guardian/request   Body: { studentName, birthDate (YYYY-MM-DD), guardianEmail }
 * A child under 14 cannot open an account alone: this stores only their first name + birth date + the guardian's
 * email (deleted after 48 h) and mails the guardian. The answer is the same whether or not the guardian has an
 * account. No IP address is stored; the in-memory limiter below is the only thing that sees it and forgets it.
 */
import { createRateLimiter } from "../../../../../lib/accountsCore.js";
import { GuardianError, requestGuardianConsent } from "../../../../../lib/guardianConsent.js";
import { clientIp, errorResponse, json, rejectCrossSite, rejectUnconfigured, rejectUnlessLegalReady } from "../../../../../lib/accountsApi.js";
import { publicBaseUrl } from "../../../../../lib/mailer.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = createRateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 });

export async function POST(request) {
  const blocked = rejectCrossSite(request) || rejectUnconfigured() || (await rejectUnlessLegalReady());
  if (blocked) return blocked;
  const ip = clientIp(request);
  if (limiter.isBlocked(ip)) return json({ error: "Too many requests from here. Try again later." }, 429);
  limiter.fail(ip);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Send JSON." }, 400);
  }
  try {
    const outcome = await requestGuardianConsent({ studentName: body?.studentName, birthDate: body?.birthDate, guardianEmail: body?.guardianEmail, baseUrl: publicBaseUrl(request) });
    return json({ ok: true, message: "We emailed your parent or guardian. Your account is created when they say yes.", ...outcome });
  } catch (error) {
    if (error instanceof GuardianError) return json({ error: error.message, code: error.code }, error.status);
    return errorResponse(error);
  }
}
