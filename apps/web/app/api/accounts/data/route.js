/**
 * Your data, your call (GDPR arts. 15-20, COPPA parental review).
 *
 * GET  /api/accounts/data[?studentId=…]   Download everything LUNA holds about the account (JSON file). A parent can
 *                                         pass the id of a connected child (accepted parent<->student link only).
 * POST /api/accounts/data  { action: "delete", currentPassword, studentId? }
 *      Own account: scheduled for erasure in 30 days (logging in cancels it) and the session ends.
 *      A child's account, by the connected parent: erased immediately, because the guardian asked.
 * Always needs the logged-in account; deleting also needs its password.
 */
import { createRateLimiter, ownAccount, verifyPassword } from "../../../../lib/accountsCore.js";
import { DELETION_GRACE_DAYS, eraseAccount, exportAccountData, scheduleAccountDeletion } from "../../../../lib/accountData.js";
import { errorResponse, json, rejectCrossSite, rejectUnconfigured, rejectUnlessLegalReady, requireAccount } from "../../../../lib/accountsApi.js";
import { findAccountByEmail, listGuardianStudents } from "../../../../lib/accountsRepository.js";
import { loggedOutCookie } from "../../../../lib/session.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = createRateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 });
const passwordGuesses = createRateLimiter({ limit: 5, windowMs: 15 * 60 * 1000 });

/** Whose data: the caller's own, or a child's when the caller is that child's connected parent. */
async function targetFor(account, studentId) {
  const id = String(studentId || "");
  if (!id || id === account.id) return { id: account.id, own: true };
  if (account.role !== "parent") return null;
  const students = await listGuardianStudents(account);
  return students.some((student) => student.id === id) ? { id, own: false } : null;
}

export async function GET(request) {
  const blocked = rejectUnconfigured() || (await rejectUnlessLegalReady());
  if (blocked) return blocked;
  try {
    const found = await requireAccount(request);
    if (found.response) return found.response;
    const { account } = found;
    if (limiter.isBlocked(account.id)) return json({ error: "Too many exports. Try again in an hour." }, 429);
    limiter.fail(account.id);
    const target = await targetFor(account, new URL(request.url).searchParams.get("studentId"));
    if (!target) return json({ error: "You can only download your own data, or your own child's." }, 403);
    const data = await exportAccountData(target.id);
    if (!data) return json({ error: "Account not found." }, 404);
    return new Response(JSON.stringify(data, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="luna-data-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "no-store" }
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  const blocked = rejectCrossSite(request) || rejectUnconfigured() || (await rejectUnlessLegalReady());
  if (blocked) return blocked;
  try {
    const found = await requireAccount(request);
    if (found.response) return found.response;
    const { account } = found;
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Send JSON." }, 400);
    }
    if (body?.action !== "delete") return json({ error: "Unknown action." }, 400);
    if (passwordGuesses.isBlocked(account.id)) return json({ error: "Too many wrong passwords. Try again in a few minutes." }, 429);
    const row = await findAccountByEmail(account.email);
    const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword.slice(0, 200) : "";
    if (!row || !(await verifyPassword(currentPassword, row.password_hash))) {
      passwordGuesses.fail(account.id);
      return json({ error: "Your password is not correct.", field: "currentPassword" }, 403);
    }
    const target = await targetFor(account, body?.studentId);
    if (!target) return json({ error: "You can only delete your own account, or your own child's." }, 403);

    if (!target.own) {
      await eraseAccount(target.id);
      return json({ ok: true, erased: true });
    }
    const when = await scheduleAccountDeletion(account.id);
    const response = json({ ok: true, scheduledAt: when, graceDays: DELETION_GRACE_DAYS, account: ownAccount({ ...row, deletion_scheduled_at: when }) });
    response.headers.append("Set-Cookie", loggedOutCookie(request));
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
