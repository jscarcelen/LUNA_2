import { elementChildren, firstElement, getAttribute, localName, makeProvenance, nodePath, serializeXml } from "./utils.js";
import { parseParagraphNode } from "./parseParagraph.js";

export function parseTableNode(tableNode, options = {}) {
  const rows = [];
  let rowIndex = 0;

  for (const rowNode of elementChildren(tableNode).filter((child) => localName(child) === "tr")) {
    const cells = [];
    let cellIndex = 0;
    for (const cellNode of elementChildren(rowNode).filter((child) => localName(child) === "tc")) {
      const cellChildren = [];
      const cellPath = nodePath(options.path, `tr[${rowIndex + 1}]/tc[${cellIndex + 1}]`);
      let paragraphIndex = 0;
      for (const child of elementChildren(cellNode)) {
        const childName = localName(child);
        if (childName === "p") {
          const parsed = parseParagraphNode(child, {
            ...options,
            path: nodePath(cellPath, `p[${paragraphIndex + 1}]`),
            paragraphIndex: options.nextParagraphIndex()
          });
          if (parsed.list) {
            cellChildren.push({
              type: "list",
              ordered: parsed.list.ordered,
              level: parsed.list.level,
              items: [parsed.node],
              provenance: makeProvenance(options.part, cellPath, child.nodeName),
              source: {
                xml: serializeXml(child)
              }
            });
          } else if (parsed.node) {
            cellChildren.push(parsed.node);
            if (Array.isArray(parsed.siblings)) cellChildren.push(...parsed.siblings);
          }
          paragraphIndex += 1;
          continue;
        }
        if (childName === "tbl") {
          cellChildren.push(parseTableNode(child, {
            ...options,
            path: nodePath(cellPath, `tbl[1]`)
          }));
        }
      }
      cells.push({
        type: "table_cell",
        colSpan: Number(getAttribute(firstElement(firstElement(cellNode, "tcPr"), "gridSpan"), "val") || 1),
        rowSpan: getAttribute(firstElement(firstElement(cellNode, "tcPr"), "vMerge"), "val") || null,
        width: getAttribute(firstElement(firstElement(cellNode, "tcPr"), "tcW"), "w") || null,
        shading: getAttribute(firstElement(firstElement(cellNode, "tcPr"), "shd"), "fill") || null,
        children: cellChildren,
        provenance: makeProvenance(options.part, cellPath, cellNode.nodeName),
        source: {
          xml: serializeXml(cellNode)
        }
      });
      cellIndex += 1;
    }
    rows.push({
      type: "table_row",
      cells,
      provenance: makeProvenance(options.part, nodePath(options.path, `tr[${rowIndex + 1}]`), rowNode.nodeName),
      source: {
        xml: serializeXml(rowNode)
      }
    });
    rowIndex += 1;
  }

  return {
    type: "table",
    width: getAttribute(firstElement(firstElement(tableNode, "tblPr"), "tblW"), "w") || null,
    alignment: getAttribute(firstElement(firstElement(tableNode, "tblPr"), "jc"), "val") || null,
    rows,
    provenance: makeProvenance(options.part, options.path, tableNode.nodeName),
    source: {
      xml: serializeXml(tableNode)
    }
  };
}