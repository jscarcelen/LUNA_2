import JSZip from "jszip";
import mammoth from "mammoth";
import omml2mathml from "omml2mathml";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { MathMLToLaTeX } from "mathml-to-latex";

const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "json",
  "xml",
  "html",
  "htm",
  "js",
  "ts",
  "jsx",
  "tsx",
  "py",
  "java",
  "c",
  "cpp",
  "h",
  "hpp",
  "go",
  "rs",
  "sql"
]);

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff", "heic", "heif"]);
const LEGACY_WORD_EXTENSIONS = new Set(["doc"]);
const LEGACY_POWERPOINT_EXTENSIONS = new Set(["ppt", "pps"]);

const DEFAULT_OCR_LANGUAGES = String(process.env.OCR_LANGUAGES || "eng").trim() || "eng";
const DEFAULT_OCR_MIN_CONFIDENCE = Math.max(0, Math.min(100, Number(process.env.OCR_MIN_CONFIDENCE || 55)));
const DEFAULT_EXTRACTION_MIN_CONFIDENCE = Math.max(0, Math.min(1, Number(process.env.EXTRACTION_MIN_CONFIDENCE || 0.72)));
const MATH_OCR_APP_ID = String(process.env.MATH_OCR_APP_ID || "").trim();
const MATH_OCR_APP_KEY = String(process.env.MATH_OCR_APP_KEY || "").trim();
const MATH_OCR_ENDPOINT = String(process.env.MATH_OCR_ENDPOINT || "https://api.mathpix.com/v3/text").trim();

const MARKDOWN_TARGET_TOKENS = 700;
const MARKDOWN_MAX_TOKENS = 1000;
const OMML_NS_MATH = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const OMML_NS_WORD = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-"
});
turndown.use(gfm);

function getExtension(name = "") {
  const match = String(name).toLowerCase().match(/\.([a-z0-9]+)$/i);
  return match?.[1] || "";
}

function decodeBase64ToBuffer(contentBase64 = "") {
  return Buffer.from(String(contentBase64 || ""), "base64");
}

function stripXml(xml = "") {
  return String(xml)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeXmlEntities(text = "") {
  return String(text || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripXmlPreservingSpaces(xml = "") {
  return decodeXmlEntities(String(xml || "")
    .replace(/<w:tab\s*\/?\s*>/g, " ")
    .replace(/<w:br\s*\/?\s*>/g, "\n")
    .replace(/<[^>]+>/g, " "));
}

function extractOmmlTextTokens(omml = "") {
  const tokens = [];
  for (const match of String(omml || "").matchAll(/<m:t[^>]*>([\s\S]*?)<\/m:t>/g)) {
    const value = cleanExtractedText(stripXmlPreservingSpaces(match[1] || ""));
    if (value) tokens.push(value);
  }
  return tokens;
}

function getInnerTagXml(xml = "", tagName = "") {
  if (!xml || !tagName) return "";
  const match = String(xml).match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match?.[1] || "";
}

function getTagAttributeValue(xml = "", tagName = "", attributeName = "") {
  if (!xml || !tagName || !attributeName) return "";
  const tagMatch = String(xml).match(new RegExp(`<${tagName}[^>]*>`, "i"));
  if (!tagMatch?.[0]) return "";
  const attrMatch = tagMatch[0].match(new RegExp(`${attributeName}="([^"]+)"`, "i"));
  return String(attrMatch?.[1] || "").trim();
}

function extractAllTagBlocks(xml = "", tagName = "") {
  if (!xml || !tagName) return [];
  const blocks = [];
  const pattern = new RegExp(`<${tagName}\\b[\\s\\S]*?<\\/${tagName}>`, "gi");
  for (const match of String(xml).matchAll(pattern)) {
    blocks.push({
      xml: String(match[0] || ""),
      index: Number(match.index || 0)
    });
  }
  return blocks;
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

function normalizeLinearMathSymbol(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\bbar\(([^)]+)\)/gi, "$1-bar")
    .trim();
}

function mapTokenToLatex(token = "") {
  const value = String(token || "").trim();
  if (!value) return "";

  const greekMap = {
    "α": "\\alpha",
    "β": "\\beta",
    "γ": "\\gamma",
    "δ": "\\delta",
    "Δ": "\\Delta",
    "ε": "\\epsilon",
    "θ": "\\theta",
    "λ": "\\lambda",
    "μ": "\\mu",
    "π": "\\pi",
    "σ": "\\sigma",
    "Σ": "\\Sigma",
    "φ": "\\phi",
    "ω": "\\omega",
    "Ω": "\\Omega"
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

function parseSimpleOmmlLinear(omml = "") {
  const source = String(omml || "");

  const subSupMatch = source.match(/<m:sSubSup\b[\s\S]*?<m:e>([\s\S]*?)<\/m:e>[\s\S]*?<m:sub>([\s\S]*?)<\/m:sub>[\s\S]*?<m:sup>([\s\S]*?)<\/m:sup>[\s\S]*?<\/m:sSubSup>/i);
  if (subSupMatch) {
    const base = normalizeLinearMathSymbol(extractOmmlTextTokens(subSupMatch[1]).join(" ").trim() || "x");
    const sub = normalizeLinearMathSymbol(extractOmmlTextTokens(subSupMatch[2]).join(" ").trim() || "1");
    const sup = normalizeLinearMathSymbol(extractOmmlTextTokens(subSupMatch[3]).join(" ").trim() || "1");
    const baseLatex = normalizeLatexMath(base);
    const subLatex = normalizeLatexMath(sub);
    const supLatex = normalizeLatexMath(sup);
    return {
      linear: `${base}_(${sub})^(${sup})`,
      latex: `${baseLatex}_{${subLatex}}^{${supLatex}}`,
      signals: ["subscript", "superscript", "subsup"]
    };
  }

  const fractionMatch = source.match(/<m:f\b[\s\S]*?<m:num>([\s\S]*?)<\/m:num>[\s\S]*?<m:den>([\s\S]*?)<\/m:den>[\s\S]*?<\/m:f>/i);
  if (fractionMatch) {
    const numerator = normalizeLinearMathSymbol(extractOmmlTextTokens(fractionMatch[1]).join(" ").trim() || "?");
    const denominator = normalizeLinearMathSymbol(extractOmmlTextTokens(fractionMatch[2]).join(" ").trim() || "?");
    return {
      linear: `(${numerator})/(${denominator})`,
      latex: `\\frac{${normalizeLatexMath(numerator)}}{${normalizeLatexMath(denominator)}}`,
      signals: ["fraction"]
    };
  }

  const superscriptMatch = source.match(/<m:sSup\b[\s\S]*?<m:e>([\s\S]*?)<\/m:e>[\s\S]*?<m:sup>([\s\S]*?)<\/m:sup>[\s\S]*?<\/m:sSup>/i);
  if (superscriptMatch) {
    const base = normalizeLinearMathSymbol(extractOmmlTextTokens(superscriptMatch[1]).join(" ").trim() || "x");
    const power = normalizeLinearMathSymbol(extractOmmlTextTokens(superscriptMatch[2]).join(" ").trim() || "1");
    return {
      linear: `${base}^(${power})`,
      latex: `${normalizeLatexMath(base)}^{${normalizeLatexMath(power)}}`,
      signals: ["superscript"]
    };
  }

  const subscriptMatch = source.match(/<m:sSub\b[\s\S]*?<m:e>([\s\S]*?)<\/m:e>[\s\S]*?<m:sub>([\s\S]*?)<\/m:sub>[\s\S]*?<\/m:sSub>/i);
  if (subscriptMatch) {
    const base = normalizeLinearMathSymbol(extractOmmlTextTokens(subscriptMatch[1]).join(" ").trim() || "x");
    const sub = normalizeLinearMathSymbol(extractOmmlTextTokens(subscriptMatch[2]).join(" ").trim() || "1");
    return {
      linear: `${base}_(${sub})`,
      latex: `${normalizeLatexMath(base)}_{${normalizeLatexMath(sub)}}`,
      signals: ["subscript"]
    };
  }

  const radicalMatch = source.match(/<m:rad\b[\s\S]*?<m:e>([\s\S]*?)<\/m:e>[\s\S]*?<\/m:rad>/i);
  if (radicalMatch) {
    const body = normalizeLinearMathSymbol(extractOmmlTextTokens(radicalMatch[1]).join(" ").trim() || "x");
    return {
      linear: `sqrt(${body})`,
      latex: `\\sqrt{${normalizeLatexMath(body)}}`,
      signals: ["radical"]
    };
  }

  const naryMatch = source.match(/<m:nary\b[\s\S]*?<m:e>([\s\S]*?)<\/m:e>[\s\S]*?<\/m:nary>/i);
  if (naryMatch) {
    const body = normalizeLinearMathSymbol(extractOmmlTextTokens(naryMatch[1]).join(" ").trim() || "expr");
    if (/<m:chr[^>]*m:val="∫"/i.test(source)) {
      return { linear: `integral(${body})`, latex: `\\int ${normalizeLatexMath(body)}`, signals: ["nary", "integral"] };
    }
    if (/<m:chr[^>]*m:val="∑"/i.test(source)) {
      return { linear: `sum(${body})`, latex: `\\sum ${normalizeLatexMath(body)}`, signals: ["nary", "sum"] };
    }
    return { linear: body, latex: normalizeLatexMath(body), signals: ["nary"] };
  }

  const plain = normalizeLinearMathSymbol(extractOmmlTextTokens(source).join(" ").replace(/\s+/g, " ").trim());
  return {
    linear: plain,
    latex: normalizeLatexMath(plain),
    signals: []
  };
}

function buildStructuredLinearMathFromOmml(omml = "") {
  const source = String(omml || "");
  if (!source.trim()) {
    return { linear: "", latex: "", parserConfidenceTier: "low", parserSignals: [] };
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
        const pieces = childMathNodes
          .map((node) => buildStructuredLinearMathFromOmml(serializer.serializeToString(node)))
          .filter((piece) => piece && (piece.linear || piece.latex));

        if (pieces.length) {
          const hasHigh = pieces.some((piece) => piece.parserConfidenceTier === "high");
          const hasMedium = pieces.some((piece) => piece.parserConfidenceTier === "medium");
          return {
            linear: joinMathFragments(pieces.map((piece) => piece.linear), false),
            latex: joinMathFragments(pieces.map((piece) => piece.latex), true),
            parserConfidenceTier: hasHigh ? "high" : (hasMedium ? "medium" : "low"),
            parserSignals: ["sequence", ...pieces.flatMap((piece) => piece.parserSignals || [])]
          };
        }
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
        const pieces = childBlocks
          .map((block) => buildStructuredLinearMathFromOmml(block))
          .filter((piece) => piece && (piece.linear || piece.latex));
        if (pieces.length) {
          const hasHigh = pieces.some((piece) => piece.parserConfidenceTier === "high");
          const hasMedium = pieces.some((piece) => piece.parserConfidenceTier === "medium");
          return {
            linear: joinMathFragments(pieces.map((piece) => piece.linear), false),
            latex: joinMathFragments(pieces.map((piece) => piece.latex), true),
            parserConfidenceTier: hasHigh ? "high" : (hasMedium ? "medium" : "low"),
            parserSignals: ["sequence", ...pieces.flatMap((piece) => piece.parserSignals || [])]
          };
        }
      }
    }
  } catch {
    // Fall back to regex parsing below.
  }

  const parserSignals = [];

  const matrixBlock = extractAllTagBlocks(source, "m:m")[0]?.xml || "";
  if (matrixBlock) {
    parserSignals.push("matrix");
    const rows = extractAllTagBlocks(matrixBlock, "m:mr");
    const rowLinear = rows.map((row) => {
      const cellBlocks = extractAllTagBlocks(row.xml, "m:e");
      return cellBlocks
        .map((cell) => buildStructuredLinearMathFromOmml(cell.xml).latex || parseSimpleOmmlLinear(cell.xml).latex || "?")
        .filter(Boolean)
        .join(" & ");
    }).filter(Boolean);

    const linear = rowLinear.length ? `matrix([${rowLinear.join(" ; ")}])` : "matrix([?])";
    const latex = rowLinear.length
      ? `\\begin{bmatrix}${rowLinear.join(" \\\\ ")}\\end{bmatrix}`
      : "\\begin{bmatrix}?\\end{bmatrix}";
    return {
      linear,
      latex,
      parserConfidenceTier: rowLinear.length ? "high" : "medium",
      parserSignals
    };
  }

  const casesBlock = extractAllTagBlocks(source, "m:eqArr")[0]?.xml || "";
  if (casesBlock) {
    parserSignals.push("cases");
    const caseRows = extractAllTagBlocks(casesBlock, "m:e")
      .map((row) => buildStructuredLinearMathFromOmml(row.xml).latex || parseSimpleOmmlLinear(row.xml).latex || "?")
      .filter(Boolean);
    return {
      linear: caseRows.length ? `cases(${caseRows.join(" ; ")})` : "cases(?)",
      latex: caseRows.length ? `\\begin{cases}${caseRows.join(" \\\\ ")}\\end{cases}` : "\\begin{cases}?\\end{cases}",
      parserConfidenceTier: caseRows.length ? "high" : "medium",
      parserSignals
    };
  }

  const accentBlock = extractAllTagBlocks(source, "m:acc")[0]?.xml || "";
  if (accentBlock) {
    parserSignals.push("accent");
    const accentTargetXml = getInnerTagXml(accentBlock, "m:e");
    const accentTargetLinear = buildStructuredLinearMathFromOmml(accentTargetXml).linear || parseSimpleOmmlLinear(accentTargetXml).linear || "x";
    const accentTargetLatex = buildStructuredLinearMathFromOmml(accentTargetXml).latex || parseSimpleOmmlLinear(accentTargetXml).latex || "x";
    const accentChar = getTagAttributeValue(accentBlock, "m:chr", "m:val");
    const accentName = mapAccentChar(accentChar);
    const accentLatexMap = {
      hat: "\\hat",
      bar: "\\bar",
      vec: "\\vec",
      breve: "\\breve",
      tilde: "\\tilde",
      accent: "\\hat"
    };
    return {
      linear: accentName === "bar" ? `\\bar{${accentTargetLinear}}` : `${accentName}(${accentTargetLinear})`,
      latex: `${accentLatexMap[accentName] || "\\hat"}{${accentTargetLatex}}`,
      parserConfidenceTier: accentTargetLinear ? "high" : "medium",
      parserSignals
    };
  }

  const subSupBlock = extractAllTagBlocks(source, "m:sSubSup")[0]?.xml || "";
  if (subSupBlock) {
    parserSignals.push("subsup");
    const baseXml = getInnerTagXml(subSupBlock, "m:e");
    const subXml = getInnerTagXml(subSupBlock, "m:sub");
    const supXml = getInnerTagXml(subSupBlock, "m:sup");

    const base = buildStructuredLinearMathFromOmml(baseXml);
    const sub = buildStructuredLinearMathFromOmml(subXml);
    const sup = buildStructuredLinearMathFromOmml(supXml);

    const baseLinear = base.linear || parseSimpleOmmlLinear(baseXml).linear || "x";
    const subLinear = sub.linear || parseSimpleOmmlLinear(subXml).linear || "1";
    const supLinear = sup.linear || parseSimpleOmmlLinear(supXml).linear || "1";

    const baseLatex = base.latex || parseSimpleOmmlLinear(baseXml).latex || normalizeLatexMath(baseLinear);
    const subLatex = sub.latex || parseSimpleOmmlLinear(subXml).latex || normalizeLatexMath(subLinear);
    const supLatex = sup.latex || parseSimpleOmmlLinear(supXml).latex || normalizeLatexMath(supLinear);

    return {
      linear: `${baseLinear}_(${subLinear})^(${supLinear})`,
      latex: `${baseLatex}_{${subLatex}}^{${supLatex}}`,
      parserConfidenceTier: "high",
      parserSignals
    };
  }

  const overUnderBarBlock = extractAllTagBlocks(source, "m:bar")[0]?.xml || "";
  if (overUnderBarBlock) {
    parserSignals.push("bar-accent");
    const barTargetXml = getInnerTagXml(overUnderBarBlock, "m:e");
    const barTargetLinear = buildStructuredLinearMathFromOmml(barTargetXml).linear || parseSimpleOmmlLinear(barTargetXml).linear || "x";
    const barTargetLatex = buildStructuredLinearMathFromOmml(barTargetXml).latex || parseSimpleOmmlLinear(barTargetXml).latex || "x";
    const barPos = getTagAttributeValue(overUnderBarBlock, "m:pos", "m:val");
    const prefix = String(barPos || "").toLowerCase() === "bot" ? "underbar" : "overbar";
    return {
      linear: `${prefix}(${barTargetLinear})`,
      latex: `${String(barPos || "").toLowerCase() === "bot" ? "\\underline" : "\\overline"}{${barTargetLatex}}`,
      parserConfidenceTier: barTargetLinear ? "high" : "medium",
      parserSignals
    };
  }

  const limLowBlock = extractAllTagBlocks(source, "m:limLow")[0]?.xml || "";
  if (limLowBlock) {
    parserSignals.push("limit-lower");
    const limExpr = buildStructuredLinearMathFromOmml(getInnerTagXml(limLowBlock, "m:e")).linear || parseSimpleOmmlLinear(getInnerTagXml(limLowBlock, "m:e")).linear || "expr";
    const limSub = buildStructuredLinearMathFromOmml(getInnerTagXml(limLowBlock, "m:lim")).linear || parseSimpleOmmlLinear(getInnerTagXml(limLowBlock, "m:lim")).linear || "?";
    const limExprLatex = buildStructuredLinearMathFromOmml(getInnerTagXml(limLowBlock, "m:e")).latex || parseSimpleOmmlLinear(getInnerTagXml(limLowBlock, "m:e")).latex || "expr";
    const limSubLatex = buildStructuredLinearMathFromOmml(getInnerTagXml(limLowBlock, "m:lim")).latex || parseSimpleOmmlLinear(getInnerTagXml(limLowBlock, "m:lim")).latex || "?";
    return {
      linear: `${limExpr}_(${limSub})`,
      latex: `${limExprLatex}_{${limSubLatex}}`,
      parserConfidenceTier: "high",
      parserSignals
    };
  }

  const limUppBlock = extractAllTagBlocks(source, "m:limUpp")[0]?.xml || "";
  if (limUppBlock) {
    parserSignals.push("limit-upper");
    const limExpr = buildStructuredLinearMathFromOmml(getInnerTagXml(limUppBlock, "m:e")).linear || parseSimpleOmmlLinear(getInnerTagXml(limUppBlock, "m:e")).linear || "expr";
    const limSup = buildStructuredLinearMathFromOmml(getInnerTagXml(limUppBlock, "m:lim")).linear || parseSimpleOmmlLinear(getInnerTagXml(limUppBlock, "m:lim")).linear || "?";
    const limExprLatex = buildStructuredLinearMathFromOmml(getInnerTagXml(limUppBlock, "m:e")).latex || parseSimpleOmmlLinear(getInnerTagXml(limUppBlock, "m:e")).latex || "expr";
    const limSupLatex = buildStructuredLinearMathFromOmml(getInnerTagXml(limUppBlock, "m:lim")).latex || parseSimpleOmmlLinear(getInnerTagXml(limUppBlock, "m:lim")).latex || "?";
    return {
      linear: `${limExpr}^(${limSup})`,
      latex: `${limExprLatex}^{${limSupLatex}}`,
      parserConfidenceTier: "high",
      parserSignals
    };
  }

  const simple = parseSimpleOmmlLinear(source);
  if (simple.signals.length) {
    return {
      linear: simple.linear,
      latex: simple.latex,
      parserConfidenceTier: "medium",
      parserSignals: simple.signals
    };
  }

  return {
    linear: simple.linear,
    latex: simple.latex,
    parserConfidenceTier: simple.linear ? "low" : "low",
    parserSignals
  };
}

function buildLinearMathFromOmml(omml = "") {
  return buildStructuredLinearMathFromOmml(omml).linear;
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

function convertOmmlToMathMl(omml = "") {
  const source = ensureOmmlNamespaceBindings(omml);
  if (!source) return "";

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(source, "text/xml");

    const sourceNode = doc.getElementsByTagName("m:oMathPara")[0]
      || doc.getElementsByTagName("m:oMath")[0];
    if (!sourceNode) return "";

    const transformed = omml2mathml(sourceNode);
    if (!transformed) return "";

    const serializer = new XMLSerializer();
    return String(serializer.serializeToString(transformed) || "").trim();
  } catch {
    return "";
  }
}

function buildMathMlFromOmml(omml = "", linear = "") {
  const converted = convertOmmlToMathMl(omml);
  if (converted) return converted;

  const annotation = String(omml || "").replace(/--/g, "-");
  const escapedLinear = String(linear || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `<math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mtext>${escapedLinear}</mtext><annotation encoding="application/omml+xml">${annotation}</annotation></semantics></math>`;
}

function buildLatexFromMathMl(mathMl = "", fallbackLatex = "", fallbackLinear = "") {
  const source = String(mathMl || "").trim();
  if (!source) return String(fallbackLatex || fallbackLinear || "").trim();
  try {
    const converted = String(MathMLToLaTeX.convert(source) || "").trim();
    if (converted) return converted;
  } catch {
    // Keep fallback when MathML conversion fails.
  }
  return String(fallbackLatex || fallbackLinear || "").trim();
}

function shouldPreferLatexOverLinear({ linear = "", latex = "", mathXml = "" }) {
  const linearValue = String(linear || "").trim();
  const latexValue = String(latex || "").trim();
  const xml = String(mathXml || "");
  if (!latexValue) return false;
  if (!linearValue) return true;

  const linearHasEquals = /=/.test(linearValue);
  const latexHasEquals = /=/.test(latexValue);
  const ommlHasEquals = /<m:t[^>]*>\s*=\s*<\/m:t>/i.test(xml);
  if (ommlHasEquals && latexHasEquals && !linearHasEquals) return true;

  const latexRich = /\\(?:frac|sum|sqrt|bar|overline|underline|int|lim|sigma|left|right)\b/.test(latexValue);
  const linearLooksTruncated = linearValue.length < Math.max(10, Math.floor(latexValue.length * 0.55));
  if (latexRich && linearLooksTruncated) return true;

  const complexOmml = /<m:(?:f|nary|rad|limLow|limUpp|sSubSup|sSup|sSub|acc|bar|eqArr|m|mr)\b/i.test(xml);
  const linearAtomOnly = /^\(?[A-Za-z](?:_\([^)]+\))?(?:\^\([^)]+\))?\)?$/.test(linearValue.replace(/\s+/g, ""));
  if (complexOmml && linearAtomOnly) return true;

  return false;
}

function scoreFormulaConversion(linear = "", omml = "") {
  const linearLength = String(linear || "").trim().length;
  const tokenHits = (String(linear || "").match(/[=+\-*/^_()]/g) || []).length;
  const ommlSignals = (String(omml || "").match(/<m:(?:f|sSup|sSub|rad|nary|limLow|limUpp)\b/g) || []).length;
  const score = 0.45 + Math.min(0.25, linearLength / 120) + Math.min(0.2, tokenHits / 10) + Math.min(0.1, ommlSignals / 3);
  return Math.max(0, Math.min(0.99, Number(score.toFixed(3))));
}

function extractDocxFormulaTokensWithAlignment(docXml = "") {
  const xml = String(docXml || "");
  if (!xml) {
    return { formulaTokens: [], alignmentByRiskId: {}, transformedText: "" };
  }

  const paragraphMatches = Array.from(xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g));
  const formulaTokens = [];
  const alignmentByRiskId = {};
  const paragraphOutputs = [];
  let formulaIndex = 0;
  let totalOffset = 0;

  for (let paragraphIndex = 0; paragraphIndex < paragraphMatches.length; paragraphIndex += 1) {
    const paragraphXml = paragraphMatches[paragraphIndex]?.[0] || "";
    let paragraphOut = "";
    let cursor = 0;
    let runIndex = 0;

    for (const mathMatch of paragraphXml.matchAll(/<m:oMathPara\b[\s\S]*?<\/m:oMathPara>|<m:oMath\b[\s\S]*?<\/m:oMath>/g)) {
      const mathStart = mathMatch.index || 0;
      const mathXml = mathMatch[0] || "";
      const before = paragraphXml.slice(cursor, mathStart);
      const beforeText = cleanExtractedText(stripXmlPreservingSpaces(before));
      if (beforeText) {
        paragraphOut += `${beforeText} `;
      }

      const structured = buildStructuredLinearMathFromOmml(mathXml);
      const structuredLinear = structured.linear || buildLinearMathFromOmml(mathXml) || "";
      const preliminaryLinear = structuredLinear || "[FORMULA]";
      const mathMl = buildMathMlFromOmml(mathXml, preliminaryLinear);
      const latex = buildLatexFromMathMl(mathMl, structured.latex, structuredLinear);
      const signalDensity = (String(mathXml).match(/<m:(?:f|sSup|sSub|sSubSup|rad|nary|limLow|limUpp|acc|bar|m|mr|eqArr)\b/g) || []).length;

      let linear = structuredLinear || latex || "[FORMULA]";
      if (shouldPreferLatexOverLinear({ linear: structuredLinear, latex, mathXml })) {
        linear = latex;
      } else if (signalDensity >= 3 && String(latex || "").length > String(structuredLinear || "").length * 1.5) {
        linear = latex;
      }

      const contextBefore = cleanExtractedText(stripXmlPreservingSpaces(paragraphXml.slice(0, mathStart))).slice(-120);
      const contextAfter = cleanExtractedText(stripXmlPreservingSpaces(paragraphXml.slice(mathStart + mathXml.length))).slice(0, 120);
      const riskId = `R${formulaIndex + 1}`;
      const start = totalOffset + paragraphOut.length;
      paragraphOut += linear;
      const end = totalOffset + paragraphOut.length;

      formulaTokens.push({
        riskId,
        sourceXmlSnippet: mathXml.slice(0, 1200),
        mathMl,
        linear,
        latex,
        confidence: scoreFormulaConversion(linear, mathXml),
        parserConfidenceTier: structured.parserConfidenceTier || "low",
        parserSignals: Array.isArray(structured.parserSignals) ? structured.parserSignals : [],
        contextBefore,
        contextAfter,
        paragraphIndex,
        runIndex
      });

      alignmentByRiskId[riskId] = {
        start,
        end,
        paragraphIndex,
        runIndex
      };

      formulaIndex += 1;
      runIndex += 1;
      cursor = mathStart + mathXml.length;
    }

    const tailXml = paragraphXml.slice(cursor);
    const tailText = cleanExtractedText(stripXmlPreservingSpaces(tailXml));
    if (tailText) {
      paragraphOut += `${tailText}`;
    }

    paragraphOut = cleanExtractedText(paragraphOut);
    if (paragraphOut) {
      paragraphOutputs.push(paragraphOut);
      totalOffset += paragraphOut.length + 2;
    }
  }

  return {
    formulaTokens,
    alignmentByRiskId,
    transformedText: paragraphOutputs.join("\n\n")
  };
}

function detectImageMimeTypeFromPath(path = "") {
  const lower = String(path || "").toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".bmp")) return "image/bmp";
  if (lower.endsWith(".tif") || lower.endsWith(".tiff")) return "image/tiff";
  return "application/octet-stream";
}

async function extractEmbeddedImagesFromZip(zip, rootPrefix, maxImages = 6) {
  const prefix = String(rootPrefix || "");
  const candidates = Object.keys(zip.files)
    .filter((path) => path.startsWith(prefix) && !zip.files[path].dir)
    .slice(0, Math.max(0, maxImages));

  const images = [];
  for (const path of candidates) {
    const file = zip.files[path];
    if (!file) continue;
    const buffer = await file.async("nodebuffer");
    if (!buffer?.length) continue;
    images.push({
      path,
      buffer,
      mimeType: detectImageMimeTypeFromPath(path)
    });
  }
  return images;
}

async function runMathOcrOnImage({ buffer, mimeType }) {
  if (!buffer?.length || !MATH_OCR_APP_ID || !MATH_OCR_APP_KEY || !MATH_OCR_ENDPOINT) {
    return null;
  }

  const src = `data:${mimeType || "image/png"};base64,${Buffer.from(buffer).toString("base64")}`;
  const response = await fetch(MATH_OCR_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      app_id: MATH_OCR_APP_ID,
      app_key: MATH_OCR_APP_KEY
    },
    body: JSON.stringify({
      src,
      formats: ["latex_simplified", "asciimath"],
      data_options: {
        include_asciimath: true,
        include_latex: true
      }
    })
  });

  if (!response.ok) return null;
  const payload = await response.json();
  const linear = cleanExtractedText(payload?.latex_simplified || payload?.asciimath || payload?.text || "");
  if (!linear) return null;

  const confidence = Number(payload?.confidence || payload?.auto_rotate_confidence || 0.56);
  return {
    linear,
    confidence: Math.max(0, Math.min(0.99, Number.isFinite(confidence) ? confidence : 0.56))
  };
}

async function runEmbeddedMathOcr(images = [], options = {}) {
  const max = Math.max(0, Number(options.maxImages || 3));
  const formulaTokens = [];

  for (let index = 0; index < Math.min(images.length, max); index += 1) {
    const image = images[index];
    try {
      const ocr = await runMathOcrOnImage(image);
      if (!ocr?.linear) continue;
      formulaTokens.push({
        sourceXmlSnippet: `embedded-image:${image.path}`,
        mathMl: "",
        linear: ocr.linear,
        latex: ocr.linear,
        confidence: Number(ocr.confidence || 0.56),
        paragraphIndex: -1,
        runIndex: index
      });
    } catch {
      // Ignore individual OCR failures to keep extraction non-blocking.
    }
  }

  return formulaTokens;
}

async function extractPptxText(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const slidePaths = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
    .sort((a, b) => {
      const ai = Number(a.match(/slide(\d+)\.xml/i)?.[1] || 0);
      const bi = Number(b.match(/slide(\d+)\.xml/i)?.[1] || 0);
      return ai - bi;
    });

  const slides = [];
  for (const slidePath of slidePaths) {
    const xml = await zip.files[slidePath].async("string");
    const text = stripXml(xml);
    if (text) {
      slides.push(text);
    }
  }

  return slides.join("\n\n");
}

function cleanExtractedText(value = "") {
  return String(value || "")
    .split("\u0000").join("")
    .replace(/[\t\r]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function estimateTokenCount(text = "") {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean).length;
  if (!words) return 0;
  return Math.max(1, Math.round(words * 1.35));
}

function normalizeMarkdownSpacing(markdown = "") {
  return String(markdown || "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function plainTextToMarkdown(text = "") {
  const source = String(text || "").replace(/\r/g, "");
  if (!source.trim()) return "";
  const paragraphs = source.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  if (!paragraphs.length) return source.trim();
  return paragraphs.map((paragraph) => paragraph.replace(/\n/g, "  \n")).join("\n\n");
}

function htmlToMarkdown(html = "") {
  const source = String(html || "");
  if (!source.trim()) return "";
  return normalizeMarkdownSpacing(turndown.turndown(source));
}

function rtfToPlainText(rtf = "") {
  return cleanExtractedText(
    String(rtf || "")
      .replace(/\\par[d]?/g, "\n")
      .replace(/\\tab/g, " ")
      .replace(/\\'[0-9a-fA-F]{2}/g, " ")
      .replace(/\\[a-z]+-?\d* ?/gi, "")
      .replace(/[{}]/g, "")
  );
}

function looksLikeMarkdown(text = "") {
  const sample = String(text || "");
  if (!sample.trim()) return false;
  return /(^|\n)#{1,6}\s+|```|\|.+\||(^|\n)(?:- |\* |\d+\. )/m.test(sample);
}

function latexBlockFromFormulaToken(token) {
  const latex = cleanExtractedText(token?.latex || token?.linear || "");
  if (!latex) return "";
  return `$$\n${latex}\n$$`;
}

function buildEquationAppendixMarkdown(tokens = []) {
  const formulaBlocks = tokens
    .map((token, index) => {
      const block = latexBlockFromFormulaToken(token);
      if (!block) return "";
      const tier = String(token?.parserConfidenceTier || "low").toUpperCase();
      return `### Equation ${index + 1} (${tier})\n\n${block}`;
    })
    .filter(Boolean);

  if (!formulaBlocks.length) return "";
  return `## Extracted Equations\n\n${formulaBlocks.join("\n\n")}`;
}

function mergeMarkdownWithEquationAppendix(markdown = "", formulaTokens = []) {
  const base = normalizeMarkdownSpacing(markdown);
  const appendix = buildEquationAppendixMarkdown(formulaTokens);
  if (!appendix) return base;
  if (!base) return appendix;
  return `${base}\n\n${appendix}`;
}

function pdfTextToStructuredMarkdown(text = "") {
  const normalized = String(text || "").replace(/\r/g, "");
  if (!normalized.trim()) return "";

  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const blocks = [];

  for (const line of lines) {
    if (/^(chapter|section|unit)\b/i.test(line) || /^[A-Z][A-Z\s\d:()-]{8,}$/.test(line)) {
      blocks.push(`## ${line.replace(/^#+\s*/, "")}`);
      continue;
    }
    if (/^(?:[-*•]|\d+[.)])\s+/.test(line)) {
      const item = line.replace(/^(?:[-*•]|\d+[.)])\s+/, "").trim();
      blocks.push(`- ${item}`);
      continue;
    }
    blocks.push(line);
  }

  return normalizeMarkdownSpacing(blocks.join("\n\n"));
}

function estimateTextDensity(text = "") {
  const sample = String(text || "");
  if (!sample.length) return 0;
  const meaningfulChars = (sample.match(/[A-Za-z0-9]/g) || []).length;
  return meaningfulChars / sample.length;
}

function detectFormulaHeavyText(text = "") {
  const sample = String(text || "");
  const mathLike = (sample.match(/[=^_{}\\]|[∑∫√πσμ∞≈≠≤≥±÷×]|\b(?:sin|cos|tan|log|sqrt|frac|sum|int|lim|alpha|beta|gamma|variance|deviation|quantile|covariance|correlation)\b/gi) || []).length;
  const chemLike = (sample.match(/\b(?:[A-Z][a-z]?\d*){2,}\b|\b(?:mol|molar|stoichiometry|reaction|catalyst|enthalpy)\b/gi) || []).length;
  return mathLike + chemLike >= 6;
}

function countMathSignalsInText(text = "") {
  const sample = String(text || "");
  const symbolHits = (sample.match(/[=^_{}\\]|[∑∫√πσμ∞≈≠≤≥±÷×]/g) || []).length;
  const keywordHits = (sample.match(/\b(?:sin|cos|tan|log|sqrt|frac|sum|int|lim|alpha|beta|gamma|integral|derivative|variance|deviation|quantile|covariance|correlation|sample)\b/gi) || []).length;
  return symbolHits + keywordHits;
}

function extractFormulaLikeExcerpts(text = "", limit = 8) {
  const source = String(text || "");
  if (!source.trim()) return [];

  const snippets = [];
  const seen = new Set();
  const expressionPattern = /[∑∫√πσμ∞≈≠≤≥±÷×]|\b(?:sqrt|frac|sum|int|lim|integral|derivative|variance|covariance|correlation)\b|\w\s*[=^_]\s*\w/gi;

  for (const match of source.matchAll(expressionPattern)) {
    const at = Number(match.index || 0);
    const start = Math.max(0, at - 90);
    const end = Math.min(source.length, at + 120);
    const snippet = cleanExtractedText(source.slice(start, end));
    if (!snippet || snippet.length < 16) continue;
    const key = snippet.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    snippets.push(snippet);
    if (snippets.length >= limit) break;
  }

  return snippets;
}

function normalizeRiskMarkers(markers = []) {
  return markers
    .map((marker) => ({
      type: String(marker?.type || "general-risk").trim(),
      severity: String(marker?.severity || "medium").trim(),
      label: String(marker?.label || "Potential extraction risk").trim(),
      excerpt: cleanExtractedText(marker?.excerpt || ""),
      addressed: Boolean(marker?.addressed),
      anchor: marker?.anchor && typeof marker.anchor === "object"
        ? {
          start: Number(marker.anchor.start || 0),
          end: Number(marker.anchor.end || 0),
          paragraphIndex: Number(marker.anchor.paragraphIndex || -1),
          runIndex: Number(marker.anchor.runIndex || -1)
        }
        : null,
      formula: marker?.formula && typeof marker.formula === "object"
        ? {
          sourceXmlSnippet: String(marker.formula.sourceXmlSnippet || "").slice(0, 1600),
          mathMl: String(marker.formula.mathMl || "").slice(0, 2000),
          linear: cleanExtractedText(marker.formula.linear || ""),
          latex: cleanExtractedText(marker.formula.latex || marker.formula.linear || ""),
          confidence: Number(marker.formula.confidence || 0),
          parserConfidenceTier: ["high", "medium", "low"].includes(String(marker.formula.parserConfidenceTier || "").toLowerCase())
            ? String(marker.formula.parserConfidenceTier || "").toLowerCase()
            : "low",
          parserSignals: Array.isArray(marker.formula.parserSignals)
            ? marker.formula.parserSignals.map((signal) => String(signal || "").trim()).filter(Boolean).slice(0, 12)
            : []
        }
        : null
    }))
    .filter((marker) => marker.label);
}

function sanitizeRenderHtml(html = "") {
  return String(html || "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "");
}

function countMatches(source = "", pattern) {
  const matches = String(source || "").match(pattern);
  return Array.isArray(matches) ? matches.length : 0;
}

function clampRatio(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, Number(value)));
}

function buildExtractionVerificationManifest(input = {}) {
  const sourceEquationCount = Math.max(0, Number(input?.sourceEquationCount || 0));
  const extractedEquationCount = Math.max(0, Number(input?.extractedEquationCount || 0));
  const sourceTableCount = Math.max(0, Number(input?.sourceTableCount || 0));
  const extractedTableCount = Math.max(0, Number(input?.extractedTableCount || 0));
  const sourceTextLength = Math.max(0, Number(input?.sourceTextLength || 0));
  const extractedTextLength = Math.max(0, Number(input?.extractedTextLength || 0));
  const minTextCoverage = clampRatio(Number(input?.minTextCoverage || 0.65));

  const equationCoverage = sourceEquationCount > 0
    ? clampRatio(extractedEquationCount / sourceEquationCount)
    : 1;
  const tableCoverage = sourceTableCount > 0
    ? clampRatio(extractedTableCount / sourceTableCount)
    : 1;
  const textCoverage = sourceTextLength > 0
    ? clampRatio(extractedTextLength / sourceTextLength)
    : (extractedTextLength > 0 ? 1 : 0);

  const unresolved = [];
  if (sourceEquationCount > 0 && extractedEquationCount < sourceEquationCount) {
    unresolved.push(`formula-parity-failed:${extractedEquationCount}/${sourceEquationCount}`);
  }
  if (sourceTableCount > 0 && extractedTableCount < sourceTableCount) {
    unresolved.push(`table-parity-failed:${extractedTableCount}/${sourceTableCount}`);
  }
  if (textCoverage < minTextCoverage) {
    unresolved.push(`text-coverage-low:${textCoverage.toFixed(3)}<${minTextCoverage.toFixed(3)}`);
  }

  return {
    sourceCounts: {
      equations: sourceEquationCount,
      tables: sourceTableCount,
      textLength: sourceTextLength
    },
    extractedCounts: {
      equations: extractedEquationCount,
      tables: extractedTableCount,
      textLength: extractedTextLength
    },
    coverage: {
      equations: Number(equationCoverage.toFixed(3)),
      tables: Number(tableCoverage.toFixed(3)),
      text: Number(textCoverage.toFixed(3))
    },
    thresholds: {
      minTextCoverage
    },
    gatePassed: unresolved.length === 0,
    unresolved
  };
}

function buildVerificationRiskMarkers(manifest = null) {
  if (!manifest || manifest.gatePassed) return [];
  return (manifest.unresolved || []).map((item, index) => ({
    id: `VERIFY-R${index + 1}`,
    type: "extraction-verification",
    severity: "high",
    label: `Verification check failed ${index + 1}`,
    excerpt: String(item || "").trim(),
    addressed: false,
    anchor: null,
    formula: null
  }));
}

function injectDocxFormulaTokensIntoHtml(sourceRenderHtml = "", formulaTokens = []) {
  const html = String(sourceRenderHtml || "").trim();
  const tokens = Array.isArray(formulaTokens) ? formulaTokens : [];
  const formulaEntries = tokens
    .map((token, index) => {
      const riskId = String(token?.riskId || `R${index + 1}`);
      const linear = cleanExtractedText(token?.linear || "");
      const latex = cleanExtractedText(token?.latex || "");
      const mathMl = String(token?.mathMl || "").trim();
      const paragraphIndex = Number.isFinite(Number(token?.paragraphIndex)) ? Number(token.paragraphIndex) : -1;
      if (!linear && !mathMl) return null;
      return {
        riskId,
        linear,
        latex,
        mathMl,
        paragraphIndex
      };
    })
    .filter(Boolean);

  if (!formulaEntries.length) return html;

  if (!html) {
    return "";
  }

  const paragraphMatches = Array.from(html.matchAll(/<(p|li|td|th|h[1-6])\b[^>]*>[\s\S]*?<\/\1>/gi));
  if (!paragraphMatches.length) {
    return html;
  }

  const byParagraph = new Map();
  for (const entry of formulaEntries) {
    if (entry.paragraphIndex < 0) continue;
    const bucket = byParagraph.get(entry.paragraphIndex) || [];
    bucket.push(entry);
    byParagraph.set(entry.paragraphIndex, bucket);
  }

  let output = "";
  let cursor = 0;
  for (let index = 0; index < paragraphMatches.length; index += 1) {
    const match = paragraphMatches[index];
    const start = Number(match.index || 0);
    const block = String(match[0] || "");

    output += html.slice(cursor, start);
    let finalBlock = block;

    const entries = byParagraph.get(index) || [];
    if (entries.length) {
      const formulaInline = entries.map((entry) => {
        const formulaBody = entry.mathMl
          ? `<span class="luna-source-formula-math">${entry.mathMl}</span>`
          : (entry.latex
            ? `<span class="luna-source-formula-latex">$$ ${escapeHtml(entry.latex)} $$</span>`
            : `<span class="luna-source-formula-latex">$$ ${escapeHtml(entry.linear || "[FORMULA]")} $$</span>`);
        return `<span class="luna-source-formula-inline" data-source-risk-id="${escapeHtml(entry.riskId)}"> ${formulaBody} </span>`;
      }).join(" ");

      const closeTagMatch = block.match(/^<([a-z0-9]+)/i);
      const tagName = String(closeTagMatch?.[1] || "p").toLowerCase();
      const closeTag = `</${tagName}>`;
      if (block.endsWith(closeTag)) {
        finalBlock = `${block.slice(0, -closeTag.length)} ${formulaInline}${closeTag}`;
      } else {
        finalBlock = `${block} ${formulaInline}`;
      }
    }

    output += finalBlock;

    cursor = start + block.length;
  }

  output += html.slice(cursor);
  return output;
}

function htmlToPlainText(html = "") {
  return cleanExtractedText(
    String(html || "")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/h[1-6]>/gi, "\n\n")
      .replace(/<[^>]+>/g, " ")
  );
}

function wrapPdfTextLine(text, font, fontSize, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (!words.length) return [""];

  const lines = [];
  let current = words[0];

  for (let index = 1; index < words.length; index += 1) {
    const candidate = `${current} ${words[index]}`;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = words[index];
  }

  lines.push(current);
  return lines;
}

async function buildGeneratedPdfArtifactBase64(text = "", title = "Uploaded Document") {
  const normalizedTitle = String(title || "Uploaded Document").trim() || "Uploaded Document";
  const content = cleanExtractedText(text);
  const printable = content || "No extractable text was available for this file.";

  const pdfDoc = await PDFDocument.create();
  const titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const bodyFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 44;
  const titleSize = 13;
  const bodySize = 10;
  const lineHeight = 14;
  const maxWidth = pageWidth - margin * 2;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  function addNewPage() {
    page = pdfDoc.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
  }

  function drawLine(line, font, size, color) {
    if (y < margin + lineHeight) {
      addNewPage();
    }
    page.drawText(String(line || ""), {
      x: margin,
      y,
      size,
      font,
      color
    });
    y -= lineHeight;
  }

  drawLine(normalizedTitle, titleFont, titleSize, rgb(0.16, 0.22, 0.36));
  y -= 6;

  const paragraphs = printable.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  for (const paragraph of paragraphs) {
    const paragraphLines = wrapPdfTextLine(paragraph.replace(/\n+/g, " "), bodyFont, bodySize, maxWidth);
    for (const line of paragraphLines) {
      drawLine(line, bodyFont, bodySize, rgb(0.08, 0.11, 0.16));
    }
    y -= 6;
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes).toString("base64");
}

async function inspectDocxMathSignals(buffer) {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const docXml = await zip.file("word/document.xml")?.async("string");
    if (!docXml) {
      return {
        mathNodeCount: 0,
        sourcePreview: "",
        riskMarkers: [],
        alignedText: "",
        formulaTokens: [],
        sourceEquationCount: 0,
        sourceTableCount: 0,
        sourceTextLength: 0
      };
    }

    const { formulaTokens, alignmentByRiskId, transformedText } = extractDocxFormulaTokensWithAlignment(docXml);
    const sourceEquationCount = countMatches(docXml, /<m:oMathPara\b|<m:oMath\b/g);
    const sourceTableCount = countMatches(docXml, /<w:tbl\b/g);
    const sourceTextLength = cleanExtractedText(stripXmlPreservingSpaces(docXml)).length;

    const mathBlocks = [];
    for (const match of docXml.matchAll(/<m:oMathPara\b[\s\S]*?<\/m:oMathPara>|<m:oMath\b[\s\S]*?<\/m:oMath>/g)) {
      const raw = match?.[0] || "";
      const cleaned = cleanExtractedText(stripXml(raw));
      if (cleaned) {
        mathBlocks.push(cleaned.slice(0, 220));
      }
    }

    const sourcePreviewXml = docXml
      .replace(/<m:oMathPara\b[\s\S]*?<\/m:oMathPara>/g, " [FORMULA_BLOCK] ")
      .replace(/<m:oMath\b[\s\S]*?<\/m:oMath>/g, " [FORMULA] ");

    const sourcePreview = cleanExtractedText(stripXml(sourcePreviewXml)).slice(0, 8000);
    const riskMarkers = formulaTokens.length
      ? formulaTokens.slice(0, 20).map((token, index) => ({
        id: token.riskId || `R${index + 1}`,
        type: "docx-math-zone",
        severity: "high",
        label: `Formula zone ${index + 1}`,
        excerpt: token.linear || mathBlocks[index] || "Formula region",
        anchor: alignmentByRiskId[token.riskId || `R${index + 1}`] || null,
        formula: {
          sourceXmlSnippet: token.sourceXmlSnippet,
          mathMl: token.mathMl,
          linear: token.linear,
          latex: token.latex || token.linear,
          confidence: token.confidence,
          parserConfidenceTier: token.parserConfidenceTier || "low",
          parserSignals: Array.isArray(token.parserSignals) ? token.parserSignals : []
        }
      }))
      : mathBlocks.slice(0, 10).map((excerpt, index) => ({
        id: `R${index + 1}`,
        type: "docx-math-zone",
        severity: "high",
        label: `Formula zone ${index + 1}`,
        excerpt
      }));

    return {
      mathNodeCount: mathBlocks.length,
      sourcePreview,
      riskMarkers,
      alignedText: transformedText,
      formulaTokens,
      sourceEquationCount,
      sourceTableCount,
      sourceTextLength
    };
  } catch {
    return {
      mathNodeCount: 0,
      sourcePreview: "",
      riskMarkers: [],
      alignedText: "",
      formulaTokens: [],
      sourceEquationCount: 0,
      sourceTableCount: 0,
      sourceTextLength: 0
    };
  }
}

async function countDocxMathNodes(buffer) {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const docXml = await zip.file("word/document.xml")?.async("string");
    if (!docXml) return 0;
    const matches = docXml.match(/<m:oMath\b|<m:oMathPara\b/g) || [];
    return matches.length;
  } catch {
    return 0;
  }
}

function computeConfidence({ method, text = "", ocrConfidence = null }) {
  const lengthScore = Math.min(1, String(text || "").length / 1200);
  const densityScore = Math.max(0, Math.min(1, estimateTextDensity(text)));

  let methodBase = 0.7;
  if (method === "plain-text") methodBase = 0.99;
  if (method === "pdf") methodBase = 0.88;
  if (method === "docx") methodBase = 0.9;
  if (method === "pptx") methodBase = 0.84;
  if (method === "doc-legacy") methodBase = 0.7;
  if (method === "ppt-legacy") methodBase = 0.65;
  if (method === "ocr") methodBase = 0.58;

  const ocrScore = typeof ocrConfidence === "number"
    ? Math.max(0, Math.min(1, ocrConfidence / 100))
    : 0.6;

  const combined = method === "ocr"
    ? (methodBase * 0.45 + ocrScore * 0.4 + lengthScore * 0.1 + densityScore * 0.05)
    : (methodBase * 0.7 + lengthScore * 0.2 + densityScore * 0.1);

  return Math.max(0, Math.min(1, Number(combined.toFixed(3))));
}

function createExtractionResult({
  text,
  markdown = "",
  method,
  ocrConfidence = null,
  issues = [],
  riskMarkers = [],
  verification = null,
  sourcePreview = "",
  sourceMimeType = "",
  sourceContentBase64 = "",
  sourceRenderHtml = "",
  generatedPdfContentBase64 = "",
  minConfidence = DEFAULT_EXTRACTION_MIN_CONFIDENCE
}) {
  const cleanedText = cleanExtractedText(text);
  const cleanedMarkdown = normalizeMarkdownSpacing(String(markdown || "")) || plainTextToMarkdown(cleanedText);
  const cleanedSourcePreview = cleanExtractedText(sourcePreview);
  const confidence = computeConfidence({ method, text: cleanedText, ocrConfidence });
  const formulaHeavy = detectFormulaHeavyText(cleanedText);
  const mathSignals = countMathSignalsInText(cleanedText);
  const verificationManifest = verification && typeof verification === "object"
    ? verification
    : null;

  const nextIssues = [...issues];
  if (!cleanedText) {
    nextIssues.push("no-text-extracted");
  }
  if (cleanedText.length < 50) {
    nextIssues.push("very-short-text");
  }
  if (formulaHeavy && confidence < 0.9) {
    nextIssues.push("formula-or-chemistry-content-needs-verification");
  }

  const normalizedRiskMarkers = normalizeRiskMarkers(riskMarkers);
  const hasFormulaMarker = normalizedRiskMarkers.some((marker) => {
    const type = String(marker?.type || "").toLowerCase();
    const label = String(marker?.label || "").toLowerCase();
    return type.includes("formula")
      || type.includes("math")
      || type.includes("equation")
      || label.includes("formula")
      || label.includes("math")
      || label.includes("equation")
      || Boolean(marker?.formula?.linear);
  });

  const nextRiskMarkers = [...normalizedRiskMarkers];
  if ((formulaHeavy || mathSignals >= 6) && !hasFormulaMarker) {
    const excerpts = extractFormulaLikeExcerpts(cleanedText, 10);
    excerpts.forEach((excerpt, index) => {
      nextRiskMarkers.push({
        id: `AUTO-F${index + 1}`,
        type: "formula-text-detected",
        severity: "high",
        label: `Formula expression detected ${index + 1}`,
        excerpt,
        addressed: false,
        anchor: null,
        formula: {
          sourceXmlSnippet: "",
          mathMl: "",
          linear: excerpt,
          latex: excerpt,
          confidence: 0.55,
          parserConfidenceTier: "low",
          parserSignals: ["text-heuristic"]
        }
      });
    });
    nextIssues.push("formula-content-detected-needs-verification");
  }

  if ((hasFormulaMarker || nextRiskMarkers.some((marker) => String(marker?.type || "").includes("formula")))
    && !nextIssues.some((issue) => String(issue || "").includes("needs-verification"))) {
    nextIssues.push("formula-zones-detected-needs-verification");
  }

  if (verificationManifest && !verificationManifest.gatePassed) {
    nextIssues.push("extraction-verification-failed");
    nextRiskMarkers.push(...buildVerificationRiskMarkers(verificationManifest));
  }

  const hasVerificationIssue = nextIssues.some((issue) => issue.includes("needs-verification") || issue.includes("omitted-risk"));
  const requiresReview = confidence < minConfidence
    || nextIssues.includes("no-text-extracted")
    || hasVerificationIssue
    || Boolean(verificationManifest && !verificationManifest.gatePassed);

  return {
    text: cleanedText,
    markdown: cleanedMarkdown,
    sourcePreview: cleanedSourcePreview,
    sourceMimeType: String(sourceMimeType || "").trim().toLowerCase(),
    sourceContentBase64: String(sourceContentBase64 || ""),
    sourceRenderHtml: sanitizeRenderHtml(sourceRenderHtml),
    generatedPdfContentBase64: String(generatedPdfContentBase64 || ""),
    confidence,
    method,
    verification: verificationManifest,
    issues: Array.from(new Set(nextIssues)),
    riskMarkers: nextRiskMarkers,
    requiresReview
  };
}

function extractPrintableTextFromBinary(buffer) {
  const latinText = buffer.toString("latin1");
  const asciiMatches = latinText.match(/[A-Za-z0-9][A-Za-z0-9 ,.;:()[\]{}'"!?@#$%^&*+-_=\\/|<>]{4,}/g) || [];

  const utf16Matches = [];
  for (let index = 0; index < buffer.length - 1; index += 2) {
    const code = buffer.readUInt16LE(index);
    if (code >= 32 && code <= 126) {
      let cursor = index;
      let run = "";
      while (cursor < buffer.length - 1) {
        const c = buffer.readUInt16LE(cursor);
        if (c < 32 || c > 126) break;
        run += String.fromCharCode(c);
        cursor += 2;
      }
      if (run.length >= 5) {
        utf16Matches.push(run);
      }
      index = cursor;
    }
  }

  const merged = Array.from(new Set([...utf16Matches, ...asciiMatches]))
    .map((item) => item.trim())
    .filter((item) => item.length >= 5);

  return cleanExtractedText(merged.join("\n"));
}

async function extractLegacyDocText(buffer) {
  try {
    const { default: WordExtractor } = await import("word-extractor");
    const extractor = new WordExtractor();
    const document = await extractor.extract(buffer);
    const body = cleanExtractedText(document?.getBody?.() || "");
    if (body) return body;
  } catch {
    // Falls back below.
  }

  try {
    const CFB = await import("cfb");
    const container = CFB.read(buffer, { type: "buffer" });
    const wordStream = CFB.find(container, "WordDocument");
    if (wordStream?.content) {
      return extractPrintableTextFromBinary(Buffer.from(wordStream.content));
    }
  } catch {
    // Falls back below.
  }

  return extractPrintableTextFromBinary(buffer);
}

async function extractLegacyPptText(buffer) {
  try {
    const CFB = await import("cfb");
    const container = CFB.read(buffer, { type: "buffer" });
    const pptStream = CFB.find(container, "PowerPoint Document");
    if (pptStream?.content) {
      const text = extractPrintableTextFromBinary(Buffer.from(pptStream.content));
      if (text) return text;
    }
  } catch {
    // Falls back below.
  }

  return extractPrintableTextFromBinary(buffer);
}

async function preprocessImageForOcr(buffer) {
  try {
    const { default: sharp } = await import("sharp");
    return await sharp(buffer, { failOn: "none" })
      .rotate()
      .greyscale()
      .normalise()
      .sharpen()
      .threshold(168)
      .png({ quality: 100, compressionLevel: 9 })
      .toBuffer();
  } catch {
    return buffer;
  }
}

function extractHighConfidenceText(ocrData, minConfidence) {
  const words = Array.isArray(ocrData?.words) ? ocrData.words : [];
  if (!words.length) {
    return cleanExtractedText(ocrData?.text || "");
  }

  const accepted = words
    .filter((word) => Number(word?.confidence || 0) >= minConfidence)
    .map((word) => String(word?.text || "").trim())
    .filter(Boolean);

  const highConfidenceText = cleanExtractedText(accepted.join(" "));
  const fallbackText = cleanExtractedText(ocrData?.text || "");
  return highConfidenceText.length >= 20 ? highConfidenceText : fallbackText;
}

function estimateOcrConfidence(ocrData) {
  if (typeof ocrData?.confidence === "number") {
    return ocrData.confidence;
  }

  const words = Array.isArray(ocrData?.words) ? ocrData.words : [];
  if (!words.length) return null;
  const total = words.reduce((sum, word) => sum + Number(word?.confidence || 0), 0);
  return total / words.length;
}

export async function extractTextFromUploadedFile(file, options = {}) {
  const minConfidence = Math.max(0, Math.min(1, Number(options?.minConfidence ?? DEFAULT_EXTRACTION_MIN_CONFIDENCE)));
  const name = String(file?.name || "uploaded-file");
  const extension = getExtension(name);
  const mimeType = String(file?.mimeType || "").toLowerCase();
  const buffer = decodeBase64ToBuffer(file?.contentBase64 || "");

  if (!buffer.length) {
    return createExtractionResult({
      text: "",
      markdown: "",
      method: "empty",
      issues: ["empty-binary-content"],
      minConfidence
    });
  }

  if (extension === "md" || extension === "markdown" || mimeType === "text/markdown") {
    const markdown = normalizeMarkdownSpacing(buffer.toString("utf8"));
    return createExtractionResult({
      text: markdown,
      markdown,
      sourcePreview: markdown,
      sourceMimeType: mimeType || "text/markdown",
      sourceContentBase64: String(file?.contentBase64 || ""),
      method: "markdown",
      minConfidence
    });
  }

  if (extension === "html" || extension === "htm" || mimeType === "text/html") {
    const html = buffer.toString("utf8");
    const markdown = htmlToMarkdown(html);
    return createExtractionResult({
      text: htmlToPlainText(html),
      markdown,
      sourcePreview: htmlToPlainText(html),
      sourceMimeType: mimeType || "text/html",
      sourceContentBase64: String(file?.contentBase64 || ""),
      sourceRenderHtml: html,
      method: "html",
      minConfidence
    });
  }

  if (extension === "rtf" || mimeType === "application/rtf" || mimeType === "text/rtf") {
    const rtfText = rtfToPlainText(buffer.toString("utf8"));
    return createExtractionResult({
      text: rtfText,
      markdown: plainTextToMarkdown(rtfText),
      sourcePreview: rtfText,
      sourceMimeType: mimeType || "application/rtf",
      sourceContentBase64: String(file?.contentBase64 || ""),
      method: "rtf",
      minConfidence
    });
  }

  if (TEXT_EXTENSIONS.has(extension) || mimeType.startsWith("text/")) {
    const text = buffer.toString("utf8");
    return createExtractionResult({
      text,
      markdown: looksLikeMarkdown(text) ? normalizeMarkdownSpacing(text) : plainTextToMarkdown(text),
      sourcePreview: text,
      sourceMimeType: mimeType || "text/plain",
      sourceContentBase64: String(file?.contentBase64 || ""),
      method: "plain-text",
      minConfidence
    });
  }

  if (extension === "pdf" || mimeType === "application/pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const parsed = await parser.getText();
      const text = String(parsed?.text || "").trim();
      return createExtractionResult({
        text,
        markdown: pdfTextToStructuredMarkdown(text),
        sourcePreview: text,
        sourceMimeType: mimeType || "application/pdf",
        sourceContentBase64: String(file?.contentBase64 || ""),
        method: "pdf",
        minConfidence
      });
    } finally {
      await parser.destroy();
    }
  }

  if (extension === "docx" || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const parsed = await mammoth.extractRawText({ buffer });
    const rendered = await mammoth.convertToHtml({ buffer });
    const rawExtractedText = String(parsed?.value || "").trim();
    const sourceRenderHtmlRaw = String(rendered?.value || "").trim();
    const {
      mathNodeCount,
      sourcePreview,
      riskMarkers,
      alignedText,
      formulaTokens,
      sourceEquationCount,
      sourceTableCount,
      sourceTextLength
    } = await inspectDocxMathSignals(buffer);
    const sourceRenderHtml = injectDocxFormulaTokensIntoHtml(sourceRenderHtmlRaw, formulaTokens);
    const extractedText = cleanExtractedText(alignedText || rawExtractedText);
    const extractedMathSignalCount = countMathSignalsInText(extractedText);
    const extractedTableCount = countMatches(sourceRenderHtml, /<table\b/gi);
    const extractedEquationCount = formulaTokens.length;
    const verification = buildExtractionVerificationManifest({
      sourceEquationCount,
      extractedEquationCount,
      sourceTableCount,
      extractedTableCount,
      sourceTextLength,
      extractedTextLength: extractedText.length,
      minTextCoverage: sourceEquationCount > 0 || sourceTableCount > 0 ? 0.55 : 0.65
    });
    const docxIssues = [];
    const docxRiskMarkers = [...riskMarkers];

    try {
      const zip = await JSZip.loadAsync(buffer);
      const embeddedImages = await extractEmbeddedImagesFromZip(zip, "word/media/", 6);
      if (embeddedImages.length && MATH_OCR_APP_ID && MATH_OCR_APP_KEY) {
        const ocrFormulaTokens = await runEmbeddedMathOcr(embeddedImages, { maxImages: 3 });
        for (let index = 0; index < ocrFormulaTokens.length; index += 1) {
          const token = ocrFormulaTokens[index];
          docxRiskMarkers.push({
            id: `IMG-R${index + 1}`,
            type: "formula-image-ocr",
            severity: "medium",
            label: `Formula image OCR ${index + 1}`,
            excerpt: token.linear,
            formula: {
              sourceXmlSnippet: token.sourceXmlSnippet,
              mathMl: token.mathMl,
              linear: token.linear,
              latex: token.linear,
              confidence: token.confidence,
              parserConfidenceTier: "medium",
              parserSignals: ["embedded-image-ocr"]
            }
          });
        }
      } else if (embeddedImages.length && (mathNodeCount > 0 || detectFormulaHeavyText(rawExtractedText))) {
        docxIssues.push("math-ocr-not-configured-for-embedded-images");
      }
    } catch {
      docxIssues.push("embedded-formula-image-ocr-failed");
    }

    if (mathNodeCount > 0) {
      docxIssues.push("docx-math-xml-detected");
      // If Word math XML exists but extracted text has weak math signals, force manual verification.
      if (extractedMathSignalCount < Math.max(2, Math.min(8, Math.floor(mathNodeCount / 2)))) {
        docxIssues.push("docx-formula-omitted-risk-needs-verification");
        docxRiskMarkers.push({
          type: "formula-loss-suspected",
          severity: "critical",
          label: "Formula loss suspected",
          excerpt: "Word formula regions were detected but are weak in extracted TXT output."
        });
      }
    }

    const markdown = htmlToMarkdown(sourceRenderHtml);

    let generatedPdfContentBase64 = "";
    try {
      generatedPdfContentBase64 = await buildGeneratedPdfArtifactBase64(
        htmlToPlainText(sourceRenderHtml) || extractedText,
        name
      );
    } catch {
      docxIssues.push("generated-pdf-artifact-failed");
    }

    return createExtractionResult({
      text: extractedText,
      markdown,
      sourcePreview,
      sourceMimeType: mimeType || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      sourceContentBase64: String(file?.contentBase64 || ""),
      sourceRenderHtml,
      generatedPdfContentBase64,
      method: "docx",
      minConfidence,
      issues: docxIssues,
      riskMarkers: docxRiskMarkers,
      verification
    });
  }

  if (LEGACY_WORD_EXTENSIONS.has(extension) || mimeType === "application/msword") {
    const text = await extractLegacyDocText(buffer);
    let generatedPdfContentBase64 = "";
    const legacyDocIssues = ["legacy-binary-format"];
    try {
      generatedPdfContentBase64 = await buildGeneratedPdfArtifactBase64(text, name);
    } catch {
      legacyDocIssues.push("generated-pdf-artifact-failed");
    }
    return createExtractionResult({
      text,
      markdown: plainTextToMarkdown(text),
      sourcePreview: text,
      sourceMimeType: mimeType || "application/msword",
      sourceContentBase64: String(file?.contentBase64 || ""),
      generatedPdfContentBase64,
      method: "doc-legacy",
      minConfidence,
      issues: legacyDocIssues
    });
  }

  if (extension === "pptx" || mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
    const text = await extractPptxText(buffer);
    let generatedPdfContentBase64 = "";
    const pptxIssues = [];
    const pptxRiskMarkers = [];

    try {
      const zip = await JSZip.loadAsync(buffer);
      const embeddedImages = await extractEmbeddedImagesFromZip(zip, "ppt/media/", 8);
      if (embeddedImages.length && MATH_OCR_APP_ID && MATH_OCR_APP_KEY) {
        const ocrFormulaTokens = await runEmbeddedMathOcr(embeddedImages, { maxImages: 4 });
        for (let index = 0; index < ocrFormulaTokens.length; index += 1) {
          const token = ocrFormulaTokens[index];
          pptxRiskMarkers.push({
            id: `PPT-IMG-R${index + 1}`,
            type: "formula-image-ocr",
            severity: "medium",
            label: `Slide formula image OCR ${index + 1}`,
            excerpt: token.linear,
            formula: {
              sourceXmlSnippet: token.sourceXmlSnippet,
              mathMl: token.mathMl,
              linear: token.linear,
              latex: token.linear,
              confidence: token.confidence,
              parserConfidenceTier: "medium",
              parserSignals: ["embedded-image-ocr"]
            }
          });
        }
      } else if (embeddedImages.length && detectFormulaHeavyText(text)) {
        pptxIssues.push("math-ocr-not-configured-for-embedded-images");
      }
    } catch {
      pptxIssues.push("embedded-formula-image-ocr-failed");
    }

    const slideBlocks = text.split(/\n\n+/).map((part) => cleanExtractedText(part)).filter(Boolean);
    const markdown = normalizeMarkdownSpacing(slideBlocks.map((block, index) => `## Slide ${index + 1}\n\n${block}`).join("\n\n"));

    try {
      generatedPdfContentBase64 = await buildGeneratedPdfArtifactBase64(text, name);
    } catch {
      pptxIssues.push("generated-pdf-artifact-failed");
    }
    return createExtractionResult({
      text,
      markdown,
      sourcePreview: text,
      sourceMimeType: mimeType || "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      sourceContentBase64: String(file?.contentBase64 || ""),
      generatedPdfContentBase64,
      method: "pptx",
      minConfidence,
      issues: pptxIssues,
      riskMarkers: pptxRiskMarkers
    });
  }

  if (LEGACY_POWERPOINT_EXTENSIONS.has(extension) || mimeType === "application/vnd.ms-powerpoint") {
    const text = await extractLegacyPptText(buffer);
    let generatedPdfContentBase64 = "";
    const legacyPptIssues = ["legacy-binary-format"];
    try {
      generatedPdfContentBase64 = await buildGeneratedPdfArtifactBase64(text, name);
    } catch {
      legacyPptIssues.push("generated-pdf-artifact-failed");
    }
    return createExtractionResult({
      text,
      markdown: plainTextToMarkdown(text),
      sourcePreview: text,
      sourceMimeType: mimeType || "application/vnd.ms-powerpoint",
      sourceContentBase64: String(file?.contentBase64 || ""),
      generatedPdfContentBase64,
      method: "ppt-legacy",
      minConfidence,
      issues: legacyPptIssues
    });
  }

  if (IMAGE_EXTENSIONS.has(extension) || mimeType.startsWith("image/")) {
    const { recognize } = await import("tesseract.js");

    const originalResult = await recognize(buffer, DEFAULT_OCR_LANGUAGES);
    const originalText = extractHighConfidenceText(originalResult?.data, DEFAULT_OCR_MIN_CONFIDENCE);
    const originalConfidence = estimateOcrConfidence(originalResult?.data);

    const preprocessedBuffer = await preprocessImageForOcr(buffer);
    const preprocessedResult = await recognize(preprocessedBuffer, DEFAULT_OCR_LANGUAGES);
    const preprocessedText = extractHighConfidenceText(preprocessedResult?.data, DEFAULT_OCR_MIN_CONFIDENCE);
    const preprocessedConfidence = estimateOcrConfidence(preprocessedResult?.data);

    const usePreprocessed = Number(preprocessedConfidence || 0) >= Number(originalConfidence || 0);
    const selectedText = usePreprocessed ? preprocessedText : originalText;
    const selectedConfidence = usePreprocessed ? preprocessedConfidence : originalConfidence;
    const selectedIssues = ["ocr-source"];
    if (usePreprocessed) selectedIssues.push("preprocessed-image");

    return createExtractionResult({
      text: selectedText,
      markdown: plainTextToMarkdown(selectedText),
      sourcePreview: selectedText,
      sourceMimeType: mimeType || `image/${extension || "png"}`,
      sourceContentBase64: String(file?.contentBase64 || ""),
      method: "ocr",
      ocrConfidence: selectedConfidence,
      issues: selectedIssues,
      minConfidence
    });
  }

  // Last-resort fallback for unknown formats.
  return createExtractionResult({
    text: buffer.toString("utf8"),
    markdown: plainTextToMarkdown(buffer.toString("utf8")),
    sourceMimeType: mimeType || "application/octet-stream",
    sourceContentBase64: String(file?.contentBase64 || ""),
    method: "fallback-binary",
    issues: ["unknown-format-fallback"],
    minConfidence
  });
}
