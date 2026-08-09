import { elementChildren, firstElement, getAttribute, localName, makeProvenance, nodePath, serializeXml } from "./utils.js";
import { splitInlineMathBoundaryText } from "./mathCanonical.js";
import { parseMathNode } from "./parseMath.js";
import { parseRunNode } from "./parseRun.js";

function syntheticTextNode(text, anchorNode) {
  return {
    type: "text",
    text,
    format: {},
    provenance: anchorNode?.provenance || null,
    source: anchorNode?.source || null
  };
}

function normalizeInlineMathChildren(children = []) {
  const normalized = [];
  for (const child of children) {
    if (child?.type !== "inline_math") {
      normalized.push(child);
      continue;
    }

    const { leadingText, trailingText, mathNode } = splitInlineMathBoundaryText(child);
    if (leadingText) normalized.push(syntheticTextNode(leadingText, child));
    if (mathNode) normalized.push(mathNode);
    if (trailingText) normalized.push(syntheticTextNode(trailingText, child));
  }
  return normalized;
}

function headingLevel(styleName = "") {
  const match = String(styleName || "").match(/heading\s*([1-6])/i);
  return match ? Number(match[1]) : 0;
}

function paragraphStyle(paragraphNode, styles) {
  const pPr = firstElement(paragraphNode, "pPr");
  const pStyle = firstElement(pPr, "pStyle");
  const styleId = getAttribute(pStyle, "val");
  const styleName = styles[styleId]?.name || styleId || "";
  return {
    styleId,
    styleName,
    level: headingLevel(styleName || styleId),
    alignment: getAttribute(firstElement(pPr, "jc"), "val") || null,
    spacingBefore: getAttribute(firstElement(pPr, "spacing"), "before") || null,
    spacingAfter: getAttribute(firstElement(pPr, "spacing"), "after") || null,
    lineSpacing: getAttribute(firstElement(pPr, "spacing"), "line") || null,
    indentLeft: getAttribute(firstElement(pPr, "ind"), "left") || null,
    indentFirstLine: getAttribute(firstElement(pPr, "ind"), "firstLine") || null,
    keepNext: Boolean(firstElement(pPr, "keepNext")),
    pageBreakBefore: Boolean(firstElement(pPr, "pageBreakBefore")),
    widowControl: Boolean(firstElement(pPr, "widowControl"))
  };
}

function listInfo(paragraphNode, numbering) {
  const pPr = firstElement(paragraphNode, "pPr");
  const numPr = firstElement(pPr, "numPr");
  if (!numPr) return null;
  const numId = getAttribute(firstElement(numPr, "numId"), "val");
  const ilvl = Number(getAttribute(firstElement(numPr, "ilvl"), "val") || 0);
  const levelMeta = numbering[numId]?.levels?.[ilvl] || null;
  const format = String(levelMeta?.format || "").toLowerCase();
  return {
    numId,
    level: ilvl,
    ordered: format !== "bullet",
    format: levelMeta?.format || null,
    text: levelMeta?.text || null
  };
}

export function parseParagraphNode(paragraphNode, options = {}) {
  const style = paragraphStyle(paragraphNode, options.styles || {});
  const list = listInfo(paragraphNode, options.numbering || {});
  const children = [];
  const sideEffects = [];

  const directDisplayMath = elementChildren(paragraphNode).filter((child) => localName(child) === "oMathPara");
  for (const mathNode of directDisplayMath) {
    sideEffects.push(parseMathNode(mathNode, {
      ...options,
      display: true
    }));
  }

  let runIndex = 0;
  for (const child of elementChildren(paragraphNode)) {
    const name = localName(child);
    if (name === "r" || name === "hyperlink") {
      const parsed = parseRunNode(child, {
        ...options,
        path: nodePath(options.path, `${name}[${runIndex + 1}]`),
        runIndex: runIndex + 1
      });
      children.push(...parsed.nodes);
      sideEffects.push(...parsed.sideEffects);
      runIndex += 1;
      continue;
    }

    if (name === "oMath") {
      children.push(parseMathNode(child, {
        ...options,
        display: false
      }));
      continue;
    }
  }

  const baseNode = style.level > 0
    ? {
      type: "heading",
      level: style.level,
      style: style.styleName || style.styleId || null,
      children: normalizeInlineMathChildren(children),
      layout: style,
      provenance: makeProvenance(options.part, options.path, paragraphNode.nodeName),
      source: {
        xml: serializeXml(paragraphNode)
      }
    }
    : {
      type: "paragraph",
      children: normalizeInlineMathChildren(children),
      layout: style,
      provenance: makeProvenance(options.part, options.path, paragraphNode.nodeName),
      source: {
        xml: serializeXml(paragraphNode)
      }
    };

  if (style.level === 0 && !list && !children.length && !sideEffects.length) {
    return {
      list: null,
      node: null,
      siblings: []
    };
  }

  if (list) {
    return {
      list,
      node: {
        type: "list_item",
        ordered: list.ordered,
        level: list.level,
        numbering: list,
        children: [baseNode, ...sideEffects],
        provenance: makeProvenance(options.part, options.path, paragraphNode.nodeName),
        source: {
          xml: serializeXml(paragraphNode)
        }
      }
    };
  }

  if (!children.length && sideEffects.length) {
    if (sideEffects.length === 1 && sideEffects[0].type === "display_math") {
      return { list: null, node: sideEffects[0], siblings: [] };
    }
    return {
      list: null,
      node: null,
      siblings: sideEffects
    };
  }

  return {
    list: null,
    node: baseNode,
    siblings: sideEffects
  };
}