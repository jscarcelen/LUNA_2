/**
 * POST /api/accounts/classes/check   Body: { code }
 * Sign-up pre-check, no account needed: is this class code valid, and does its class carry the school's consent for
 * under-14s? -> { valid, schoolConsent }. Never reveals the class or the teacher. Wrong codes are rate limited per
 * address (10 per 15 minutes). 503 setupNeeded until supabase/migrations/202610140001_class_codes.sql is applied.
 */
import { clientIp, errorResponse, json, rejectCrossSite, rejectUnconfigured } from "../../../../../lib/accountsApi.js";
import { checkClassCode } from "../../../../../lib/classesRepository.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const blocked = rejectCrossSite(request) || rejectUnconfigured();
  if (blocked) return blocked;
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Send JSON." }, 400);
    }
    return json(await checkClassCode(body?.code, { address: clientIp(request) }));
  } catch (error) {
    return errorResponse(error);
  }
}
