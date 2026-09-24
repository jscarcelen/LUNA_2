/**
 * One folder tree for a workspace.
 *
 * Luna used to have three levels — workspace, subject, folder — which is two more than anyone
 * needs. Everything is a folder now: a subject is simply a top-level folder, its folders are
 * subfolders, and anything (a document, a plan, a calendar) is linked to a folder and therefore to
 * everything under it. The old shape still exists underneath, so nothing has to be migrated: these
 * helpers translate between "just folders" and the subject/folder storage.
 */

export const ROOT = "";

/** Node id for a subject (a top-level folder) and for a folder inside it. */
export const subjectNode = (subjectId) => `s:${subjectId}`;
export const folderNode = (subjectId, folderId) => `f:${subjectId}:${folderId}`;

export function parseNode(nodeId) {
  const value = String(nodeId || "");
  if (value.startsWith("s:")) return { kind: "subject", subjectId: value.slice(2), folderId: "" };
  if (value.startsWith("f:")) {
    const [, subjectId, folderId] = value.split(":");
    return { kind: "folder", subjectId, folderId };
  }
  return { kind: "root", subjectId: "", folderId: "" };
}

/** The workspace as a flat list of folders (id, name, parentFolderId) the tree component understands. */
export function foldersOf(workspace) {
  const out = [];
  for (const subject of workspace?.subjects || []) {
    out.push({ id: subjectNode(subject.id), name: subject.name, parentFolderId: ROOT, colour: subject.color, subjectId: subject.id, isSubject: true });
    for (const folder of subject.folders || []) {
      out.push({
        id: folderNode(subject.id, folder.id),
        name: folder.name,
        parentFolderId: folder.parentFolderId ? folderNode(subject.id, folder.parentFolderId) : subjectNode(subject.id),
        subjectId: subject.id,
        folderId: folder.id
      });
    }
  }
  return out;
}

/** Documents of the whole workspace, each filed under its folder nodes (or its subject when unfiled). */
export function documentsOf(workspace) {
  const out = [];
  for (const subject of workspace?.subjects || []) {
    for (const document of subject.documents || []) {
      const nodes = (document.folderIds || []).filter(Boolean).map((folderId) => folderNode(subject.id, folderId));
      out.push({ ...document, subjectId: subject.id, subjectName: subject.name, folderIds: nodes.length ? nodes : [subjectNode(subject.id)] });
    }
  }
  return out;
}

/** Every node id under (and including) this one. */
export function branchOf(folders, nodeId) {
  const children = new Map();
  for (const folder of folders) {
    const key = folder.parentFolderId || ROOT;
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(folder.id);
  }
  const out = [];
  const walk = (id) => { out.push(id); for (const child of children.get(id) || []) walk(child); };
  walk(nodeId);
  return new Set(out);
}

/** Readable path of a node ("Statistics / Unit 1"). */
export function pathOf(folders, nodeId) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const parts = [];
  let current = byId.get(nodeId);
  while (current) {
    parts.unshift(current.name);
    current = current.parentFolderId ? byId.get(current.parentFolderId) : null;
  }
  return parts.join(" / ");
}
