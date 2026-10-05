/**
 * GET  /api/accounts/notifications -> { pendingRequests, pendingCount, events, unreadCount, seenSupported, emailVerified }
 *      The bell: connection requests waiting for this account, answers to its own requests, and work shared
 *      or assigned to it — derived from account_links and shared_items (see listNotifications).
 * POST /api/accounts/notifications  Body: { action: "seen" } — marks the list as read (accounts.notifications_seen_at).
 */
import { isEmailVerified } from "../../../../lib/accountsCore.js";
import { listNotifications, markNotificationsSeen } from "../../../../lib/accountsRepository.js";
import { errorResponse, json, rejectCrossSite, rejectUnconfigured, requireAccount } from "../../../../lib/accountsApi.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const unconfigured = rejectUnconfigured();
  if (unconfigured) return unconfigured;
  try {
    const found = await requireAccount(request);
    if (found.response) return found.response;
    return json({ ...(await listNotifications(found.account)), emailVerified: isEmailVerified(found.account) });
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
      return json({ error: "Send JSON." }, 400);
    }
    if (String(body?.action || "") !== "seen") return json({ error: "Unknown action." }, 400);
    return json({ ok: true, supported: await markNotificationsSeen(found.account.id) });
  } catch (error) {
    return errorResponse(error);
  }
}
