/**
 * Renaming a document is also renaming it where generated material remembers it: a master document's list of
 * originals, a study plan's sources, a resource's "made from" list. They keep `{ id, name }` pairs, so a
 * rename walks the stored JSON and updates every pair for that id. (Material refers to documents by id,
 * so nothing breaks when this is skipped — it only keeps the names shown there current.)
 */

/** @returns {string|null} the new JSON text, or null when nothing in it names that document */
export function renameInResource(content, { id, from, to }) {
  if (!id || !to || !String(content || "").includes(id)) return null;
  let parsed;
  try { parsed = JSON.parse(content); } catch { return null; }
  let changed = 0;
  const walk = (node) => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== "object") return;
    if (node.id === id) {
      for (const key of ["name", "documentName", "sourceName"]) {
        if (typeof node[key] === "string" && (!from || node[key] === from || node[key].replace(/\.[^.]+$/, "") === from)) { node[key] = to; changed += 1; }
      }
    }
    Object.values(node).forEach(walk);
  };
  walk(parsed);
  return changed ? JSON.stringify(parsed, null, 2) : null;
}
