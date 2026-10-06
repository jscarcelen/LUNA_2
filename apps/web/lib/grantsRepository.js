/**
 * Live shares (share_grants), the database side. The rules live in grants.js (pure); this file loads the facts
 * they need and writes the rows. Everything is decided from the logged-in account (the session), never from ids
 * in a request body: the sharer must own the item, every recipient must be an accepted connection, and a grantee
 * can never hand a share on (only the owner shares).
 *
 * Needs supabase/migrations/202610060001_network_sharing_grants.sql; without it every function that writes
 * throws a SharingSetupError (a 503 `setupNeeded` naming the migration) and the readers answer "nothing shared".
 */
import { createSupabaseAdminClient } from "./supabaseClient.js";
import { LinkError, assertEmailVerified, authorizeDelivery, classifyDeliverable } from "./accountsCore.js";
import { assertSharingReady, findAccountById, findAccountsByIds, getAcceptedLink, listConnectedIds, supportsSharing } from "./accountsRepository.js";
import { isGrantKind, isPermission, normalizeGrant, resolveAccess } from "./grants.js";
import { loadWorkspaceFacts } from "./workspaceGuard.js";
import { isReservedSubjectName } from "../modules/accounts/shared.js";
import { GENERATED_ROOT, LOOSE_FOLDER, MATERIAL_FOLDER, PLANS_ROOT, UPLOADED_FOLDER } from "../modules/plans/folders.js";

export const MAX_GRANTEES = 50;

const parseJson = (text) => {
  try {
    const parsed = JSON.parse(String(text || ""));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

/* ------------------------------------------------------------------ reading */

/** This account's live grants (as grantee) and the accounts it is connected to: what the guard resolves with. */
export async function loadGrantContext(accountId) {
  if (!accountId || !(await supportsSharing())) return { grants: [], connections: new Set() };
  const { data, error } = await createSupabaseAdminClient().from("share_grants").select("*").eq("grantee_id", accountId).is("revoked_at", null);
  if (error) throw error;
  return { grants: (data || []).map(normalizeGrant), connections: await listConnectedIds(accountId) };
}

/** Grants that still work: not revoked and the owner is still a connection. */
export async function activeGrantsFor(accountId) {
  const { grants, connections } = await loadGrantContext(accountId);
  return grants.filter((grant) => connections.has(grant.ownerId));
}

async function grantRow(grantId) {
  const { data, error } = await createSupabaseAdminClient().from("share_grants").select("*").eq("id", grantId).maybeSingle();
  if (error) throw error;
  return data || null;
}

const person = (row) => ({ id: row?.id || "", displayName: row?.display_name || "", email: row?.email || "", role: row?.role || "" });

/** Who has access to one of MY items, and how. Only the owner may ask (404 for anything else). */
export async function listGrantsOnItem(owner, { kind, id }) {
  if (!(await supportsSharing())) return [];
  await assertOwnsItem(owner, { kind, id });
  const { data, error } = await createSupabaseAdminClient().from("share_grants").select("*").eq("owner_id", owner.id).eq("item_kind", kind).eq("item_id", id).is("revoked_at", null);
  if (error) throw error;
  const people = await findAccountsByIds((data || []).map((row) => row.grantee_id));
  const byId = new Map(people.map((row) => [row.id, row]));
  return (data || []).map((row) => ({ id: row.id, permission: row.permission, createdAt: row.created_at, grantee: person(byId.get(row.grantee_id) || { id: row.grantee_id }) }));
}

/** Everything shared BY me (grouped by item) and WITH me, for the Connections page. */
export async function listGrantOverview(account) {
  if (!(await supportsSharing())) return { given: [], received: [], supported: false };
  const client = createSupabaseAdminClient();
  const [given, received] = await Promise.all([
    client.from("share_grants").select("*").eq("owner_id", account.id).is("revoked_at", null),
    client.from("share_grants").select("*").eq("grantee_id", account.id).is("revoked_at", null)
  ]);
  if (given.error) throw given.error;
  if (received.error) throw received.error;
  const connections = await listConnectedIds(account.id);
  const people = await findAccountsByIds([...(given.data || []).map((row) => row.grantee_id), ...(received.data || []).map((row) => row.owner_id)]);
  const byId = new Map(people.map((row) => [row.id, row]));
  return {
    supported: true,
    given: (given.data || []).map((row) => ({ id: row.id, itemKind: row.item_kind, itemId: row.item_id, itemName: row.item_name || "", permission: row.permission, createdAt: row.created_at, grantee: person(byId.get(row.grantee_id) || { id: row.grantee_id }) })),
    received: (received.data || []).filter((row) => connections.has(row.owner_id)).map((row) => ({ id: row.id, itemKind: row.item_kind, itemId: row.item_id, itemName: row.item_name || "", permission: row.permission, createdAt: row.created_at, owner: person(byId.get(row.owner_id) || { id: row.owner_id }) }))
  };
}

/* ------------------------------------------------------------------ the item must be mine */

const refsFor = (kind, id) => ({ workspaceIds: [], subjectIds: kind === "subject" ? [id] : [], folderIds: kind === "folder" ? [id] : [], documentIds: kind === "document" ? [id] : [] });

/**
 * Loads one item and checks the account owns it. Throws a 404 for anything that is not the account's own
 * (the same answer as "does not exist").
 * @returns {Promise<{ name: string, tags: string[], facts: object }>}
 */
export async function assertOwnsItem(account, { kind, id }) {
  if (!isGrantKind(kind) || !id) throw new LinkError("bad_request", "Choose what to share.");
  const client = createSupabaseAdminClient();
  const facts = await loadWorkspaceFacts(client, refsFor(kind, String(id)));
  const access = resolveAccess({ accountId: account.id, item: { kind, id: String(id) }, facts });
  if (access !== "owner") throw new LinkError("not_found", "That item was not found in your workspace.", 404);
  let name = "";
  let tags = [];
  let subjectId = "";
  if (kind === "document") {
    const document = facts.documents.get(id);
    name = document.name;
    tags = document.tags;
    subjectId = document.subjectId;
  } else if (kind === "folder") {
    const { data, error } = await client.from("folders").select("name").eq("id", id).maybeSingle();
    if (error) throw error;
    name = data?.name || "Folder";
    subjectId = facts.folders.get(id).subjectId;
  } else {
    name = facts.subjects.get(id).name;
    subjectId = id;
  }
  if (isReservedSubjectName(facts.subjects.get(subjectId)?.name)) throw new LinkError("not_shareable", "Things that were shared with you cannot be shared again.", 400);
  return { name, tags, facts };
}

/* ------------------------------------------------------------------ writing */

/** Writes (or updates) one live grant. Returns { grant, created }. */
async function upsertGrant(client, { owner, grantee, kind, itemId, itemName, permission }) {
  const { data: existing, error } = await client.from("share_grants").select("*").eq("owner_id", owner.id).eq("grantee_id", grantee.id).eq("item_kind", kind).eq("item_id", itemId).is("revoked_at", null).maybeSingle();
  if (error) throw error;
  const now = new Date().toISOString();
  if (existing) {
    if (existing.permission === permission) return { grant: existing, created: false, changed: false };
    const { data, error: updateError } = await client.from("share_grants").update({ permission, item_name: itemName, updated_at: now }).eq("id", existing.id).select("*").maybeSingle();
    if (updateError) throw updateError;
    return { grant: data || { ...existing, permission }, created: false, changed: true };
  }
  const { data, error: insertError } = await client.from("share_grants").insert({ owner_id: owner.id, grantee_id: grantee.id, item_kind: kind, item_id: itemId, item_name: itemName, permission }).select("*").single();
  if (insertError) throw insertError;
  return { grant: data, created: true, changed: true };
}

/** The resources a plan points at (ids), from its stored content. */
function planResourceIdsOf(content) {
  const plan = parseJson(content);
  if (!plan || plan.kind !== "study-plan") return [];
  return [...new Set([
    ...(plan.items || []).map((item) => item?.resourceId),
    ...(plan.goals || []).flatMap((goal) => goal?.resourceIds || []),
    ...(plan.materialIds || [])
  ].filter(Boolean))];
}

/**
 * Share one of MY documents, folders (with their whole subtree) or topics with connections, as a live share.
 * A study plan is a document: it travels with the documents it uses, with the same permission, so the
 * recipient can open every step.
 * @param {object} args
 * @param {object} args.owner the logged-in account row
 * @param {"document" | "folder" | "subject"} args.kind
 * @param {string} args.itemId
 * @param {string[]} args.recipientIds
 * @param {"view" | "edit"} args.permission
 * @returns {Promise<{ itemName: string, results: Array<{ recipientId: string, ok: boolean, error?: string, status?: number, grantId?: string, created?: boolean, changed?: boolean, extra?: number }> }>}
 */
export async function shareItem({ owner, kind, itemId, recipientIds, permission }) {
  assertEmailVerified(owner, "share work");
  await assertSharingReady();
  if (!isGrantKind(kind)) throw new LinkError("bad_request", "Choose what to share.");
  if (!isPermission(permission)) throw new LinkError("bad_permission", "Choose “Can view” or “Can edit”.");
  const ids = [...new Set((recipientIds || []).map((id) => String(id || "")).filter(Boolean))].slice(0, MAX_GRANTEES);
  if (!ids.length) throw new LinkError("bad_request", "Choose at least one person.");

  const item = await assertOwnsItem(owner, { kind, id: String(itemId || "") });
  if (kind === "document") {
    const verdict = classifyDeliverable({ tags: item.tags }, "share");
    if (!verdict.ok) throw new LinkError("not_shareable", verdict.error, 400);
  }

  const client = createSupabaseAdminClient();
  // A study plan brings the documents it uses (only ones that are mine and shareable).
  const extras = [];
  if (kind === "document" && item.tags.includes("study-plan")) {
    const { data } = await client.from("documents").select("content").eq("id", itemId).maybeSingle();
    for (const resourceId of planResourceIdsOf(data?.content)) {
      try {
        const resource = await assertOwnsItem(owner, { kind: "document", id: resourceId });
        if (classifyDeliverable({ tags: resource.tags }, "share").ok) extras.push({ id: resourceId, name: resource.name });
      } catch { /* not mine, or not shareable: the plan simply shows it as plain text */ }
    }
  }

  // ...and the folder the plan lives in (its own folder under "Study plans", never the structural ones every topic has).
  const extraFolders = [];
  if (kind === "document" && item.tags.includes("study-plan")) {
    const structural = new Set([UPLOADED_FOLDER, GENERATED_ROOT, PLANS_ROOT, LOOSE_FOLDER, MATERIAL_FOLDER].map((name) => name.toLowerCase()));
    const folderIds = item.facts.documents.get(String(itemId))?.folderIds || [];
    if (folderIds.length) {
      const { data } = await client.from("folders").select("id, name").in("id", folderIds);
      for (const folder of data || []) if (!structural.has(String(folder.name || "").trim().toLowerCase())) extraFolders.push({ id: folder.id, name: folder.name });
    }
  }

  const results = [];
  for (const recipientId of ids) {
    try {
      const recipient = await findAccountById(recipientId);
      const link = recipient ? await getAcceptedLink(owner.id, recipient.id) : null;
      const allowed = authorizeDelivery({ mode: "share", sender: { id: owner.id, role: owner.role }, recipient: recipient ? { id: recipient.id, role: recipient.role } : null, link });
      if (!allowed.ok) throw new LinkError("not_allowed", allowed.error, allowed.status);
      const main = await upsertGrant(client, { owner, grantee: recipient, kind, itemId: String(itemId), itemName: item.name, permission });
      for (const extra of extras) await upsertGrant(client, { owner, grantee: recipient, kind: "document", itemId: extra.id, itemName: extra.name, permission });
      for (const folder of extraFolders) await upsertGrant(client, { owner, grantee: recipient, kind: "folder", itemId: folder.id, itemName: folder.name, permission });
      results.push({ recipientId, ok: true, grantId: main.grant.id, created: main.created, changed: main.changed, extra: extras.length + extraFolders.length });
    } catch (error) {
      if (!(error instanceof LinkError)) throw error;
      results.push({ recipientId, ok: false, error: error.message, status: error.status });
    }
  }
  return { itemName: item.name, results };
}

/** Change what one person may do with an item of mine (owner only). */
export async function changeGrantPermission(owner, grantId, permission) {
  await assertSharingReady();
  if (!isPermission(permission)) throw new LinkError("bad_permission", "Choose “Can view” or “Can edit”.");
  const row = await grantRow(grantId);
  if (!row || row.owner_id !== owner.id || row.revoked_at) throw new LinkError("not_found", "That share was not found.", 404);
  const { error } = await createSupabaseAdminClient().from("share_grants").update({ permission, updated_at: new Date().toISOString() }).eq("id", row.id);
  if (error) throw error;
  return { ...row, permission };
}

/** The owner takes access away: immediate. */
export async function revokeGrant(owner, grantId) {
  await assertSharingReady();
  const row = await grantRow(grantId);
  if (!row || row.owner_id !== owner.id) throw new LinkError("not_found", "That share was not found.", 404);
  if (row.revoked_at) return row;
  const { error } = await createSupabaseAdminClient().from("share_grants").update({ revoked_at: new Date().toISOString() }).eq("id", row.id);
  if (error) throw error;
  return row;
}

/** The grantee gives a share up ("Leave"). Their own notes and attempts stay theirs. */
export async function leaveGrant(grantee, grantId) {
  await assertSharingReady();
  const row = await grantRow(grantId);
  if (!row || row.grantee_id !== grantee.id) throw new LinkError("not_found", "That share was not found.", 404);
  if (row.revoked_at) return row;
  const { error } = await createSupabaseAdminClient().from("share_grants").update({ revoked_at: new Date().toISOString() }).eq("id", row.id);
  if (error) throw error;
  return row;
}

/** When a connection ends, so does the live access in both directions. Best effort without the migration. */
export async function revokeGrantsBetween(accountA, accountB) {
  if (!accountA || !accountB || !(await supportsSharing())) return 0;
  const client = createSupabaseAdminClient();
  const now = new Date().toISOString();
  let count = 0;
  for (const [owner, grantee] of [[accountA, accountB], [accountB, accountA]]) {
    const { data, error } = await client.from("share_grants").update({ revoked_at: now }).eq("owner_id", owner).eq("grantee_id", grantee).is("revoked_at", null).select("id");
    if (error) throw error;
    count += (data || []).length;
  }
  return count;
}

/** Deleting the original removes the grants on it (the database trigger does it too; this covers a database without it). */
export async function purgeGrantsFor(kind, ids) {
  const list = [...new Set((ids || []).filter(Boolean))];
  if (!list.length || !(await supportsSharing())) return;
  const { error } = await createSupabaseAdminClient().from("share_grants").delete().eq("item_kind", kind).in("item_id", list);
  if (error) throw error;
}
