/**
 * POST /api/feedback — a tester sends one piece of feedback from inside the app (beta tool, TEMPORARY: see lib/feedbackCore.js).
 * Works for the public demo and for signed-in accounts; whose it is comes only from the session (ownerUserIdForFresh).
 */
import { createRateLimiter } from "../../../lib/accountsCore.js";
import { json, rejectCrossSite, rejectUnconfigured, clientIp } from "../../../lib/accountsApi.js";
import { FEEDBACK_MIGRATION, sanitizeFeedback } from "../../../lib/feedbackCore.js";
import { insertFeedback, isFeedbackTableMissing } from "../../../lib/feedbackRepository.js";
import { accountIdForFresh, ownerUserIdForFresh } from "../../../lib/session.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sendLimiter = createRateLimiter({ limit: 30, windowMs: 60 * 60 * 1000 });

export async function POST(request) {
  const blocked = rejectCrossSite(request) || rejectUnconfigured();
  if (blocked) return blocked;
  const ip = clientIp(request);
  if (sendLimiter.isBlocked(ip)) return json({ error: "That is a lot of feedback for one hour. Thank you — please try again a little later." }, 429);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Send JSON." }, 400);
  }
  const clean = sanitizeFeedback(body);
  if (clean.error) return json({ error: clean.error }, 400);
  try {
    const signedIn = Boolean(await accountIdForFresh(request));
    const created = await insertFeedback(clean.row, { ownerUserId: await ownerUserIdForFresh(request), signedIn });
    sendLimiter.fail(ip);
    return json({ ok: true, id: created.id });
  } catch (error) {
    if (isFeedbackTableMissing(error)) return json({ error: `Feedback is not switched on yet (the owner needs to apply ${FEEDBACK_MIGRATION}).`, setupNeeded: true, migration: FEEDBACK_MIGRATION }, 503);
    return json({ error: "Could not save your feedback. Please try again." }, 500);
  }
}
