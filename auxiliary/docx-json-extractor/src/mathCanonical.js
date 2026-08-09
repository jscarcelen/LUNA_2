import temml from "temml";

const KNOWN_FUNCTIONS = new Set(["ln", "log", "sin", "cos", "tan", "sec", "csc", "cot", "sinh", "cosh", "tanh", "exp"]);
const GREEK_MAP = {
  α: "\\alpha",
  β: "\\beta",
  γ: "\\gamma",
  δ: "\\delta",
  ε: "\\epsilon",
  θ: "\\theta",
  λ: "\\lambda",
  μ: "\\mu",
  π: "\\pi",
  ρ: "\\rho",
  σ: "\\sigma",
  τ: "\\tau",
  φ: "\\phi",
  χ: "\\chi",
  ψ: "\\psi",
  ω: "\\omega",
  Δ: "\\Delta",
  Γ: "\\Gamma",
  Λ: "\\Lambda",
  Π: "\\Pi",
  Σ: "\\Sigma",
  Φ: "\\Phi",
  Ψ: "\\Psi",
  Ω: "\\Omega"
};
const RELATION_MAP = {
  "≤": "\\le",
  "≥": "\\ge",
  "<": "<",
  ">": ">"
};
const LEADING_BOUNDARY_PUNCTUATION = new Set(["(", "[", "{"]);
const TRAILING_BOUNDARY_PUNCTUATION = new Set([")", "]", "}", ",", ".", ":", ";"]);

function cloneNode(node) {
  return JSON.parse(JSON.stringify(node));
}

function flattenExpressionChildren(node) {
  if (!node) return [];
  if (node.type !== "expression") return [node];
  const children = [];
  for (const child of Array.isArray(node.children) ? node.children : []) {
    if (!child) continue;
    if (child.type === "expression") {
      children.push(...flattenExpressionChildren(child));
    } else {
      children.push(child);
    }
  }
  return children;
}

function wrapExpression(children) {
  return {
    type: "expression",
    children
  };
}

function isSingleScriptToken(node) {
  if (!node) return false;
  if (node.type === "number") return true;
  if (node.type === "identifier") {
    return /^[A-Za-z0-9]$/u.test(node.value || "") || Object.prototype.hasOwnProperty.call(GREEK_MAP, node.value || "");
  }
  if (node.type === "expression") {
    const children = flattenExpressionChildren(node);
    return children.length === 1 && isSingleScriptToken(children[0]);
  }
  return false;
}

function isJuxtapositionAtom(node) {
  if (!node) return false;
  if (["identifier", "number", "accent", "bar", "delimiter", "function"].includes(node.type)) return true;
  if (node.type === "expression") {
    const children = flattenExpressionChildren(node);
    return children.length > 0 && children.every((child) => isJuxtapositionAtom(child));
  }
  return false;
}

function serializeIdentifier(value = "") {
  return GREEK_MAP[value] || value;
}

function serializeFunctionName(value = "") {
  if (KNOWN_FUNCTIONS.has(value)) return `\\${value}`;
  return serializeIdentifier(value);
}

function serializeScriptArgument(node) {
  const latex = serializeCanonicalLatex(node);
  return isSingleScriptToken(node) ? latex : `{${latex}}`;
}

function serializeCompactScript(node) {
  return cleanupLatexSpacing(serializeCanonicalLatex(node))
    .replace(/\s*=\s*/g, "=")
    .replace(/\s*<\s*/g, "<")
    .replace(/\s*>\s*/g, ">")
    .replace(/\s*\\le\s*/g, "\\le")
    .replace(/\s*\\ge\s*/g, "\\ge");
}

function serializeScriptBase(node) {
  if (!node) return "";
  if (node.type === "expression") {
    const children = flattenExpressionChildren(node);
    if (children.length > 0 && children.every((child) => isJuxtapositionAtom(child))) {
      return serializeSequence(children);
    }
  }
  return serializeCanonicalLatex(node);
}

function operatorLatex(node) {
  const value = node.value || "";
  if (value === "=") return " = ";
  if (value === "→") return " \\to ";
  if (value === "±") return " \\pm ";
  if (value === "·") return " ";
  if (value === "×") return "\\times";
  return value;
}

function relationLatex(node) {
  return ` ${RELATION_MAP[node.value] || node.value || ""} `;
}

function cleanupLatexSpacing(latex = "") {
  return String(latex || "")
    .replace(/\u2061/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?\)\]\}])/g, "$1")
    .replace(/([\(\[\{])\s+/g, "$1")
    .replace(/\s*([_^])\s*/g, "$1")
    .replace(/\s*\\pm\s*/g, " \\pm ")
    .replace(/\s*\\to\s*/g, " \\to ")
    .replace(/\{\s+/g, "{")
    .replace(/\s+\}/g, "}")
    .trim();
}

function serializeSequence(children = []) {
  let latex = "";
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    const next = children[index + 1] || null;
    if (!child) continue;
    if (child.type === "identifier" && KNOWN_FUNCTIONS.has(child.value || "") && next?.type === "delimiter") {
      latex += serializeFunctionName(child.value || "");
      continue;
    }
    latex += serializeCanonicalLatex(child);
  }
  return cleanupLatexSpacing(latex);
}

export function serializeCanonicalLatex(node) {
  if (!node) return "";
  switch (node.type) {
    case "number":
      return node.value || "";
    case "identifier":
      return serializeIdentifier(node.value || "");
    case "operator":
      return operatorLatex(node);
    case "relation":
      return relationLatex(node);
    case "punctuation":
      return node.value || "";
    case "expression":
      return serializeSequence(flattenExpressionChildren(node));
    case "fraction":
      return `\\frac{${serializeCanonicalLatex(node.numerator)}}{${serializeCanonicalLatex(node.denominator)}}`;
    case "subscript":
      return `${serializeScriptBase(node.base)}_${serializeScriptArgument(node.subscript)}`;
    case "superscript":
      return `${serializeScriptBase(node.base)}^${serializeScriptArgument(node.superscript)}`;
    case "subsuperscript":
      return `${serializeScriptBase(node.base)}_${serializeScriptArgument(node.subscript)}^${serializeScriptArgument(node.superscript)}`;
    case "radical":
      return node.degree
        ? `\\sqrt[${serializeCanonicalLatex(node.degree)}]{${serializeCanonicalLatex(node.body)}}`
        : `\\sqrt{${serializeCanonicalLatex(node.body)}}`;
    case "accent": {
      const accentMap = { "¯": "\\bar", "̅": "\\bar", "^": "\\hat", "→": "\\vec" };
      return `${accentMap[node.accent] || "\\accent"}{${serializeCanonicalLatex(node.body)}}`;
    }
    case "bar":
      return `${node.position === "bot" ? "\\underline" : "\\overline"}{${serializeCanonicalLatex(node.body)}}`;
    case "nary": {
      const operatorMap = { "∑": "\\sum", "∫": "\\int", "∏": "\\prod" };
      const operator = operatorMap[node.operator] || node.operator || "\\sum";
      const lower = node.lower ? `_{${serializeCompactScript(node.lower)}}` : "";
      const upper = node.upper ? `^{${serializeCompactScript(node.upper)}}` : "";
      return `${operator}${lower}${upper}${serializeCanonicalLatex(node.body)}`;
    }
    case "matrix":
      return `\\begin{bmatrix}${(node.rows || []).map((row) => (row.cells || []).map((cell) => serializeCanonicalLatex(cell)).join(" & ")).join(" \\\\ ")}\\end{bmatrix}`;
    case "equation_array":
      return `\\begin{aligned}${(node.rows || []).map((row) => serializeCanonicalLatex(row)).join(" \\\\ ")}\\end{aligned}`;
    case "delimiter": {
      const open = node.open || "(";
      const close = node.close || ")";
      return `${open}${serializeCanonicalLatex(node.body)}${close}`;
    }
    case "function": {
      const functionName = node.name?.type === "identifier"
        ? serializeFunctionName(node.name.value || "")
        : serializeCanonicalLatex(node.name);
      const bodyChildren = node.body?.type === "expression" ? flattenExpressionChildren(node.body) : [];
      if (bodyChildren.length === 1 && bodyChildren[0]?.type === "delimiter") {
        return `${functionName}${serializeCanonicalLatex(bodyChildren[0])}`;
      }
      return `${functionName}(${serializeCanonicalLatex(node.body)})`;
    }
    case "unsupported":
      return "";
    default:
      return "";
  }
}

function nodeText(node) {
  if (!node) return "";
  if (["punctuation", "identifier", "number", "operator", "relation"].includes(node.type)) return node.value || "";
  return serializeCanonicalLatex(node);
}

export function splitInlineMathBoundaryText(mathNode) {
  if (!mathNode || mathNode.type !== "inline_math") {
    return { leadingText: "", trailingText: "", mathNode };
  }
  const cloned = cloneNode(mathNode);
  const root = cloned.mathTree?.type === "expression"
    ? wrapExpression(flattenExpressionChildren(cloned.mathTree))
    : wrapExpression(cloned.mathTree ? [cloned.mathTree] : []);

  const children = [...root.children];
  let leadingText = "";
  let trailingText = "";

  while (children.length && children[0]?.type === "punctuation" && LEADING_BOUNDARY_PUNCTUATION.has(children[0].value || "")) {
    leadingText += nodeText(children.shift());
  }
  while (children.length && children[children.length - 1]?.type === "punctuation" && TRAILING_BOUNDARY_PUNCTUATION.has(children[children.length - 1].value || "")) {
    trailingText = `${nodeText(children.pop())}${trailingText}`;
  }

  const cleanedTree = wrapExpression(children);
  const latex = cleanupLatexSpacing(serializeCanonicalLatex(cleanedTree));
  return {
    leadingText,
    trailingText,
    mathNode: latex
      ? {
        ...cloned,
        latex,
        mathTree: cleanedTree
      }
      : null
  };
}

export function hasBoundaryPunctuation(mathTree) {
  const children = mathTree?.type === "expression"
    ? flattenExpressionChildren(mathTree)
    : mathTree ? [mathTree] : [];
  const first = children[0] || null;
  const last = children[children.length - 1] || null;
  return Boolean(
    (first?.type === "punctuation" && LEADING_BOUNDARY_PUNCTUATION.has(first.value || ""))
    || (last?.type === "punctuation" && TRAILING_BOUNDARY_PUNCTUATION.has(last.value || ""))
  );
}

export function summarizeMathAst(node) {
  const counts = {};
  let maxDepth = 0;

  function walk(current, depth) {
    if (!current || typeof current !== "object") return;
    counts[current.type] = Number(counts[current.type] || 0) + 1;
    maxDepth = Math.max(maxDepth, depth);
    for (const value of Object.values(current)) {
      if (Array.isArray(value)) value.forEach((item) => walk(item, depth + 1));
      else if (value && typeof value === "object") walk(value, depth + 1);
    }
  }

  walk(node, 1);
  return {
    rootType: node?.type || "",
    maxDepth,
    counts
  };
}

export function renderMathMlFromLatex(latex, options = {}) {
  return temml.renderToString(latex, {
    displayMode: Boolean(options.displayMode),
    throwOnError: true,
    annotate: false,
    strict: true
  });
}