export function validateDocumentTree(documentTree = {}) {
  const errors = [];

  if (documentTree?.schemaVersion !== "cdm-v3") errors.push("Invalid schemaVersion. Expected cdm-v3.");
  if (documentTree?.type !== "document") errors.push("Root type must be document.");
  if (!Array.isArray(documentTree?.pages)) errors.push("pages must be an array.");
  if (!documentTree?.metadata?.filename) errors.push("metadata.filename is required.");
  if (!documentTree?.source?.primaryType) errors.push("source.primaryType is required.");
  if (!Array.isArray(documentTree?.supportedSourceTypes)) errors.push("supportedSourceTypes must be an array.");

  const pages = Array.isArray(documentTree?.pages) ? documentTree.pages : [];
  const isLegacyShape = pages.some((p) => Array.isArray(p?.elements));

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index] || {};
    if (isLegacyShape) {
      if (!Number.isFinite(page?.width) || page.width <= 0) errors.push(`pages[${index}].width must be a positive number.`);
      if (!Number.isFinite(page?.height) || page.height <= 0) errors.push(`pages[${index}].height must be a positive number.`);
      if (!Array.isArray(page?.elements)) errors.push(`pages[${index}].elements must be an array.`);
      if (!Array.isArray(page?.readingOrder)) errors.push(`pages[${index}].readingOrder must be an array.`);
      if (!page?.source?.type) errors.push(`pages[${index}].source.type is required.`);
      if (!Array.isArray(page?.evidence)) errors.push(`pages[${index}].evidence must be an array.`);

      const elements = Array.isArray(page?.elements) ? page.elements : [];
      for (let elementIndex = 0; elementIndex < elements.length; elementIndex += 1) {
        const element = elements[elementIndex] || {};
        if (!element?.id) errors.push(`pages[${index}].elements[${elementIndex}] missing id.`);
        if (!element?.type) errors.push(`pages[${index}].elements[${elementIndex}] missing type.`);
        const bbox = element?.bbox || {};
        if (!Number.isFinite(bbox?.x) || !Number.isFinite(bbox?.y) || !Number.isFinite(bbox?.width) || !Number.isFinite(bbox?.height)) {
          errors.push(`pages[${index}].elements[${elementIndex}] bbox must be numeric.`);
        }
      }
      continue;
    }

    if (!Number.isFinite(page?.pageNumber) || page.pageNumber <= 0) errors.push(`pages[${index}].pageNumber must be a positive number.`);
    const w = Number(page?.dimensions?.width ?? page?.width ?? 0);
    const h = Number(page?.dimensions?.height ?? page?.height ?? 0);
    if (!Number.isFinite(w) || w < 0) errors.push(`pages[${index}].dimensions.width must be non-negative.`);
    if (!Number.isFinite(h) || h < 0) errors.push(`pages[${index}].dimensions.height must be non-negative.`);
    if (!Array.isArray(page?.blocks)) errors.push(`pages[${index}].blocks must be an array.`);
  }

  if (!isLegacyShape) {
    if (!Array.isArray(documentTree?.content)) {
      errors.push("content must be an array.");
    } else {
      const allowed = new Set(["document", "page", "heading", "paragraph", "list", "listItem", "table", "tableRow", "tableCell", "figure", "image", "equation", "caption", "footnote", "header", "footer", "quote", "code", "pageBreak", "unknown"]);
      for (let idx = 0; idx < documentTree.content.length; idx += 1) {
        const node = documentTree.content[idx] || {};
        if (!node?.id) errors.push(`content[${idx}].id is required.`);
        if (!node?.type || !allowed.has(node.type)) errors.push(`content[${idx}].type is invalid.`);
        if (!Array.isArray(node?.children)) errors.push(`content[${idx}].children must be an array.`);
        if (!Number.isFinite(Number(node?.page)) || Number(node.page) < 0) errors.push(`content[${idx}].page must be a non-negative number.`);
        if (!Number.isFinite(Number(node?.order)) || Number(node.order) <= 0) errors.push(`content[${idx}].order must be a positive number.`);
        const source = node?.source || {};
        const bbox = source?.bbox || {};
        if (!Number.isFinite(source?.page)) errors.push(`content[${idx}].source.page must be numeric.`);
        if (!Number.isFinite(bbox?.x) || !Number.isFinite(bbox?.y) || !Number.isFinite(bbox?.width) || !Number.isFinite(bbox?.height)) {
          errors.push(`content[${idx}].source.bbox must be numeric.`);
        }
        if (!Array.isArray(source?.objectRefs)) errors.push(`content[${idx}].source.objectRefs must be an array.`);
        if (!Number.isFinite(Number(node?.confidence))) errors.push(`content[${idx}].confidence must be numeric.`);
        if (!node?.status) errors.push(`content[${idx}].status is required.`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
