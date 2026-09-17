export function annotateOcrInterpretation(documentTree = {}) {
  for (const page of documentTree.pages || []) {
    for (const node of page.elements || []) {
      if (node.type !== "ocrText" && node.type !== "handwrittenText") continue;
      node.interpretation = {
        ...(node.interpretation || {}),
        layer: "ocr",
        status: "interpreted"
      };
    }
  }
  return documentTree;
}
