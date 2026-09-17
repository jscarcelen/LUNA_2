export function collectTextLayer(page = {}) {
  return (page.fidelityObjects || []).filter((node) => node.type === "textPaint");
}
