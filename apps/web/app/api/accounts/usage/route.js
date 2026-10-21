/**
 * The top-bar meters of a logged-in account.
 *
 * GET /api/accounts/usage -> {
 *   account: true,
 *   ai: { usedCredits, limitCredits, leftCredits, percentUsed, resetsAt, byActivity: [{ activity, credits, uses }] },
 *   storage: { usedBytes, limitBytes, percentUsed, files, byKind: [{ kind, bytes }], biggest: [{ id, name, subject, kind, bytes }] }
 * }
 * Without a session: { account: false }. Before migration 202610210003_ai_usage_storage.sql: { account: true, setupNeeded: true }.
 */
import { json } from "../../../../lib/accountsApi.js";
import { accountIdForFresh } from "../../../../lib/session.js";
import { isSupabaseConfigured } from "../../../../lib/supabaseClient.js";
import { findAccountById } from "../../../../lib/accountsRepository.js";
import { USAGE_MIGRATION, isUsageSetupMissing, readAiUsage, readStorageUsage } from "../../../../lib/usageRepository.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(request) {
  if (!isSupabaseConfigured()) return json({ account: false });
  const accountId = await accountIdForFresh(request);
  if (!accountId) return json({ account: false });
  try {
    const account = await findAccountById(accountId);
    const [ai, storage] = await Promise.all([readAiUsage(accountId, account?.role || "student"), readStorageUsage(accountId)]);
    return json({ account: true, ai, storage });
  } catch (error) {
    if (isUsageSetupMissing(error)) return json({ account: true, setupNeeded: true, migration: USAGE_MIGRATION });
    console.error("[api/accounts/usage]", error);
    return json({ account: true, error: "Usage could not be loaded." }, 500);
  }
}
