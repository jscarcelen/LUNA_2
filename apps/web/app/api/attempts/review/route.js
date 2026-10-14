/**
 * GET  /api/attempts/review?activityDocumentId=  — my review requests for one activity.
 * POST /api/attempts/review                      — ask my teacher to review one question's mark.
 * Needs a logged-in account: the review belongs to the session account, never to an id in the body.
 */
import { errorResponse, json, rejectCrossSite, rejectUnconfigured, requireAccount } from "../../../../lib/accountsApi.js";
import { MARK_REVIEWS_MIGRATION, ReviewError, isReviewsTableMissing, listOwnReviews, requestReview } from "../../../../lib/markReviewsRepository.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const setup = () => json({ error: "Reviews are not switched on yet.", setupNeeded: true, migration: MARK_REVIEWS_MIGRATION }, 503);

export async function GET(request) {
  const blocked = rejectUnconfigured();
  if (blocked) return blocked;
  try {
    const found = await requireAccount(request);
    if (found.response) return found.response;
    const reviews = await listOwnReviews(found.account.id, new URL(request.url).searchParams.get("activityDocumentId") || "");
    return json({ reviews });
  } catch (error) {
    if (isReviewsTableMissing(error)) return setup();
    return errorResponse(error);
  }
}

export async function POST(request) {
  const blocked = rejectCrossSite(request) || rejectUnconfigured();
  if (blocked) return blocked;
  try {
    const found = await requireAccount(request);
    if (found.response) return found.response;
    if (found.account.role !== "student") return json({ error: "Only a student can ask for a review." }, 403);
    const body = await request.json().catch(() => ({}));
    return json({ review: await requestReview(found.account.id, body || {}) });
  } catch (error) {
    if (error instanceof ReviewError) return json({ error: error.message }, error.status);
    if (isReviewsTableMissing(error)) return setup();
    return errorResponse(error);
  }
}
