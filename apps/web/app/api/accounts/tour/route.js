/**
 * POST /api/accounts/tour
 * The signed-in account closed the first-run tour: remember it on the account (accounts.tour_seen_at), so it is not shown
 * again at the next login on any browser. Needs supabase/migrations/202610190001_account_tour_seen.sql; without it the
 * answer is `{ ok: true, stored: false }` and the browser keeps the flag in localStorage under the account id.
 */
import { markTourSeen } from "../../../../lib/accountsRepository.js";
import { errorResponse, json, rejectCrossSite, rejectUnconfigured, requireAccount } from "../../../../lib/accountsApi.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const blocked = rejectCrossSite(request) || rejectUnconfigured();
  if (blocked) return blocked;
  try {
    const found = await requireAccount(request);
    if (found.response) return found.response;
    const result = await markTourSeen(found.account.id);
    return json({ ok: true, stored: result.ready });
  } catch (error) {
    return errorResponse(error);
  }
}
