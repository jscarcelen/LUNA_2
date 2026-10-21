/**
 * GET  /api/accounts/notifications -> { pendingRequests, pendingCount, events, unreadCount, seenSupported, emailVerified }
 *      The bell: connection requests waiting for this account, answers to its own requests, and work shared
 *      or assigned to it — derived from account_links and shared_items (see listNotifications).
 *      Messages from teachers (lib/messagesRepository.js) are merged in as `type: "message"` lines.
 * POST /api/accounts/notifications  Body: { action: "seen" } — marks the list as read (accounts.notifications_seen_at, and class_messages.read_at).
 */
import { isEmailVerified } from "../../../../lib/accountsCore.js";
import { listNotifications, markNotificationsSeen } from "../../../../lib/accountsRepository.js";
import { markMessagesRead, messageEvents } from "../../../../lib/messagesRepository.js";
import { errorResponse, json, rejectCrossSite, rejectUnconfigured, requireAccount } from "../../../../lib/accountsApi.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const unconfigured = rejectUnconfigured();
  if (unconfigured) return unconfigured;
  try {
    const found = await requireAccount(request);
    if (found.response) return found.response;
    const [base, messages] = await Promise.all([listNotifications(found.account), messageEvents(found.account).catch(() => [])]);
    // Messages from teachers sit in the same list; their "unread" is per message (read_at), not the bell's timestamp.
    const events = [...messages, ...base.events].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 20);
    const unreadCount = base.pendingCount + events.filter((event) => event.unread).length;
    return json({ ...base, events, unreadCount, emailVerified: isEmailVerified(found.account) });
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
    await markMessagesRead(found.account).catch(() => 0);
    return json({ ok: true, supported: await markNotificationsSeen(found.account.id) });
  } catch (error) {
    return errorResponse(error);
  }
}
