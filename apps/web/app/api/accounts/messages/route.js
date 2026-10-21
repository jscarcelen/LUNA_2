/**
 * Messages from a teacher (or parent) to their students and those students' parents, see lib/messagesRepository.js.
 *
 * GET  /api/accounts/messages -> { supported, received: [...], sent: [...] (teacher / parent), canReachParents }
 * POST /api/accounts/messages Body:
 *        { action: "send", subject, body, recipientIds?: [], groupIds?: [], toStudents?: true, toParents?: false }  (teacher / parent)
 *      | { action: "delete", batchId }   (sender: nobody sees it any more)
 *      | { action: "hide", messageId }   (recipient: remove it from my list)
 *      | { action: "read" }              (recipient: I have seen my messages)
 * `send` answers `{ batchId, summary: { students, parents, skipped } }`; one email per recipient goes out after the
 * response. Until supabase/migrations/202610210001_class_messages.sql is applied writes answer 503 `setupNeeded`.
 */
import { LinkError } from "../../../../lib/accountsCore.js";
import { deleteSentMessage, hideMessage, listReceivedMessages, listSentMessages, markMessagesRead, sendMessage } from "../../../../lib/messagesRepository.js";
import { notifyMessages } from "../../../../lib/accountFlows.js";
import { afterResponse } from "../../../../lib/afterResponse.js";
import { publicBaseUrl } from "../../../../lib/mailer.js";
import { errorResponse, json, rejectCrossSite, rejectUnconfigured, requireAccount } from "../../../../lib/accountsApi.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const list = (value) => (Array.isArray(value) ? [...new Set(value.map((entry) => String(entry || "")).filter(Boolean))] : []);

export async function GET(request) {
  const unconfigured = rejectUnconfigured();
  if (unconfigured) return unconfigured;
  try {
    const found = await requireAccount(request);
    if (found.response) return found.response;
    const { account } = found;
    const received = await listReceivedMessages(account);
    if (account.role === "student") return json({ supported: received.supported, received: received.messages, sent: [] });
    const sent = await listSentMessages(account);
    return json({ supported: received.supported, received: received.messages, sent: sent.sent, canReachParents: Boolean(sent.canReachParents) });
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
    if (action === "send") {
      const done = await sendMessage({
        sender: account,
        input: { subject: body?.subject, body: body?.body, toStudents: body?.toStudents, toParents: body?.toParents },
        groupIds: list(body?.groupIds),
        recipientIds: list(body?.recipientIds)
      });
      const baseUrl = publicBaseUrl(request);
      await afterResponse(() => notifyMessages(account, done.rows, baseUrl));
      return json({ batchId: done.batchId, summary: done.summary });
    }
    if (action === "delete") return json(await deleteSentMessage(account, body?.batchId));
    if (action === "hide") return json(await hideMessage(account, body?.messageId));
    if (action === "read") return json({ read: await markMessagesRead(account) });
    throw new LinkError("bad_request", "Unknown action.");
  } catch (error) {
    return errorResponse(error);
  }
}
