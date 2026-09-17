export function collectImageLayer(page = {}) {
  return (page.fidelityObjects || []).filter((node) => node.type === "imagePaint");
}
