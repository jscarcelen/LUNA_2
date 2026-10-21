/**
 * AI credits and storage of one owner, read from the database. Server-side only (service role).
 * Needs migration 202610210003_ai_usage_storage.sql; until it is applied every reader throws an error
 * `isUsageSetupMissing` recognises, and callers treat that as "not set up yet" (nothing is limited).
 */
import { createSupabaseAdminClient } from "./supabaseClient.js";
import { monthWindow, monthlyCreditsFor, storageLimitBytes, summariseAiUsage, summariseStorage } from "./usageCore.js";

export const USAGE_MIGRATION = "202610210003_ai_usage_storage.sql";

export const isUsageSetupMissing = (error) => {
  const text = String(error?.message || "");
  return error?.code === "42P01" || error?.code === "PGRST205" || error?.code === "PGRST202" || ((/ai_usage_events|account_storage_by_document/.test(text)) && /does not exist|schema cache|could not find/i.test(text));
};

/** This month's rows of an owner (at most 20,000: about 650 AI uses a day). */
async function monthRows(ownerUserId, start) {
  const { data, error } = await createSupabaseAdminClient().from("ai_usage_events").select("activity, tokens, calls, created_at").eq("owner_user_id", ownerUserId).gte("created_at", start).order("created_at", { ascending: false }).limit(20000);
  if (error) throw error;
  return data || [];
}

export async function readAiUsage(ownerUserId, role, { now = new Date(), env = process.env } = {}) {
  const { start, resetsAt } = monthWindow(now);
  return summariseAiUsage(await monthRows(ownerUserId, start), { limitCredits: monthlyCreditsFor(role, env), resetsAt });
}

export async function readStorageUsage(ownerUserId, { env = process.env } = {}) {
  const { data, error } = await createSupabaseAdminClient().rpc("account_storage_by_document", { p_owner: ownerUserId });
  if (error) throw error;
  return summariseStorage(data || [], { limitBytes: storageLimitBytes(env) });
}

export async function recordAiUsage({ ownerUserId, activity, tokens, calls }) {
  const { error } = await createSupabaseAdminClient().from("ai_usage_events").insert({ owner_user_id: ownerUserId, activity, tokens: Math.max(0, Math.round(tokens) || 0), calls: Math.max(1, calls) });
  if (error) throw error;
}
