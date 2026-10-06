/**
 * Live shares with permissions (share_grants). The caller is the logged-in account; ids in the body are never
 * trusted for ownership: the server checks the item is the caller's and every recipient is an accepted connection.
 *
 * GET  /api/accounts/grants?kind=document|folder|subject&id=<item>  -> { grants: [{ id, permission, grantee }] }
 *        who has access to one of MY items (owner only; 404 for anything else)
 * GET  /api/accounts/grants                                         -> { supported, given: [...], received: [...] }
 *        the overview for the Connections page (given = shared by me, received = shared with me)
 * POST /api/accounts/grants Body:
 *        { action: "share", kind, itemId, recipientIds: [], permission: "view" | "edit" }
 *      | { action: "permission", grantId, permission }   (owner changes what someone may do)
 *      | { action: "revoke", grantId }                    (owner takes access away, immediately)
 *      | { action: "leave", grantId }                     (the person it was shared with gives it up)
 * Reads answer an empty/unsupported overview until supabase/migrations/202610060001_network_sharing_grants.sql is
 * applied; every write answers 503 { setupNeeded: true, migration } naming it.
 */
import { LinkError } from "../../../../lib/accountsCore.js";
import { changeGrantPermission, leaveGrant, listGrantOverview, listGrantsOnItem, revokeGrant, shareItem } from "../../../../lib/grantsRepository.js";
import { notifyShared } from "../../../../lib/accountFlows.js";
import { afterResponse } from "../../../../lib/afterResponse.js";
import { publicBaseUrl } from "../../../../lib/mailer.js";
import { errorResponse, json, rejectCrossSite, rejectUnconfigured, requireAccount } from "../../../../lib/accountsApi.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A group of 200 is processed a few people at a time within a 45 s budget (lib/batchSend.js); the rest is returned as `deferred`.
export const maxDuration = 60;

export async function GET(request) {
  const unconfigured = rejectUnconfigured();
  if (unconfigured) return unconfigured;
  try {
    const found = await requireAccount(request);
    if (found.response) return found.response;
    const params = new URL(request.url).searchParams;
    const kind = String(params.get("kind") || "");
    const id = String(params.get("id") || "");
    if (kind && id) return json({ grants: await listGrantsOnItem(found.account, { kind, id }) });
    return json(await listGrantOverview(found.account));
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

    if (action === "share") {
      const permission = String(body?.permission || "");
      const done = await shareItem({
        owner: account,
        kind: String(body?.kind || ""),
        itemId: String(body?.itemId || ""),
        recipientIds: Array.isArray(body?.recipientIds) ? body.recipientIds : [],
        groupIds: Array.isArray(body?.groupIds) ? body.groupIds : [],
        permission
      });
      const failed = done.results.filter((result) => !result.ok);
      if (failed.length === done.results.length && !done.results.some((result) => result.deferred)) return json({ error: failed[0].error, results: done.results, summary: done.summary }, failed[0].status || 400);
      // Best effort, after the response, and never part of the answer: the email cannot change what the sharer sees.
      const mailed = done.results.filter((result) => result.ok && result.changed).map((result) => result.recipientId);
      const baseUrl = publicBaseUrl(request);
      await afterResponse(() => notifyShared(account, { recipientIds: mailed, itemName: done.itemName, permission, batch: mailed.length > 1 }, baseUrl));
      return json({ results: done.results, summary: done.summary, groupsUsed: done.groupsUsed, itemName: done.itemName, permission });
    }
    if (action === "permission") {
      await changeGrantPermission(account, String(body?.grantId || ""), String(body?.permission || ""));
      return json({ ok: true });
    }
    if (action === "revoke") {
      await revokeGrant(account, String(body?.grantId || ""));
      return json({ ok: true });
    }
    if (action === "leave") {
      await leaveGrant(account, String(body?.grantId || ""));
      return json({ ok: true });
    }
    throw new LinkError("bad_action", "Unknown action.");
  } catch (error) {
    return errorResponse(error);
  }
}
