/**
 * GET  /api/accounts/guardian/consent?token=…   → { studentName } for a live link, 404 otherwise (does not use the link up)
 * POST /api/accounts/guardian/consent           Body: { token, action: "consent" | "refuse", guardianName, guardianPassword,
 *                                                       guardianPasswordConfirm, studentEmail, studentPassword, accept: true }
 * Consenting creates the child's account and the guardian's own parent account (or uses the existing one), connects
 * them and deletes the request. Refusing deletes the request.
 */
import { createRateLimiter } from "../../../../../lib/accountsCore.js";
import { GuardianError, completeGuardianConsent, peekGuardianRequest, refuseGuardianRequest } from "../../../../../lib/guardianConsent.js";
import { clientIp, errorResponse, json, rejectCrossSite, rejectUnconfigured, rejectUnlessLegalReady } from "../../../../../lib/accountsApi.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = createRateLimiter({ limit: 30, windowMs: 60 * 60 * 1000 });

export async function GET(request) {
  const blocked = rejectUnconfigured() || (await rejectUnlessLegalReady());
  if (blocked) return blocked;
  const ip = clientIp(request);
  if (limiter.isBlocked(ip)) return json({ error: "Too many requests." }, 429);
  limiter.fail(ip);
  try {
    const found = await peekGuardianRequest(new URL(request.url).searchParams.get("token"));
    return found ? json({ studentName: found.studentName }) : json({ error: "This link has expired or was already used." }, 404);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  const blocked = rejectCrossSite(request) || rejectUnconfigured() || (await rejectUnlessLegalReady());
  if (blocked) return blocked;
  const ip = clientIp(request);
  if (limiter.isBlocked(ip)) return json({ error: "Too many requests." }, 429);
  limiter.fail(ip);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Send JSON." }, 400);
  }
  try {
    if (body?.action === "refuse") {
      await refuseGuardianRequest(body?.token);
      return json({ ok: true, refused: true });
    }
    if (body?.accept !== true) return json({ error: "Tick the box to confirm you are the parent or legal guardian and consent." }, 400);
    const done = await completeGuardianConsent(body?.token, body);
    return json({ ok: true, createdGuardian: done.createdGuardian, guardianEmail: done.guardian.email, studentEmail: done.student.email });
  } catch (error) {
    if (error instanceof GuardianError) return json({ error: error.message, code: error.code }, error.status);
    return errorResponse(error);
  }
}
