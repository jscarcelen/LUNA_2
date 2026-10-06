/**
 * The workspace route trusted the ids in every request because there was only one (demo) owner. With
 * real accounts that is not enough, so for a logged-in account every id in a request is checked here:
 *
 *   1. ownership  — the workspace, topic, folder and document an action names must belong to the
 *                   account, OR be shared with it by a connection through a live grant (lib/grants.js);
 *   2. grants     — a shared item is judged by `resolveAccess` from the server's own facts, never by
 *                   anything the client says: "view" reads, "edit" changes the owner's original
 *                   (content, rename, add files/folders inside a shared folder), and everything else
 *                   (delete, move, re-tag, share onward, restructure) is the owner's alone;
 *   3. read-only copies — documents that arrive as a COPY from another account (tag `shared-by:<id>`,
 *                   used by Assign) cannot be renamed, deleted, retagged, moved or rewritten, and the
 *                   "Shared documents" / "Shared with me" topics and their folders cannot be restructured.
 *                   The receiver's own layer — highlights, notes, answers, ticked plan steps — still saves
 *                   (see sharedEditAllowed).
 *
 * `authorizeWorkspaceAction` is pure (it gets the facts it needs), `guardWorkspaceAction` fetches them.
 * The public demo does not go through this: it has no accounts and no shared documents.
 */
import { isProtectedTag, isReservedSubjectName, isSharedDocument, sharedEditAllowed } from "../modules/accounts/shared.js";
import {
  PRIVATE_DOCUMENT_TAGS,
  atLeast,
  isSubjectNodeId,
  neededAccessFor,
  refusalFor,
  resolveAccess,
  subjectIdOfNode,
  subjectOfItem
} from "./grants.js";

const REFERENCE_KEYS = {
  workspaceIds: ["workspaceId"],
  subjectIds: ["subjectId", "targetSubjectId"],
  folderIds: ["folderId", "parentFolderId", "newParentFolderId", "targetFolderId"],
  documentIds: ["documentId"]
};

const uniq = (list) => [...new Set(list.map((value) => String(value || "").trim()).filter(Boolean))];

/** Every id a request names, by kind. */
export function referencesIn(payload = {}) {
  const pick = (keys) => uniq(keys.map((key) => payload[key]));
  return {
    workspaceIds: pick(REFERENCE_KEYS.workspaceIds),
    subjectIds: pick(REFERENCE_KEYS.subjectIds),
    folderIds: uniq([...pick(REFERENCE_KEYS.folderIds), ...(Array.isArray(payload.folderIds) ? payload.folderIds : []), ...(Array.isArray(payload.targetFolderIds) ? payload.targetFolderIds : [])]),
    documentIds: uniq([...pick(REFERENCE_KEYS.documentIds), ...(Array.isArray(payload.documentIds) ? payload.documentIds : [])])
  };
}

const NOT_YOURS = { ok: false, status: 404, error: "That item was not found in your workspace." };
const deny = (error) => ({ ok: false, status: 403, error });

const RESTRUCTURE_ACTIONS = new Set(["renameSubject", "removeSubject", "createFolder", "renameFolder", "moveFolder", "moveDocument", "removeFolder", "addTopicTag", "renameTopicTag", "removeTopicTag", "uploadDocuments"]);
const FOLDER_ACTIONS = new Set(["renameFolder", "moveFolder", "removeFolder"]);
const FROZEN_DOCUMENT_ACTIONS = new Set(["renameDocument", "removeDocument", "updateDocumentContent", "reviewDocumentExtraction", "reprocessDocument"]);

const SHARED_TOPIC_MESSAGE = "“Shared documents” and “Shared with me” are filled by the people you are connected to, so they cannot be restructured.";
const SHARED_DOCUMENT_MESSAGE = "This was shared with you, so it is read-only. You can read it, highlight it, take notes and answer it.";
const MIXED_MESSAGE = "A shared item cannot be mixed with your own files in one step (nothing is moved in or out of a share).";

/**
 * A topic someone shared with you shows up as the stand-in folder `subj~<subjectId>`. Turn those ids back into
 * the real thing: a parent of "" inside that real topic, remembering which topics were named this way.
 */
function translateSubjectNodes(payload) {
  const viaSubjects = new Set();
  const next = { ...payload };
  const clean = (id) => {
    if (isSubjectNodeId(id)) { viaSubjects.add(subjectIdOfNode(id)); return ""; }
    return id;
  };
  // Only a parent or a list of target folders may be a stand-in; renaming, moving or deleting the stand-in
  // folder itself (folderId / newParentFolderId) stays an unknown id, i.e. refused.
  if (isSubjectNodeId(payload.parentFolderId)) next.parentFolderId = clean(payload.parentFolderId);
  if (Array.isArray(payload.folderIds)) next.folderIds = payload.folderIds.map(clean).filter(Boolean);
  return { payload: next, viaSubjects: [...viaSubjects] };
}

/**
 * @param {object} args
 * @param {string} args.action
 * @param {object} args.payload
 * @param {string} args.ownerUserId the logged-in account
 * @param {object} args.facts {
 *   workspaceOwner: Map<workspaceId, ownerId>,
 *   subjects: Map<subjectId, { workspaceId, name }>,
 *   folders: Map<folderId, { subjectId, parentFolderId? }>,
 *   documents: Map<documentId, { subjectId, name, tags: string[], folderIds: string[], content: string }>,
 *   grants?: Array,            // share_grants made to this account
 *   connections?: Set<string>  // accounts it has an accepted connection with
 * }
 * @returns {{ ok: true, payload: object, shared?: { ownerId, workspaceId, subjectId, permission } } | { ok: false, status: number, error: string }}
 *   On success `payload` is the request to run: same as the input, except that client-supplied
 *   server-owned tags are removed, a shared copy's tags/folders are kept as they are, and a request that
 *   works on someone else's shared item is pointed at the owner's real workspace and topic (`shared`).
 */
export function authorizeWorkspaceAction({ action, payload = {}, ownerUserId, facts }) {
  const translated = translateSubjectNodes(payload);
  const effective = translated.payload;
  const refs = referencesIn(effective);
  for (const subjectId of translated.viaSubjects) if (!refs.subjectIds.includes(subjectId)) refs.subjectIds.push(subjectId);

  const subjectOwner = (subjectId) => {
    const subject = facts.subjects.get(subjectId);
    return subject ? facts.workspaceOwner.get(subject.workspaceId) : undefined;
  };
  const known = (kind, id) => (kind === "workspace" ? facts.workspaceOwner.has(id) : kind === "subject" ? facts.subjects.has(id) : kind === "folder" ? facts.folders.has(id) : facts.documents.has(id));
  const ownerOf = (kind, id) => {
    if (kind === "workspace") return facts.workspaceOwner.get(id);
    if (kind === "subject") return subjectOwner(id);
    if (kind === "folder") { const folder = facts.folders.get(id); return folder ? subjectOwner(folder.subjectId) : undefined; }
    const document = facts.documents.get(id);
    return document ? subjectOwner(document.subjectId) : undefined;
  };

  /* ---- which references are mine, which are someone else's (shared with me), which are nobody's */
  const foreign = { folders: [], documents: [], subjects: [] };
  for (const id of refs.workspaceIds) if (ownerOf("workspace", id) !== ownerUserId) return NOT_YOURS; // a workspace is never shared as a whole
  for (const id of refs.subjectIds) {
    if (!known("subject", id)) return NOT_YOURS;
    if (ownerOf("subject", id) !== ownerUserId) foreign.subjects.push(id);
  }
  for (const id of refs.folderIds) {
    if (!known("folder", id)) return NOT_YOURS;
    if (ownerOf("folder", id) !== ownerUserId) foreign.folders.push(id);
  }
  for (const id of refs.documentIds) {
    if (!known("document", id)) return NOT_YOURS;
    if (ownerOf("document", id) !== ownerUserId) foreign.documents.push(id);
  }
  const isForeign = foreign.folders.length || foreign.documents.length || foreign.subjects.length;

  let next = { ...effective };
  let sharedTarget = null;

  if (isForeign) {
    // Every folder/document the request names must be shared with this account, and all of it must live in one
    // place (one owner, one topic): nothing is moved between your files and a share, or between two shares.
    const via = new Set(translated.viaSubjects);
    const items = [
      ...foreign.documents.map((id) => ({ kind: "document", id })),
      ...foreign.folders.map((id) => ({ kind: "folder", id })),
      ...foreign.subjects.filter((id) => via.has(id)).map((id) => ({ kind: "subject", id }))
    ];
    const ownFileRefs = [...refs.folderIds, ...refs.documentIds].filter((id) => !foreign.folders.includes(id) && !foreign.documents.includes(id));
    if (ownFileRefs.length) return deny(MIXED_MESSAGE);
    // A subject named directly (not through a stand-in folder) is only acceptable when a shared file lives in it.
    const fileSubjects = new Set([...foreign.documents, ...foreign.folders].map((id) => subjectOfItem({ kind: foreign.documents.includes(id) ? "document" : "folder", id }, facts)));
    for (const id of foreign.subjects) if (!via.has(id) && !fileSubjects.has(id)) return NOT_YOURS;
    const owners = new Set(items.map((item) => ownerOf(item.kind, item.id)));
    const subjects = new Set(items.map((item) => subjectOfItem(item, facts)));
    if (owners.size !== 1 || subjects.size !== 1) return deny(MIXED_MESSAGE);

    const need = neededAccessFor(action);
    let weakest = "edit";
    for (const item of items) {
      const access = resolveAccess({ accountId: ownerUserId, item, facts, grants: facts.grants || [], connections: facts.connections || [] });
      if (!access) return NOT_YOURS; // not shared with this account (or the connection ended): same answer as "does not exist"
      if (!atLeast(access, need)) return deny(refusalFor(access, need));
      if (access === "view") weakest = "view";
    }

    const [ownerId] = owners;
    const [subjectId] = subjects;
    const workspaceId = facts.subjects.get(subjectId)?.workspaceId || "";
    sharedTarget = { ownerId, workspaceId, subjectId, permission: weakest };
    next.subjectId = subjectId;
    if ("workspaceId" in next || refs.workspaceIds.length) next.workspaceId = workspaceId;
    // What lands in someone's original must not carry server-owned or private-layer tags.
    if (Array.isArray(next.tags)) next.tags = next.tags.filter((tag) => !isProtectedTag(tag) && !PRIVATE_DOCUMENT_TAGS.includes(String(tag).trim().toLowerCase()));
    return { ok: true, payload: next, shared: sharedTarget };
  }

  /* ---- everything named is mine ---------------------------------------------------------------- */
  const sharedSubject = (subjectId) => isReservedSubjectName(facts.subjects.get(subjectId)?.name);
  const touchedSubjects = uniq([...refs.subjectIds, ...refs.folderIds.map((id) => facts.folders.get(id)?.subjectId)]);

  if (RESTRUCTURE_ACTIONS.has(action) && touchedSubjects.some(sharedSubject)) return deny(SHARED_TOPIC_MESSAGE);
  if (FOLDER_ACTIONS.has(action) && refs.folderIds.some((id) => sharedSubject(facts.folders.get(id)?.subjectId))) return deny(SHARED_TOPIC_MESSAGE);

  const document = effective.documentId ? facts.documents.get(String(effective.documentId)) : null;
  const sharedCopy = document && isSharedDocument({ tags: document.tags });

  if (sharedCopy && FROZEN_DOCUMENT_ACTIONS.has(action)) return deny(SHARED_DOCUMENT_MESSAGE);

  // Moving documents (one or a selection): a received copy stays where the sender's topic put it, and nothing is filed into "Shared documents".
  if (action === "moveDocument" && refs.documentIds.some((id) => isSharedDocument({ tags: facts.documents.get(id)?.tags || [] }) || sharedSubject(facts.documents.get(id)?.subjectId))) return deny(SHARED_DOCUMENT_MESSAGE);

  if (action === "updateGeneratedDocument" && sharedCopy) {
    const file = effective.file || {};
    if (file.name && String(file.name).trim() !== String(document.name).trim()) return deny(SHARED_DOCUMENT_MESSAGE);
    if (!sharedEditAllowed(document.content, file.content)) return deny(SHARED_DOCUMENT_MESSAGE);
  }

  if (action === "updateDocumentMeta" && document) {
    const requested = (Array.isArray(effective.tags) ? effective.tags : []).filter((tag) => !isProtectedTag(tag));
    if (sharedCopy) {
      // Favourites and the like may change; where it is filed and who sent it may not.
      next.tags = [...requested, ...document.tags.filter(isProtectedTag)];
      next.folderIds = document.folderIds;
    } else {
      next.tags = requested;
      if ((Array.isArray(effective.folderIds) ? effective.folderIds : []).some((id) => sharedSubject(facts.folders.get(id)?.subjectId))) return deny(SHARED_TOPIC_MESSAGE);
    }
  }

  if ((action === "saveGeneratedQuizDocument" || action === "uploadDocuments") && Array.isArray(effective.tags)) {
    next.tags = effective.tags.filter((tag) => !isProtectedTag(tag));
  }

  return { ok: true, payload: next };
}

const PAGE = 200;

async function selectIn(client, table, columns, column, ids) {
  const rows = [];
  for (let index = 0; index < ids.length; index += PAGE) {
    const { data, error } = await client.from(table).select(columns).in(column, ids.slice(index, index + PAGE));
    if (error) throw error;
    rows.push(...(data || []));
  }
  return rows;
}

/** Folders with their parent, tolerating an old database without the hierarchy column. */
async function selectFolders(client, ids) {
  try {
    return await selectIn(client, "folders", "id, subject_id, parent_folder_id", "id", ids);
  } catch {
    return (await selectIn(client, "folders", "id, subject_id", "id", ids)).map((row) => ({ ...row, parent_folder_id: null }));
  }
}

/**
 * What the guard needs to know about the ids a request names, in as few queries as the chain allows.
 * With `actorId`, the folders above anything that is not the actor's are loaded too (a grant on a parent
 * folder covers what is inside it).
 */
export async function loadWorkspaceFacts(client, refs, { actorId = "" } = {}) {
  const facts = { workspaceOwner: new Map(), subjects: new Map(), folders: new Map(), documents: new Map() };

  const documentRows = refs.documentIds.length ? await selectIn(client, "documents", "id, subject_id, folder_id, name, content", "id", refs.documentIds) : [];
  const documentTags = refs.documentIds.length ? await selectIn(client, "document_tags", "document_id, topic_tags(tag)", "document_id", refs.documentIds) : [];
  let documentFolders = [];
  if (refs.documentIds.length) {
    try {
      documentFolders = await selectIn(client, "document_folders", "document_id, folder_id", "document_id", refs.documentIds);
    } catch {
      documentFolders = []; // the many-folders table is optional (older databases)
    }
  }

  const tagsOf = new Map();
  for (const row of documentTags) {
    const list = tagsOf.get(row.document_id) || [];
    if (row.topic_tags?.tag) list.push(row.topic_tags.tag);
    tagsOf.set(row.document_id, list);
  }
  const foldersOf = new Map();
  for (const row of documentFolders) foldersOf.set(row.document_id, [...(foldersOf.get(row.document_id) || []), row.folder_id]);

  for (const row of documentRows) {
    const tags = tagsOf.get(row.id) || [];
    const shared = isSharedDocument({ tags });
    facts.documents.set(row.id, {
      subjectId: row.subject_id,
      name: row.name,
      tags,
      folderIds: foldersOf.get(row.id) || (row.folder_id ? [row.folder_id] : []),
      // The text a reader sees: only needed to check edits of shared copies.
      content: shared ? displayContentOf(row.content) : ""
    });
  }

  const loadFolders = async (ids) => {
    const wanted = uniq(ids).filter((id) => !facts.folders.has(id));
    if (!wanted.length) return [];
    const rows = await selectFolders(client, wanted);
    for (const row of rows) facts.folders.set(row.id, { subjectId: row.subject_id, parentFolderId: row.parent_folder_id || "" });
    return rows;
  };

  const folderRows = await loadFolders([...refs.folderIds, ...documentRows.flatMap((row) => facts.documents.get(row.id).folderIds)]);

  const subjectIds = uniq([...refs.subjectIds, ...documentRows.map((row) => row.subject_id), ...folderRows.map((row) => row.subject_id)]);
  const subjectRows = subjectIds.length ? await selectIn(client, "subjects", "id, workspace_id, name", "id", subjectIds) : [];
  for (const row of subjectRows) facts.subjects.set(row.id, { workspaceId: row.workspace_id, name: row.name });

  const workspaceIds = uniq([...refs.workspaceIds, ...subjectRows.map((row) => row.workspace_id)]);
  const workspaceRows = workspaceIds.length ? await selectIn(client, "workspaces", "id, owner_user_id", "id", workspaceIds) : [];
  for (const row of workspaceRows) facts.workspaceOwner.set(row.id, row.owner_user_id);

  // Something of somebody else's is named: bring in the folders above it, so a grant on a parent can be found.
  const ownerOfSubject = (subjectId) => facts.workspaceOwner.get(facts.subjects.get(subjectId)?.workspaceId);
  const someoneElses = actorId && [...facts.folders.values(), ...facts.documents.values()].some((entry) => ownerOfSubject(entry.subjectId) !== actorId);
  if (someoneElses) {
    for (let depth = 0; depth < 32; depth += 1) {
      const parents = [...facts.folders.values()].map((folder) => folder.parentFolderId).filter(Boolean);
      const added = await loadFolders(parents);
      if (!added.length) break;
      const missing = uniq(added.map((row) => row.subject_id)).filter((id) => !facts.subjects.has(id));
      if (missing.length) for (const row of await selectIn(client, "subjects", "id, workspace_id, name", "id", missing)) facts.subjects.set(row.id, { workspaceId: row.workspace_id, name: row.name });
      const missingWorkspaces = uniq([...facts.subjects.values()].map((subject) => subject.workspaceId)).filter((id) => !facts.workspaceOwner.has(id));
      if (missingWorkspaces.length) for (const row of await selectIn(client, "workspaces", "id, owner_user_id", "id", missingWorkspaces)) facts.workspaceOwner.set(row.id, row.owner_user_id);
    }
  }

  return facts;
}

/** Generated documents are stored as a bundle `{ version, plainText, downloads }`; readers see plainText. */
export function displayContentOf(content) {
  const text = String(content || "").trim();
  if (!text.startsWith("{")) return String(content || "");
  try {
    const parsed = JSON.parse(text);
    if (parsed?.version === "generated-document-bundle-v1" && typeof parsed.plainText === "string") return parsed.plainText;
  } catch { /* plain content */ }
  return String(content || "");
}

/**
 * @param {object} args
 * @param {(accountId: string) => Promise<{ grants: Array, connections: Set<string> }>} [args.loadGrantContext]
 *   fetches this account's live grants and connections; only called when the request names something that is not the account's own
 */
export async function guardWorkspaceAction({ client, action, payload, ownerUserId, loadGrantContext }) {
  const body = payload || {};
  // The stand-in folder of a shared topic is not a database id: leave it out of the lookups.
  const refs = referencesIn(body);
  const lookups = { ...refs, folderIds: refs.folderIds.filter((id) => !isSubjectNodeId(id)), subjectIds: uniq([...refs.subjectIds, ...refs.folderIds.filter(isSubjectNodeId).map(subjectIdOfNode)]) };
  const facts = await loadWorkspaceFacts(client, lookups, { actorId: ownerUserId });
  const ownerOfSubject = (subjectId) => facts.workspaceOwner.get(facts.subjects.get(subjectId)?.workspaceId);
  const someoneElses = [...facts.subjects.keys()].some((id) => ownerOfSubject(id) !== ownerUserId);
  if (someoneElses && loadGrantContext) {
    const context = await loadGrantContext(ownerUserId);
    facts.grants = context.grants || [];
    facts.connections = context.connections || new Set();
  }
  return authorizeWorkspaceAction({ action, payload: body, ownerUserId, facts });
}
