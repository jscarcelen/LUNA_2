import { elementChildren, firstElement, getAttribute, localName, makeProvenance, serializeXml } from "./utils.js";

export function parseSectionProperties(sectPrNode, options = {}) {
  if (!sectPrNode) return null;
  const pgSz = firstElement(sectPrNode, "pgSz");
  const pgMar = firstElement(sectPrNode, "pgMar");
  const cols = firstElement(sectPrNode, "cols");
  const headerRefs = elementChildren(sectPrNode).filter((child) => localName(child) === "headerReference").map((child) => ({
    type: getAttribute(child, "type") || "default",
    relationshipId: getAttribute(child, "id") || getAttribute(child, "r:id")
  }));
  const footerRefs = elementChildren(sectPrNode).filter((child) => localName(child) === "footerReference").map((child) => ({
    type: getAttribute(child, "type") || "default",
    relationshipId: getAttribute(child, "id") || getAttribute(child, "r:id")
  }));

  return {
    type: "section_properties",
    pageSize: {
      width: getAttribute(pgSz, "w") || null,
      height: getAttribute(pgSz, "h") || null,
      orientation: getAttribute(pgSz, "orient") || "portrait"
    },
    margins: {
      top: getAttribute(pgMar, "top") || null,
      right: getAttribute(pgMar, "right") || null,
      bottom: getAttribute(pgMar, "bottom") || null,
      left: getAttribute(pgMar, "left") || null,
      header: getAttribute(pgMar, "header") || null,
      footer: getAttribute(pgMar, "footer") || null,
      gutter: getAttribute(pgMar, "gutter") || null
    },
    columns: {
      count: Number(getAttribute(cols, "num") || 1),
      space: getAttribute(cols, "space") || null
    },
    headerReferences: headerRefs,
    footerReferences: footerRefs,
    provenance: makeProvenance(options.part, options.path, sectPrNode.nodeName),
    source: {
      xml: serializeXml(sectPrNode)
    }
  };
}