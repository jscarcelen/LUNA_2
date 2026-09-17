function textHasAdjustments(node = {}) {
  return (node.segments || []).some((segment) => segment?.type === "adjustment" && Number(segment.adjustment || 0) !== 0);
}

function pickTextRepresentation(node = {}) {
  const hasAdjustments = textHasAdjustments(node);

  if (hasAdjustments) {
    return {
      representation: "svg-text",
      reason: "tj-adjustment-preservation",
      semanticRepresentation: "html-text",
      visualRepresentation: "svg-text",
      confidence: 0.9
    };
  }

  return {
    representation: "svg-text",
    reason: "consistent-svg-text-rendering",
    semanticRepresentation: "html-text",
    visualRepresentation: "svg-text",
    confidence: 0.94
  };
}

function pickImageRepresentation(node = {}) {
  if (node?.imageDataUri) {
    return {
      representation: "image-bytes",
      reason: "embedded-image-data-uri-available",
      semanticRepresentation: "image-node",
      visualRepresentation: "image",
      confidence: 1,
      exactSourceBytes: true,
      fallback: false
    };
  }

  return {
    representation: "source-crop",
    reason: "image-bytes-unavailable-fallback",
    semanticRepresentation: "image-node",
    visualRepresentation: "source-crop",
    confidence: 0.75,
    exactSourceBytes: false,
    fallback: true
  };
}

function pickVectorRepresentation(node = {}) {
  return {
    representation: "svg-path",
    reason: "vector-operators-preserved",
    semanticRepresentation: "vector-node",
    visualRepresentation: "svg",
    confidence: (node?.commands || []).length ? 0.98 : 0.7
  };
}

export function decideRepresentation(node = {}) {
  if (node?.type === "textPaint") return pickTextRepresentation(node);
  if (node?.type === "imagePaint") return pickImageRepresentation(node);
  if (node?.type === "vectorPaint") return pickVectorRepresentation(node);
  return {
    representation: "native-html",
    reason: "default",
    semanticRepresentation: "html",
    visualRepresentation: "html",
    confidence: 0.5
  };
}

export function buildRepresentationPlan(documentTree = {}) {
  const pages = Array.isArray(documentTree?.pages) ? documentTree.pages : [];
  const decisions = [];
  const counts = {
    "native-html": 0,
    "svg-text": 0,
    "svg-glyph": 0,
    "image-bytes": 0,
    "source-crop": 0,
    "svg-path": 0
  };

  for (const page of pages) {
    const nodes = Array.isArray(page?.fidelityObjects) && page.fidelityObjects.length
      ? page.fidelityObjects
      : (Array.isArray(page?.elements) ? page.elements : []);

    for (const node of nodes) {
      const decision = decideRepresentation(node);
      decisions.push({
        page: Number(page.pageNumber || 0),
        nodeId: String(node?.id || ""),
        sourceType: String(node?.type || "unknown"),
        ...decision,
        sourceRefs: node?.sourceRefs || []
      });
      if (Object.hasOwn(counts, decision.representation)) {
        counts[decision.representation] += 1;
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    counts,
    decisions
  };
}
