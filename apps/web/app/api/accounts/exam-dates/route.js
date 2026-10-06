/**
 * Exam dates a teacher or parent sends to students ("Dates from my teachers"), see lib/examDatesRepository.js.
 *
 * GET  /api/accounts/exam-dates
 *        student        -> { supported, examDates: [{ id, batchId, title, date, subjectHint, notes, senderName, linkedPlanIds, ... }] }
 *        teacher/parent -> { supported, items: [{ batchId, title, date, groups, recipients: [{ id, displayName, planned, ... }], cancelled }] }
 * POST /api/accounts/exam-dates  Body:
 *        { action: "send", title, date, subjectHint?, notes?, recipientIds?: [], groupIds?: [], shareDocumentId? }   (teacher / parent)
 *      | { action: "update", batchId, title?, date?, subjectHint?, notes? }  (sender; linked plans move with the date)
 *      | { action: "cancel", batchId }                                        (sender; plans keep the date as their own deadline)
 *      | { action: "dismiss" | "restore", examDateId }                        (student: hide it from the card)
 *      | { action: "link", examDateId, planDocumentId }                       (student: tie an existing plan to it; the plan's deadline is then locked)
 * `send` answers per person `{ results: [{ recipientId, ok, alreadyHadIt?, reason?, error? }], summary }` like the share routes; the
 * emails (one per student) go out after the response. Until supabase/migrations/202610070001_groups_exam_dates.sql
 * is applied every call answers `503 { setupNeeded: true, migration }` (a GET answers `supported: false`).
 */
import { LinkError } from "../../../../lib/accountsCore.js";
import { cancelBatch, linkPlanToExam, listForRecipient, listSent, sendExamDate, setDismissed, updateBatch } from "../../../../lib/examDatesRepository.js";
import { assertOwnsItem, shareItem } from "../../../../lib/grantsRepository.js";
import { notifyExamDates } from "../../../../lib/accountFlows.js";
import { afterResponse } from "../../../../lib/afterResponse.js";
import { publicBaseUrl } from "../../../../lib/mailer.js";
import { errorResponse, json, rejectCrossSite, rejectUnconfigured, requireAccount } from "../../../../lib/accountsApi.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const list = (value) => (Array.isArray(value) ? value.map((entry) => String(entry || "")).filter(Boolean) : []);

export async function GET(request) {
  const unconfigured = rejectUnconfigured();
  if (unconfigured) return unconfigured;
  try {
    const found = await requireAccount(request);
    if (found.response) return found.response;
    const { account } = found;
    if (account.role === "student") return json(await listForRecipient(account));
    return json(await listSent(account));
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
    const { account } = found;
    let body;
    try {
      body = await request.json();
    } catch {
      throw new LinkError("bad_request", "Send JSON.");
    }
    const action = String(body?.action || "");
    const baseUrl = publicBaseUrl(request);

    if (action === "send") {
      const shareDocumentId = String(body?.shareDocumentId || "");
      // A plan or material shared at the same time must be the sender's own: checked before anything is sent.
      if (shareDocumentId) await assertOwnsItem(account, { kind: "document", id: shareDocumentId });
      const sent = await sendExamDate({
        sender: account,
        input: { title: body?.title, date: body?.date, subjectHint: body?.subjectHint, notes: body?.notes },
        groupIds: list(body?.groupIds),
        recipientIds: list(body?.recipientIds),
        sharedDocumentId: shareDocumentId
      });
      const delivered = sent.results.filter((result) => result.ok && !result.alreadyHadIt).map((result) => result.recipientId);
      let shared = null;
      if (shareDocumentId && delivered.length) {
        try {
          const done = await shareItem({ owner: account, kind: "document", itemId: shareDocumentId, recipientIds: delivered, permission: "view" });
          shared = { itemName: done.itemName, summary: done.summary };
        } catch (error) {
          shared = { error: error instanceof LinkError ? error.message : "The plan could not be shared." };
        }
      }
      const failed = sent.results.filter((result) => !result.ok);
      if (failed.length === sent.results.length) return json({ error: failed[0].error, results: sent.results, summary: sent.summary }, failed[0].status || 400);
      await afterResponse(() => notifyExamDates(account, sent.rows, "new", baseUrl));
      return json({ batchId: sent.batchId, results: sent.results, summary: sent.summary, groupsUsed: sent.groupsUsed, shared });
    }
    if (action === "update") {
      const done = await updateBatch(account, String(body?.batchId || ""), { title: body?.title, date: body?.date, subjectHint: body?.subjectHint, notes: body?.notes });
      if (done.changedDate || body?.title !== undefined) await afterResponse(() => notifyExamDates(account, done.updatedRows, "changed", baseUrl));
      return json({ batchId: done.batchId, plansUpdated: done.plansUpdated, ...(await listSent(account)) });
    }
    if (action === "cancel") {
      const done = await cancelBatch(account, String(body?.batchId || ""));
      await afterResponse(() => notifyExamDates(account, done.rows, "cancelled", baseUrl));
      return json({ batchId: done.batchId, plansUpdated: done.plansUpdated, ...(await listSent(account)) });
    }
    if (action === "dismiss" || action === "restore") {
      await setDismissed(account, String(body?.examDateId || ""), action === "dismiss");
      return json(await listForRecipient(account));
    }
    if (action === "link") {
      const done = await linkPlanToExam(account, String(body?.examDateId || ""), String(body?.planDocumentId || ""));
      return json({ ...done, ...(await listForRecipient(account)) });
    }
    throw new LinkError("bad_action", "Unknown action.");
  } catch (error) {
    return errorResponse(error);
  }
}
