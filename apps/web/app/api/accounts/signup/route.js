/**
 * POST /api/accounts/signup
 * Body: { displayName, email, password, role: "student"|"teacher"|"parent", age?, invites?: [{ email, relation }] }
 * Creates the account, its first workspace, picks up requests other people already made to this email,
 * sends the optional link requests (they only become active once the other side accepts), and logs in.
 */
import {
  LinkError,
  createRateLimiter,
  hashPassword,
  isRole,
  isValidEmail,
  normalizeDisplayName,
  normalizeEmail,
  publicAccount,
  resolveSessionSecret,
  validatePassword
} from "../../../../lib/accountsCore.js";
import { EmailTakenError, attachPendingLinks, ensureFirstWorkspace, insertAccount, requestLink } from "../../../../lib/accountsRepository.js";
import { clientIp, errorResponse, json, rejectCrossSite, rejectUnconfigured } from "../../../../lib/accountsApi.js";
import { sessionCookieFor } from "../../../../lib/session.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const signups = createRateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 });
const MAX_INVITES = 25;

export async function POST(request) {
  const blocked = rejectCrossSite(request) || rejectUnconfigured();
  if (blocked) return blocked;
  const ip = clientIp(request);
  if (signups.isBlocked(ip)) return json({ error: "Too many sign-ups from here. Try again later." }, 429);
  signups.fail(ip);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Send the sign-up form as JSON." }, 400);
  }

  const displayName = normalizeDisplayName(body?.displayName);
  const email = normalizeEmail(body?.email);
  const role = String(body?.role || "");
  if (!displayName) return json({ error: "Enter your name." }, 400);
  if (!isValidEmail(email)) return json({ error: "Enter a valid email address." }, 400);
  if (!isRole(role)) return json({ error: "Choose a profile: student, parent or teacher." }, 400);
  const password = validatePassword(body?.password, email);
  if (!password.ok) return json({ error: password.error }, 400);
  const age = Number(body?.age);
  const under13 = role === "student" && Number.isFinite(age) && age > 0 && age < 13;

  try {
    resolveSessionSecret(); // fail before creating anything if production has no session secret
    const account = await insertAccount({ email, passwordHash: await hashPassword(body.password), displayName, role, under13 });
    await ensureFirstWorkspace(account.id);
    await attachPendingLinks(account);

    const invites = [];
    for (const invite of (Array.isArray(body?.invites) ? body.invites : []).slice(0, MAX_INVITES)) {
      const inviteEmail = normalizeEmail(invite?.email);
      if (!inviteEmail) continue;
      try {
        const result = await requestLink(account, { email: inviteEmail, relation: String(invite?.relation || "") });
        invites.push({ email: inviteEmail, ok: true, status: result.status });
      } catch (error) {
        if (!(error instanceof LinkError)) throw error;
        invites.push({ email: inviteEmail, ok: false, error: error.message });
      }
    }

    const response = json({ account: publicAccount(account), invites });
    response.headers.append("Set-Cookie", sessionCookieFor(account.id, request));
    return response;
  } catch (error) {
    if (error instanceof EmailTakenError) return json({ error: "An account with this email already exists. Log in instead." }, 409);
    return errorResponse(error);
  }
}
