export function renderVectorSvgLayer(page = {}) {
  const vectors = (page.fidelityObjects || []).filter((node) => node.type === "vectorPaint");
  const width = Number(page.width || 0);
  const height = Number(page.height || 0);

  const items = vectors.map((vector, index) => {
    const commands = (vector.commands || []).map((cmd) => `${cmd.op} ${JSON.stringify(cmd.args || [])}`).join(" | ");
    return `<g data-node-id="${vector.id}" data-vector-index="${index + 1}"><title>${commands}</title></g>`;
  }).join("\n");

  return `<svg class="vector-layer" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${items}</svg>`;
}
