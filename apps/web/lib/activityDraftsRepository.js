/**
 * Quiz drafts on the server ("Save and finish later"). Server-side only (service role).
 * One row per account and activity in `activity_drafts` (migration 202610190002_activity_drafts.sql).
 * Until the migration is applied every call throws an error `isDraftsTableMissing` recognises; the route then
 * answers `setupNeeded` and the browser keeps the draft in localStorage.
 */
import { createSupabaseAdminClient } from "./supabaseClient.js";
import { MAX_DRAFT_CHARS, parseDraft } from "../modules/activities/drafts.js";

export const ACTIVITY_DRAFTS_MIGRATION = "202610190002_activity_drafts.sql";
const COLUMNS = "activity_document_id, draft, answered, total, updated_at";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isDraftsTableMissing = (error) => /activity_drafts/.test(String(error?.message || "")) && /does not exist|schema cache|relation|find the table/i.test(String(error?.message || ""));
export const isActivityDocumentId = (value) => UUID.test(String(value || ""));

export class DraftError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const rowOut = (row) => ({ activityDocumentId: row.activity_document_id, draft: row.draft, answered: row.answered, total: row.total, updatedAt: row.updated_at });

/** All my drafts (newest first), or the one for an activity. */
export async function listDrafts(ownerUserId, activityDocumentId = "") {
  let query = createSupabaseAdminClient().from("activity_drafts").select(COLUMNS).eq("owner_user_id", ownerUserId).order("updated_at", { ascending: false }).limit(200);
  if (activityDocumentId) query = query.eq("activity_document_id", activityDocumentId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(rowOut);
}

/** Saves (replaces) my draft of one activity. */
export async function saveDraft(ownerUserId, activityDocumentId, draftInput) {
  if (!isActivityDocumentId(activityDocumentId)) throw new DraftError("Say which quiz this draft belongs to.");
  const draft = parseDraft(draftInput);
  if (!draft) throw new DraftError("That is not a draft.");
  if (JSON.stringify(draft).length > MAX_DRAFT_CHARS) throw new DraftError("This draft is too large to save.", 413);
  const row = {
    owner_user_id: ownerUserId,
    activity_document_id: activityDocumentId,
    draft,
    answered: Math.max(0, Math.round(Number(draft.answered) || 0)),
    total: Math.max(0, Math.round(Number(draft.total) || 0)),
    updated_at: new Date().toISOString()
  };
  const { data, error } = await createSupabaseAdminClient().from("activity_drafts").upsert(row, { onConflict: "owner_user_id,activity_document_id" }).select(COLUMNS).single();
  if (error) throw error;
  return rowOut(data);
}

/** Deletes my draft of one activity (after submitting, or "start again"). */
export async function deleteDraft(ownerUserId, activityDocumentId) {
  if (!isActivityDocumentId(activityDocumentId)) return;
  const { error } = await createSupabaseAdminClient().from("activity_drafts").delete().eq("owner_user_id", ownerUserId).eq("activity_document_id", activityDocumentId);
  if (error) throw error;
}
