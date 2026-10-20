/**
 * Ownership checks for the API routes that take a workspace or document id from the request
 * (mastery, patterns, recommendations, concepts, replan, attempts). A logged-in account must own the
 * items (or have them shared); the public demo acts as its single shared owner and may not name anyone else's.
 *
 *   const denied = await denyUnlessOwner(request, { workspaceId, documentId });
 *   if (denied) return denied;
 */
import { NextResponse } from "next/server";
import { createSupabaseAdminClient, getDemoOwnerUserId } from "./supabaseClient.js";
import { accountIdForFresh } from "./session.js";
import { resolveAccess } from "./grants.js";
import { loadGrantContext } from "./grantsRepository.js";
import { loadWorkspaceFacts } from "./workspaceGuard.js";

/** The owner of a workspace, or undefined when there is no such workspace. */
async function ownerOfWorkspace(workspaceId) {
  const { data, error } = await createSupabaseAdminClient().from("workspaces").select("owner_user_id").eq("id", workspaceId).maybeSingle();
  if (error) throw error;
  return data ? data.owner_user_id : undefined;
}

async function documentExists(documentId) {
  const { data, error } = await createSupabaseAdminClient().from("documents").select("id").eq("id", documentId).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

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

/**
 * May this account at least VIEW the document: its own, or one a connection shared with it (live grant)?
 * Used where someone works on a shared document without changing it (answering a shared quiz).
 */
export async function accountMayViewDocument(accountId, documentId) {
  if (!documentId) return true;
  if (await accountOwnsDocument(accountId, documentId)) return true;
  const client = createSupabaseAdminClient();
  const facts = await loadWorkspaceFacts(client, { workspaceIds: [], subjectIds: [], folderIds: [], documentIds: [String(documentId)] }, { actorId: accountId });
  const { grants, connections } = await loadGrantContext(accountId);
  return Boolean(resolveAccess({ accountId, item: { kind: "document", id: String(documentId) }, facts, grants, connections }));
}

/**
 * @param {{ workspaceId?: string, documentId?: string, allowShared?: boolean }} [what]
 *   `allowShared`: the document may also be one shared with the account (view is enough).
 * @returns {Promise<Response | null>} a 404 to send back, or null when the request may go on.
 */
export async function denyUnlessOwner(request, { workspaceId = "", documentId = "", allowShared = false } = {}) {
  const accountId = await accountIdForFresh(request);
  if (!accountId) {
    // The public demo acts as the shared demo owner: it may only name the demo owner's own items.
    // An id that does not exist is left to the route (sample activities of the demo are not stored).
    const demoOwnerId = getDemoOwnerUserId();
    const foreignWorkspace = workspaceId && (await ownerOfWorkspace(workspaceId)) !== undefined && !(await accountOwnsWorkspace(demoOwnerId, workspaceId));
    const foreignDocument = documentId && (await documentExists(documentId)) && !(await accountOwnsDocument(demoOwnerId, documentId));
    if (!foreignWorkspace && !foreignDocument) return null;
    return NextResponse.json({ error: "That item was not found in your workspace." }, { status: 404 });
  }
  const documentOk = allowShared ? await accountMayViewDocument(accountId, documentId) : await accountOwnsDocument(accountId, documentId);
  if ((await accountOwnsWorkspace(accountId, workspaceId)) && documentOk) return null;
  return NextResponse.json({ error: "That item was not found in your workspace." }, { status: 404 });
}
