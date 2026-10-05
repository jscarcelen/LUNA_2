/**
 * The multi-step account flows that need the database AND the mailer: confirming an email, resetting a
 * password, and the emails that go with connection requests. The rules live in accountsCore.js, the rows
 * in accountsRepository.js / accountTokens.js, the sending in mailer.js; this file only sequences them.
 *
 * Emails are best effort: a failed or unconfigured mailer never fails the action that triggered it.
 */
import { hashPassword, normalizeEmail, validatePasswordPair } from "./accountsCore.js";
import { limits } from "./accountLimits.js";
import { consumeToken, invalidateTokens, issueToken, peekToken } from "./accountTokens.js";
import { clearPendingInvites, findAccountByEmail, findAccountById, markEmailVerified, requestLink, setAccountPassword, supportsVerification, attachPendingLinks } from "./accountsRepository.js";
import { sendMail } from "./mailer.js";
import { invitationMail, linkAcceptedMail, linkRequestMail, resetPasswordMail, verifyEmailMail } from "./mailTemplates.js";
import { createSupabaseAdminClient } from "./supabaseClient.js";

export const REQUEST_EMAIL_GAP_MS = 24 * 60 * 60 * 1000;
export const INVITE_EMAIL_GAP_MS = 7 * 24 * 60 * 60 * 1000;
export const ACCEPTED_EMAIL_GAP_MS = 24 * 60 * 60 * 1000;
export const MAX_NOTIFY_EMAILS_PER_SENDER_PER_DAY = 30;
export const MAX_QUEUED_INVITES = 25;

/** Sends to third parties are slowed down per sender (in memory, per server instance), on top of the stored limits. */
const senderLimiter = limits.notifyBySender;

/** What the browser may learn about a send: whether it went, and (outside production only) the dev link. */
export function mailOutcome(result) {
  const out = { delivered: Boolean(result?.delivered) };
  if (result?.mailSetupNeeded) out.mailSetupNeeded = true;
  else if (!result?.delivered) out.mailFailed = true;
  if (result?.devPreview && process.env.NODE_ENV !== "production") out.devPreview = { links: result.devPreview.links || [] };
  return out;
}

const pathUrl = (baseUrl, path) => `${String(baseUrl).replace(/\/+$/, "")}${path}`;

/* ------------------------------------------------------------------ confirm email */

/** Issues a fresh confirm-email token (older ones stop working) and mails the link. */
export async function sendVerificationEmail(account, baseUrl) {
  const { token } = await issueToken(account.id, "verify_email");
  const url = pathUrl(baseUrl, `/verify-email?token=${encodeURIComponent(token)}`);
  return mailOutcome(await sendMail(verifyEmailMail({ to: account.email, name: account.display_name, url })));
}

/**
 * What becomes possible the moment an email is confirmed: requests other people sent to this address attach
 * to the account, and the requests typed at sign-up are finally sent.
 */
export async function onEmailConfirmed(account, baseUrl) {
  await attachPendingLinks(account);
  const queued = Array.isArray(account.pending_invites) ? account.pending_invites.slice(0, MAX_QUEUED_INVITES) : [];
  if (queued.length) {
    await clearPendingInvites(account.id); // first, so a crash can never send them twice
    for (const invite of queued) {
      try {
        const result = await requestLink(account, { email: String(invite?.email || ""), relation: String(invite?.relation || "") });
        await notifyLinkRequest(account, result.event, baseUrl);
      } catch {
        // A queued request that no longer fits (own email, wrong relation) is dropped.
      }
    }
  }
}

/**
 * Uses a confirm-email token up and confirms the account.
 * @returns {Promise<{ ok: true, account: object } | { ok: false }>}
 */
export async function verifyEmailWithToken(rawToken, baseUrl) {
  const used = await consumeToken(rawToken, "verify_email");
  if (!used.ok) return { ok: false };
  const account = await markEmailVerified(used.accountId);
  if (!account) return { ok: false };
  await onEmailConfirmed(account, baseUrl);
  return { ok: true, account };
}

/* ------------------------------------------------------------------ reset password */

/**
 * Starts a reset for an email. The caller must answer the same way whether or not the email has an
 * account; this returns nothing a browser should see except the mail outcome for an existing account
 * (only ever used for the development preview).
 */
export async function startPasswordReset(email, baseUrl) {
  const account = await findAccountByEmail(normalizeEmail(email));
  if (!account) return null;
  const { token } = await issueToken(account.id, "reset_password");
  const url = pathUrl(baseUrl, `/reset-password?token=${encodeURIComponent(token)}`);
  return mailOutcome(await sendMail(resetPasswordMail({ to: account.email, name: account.display_name, url })));
}

/**
 * Sets a new password from a reset link. The token is only used up when the new password is acceptable, so a
 * typo does not burn the link. Afterwards: every other reset link is dead, older sessions are dead
 * (password_changed_at), the lock is cleared, and the email counts as confirmed (they just proved they
 * read it).
 * @returns {Promise<{ ok: true, account: object } | { ok: false, invalidLink?: boolean, error?: string }>}
 */
export async function resetPasswordWithToken({ token, password, passwordConfirm, baseUrl }) {
  const peek = await peekToken(token, "reset_password");
  if (!peek.ok) return { ok: false, invalidLink: true, error: "This link is invalid or has expired. Ask for a new one." };
  const found = await findAccountById(peek.accountId);
  if (!found) return { ok: false, invalidLink: true, error: "This link is invalid or has expired. Ask for a new one." };
  const rules = validatePasswordPair(password, passwordConfirm, found.email);
  if (!rules.ok) return { ok: false, error: rules.error };
  const used = await consumeToken(token, "reset_password");
  if (!used.ok) return { ok: false, invalidLink: true, error: "This link is invalid or has expired. Ask for a new one." };
  await setAccountPassword(found.id, await hashPassword(String(password)));
  // From here on every session issued before this moment is refused (see sessionRevocation.js).
  await invalidateTokens(found.id, "reset_password");
  // Requests queued at sign-up were typed by whoever created the account, who may not be the owner of this
  // mailbox (someone can sign up with another person's address): they are dropped, not sent in the owner's name.
  if (Array.isArray(found.pending_invites) && found.pending_invites.length) await clearPendingInvites(found.id);
  const account = await markEmailVerified(found.id);
  if (account) await onEmailConfirmed(account, baseUrl);
  return { ok: true, account: account || found };
}

/* ------------------------------------------------------------------ connection emails */

async function loadLink(linkId) {
  const { data, error } = await createSupabaseAdminClient().from("account_links").select("*").eq("id", linkId).maybeSingle();
  if (error) throw error;
  return data || null;
}

const recent = (value, gapMs, now) => Boolean(value) && now - new Date(value).getTime() < gapMs;

/**
 * Tells the person who was asked (or invites them to sign up). At most one email per pair every 24 h (7 days
 * when there is no account yet), at most 30 a day per sender, and only the sender's name, role and email are
 * included. Needs the verification migration (the stored timestamps) and never throws.
 * @returns {Promise<{ sent: boolean }>}
 */
export async function notifyLinkRequest(requester, event, baseUrl, { now = Date.now() } = {}) {
  try {
    if (!event) return { sent: false };
    if (event.type === "accepted") return await notifyLinkAccepted(requester, event.linkId, baseUrl, { now });
    if (!(await supportsVerification())) return { sent: false };
    if (senderLimiter.isBlocked(requester.id)) return { sent: false };
    const link = await loadLink(event.linkId);
    if (!link || link.status !== "pending") return { sent: false };
    const gap = event.targetKnown ? REQUEST_EMAIL_GAP_MS : INVITE_EMAIL_GAP_MS;
    if (recent(link.notified_at, gap, now)) return { sent: false };

    const { data: mine, error } = await createSupabaseAdminClient().from("account_links").select("notified_at").eq("requester_id", requester.id).order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    if ((mine || []).filter((row) => recent(row.notified_at, REQUEST_EMAIL_GAP_MS, now)).length >= MAX_NOTIFY_EMAILS_PER_SENDER_PER_DAY) return { sent: false };

    const sender = { displayName: requester.display_name, role: requester.role, email: requester.email };
    senderLimiter.fail(requester.id);
    const message = event.targetKnown
      ? linkRequestMail({ to: link.target_email, sender, url: pathUrl(baseUrl, "/platform?page=connections") })
      : invitationMail({ to: link.target_email, sender, url: pathUrl(baseUrl, "/login?mode=signup") });
    const result = await sendMail(message);
    if (result.delivered || result.devPreview) {
      const { error: stampError } = await createSupabaseAdminClient().from("account_links").update({ notified_at: new Date(now).toISOString() }).eq("id", link.id);
      if (stampError) throw stampError;
    }
    return { sent: Boolean(result.delivered) };
  } catch (error) {
    console.warn("[accounts] could not send the connection email:", error?.message || error);
    return { sent: false };
  }
}

/** Tells the person who asked that their request was accepted (once per pair per 24 h). Never throws. */
export async function notifyLinkAccepted(accepter, linkId, baseUrl, { now = Date.now() } = {}) {
  try {
    if (!(await supportsVerification())) return { sent: false };
    const link = await loadLink(linkId);
    if (!link || link.status !== "accepted" || link.requester_id === accepter.id) return { sent: false };
    if (recent(link.accepted_notified_at, ACCEPTED_EMAIL_GAP_MS, now)) return { sent: false };
    const message = linkAcceptedMail({
      to: link.requester_email,
      accepter: { displayName: accepter.display_name, role: accepter.role, email: accepter.email },
      url: pathUrl(baseUrl, "/platform?page=connections")
    });
    const result = await sendMail(message);
    if (result.delivered || result.devPreview) {
      const { error } = await createSupabaseAdminClient().from("account_links").update({ accepted_notified_at: new Date(now).toISOString() }).eq("id", link.id);
      if (error) throw error;
    }
    return { sent: Boolean(result.delivered) };
  } catch (error) {
    console.warn("[accounts] could not send the acceptance email:", error?.message || error);
    return { sent: false };
  }
}
