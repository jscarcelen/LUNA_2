/**
 * POST /api/accounts/password-reset/confirm   Body: { token, password, passwordConfirm }
 * Sets the new password from a reset link (one use, 1 hour). On success every other reset link dies, every
 * session issued before now stops working, the email counts as confirmed, and this browser is logged in.
 */
import { ownAccount } from "../../../../../lib/accountsCore.js";
import { limits } from "../../../../../lib/accountLimits.js";
import { resetPasswordWithToken } from "../../../../../lib/accountFlows.js";
import { clientIp, errorResponse, json, rejectCrossSite, rejectUnconfigured, rejectUnlessVerificationReady } from "../../../../../lib/accountsApi.js";
import { publicBaseUrl } from "../../../../../lib/mailer.js";
import { sessionCookieFor } from "../../../../../lib/session.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const byAddress = limits.resetConfirmByAddress;

export async function POST(request) {
  const blocked = rejectCrossSite(request) || rejectUnconfigured() || (await rejectUnlessVerificationReady());
  if (blocked) return blocked;
  const ip = clientIp(request);
  if (byAddress.isBlocked(ip)) return json({ error: "Too many attempts. Try again in a few minutes." }, 429);
  byAddress.fail(ip);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Send JSON." }, 400);
  }
  try {
    const result = await resetPasswordWithToken({
      token: String(body?.token || ""),
      password: typeof body?.password === "string" ? body.password : "",
      passwordConfirm: body?.passwordConfirm,
      baseUrl: publicBaseUrl(request)
    });
    if (!result.ok) return json({ error: result.error, invalidLink: Boolean(result.invalidLink) }, 400);
    const response = json({ ok: true, account: ownAccount(result.account) });
    response.headers.append("Set-Cookie", sessionCookieFor(result.account.id, request));
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
