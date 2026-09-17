export function pdfToHtmlY(pdfY = 0, pageHeight = 0, elementHeight = 0) {
  return Number(pageHeight || 0) - Number(pdfY || 0) - Number(elementHeight || 0);
}

export function htmlToPdfY(htmlY = 0, pageHeight = 0, elementHeight = 0) {
  return Number(pageHeight || 0) - Number(htmlY || 0) - Number(elementHeight || 0);
}
