/**
 * The owner's side of the beta feedback tool (TEMPORARY: see lib/feedbackCore.js). Every call needs the owner's key
 * (env LUNA_FEEDBACK_ADMIN_KEY) in the x-feedback-key header; with no key configured the whole thing is off.
 *
 * GET    /api/feedback/admin                -> { items }            (no screenshots, newest first)
 * GET    /api/feedback/admin?image=<id>     -> the screenshot as an image
 * PATCH  /api/feedback/admin  { ids, status?, note? }
 * DELETE /api/feedback/admin  { ids }
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { createRateLimiter } from "../../../../lib/accountsCore.js";
import { clientIp, json, rejectCrossSite, rejectUnconfigured } from "../../../../lib/accountsApi.js";
import { FEEDBACK_MIGRATION } from "../../../../lib/feedbackCore.js";
import { deleteFeedback, feedbackScreenshot, isFeedbackTableMissing, listFeedback, updateFeedback } from "../../../../lib/feedbackRepository.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const wrongKeys = createRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });
const digest = (value) => createHash("sha256").update(String(value)).digest();

/** null when the key is right, otherwise the response to send. */
function guard(request) {
  const expected = process.env.LUNA_FEEDBACK_ADMIN_KEY || "";
  if (!expected) return json({ error: "The feedback board is off: set LUNA_FEEDBACK_ADMIN_KEY on the server.", notConfigured: true }, 503);
  const ip = clientIp(request);
  if (wrongKeys.isBlocked(ip)) return json({ error: "Too many wrong keys. Try again in a few minutes." }, 429);
  const given = request.headers.get("x-feedback-key") || "";
  if (!given || !timingSafeEqual(digest(given), digest(expected))) {
    wrongKeys.fail(ip);
    return json({ error: "That key is not right." }, 401);
  }
  return null;
}

function failure(error) {
  if (isFeedbackTableMissing(error)) return json({ error: `Apply ${FEEDBACK_MIGRATION} in Supabase first.`, setupNeeded: true, migration: FEEDBACK_MIGRATION }, 503);
  return json({ error: "Something went wrong reading the feedback." }, 500);
}

export async function GET(request) {
  const unconfigured = rejectUnconfigured();
  if (unconfigured) return unconfigured;
  const denied = guard(request);
  if (denied) return denied;
  try {
    const image = new URL(request.url).searchParams.get("image");
    if (image) {
      const url = /^[0-9a-f-]{36}$/i.test(image) ? await feedbackScreenshot(image) : "";
      const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(url);
      if (!match) return json({ error: "No screenshot." }, 404);
      return new Response(Buffer.from(match[2], "base64"), { headers: { "Content-Type": match[1], "Cache-Control": "private, max-age=3600" } });
    }
    return json({ items: await listFeedback() });
  } catch (error) {
    return failure(error);
  }
}

async function bodyOf(request) {
  try { return await request.json(); } catch { return null; }
}

export async function PATCH(request) {
  const blocked = rejectCrossSite(request) || rejectUnconfigured() || guard(request);
  if (blocked) return blocked;
  const body = await bodyOf(request);
  if (!body) return json({ error: "Send JSON." }, 400);
  try {
    return json({ ok: true, updated: await updateFeedback(body.ids, { status: body.status, note: body.note }) });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request) {
  const blocked = rejectCrossSite(request) || rejectUnconfigured() || guard(request);
  if (blocked) return blocked;
  const body = await bodyOf(request);
  if (!body) return json({ error: "Send JSON." }, 400);
  try {
    return json({ ok: true, deleted: await deleteFeedback(body.ids) });
  } catch (error) {
    return failure(error);
  }
}
