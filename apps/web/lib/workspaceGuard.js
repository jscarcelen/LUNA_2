/**
 * The workspace route trusted the ids in every request because there was only one (demo) owner. With
 * real accounts that is not enough, so for a logged-in account every id in a request is checked here:
 *
 *   1. ownership  — the workspace, topic, folder and document an action names must all belong to the
 *                   account (never trust a client-supplied id);
 *   2. read-only  — documents that arrive from another account (tag `shared-by:<id>`) cannot be
 *                   renamed, deleted, retagged, moved or rewritten, and the "Shared documents" topic
 *                   and its folders cannot be restructured. The receiver's own layer — highlights,
 *                   notes, answers, ticked plan steps — still saves (see sharedEditAllowed).
 *
 * `authorizeWorkspaceAction` is pure (it gets the facts it needs), `guardWorkspaceAction` fetches them.
 * The public demo does not go through this: it has no accounts and no shared documents.
 */
import { isProtectedTag, isSharedDocument, sharedEditAllowed, SHARED_SUBJECT_NAME } from "../modules/accounts/shared.js";

const REFERENCE_KEYS = {
  workspaceIds: ["workspaceId"],
  subjectIds: ["subjectId"],
  folderIds: ["folderId", "parentFolderId", "newParentFolderId"],
  documentIds: ["documentId"]
};

const uniq = (list) => [...new Set(list.map((value) => String(value || "").trim()).filter(Boolean))];

/** Every id a request names, by kind. */
export function referencesIn(payload = {}) {
  const pick = (keys) => uniq(keys.map((key) => payload[key]));
  return {
    workspaceIds: pick(REFERENCE_KEYS.workspaceIds),
    subjectIds: pick(REFERENCE_KEYS.subjectIds),
    folderIds: uniq([...pick(REFERENCE_KEYS.folderIds), ...(Array.isArray(payload.folderIds) ? payload.folderIds : [])]),
    documentIds: pick(REFERENCE_KEYS.documentIds)
  };
}

const NOT_YOURS = { ok: false, status: 404, error: "That item was not found in your workspace." };
const deny = (error) => ({ ok: false, status: 403, error });

const RESTRUCTURE_ACTIONS = new Set(["renameSubject", "removeSubject", "createFolder", "renameFolder", "moveFolder", "removeFolder", "addTopicTag", "renameTopicTag", "removeTopicTag", "uploadDocuments"]);
const FOLDER_ACTIONS = new Set(["renameFolder", "moveFolder", "removeFolder"]);
const FROZEN_DOCUMENT_ACTIONS = new Set(["renameDocument", "removeDocument", "updateDocumentContent", "reviewDocumentExtraction", "reprocessDocument"]);

const SHARED_TOPIC_MESSAGE = `“${SHARED_SUBJECT_NAME}” is filled by the people you are connected to, so it cannot be restructured.`;
const SHARED_DOCUMENT_MESSAGE = "This was shared with you, so it is read-only. You can read it, highlight it, take notes and answer it.";

/**
 * @param {object} args
 * @param {string} args.action
 * @param {object} args.payload
 * @param {string} args.ownerUserId the logged-in account
 * @param {object} args.facts {
 *   workspaceOwner: Map<workspaceId, ownerId>,
 *   subjects: Map<subjectId, { workspaceId, name }>,
 *   folders: Map<folderId, { subjectId }>,
 *   documents: Map<documentId, { subjectId, name, tags: string[], folderIds: string[], content: string }>
 * }
 * @returns {{ ok: true, payload: object } | { ok: false, status: number, error: string }}
 *   On success `payload` is the request to run: same as the input, except that client-supplied
 *   server-owned tags are removed and a shared copy's tags/folders are kept as they are.
 */
export function authorizeWorkspaceAction({ action, payload = {}, ownerUserId, facts }) {
  const refs = referencesIn(payload);
  const subjectOwner = (subjectId) => {
    const subject = facts.subjects.get(subjectId);
    return subject ? facts.workspaceOwner.get(subject.workspaceId) : undefined;
  };

  for (const id of refs.workspaceIds) if (facts.workspaceOwner.get(id) !== ownerUserId) return NOT_YOURS;
  for (const id of refs.subjectIds) if (subjectOwner(id) !== ownerUserId) return NOT_YOURS;
  for (const id of refs.folderIds) {
    const folder = facts.folders.get(id);
    if (!folder || subjectOwner(folder.subjectId) !== ownerUserId) return NOT_YOURS;
  }
  for (const id of refs.documentIds) {
    const document = facts.documents.get(id);
    if (!document || subjectOwner(document.subjectId) !== ownerUserId) return NOT_YOURS;
  }

  const sharedSubject = (subjectId) => facts.subjects.get(subjectId)?.name === SHARED_SUBJECT_NAME;
  const touchedSubjects = uniq([...refs.subjectIds, ...refs.folderIds.map((id) => facts.folders.get(id)?.subjectId)]);

  if (RESTRUCTURE_ACTIONS.has(action) && touchedSubjects.some(sharedSubject)) return deny(SHARED_TOPIC_MESSAGE);
  if (FOLDER_ACTIONS.has(action) && refs.folderIds.some((id) => sharedSubject(facts.folders.get(id)?.subjectId))) return deny(SHARED_TOPIC_MESSAGE);

  const next = { ...payload };
  const document = payload.documentId ? facts.documents.get(String(payload.documentId)) : null;
  const sharedCopy = document && isSharedDocument({ tags: document.tags });

  if (sharedCopy && FROZEN_DOCUMENT_ACTIONS.has(action)) return deny(SHARED_DOCUMENT_MESSAGE);

  if (action === "updateGeneratedDocument" && sharedCopy) {
    const file = payload.file || {};
    if (file.name && String(file.name).trim() !== String(document.name).trim()) return deny(SHARED_DOCUMENT_MESSAGE);
    if (!sharedEditAllowed(document.content, file.content)) return deny(SHARED_DOCUMENT_MESSAGE);
  }

  if (action === "updateDocumentMeta" && document) {
    const requested = (Array.isArray(payload.tags) ? payload.tags : []).filter((tag) => !isProtectedTag(tag));
    if (sharedCopy) {
      // Favourites and the like may change; where it is filed and who sent it may not.
      next.tags = [...requested, ...document.tags.filter(isProtectedTag)];
      next.folderIds = document.folderIds;
    } else {
      next.tags = requested;
      if ((Array.isArray(payload.folderIds) ? payload.folderIds : []).some((id) => sharedSubject(facts.folders.get(id)?.subjectId))) return deny(SHARED_TOPIC_MESSAGE);
    }
  }

  if ((action === "saveGeneratedQuizDocument" || action === "uploadDocuments") && Array.isArray(payload.tags)) {
    next.tags = payload.tags.filter((tag) => !isProtectedTag(tag));
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

/** What the guard needs to know about the ids a request names, in as few queries as the chain allows. */
export async function loadWorkspaceFacts(client, refs) {
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

  const folderIds = uniq([...refs.folderIds]);
  const folderRows = folderIds.length ? await selectIn(client, "folders", "id, subject_id", "id", folderIds) : [];
  for (const row of folderRows) facts.folders.set(row.id, { subjectId: row.subject_id });

  const subjectIds = uniq([...refs.subjectIds, ...documentRows.map((row) => row.subject_id), ...folderRows.map((row) => row.subject_id)]);
  const subjectRows = subjectIds.length ? await selectIn(client, "subjects", "id, workspace_id, name", "id", subjectIds) : [];
  for (const row of subjectRows) facts.subjects.set(row.id, { workspaceId: row.workspace_id, name: row.name });

  const workspaceIds = uniq([...refs.workspaceIds, ...subjectRows.map((row) => row.workspace_id)]);
  const workspaceRows = workspaceIds.length ? await selectIn(client, "workspaces", "id, owner_user_id", "id", workspaceIds) : [];
  for (const row of workspaceRows) facts.workspaceOwner.set(row.id, row.owner_user_id);

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

export async function guardWorkspaceAction({ client, action, payload, ownerUserId }) {
  const facts = await loadWorkspaceFacts(client, referencesIn(payload || {}));
  return authorizeWorkspaceAction({ action, payload: payload || {}, ownerUserId, facts });
}
