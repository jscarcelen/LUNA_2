/**
 * Ownership checks for the API routes that take a workspace or document id from the request
 * (mastery, patterns, recommendations, concepts, replan, attempts). Only used when the request comes
 * from a logged-in account: the public demo keeps its single shared owner and is not checked.
 *
 *   const denied = await denyUnlessOwner(request, { workspaceId, documentId });
 *   if (denied) return denied;
 */
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "./supabaseClient.js";
import { accountIdFor } from "./session.js";

export async function accountOwnsWorkspace(accountId, workspaceId) {
  if (!workspaceId) return true;
  const { data, error } = await createSupabaseAdminClient().from("workspaces").select("owner_user_id").eq("id", workspaceId).maybeSingle();
  if (error) throw error;
  return data?.owner_user_id === accountId;
}

export async function accountOwnsDocument(accountId, documentId) {
  if (!documentId) return true;
  const client = createSupabaseAdminClient();
  const { data: document, error } = await client.from("documents").select("subject_id").eq("id", documentId).maybeSingle();
  if (error) throw error;
  if (!document) return false;
  const { data: subject, error: subjectError } = await client.from("subjects").select("workspace_id").eq("id", document.subject_id).maybeSingle();
  if (subjectError) throw subjectError;
  return subject ? accountOwnsWorkspace(accountId, subject.workspace_id) : false;
}

/** @returns {Promise<Response | null>} a 404 to send back, or null when the request may go on. */
export async function denyUnlessOwner(request, { workspaceId = "", documentId = "" } = {}) {
  const accountId = accountIdFor(request);
  if (!accountId) return null;
  if ((await accountOwnsWorkspace(accountId, workspaceId)) && (await accountOwnsDocument(accountId, documentId))) return null;
  return NextResponse.json({ error: "That item was not found in your workspace." }, { status: 404 });
}
