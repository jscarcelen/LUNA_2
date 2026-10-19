/**
 * Quiz drafts ("Save and finish later") for a logged-in account.
 *
 * GET    /api/activities/drafts[?activityDocumentId=]  -> { account: true, scope, drafts: [{ activityDocumentId, draft, answered, total, updatedAt }] }
 * POST   /api/activities/drafts  { activityDocumentId, draft } -> { saved: true, updatedAt }
 * DELETE /api/activities/drafts?activityDocumentId=   -> { deleted: true }
 *
 * Without a session (the public demo, a guest) the answer is { account: false, drafts: [] } and the browser keeps
 * the draft in localStorage. Before migration 202610190002_activity_drafts.sql is applied the answer carries
 * `setupNeeded: true` (status 200 for GET, so the player silently uses its browser copy). A draft is never an
 * attempt: nothing here touches attempts, attempt_results or the performance tracker.
 */
import { json, rejectCrossSite } from "../../../../lib/accountsApi.js";
import { accountIdForFresh } from "../../../../lib/session.js";
import { isSupabaseConfigured } from "../../../../lib/supabaseClient.js";
import { denyUnlessOwner } from "../../../../lib/resourceAccess.js";
import { ACTIVITY_DRAFTS_MIGRATION, DraftError, deleteDraft, isActivityDocumentId, isDraftsTableMissing, listDrafts, saveDraft } from "../../../../lib/activityDraftsRepository.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const setup = (status = 200) => json({ account: true, setupNeeded: true, migration: ACTIVITY_DRAFTS_MIGRATION, drafts: [] }, status);
const guest = () => json({ account: false, drafts: [] });

async function whoAsks(request) {
  if (!isSupabaseConfigured()) return "";
  return accountIdForFresh(request);
}

export async function GET(request) {
  const accountId = await whoAsks(request);
  if (!accountId) return guest();
  const activityDocumentId = String(new URL(request.url).searchParams.get("activityDocumentId") || "").trim();
  if (activityDocumentId && !isActivityDocumentId(activityDocumentId)) return json({ account: true, scope: accountId, drafts: [] });
  try {
    return json({ account: true, scope: accountId, drafts: await listDrafts(accountId, activityDocumentId) });
  } catch (error) {
    if (isDraftsTableMissing(error)) return json({ account: true, scope: accountId, setupNeeded: true, migration: ACTIVITY_DRAFTS_MIGRATION, drafts: [] });
    console.error("[api/activities/drafts]", error);
    return json({ account: true, scope: accountId, drafts: [], error: "Drafts could not be loaded." }, 500);
  }
}

export async function POST(request) {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;
  const accountId = await whoAsks(request);
  if (!accountId) return guest();
  const body = await request.json().catch(() => null);
  const activityDocumentId = String(body?.activityDocumentId || "").trim();
  if (!isActivityDocumentId(activityDocumentId)) return json({ error: "Say which quiz this draft belongs to." }, 400);
  try {
    // Your own quiz, or one shared with you (you answer it without changing it).
    const denied = await denyUnlessOwner(request, { documentId: activityDocumentId, allowShared: true });
    if (denied) return denied;
    const saved = await saveDraft(accountId, activityDocumentId, body?.draft);
    return json({ saved: true, updatedAt: saved.updatedAt });
  } catch (error) {
    if (error instanceof DraftError) return json({ error: error.message }, error.status);
    if (isDraftsTableMissing(error)) return setup(503);
    console.error("[api/activities/drafts]", error);
    return json({ error: "The draft could not be saved." }, 500);
  }
}

export async function DELETE(request) {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;
  const accountId = await whoAsks(request);
  if (!accountId) return guest();
  const activityDocumentId = String(new URL(request.url).searchParams.get("activityDocumentId") || "").trim();
  try {
    await deleteDraft(accountId, activityDocumentId);
    return json({ deleted: true });
  } catch (error) {
    if (isDraftsTableMissing(error)) return setup(503);
    console.error("[api/activities/drafts]", error);
    return json({ error: "The draft could not be deleted." }, 500);
  }
}
