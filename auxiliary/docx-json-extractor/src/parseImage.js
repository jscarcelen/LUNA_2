import { findElements, getAttribute, makeProvenance, serializeXml, toPixels } from "./utils.js";

export function parseDrawingNode(node, options = {}) {
  const blip = findElements(node, "blip")[0] || null;
  const embedId = getAttribute(blip, "embed") || getAttribute(blip, "r:embed");
  const relationship = options.relationships[embedId] || null;
  const extent = findElements(node, "extent")[0] || null;
  const docPr = findElements(node, "docPr")[0] || null;

  return {
    type: "image",
    id: `image-${String(options.nextImageId()).padStart(3, "0")}`,
    source: {
      part: relationship?.target || "",
      relationshipId: embedId || "",
      xml: serializeXml(node)
    },
    dimensions: {
      width: toPixels(getAttribute(extent, "cx")),
      height: toPixels(getAttribute(extent, "cy"))
    },
    altText: getAttribute(docPr, "descr") || "",
    caption: getAttribute(docPr, "name") || "",
    provenance: makeProvenance(options.part, options.path, node.nodeName)
  };
}