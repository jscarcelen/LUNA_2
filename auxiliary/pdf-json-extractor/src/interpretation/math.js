export function annotateMathInterpretation(documentTree = {}) {
  for (const page of documentTree.pages || []) {
    for (const node of page.elements || []) {
      if (node.type !== "textGroup" || node.semanticCandidate !== "math") continue;
      node.math = {
        visual: {
          sourceRefs: node.sourceRefs || [],
          preserved: true
        },
        semantic: {
          format: "latex",
          value: String(node.text || ""),
          confidence: Number(node?.classification?.confidence || 0),
          status: "inferred"
        }
      };
      node.interpretation = {
        ...(node.interpretation || {}),
        layer: "math",
        status: "partially_interpreted"
      };
    }
  }
  return documentTree;
}
