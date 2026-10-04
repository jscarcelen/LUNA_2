/**
 * GET  /api/accounts/links  -> { incoming, outgoing, accepted }  (the Connections page)
 * POST /api/accounts/links  Body: { action: "request", email, relation }
 *                                 | { action: "accept" | "decline" | "cancel" | "remove", linkId }
 * Valid pairs only (teacher <-> student, parent <-> student); a link is active once the person who was
 * asked accepts. The state machine is in lib/accountsCore.js (transitionLink).
 */
import { LinkError } from "../../../../lib/accountsCore.js";
import { changeLink, listConnections, requestLink } from "../../../../lib/accountsRepository.js";
import { errorResponse, json, rejectCrossSite, rejectUnconfigured, requireAccount } from "../../../../lib/accountsApi.js";

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
      message = (await requestLink(account, { email: body?.email, relation: String(body?.relation || "") })).message;
    } else if (["accept", "decline", "cancel", "remove"].includes(action)) {
      await changeLink(account, String(body?.linkId || ""), action);
      message = { accept: "Connected.", decline: "Request declined.", cancel: "Request cancelled.", remove: "Connection removed." }[action];
    } else {
      throw new LinkError("bad_action", "Unknown action.");
    }
    return json({ message, connections: await listConnections(account) });
  } catch (error) {
    return errorResponse(error);
  }
}
