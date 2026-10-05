/**
 * POST /api/accounts/login   Body: { email, password }
 * One generic answer for "no such account" and "wrong password"; repeated failures are slowed down
 * per email and per address (in memory) and lock the account for a while (in the database).
 */
import { burnPasswordCheck, createRateLimiter, normalizeEmail, ownAccount, verifyPassword } from "../../../../lib/accountsCore.js";
import { ensureFirstWorkspace, findAccountByEmail, isLocked, recordLoginFailure, recordLoginSuccess } from "../../../../lib/accountsRepository.js";
import { clientIp, errorResponse, json, rejectCrossSite, rejectUnconfigured } from "../../../../lib/accountsApi.js";
import { sessionCookieFor } from "../../../../lib/session.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const byEmail = createRateLimiter({ limit: 5, windowMs: 15 * 60 * 1000 });
const byAddress = createRateLimiter({ limit: 30, windowMs: 15 * 60 * 1000 });
const WRONG = "Email or password is incorrect.";
const TOO_MANY = "Too many attempts. Try again in a few minutes.";

export async function POST(request) {
  const blocked = rejectCrossSite(request) || rejectUnconfigured();
  if (blocked) return blocked;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Send the log-in form as JSON." }, 400);
  }
  const email = normalizeEmail(body?.email);
  const password = String(body?.password || "");
  const ip = clientIp(request);
  if (byEmail.isBlocked(email) || byAddress.isBlocked(ip)) return json({ error: TOO_MANY }, 429);

  const fail = () => {
    byEmail.fail(email);
    byAddress.fail(ip);
  };

  try {
    const account = email && password.length <= 200 ? await findAccountByEmail(email) : null;
    if (!account) {
      await burnPasswordCheck(password.slice(0, 200));
      fail();
      return json({ error: WRONG }, 401);
    }
    if (isLocked(account)) return json({ error: TOO_MANY }, 429);
    if (!(await verifyPassword(password, account.password_hash))) {
      fail();
      await recordLoginFailure(account);
      return json({ error: WRONG }, 401);
    }
    byEmail.reset(email);
    await recordLoginSuccess(account);
    await ensureFirstWorkspace(account.id);
    const response = json({ account: ownAccount(account) });
    response.headers.append("Set-Cookie", sessionCookieFor(account.id, request));
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
