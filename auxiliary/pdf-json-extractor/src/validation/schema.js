import { validateDocumentTree } from "../validateDocumentTree.js";

export function validateSchema(documentTree = {}) {
  return validateDocumentTree(documentTree);
}
