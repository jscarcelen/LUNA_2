export function annotateTableInterpretation(documentTree = {}) {
  for (const page of documentTree.pages || []) {
    for (const node of page.elements || []) {
      if (node.type !== "table") continue;
      node.interpretation = {
        ...(node.interpretation || {}),
        layer: "table",
        status: "interpreted"
      };
    }
  }
  return documentTree;
}
