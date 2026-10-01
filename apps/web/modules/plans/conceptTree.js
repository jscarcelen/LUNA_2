/**
 * Concept tree helpers — the single place that turns flat concept rows + prerequisite edges
 * (prerequisite_id = parent, concept_id = child) into a tree. The map, the student-model list
 * and any concept tag must all agree on this structure.
 */

export const MAX_TREE_CONCEPTS = 20;

/**
 * Builds a forest. Each concept gets exactly one parent (first edge whose parent exists);
 * cycles and unknown parents become roots. Children are ordered by importance.
 * @returns {{ roots: object[], childrenById: Map<string, object[]>, parentById: Map<string, string> }}
 */
export function buildConceptForest(concepts = [], prerequisites = []) {
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const parentById = new Map();
  for (const edge of prerequisites) {
    const child = edge?.concept_id;
    const parent = edge?.prerequisite_id;
    if (!child || !parent || child === parent) continue;
    if (!byId.has(child) || !byId.has(parent) || parentById.has(child)) continue;
    parentById.set(child, parent);
  }

  // Break cycles: walk up from every node; if we revisit a node, cut that link.
  for (const c of concepts) {
    const seen = new Set([c.id]);
    let cur = parentById.get(c.id);
    while (cur) {
      if (seen.has(cur)) { parentById.delete(c.id); break; }
      seen.add(cur);
      cur = parentById.get(cur);
    }
  }

  const byImportance = (a, b) => (b.importance ?? 0) - (a.importance ?? 0);
  const childrenById = new Map(concepts.map((c) => [c.id, []]));
  const roots = [];
  for (const c of concepts) {
    const parentId = parentById.get(c.id);
    if (parentId) childrenById.get(parentId).push(c);
    else roots.push(c);
  }
  roots.sort(byImportance);
  for (const kids of childrenById.values()) kids.sort(byImportance);
  return { roots, childrenById, parentById };
}

/**
 * Keeps at most `max` concepts without breaking the tree: breadth-first from the roots, so a
 * concept is only ever kept if its parent was kept too. Returns the kept concepts and edges.
 */
export function capConceptTree(concepts = [], prerequisites = [], max = MAX_TREE_CONCEPTS) {
  if (!Array.isArray(concepts) || concepts.length <= max) return { concepts, prerequisites };
  const { roots, childrenById } = buildConceptForest(concepts, prerequisites);
  const kept = [];
  let level = roots;
  while (level.length && kept.length < max) {
    for (const c of level) {
      if (kept.length >= max) break;
      kept.push(c);
    }
    level = level.flatMap((c) => childrenById.get(c.id) || []).filter((c) => !kept.includes(c));
  }
  const keptIds = new Set(kept.map((c) => c.id));
  return {
    concepts: kept,
    prerequisites: prerequisites.filter((e) => keptIds.has(e.concept_id) && keptIds.has(e.prerequisite_id)),
  };
}
