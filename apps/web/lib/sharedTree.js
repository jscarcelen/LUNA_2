/**
 * What was shared WITH an account, laid into its own workspace tree:
 *
 *   <first workspace> / Shared with me / <owner's name> / <the shared folders and documents, original ids>
 *
 * Nothing is copied. The nodes carry the OWNER's real ids, so every read and every edit goes to the owner's
 * original (lib/workspaceGuard.js decides by grants, never by what the browser says about a node). Each
 * node is marked `shared: { grantId, ownerId, ownerName, permission, root }`; a document shared as "view" also
 * carries a synthetic `shared-by:<owner>` tag so the existing read-only interface applies to it.
 *
 * `buildSharedNodes` is pure (tested); `listTreeWithShared` does the database work around it.
 */
import { createSupabaseAdminClient } from "./supabaseClient.js";
import { createFolder, createSubject, createWorkspace, listWorkspaceTree } from "./workspacesRepository.js";
import { activeGrantsFor } from "./grantsRepository.js";
import { findAccountsByIds } from "./accountsRepository.js";
import { isPrivateDocument, rankOf, subjectNodeId } from "./grants.js";
import { SHARED_BY_PREFIX, SHARED_WITH_ME_SUBJECT } from "../modules/accounts/shared.js";

/**
 * @param {object} args
 * @param {Array} args.ownerTree the owner's workspaces (output of listWorkspaceTree)
 * @param {Array} args.grants the grants made BY this owner TO the account (normalised, active)
 * @param {{ id: string, displayName: string }} args.owner
 * @param {string} args.ownerFolderId the account's own folder "<owner's name>" inside "Shared with me"
 * @returns {{ folders: object[], documents: object[] }} nodes to add to the "Shared with me" topic
 */
export function buildSharedNodes({ ownerTree, grants, owner, ownerFolderId }) {
  const subjects = new Map();
  const folders = new Map();
  const documents = new Map();
  const childrenOf = new Map();
  for (const workspace of ownerTree || []) {
    for (const subject of workspace.subjects || []) {
      subjects.set(subject.id, subject);
      for (const folder of subject.folders || []) {
        folders.set(folder.id, { ...folder, subjectId: subject.id });
        const key = folder.parentFolderId || "";
        childrenOf.set(key, [...(childrenOf.get(key) || []), folder.id]);
      }
      for (const document of subject.documents || []) documents.set(document.id, { ...document, subjectId: subject.id });
    }
  }

  // node key -> best permission with the grant that gave it; `roots` = nodes that were shared directly
  const marks = new Map();
  const roots = new Map();
  const mark = (key, grant) => {
    const current = marks.get(key);
    if (!current || rankOf(grant.permission) > rankOf(current.permission)) marks.set(key, { permission: grant.permission, grantId: grant.id });
  };
  const subjectGrants = new Map();

  for (const grant of grants) {
    if (grant.ownerId !== owner.id) continue;
    if (grant.itemKind === "document") {
      const document = documents.get(grant.itemId);
      if (!document || isPrivateDocument(document)) continue;
      mark(`document:${document.id}`, grant);
      roots.set(`document:${document.id}`, grant.id);
    } else if (grant.itemKind === "folder") {
      if (!folders.has(grant.itemId)) continue;
      const branch = [];
      const walk = (id) => { branch.push(id); for (const child of childrenOf.get(id) || []) walk(child); };
      walk(grant.itemId);
      const inBranch = new Set(branch);
      for (const id of branch) mark(`folder:${id}`, grant);
      roots.set(`folder:${grant.itemId}`, grant.id);
      for (const document of documents.values()) {
        if (!isPrivateDocument(document) && (document.folderIds || []).some((id) => inBranch.has(id))) mark(`document:${document.id}`, grant);
      }
    } else if (grant.itemKind === "subject") {
      const subject = subjects.get(grant.itemId);
      if (!subject) continue;
      const best = subjectGrants.get(subject.id);
      if (!best || rankOf(grant.permission) > rankOf(best.permission)) subjectGrants.set(subject.id, grant);
      roots.set(`subject:${subject.id}`, grant.id);
      for (const folder of subject.folders || []) mark(`folder:${folder.id}`, grant);
      for (const document of subject.documents || []) if (!isPrivateDocument(document)) mark(`document:${document.id}`, grant);
    }
  }

  const info = (key) => {
    const entry = marks.get(key);
    return entry ? { grantId: entry.grantId, ownerId: owner.id, ownerName: owner.displayName, permission: entry.permission, root: roots.has(key) } : null;
  };

  const outFolders = [];
  // A shared topic appears as one stand-in folder named after it.
  for (const [subjectId, grant] of subjectGrants) {
    outFolders.push({ id: subjectNodeId(subjectId), name: subjects.get(subjectId).name, parentFolderId: ownerFolderId, tags: [], shared: { grantId: grant.id, ownerId: owner.id, ownerName: owner.displayName, permission: grant.permission, root: true } });
  }
  const placeholderFor = (subjectId) => (subjectGrants.has(subjectId) ? subjectNodeId(subjectId) : ownerFolderId);
  for (const [key] of marks) {
    if (!key.startsWith("folder:")) continue;
    const folder = folders.get(key.slice(7));
    const parentMarked = folder.parentFolderId && marks.has(`folder:${folder.parentFolderId}`);
    outFolders.push({ id: folder.id, name: folder.name, parentFolderId: parentMarked ? folder.parentFolderId : placeholderFor(folder.subjectId), tags: [], shared: info(key) });
  }

  const outDocuments = [];
  for (const [key] of marks) {
    if (!key.startsWith("document:")) continue;
    const document = documents.get(key.slice(9));
    const shared = info(key);
    const keptFolders = (document.folderIds || []).filter((id) => marks.has(`folder:${id}`));
    const folderIds = keptFolders.length ? keptFolders : [placeholderFor(document.subjectId)];
    const { subjectId: _subjectId, ...rest } = document;
    outDocuments.push({
      ...rest,
      folderId: folderIds[0],
      folderIds,
      tags: shared.permission === "view" ? [...(document.tags || []), `${SHARED_BY_PREFIX}${owner.id}`] : [...(document.tags || [])],
      shared
    });
  }
  return { folders: outFolders, documents: outDocuments };
}

/** <first workspace> / Shared with me / <owner name>, created on first use. Returns the ids to merge into. */
export async function ensureSharedWithMe(client, accountId, owners) {
  const { data: workspaces, error } = await client.from("workspaces").select("id").eq("owner_user_id", accountId).order("created_at", { ascending: true }).limit(1);
  if (error) throw error;
  const workspaceId = workspaces?.[0]?.id || (await createWorkspace("My workspace", accountId)).id;
  const { data: subjects, error: subjectError } = await client.from("subjects").select("id").eq("workspace_id", workspaceId).eq("name", SHARED_WITH_ME_SUBJECT).order("created_at", { ascending: true }).limit(1);
  if (subjectError) throw subjectError;
  const subjectId = subjects?.[0]?.id || (await createSubject(workspaceId, SHARED_WITH_ME_SUBJECT)).id;
  const folderByOwner = new Map();
  for (const owner of owners) {
    const name = String(owner.displayName || owner.email || "Someone").trim();
    const { data: found, error: folderError } = await client.from("folders").select("id").eq("subject_id", subjectId).eq("name", name).is("parent_folder_id", null).limit(1);
    if (folderError) throw folderError;
    folderByOwner.set(owner.id, found?.[0]?.id || (await createFolder(subjectId, name, "")).id);
  }
  return { workspaceId, subjectId, folderByOwner };
}

/**
 * The account's workspace tree with everything shared with it laid into "Shared with me". Without the
 * sharing migration, or with nothing shared, this is just `listWorkspaceTree`.
 */
export async function listTreeWithShared(accountId) {
  const grants = await activeGrantsFor(accountId);
  if (!grants.length) return listWorkspaceTree(accountId);

  const ownerIds = [...new Set(grants.map((grant) => grant.ownerId))];
  const people = await findAccountsByIds(ownerIds);
  const owners = people.map((row) => ({ id: row.id, displayName: row.display_name, email: row.email }));
  if (!owners.length) return listWorkspaceTree(accountId);

  const structure = await ensureSharedWithMe(createSupabaseAdminClient(), accountId, owners);
  const tree = await listWorkspaceTree(accountId);
  const workspace = tree.find((entry) => entry.id === structure.workspaceId);
  const subject = workspace?.subjects?.find((entry) => entry.id === structure.subjectId);
  if (!subject) return tree;

  const seenFolders = new Set((subject.folders || []).map((folder) => folder.id));
  const seenDocuments = new Set((subject.documents || []).map((document) => document.id));
  for (const owner of owners) {
    const ownerTree = await listWorkspaceTree(owner.id);
    const nodes = buildSharedNodes({ ownerTree, grants: grants.filter((grant) => grant.ownerId === owner.id), owner, ownerFolderId: structure.folderByOwner.get(owner.id) });
    for (const folder of nodes.folders) if (!seenFolders.has(folder.id)) { seenFolders.add(folder.id); subject.folders.push(folder); }
    for (const document of nodes.documents) if (!seenDocuments.has(document.id)) { seenDocuments.add(document.id); subject.documents.push(document); }
  }
  return tree;
}
