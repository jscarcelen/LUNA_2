/**
 * Data rights: export everything LUNA holds about an account, schedule its deletion (30-day grace period, cancelled by
 * logging in) and erase it for good. See docs/LEGAL_COMPLIANCE_PLAN.md (L8, L9).
 *
 * Tables keyed by `owner_user_id` (no foreign key to `accounts`) are listed in OWNER_TABLES and erased explicitly;
 * everything keyed by `accounts.id` (links, tokens, grants, groups, exam dates…) disappears with the account row (cascade).
 */
import { createSupabaseAdminClient } from "./supabaseClient.js";
import { listWorkspaceTree } from "./workspacesRepository.js";
import { findAccountById } from "./accountsRepository.js";
import { publicBaseUrl, sendMail } from "./mailer.js";
import { inactivityWarningMail } from "./mailTemplates.js";

export const DELETION_GRACE_DAYS = 30;
export const INACTIVE_MONTHS = 24;
export const INACTIVITY_NOTICE_DAYS = 30;
export const FEEDBACK_SCREENSHOT_DAYS = 90;
/** Deleted explicitly, in this order (children before parents), by `owner_user_id`. Missing tables are skipped. */
export const OWNER_TABLES = ["mark_reviews", "attempts", "student_concept_state", "study_plans", "concepts", "document_block_templates", "feedback_items", "feature_requests", "workspaces"];
const HEAVY_KEY = /base64|render_?html|screenshot/i;

/** A copy of a value without the heavy original-file payloads (they are the user's own uploads: download them from the app). */
export function stripHeavy(value) {
  if (Array.isArray(value)) return value.map(stripHeavy);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !HEAVY_KEY.test(key)).map(([key, inner]) => [key, stripHeavy(inner)]));
  }
  return value;
}

const missingTable = (error) => error && (error.code === "42P01" || error.code === "PGRST205" || /does not exist|could not find the table/i.test(String(error.message || "")));

async function rowsOf(client, table, column, value) {
  const { data, error } = await client.from(table).select("*").eq(column, value);
  if (error) {
    if (missingTable(error)) return [];
    throw error;
  }
  return data || [];
}

/** Everything about the account as one JSON-able object. Never includes the password hash or other people's data. */
export async function exportAccountData(accountId, now = new Date()) {
  const account = await findAccountById(accountId);
  if (!account) return null;
  const client = createSupabaseAdminClient();
  const [workspaces, attempts, mastery, plans, links, feedback] = await Promise.all([
    listWorkspaceTree(accountId).catch(() => []),
    rowsOf(client, "attempts", "owner_user_id", accountId),
    rowsOf(client, "student_concept_state", "owner_user_id", accountId),
    rowsOf(client, "study_plans", "owner_user_id", accountId),
    rowsOf(client, "account_links", "requester_id", accountId),
    rowsOf(client, "feedback_items", "owner_user_id", accountId)
  ]);
  const attemptIds = attempts.map((row) => row.id).filter(Boolean);
  let attemptResults = [];
  if (attemptIds.length) {
    const { data, error } = await client.from("attempt_results").select("*").in("attempt_id", attemptIds);
    if (error && !missingTable(error)) throw error;
    attemptResults = data || [];
  }
  const { password_hash: _hash, failed_logins: _failed, locked_until: _locked, ...profile } = account;
  return stripHeavy({
    exportedAt: now.toISOString(),
    note: "Everything LUNA stores about this account. The original files you uploaded are not repeated here: download them from your workspace.",
    account: profile,
    workspaces,
    attempts,
    attemptResults,
    masteryPerConcept: mastery,
    studyPlans: plans,
    connectionsYouRequested: links,
    feedbackYouSent: feedback
  });
}

/** Starts the grace period. @returns the date the account will be erased. */
export async function scheduleAccountDeletion(accountId, now = new Date()) {
  const when = new Date(now.getTime() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await createSupabaseAdminClient().from("accounts").update({ deletion_scheduled_at: when }).eq("id", accountId);
  if (error) throw error;
  return when;
}

/** Logging in cancels a scheduled deletion. */
export async function cancelAccountDeletion(accountId) {
  const { error } = await createSupabaseAdminClient().from("accounts").update({ deletion_scheduled_at: null }).eq("id", accountId);
  if (error) throw error;
}

/** Erases the account and everything it owns, now. */
export async function eraseAccount(accountId) {
  const client = createSupabaseAdminClient();
  for (const table of OWNER_TABLES) {
    const { error } = await client.from(table).delete().eq("owner_user_id", accountId);
    if (error && !missingTable(error)) throw error;
  }
  const { error } = await client.from("accounts").delete().eq("id", accountId);
  if (error) throw error;
}

/**
 * Inactivity policy: an account nobody has signed in to for INACTIVE_MONTHS gets an email; if there is still no sign-in
 * INACTIVITY_NOTICE_DAYS later, the normal 30-day deletion grace starts (signing in cancels it). Needs migration 202610130003.
 * @returns { warned, scheduled }
 */
export async function handleInactiveAccounts(now = new Date(), { send = sendMail } = {}) {
  const client = createSupabaseAdminClient();
  const result = { warned: 0, scheduled: 0 };
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - INACTIVE_MONTHS);
  const noticeCutoff = new Date(now.getTime() - INACTIVITY_NOTICE_DAYS * 86400000).toISOString();
  // 1. Warn.
  const warn = await client.from("accounts").select("id, email, display_name").lt("last_login_at", cutoff.toISOString()).is("inactivity_warned_at", null).is("deletion_scheduled_at", null).limit(100);
  if (warn.error) {
    if (/last_login_at|inactivity_warned_at|deletion_scheduled_at/.test(String(warn.error.message || ""))) return result;
    throw warn.error;
  }
  for (const row of warn.data || []) {
    const outcome = await send(inactivityWarningMail({ to: row.email, name: row.display_name, months: INACTIVE_MONTHS, days: INACTIVITY_NOTICE_DAYS + DELETION_GRACE_DAYS, loginUrl: `${publicBaseUrl()}/login` }));
    // Only mark as warned when the email really went out; otherwise try again tomorrow and never delete someone unwarned.
    if (!outcome?.delivered) continue;
    const { error } = await client.from("accounts").update({ inactivity_warned_at: now.toISOString() }).eq("id", row.id);
    if (error) throw error;
    result.warned += 1;
  }
  // 2. Start the grace period for those warned long enough ago who still have not come back.
  const due = await client.from("accounts").select("id").lt("last_login_at", cutoff.toISOString()).lt("inactivity_warned_at", noticeCutoff).is("deletion_scheduled_at", null).limit(100);
  if (due.error) throw due.error;
  for (const row of due.data || []) {
    await scheduleAccountDeletion(row.id, now);
    result.scheduled += 1;
  }
  return result;
}

/** Daily job: erase accounts whose grace period is over, and drop expired guardian requests. @returns how many accounts were erased */
export async function purgeDue(now = new Date()) {
  const client = createSupabaseAdminClient();
  await client.from("guardian_consents").delete().lt("expires_at", now.toISOString());
  // Retention: used or expired one-time tokens, and beta-feedback screenshots after 90 days (the text stays).
  await client.from("account_tokens").delete().lt("expires_at", now.toISOString());
  await client.from("feedback_items").update({ screenshot: null, has_screenshot: false }).lt("created_at", new Date(now.getTime() - FEEDBACK_SCREENSHOT_DAYS * 86400000).toISOString()).not("screenshot", "is", null);
  const { data, error } = await client.from("accounts").select("id").lte("deletion_scheduled_at", now.toISOString()).not("deletion_scheduled_at", "is", null).limit(200);
  if (error) {
    if (/deletion_scheduled_at/.test(String(error.message || ""))) return 0;
    throw error;
  }
  let erased = 0;
  for (const row of data || []) {
    await eraseAccount(row.id);
    erased += 1;
  }
  return erased;
}
