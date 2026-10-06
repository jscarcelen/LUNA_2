/**
 * The browser's side of moving: where a dropped document should land, what the status line says, and
 * how an undo is put together. Pure (no React), so it is tested on its own.
 *
 * Node ids are the ones from ./folderModel.js: `s:<subjectId>` is a topic (the root of it), `f:<subjectId>:<folderId>` a folder.
 */
import { subjectStructure } from "../plans/folders.js";
import { branchOf, parseNode, pathOf } from "./ui/folderModel.js";

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * The folder (raw folder id; "" = the root of the topic) a document goes to when it is dropped on `targetNodeId`.
 * Dropped on a folder: that folder. Dropped on ANOTHER topic's root: the topic's own place for that kind of
 * material — "Uploaded material" for what was uploaded, "Resources not in study plans" for what was generated —
 * when the topic has it. Dropped on its own topic's root: unfiled in that topic, as before.
 */
export function destinationFolderId({ document, targetNodeId, subjects = [] }) {
  const target = parseNode(targetNodeId);
  if (target.kind === "folder") return target.folderId;
  if (target.kind !== "subject" || target.subjectId === document.subjectId) return "";
  const subject = subjects.find((entry) => entry.id === target.subjectId);
  const structure = subjectStructure(subject?.folders || []);
  return (document.sourceType === "generated" ? structure.looseId : structure.uploadedId) || "";
}

/** Nodes a folder cannot be moved into: itself and everything under it. */
export function blockedTargets(folders, draggedNodeId) {
  return draggedNodeId ? [...branchOf(folders, draggedNodeId)] : [];
}

/** "Statistics / Uploaded material" for a node. */
export function targetPath(folders, targetNodeId) {
  return pathOf(folders, targetNodeId) || "the top level";
}

/** One line for the status area after moving documents. */
export function documentMoveMessage({ moved = 0, readOnly = 0, path = "", notes = [] }) {
  const parts = [moved ? `${plural(moved, "item")} moved to ${path}` : "Nothing to move — already there"];
  if (readOnly) parts.push(`${plural(readOnly, "read-only item")} stayed where ${readOnly === 1 ? "it was" : "they were"}`);
  return `${parts.join(" · ")}.${notes.length ? ` ${notes.join(" ")}` : ""}`;
}

/** One line for the status area after moving a folder. `result` is what the server returned. */
export function folderMoveMessage({ result, path = "" }) {
  if (result?.unchanged) return "That folder is already there.";
  const contents = [result?.folders > 1 ? plural(result.folders - 1, "subfolder") : "", result?.documents ? plural(result.documents, "document") : ""].filter(Boolean);
  return `“${result?.name || "Folder"}” moved to ${path}${contents.length ? ` with ${contents.join(" and ")}` : ""}.${result?.notes?.length ? ` ${result.notes.join(" ")}` : ""}`;
}

/**
 * Where the moved documents were (the server returns it): one move back per place, so a document that
 * was filed in several folders goes back to all of them.
 * @param {{ id: string, subjectId: string, folderIds: string[] }[]} previous
 * @returns {{ ids: string[], targetSubjectId: string, targetFolderIds: string[] }[]}
 */
export function undoGroups(previous = []) {
  const groups = new Map();
  for (const entry of previous) {
    const folderIds = [...new Set(entry.folderIds || [])].sort();
    const key = `${entry.subjectId}|${folderIds.join(",")}`;
    const group = groups.get(key) || { ids: [], targetSubjectId: entry.subjectId, targetFolderIds: folderIds };
    group.ids.push(entry.id);
    groups.set(key, group);
  }
  return [...groups.values()];
}
