/**
 * GET  /api/accounts/linked/reviews?accountId=<student>  — the review requests of a student the caller is connected to (teacher or parent).
 * POST /api/accounts/linked/reviews { id, correct, note } — a teacher confirms or overrides the mark. Parents can only read.
 */
import { errorResponse, json, rejectCrossSite, rejectUnconfigured, requireAccount } from "../../../../../lib/accountsApi.js";
import { MARK_REVIEWS_MIGRATION, ReviewError, decideReview, isReviewsTableMissing, listStudentReviews } from "../../../../../lib/markReviewsRepository.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const setup = () => json({ error: "Reviews are not switched on yet.", setupNeeded: true, migration: MARK_REVIEWS_MIGRATION }, 503);

export async function GET(request) {
  const blocked = rejectUnconfigured();
  if (blocked) return blocked;
  try {
    const found = await requireAccount(request);
    if (found.response) return found.response;
    return json({ reviews: await listStudentReviews(found.account, new URL(request.url).searchParams.get("accountId") || "") });
  } catch (error) {
    if (error instanceof ReviewError) return json({ error: error.message }, error.status);
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
    const body = await request.json().catch(() => ({}));
    return json({ review: await decideReview(found.account, body?.id, { correct: body?.correct, note: body?.note }) });
  } catch (error) {
    if (error instanceof ReviewError) return json({ error: error.message }, error.status);
    if (isReviewsTableMissing(error)) return setup();
    return errorResponse(error);
  }
}
