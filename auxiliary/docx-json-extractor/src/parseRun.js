import { elementChildren, findElements, firstElement, getAttribute, localName, makeProvenance, nodePath, normalizeText, serializeXml } from "./utils.js";
import { parseDrawingNode } from "./parseImage.js";
import { parseMathNode } from "./parseMath.js";

function runFormatting(runNode) {
  const properties = firstElement(runNode, "rPr");
  return {
    bold: Boolean(firstElement(properties, "b")),
    italic: Boolean(firstElement(properties, "i")),
    underline: getAttribute(firstElement(properties, "u"), "val") || null,
    strike: Boolean(firstElement(properties, "strike") || firstElement(properties, "dstrike")),
    font: getAttribute(firstElement(properties, "rFonts"), "ascii") || null,
    fontSize: getAttribute(firstElement(properties, "sz"), "val") || null,
    color: getAttribute(firstElement(properties, "color"), "val") || null,
    highlight: getAttribute(firstElement(properties, "highlight"), "val") || null,
    verticalAlign: getAttribute(firstElement(properties, "vertAlign"), "val") || null,
    style: getAttribute(firstElement(properties, "rStyle"), "val") || null,
    language: getAttribute(firstElement(properties, "lang"), "val") || null,
    caps: Boolean(firstElement(properties, "caps")),
    smallCaps: Boolean(firstElement(properties, "smallCaps"))
  };
}

function createTextNode(text, runNode, options) {
  if (!text) return null;
  return {
    type: "text",
    text,
    format: runFormatting(runNode),
    provenance: makeProvenance(options.part, options.path, runNode.nodeName),
    source: {
      xml: serializeXml(runNode)
    }
  };
}

function parseHyperlinkNode(node, options) {
  const relId = getAttribute(node, "id") || getAttribute(node, "r:id");
  const children = [];
  let runIndex = 0;
  for (const child of elementChildren(node)) {
    if (localName(child) !== "r") continue;
    const parsed = parseRunNode(child, {
      ...options,
      path: nodePath(options.path, `r[${runIndex + 1}]`),
      runIndex: runIndex + 1
    });
    if (parsed) children.push(...parsed.nodes);
    runIndex += 1;
  }
  return {
    nodes: [{
      type: "link",
      url: options.relationships[relId]?.target || "",
      relationshipId: relId || "",
      children,
      provenance: makeProvenance(options.part, options.path, node.nodeName),
      source: {
        xml: serializeXml(node)
      }
    }],
    sideEffects: []
  };
}

export function parseRunNode(node, options = {}) {
  const name = localName(node);
  const sideEffects = [];

  if (name === "hyperlink") {
    return parseHyperlinkNode(node, { ...options, sideEffects });
  }

  if (name !== "r") {
    return { nodes: [], sideEffects };
  }

  const nodes = [];
  for (const child of elementChildren(node)) {
    const childName = localName(child);
    if (childName === "t") {
      const textNode = createTextNode(String(child.textContent || ""), node, options);
      if (textNode) nodes.push(textNode);
      continue;
    }
    if (childName === "tab") {
      const textNode = createTextNode("\t", node, options);
      if (textNode) nodes.push(textNode);
      continue;
    }
    if (childName === "br") {
      if (getAttribute(child, "type") === "page") {
        nodes.push({
          type: "page_break",
          provenance: makeProvenance(options.part, `${options.path}/br[1]`, child.nodeName),
          source: {
            xml: serializeXml(child)
          }
        });
      } else {
        const textNode = createTextNode("\n", node, options);
        if (textNode) nodes.push(textNode);
      }
      continue;
    }
    if (childName === "lastRenderedPageBreak") {
      nodes.push({
        type: "page_break",
        provenance: makeProvenance(options.part, `${options.path}/lastRenderedPageBreak[1]`, child.nodeName),
        source: {
          xml: serializeXml(child)
        }
      });
      continue;
    }
    if (childName === "drawing") {
      nodes.push(parseDrawingNode(child, {
        ...options,
        path: `${options.path}/drawing[1]`
      }));
      continue;
    }
    if (childName === "oMath") {
      nodes.push(parseMathNode(child, {
        ...options,
        display: false,
        path: `${options.path}/oMath[1]`
      }));
      continue;
    }
    if (childName === "oMathPara") {
      nodes.push(parseMathNode(child, {
        ...options,
        display: true,
        path: `${options.path}/oMathPara[1]`
      }));
    }
  }

  return { nodes, sideEffects };
}