/**
 * GET  /api/accounts/links  -> { incoming, outgoing, accepted }  (the Connections page)
 * POST /api/accounts/links  Body: { action: "request", email, relation }
 *                                 | { action: "accept" | "decline" | "cancel" | "remove", linkId }
 * The network is open: any account can connect with any other (`relation`, the role of the person asked, is an
 * optional hint for an address with no account yet). The kind of connection comes from the two roles:
 * teacher_student and parent_student keep their role powers, every other pair is a peer. A link is active once
 * the person who was asked accepts. The state machine is in lib/accountsCore.js (transitionLink). Removing a
 * connection also revokes the live shares between the two.
 */
import { LinkError } from "../../../../lib/accountsCore.js";
import { changeLink, getLinkById, listConnections, requestLink } from "../../../../lib/accountsRepository.js";
import { revokeGrantsBetween } from "../../../../lib/grantsRepository.js";
import { dropMembershipsBetween } from "../../../../lib/groupsRepository.js";
import { revokeExamDatesBetween } from "../../../../lib/examDatesRepository.js";
import { notifyLinkAccepted, notifyLinkRequest } from "../../../../lib/accountFlows.js";
import { errorResponse, json, rejectCrossSite, rejectUnconfigured, requireAccount } from "../../../../lib/accountsApi.js";
import { publicBaseUrl } from "../../../../lib/mailer.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const unconfigured = rejectUnconfigured();
  if (unconfigured) return unconfigured;
  try {
    const found = await requireAccount(request);
    if (found.response) return found.response;
    return json({ connections: await listConnections(found.account) });
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
    let message = "";
    if (action === "request") {
      const result = await requestLink(account, { email: body?.email, relation: String(body?.relation || "") });
      message = result.message;
      // Best effort and identical for the person asking whatever happens: the email never changes the answer.
      await notifyLinkRequest(account, result.event, publicBaseUrl(request));
    } else if (["accept", "decline", "cancel", "remove"].includes(action)) {
      const linkId = String(body?.linkId || "");
      const before = action === "remove" ? await getLinkById(linkId) : null;
      await changeLink(account, linkId, action);
      // Ending a connection ends the live access in both directions at once.
      if (before) await revokeGrantsBetween(before.requesterId, before.targetId).catch((error) => console.warn("[api/accounts/links] could not revoke shares:", error?.message || error));
      // ...and the student leaves that person's groups, and their exam dates stop (reads ignore both anyway: this keeps the tables tidy).
      if (before) await dropMembershipsBetween(before.requesterId, before.targetId).catch((error) => console.warn("[api/accounts/links] could not drop group memberships:", error?.message || error));
      if (before) await revokeExamDatesBetween(before.requesterId, before.targetId).catch((error) => console.warn("[api/accounts/links] could not stop exam dates:", error?.message || error));
      if (action === "accept") await notifyLinkAccepted(account, linkId, publicBaseUrl(request));
      message = { accept: "Connected.", decline: "Request declined.", cancel: "Request cancelled.", remove: "Connection removed." }[action];
    } else {
      throw new LinkError("bad_action", "Unknown action.");
    }
    return json({ message, connections: await listConnections(account) });
  } catch (error) {
    return errorResponse(error);
  }
}
