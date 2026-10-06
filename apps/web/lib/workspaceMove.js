/**
 * Moving folders and documents anywhere in a workspace — between folders of one topic and between
 * topics (a topic is a `subject`; "Accounting" and "Statistics" are two of them).
 *
 * The rules, in one place:
 *
 *  - Everything stays inside ONE workspace (and therefore one owner). Another workspace is refused.
 *  - A document keeps its id. Plans, attempts, notes, links and shares all point at ids, so nothing
 *    they hold has to be rewritten; only the rows that carry a `subject_id` follow the move:
 *    documents, folders, document_chunks, topic-tag links (a topic owns its own tags), and the
 *    optional attempts / study_plans rows.
 *  - A document's companions (its notes file and its attempt records are separate, unfiled
 *    documents of the same topic that name it in their JSON) move with it, because the plans page and
 *    the performance views only look inside one topic.
 *  - A folder moves with its whole subtree and every document filed in it.
 *  - A folder can never be moved into itself or one of its own subfolders.
 *  - If the target already has a folder of that name, the moved one becomes "Name (2)" (then 3 ...).
 *  - The topic skeleton (Uploaded material / Generated material / Study plans / Resources not in
 *    study plans / a plan's Reference materials) stays where it is; a plan's folder, when it changes
 *    topic, goes to the target topic's "Study plans" so the plan keeps its place.
 *  - Writes are ordered so a failure can never lose data, and every step has an undo that runs in
 *    reverse order if a later step fails ("rollback").
 *
 * Everything here takes the Supabase client as an argument, so it runs unchanged against a fake.
 */
import { GENERATED_ROOT, LOOSE_FOLDER, MATERIAL_FOLDER, PLANS_ROOT, UPLOADED_FOLDER } from "../modules/plans/folders.js";
import { SHARED_BY_PREFIX, SHARED_SUBJECT_NAME } from "../modules/accounts/shared.js";

const PAGE = 200;
const COMPANION_TAGS = ["doc-notes", "activity-attempt"];
const PLAN_TAG = "study-plan";

const lower = (value) => String(value || "").trim().toLowerCase();
const same = (a, b) => lower(a) === lower(b);
const uniq = (list) => [...new Set(list.filter(Boolean).map((value) => String(value)))];
const pieces = (list, size = PAGE) => {
  const out = [];
  for (let index = 0; index < list.length; index += size) out.push(list.slice(index, index + size));
  return out;
};

/** An error the person can read ("nothing was changed" is true when this is thrown). */
export class MoveError extends Error {
  constructor(message, { status = 400 } = {}) {
    super(message);
    this.name = "MoveError";
    this.status = status;
  }
}

/* ----------------------------------------------------------------- pure logic */

/** Ids of a folder and everything under it (breadth first, root first). `folders` rows: { id, parent_folder_id }. */
export function subtreeFolderIds(folders, rootId) {
  const children = new Map();
  for (const folder of folders) {
    const key = folder.parent_folder_id || "";
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(folder.id);
  }
  const out = [];
  const queue = [rootId];
  const seen = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue; // a corrupt loop in the data must not hang the server
    seen.add(id);
    out.push(id);
    queue.push(...(children.get(id) || []));
  }
  return out;
}

/** Would filing `folderId` under `targetFolderId` put it inside itself? */
export function wouldCreateCycle(folders, folderId, targetFolderId) {
  if (!targetFolderId) return false;
  if (folderId === targetFolderId) return true;
  return subtreeFolderIds(folders, folderId).includes(targetFolderId);
}

/** "Notes" -> "Notes", or "Notes (2)", "Notes (3)"... when the siblings already use the name. */
export function uniqueFolderName(name, siblingNames = []) {
  const base = String(name || "").trim() || "Folder";
  const taken = new Set(siblingNames.map(lower));
  if (!taken.has(lower(base))) return { name: base, renamed: false };
  for (let counter = 2; counter < 1000; counter += 1) {
    const candidate = `${base} (${counter})`;
    if (!taken.has(lower(candidate))) return { name: candidate, renamed: true };
  }
  return { name: `${base} (${Date.now()})`, renamed: true };
}

const folderById = (folders) => new Map(folders.map((folder) => [folder.id, folder]));

/** A folder directly inside "Study plans" (the plan's own folder). */
export function isPlanFolder(folder, folders) {
  const byId = folderById(folders);
  const parent = byId.get(folder?.parent_folder_id);
  return Boolean(parent && same(parent.name, PLANS_ROOT));
}

/** The folders that make a topic what it is; they are not moved around. */
export function isStructuralFolder(folder, folders) {
  if (!folder) return false;
  const byId = folderById(folders);
  const parent = byId.get(folder.parent_folder_id);
  if (!folder.parent_folder_id) return same(folder.name, UPLOADED_FOLDER) || same(folder.name, GENERATED_ROOT);
  if (parent && same(parent.name, GENERATED_ROOT) && !parent.parent_folder_id) return same(folder.name, PLANS_ROOT) || same(folder.name, LOOSE_FOLDER);
  if (same(folder.name, MATERIAL_FOLDER) && parent && isPlanFolder(parent, folders)) return true;
  return false;
}

/** Plan documents name their material and steps by id; which of `ids` does this plan use? */
export function planReferences(content, ids) {
  let plan = null;
  try { plan = JSON.parse(String(content || "{}")); } catch { return []; }
  if (!plan || typeof plan !== "object") return [];
  const used = new Set([...(plan.materialIds || []), ...(plan.items || []).map((item) => item?.resourceId), ...(plan.goals || []).flatMap((goal) => goal?.resourceIds || [])].filter(Boolean));
  return ids.filter((id) => used.has(id));
}

/** The documents named in a sidecar's JSON (notes: documentId, attempts: activityDocumentId). */
export function sidecarTarget(content) {
  try {
    const parsed = JSON.parse(String(content || "{}"));
    return String(parsed?.documentId || parsed?.activityDocumentId || "");
  } catch {
    return "";
  }
}

/**
 * A journal of undo steps. `step` registers the undo BEFORE it runs the change, so a change that fails
 * half-way (several batches) is still undone; every undo is a restore of known values, so undoing a
 * batch that never ran is harmless. `rollback` runs them last-to-first and never throws.
 */
export function createJournal() {
  const undos = [];
  return {
    get size() { return undos.length; },
    /** Registers an undo for something already done. */
    register(label, undo) { undos.push({ label, undo }); },
    async step(label, change, undo) {
      if (undo) undos.push({ label, undo });
      return change();
    },
    async rollback() {
      const failed = [];
      for (const entry of [...undos].reverse()) {
        try { await entry.undo(); } catch { failed.push(entry.label); }
      }
      undos.length = 0;
      return { failed };
    }
  };
}

/* ----------------------------------------------------------------- database helpers */

const missingSchema = (error) => /PGRST20[45]|42P01|42703|schema cache|does not exist/i.test(`${error?.code || ""} ${error?.message || ""}`);

async function rowsIn(client, table, columns, column, ids, { optional = false } = {}) {
  const out = [];
  for (const batch of pieces(ids)) {
    const { data, error } = await client.from(table).select(columns).in(column, batch);
    if (error) {
      if (optional && missingSchema(error)) return null;
      throw error;
    }
    out.push(...(data || []));
  }
  return out;
}

async function updateIn(client, table, patch, column, ids, { optional = false, where = null } = {}) {
  for (const batch of pieces(ids)) {
    let query = client.from(table).update(patch).in(column, batch);
    if (where) query = query.eq(where.column, where.value);
    const { error } = await query;
    if (error) {
      if (optional && missingSchema(error)) return;
      throw error;
    }
  }
}

async function deleteIn(client, table, filters) {
  for (const batch of pieces(filters.ids)) {
    let query = client.from(table).delete().in(filters.column, batch);
    if (filters.alsoIn) query = query.in(filters.alsoIn.column, filters.alsoIn.ids);
    const { error } = await query;
    if (error) throw error;
  }
}

async function insertRows(client, table, rows, { optional = false } = {}) {
  for (const batch of pieces(rows)) {
    const { error } = await client.from(table).insert(batch);
    if (error) {
      if (optional && missingSchema(error)) return;
      throw error;
    }
  }
}

async function loadSubject(client, subjectId) {
  const { data, error } = await client.from("subjects").select("id, workspace_id, name").eq("id", subjectId).maybeSingle();
  if (error) throw error;
  if (!data) throw new MoveError("That topic was not found.", { status: 404 });
  return data;
}

async function loadFolders(client, subjectId) {
  const { data, error } = await client.from("folders").select("id, subject_id, name, parent_folder_id").eq("subject_id", subjectId);
  if (error) throw error;
  return data || [];
}

function assertSameWorkspace(from, to) {
  if (from.workspace_id !== to.workspace_id) throw new MoveError("Items can only be moved inside the same workspace.");
  if (from.name === SHARED_SUBJECT_NAME || to.name === SHARED_SUBJECT_NAME) {
    throw new MoveError(`“${SHARED_SUBJECT_NAME}” is filled by the people you are connected to, so nothing can be moved in or out of it.`, { status: 403 });
  }
}

/** Tags of each document as { documentId, topicTagId, tag } rows. */
async function loadTagLinks(client, documentIds) {
  const rows = await rowsIn(client, "document_tags", "document_id, topic_tag_id, topic_tags(tag)", "document_id", documentIds);
  return rows.map((row) => ({ documentId: row.document_id, topicTagId: row.topic_tag_id, tag: String(row.topic_tags?.tag || "") }));
}

/** Notes files and attempt records of these documents, found in their topic. */
export async function findCompanions(client, subjectId, documentIds) {
  if (!documentIds.length) return [];
  const { data: tagRows, error } = await client.from("topic_tags").select("id, tag").eq("subject_id", subjectId).in("tag", COMPANION_TAGS);
  if (error) throw error;
  const tagIds = (tagRows || []).map((row) => row.id);
  if (!tagIds.length) return [];
  const links = await rowsIn(client, "document_tags", "document_id, topic_tag_id", "topic_tag_id", tagIds);
  const candidates = uniq(links.map((link) => link.document_id)).filter((id) => !documentIds.includes(id));
  if (!candidates.length) return [];
  const rows = await rowsIn(client, "documents", "id, subject_id, content", "id", candidates);
  const wanted = new Set(documentIds);
  return rows.filter((row) => row.subject_id === subjectId && wanted.has(sidecarTarget(row.content))).map((row) => row.id);
}

/** Study plans of a topic (documents tagged study-plan) with their JSON. */
async function loadPlans(client, subjectId) {
  const { data: tagRows, error } = await client.from("topic_tags").select("id").eq("subject_id", subjectId).eq("tag", PLAN_TAG);
  if (error) throw error;
  const tagIds = (tagRows || []).map((row) => row.id);
  if (!tagIds.length) return [];
  const links = await rowsIn(client, "document_tags", "document_id", "topic_tag_id", tagIds);
  const ids = uniq(links.map((link) => link.document_id));
  if (!ids.length) return [];
  return (await rowsIn(client, "documents", "id, subject_id, name, content", "id", ids)).filter((row) => row.subject_id === subjectId);
}

/** Plain-language warnings about plans that keep pointing at documents that are now in another topic. */
async function planWarnings(client, { fromSubject, toSubject, movedIds }) {
  // Call this BEFORE the move: it reads the plans of the topic the documents are leaving.
  const notes = [];
  const plans = await loadPlans(client, fromSubject.id);
  const movedPlans = plans.filter((plan) => movedIds.includes(plan.id));
  for (const plan of plans) {
    if (movedIds.includes(plan.id)) continue;
    const hits = planReferences(plan.content, movedIds);
    let parsed = null;
    try { parsed = JSON.parse(String(plan.content || "{}")); } catch { parsed = null; }
    if (hits.length) notes.push(`The plan “${parsed?.name || plan.name || "a study plan"}” (still in ${fromSubject.name}) uses ${hits.length} of the moved document${hits.length === 1 ? "" : "s"}; a plan only shows documents of its own topic.`);
  }
  if (movedPlans.length) {
    const { data: here, error } = await client.from("documents").select("id").eq("subject_id", fromSubject.id);
    if (error) throw error;
    const staying = (here || []).map((row) => row.id).filter((id) => !movedIds.includes(id));
    for (const plan of movedPlans) {
      const used = planReferences(plan.content, staying);
      if (used.length) notes.push(`The plan “${plan.name}” now lives in ${toSubject.name}, but ${used.length} of its reference document${used.length === 1 ? "" : "s"} stayed in ${fromSubject.name}.`);
    }
  }
  return notes;
}

/** Re-creates the document's tags in the target topic (a topic owns its tags) and returns name -> id. */
async function ensureTargetTags(client, subjectId, names) {
  const wanted = uniq(names);
  if (!wanted.length) return new Map();
  const { data: existing, error } = await client.from("topic_tags").select("id, tag").eq("subject_id", subjectId).in("tag", wanted);
  if (error) throw error;
  const known = new Map((existing || []).map((row) => [row.tag, row.id]));
  const missing = wanted.filter((tag) => !known.has(tag));
  if (missing.length) {
    const { error: insertError } = await client.from("topic_tags").insert(missing.map((tag) => ({ subject_id: subjectId, tag })));
    if (insertError) throw insertError;
    const { data: after, error: afterError } = await client.from("topic_tags").select("id, tag").eq("subject_id", subjectId).in("tag", wanted);
    if (afterError) throw afterError;
    for (const row of after || []) known.set(row.tag, row.id);
  }
  return known;
}

/** Runs `work(journal)`; on any error undoes what was done and rethrows with an honest message. */
async function atomically(work) {
  const journal = createJournal();
  try {
    return await work(journal);
  } catch (error) {
    const { failed } = await journal.rollback();
    const reason = String(error?.message || error);
    if (error instanceof MoveError && !failed.length) throw error;
    const err = new MoveError(failed.length
      ? `The move failed (${reason}) and could not be fully undone (${failed.join(", ")}). Reload and check where the items are.`
      : `The move failed (${reason}); nothing was changed.`, { status: error?.status || 500 });
    throw err;
  }
}

/**
 * Moves rows that carry a subject into another subject, in an order that never orphans anything:
 * tag links first (added before the old ones go), then the documents themselves, then derived rows.
 */
async function carryDocumentsToSubject(client, journal, { documentIds, fromId, toId, tagLinks, targetTags }) {
  // Chunks (retrieval) follow the document so the RAG filter by topic keeps finding them.
  await journal.step("document chunks", () => updateIn(client, "document_chunks", { subject_id: toId }, "document_id", documentIds, { optional: true }), () => updateIn(client, "document_chunks", { subject_id: fromId }, "document_id", documentIds, { optional: true }));

  await journal.step("documents", () => updateIn(client, "documents", { subject_id: toId, updated_at: new Date().toISOString() }, "id", documentIds), () => updateIn(client, "documents", { subject_id: fromId }, "id", documentIds));

  // Tags: add the links to the target topic's tags, then drop the old links.
  const fresh = tagLinks.filter((link) => link.tag).map((link) => ({ document_id: link.documentId, topic_tag_id: targetTags.get(link.tag) })).filter((row) => row.topic_tag_id);
  const old = tagLinks.map((link) => ({ document_id: link.documentId, topic_tag_id: link.topicTagId }));
  const freshTagIds = uniq(fresh.map((row) => row.topic_tag_id));
  const oldTagIds = uniq(old.map((row) => row.topic_tag_id));
  if (fresh.length) {
    await journal.step("new tag links", () => insertRows(client, "document_tags", fresh), () => deleteIn(client, "document_tags", { column: "document_id", ids: documentIds, alsoIn: { column: "topic_tag_id", ids: freshTagIds } }));
  }
  if (old.length) {
    await journal.step("old tag links", () => deleteIn(client, "document_tags", { column: "document_id", ids: documentIds, alsoIn: { column: "topic_tag_id", ids: oldTagIds } }), async () => {
      // Delete first: if the delete itself failed half-way, some old links are still there and a plain insert would hit the primary key.
      await deleteIn(client, "document_tags", { column: "document_id", ids: documentIds, alsoIn: { column: "topic_tag_id", ids: oldTagIds } });
      await insertRows(client, "document_tags", old);
    });
  }

  // Attempt and plan bookkeeping tables (optional; older databases do not have them).
  await journal.step("attempts", () => updateIn(client, "attempts", { subject_id: toId }, "activity_document_id", documentIds, { optional: true, where: { column: "subject_id", value: fromId } }), () => updateIn(client, "attempts", { subject_id: fromId }, "activity_document_id", documentIds, { optional: true, where: { column: "subject_id", value: toId } }));
  await journal.step("study plans", () => updateIn(client, "study_plans", { subject_id: toId }, "document_id", documentIds, { optional: true, where: { column: "subject_id", value: fromId } }), () => updateIn(client, "study_plans", { subject_id: fromId }, "document_id", documentIds, { optional: true, where: { column: "subject_id", value: toId } }));
}

function assertNotShared(tagLinks, documentIds) {
  const shared = tagLinks.some((link) => lower(link.tag).startsWith(SHARED_BY_PREFIX) && documentIds.includes(link.documentId));
  if (shared) throw new MoveError("Documents sent to you by another account are read-only, so they cannot be moved.", { status: 403 });
}

/** Where each document is filed now: ids of the folders in `document_folders` plus the primary `folder_id`. */
async function loadPlacement(client, documents) {
  const ids = documents.map((document) => document.id);
  const links = await rowsIn(client, "document_folders", "document_id, folder_id", "document_id", ids, { optional: true });
  const byDoc = new Map();
  for (const row of links || []) byDoc.set(row.document_id, [...(byDoc.get(row.document_id) || []), row.folder_id]);
  return {
    mapSupported: links !== null,
    rows: links || [],
    foldersOf: (document) => uniq([...(byDoc.get(document.id) || []), document.folder_id])
  };
}

/** Sets where documents are filed: the primary folder column and (when it exists) the many-folders table. */
async function fileDocuments(client, journal, { documents, placement, folderIds }) {
  const next = uniq(folderIds);
  const primary = next[0] || null;
  const ids = documents.map((document) => document.id);
  const previous = documents.map((document) => ({ id: document.id, folderId: document.folder_id || null }));
  const restorePrimary = async () => {
    const groups = new Map();
    for (const row of previous) groups.set(row.folderId || "", [...(groups.get(row.folderId || "") || []), row.id]);
    for (const [folderId, groupIds] of groups) await updateIn(client, "documents", { folder_id: folderId || null }, "id", groupIds);
  };
  await journal.step("document folder", () => updateIn(client, "documents", { folder_id: primary, updated_at: new Date().toISOString() }, "id", ids), restorePrimary);
  if (placement.mapSupported) {
    const before = placement.rows.map((row) => ({ document_id: row.document_id, folder_id: row.folder_id }));
    await journal.step("folder links", async () => {
      await deleteIn(client, "document_folders", { column: "document_id", ids });
      if (next.length) await insertRows(client, "document_folders", ids.flatMap((id) => next.map((folderId) => ({ document_id: id, folder_id: folderId }))));
    }, async () => {
      await deleteIn(client, "document_folders", { column: "document_id", ids });
      if (before.length) await insertRows(client, "document_folders", before);
    });
  }
}

/* ----------------------------------------------------------------- folders */

/** Finds, or creates (journaled), "Generated material / Study plans" in a topic and returns the plans folder id. */
async function ensurePlansRoot(client, journal, subjectId) {
  const folders = await loadFolders(client, subjectId);
  let generated = folders.find((folder) => !folder.parent_folder_id && same(folder.name, GENERATED_ROOT));
  const create = async (name, parentId) => {
    const { data, error } = await client.from("folders").insert({ subject_id: subjectId, name, parent_folder_id: parentId || null }).select("id, subject_id, name, parent_folder_id").single();
    if (error) throw error;
    const id = data.id;
    journal.register(`new folder ${name}`, async () => {
      const { error: failed } = await client.from("folders").delete().eq("id", id);
      if (failed) throw failed;
    });
    return data;
  };
  if (!generated) generated = await create(GENERATED_ROOT, "");
  let plans = folders.find((folder) => folder.parent_folder_id === generated.id && same(folder.name, PLANS_ROOT));
  if (!plans) plans = await create(PLANS_ROOT, generated.id);
  return plans.id;
}

/**
 * Moves a folder, with everything under it, to a topic and/or a parent folder.
 * @param {object} client Supabase admin client
 * @param {{ folderId: string, targetSubjectId?: string, targetFolderId?: string, nextName?: string }} request
 *   `targetFolderId` empty = the root of the target topic. `targetSubjectId` empty = the folder's own topic
 *   (or the target folder's). `nextName` renames as part of the move (used by undo).
 */
export async function moveFolderTree(client, { folderId, targetSubjectId = "", targetFolderId = "", nextName = "" }) {
  const id = String(folderId || "").trim();
  if (!id) throw new MoveError("Which folder?");
  const { data: folder, error } = await client.from("folders").select("id, subject_id, name, parent_folder_id").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!folder) throw new MoveError("That folder was not found.", { status: 404 });

  let parent = null;
  if (targetFolderId) {
    const { data, error: parentError } = await client.from("folders").select("id, subject_id, name, parent_folder_id").eq("id", String(targetFolderId)).maybeSingle();
    if (parentError) throw parentError;
    if (!data) throw new MoveError("The folder you are moving to was not found.", { status: 404 });
    parent = data;
  }
  const toSubjectId = String(targetSubjectId || parent?.subject_id || folder.subject_id);
  if (parent && parent.subject_id !== toSubjectId) throw new MoveError("That folder is not in the chosen topic.");

  const fromSubject = await loadSubject(client, folder.subject_id);
  const toSubject = toSubjectId === folder.subject_id ? fromSubject : await loadSubject(client, toSubjectId);
  assertSameWorkspace(fromSubject, toSubject);
  const crossing = toSubject.id !== fromSubject.id;

  const sourceFolders = await loadFolders(client, fromSubject.id);
  if (isStructuralFolder(folder, sourceFolders)) {
    throw new MoveError(`“${folder.name}” is part of how a topic is organised and stays where it is. Move the documents or folders inside it instead.`);
  }
  if (wouldCreateCycle(sourceFolders, folder.id, parent?.id || "")) throw new MoveError("A folder cannot be moved inside one of its own subfolders.");

  const subtree = subtreeFolderIds(sourceFolders, folder.id);
  const planFolder = crossing && isPlanFolder(folder, sourceFolders);
  const unchanged = !crossing && String(folder.parent_folder_id || "") === String(parent?.id || "") && (!nextName || nextName === folder.name);
  if (unchanged) return { moved: 0, folders: 0, documents: 0, unchanged: true, subjectId: fromSubject.id, folderId: folder.id, parentFolderId: parent?.id || "", name: folder.name, renamed: false, notes: [], previous: previousOf(folder) };

  // What is filed in the subtree (only matters when the topic changes).
  let documents = [];
  let companions = [];
  let tagLinks = [];
  let placement = null;
  let folderLinkRows = [];
  if (crossing) {
    const fromPrimary = await rowsIn(client, "documents", "id, subject_id, folder_id", "folder_id", subtree);
    folderLinkRows = (await rowsIn(client, "document_folders", "document_id, folder_id", "folder_id", subtree, { optional: true })) || [];
    const mappedIds = uniq(folderLinkRows.map((row) => row.document_id)).filter((docId) => !fromPrimary.some((row) => row.id === docId));
    const mapped = mappedIds.length ? await rowsIn(client, "documents", "id, subject_id, folder_id", "id", mappedIds) : [];
    documents = [...fromPrimary, ...mapped].filter((row) => row.subject_id === fromSubject.id);
    const documentIds = documents.map((row) => row.id);
    companions = await findCompanions(client, fromSubject.id, documentIds);
    tagLinks = await loadTagLinks(client, [...documentIds, ...companions]);
    assertNotShared(tagLinks, documentIds);
    placement = await loadPlacement(client, documents);
  }

  return atomically(async (journal) => {
    // A plan's folder keeps its place: under the target topic's Study plans.
    let parentId = parent?.id || "";
    const notes = [];
    if (planFolder) {
      const plansRoot = await ensurePlansRoot(client, journal, toSubject.id);
      const targetFolders = await loadFolders(client, toSubject.id);
      if (!parentId || !subtreeFolderIds(targetFolders, plansRoot).includes(parentId)) {
        parentId = plansRoot;
        notes.push(`A study plan's folder stays under “${PLANS_ROOT}”, so it went to ${toSubject.name} / ${GENERATED_ROOT} / ${PLANS_ROOT}.`);
      }
    }

    const siblings = (await loadFolders(client, toSubject.id)).filter((entry) => entry.id !== folder.id && String(entry.parent_folder_id || "") === parentId).map((entry) => entry.name);
    const { name, renamed } = uniqueFolderName(nextName || folder.name, siblings);
    if (renamed) notes.push(`“${nextName || folder.name}” already existed there, so this one is now “${name}”.`);

    const rootPatch = { parent_folder_id: parentId || null, name, updated_at: new Date().toISOString() };
    const rootBefore = { parent_folder_id: folder.parent_folder_id || null, name: folder.name };

    if (!crossing) {
      await journal.step("folder", async () => {
        const { error: failed } = await client.from("folders").update(rootPatch).eq("id", folder.id);
        if (failed) throw failed;
      }, async () => {
        const { error: failed } = await client.from("folders").update(rootBefore).eq("id", folder.id);
        if (failed) throw failed;
      });
      return result({ folder, toSubject, parentId, name, renamed, notes, folders: subtree.length, documents: 0, companions: 0 });
    }

    const documentIds = documents.map((row) => row.id);
    const everyId = [...documentIds, ...companions];
    const targetTags = await ensureTargetTags(client, toSubject.id, tagLinks.map((link) => link.tag));
    const inside = new Set(subtree);
    notes.push(...await planWarnings(client, { fromSubject, toSubject, movedIds: everyId }));

    // 1. the subfolders and the root, in two statements so a failure leaves the tree whole in one topic.
    const descendants = subtree.filter((entry) => entry !== folder.id);
    if (descendants.length) {
      await journal.step("subfolders", () => updateIn(client, "folders", { subject_id: toSubject.id }, "id", descendants), () => updateIn(client, "folders", { subject_id: fromSubject.id }, "id", descendants));
    }
    await journal.step("folder", async () => {
      const { error: failed } = await client.from("folders").update({ ...rootPatch, subject_id: toSubject.id }).eq("id", folder.id);
      if (failed) throw failed;
    }, async () => {
      const { error: failed } = await client.from("folders").update({ ...rootBefore, subject_id: fromSubject.id }).eq("id", folder.id);
      if (failed) throw failed;
    });

    // 2. a document filed in this tree AND somewhere else loses the "somewhere else" (it is in the old topic).
    for (const document of documents) {
      const all = placement.foldersOf(document);
      const keep = all.filter((entry) => inside.has(entry));
      if (keep.length === all.length) continue;
      await fileDocuments(client, journal, { documents: [document], placement: { ...placement, rows: placement.rows.filter((row) => row.document_id === document.id) }, folderIds: keep });
    }

    // 3. the documents, their companions, chunks, tags and bookkeeping.
    await carryDocumentsToSubject(client, journal, { documentIds: everyId, fromId: fromSubject.id, toId: toSubject.id, tagLinks, targetTags });
    return result({ folder, toSubject, parentId, name, renamed, notes, folders: subtree.length, documents: documentIds.length, companions: companions.length });
  });
}

const previousOf = (folder) => ({ subjectId: folder.subject_id, parentFolderId: folder.parent_folder_id || "", name: folder.name });

function result({ folder, toSubject, parentId, name, renamed, notes, folders, documents, companions }) {
  return {
    moved: folders + documents,
    folders,
    documents,
    companions,
    unchanged: false,
    subjectId: toSubject.id,
    subjectName: toSubject.name,
    folderId: folder.id,
    parentFolderId: parentId || "",
    name,
    renamed,
    notes,
    previous: previousOf(folder)
  };
}

/* ----------------------------------------------------------------- documents */

/**
 * Moves documents to a topic and/or folder(s) of the same workspace.
 * @param {{ documentIds: string[], targetSubjectId?: string, targetFolderId?: string, targetFolderIds?: string[] }} request
 *   no target folder = the root of the topic (unfiled). `targetFolderIds` files a document in several folders
 *   of the target topic (used by undo to restore exactly where it was).
 */
export async function moveDocumentsTo(client, { documentIds, targetSubjectId = "", targetFolderId = "", targetFolderIds = [] }) {
  const ids = uniq(Array.isArray(documentIds) ? documentIds : [documentIds]);
  if (!ids.length) throw new MoveError("Which document?");
  const rows = await rowsIn(client, "documents", "id, subject_id, folder_id, name", "id", ids);
  if (rows.length !== ids.length) throw new MoveError("A document you are moving was not found.", { status: 404 });

  const wantedFolders = uniq([targetFolderId, ...(targetFolderIds || [])]);
  const folderRows = wantedFolders.length ? await rowsIn(client, "folders", "id, subject_id", "id", wantedFolders) : [];
  if (folderRows.length !== wantedFolders.length) throw new MoveError("The folder you are moving to was not found.", { status: 404 });
  const toSubjectId = String(targetSubjectId || folderRows[0]?.subject_id || rows[0].subject_id);
  if (folderRows.some((row) => row.subject_id !== toSubjectId)) throw new MoveError("That folder is not in the chosen topic.");

  // Several source topics at once: handle each in turn (still one rollback scope each).
  const bySubject = new Map();
  for (const row of rows) bySubject.set(row.subject_id, [...(bySubject.get(row.subject_id) || []), row]);
  const summary = { moved: 0, documents: 0, companions: 0, folders: 0, unchanged: false, subjectId: toSubjectId, subjectName: "", folderId: wantedFolders[0] || "", notes: [], previous: [] };
  const toSubject = await loadSubject(client, toSubjectId);
  summary.subjectName = toSubject.name;
  const done = [];

  for (const [fromSubjectId, group] of bySubject) {
    try {
      const part = await moveDocumentGroup(client, { group, fromSubjectId, toSubject, folderIds: wantedFolders });
      summary.documents += part.documents;
      summary.companions += part.companions;
      summary.notes.push(...part.notes);
      summary.previous.push(...part.previous);
      summary.folders += part.folders;
      done.push(part);
    } catch (error) {
      // An earlier group already moved: say so instead of pretending nothing happened.
      if (done.length) throw new MoveError(`${String(error.message || error)} (${summary.documents} document${summary.documents === 1 ? " was" : "s were"} already moved.)`, { status: error.status || 500 });
      throw error;
    }
  }
  summary.moved = summary.documents;
  summary.unchanged = summary.documents === 0 && !summary.folders;
  return summary;
}

async function moveDocumentGroup(client, { group, fromSubjectId, toSubject, folderIds }) {
  const fromSubject = fromSubjectId === toSubject.id ? toSubject : await loadSubject(client, fromSubjectId);
  assertSameWorkspace(fromSubject, toSubject);
  const crossing = fromSubject.id !== toSubject.id;
  const ids = group.map((row) => row.id);
  const placement = await loadPlacement(client, group);
  const previous = group.map((row) => ({ id: row.id, subjectId: row.subject_id, folderIds: placement.foldersOf(row) }));

  if (crossing) {
    // A study plan travels with its folder, so its steps and quizzes stay together.
    const links = await loadTagLinks(client, ids);
    assertNotShared(links, ids);
    const planIds = new Set(links.filter((link) => lower(link.tag) === PLAN_TAG).map((link) => link.documentId));
    const sourceFolders = await loadFolders(client, fromSubject.id);
    const planFolders = new Map();
    for (const row of group.filter((entry) => planIds.has(entry.id))) {
      const filedIn = placement.foldersOf(row).map((folderId) => sourceFolders.find((entry) => entry.id === folderId)).find((entry) => entry && isPlanFolder(entry, sourceFolders));
      if (filedIn) planFolders.set(row.id, filedIn.id);
    }
    if (planFolders.size) {
      const out = { documents: 0, companions: 0, folders: 0, notes: [], previous: [] };
      for (const folderId of uniq([...planFolders.values()])) {
        const moved = await moveFolderTree(client, { folderId, targetSubjectId: toSubject.id });
        out.documents += moved.documents;
        out.companions += moved.companions;
        out.folders += moved.folders;
        out.notes.push(...moved.notes);
      }
      // Whatever was filed inside a moved plan folder is already in the target topic; move only what is left.
      const left = group.filter((row) => !planFolders.has(row.id));
      const rest = left.length ? (await rowsIn(client, "documents", "id, subject_id, folder_id, name", "id", left.map((row) => row.id))).filter((row) => row.subject_id === fromSubject.id) : [];
      if (rest.length) {
        const more = await moveDocumentGroup(client, { group: rest, fromSubjectId, toSubject, folderIds });
        out.documents += more.documents;
        out.companions += more.companions;
        out.notes.push(...more.notes);
        out.previous.push(...more.previous);
      }
      return out;
    }
  }

  const noChange = !crossing && group.every((row) => {
    const now = placement.foldersOf(row);
    return now.length === folderIds.length && folderIds.every((folderId) => now.includes(folderId));
  });
  if (noChange) return { documents: 0, companions: 0, folders: 0, notes: [], previous: [] };

  return atomically(async (journal) => {
    let companions = [];
    let notes = [];
    if (crossing) {
      companions = await findCompanions(client, fromSubject.id, ids);
      const everyId = [...ids, ...companions];
      const tagLinks = await loadTagLinks(client, everyId);
      const targetTags = await ensureTargetTags(client, toSubject.id, tagLinks.map((link) => link.tag));
      notes = await planWarnings(client, { fromSubject, toSubject, movedIds: everyId });
      await fileDocuments(client, journal, { documents: group, placement, folderIds });
      await carryDocumentsToSubject(client, journal, { documentIds: everyId, fromId: fromSubject.id, toId: toSubject.id, tagLinks, targetTags });
    } else {
      await fileDocuments(client, journal, { documents: group, placement, folderIds });
    }
    return { documents: ids.length, companions: companions.length, folders: 0, notes, previous };
  });
}

