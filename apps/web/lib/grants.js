/**
 * Live sharing: who may do what with someone else's documents, folders and topics. PURE (no database, no
 * Next): everything is decided from facts the caller loaded, so every rule is unit tested
 * (tests/accounts/grants.test.js). The server asks this module and nothing else.
 *
 *   resolveAccess({ accountId, item, facts, grants, connections }) -> "owner" | "edit" | "view" | null
 *
 * - The OWNER of an item is the owner of the workspace it lives in. Owners always keep full control.
 * - A grant is { ownerId, granteeId, itemKind: "document" | "folder" | "subject", itemId, permission, revokedAt }.
 *   It covers the item itself and everything under it: a folder covers its whole subtree (folders and the
 *   documents filed in them, also what is added later), a subject covers all its folders and documents.
 * - A grant only counts while the grantee is still CONNECTED to the owner (an accepted link), is not revoked,
 *   and was made by the actual owner of the item: sharing someone else's shared item onward creates nothing
 *   that resolves. Luna's private bookkeeping documents (notes, attempts, goals, agents) never resolve for
 *   anyone but their owner.
 * - Permissions: "view" reads; "edit" also changes the original's content (so every version sees it), renames,
 *   and adds files/folders inside a shared folder; only the OWNER deletes, moves, re-tags, re-shares or restructures.
 */

export const GRANT_KINDS = ["document", "folder", "subject"];
export const PERMISSIONS = ["view", "edit"];
/** Documents that are somebody's private layer: never visible through a grant. */
export const PRIVATE_DOCUMENT_TAGS = ["doc-notes", "activity-attempt", "study-goal", "ai-agent"];
/** Stand-in id of a shared TOPIC inside the grantee's tree: `subj~<subjectId>`. Translated to the real subject by the guard. */
export const SUBJECT_NODE_PREFIX = "subj~";
const MAX_DEPTH = 64;

const RANK = { view: 1, edit: 2, owner: 3 };

export const isGrantKind = (value) => GRANT_KINDS.includes(value);
export const isPermission = (value) => PERMISSIONS.includes(value);
export const rankOf = (access) => RANK[access] || 0;
/** Does `access` reach `need` ("view" | "edit" | "owner")? */
export const atLeast = (access, need) => rankOf(access) >= (RANK[need] || RANK.owner);

export function subjectNodeId(subjectId) {
  return `${SUBJECT_NODE_PREFIX}${subjectId}`;
}
export const isSubjectNodeId = (id) => String(id || "").startsWith(SUBJECT_NODE_PREFIX);
export const subjectIdOfNode = (id) => String(id || "").slice(SUBJECT_NODE_PREFIX.length);

export const isPrivateDocument = (document) => (document?.tags || []).some((tag) => PRIVATE_DOCUMENT_TAGS.includes(String(tag).trim().toLowerCase()));

/** The grants that are in force (not revoked), as plain objects. Accepts database rows or shaped grants. */
export function normalizeGrant(row) {
  if (!row) return null;
  return {
    id: row.id,
    ownerId: row.ownerId ?? row.owner_id,
    granteeId: row.granteeId ?? row.grantee_id,
    itemKind: row.itemKind ?? row.item_kind,
    itemId: row.itemId ?? row.item_id,
    permission: row.permission,
    revokedAt: row.revokedAt ?? row.revoked_at ?? null,
    itemName: row.itemName ?? row.item_name ?? "",
    createdAt: row.createdAt ?? row.created_at ?? ""
  };
}

/* ------------------------------------------------------------------ where an item lives */

function subjectOwner(facts, subjectId) {
  const subject = facts.subjects?.get(subjectId);
  return subject ? facts.workspaceOwner?.get(subject.workspaceId) : undefined;
}

/** Who owns this item (the owner of its workspace), or undefined when the item is unknown. */
export function ownerOfItem(item, facts) {
  if (!item?.id) return undefined;
  if (item.kind === "subject") return subjectOwner(facts, item.id);
  if (item.kind === "folder") {
    const folder = facts.folders?.get(item.id);
    return folder ? subjectOwner(facts, folder.subjectId) : undefined;
  }
  if (item.kind === "document") {
    const document = facts.documents?.get(item.id);
    return document ? subjectOwner(facts, document.subjectId) : undefined;
  }
  return undefined;
}

/** The subject an item lives in. */
export function subjectOfItem(item, facts) {
  if (item.kind === "subject") return item.id;
  if (item.kind === "folder") return facts.folders?.get(item.id)?.subjectId;
  if (item.kind === "document") return facts.documents?.get(item.id)?.subjectId;
  return undefined;
}

/** A folder and every folder above it (the parent chain), cycle-safe. */
export function folderChain(folderId, facts) {
  const chain = [];
  const seen = new Set();
  let current = folderId;
  while (current && !seen.has(current) && chain.length < MAX_DEPTH) {
    seen.add(current);
    const folder = facts.folders?.get(current);
    if (!folder) break;
    chain.push(current);
    current = folder.parentFolderId || "";
  }
  return chain;
}

/**
 * Every node whose grant would cover this item: the item itself, the folders above it (for a document, above
 * every folder it is filed in) and its subject. Null when the item is unknown.
 */
export function coveringNodes(item, facts) {
  const subjectId = subjectOfItem(item, facts);
  if (!subjectId) return null;
  const nodes = [];
  if (item.kind === "document") {
    const document = facts.documents.get(item.id);
    nodes.push({ kind: "document", id: item.id });
    for (const folderId of document?.folderIds || []) for (const id of folderChain(folderId, facts)) nodes.push({ kind: "folder", id });
  } else if (item.kind === "folder") {
    for (const id of folderChain(item.id, facts)) nodes.push({ kind: "folder", id });
  } else if (item.kind === "subject") {
    nodes.push({ kind: "subject", id: item.id });
    return nodes;
  }
  nodes.push({ kind: "subject", id: subjectId });
  return nodes;
}

/* ------------------------------------------------------------------ the one rule */

/**
 * What may `accountId` do with `item`?
 * @param {object} args
 * @param {string} args.accountId the logged-in account (from the session, never from the request)
 * @param {{ kind: "document" | "folder" | "subject", id: string }} args.item
 * @param {object} args.facts { workspaceOwner: Map<workspaceId, ownerId>, subjects: Map<id, { workspaceId }>,
 *   folders: Map<id, { subjectId, parentFolderId }>, documents: Map<id, { subjectId, folderIds, tags }> }
 * @param {Array} args.grants grants (any account's: only the ones made to `accountId` by the item's owner count)
 * @param {Set<string> | string[]} args.connections ids of the accounts `accountId` has an accepted connection with
 * @returns {"owner" | "edit" | "view" | null}
 */
export function resolveAccess({ accountId, item, facts, grants = [], connections = [] }) {
  if (!accountId || !item?.id || !isGrantKind(item.kind) || !facts) return null;
  const owner = ownerOfItem(item, facts);
  if (!owner) return null;
  if (owner === accountId) return "owner";
  if (item.kind === "document" && isPrivateDocument(facts.documents.get(item.id))) return null;
  const connected = connections instanceof Set ? connections : new Set(connections || []);
  if (!connected.has(owner)) return null;
  const nodes = coveringNodes(item, facts);
  if (!nodes) return null;
  const covers = new Set(nodes.map((node) => `${node.kind}:${node.id}`));
  let best = null;
  for (const raw of grants) {
    const grant = normalizeGrant(raw);
    if (!grant || grant.revokedAt || grant.granteeId !== accountId || grant.ownerId !== owner) continue;
    if (!isPermission(grant.permission) || !covers.has(`${grant.itemKind}:${grant.itemId}`)) continue;
    if (rankOf(grant.permission) > rankOf(best)) best = grant.permission;
  }
  return best;
}

/**
 * May `accountId` hand `item` on (share it, change who can see it)? Only the owner: a grantee, even with edit
 * rights, can never re-share, so nothing leaves the owner's chosen circle.
 */
export function canShareItem({ accountId, item, facts }) {
  return Boolean(accountId) && ownerOfItem(item, facts) === accountId;
}

/* ------------------------------------------------------------------ what each action needs */

/**
 * What a workspace action needs on SOMEONE ELSE'S items. Anything not listed needs "owner", so an action added
 * later is closed by default for shared items.
 */
export const SHARED_ACTION_NEEDS = {
  downloadGeneratedDocument: "view",
  downloadUploadedDocument: "view",
  updateDocumentContent: "edit",
  updateGeneratedDocument: "edit",
  renameDocument: "edit",
  reviewDocumentExtraction: "edit",
  reprocessDocument: "edit",
  renameFolder: "edit",
  createFolder: "edit",
  uploadDocuments: "edit",
  saveGeneratedQuizDocument: "edit"
};

export const neededAccessFor = (action) => SHARED_ACTION_NEEDS[action] || "owner";

/** The words for a refusal. */
export function refusalFor(access, need) {
  if (need === "owner") return "Only the owner can do that with a shared item (delete, move, tag or share it again).";
  if (access === "view") return "You can only view this: it was shared with you without editing rights.";
  return "You do not have editing rights on this shared item.";
}

/** A short label for a permission. */
export const PERMISSION_LABEL = { view: "Can view", edit: "Can edit" };
