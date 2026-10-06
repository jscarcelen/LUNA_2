/** Beta feedback tool — storage (table feedback_items, service role only). TEMPORARY: see lib/feedbackCore.js. */
import { createSupabaseAdminClient } from "./supabaseClient.js";
import { STATUSES } from "./feedbackCore.js";

const LIST_COLUMNS = "id, created_at, updated_at, owner_user_id, author_name, signed_in, kind, message, quote, target, area, page, role, location, viewport, context, has_screenshot, status, admin_note";

export async function insertFeedback(row, { ownerUserId = "", signedIn = false } = {}) {
  const client = createSupabaseAdminClient();
  const { data, error } = await client.from("feedback_items").insert({ ...row, owner_user_id: ownerUserId || null, signed_in: signedIn }).select("id").single();
  if (error) throw error;
  return data;
}

export async function listFeedback() {
  const client = createSupabaseAdminClient();
  const { data, error } = await client.from("feedback_items").select(LIST_COLUMNS).order("created_at", { ascending: false }).limit(500);
  if (error) throw error;
  return data || [];
}

export async function feedbackScreenshot(id) {
  const client = createSupabaseAdminClient();
  const { data, error } = await client.from("feedback_items").select("screenshot").eq("id", id).maybeSingle();
  if (error) throw error;
  return data?.screenshot || "";
}

/** Sets the status (and optionally a note) of up to 100 items. */
export async function updateFeedback(ids, { status, note }) {
  const list = (Array.isArray(ids) ? ids : []).map(String).filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 100);
  if (!list.length) return 0;
  const patch = { updated_at: new Date().toISOString() };
  if (STATUSES.some((entry) => entry.id === status)) patch.status = status;
  if (typeof note === "string") patch.admin_note = note.slice(0, 1000);
  const client = createSupabaseAdminClient();
  const { error } = await client.from("feedback_items").update(patch).in("id", list);
  if (error) throw error;
  return list.length;
}

export async function deleteFeedback(ids) {
  const list = (Array.isArray(ids) ? ids : []).map(String).filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 100);
  if (!list.length) return 0;
  const client = createSupabaseAdminClient();
  const { error } = await client.from("feedback_items").delete().in("id", list);
  if (error) throw error;
  return list.length;
}

export const isFeedbackTableMissing = (error) => {
  const code = String(error?.code || "");
  const message = String(error?.message || error?.details || "").toLowerCase();
  return (code === "42P01" || code === "PGRST205" || code === "PGRST200") && message.includes("feedback_items");
};
