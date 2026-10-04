/**
 * GET  /api/accounts/share -> { sent, received }  what you sent / what was sent to you
 * POST /api/accounts/share Body: { mode: "share" | "assign", documentId, recipientIds: [], dueDate?, note? }
 * The sender is the logged-in account; the copy is made on the server into each recipient's own
 * workspace ("Shared documents / <your name>"), read-only. Needs an accepted connection with each
 * recipient. Assigning (activities and study plans, teacher/parent -> student) can carry a due date.
 */
import { LinkError } from "../../../../lib/accountsCore.js";
import { listSharedItems } from "../../../../lib/accountsRepository.js";
import { deliverDocument } from "../../../../lib/sharingRepository.js";
import { errorResponse, json, rejectCrossSite, rejectUnconfigured, requireAccount } from "../../../../lib/accountsApi.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RECIPIENTS = 50;

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
    const recipientIds = [...new Set((Array.isArray(body?.recipientIds) ? body.recipientIds : []).map((id) => String(id || "")).filter(Boolean))].slice(0, MAX_RECIPIENTS);
    if (!documentId || !recipientIds.length) throw new LinkError("bad_request", "Choose a document and at least one person.");

    const results = [];
    for (const recipientId of recipientIds) {
      try {
        const delivered = await deliverDocument({ sender: found.account, recipientId, documentId, mode, dueDate: String(body?.dueDate || ""), note: String(body?.note || "") });
        results.push({ recipientId, ok: true, ...delivered });
      } catch (error) {
        if (!(error instanceof LinkError)) throw error;
        results.push({ recipientId, ok: false, error: error.message, status: error.status });
      }
    }
    const failed = results.filter((result) => !result.ok);
    // Nothing went through: report the first reason with its status so the dialog can show it.
    if (failed.length === results.length) return json({ error: failed[0].error, results }, failed[0].status || 400);
    return json({ results });
  } catch (error) {
    return errorResponse(error);
  }
}
