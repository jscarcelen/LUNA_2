/**
 * POST /api/accounts/signup
 * Body: { displayName, email, password, passwordConfirm, phone, role: "student"|"teacher"|"parent", age?, invites?: [{ email, relation }] }
 *
 * Creates the account (password typed twice and compared here too, phone required and stored as E.164 —
 * one phone per account, NOT verified by SMS yet), its first workspace, logs in, and mails a confirmation
 * link. Until the email is confirmed the account can use its own workspace but cannot connect, share or
 * assign, and requests other people made to this address are NOT attached; the link requests typed here are
 * kept and sent when the email is confirmed. On a database without the verification migration this
 * degrades to the previous behaviour (no phone stored, no email, requests handled immediately).
 */
import {
  LinkError,
  createRateLimiter,
  hashPassword,
  isRole,
  isValidEmail,
  normalizeDisplayName,
  normalizeEmail,
  ownAccount,
  relationsFor,
  resolveSessionSecret,
  validatePasswordPair
} from "../../../../lib/accountsCore.js";
import { EmailTakenError, PhoneTakenError, attachPendingLinks, ensureFirstWorkspace, findAccountIdByPhone, insertAccount, requestLink, supportsVerification } from "../../../../lib/accountsRepository.js";
import { MAX_QUEUED_INVITES, sendVerificationEmail } from "../../../../lib/accountFlows.js";
import { clientIp, errorResponse, json, rejectCrossSite, rejectUnconfigured } from "../../../../lib/accountsApi.js";
import { publicBaseUrl } from "../../../../lib/mailer.js";
import { normalizePhone } from "../../../../lib/phone.js";
import { sessionCookieFor } from "../../../../lib/session.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const signups = createRateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 });

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
  const password = validatePasswordPair(body?.password, body?.passwordConfirm, email);
  if (!password.ok) return json({ error: password.error, field: String(body?.passwordConfirm) === String(body?.password) ? "password" : "passwordConfirm" }, 400);
  const phone = normalizePhone(body?.phone, { required: true });
  if (!phone.ok) return json({ error: phone.error, field: "phone" }, 400);
  const age = Number(body?.age);
  const under13 = role === "student" && Number.isFinite(age) && age > 0 && age < 13;

  try {
    resolveSessionSecret(); // fail before creating anything if production has no session secret
    const verification = await supportsVerification();
    if (verification && (await findAccountIdByPhone(phone.e164))) return json({ error: "That phone number is already linked to another account.", field: "phone" }, 409);

    // Requests typed here: with email confirmation they wait until the address is confirmed.
    const wanted = [];
    for (const invite of (Array.isArray(body?.invites) ? body.invites : []).slice(0, MAX_QUEUED_INVITES)) {
      const inviteEmail = normalizeEmail(invite?.email);
      if (inviteEmail) wanted.push({ email: inviteEmail, relation: String(invite?.relation || "") });
    }
    const queueable = wanted.filter((invite) => isValidEmail(invite.email) && invite.email !== email && relationsFor(role).includes(invite.relation));

    const account = await insertAccount({
      email,
      passwordHash: await hashPassword(String(body.password)),
      displayName,
      role,
      under13,
      phone: phone.e164,
      pendingInvites: verification ? queueable : []
    });
    await ensureFirstWorkspace(account.id);
    await attachPendingLinks(account); // does nothing until the email is confirmed (and keeps the old behaviour on a legacy database)

    const baseUrl = publicBaseUrl(request);
    const invites = [];
    let confirmation = null;
    if (verification) {
      try {
        confirmation = await sendVerificationEmail(account, baseUrl);
      } catch (error) {
        console.warn("[api/accounts/signup] could not start email confirmation:", error?.message || error);
        confirmation = { delivered: false, mailFailed: true };
      }
    } else {
      for (const invite of wanted) {
        try {
          const result = await requestLink(account, invite);
          invites.push({ email: invite.email, ok: true, status: result.status });
        } catch (error) {
          if (!(error instanceof LinkError)) throw error;
          invites.push({ email: invite.email, ok: false, error: error.message });
        }
      }
    }

    const response = json({ account: ownAccount(account), invites, confirmation, invitesQueued: verification ? queueable.length : 0 });
    response.headers.append("Set-Cookie", sessionCookieFor(account.id, request));
    return response;
  } catch (error) {
    if (error instanceof EmailTakenError) return json({ error: "An account with this email already exists. Log in instead." }, 409);
    if (error instanceof PhoneTakenError) return json({ error: "That phone number is already linked to another account.", field: "phone" }, 409);
    return errorResponse(error);
  }
}
