import { sourceIdOf } from "../sourceModel.js";

export function collectSourceRefs(documentTree = {}) {
  const refs = [];
  for (const page of documentTree.pages || []) {
    for (const node of page.elements || []) {
      for (const ref of node.sourceRefs || []) {
        const sourceId = sourceIdOf(ref);
        if (sourceId) refs.push(sourceId);
      }
    }
  }
  return refs;
}

export function ensureCanonicalProvenance(documentTree = {}) {
  const issues = [];
  for (const page of documentTree.pages || []) {
    for (const node of page.elements || []) {
      if (!Array.isArray(node.sourceRefs) || node.sourceRefs.length === 0) {
        issues.push({ page: page.pageNumber, nodeId: node.id, issue: "missing_source_refs" });
      }
      if (!node.confidence || typeof node.confidence !== "object") {
        issues.push({ page: page.pageNumber, nodeId: node.id, issue: "missing_confidence" });
      }
    }
  }
  return {
    ok: issues.length === 0,
    issues
  };
}
