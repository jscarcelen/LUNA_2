function asBBox(bbox = {}) {
  return {
    x: Number(bbox.x || 0),
    y: Number(bbox.y || 0),
    width: Number(bbox.width || 0),
    height: Number(bbox.height || 0)
  };
}

export function buildPdfEvidenceLayer(rawPages = []) {
  const evidence = [];

  for (const rawPage of rawPages) {
    const pageNumber = Number(rawPage?.pageNumber || 0);

    for (const obj of rawPage?.textObjects || []) {
      evidence.push({
        id: `evidence-${obj.id}`,
        sourceId: obj.id,
        sourceType: "pdf",
        kind: "text",
        page: pageNumber,
        order: Number(obj.index || 0),
        bbox: asBBox(obj?.bbox || {}),
        raw: obj,
        status: "preserved"
      });
    }

    for (const obj of rawPage?.operators || []) {
      evidence.push({
        id: `evidence-${obj.id}`,
        sourceId: obj.id,
        sourceType: "pdf",
        kind: "operator",
        page: pageNumber,
        order: Number(obj.index || 0),
        bbox: null,
        raw: obj,
        status: "preserved"
      });
    }

    for (const obj of rawPage?.fonts || []) {
      evidence.push({
        id: `evidence-${obj.id}`,
        sourceId: obj.id,
        sourceType: "pdf",
        kind: "font",
        page: pageNumber,
        order: Number(obj.index || 0),
        bbox: null,
        raw: obj,
        status: "preserved"
      });
    }

    for (const obj of rawPage?.images || []) {
      evidence.push({
        id: `evidence-${obj.id}`,
        sourceId: obj.id,
        sourceType: "pdf",
        kind: "image",
        page: pageNumber,
        order: Number(obj.index || 0),
        bbox: asBBox(obj?.geometry || {}),
        raw: obj,
        status: "preserved"
      });
    }

    for (const obj of rawPage?.graphics || []) {
      evidence.push({
        id: `evidence-${obj.id}`,
        sourceId: obj.id,
        sourceType: "pdf",
        kind: "vector",
        page: pageNumber,
        order: Number(obj.index || 0),
        bbox: null,
        raw: obj,
        status: "preserved"
      });
    }
  }

  return {
    sourceType: "pdf",
    objects: evidence
  };
}

export function buildEvidenceIndex(evidenceLayer = { objects: [] }) {
  const index = new Map();
  for (const row of evidenceLayer.objects || []) {
    index.set(row.sourceId, row);
  }
  return index;
}
