import omml2mathml from "omml2mathml";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { MathMLToLaTeX } from "mathml-to-latex";

const OMML_NS_MATH = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const OMML_NS_WORD = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function decodeXmlEntities(text = "") {
  return String(text || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractOmmlText(omml = "") {
  const parts = [];
  for (const token of String(omml || "").matchAll(/<m:t[^>]*>([\s\S]*?)<\/m:t>/g)) {
    const value = decodeXmlEntities(String(token[1] || "")).replace(/\s+/g, " ").trim();
    if (value) parts.push(value);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function extractAllTagBlocks(xml = "", tagName = "") {
  if (!xml || !tagName) return [];
  const blocks = [];
  const pattern = new RegExp(`<${tagName}\\b[\\s\\S]*?<\\/${tagName}>`, "gi");
  for (const match of String(xml).matchAll(pattern)) {
    blocks.push(String(match[0] || ""));
  }
  return blocks;
}

function getInnerTagXml(xml = "", tagName = "") {
  if (!xml || !tagName) return "";
  const match = String(xml).match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return String(match?.[1] || "");
}

function getTagAttributeValue(xml = "", tagName = "", attributeName = "") {
  if (!xml || !tagName || !attributeName) return "";
  const tagMatch = String(xml).match(new RegExp(`<${tagName}[^>]*>`, "i"));
  if (!tagMatch?.[0]) return "";
  const attrMatch = tagMatch[0].match(new RegExp(`${attributeName}="([^"]+)"`, "i"));
  return String(attrMatch?.[1] || "").trim();
}

function mapAccentChar(value = "") {
  const char = String(value || "").trim();
  if (!char) return "accent";
  if (char === "\u0302" || char === "^" || char === "ˆ") return "hat";
  if (char === "\u0305" || char === "¯") return "bar";
  if (char === "\u2192" || char === "→") return "vec";
  if (char === "\u02d8" || char === "˘") return "breve";
  if (char === "\u02dc" || char === "˜") return "tilde";
  return "accent";
}

function mapTokenToLatex(token = "") {
  const value = String(token || "").trim();
  if (!value) return "";

  const greekMap = {
    α: "\\alpha",
    β: "\\beta",
    γ: "\\gamma",
    δ: "\\delta",
    Δ: "\\Delta",
    ε: "\\epsilon",
    θ: "\\theta",
    λ: "\\lambda",
    μ: "\\mu",
    π: "\\pi",
    σ: "\\sigma",
    Σ: "\\Sigma",
    φ: "\\phi",
    ω: "\\omega",
    Ω: "\\Omega"
  };

  if (greekMap[value]) return greekMap[value];
  if (value === "∞") return "\\infty";
  if (value === "√") return "\\sqrt";
  if (value === "≤") return "\\le";
  if (value === "≥") return "\\ge";
  if (value === "≠") return "\\ne";
  if (value === "±") return "\\pm";
  if (value === "×") return "\\times";
  if (value === "÷") return "\\div";
  return value;
}

function normalizeLatexMath(value = "") {
  const source = String(value || "").trim();
  if (!source) return "";

  return source
    .split(/(\s+)/)
    .map((part) => (/^\s+$/.test(part) ? part : mapTokenToLatex(part)))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function joinMathFragments(parts = [], useLatexRules = false) {
  const cleaned = parts.map((part) => String(part || "").trim()).filter(Boolean);
  if (!cleaned.length) return "";

  const joined = cleaned.join(" ");
  if (useLatexRules) {
    return joined
      .replace(/\s+([,.;:)}\]])/g, "$1")
      .replace(/([([{])\s+/g, "$1")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  return joined
    .replace(/\s+([,.;:)}\]])/g, "$1")
    .replace(/([([{])\s+/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function ensureOmmlNamespaceBindings(omml = "") {
  const source = String(omml || "").trim();
  if (!source) return "";
  if (/\bxmlns:m=/.test(source)) return source;

  const nsAttrs = `xmlns:m="${OMML_NS_MATH}" xmlns:w="${OMML_NS_WORD}"`;
  if (/^<m:oMathPara\b/i.test(source)) {
    return source.replace(/^<m:oMathPara\b/i, `<m:oMathPara ${nsAttrs}`);
  }
  if (/^<m:oMath\b/i.test(source)) {
    return source.replace(/^<m:oMath\b/i, `<m:oMath ${nsAttrs}`);
  }
  return source;
}

function parseSimpleOmmlLinear(omml = "") {
  const source = String(omml || "");

  const subSupMatch = source.match(/<m:sSubSup\b[\s\S]*?<m:e>([\s\S]*?)<\/m:e>[\s\S]*?<m:sub>([\s\S]*?)<\/m:sub>[\s\S]*?<m:sup>([\s\S]*?)<\/m:sup>[\s\S]*?<\/m:sSubSup>/i);
  if (subSupMatch) {
    const base = extractOmmlText(subSupMatch[1]) || "x";
    const sub = extractOmmlText(subSupMatch[2]) || "1";
    const sup = extractOmmlText(subSupMatch[3]) || "1";
    return {
      kind: "subsup",
      linear: `${base}_(${sub})^(${sup})`,
      latex: `${normalizeLatexMath(base)}_{${normalizeLatexMath(sub)}}^{${normalizeLatexMath(sup)}}`,
      children: [
        { type: "base", value: base },
        { type: "sub", value: sub },
        { type: "sup", value: sup }
      ]
    };
  }

  const fractionMatch = source.match(/<m:f\b[\s\S]*?<m:num>([\s\S]*?)<\/m:num>[\s\S]*?<m:den>([\s\S]*?)<\/m:den>[\s\S]*?<\/m:f>/i);
  if (fractionMatch) {
    const numerator = extractOmmlText(fractionMatch[1]) || "?";
    const denominator = extractOmmlText(fractionMatch[2]) || "?";
    return {
      kind: "fraction",
      linear: `(${numerator})/(${denominator})`,
      latex: `\\frac{${normalizeLatexMath(numerator)}}{${normalizeLatexMath(denominator)}}`,
      children: [
        { type: "num", value: numerator },
        { type: "den", value: denominator }
      ]
    };
  }

  const superscriptMatch = source.match(/<m:sSup\b[\s\S]*?<m:e>([\s\S]*?)<\/m:e>[\s\S]*?<m:sup>([\s\S]*?)<\/m:sup>[\s\S]*?<\/m:sSup>/i);
  if (superscriptMatch) {
    const base = extractOmmlText(superscriptMatch[1]) || "x";
    const power = extractOmmlText(superscriptMatch[2]) || "1";
    return {
      kind: "superscript",
      linear: `${base}^(${power})`,
      latex: `${normalizeLatexMath(base)}^{${normalizeLatexMath(power)}}`,
      children: [
        { type: "base", value: base },
        { type: "sup", value: power }
      ]
    };
  }

  const subscriptMatch = source.match(/<m:sSub\b[\s\S]*?<m:e>([\s\S]*?)<\/m:e>[\s\S]*?<m:sub>([\s\S]*?)<\/m:sub>[\s\S]*?<\/m:sSub>/i);
  if (subscriptMatch) {
    const base = extractOmmlText(subscriptMatch[1]) || "x";
    const sub = extractOmmlText(subscriptMatch[2]) || "1";
    return {
      kind: "subscript",
      linear: `${base}_(${sub})`,
      latex: `${normalizeLatexMath(base)}_{${normalizeLatexMath(sub)}}`,
      children: [
        { type: "base", value: base },
        { type: "sub", value: sub }
      ]
    };
  }

  const radicalMatch = source.match(/<m:rad\b[\s\S]*?<m:e>([\s\S]*?)<\/m:e>[\s\S]*?<\/m:rad>/i);
  if (radicalMatch) {
    const body = extractOmmlText(radicalMatch[1]) || "x";
    return {
      kind: "radical",
      linear: `sqrt(${body})`,
      latex: `\\sqrt{${normalizeLatexMath(body)}}`,
      children: [{ type: "body", value: body }]
    };
  }

  const naryMatch = source.match(/<m:nary\b[\s\S]*?<m:e>([\s\S]*?)<\/m:e>[\s\S]*?<\/m:nary>/i);
  if (naryMatch) {
    const body = extractOmmlText(naryMatch[1]) || "expr";
    const lower = extractOmmlText(getInnerTagXml(source, "m:sub"));
    const upper = extractOmmlText(getInnerTagXml(source, "m:sup"));
    if (/<m:chr[^>]*m:val="∫"/i.test(source)) {
      return {
        kind: "integral",
        linear: `integral(${body})`,
        latex: `\\int${lower ? `_{${normalizeLatexMath(lower)}}` : ""}${upper ? `^{${normalizeLatexMath(upper)}}` : ""} ${normalizeLatexMath(body)}`.trim(),
        children: [{ type: "body", value: body }, { type: "sub", value: lower }, { type: "sup", value: upper }]
      };
    }
    if (/<m:chr[^>]*m:val="∑"/i.test(source)) {
      return {
        kind: "sum",
        linear: `sum(${body})`,
        latex: `\\sum${lower ? `_{${normalizeLatexMath(lower)}}` : ""}${upper ? `^{${normalizeLatexMath(upper)}}` : ""} ${normalizeLatexMath(body)}`.trim(),
        children: [{ type: "body", value: body }, { type: "sub", value: lower }, { type: "sup", value: upper }]
      };
    }
  }

  const plain = extractOmmlText(source);
  return {
    kind: "token",
    linear: plain,
    latex: normalizeLatexMath(plain),
    children: plain ? [{ type: "token", value: plain }] : []
  };
}

function buildStructuredMathTreeFromOmml(omml = "") {
  const source = String(omml || "");
  if (!source.trim()) {
    return { kind: "empty", linear: "", latex: "", children: [] };
  }

  const rooted = ensureOmmlNamespaceBindings(source);
  const parser = new DOMParser();
  const serializer = new XMLSerializer();
  try {
    const doc = parser.parseFromString(rooted, "text/xml");
    const mathParaNode = doc.getElementsByTagName("m:oMathPara")[0] || null;
    if (mathParaNode) {
      const childMathNodes = [];
      for (let i = 0; i < mathParaNode.childNodes.length; i += 1) {
        const child = mathParaNode.childNodes[i];
        if (child?.nodeType === 1 && child?.nodeName === "m:oMath") {
          childMathNodes.push(child);
        }
      }
      if (childMathNodes.length) {
        const children = childMathNodes.map((node) => buildStructuredMathTreeFromOmml(serializer.serializeToString(node)));
        return {
          kind: "sequence",
          linear: joinMathFragments(children.map((child) => child.linear), false),
          latex: joinMathFragments(children.map((child) => child.latex), true),
          children
        };
      }
    }

    const mathNode = doc.getElementsByTagName("m:oMath")[0] || null;
    if (mathNode) {
      const childBlocks = [];
      for (let i = 0; i < mathNode.childNodes.length; i += 1) {
        const child = mathNode.childNodes[i];
        if (child?.nodeType === 1) {
          childBlocks.push(serializer.serializeToString(child));
        }
      }
      if (childBlocks.length > 1) {
        const children = childBlocks.map((block) => buildStructuredMathTreeFromOmml(block));
        return {
          kind: "sequence",
          linear: joinMathFragments(children.map((child) => child.linear), false),
          latex: joinMathFragments(children.map((child) => child.latex), true),
          children
        };
      }
    }
  } catch {
    // Fall back to regex parsing below.
  }

  const matrixBlock = extractAllTagBlocks(source, "m:m")[0] || "";
  if (matrixBlock) {
    const rows = extractAllTagBlocks(matrixBlock, "m:mr");
    const rowChildren = rows.map((row) => ({
      type: "row",
      cells: extractAllTagBlocks(row, "m:e").map((cell) => buildStructuredMathTreeFromOmml(cell))
    }));
    const latexRows = rowChildren.map((row) => row.cells.map((cell) => cell.latex || "?").join(" & "));
    return {
      kind: "matrix",
      linear: latexRows.length ? `matrix([${latexRows.join(" ; ")}])` : "matrix([?])",
      latex: latexRows.length ? `\\begin{bmatrix}${latexRows.join(" \\\\ ")}\\end{bmatrix}` : "\\begin{bmatrix}?\\end{bmatrix}",
      children: rowChildren
    };
  }

  const accentBlock = extractAllTagBlocks(source, "m:acc")[0] || "";
  if (accentBlock) {
    const target = buildStructuredMathTreeFromOmml(getInnerTagXml(accentBlock, "m:e"));
    const accentName = mapAccentChar(getTagAttributeValue(accentBlock, "m:chr", "m:val"));
    const accentLatexMap = {
      hat: "\\hat",
      bar: "\\bar",
      vec: "\\vec",
      breve: "\\breve",
      tilde: "\\tilde",
      accent: "\\hat"
    };
    return {
      kind: "accent",
      linear: accentName === "bar" ? `\\bar{${target.linear || "x"}}` : `${accentName}(${target.linear || "x"})`,
      latex: `${accentLatexMap[accentName] || "\\hat"}{${target.latex || "x"}}`,
      children: [target]
    };
  }

  const barBlock = extractAllTagBlocks(source, "m:bar")[0] || "";
  if (barBlock) {
    const target = buildStructuredMathTreeFromOmml(getInnerTagXml(barBlock, "m:e"));
    const position = String(getTagAttributeValue(barBlock, "m:pos", "m:val") || "").toLowerCase();
    return {
      kind: position === "bot" ? "underline" : "overline",
      linear: position === "bot" ? `underbar(${target.linear || "x"})` : `\\bar{${target.linear || "x"}}`,
      latex: `${position === "bot" ? "\\underline" : "\\bar"}{${target.latex || "x"}}`,
      children: [target]
    };
  }

  return parseSimpleOmmlLinear(source);
}

function normalizeLatex(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s*\\int\s*/g, "\\int ")
    .replace(/\s*\\sum\s*/g, "\\sum ")
    .replace(/\s+([,.;:)}\]])/g, "$1")
    .trim();
}

function deriveVariables(latex = "") {
  const matches = String(latex || "").match(/\\?[a-zA-Z](?:_[a-zA-Z0-9{}]+)?/g) || [];
  return Array.from(new Set(matches));
}

function deriveOperators(latex = "") {
  const source = String(latex || "");
  const operators = [];
  if (/\\frac\b/.test(source)) operators.push("fraction");
  if (/\\sum\b/.test(source)) operators.push("sum");
  if (/\\int\b/.test(source)) operators.push("integral");
  if (/\\sqrt\b/.test(source)) operators.push("sqrt");
  if (/=/.test(source)) operators.push("equals");
  return operators;
}

function safeOmmlToMathMl(omml = "") {
  try {
    const source = ensureOmmlNamespaceBindings(omml);
    if (!source) return "";
    const parser = new DOMParser();
    const serializer = new XMLSerializer();
    const doc = parser.parseFromString(source, "text/xml");
    const sourceNode = doc.getElementsByTagName("m:oMathPara")[0]
      || doc.getElementsByTagName("m:oMath")[0];
    if (!sourceNode) return "";
    const transformed = omml2mathml(sourceNode);
    if (!transformed) return "";
    return String(serializer.serializeToString(transformed) || "").trim();
  } catch {
    return "";
  }
}

function safeMathMlToLatex(mathml = "") {
  try {
    const converted = MathMLToLaTeX.convert(String(mathml || ""));
    return String(converted || "").trim();
  } catch {
    return "";
  }
}

function buildMathHtml(latex = "", displayMode = false) {
  const safeLatex = String(latex || "").trim();
  if (!safeLatex) return "";
  if (displayMode) {
    return `<div class="cdm-display-math">$$ ${safeLatex} $$</div>`;
  }
  return `<span class="cdm-inline-math">$${safeLatex}$</span>`;
}

function confidenceFromSource(source = "OOXML") {
  const normalized = String(source || "").toUpperCase();
  if (normalized === "OOXML") return 1;
  if (normalized === "OCR") return 0.8;
  if (normalized === "SCANNED_PDF") return 0.8;
  return 0.72;
}

export class MathService {
  constructor() {
    this.counter = 0;
  }

  createEquation({ omml = "", nodePath = "", type = "inline_equation", page = null, section = null, source = "OOXML" } = {}) {
    this.counter += 1;
    const id = `EQ-${this.counter}`;
    const display = type === "display_equation";

    const parsedMathTree = buildStructuredMathTreeFromOmml(omml);
    const mathml = safeOmmlToMathMl(omml);
    const fallbackLatex = parsedMathTree?.latex || extractOmmlText(omml) || "[FORMULA]";
    const fallbackLinear = parsedMathTree?.linear || extractOmmlText(omml) || "[FORMULA]";
    const latex = normalizeLatex(safeMathMlToLatex(mathml) || fallbackLatex || fallbackLinear);
    const html = buildMathHtml(latex, display);

    return {
      id,
      type,
      latex,
      mathml,
      html,
      source,
      nodePath: String(nodePath || "").trim(),
      page: Number.isFinite(Number(page)) ? Number(page) : null,
      section: section ? String(section) : null,
      variables: deriveVariables(latex),
      operators: deriveOperators(latex),
      confidence: confidenceFromSource(source),
      diagnostics: {
        originalOmml: String(omml || ""),
        parsedMathTree,
        canonicalLatex: latex,
        renderedHtml: html
      }
    };
  }
}
