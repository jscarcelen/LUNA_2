/**
 * Where things live in a topic (a first-level folder).
 *
 *   <Topic> / Uploaded material
 *           / Generated material / Study plans / <a plan> / Reference materials   ← a shortcut to "Uploaded material"
 *                                                          (the plan's quizzes and summaries are filed here too)
 *                                                          (and, for a plan built from 2+ uploaded documents, its
 *                                                           master document — generated, filed once, see ./master.js)
 *                               / Resources not in study plans
 *
 * Nothing is ever copied: a document lives once, in "Uploaded material". A plan's "Reference
 * materials" is only a link to that folder, shown as a shortcut in the tree.
 */

export const UPLOADED_FOLDER = "Uploaded material";
export const GENERATED_ROOT = "Generated material";
export const PLANS_ROOT = "Study plans";
export const LOOSE_FOLDER = "Resources not in study plans";
export const MATERIAL_FOLDER = "Reference materials";

const same = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

/** Finds a folder by name under a parent, or creates it. Returns its id. */
async function ensureFolder(name, parentFolderId, { folders, subjectId, onCreateFolder }) {
  const existing = folders.find((folder) => same(folder.name, name) && String(folder.parentFolderId || "") === String(parentFolderId || ""));
  if (existing) return existing.id;
  const created = await onCreateFolder?.(name, parentFolderId || "", subjectId);
  if (created?.id) folders.push({ id: created.id, name, parentFolderId: parentFolderId || "" });
  return created?.id || "";
}

/** The folders every topic has. `folders` is the subject's folder list; it is updated in place as folders are created. */
export async function ensureSubjectStructure({ folders = [], subjectId, onCreateFolder }) {
  if (typeof onCreateFolder !== "function") return { uploadedId: "", generatedId: "", plansRootId: "", looseId: "" };
  const context = { folders, subjectId, onCreateFolder };
  const uploadedId = await ensureFolder(UPLOADED_FOLDER, "", context);
  const generatedId = await ensureFolder(GENERATED_ROOT, "", context);
  const plansRootId = await ensureFolder(PLANS_ROOT, generatedId, context);
  const looseId = await ensureFolder(LOOSE_FOLDER, generatedId, context);
  return { uploadedId, generatedId, plansRootId, looseId };
}

/** The ids of those folders as they are now, without creating anything. */
export function subjectStructure(folders = []) {
  const find = (name, parentId) => folders.find((folder) => same(folder.name, name) && String(folder.parentFolderId || "") === String(parentId || ""))?.id || "";
  const uploadedId = find(UPLOADED_FOLDER, "");
  const generatedId = find(GENERATED_ROOT, "");
  return { uploadedId, generatedId, plansRootId: generatedId ? find(PLANS_ROOT, generatedId) : "", looseId: generatedId ? find(LOOSE_FOLDER, generatedId) : "" };
}

/**
 * Makes sure the plan's folders exist and returns their ids. The plan's quizzes and summaries are
 * filed in the plan's folder; "Reference materials" is the shortcut to the uploaded material.
 */
export async function ensurePlanFolders(planName, { folders = [], subjectId, onCreateFolder }) {
  if (typeof onCreateFolder !== "function") return { rootId: "", planId: "", materialId: "", generatedId: "", uploadedId: "" };
  const working = folders.map((folder) => ({ ...folder }));
  const structure = await ensureSubjectStructure({ folders: working, subjectId, onCreateFolder });
  const planId = await ensureFolder(planName || "Study plan", structure.plansRootId, { folders: working, subjectId, onCreateFolder });
  const materialId = await ensureFolder(MATERIAL_FOLDER, planId, { folders: working, subjectId, onCreateFolder });
  return { rootId: structure.plansRootId, planId, materialId, generatedId: planId, uploadedId: structure.uploadedId };
}

/**
 * Kept for older callers. Reference material is no longer filed into the plan's folder (that made a
 * document live in two places); the plan's "Reference materials" folder is a shortcut instead.
 */
export async function linkMaterial() {
  return 0;
}

/** Is this folder a plan's "Reference materials" shortcut? (a folder of that name inside a folder inside "Study plans") */
export function isReferenceShortcut(folder, folders = []) {
  if (!same(folder?.name, MATERIAL_FOLDER)) return false;
  const plan = folders.find((entry) => entry.id === folder.parentFolderId);
  const root = plan && folders.find((entry) => entry.id === plan.parentFolderId);
  return Boolean(root && same(root.name, PLANS_ROOT));
}

/**
 * Everything that goes when a plan is deleted:
 *  - the plan's folder and every folder inside it,
 *  - the generated resources filed in those folders (and the plan's own built practice steps),
 *  - the plan document itself.
 * The reference material is only *unlinked* from the plan's folders: those are the learner's own
 * uploads, filed elsewhere too, so deleting the plan never deletes them.
 * Pure: returns ids, nothing is called.
 */
export function planDeletionScope(planDocument, plan, { folders = [], documents = [] } = {}) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const root = folders.find((folder) => same(folder.name, PLANS_ROOT) && (!folder.parentFolderId || same(byId.get(folder.parentFolderId)?.name, GENERATED_ROOT)));
  let folderId = (planDocument?.folderIds || []).find((id) => byId.get(id)?.parentFolderId && same(byId.get(byId.get(id).parentFolderId)?.name, PLANS_ROOT)) || "";
  if (!folderId && root) folderId = folders.find((folder) => folder.parentFolderId === root.id && same(folder.name, plan?.name))?.id || "";

  const tree = new Set();
  if (folderId) {
    tree.add(folderId);
    let grew = true;
    while (grew) {
      grew = false;
      for (const folder of folders) {
        if (!tree.has(folder.id) && tree.has(folder.parentFolderId)) { tree.add(folder.id); grew = true; }
      }
    }
  }

  const protectedIds = new Set([planDocument?.id, ...(plan?.materialIds || [])].filter(Boolean));
  const inTree = (document) => (document.folderIds || []).some((id) => tree.has(id));
  const isPlan = (document) => (document.tags || []).includes("study-plan");
  const isAttempt = (document) => (document.tags || []).includes("activity-attempt");

  const generatedIds = documents
    .filter((document) => !protectedIds.has(document.id) && !isPlan(document) && !isAttempt(document) && inTree(document) && document.sourceType === "generated")
    .map((document) => document.id);
  const linkedIds = documents
    .filter((document) => inTree(document) && !generatedIds.includes(document.id) && document.id !== planDocument?.id && !isPlan(document))
    .map((document) => document.id);

  return {
    folderId,
    folderName: folderId ? byId.get(folderId)?.name || "" : "",
    treeIds: [...tree],
    rootId: root?.id || "",
    generatedIds,
    linkedIds
  };
}

/** Carries out a `planDeletionScope`. Extra document ids (e.g. attempts the learner chose to erase) are deleted too. */
export async function deletePlanEverything(scope, { planDocumentId, extraDocumentIds = [], documents = [], folders = [], onRemoveDocument, onUpdateDocumentMeta, onRemoveFolder }) {
  const tree = new Set(scope.treeIds);
  const removed = new Set();
  for (const id of [planDocumentId, ...scope.generatedIds, ...extraDocumentIds].filter(Boolean)) {
    if (removed.has(id)) continue;
    removed.add(id);
    await onRemoveDocument?.(id);
  }
  // Uploaded material survives: it only loses its place in the plan's folders.
  for (const id of scope.linkedIds) {
    const document = documents.find((item) => item.id === id);
    if (!document || removed.has(id)) continue;
    await onUpdateDocumentMeta?.(id, { folderIds: (document.folderIds || []).filter((folderId) => folderId && !tree.has(folderId)), tags: document.tags || [] });
  }
  if (scope.folderId) await onRemoveFolder?.(scope.folderId);
  // "Study plans" itself goes once the last plan folder is gone.
  if (scope.rootId && !folders.some((folder) => folder.parentFolderId === scope.rootId && folder.id !== scope.folderId)) {
    const stillFiled = documents.some((document) => !removed.has(document.id) && (document.folderIds || []).includes(scope.rootId));
    if (!stillFiled) await onRemoveFolder?.(scope.rootId);
  }
  return { documents: removed.size, folders: scope.treeIds.length };
}
