export function buildImageEvidenceLayer(imageIngestion = { pages: [] }) {
  const objects = [];

  for (const page of imageIngestion.pages || []) {
    objects.push({
      id: `evidence-${page.id}`,
      sourceId: page.id,
      sourceType: page.sourceType || "image",
      kind: "pageImage",
      page: Number(page.pageNumber || 0),
      bbox: {
        x: 0,
        y: 0,
        width: Number(page.width || 0),
        height: Number(page.height || 0)
      },
      raw: page,
      status: "preserved"
    });

    for (let i = 0; i < (page.ocr || []).length; i += 1) {
      const region = page.ocr[i] || {};
      objects.push({
        id: `evidence-${page.id}-ocr-${i + 1}`,
        sourceId: `${page.id}-ocr-${i + 1}`,
        sourceType: region.sourceType || "ocr",
        kind: region.kind || "ocrText",
        page: Number(page.pageNumber || 0),
        bbox: region.bbox || null,
        raw: region,
        status: "preserved"
      });
    }
  }

  return {
    sourceType: "image",
    objects
  };
}
