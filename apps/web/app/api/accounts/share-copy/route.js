/**
 * Agents, templates and components are shared as COPIES with connections (no live sync).
 *
 * POST /api/accounts/share-copy Body: { kind: "agent" | "template", id, recipientIds: [] }
 *                                   | { kind: "component", component: <block definition>, recipientIds: [] }
 *   The sender is the logged-in account and the thing shared is read from the sender's own data (an agent or
 *   template by id) or validated (a component, which lives in the browser). Each recipient must be an accepted
 *   connection. Answers 503 { setupNeeded, migration } until the sharing migration is applied.
 *
 * GET  /api/accounts/share-copy  -> { components: [{ id, title, block, sender }] }
 *   Shared components waiting for this account's app to import them into its local library.
 * POST /api/accounts/share-copy Body: { kind: "imported", ids: [] }  marks them as imported.
 */
import { LinkError } from "../../../../lib/accountsCore.js";
import { listPendingComponents, markComponentsImported, shareCopy } from "../../../../lib/copyShareRepository.js";
import { notifyShared } from "../../../../lib/accountFlows.js";
import { publicBaseUrl } from "../../../../lib/mailer.js";
import { errorResponse, json, rejectCrossSite, rejectUnconfigured, requireAccount } from "../../../../lib/accountsApi.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const unconfigured = rejectUnconfigured();
  if (unconfigured) return unconfigured;
  try {
    const found = await requireAccount(request);
    if (found.response) return found.response;
    return json({ components: await listPendingComponents(found.account.id) });
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
    const kind = String(body?.kind || "");
    if (kind === "imported") return json({ imported: await markComponentsImported(found.account.id, Array.isArray(body?.ids) ? body.ids : []) });

    const done = await shareCopy({
      sender: found.account,
      kind,
      id: String(body?.id || ""),
      component: body?.component && typeof body.component === "object" ? body.component : null,
      recipientIds: Array.isArray(body?.recipientIds) ? body.recipientIds : []
    });
    const failed = done.results.filter((result) => !result.ok);
    if (failed.length === done.results.length) return json({ error: failed[0].error, results: done.results }, failed[0].status || 400);
    await notifyShared(found.account, { recipientIds: done.results.filter((result) => result.ok).map((result) => result.recipientId), itemName: done.title, copyOf: kind }, publicBaseUrl(request));
    return json({ results: done.results, title: done.title });
  } catch (error) {
    return errorResponse(error);
  }
}
