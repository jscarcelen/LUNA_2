export function annotateTextInterpretation(documentTree = {}) {
  for (const page of documentTree.pages || []) {
    for (const node of page.elements || []) {
      if (!["heading", "paragraph", "listItem", "header", "footer", "pageNumber", "textGroup"].includes(node.type)) continue;
      node.interpretation = {
        ...(node.interpretation || {}),
        layer: "text",
        status: node.type === "textGroup" ? "partially_interpreted" : "interpreted"
      };
    }
  }
  return documentTree;
}
