/**
 * Consent of a parent/guardian for a child under 14 (GDPR/LOPDGDD art. 7, COPPA). The flow:
 *   1. The child gives only their first name, birth date and the guardian's email. `requestGuardianConsent` stores
 *      exactly that (plus a hash of the link) and mails the guardian. No account, no IP, no cookie, no child email.
 *   2. The guardian opens the link (`peekGuardianRequest` shows what it is about) and decides.
 *   3. On "I consent" `completeGuardianConsent` creates the child's account and the guardian's own parent account
 *      (or links an existing parent account), connects them, and deletes the request. Refusing, or doing nothing for
 *      48 hours, deletes the request too.
 */
import { GUARDIAN_CONSENT_TTL_MS, TERMS_VERSION, ageFromBirthDate, hashPassword, isValidEmail, needsGuardianConsent, normalizeDisplayName, normalizeEmail, pairKey, parseBirthDate, validatePasswordPair } from "./accountsCore.js";
import { generateToken, hashToken } from "./accountTokens.js";
import { EmailTakenError, ensureFirstWorkspace, findAccountByEmail, insertAccount, markEmailVerified } from "./accountsRepository.js";
import { mailOutcome } from "./accountFlows.js";
import { guardianConsentMail } from "./mailTemplates.js";
import { sendMail } from "./mailer.js";
import { createSupabaseAdminClient } from "./supabaseClient.js";

const SHAPE = /^[A-Za-z0-9_-]{43}$/;
export const MAX_PENDING_PER_GUARDIAN = 3;

export class GuardianError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/** First name only: that is all a child gives before a guardian consents. */
export const firstNameOf = (value) => normalizeDisplayName(value).split(" ")[0].slice(0, 40);

async function purgeExpired(client) {
  await client.from("guardian_consents").delete().lt("expires_at", new Date().toISOString());
}

/** @returns {Promise<{ delivered: boolean }>} the email outcome; the response never says whether the guardian already has an account */
export async function requestGuardianConsent({ studentName, birthDate, guardianEmail, baseUrl, now = new Date() }) {
  const born = parseBirthDate(birthDate, now);
  if (!born) throw new GuardianError("bad_birth_date", "Enter a valid birth date.");
  if (!needsGuardianConsent(ageFromBirthDate(born, now))) throw new GuardianError("not_needed", "A parent or guardian is only needed under 14.");
  const email = normalizeEmail(guardianEmail);
  if (!isValidEmail(email)) throw new GuardianError("bad_email", "Enter your parent or guardian's email address.");
  const name = firstNameOf(studentName);
  if (!name) throw new GuardianError("bad_name", "Enter your first name.");

  const client = createSupabaseAdminClient();
  await purgeExpired(client);
  const { count, error: countError } = await client.from("guardian_consents").select("id", { count: "exact", head: true }).eq("guardian_email", email);
  if (countError) throw countError;
  if ((count || 0) >= MAX_PENDING_PER_GUARDIAN) throw new GuardianError("too_many", "That address already has pending requests. They expire in 48 hours.", 429);

  const { token, hash } = generateToken();
  const { error } = await client.from("guardian_consents").insert({
    token_hash: hash,
    guardian_email: email,
    student_name: name,
    birth_date: born,
    expires_at: new Date(now.getTime() + GUARDIAN_CONSENT_TTL_MS).toISOString()
  });
  if (error) throw error;
  const url = `${String(baseUrl).replace(/\/+$/, "")}/guardian?token=${encodeURIComponent(token)}`;
  return mailOutcome(await sendMail(guardianConsentMail({ to: email, studentName: name, url })));
}

async function findLive(rawToken, now) {
  const value = String(rawToken || "").trim();
  if (!SHAPE.test(value)) return null;
  const { data, error } = await createSupabaseAdminClient().from("guardian_consents").select("*").eq("token_hash", hashToken(value)).maybeSingle();
  if (error) throw error;
  if (!data || new Date(data.expires_at).getTime() <= now.getTime()) return null;
  return data;
}

/** What the guardian page shows: the child's first name, never anything else. */
export async function peekGuardianRequest(rawToken, now = new Date()) {
  const row = await findLive(rawToken, now);
  return row ? { studentName: row.student_name, guardianEmail: row.guardian_email } : null;
}

export async function refuseGuardianRequest(rawToken, now = new Date()) {
  const row = await findLive(rawToken, now);
  if (row) await createSupabaseAdminClient().from("guardian_consents").delete().eq("id", row.id);
  return Boolean(row);
}

/**
 * The guardian said yes. Creates the child's account (login email and password chosen here, by the guardian) and the
 * guardian's parent account, connects them, deletes the request.
 * @returns {Promise<{ student: object, guardian: object, createdGuardian: boolean }>}
 */
export async function completeGuardianConsent(rawToken, { guardianName, guardianPassword, guardianPasswordConfirm, studentEmail, studentPassword, now = new Date() }) {
  const row = await findLive(rawToken, now);
  if (!row) throw new GuardianError("expired", "This link has expired or was already used. Ask your child to start again.", 410);
  const childEmail = normalizeEmail(studentEmail);
  if (!isValidEmail(childEmail)) throw new GuardianError("bad_email", "Enter the email your child will log in with.");
  if (childEmail === row.guardian_email) throw new GuardianError("same_email", "Your child needs their own login email, different from yours.");
  const childPassword = validatePasswordPair(studentPassword, studentPassword, childEmail);
  if (!childPassword.ok) throw new GuardianError("bad_student_password", childPassword.error);

  let guardian = await findAccountByEmail(row.guardian_email);
  let createdGuardian = false;
  if (guardian && guardian.role !== "parent") throw new GuardianError("not_parent", "That email belongs to a Luna account that is not a parent account. Use another email, or log in with a parent account.", 409);
  if (!guardian) {
    const name = normalizeDisplayName(guardianName);
    if (!name) throw new GuardianError("bad_name", "Enter your name.");
    const password = validatePasswordPair(guardianPassword, guardianPasswordConfirm, row.guardian_email);
    if (!password.ok) throw new GuardianError("bad_password", password.error);
    guardian = await insertAccount({ email: row.guardian_email, passwordHash: await hashPassword(String(guardianPassword)), displayName: name, role: "parent", termsVersion: TERMS_VERSION });
    guardian = (await markEmailVerified(guardian.id)) || guardian; // the emailed link proves they own the address
    await ensureFirstWorkspace(guardian.id);
    createdGuardian = true;
  }

  let student;
  try {
    const age = ageFromBirthDate(row.birth_date, now);
    student = await insertAccount({
      email: childEmail,
      passwordHash: await hashPassword(String(studentPassword)),
      displayName: row.student_name,
      role: "student",
      under13: age !== null && age < 13,
      birthDate: row.birth_date,
      isMinor: true,
      termsVersion: TERMS_VERSION,
      guardianConfirmed: true
    });
  } catch (error) {
    if (error instanceof EmailTakenError) throw new GuardianError("email_taken", "An account with that email already exists. Choose another email for your child.", 409);
    throw error;
  }
  await ensureFirstWorkspace(student.id);

  const client = createSupabaseAdminClient();
  const { error: linkError } = await client.from("account_links").insert({
    kind: "parent_student",
    requester_id: guardian.id,
    requester_email: guardian.email,
    target_id: student.id,
    target_email: student.email,
    status: "accepted",
    pair_key: pairKey("parent_student", guardian.email, student.email),
    responded_at: now.toISOString()
  });
  if (linkError && linkError.code !== "23505") throw linkError;
  await client.from("guardian_consents").delete().eq("id", row.id);
  return { student, guardian, createdGuardian };
}
