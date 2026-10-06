/**
 * GET  /api/accounts/share -> { sent, received }  what you sent / what was sent to you
 * POST /api/accounts/share Body: { mode: "share" | "assign", documentId, recipientIds: [], groupIds?: [], dueDate?, note? }
 * The COPY mechanism: the sender is the logged-in account; the copy is made on the server into each
 * recipient's own workspace ("Shared documents / <your name>"), read-only. Needs an accepted connection with
 * each recipient. Assigning (activities and study plans, teacher/parent -> student over a teacher_student /
 * parent_student link, never a peer connection) can carry a due date: that date is IMPOSED (`due-by:` tag, the
 * receiver cannot change it, they can add their own earlier one). The dialog's plain "Share" now creates
 * LIVE shares with view/edit permissions instead: see /api/accounts/grants (lib/grants.js).
 *
 * `groupIds` are the sender's groups (lib/groupsRepository.js): their CURRENT members receive it, each person once even
 * when several chosen groups (or an individual choice) overlap. The answer carries a per-person result and a summary:
 *   { results: [{ recipientId, ok, alreadyHadIt?, deferred?, error?, status? }],
 *     summary: { delivered, skipped: { not_connected, already_has_it, failed }, deferred } }
 * Up to 200 people per request, 600 deliveries an hour per sender; people not reached within the 45 s budget come
 * back as `deferred` (send again to finish). Emails go out after the response (one per person), never blocking it.
 */
import { LinkError } from "../../../../lib/accountsCore.js";
import { listSharedItems } from "../../../../lib/accountsRepository.js";
import { deliverDocument, loadOwnedDocument } from "../../../../lib/sharingRepository.js";
import { prepareBatch, runBatch } from "../../../../lib/batchSend.js";
import { notifyAssigned } from "../../../../lib/accountFlows.js";
import { afterResponse } from "../../../../lib/afterResponse.js";
import { publicBaseUrl } from "../../../../lib/mailer.js";
import { createSupabaseAdminClient } from "../../../../lib/supabaseClient.js";
import { errorResponse, json, rejectCrossSite, rejectUnconfigured, requireAccount } from "../../../../lib/accountsApi.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  const unconfigured = rejectUnconfigured();
  if (unconfigured) return unconfigured;
  try {
    const found = await requireAccount(request);
    if (found.response) return found.response;
    return json(await listSharedItems(found.account.id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  const blocked = rejectCrossSite(request) || rejectUnconfigured();
  if (blocked) return blocked;
  try {
    const found = await requireAccount(request);
    if (found.response) return found.response;
    let body;
    try {
      body = await request.json();
    } catch {
      throw new LinkError("bad_request", "Send JSON.");
    }
    const mode = String(body?.mode || "");
    const documentId = String(body?.documentId || "");
    const recipientIds = [...new Set((Array.isArray(body?.recipientIds) ? body.recipientIds : []).map((id) => String(id || "")).filter(Boolean))];
    const groupIds = [...new Set((Array.isArray(body?.groupIds) ? body.groupIds : []).map((id) => String(id || "")).filter(Boolean))];
    if (!documentId || (!recipientIds.length && !groupIds.length)) throw new LinkError("bad_request", "Choose a document and at least one person or group.");

    // The document is the sender's or nobody's: one answer for everyone, before anything is written.
    const owned = await loadOwnedDocument(createSupabaseAdminClient(), documentId, found.account.id);
    if (!owned) throw new LinkError("not_found", "That document was not found in your workspace.", 404);

    const batch = await prepareBatch(found.account, { groupIds, recipientIds });
    const dueDate = String(body?.dueDate || "");
    const note = String(body?.note || "");
    const { results, summary } = await runBatch(found.account, batch, (recipientId, context) => deliverDocument({
      sender: found.account, recipientId, documentId, mode, dueDate, note, context, skipIfCurrent: batch.recipients.length > 1
    }));

    const failed = results.filter((result) => !result.ok && !result.deferred);
    // Nothing went through: report the first reason with its status so the dialog can show it.
    if (failed.length === results.length) return json({ error: failed[0].error, results, summary }, failed[0].status || 400);
    if (mode === "assign") {
      const baseUrl = publicBaseUrl(request);
      const mails = results.filter((result) => result.ok && !result.alreadyHadIt).map((result) => ({ recipientId: result.recipientId, itemName: owned.row.name, itemType: result.itemType, dueDate, note }));
      await afterResponse(() => notifyAssigned(found.account, mails, baseUrl));
    }
    return json({ results, summary, groupsUsed: batch.groupsUsed });
  } catch (error) {
    return errorResponse(error);
  }
}
