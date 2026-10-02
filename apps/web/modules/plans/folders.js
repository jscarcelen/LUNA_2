/**
 * Where a study plan keeps its things.
 *
 * Every plan gets the same three folders, so a term's work is findable without hunting:
 *
 *   Study plans / <the plan> / Reference material     ← the documents it studies
 *                            / Generated resources    ← the quizzes and summaries Luna made
 *
 * The reference material is *linked*, never copied: a document can be filed in several folders, so
 * the plan's folder points at the document that already exists in the workspace.
 */

export const PLANS_ROOT = "Study plans";
export const MATERIAL_FOLDER = "Reference material";
export const GENERATED_FOLDER = "Generated resources";

const same = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

/** Finds a folder by name under a parent, or creates it. Returns its id. */
async function ensureFolder(name, parentFolderId, { folders, subjectId, onCreateFolder }) {
  const existing = folders.find((folder) => same(folder.name, name) && String(folder.parentFolderId || "") === String(parentFolderId || ""));
  if (existing) return existing.id;
  const created = await onCreateFolder?.(name, parentFolderId || "", subjectId);
  if (created?.id) folders.push({ id: created.id, name, parentFolderId: parentFolderId || "" });
  return created?.id || "";
}

/**
 * Makes sure the plan's folders exist and returns their ids.
 * `folders` is the subject's folder list; it is updated in place as folders are created.
 */
export async function ensurePlanFolders(planName, { folders = [], subjectId, onCreateFolder }) {
  if (typeof onCreateFolder !== "function") return { rootId: "", planId: "", materialId: "", generatedId: "" };
  const working = folders.map((folder) => ({ ...folder }));
  const rootId = await ensureFolder(PLANS_ROOT, "", { folders: working, subjectId, onCreateFolder });
  const planId = await ensureFolder(planName || "Study plan", rootId, { folders: working, subjectId, onCreateFolder });
  const materialId = await ensureFolder(MATERIAL_FOLDER, planId, { folders: working, subjectId, onCreateFolder });
  const generatedId = await ensureFolder(GENERATED_FOLDER, planId, { folders: working, subjectId, onCreateFolder });
  return { rootId, planId, materialId, generatedId };
}

/**
 * Files the material a plan studies into its "Reference material" folder without duplicating it:
 * the folder is added to the document's existing folders.
 */
export async function linkMaterial(documentIds = [], materialFolderId, { documents = [], onUpdateDocumentMeta }) {
  if (!materialFolderId || typeof onUpdateDocumentMeta !== "function") return 0;
  let linked = 0;
  for (const id of documentIds) {
    const document = documents.find((item) => item.id === id);
    if (!document) continue;
    const folderIds = [...new Set([...(document.folderIds || []).filter(Boolean), materialFolderId])];
    if (folderIds.length === (document.folderIds || []).length) continue;
    await onUpdateDocumentMeta(id, { folderIds, tags: document.tags || [] });
    linked += 1;
  }
  return linked;
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
  const root = folders.find((folder) => same(folder.name, PLANS_ROOT) && !folder.parentFolderId);
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
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
