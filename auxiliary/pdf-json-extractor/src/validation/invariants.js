import { sourceIdOf } from "../sourceModel.js";

export function validateProvenanceInvariants(documentTree = {}, rawPages = []) {
  const rawIndex = new Set();
  for (const page of rawPages || []) {
    for (const item of page.textObjects || []) rawIndex.add(item.id);
    for (const item of page.operators || []) rawIndex.add(item.id);
    for (const item of page.fonts || []) rawIndex.add(item.id);
    for (const item of page.images || []) rawIndex.add(item.id);
    for (const item of page.graphics || []) rawIndex.add(item.id);
  }

  const unresolved = [];
  for (const page of documentTree.pages || []) {
    for (const node of page.elements || []) {
      for (const ref of node.sourceRefs || []) {
        const id = sourceIdOf(ref);
        if (!id) continue;
        if (!rawIndex.has(id)) unresolved.push({ page: page.pageNumber, nodeId: node.id, sourceId: id });
      }
    }
  }

  return {
    ok: unresolved.length === 0,
    unresolved
  };
}
