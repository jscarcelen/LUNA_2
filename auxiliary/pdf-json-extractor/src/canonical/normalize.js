export function pdfToCanonicalY(pdfY, pageHeight, objectHeight = 0) {
  return Number(pageHeight || 0) - Number(pdfY || 0) - Number(objectHeight || 0);
}

export function canonicalToPdfY(htmlY, pageHeight, objectHeight = 0) {
  return Number(pageHeight || 0) - Number(htmlY || 0) - Number(objectHeight || 0);
}

export function normalizeBBox(bbox = {}) {
  return {
    x: Number(bbox.x || 0),
    y: Number(bbox.y || 0),
    width: Number(bbox.width || 0),
    height: Number(bbox.height || 0)
  };
}
