import { decodeXmlEntities, elementChildren, findElements, firstElement, getAttribute, localName, makeProvenance, serializeXml } from "./utils.js";
import { serializeCanonicalLatex } from "./mathCanonical.js";

function tokenNode(type = "identifier", value = "") {
  return {
    type,
    value
  };
}

function createExpression(children = []) {
  const flattened = [];
  for (const child of children) {
    if (!child) continue;
    if (child.type === "expression") {
      flattened.push(...(Array.isArray(child.children) ? child.children : []));
    } else {
      flattened.push(child);
    }
  }
  return {
    type: "expression",
    children: flattened
  };
}

function parseMathChildren(node, context) {
  const children = [];
  for (const child of elementChildren(node)) {
    const parsed = parseMathElement(child, context);
    if (parsed) children.push(parsed);
  }
  return children;
}

function mathText(node) {
  return findElements(node, "t")
    .map((item) => decodeXmlEntities(String(item.textContent || "")))
    .join("")
    .replace(/\r/g, "")
    .replace(/\u0000/g, "")
    .replace(/\u2061/g, "");
}

function isBalancedWrapped(text = "") {
  const pairs = { "(": ")", "[": "]", "{": "}" };
  const open = text[0];
  const close = pairs[open];
  if (!close || text[text.length - 1] !== close) return false;
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === open) depth += 1;
    if (character === close) depth -= 1;
    if (depth === 0 && index < text.length - 1) return false;
  }
  return depth === 0;
}

function tokenizeMathText(text = "") {
  const cleaned = String(text || "").trim();
  if (!cleaned) return [];

  if (isBalancedWrapped(cleaned)) {
    return [{
      type: "delimiter",
      open: cleaned[0],
      close: cleaned[cleaned.length - 1],
      body: createExpression(tokenizeMathText(cleaned.slice(1, -1)))
    }];
  }

  const tokens = [];
  let cursor = 0;
  while (cursor < cleaned.length) {
    const current = cleaned[cursor];

    if (/\s/u.test(current)) {
      cursor += 1;
      continue;
    }
    if (["(", ")", "[", "]", "{", "}", ",", ".", ":", ";"].includes(current)) {
      tokens.push(tokenNode("punctuation", current));
      cursor += 1;
      continue;
    }
    if (["≤", "≥", "<", ">"].includes(current)) {
      tokens.push(tokenNode("relation", current));
      cursor += 1;
      continue;
    }
    if (["=", "+", "-", "±", "·", "×", "→"].includes(current)) {
      tokens.push(tokenNode("operator", current));
      cursor += 1;
      continue;
    }
    if (/\d/u.test(current) || (current === "." && /\d/u.test(cleaned[cursor + 1] || ""))) {
      let value = current;
      cursor += 1;
      while (cursor < cleaned.length && /[\d.]/u.test(cleaned[cursor])) {
        value += cleaned[cursor];
        cursor += 1;
      }
      tokens.push(tokenNode("number", value));
      continue;
    }
    if (/[_\p{L}]/u.test(current)) {
      let value = current;
      cursor += 1;
      while (cursor < cleaned.length && /[_\p{L}]/u.test(cleaned[cursor])) {
        value += cleaned[cursor];
        cursor += 1;
      }
      tokens.push(tokenNode("identifier", value));
      continue;
    }
    tokens.push(tokenNode("identifier", current));
    cursor += 1;
  }
  return tokens;
}

function parseMathElement(node, context) {
  const name = localName(node);

  if (name === "oMath" || name === "oMathPara") {
    const children = parseMathChildren(node, context);
    return {
      type: "expression",
      children
    };
  }

  if (name === "r") {
    const tokens = tokenizeMathText(mathText(node));
    if (!tokens.length) return null;
    return tokens.length === 1 ? tokens[0] : createExpression(tokens);
  }

  if (name === "ctrlPr") {
    return null;
  }

  if (name === "f") {
    const numeratorNode = firstElement(node, "num");
    const denominatorNode = firstElement(node, "den");
    return {
      type: "fraction",
      numerator: numeratorNode ? parseMathElement(numeratorNode, context) : null,
      denominator: denominatorNode ? parseMathElement(denominatorNode, context) : null
    };
  }

  if (name === "num" || name === "den" || name === "e") {
    return {
      type: "expression",
      children: parseMathChildren(node, context)
    };
  }

  if (name === "sSub") {
    return {
      type: "subscript",
      base: parseMathElement(firstElement(node, "e"), context),
      subscript: parseMathElement(firstElement(node, "sub"), context)
    };
  }

  if (name === "sSup") {
    return {
      type: "superscript",
      base: parseMathElement(firstElement(node, "e"), context),
      superscript: parseMathElement(firstElement(node, "sup"), context)
    };
  }

  if (name === "sSubSup") {
    return {
      type: "subsuperscript",
      base: parseMathElement(firstElement(node, "e"), context),
      subscript: parseMathElement(firstElement(node, "sub"), context),
      superscript: parseMathElement(firstElement(node, "sup"), context)
    };
  }

  if (name === "rad") {
    const degreeNode = firstElement(node, "deg");
    const parsedDegree = degreeNode && elementChildren(degreeNode).length ? parseMathElement(degreeNode, context) : null;
    return {
      type: "radical",
      degree: parsedDegree,
      body: parseMathElement(firstElement(node, "e"), context)
    };
  }

  if (name === "deg") {
    const children = parseMathChildren(node, context);
    if (!children.length) return null;
    return {
      type: "expression",
      children
    };
  }

  if (name === "acc") {
    const accent = getAttribute(findElements(node, "chr")[0], "val");
    return {
      type: "accent",
      accent: accent || "accent",
      body: parseMathElement(firstElement(node, "e"), context)
    };
  }

  if (name === "bar") {
    return {
      type: "bar",
      position: getAttribute(firstElement(node, "pos"), "val") || "top",
      body: parseMathElement(firstElement(node, "e"), context)
    };
  }

  if (name === "nary") {
    return {
      type: "nary",
      operator: getAttribute(firstElement(firstElement(node, "naryPr"), "chr"), "val") || mathText(firstElement(node, "naryPr") || node).trim(),
      lower: parseMathElement(firstElement(node, "sub"), context),
      upper: parseMathElement(firstElement(node, "sup"), context),
      body: parseMathElement(firstElement(node, "e"), context)
    };
  }

  if (name === "m") {
    return {
      type: "matrix",
      rows: elementChildren(node).filter((child) => localName(child) === "mr").map((row) => ({
        type: "matrix_row",
        cells: elementChildren(row).filter((child) => localName(child) === "e").map((cell) => parseMathElement(cell, context))
      }))
    };
  }

  if (name === "eqArr") {
    return {
      type: "equation_array",
      rows: elementChildren(node).filter((child) => localName(child) === "e").map((child) => parseMathElement(child, context))
    };
  }

  if (name === "d") {
    const dPr = firstElement(node, "dPr");
    return {
      type: "delimiter",
      open: getAttribute(firstElement(dPr, "begChr"), "val") || "(",
      close: getAttribute(firstElement(dPr, "endChr"), "val") || ")",
      body: parseMathElement(firstElement(node, "e"), context)
    };
  }

  if (name === "func") {
    return {
      type: "function",
      name: parseMathElement(firstElement(node, "fName"), context),
      body: parseMathElement(firstElement(node, "e"), context)
    };
  }

  if (name === "fName") {
    return {
      type: "identifier",
      value: mathText(node).trim()
    };
  }

  const text = mathText(node).trim();
  if (text) {
    const tokens = tokenizeMathText(text);
    return tokens.length === 1 ? tokens[0] : createExpression(tokens);
  }

  context.diagnostics.unsupportedElements.push({
    type: "math-unsupported",
    originalElement: localName(node),
    provenance: makeProvenance(context.part, context.path, node.nodeName),
    source: {
      xml: serializeXml(node)
    }
  });
  return {
    type: "unsupported",
    originalElement: localName(node),
    provenance: makeProvenance(context.part, context.path, node.nodeName),
    source: {
      xml: serializeXml(node)
    }
  };
}

export function parseMathNode(node, options = {}) {
  const mathTree = parseMathElement(node, options);
  const latex = serializeCanonicalLatex(mathTree);
  return {
    id: `EQ-${String(options.nextEquationId()).padStart(4, "0")}`,
    type: options.display ? "display_math" : "inline_math",
    latex,
    mathTree,
    source: {
      format: "omml",
      xml: serializeXml(node),
      nodePath: String(options.path || "")
    },
    position: {
      paragraphIndex: Number(options.paragraphIndex || 0),
      runIndex: Number(options.runIndex || 0)
    },
    provenance: makeProvenance(options.part, options.path, node.nodeName)
  };
}