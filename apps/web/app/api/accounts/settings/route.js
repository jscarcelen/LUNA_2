/**
 * POST /api/accounts/settings
 *   { action: "phone", phone, currentPassword }   set or (empty phone) remove the phone — E.164, one account per number, not verified by SMS yet
 *   { action: "password", currentPassword, newPassword, passwordConfirm }   change the password; every other session ends
 * Both need the current password (a stolen session alone cannot take the account over), and wrong guesses are limited.
 */
import { hashPassword, ownAccount, validatePasswordPair, verifyPassword } from "../../../../lib/accountsCore.js";
import { limits } from "../../../../lib/accountLimits.js";
import { PhoneTakenError, findAccountByEmail, findAccountById, findAccountIdByPhone, setAccountPassword, updateAccountPhone } from "../../../../lib/accountsRepository.js";
import { errorResponse, json, rejectCrossSite, rejectUnconfigured, rejectUnlessVerificationReady, requireAccount } from "../../../../lib/accountsApi.js";
import { normalizePhone } from "../../../../lib/phone.js";
import { sessionCookieFor } from "../../../../lib/session.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const wrongGuesses = limits.settingsWrongGuesses;

export async function POST(request) {
  const blocked = rejectCrossSite(request) || rejectUnconfigured() || (await rejectUnlessVerificationReady());
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
    const action = String(body?.action || "");
    if (action !== "phone" && action !== "password") return json({ error: "Unknown action." }, 400);

    if (wrongGuesses.isBlocked(account.id)) return json({ error: "Too many wrong passwords. Try again in a few minutes." }, 429);
    const row = await findAccountByEmail(account.email);
    const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword.slice(0, 200) : "";
    if (!row || !(await verifyPassword(currentPassword, row.password_hash))) {
      wrongGuesses.fail(account.id);
      return json({ error: "Your current password is not correct.", field: "currentPassword" }, 403);
    }

    if (action === "phone") {
      const phone = normalizePhone(body?.phone, { required: false }); // empty = remove it
      if (!phone.ok) return json({ error: phone.error, field: "phone" }, 400);
      if (phone.e164) {
        const owner = await findAccountIdByPhone(phone.e164);
        if (owner && owner !== account.id) return json({ error: "That phone number is already linked to another account.", field: "phone" }, 409);
      }
      if ((account.phone || "") !== phone.e164) await updateAccountPhone(account.id, phone.e164);
      return json({ ok: true, account: ownAccount(await findAccountById(account.id)) });
    }

    const rules = validatePasswordPair(body?.newPassword, body?.passwordConfirm, account.email);
    if (!rules.ok) return json({ error: rules.error, field: String(body?.newPassword) === String(body?.passwordConfirm) ? "newPassword" : "passwordConfirm" }, 400);
    await setAccountPassword(account.id, await hashPassword(String(body.newPassword)));
    // This browser gets a new session; every older one (other devices, stolen cookies) is now refused.
    const response = json({ ok: true, account: ownAccount(await findAccountById(account.id)) });
    response.headers.append("Set-Cookie", sessionCookieFor(account.id, request));
    return response;
  } catch (error) {
    if (error instanceof PhoneTakenError) return json({ error: error.message, field: "phone" }, 409);
    return errorResponse(error);
  }
}
