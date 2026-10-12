/**
 * POST /api/accounts/settings
 *   { action: "phone", phone, currentPassword }   set or (empty phone) remove the phone — E.164, one account per number, not verified by SMS yet
 *   { action: "password", currentPassword, newPassword, passwordConfirm }   change the password; every other session ends
 *   { action: "profile", displayName?, age?, plan? }   name, age (3–120 or empty) and plan ("free" | "paid"); no password needed
 *   { action: "email", email, currentPassword }   change the email; it must be confirmed again (a new confirmation link is sent)
 *   { action: "resetLink" }   mail the password-reset link to the account's own email
 * Phone, password and email need the current password (a stolen session alone cannot take the account over), and wrong guesses are limited.
 */
import { hashPassword, isValidEmail, normalizeEmail, ownAccount, validatePasswordPair, verifyPassword } from "../../../../lib/accountsCore.js";
import { limits } from "../../../../lib/accountLimits.js";
import { EmailTakenError, PLANS, PhoneTakenError, ProfileSetupError, findAccountByEmail, readAccountProfile, updateAccountEmail, updateAccountProfile, findAccountById, findAccountIdByPhone, setAccountPassword, updateAccountPhone } from "../../../../lib/accountsRepository.js";
import { errorResponse, json, rejectCrossSite, rejectUnconfigured, rejectUnlessVerificationReady, requireAccount } from "../../../../lib/accountsApi.js";
import { normalizePhone } from "../../../../lib/phone.js";
import { sendVerificationEmail, startPasswordReset } from "../../../../lib/accountFlows.js";
import { publicBaseUrl } from "../../../../lib/mailer.js";
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
    if (!["phone", "password", "email", "profile", "resetLink"].includes(action)) return json({ error: "Unknown action." }, 400);

    if (action === "profile") {
      const patch = {};
      if (body?.displayName !== undefined) {
        const name = String(body.displayName || "").trim().replace(/\s+/g, " ");
        if (name.length < 1 || name.length > 60) return json({ error: "The name must be 1 to 60 characters.", field: "displayName" }, 400);
        patch.displayName = name;
      }
      if (body?.age !== undefined) {
        if (body.age === null || body.age === "") patch.age = null;
        else {
          const age = Number(body.age);
          if (!Number.isInteger(age) || age < 3 || age > 120) return json({ error: "Enter an age between 3 and 120, or leave it empty.", field: "age" }, 400);
          patch.age = age;
        }
      }
      if (body?.plan !== undefined) {
        if (!PLANS.includes(body.plan)) return json({ error: "The plan is free or paid.", field: "plan" }, 400);
        patch.plan = body.plan;
      }
      await updateAccountProfile(account.id, patch);
      return json({ ok: true, account: ownAccount(await findAccountById(account.id)), profile: await readAccountProfile(account.id) });
    }

    if (action === "resetLink") {
      if (wrongGuesses.isBlocked(`reset:${account.id}`)) return json({ error: "You asked for several links already. Check your inbox, or try again in a few minutes." }, 429);
      wrongGuesses.fail(`reset:${account.id}`);
      const outcome = await startPasswordReset(account.email, publicBaseUrl(request));
      return json({ ok: true, message: `We sent a link to ${account.email}. It works for one hour.`, ...(outcome?.devPreview ? { devPreview: outcome.devPreview } : {}) });
    }

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

    if (action === "email") {
      const email = normalizeEmail(body?.email);
      if (!isValidEmail(email)) return json({ error: "Enter a valid email address.", field: "email" }, 400);
      if (email !== account.email) {
        await updateAccountEmail(account.id, email);
        const fresh = await findAccountById(account.id);
        const confirmation = await sendVerificationEmail(fresh, publicBaseUrl(request)).catch(() => null);
        return json({ ok: true, account: ownAccount(fresh), confirmation });
      }
      return json({ ok: true, account: ownAccount(account) });
    }

    const rules = validatePasswordPair(body?.newPassword, body?.passwordConfirm, account.email);
    if (!rules.ok) return json({ error: rules.error, field: String(body?.newPassword) === String(body?.passwordConfirm) ? "newPassword" : "passwordConfirm" }, 400);
    await setAccountPassword(account.id, await hashPassword(String(body.newPassword)));
    // This browser gets a new session; every older one (other devices, stolen cookies) is now refused.
    const response = json({ ok: true, account: ownAccount(await findAccountById(account.id)) });
    response.headers.append("Set-Cookie", sessionCookieFor(account.id, request));
    return response;
  } catch (error) {
    if (error instanceof EmailTakenError) return json({ error: error.message, field: "email" }, 409);
    if (error instanceof ProfileSetupError) return json({ error: error.message, setupNeeded: true }, 503);
    if (error instanceof PhoneTakenError) return json({ error: error.message, field: "phone" }, 409);
    return errorResponse(error);
  }
}
