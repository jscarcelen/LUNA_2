export function classifyDocumentRegions(documentTree = {}) {
  for (const page of documentTree.pages || []) {
    for (const node of page.elements || []) {
      if (["header", "footer", "pageNumber"].includes(node.type)) {
        node.region = node.type === "pageNumber" ? "footer" : node.type;
      } else if (!node.region) {
        node.region = "body";
      }
    }
  }
  return documentTree;
}
