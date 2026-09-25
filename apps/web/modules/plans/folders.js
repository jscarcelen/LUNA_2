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
