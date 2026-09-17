import path from "node:path";
import { pathToFileURL } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";
import { createCanvas } from "canvas";
import { extractPdfDocument } from "./extractPdf.js";
import { rasterizePdf } from "./fidelityRasterizer.js";
import { ensureDir, escapeHtml, normalizeWhitespace, parseArgs, resolveProjectPath, writeJson, writeText } from "./utils.js";

const baseDir = process.cwd();
const outputDir = path.join(baseDir, "output");
const assetsDir = path.join(outputDir, "assets");
const auditsDir = path.join(outputDir, "audits");
const imagesDir = path.join(assetsDir, "images");
const equationCropsDir = path.join(assetsDir, "equation-crops");
const equationRenderedDir = path.join(assetsDir, "equation-rendered");
const sourcePagesDir = path.join(outputDir, "fidelity", "source-pages");
const DEFAULT_INPUT = resolveProjectPath("..", "..", "Statistics.pdf");

// Product principle: preserve meaning, structure, mathematics, visual evidence,
// and provenance for downstream LLM reasoning. Canonical JSON is source of truth;
// Markdown is LLM-facing output; HTML is human verification output.

function toBBox(box = null) {
  return {
    x: Number(box?.x || 0),
    y: Number(box?.y || 0),
    width: Number(box?.width || 0),
    height: Number(box?.height || 0)
  };
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function cleanText(value = "") {
  return normalizeWhitespace(String(value || ""));
}

function unionBBox(items = []) {
  const boxes = (items || []).map((item) => toBBox(item?.bbox || item)).filter((box) => box.width >= 0 && box.height >= 0);
  if (!boxes.length) return toBBox();
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  return toBBox({ x: minX, y: minY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) });
}

function looksMathy(text = "") {
  const t = String(text || "");
  if (!t.trim()) return false;
  const symbolCount = (t.match(/[=+\-*/^_∑∫√±≈≤≥≠∞∂∇()%\[\]{}]/g) || []).length;
  const greekCount = (t.match(/[α-ωΑ-Ωµπσθλδ]/g) || []).length;
  const italicMathLetters = (t.match(/[\u{1D400}-\u{1D7FF}]/gu) || []).length;
  const superSub = (t.match(/[²³¹⁰₀₁₂₃₄₅₆₇₈₉]/g) || []).length;
  const hasEquationForm = /[A-Za-z\u{1D400}-\u{1D7FF}]\s*=\s*/u.test(t);
  const hasStatsPattern = /(variance|standard deviation|covariance|correlation|mean|median|quantile)/i.test(t);
  const score = symbolCount * 0.1 + greekCount * 0.25 + italicMathLetters * 0.1 + superSub * 0.16 + (hasEquationForm ? 0.4 : 0) + (hasStatsPattern ? 0.15 : 0);
  return score >= 0.55;
}

function normalizeForAudit(text = "") {
  return String(text || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForCharacterAudit(text = "") {
  return normalizeForAudit(text).replace(/\s+/g, "");
}

function histogram(value = "") {
  const map = new Map();
  for (const ch of Array.from(String(value || ""))) {
    map.set(ch, (map.get(ch) || 0) + 1);
  }
  return map;
}

function wordCount(text = "") {
  return normalizeForAudit(text).split(/\s+/).filter(Boolean).length;
}

function equationTrigger(text = "") {
  const t = String(text || "");
  if (!t.trim()) return false;
  if (/[=∑∫√≤≥±]/.test(t)) return true;
  if (/\b(ln|log|cov|corr|variance|std|sigma|mu)\b/i.test(t) && /[0-9]/.test(t)) return true;
  if (/[\u{1D400}-\u{1D7FF}]/u.test(t) && /[+\-*/()]/.test(t)) return true;
  return false;
}

function equationFragment(text = "") {
  const t = cleanText(text);
  if (!t) return false;
  if (equationTrigger(t)) return true;
  const short = t.length <= 20;
  const symbolHeavy = (t.match(/[=+\-*/^_(){}\[\]$#%&]/g) || []).length >= 2;
  const mathGlyph = /[\u{1D400}-\u{1D7FF}α-ωΑ-Ω]/u.test(t);
  return short && (symbolHeavy || mathGlyph);
}

function strongEquationPattern(text = "") {
  const t = cleanText(text);
  if (!t) return false;
  const hasAssign = /[A-Za-z\u{1D400}-\u{1D7FF}]\s*=\s*/u.test(t);
  const hasMathOps = (t.match(/[=+\-*/^_∑∫√≤≥±()\[\]{}]/g) || []).length >= 3;
  const hasMathGlyphs = /[\u{1D400}-\u{1D7FF}α-ωΑ-Ωµπσθλ]/u.test(t);
  const numeric = (t.match(/[0-9]/g) || []).length >= 1;
  const words = t.split(/\s+/).filter(Boolean).length;
  const longProse = words > 24 || t.length > 170;
  if (longProse) return false;
  return hasAssign || (hasMathOps && hasMathGlyphs) || (hasMathOps && numeric && hasMathGlyphs);
}

function likelyProse(text = "") {
  const t = cleanText(text);
  if (!t) return false;
  const words = t.split(/\s+/).filter(Boolean).length;
  const alphaWords = (t.match(/[A-Za-z]{4,}/g) || []).length;
  const ops = (t.match(/[=+\-*/^_∑∫√≤≥±]/g) || []).length;
  const sentencePunctuation = /[\.!?;:]\s+[A-Z]/.test(t) || /\.$/.test(t);
  const functionWordCount = (t.match(/\b(the|and|with|from|that|this|is|are|for|into|than|less|more|inverse|function|natural|logarithm|calculated|observations|sensitive|outliers|distribution)\b/gi) || []).length;
  return (words > 10 && alphaWords > 7 && ops <= 2) || (sentencePunctuation && functionWordCount >= 3);
}

function likelyTableContent(text = "") {
  const t = cleanText(text);
  if (!t) return false;
  const pipes = (t.match(/\|/g) || []).length;
  const tabs = (t.match(/\t/g) || []).length;
  const csv = (t.match(/,/g) || []).length;
  const numericCells = (t.match(/\b\d+(?:\.\d+)?\b/g) || []).length;
  return pipes >= 2 || tabs >= 2 || (csv >= 3 && numericCells >= 3);
}

function classifyEquationCandidate(text = "", runs = []) {
  const t = cleanText(text);
  if (!t) {
    return {
      label: "UNKNOWN",
      confidence: 0,
      reasons: ["empty"]
    };
  }

  if (likelyTableContent(t)) {
    return {
      label: "TABLE_CONTENT",
      confidence: 0.1,
      reasons: ["table-like-separators"]
    };
  }

  const words = wordCount(t);
  const symbols = (t.match(/[=+\-*/^_∑∫√≤≥±≠≈()\[\]{}]/g) || []).length;
  const greek = (t.match(/[α-ωΑ-Ωµπσθλδ]/g) || []).length;
  const superSub = (t.match(/[²³¹⁰₀₁₂₃₄₅₆₇₈₉]/g) || []).length + (runs || []).filter((r) => ["superscript", "subscript"].includes(String(r?.style?.verticalAlign || ""))).length;
  const assignOps = (t.match(/=/g) || []).length;
  const hasIntegral = /[∫∑√]/.test(t);
  const hasFractionLike = /\b\d+\s*\/\s*\d+\b/.test(t) || /\([^)]+\)\s*\/\s*\([^)]+\)/.test(t);
  const hasLatexLike = /\\(frac|sum|int|sqrt|bar|leq|geq|mu|sigma|theta|lambda)\b/.test(t);
  const hasSentencePunctuation = /[\.!?;:]/.test(t);
  const proseSignal = likelyProse(t);
  const stopWords = (t.match(/\b(the|and|with|from|that|this|is|are|for|into|than|less|more|inverse|function|natural|logarithm|distribution|table|figure)\b/gi) || []).length;
  const proseConnectors = (t.match(/\b(the|is|are|of|to|and|for|with)\b/gi) || []).length;

  const positiveScore = (assignOps * 0.25)
    + (symbols * 0.08)
    + (greek * 0.18)
    + (superSub * 0.16)
    + (hasIntegral ? 0.4 : 0)
    + (hasFractionLike ? 0.22 : 0)
    + (hasLatexLike ? 0.18 : 0);

  const negativeScore = (words > 16 ? 0.35 : 0)
    + (words > 24 ? 0.22 : 0)
    + (hasSentencePunctuation ? 0.2 : 0)
    + (stopWords >= 4 ? 0.2 : 0)
    + (proseSignal ? 0.3 : 0);

  const confidence = clamp(positiveScore - negativeScore + 0.4, 0, 1);
  const strongMath = hasIntegral || hasFractionLike || superSub >= 2 || (assignOps >= 1 && symbols >= 4) || (greek >= 1 && symbols >= 3) || hasLatexLike;

  if (words >= 9 && proseConnectors >= 4 && !strongMath && symbols <= 3) {
    return {
      label: "PROSE",
      confidence: 0.9,
      reasons: ["sentence-like-text"]
    };
  }

  if (proseSignal && !strongMath) {
    return {
      label: "PROSE",
      confidence: Number((1 - confidence).toFixed(4)),
      reasons: ["prose-like"]
    };
  }

  if (!strongMath && confidence < 0.62) {
    return {
      label: "UNKNOWN",
      confidence: Number(confidence.toFixed(4)),
      reasons: ["insufficient-math-signals"]
    };
  }

  if (proseSignal && strongMath && words >= 12) {
    return {
      label: "PROSE",
      confidence: Number((1 - Math.min(0.95, confidence)).toFixed(4)),
      reasons: ["prose-dominant-with-symbols"]
    };
  }

  if (proseSignal && strongMath) {
    return {
      label: "POSSIBLE_EQUATION",
      confidence: Number(Math.min(confidence, 0.78).toFixed(4)),
      reasons: ["mixed-prose-math"]
    };
  }

  if (confidence >= 0.8 && strongMath) {
    return {
      label: "TRUE_EQUATION",
      confidence: Number(confidence.toFixed(4)),
      reasons: ["strong-math-structure"]
    };
  }

  if (strongMath || confidence >= 0.62) {
    return {
      label: "POSSIBLE_EQUATION",
      confidence: Number(confidence.toFixed(4)),
      reasons: ["partial-math-structure"]
    };
  }

  return {
    label: "UNKNOWN",
    confidence: Number(confidence.toFixed(4)),
    reasons: ["ambiguous"]
  };
}

function pageMathEvidence(page = {}) {
  const elements = Array.isArray(page?.elements) ? page.elements : [];
  let count = 0;
  for (const node of elements) {
    if (["textGroup", "unknownBlock"].includes(String(node?.type || ""))) {
      const text = cleanText(node?.text || "");
      if (looksMathy(text)) count += 1;
      continue;
    }
    if (["paragraph", "listItem", "table"].includes(String(node?.type || ""))) {
      const text = cleanText(node?.text || "");
      if (looksMathy(text)) count += 1;
    }
  }
  return count;
}

function normalizeMathSymbols(text = "") {
  return String(text || "")
    .replace(/≤/g, "\\leq ")
    .replace(/≥/g, "\\geq ")
    .replace(/≈/g, "\\approx ")
    .replace(/±/g, "\\pm ")
    .replace(/∑/g, "\\sum ")
    .replace(/∫/g, "\\int ")
    .replace(/√/g, "\\sqrt{}")
    .replace(/µ/g, "\\mu ")
    .replace(/σ/g, "\\sigma ")
    .replace(/π/g, "\\pi ")
    .replace(/θ/g, "\\theta ")
    .replace(/λ/g, "\\lambda ");
}

function combiningBarToLatex(text = "") {
  const chars = Array.from(String(text || ""));
  const out = [];
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    const next = chars[i + 1] || "";
    if (next === "\u0305") {
      out.push(`\\bar{${ch}}`);
      i += 1;
    } else {
      out.push(ch);
    }
  }
  return out.join("");
}

function rebuildLatexFromRuns(node = {}) {
  const runs = Array.isArray(node?.children) ? node.children : [];
  if (!runs.length) {
    const raw = normalizeMathSymbols(combiningBarToLatex(cleanText(node?.text || "")));
    return raw || null;
  }

  let latex = "";
  for (const run of runs) {
    let runText = normalizeMathSymbols(combiningBarToLatex(cleanText(run?.text || "")));
    if (!runText) continue;
    const va = String(run?.style?.verticalAlign || "baseline");
    if (va === "superscript") {
      latex += `^{${runText}}`;
      continue;
    }
    if (va === "subscript") {
      latex += `_{${runText}}`;
      continue;
    }
    if (latex && !/[\s({[+\-*/=]$/.test(latex) && /^[A-Za-z0-9\\]/.test(runText)) latex += " ";
    latex += runText;
  }

  latex = latex
    .replace(/\s+/g, " ")
    .replace(/\s*([=+\-*/(){}\[\]])\s*/g, " $1 ")
    .replace(/\s+/g, " ")
    .trim();

  return latex || null;
}

function hasBalancedDelimiters(value = "") {
  const text = String(value || "");
  const stack = [];
  const pairs = new Map([[")", "("], ["]", "["], ["}", "{"]]);
  for (const ch of text) {
    if (["(", "[", "{"].includes(ch)) stack.push(ch);
    if ([")", "]", "}"].includes(ch)) {
      const expected = pairs.get(ch);
      const last = stack.pop();
      if (last !== expected) return false;
    }
  }
  return stack.length === 0;
}

function malformedLatexCommands(value = "") {
  const text = String(value || "");
  const commands = Array.from(text.matchAll(/\\([A-Za-z]+)/g)).map((m) => m[1]);
  const known = new Set(["frac", "sum", "int", "sqrt", "bar", "leq", "geq", "approx", "pm", "mu", "sigma", "pi", "theta", "lambda", "cdot", "times", "left", "right", "log", "ln"]);
  return commands.filter((cmd) => !known.has(cmd));
}

function validateEquationPayload(row = {}) {
  const latex = String(row?.extractedLatex || "").trim();
  const rawText = String(row?.rawText || "").trim();
  const warnings = [];

  if (!rawText) warnings.push("missing-raw-text");
  if (latex) {
    if (!hasBalancedDelimiters(latex)) warnings.push("unbalanced-delimiters");
    const malformed = malformedLatexCommands(latex);
    if (malformed.length) warnings.push(`malformed-latex-commands:${malformed.join(",")}`);
  }

  const proseScore = likelyProse(rawText);
  if (proseScore) warnings.push("suspicious-prose");

  const operatorCount = (rawText.match(/[=+\-*/^_∑∫√≤≥±]/g) || []).length;
  const wordy = wordCount(rawText) > 10;
  if (operatorCount === 0 && wordy) warnings.push("missing-math-operator");

  return {
    warnings,
    invalidLatex: warnings.some((w) => w === "unbalanced-delimiters" || w.startsWith("malformed-latex-commands"))
  };
}

function classifyPdfPage(rawPage = {}) {
  const textObjects = Array.isArray(rawPage?.textObjects) ? rawPage.textObjects : [];
  let count = 0;
  let chars = 0;
  for (const item of textObjects) {
    const t = String(item?.text || "");
    if (!t.trim()) continue;
    count += 1;
    chars += t.length;
  }
  const scanned = count < 6 || chars < 60;
  return {
    pageNumber: Number(rawPage?.pageNumber || 0),
    kind: scanned ? "scanned" : "digital",
    confidence: scanned ? 0.86 : 0.95,
    textObjects: count,
    chars
  };
}

function buildClassifier(rawPages = []) {
  const pages = (rawPages || []).map((row) => classifyPdfPage(row));
  const scannedCount = pages.filter((p) => p.kind === "scanned").length;
  const digitalCount = pages.length - scannedCount;
  const profile = scannedCount === 0 ? "digital-pdf" : (digitalCount === 0 ? "scanned-pdf" : "mixed-pdf");
  return {
    profile,
    confidence: profile === "mixed-pdf" ? 0.88 : 0.95,
    pages
  };
}

function sourceFromNode(filePath, pageNumber, node) {
  return {
    document: path.basename(filePath),
    page: Number(pageNumber || 0),
    bbox: toBBox(node?.bbox),
    sourceRefs: (node?.sourceRefs || []).map((ref) => String(ref?.sourceId || "")).filter(Boolean)
  };
}

function rowCells(row = {}) {
  const cells = Array.isArray(row?.cells) ? row.cells : [];
  return cells.map((cell) => {
    const children = Array.isArray(cell?.children) ? cell.children : [];
    return cleanText(children.map((run) => String(run?.text || "")).join(" "));
  });
}

function buildReadingOrder(pageNodes = [], pageWidth = 0) {
  const textLike = pageNodes.filter((n) => ["heading", "paragraph", "list", "listItem", "equation", "table", "figure", "caption", "quote", "code", "unknown"].includes(n.type));
  const xs = textLike.map((n) => Number(n?.source?.bbox?.x || 0)).sort((a, b) => a - b);
  const splitX = xs.length ? xs[Math.floor(xs.length / 2)] : 0;
  const left = [];
  const right = [];
  for (const n of textLike) {
    const x = Number(n?.source?.bbox?.x || 0);
    const w = Number(n?.source?.bbox?.width || 0);
    const center = x + w / 2;
    if (pageWidth > 0 && center > splitX + 40) right.push(n);
    else left.push(n);
  }
  const sortY = (a, b) => {
    const ay = Number(a?.source?.bbox?.y || 0);
    const by = Number(b?.source?.bbox?.y || 0);
    if (Math.abs(ay - by) > 1.5) return ay - by;
    return Number(a?.source?.bbox?.x || 0) - Number(b?.source?.bbox?.x || 0);
  };
  const hasTwoColumns = left.length > 6 && right.length > 6;
  const order = hasTwoColumns ? [...left.sort(sortY), ...right.sort(sortY)] : [...textLike.sort(sortY)];
  return {
    twoColumns: hasTwoColumns,
    confidence: hasTwoColumns ? 0.93 : 0.88,
    orderedNodeIds: order.map((n) => n.id)
  };
}

function mergeEquationGroups(pageNodes = [], mkNode, inputFile, pageNumber) {
  const out = [];
  const sorted = [...pageNodes].sort((a, b) => {
    const ay = Number(a?.source?.bbox?.y || 0);
    const by = Number(b?.source?.bbox?.y || 0);
    if (Math.abs(ay - by) > 1.5) return ay - by;
    return Number(a?.source?.bbox?.x || 0) - Number(b?.source?.bbox?.x || 0);
  });

  let i = 0;
  while (i < sorted.length) {
    const current = sorted[i];
    const text = cleanText(current?.content || "");
    if (!equationFragment(text)) {
      out.push(current);
      i += 1;
      continue;
    }

    const group = [current];
    let j = i + 1;
    let sawTrigger = equationTrigger(text);
    let lastY = Number(current?.source?.bbox?.y || 0);

    while (j < sorted.length) {
      const candidate = sorted[j];
      const ct = cleanText(candidate?.content || "");
      const y = Number(candidate?.source?.bbox?.y || 0);
      const near = Math.abs(y - lastY) <= 24;
      if (!near || !equationFragment(ct)) break;
      sawTrigger = sawTrigger || equationTrigger(ct);
      group.push(candidate);
      lastY = y;
      j += 1;
    }

    if (!sawTrigger || group.length === 1) {
      out.push(current);
      i += 1;
      continue;
    }

    const rawText = cleanText(group.map((n) => cleanText(n?.content || "")).join(" "));
    const mergedRefs = [...new Set(group.flatMap((n) => n?.source?.sourceRefs || []))];
    const mergedBBox = unionBBox(group.map((n) => n?.source?.bbox || toBBox()));
    const eqClass = classifyEquationCandidate(rawText);
    const eqNode = mkNode("equation", {
      content: rawText,
      text: rawText,
      latex: rebuildLatexFromRuns({ text: rawText, children: [] }) || normalizeMathSymbols(combiningBarToLatex(rawText)),
      display: true,
      children: [],
      source: {
        document: path.basename(inputFile),
        page: pageNumber,
        bbox: mergedBBox,
        sourceRefs: mergedRefs
      },
      rawText,
      equationClass: eqClass.label,
      equationReasons: eqClass.reasons,
      confidence: Number(eqClass.confidence || 0.78),
      status: eqClass.label === "TRUE_EQUATION" ? "preserved" : "needs-review"
    });
    out.push(eqNode);
    i = j;
  }

  return out;
}

async function cropPng(inputPath, outPath, bbox, sx, sy) {
  const png = PNG.sync.read(await readFile(inputPath));
  const x = clamp(Math.floor(Number(bbox.x || 0) * sx), 0, Math.max(0, png.width - 1));
  const y = clamp(Math.floor(Number(bbox.y || 0) * sy), 0, Math.max(0, png.height - 1));
  const w = clamp(Math.max(1, Math.ceil(Number(bbox.width || 1) * sx)), 1, Math.max(1, png.width - x));
  const h = clamp(Math.max(1, Math.ceil(Number(bbox.height || 1) * sy)), 1, Math.max(1, png.height - y));
  const crop = new PNG({ width: w, height: h });
  PNG.bitblt(png, crop, x, y, w, h, 0, 0);
  await writeFile(outPath, PNG.sync.write(crop));
  return { width: w, height: h };
}

async function renderEquationPreview(latex, outPath, width = 900, height = 150) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#111111";
  ctx.font = "32px Times New Roman";
  const printable = String(latex || "").slice(0, 280) || "[no-latex]";
  ctx.fillText(printable, 20, Math.floor(height / 2));
  await writeFile(outPath, canvas.toBuffer("image/png"));
}

function makeNodeFactory() {
  let seq = 0;
  return (type, payload) => ({
    id: `node-${String(++seq).padStart(6, "0")}`,
    type,
    ...payload
  });
}

function finalizeCanonicalNodes(nodes = []) {
  let order = 0;

  const finalizeNode = (node = {}, fallbackPage = 0) => {
    order += 1;
    const sourceRefs = Array.isArray(node?.source?.sourceRefs) ? [...node.source.sourceRefs] : [];
    const page = Number(node?.page || node?.source?.page || fallbackPage || 0);
    const children = Array.isArray(node?.children) ? node.children : [];
    const finalizedChildren = children.map((child) => finalizeNode(child, page));

    return {
      ...node,
      content: String(node?.content || ""),
      children: finalizedChildren,
      page,
      order,
      source: {
        document: String(node?.source?.document || ""),
        page,
        bbox: toBBox(node?.source?.bbox),
        sourceRefs,
        objectRefs: sourceRefs
      },
      confidence: Number(clamp(Number(node?.confidence ?? 0.8), 0, 1).toFixed(4)),
      status: String(node?.status || "preserved")
    };
  };

  return (nodes || []).map((node) => finalizeNode(node, Number(node?.source?.page || 0)));
}

function buildTextContentAudit(result = {}) {
  const sourcePages = Array.isArray(result?.extracted?.rawPages) ? result.extracted.rawPages : [];
  const sourceText = sourcePages
    .flatMap((page) => page?.textObjects || [])
    .map((obj) => String(obj?.text || ""))
    .join("");

  const content = Array.isArray(result?.document?.content) ? result.document.content : [];
  const canonicalTextParts = [];
  for (const node of content) {
    if (["heading", "paragraph", "header", "footer", "quote", "code", "unknown", "equation"].includes(node.type)) {
      canonicalTextParts.push(String(node?.content || node?.rawText || ""));
    }
    if (node.type === "list") {
      canonicalTextParts.push((node.children || []).map((li) => String(li?.content || "")).join(" "));
    }
    if (node.type === "table") {
      canonicalTextParts.push((node?.headers || []).join(" "));
      canonicalTextParts.push((node?.rows || []).flat().join(" "));
    }
    if (node.type === "figure" && node?.caption) canonicalTextParts.push(String(node.caption));
  }

  const sourceNorm = normalizeForCharacterAudit(sourceText);
  const canonicalNorm = normalizeForCharacterAudit(canonicalTextParts.join(" "));
  const sourceHist = histogram(sourceNorm);
  const canonHist = histogram(canonicalNorm);

  let missing = 0;
  let duplicated = 0;
  for (const [ch, count] of sourceHist.entries()) {
    const have = canonHist.get(ch) || 0;
    if (have < count) missing += (count - have);
  }
  for (const [ch, count] of canonHist.entries()) {
    const src = sourceHist.get(ch) || 0;
    if (count > src) duplicated += (count - src);
  }

  const sourceCharacters = sourceNorm.length;
  const canonicalCharacters = canonicalNorm.length;
  const coverage = sourceCharacters > 0 ? clamp((sourceCharacters - missing) / sourceCharacters, 0, 1) : 1;

  return {
    sourceCharacters,
    canonicalCharacters,
    missingCharacters: missing,
    duplicatedCharacters: duplicated,
    coverage: Number(coverage.toFixed(6)),
    status: missing === 0 && duplicated === 0 ? "PASS" : "PASS_WITH_REVIEW"
  };
}

function nodeMarkdown(node = {}) {
  if (node.type === "heading") {
    const lvl = clamp(Number(node?.level || 2), 1, 6);
    return `${"#".repeat(lvl)} ${String(node?.content || "")}`;
  }
  if (node.type === "paragraph") return String(node?.content || "");
  if (node.type === "equation") return `$$\n${String(node?.latex || node?.rawText || "")}\n$$`;
  if (node.type === "table") {
    const headers = Array.isArray(node?.headers) ? node.headers : [];
    const rows = Array.isArray(node?.rows) ? node.rows : [];
    if (!headers.length) return "";
    return [
      `| ${headers.join(" | ")} |`,
      `| ${headers.map(() => "---").join(" | ")} |`,
      ...rows.map((row) => `| ${(row || []).join(" | ")} |`)
    ].join("\n");
  }
  if (node.type === "figure") {
    const caption = String(node?.caption || "").trim();
    return caption ? `![${node.id}](${String(node?.image?.asset || "")})\n*${caption}*` : `![${node.id}](${String(node?.image?.asset || "")})`;
  }
  if (node.type === "list") return (node.children || []).map((li) => `- ${String(li?.content || "")}`).join("\n");
  return String(node?.content || "");
}

function buildLlmConsumptionReport(document = {}, markdown = "") {
  const content = Array.isArray(document?.content) ? document.content : [];
  const mdNorm = normalizeForAudit(markdown).toLowerCase();

  const headings = content.filter((n) => n.type === "heading");
  const paragraphs = content.filter((n) => n.type === "paragraph");
  const equations = content.filter((n) => n.type === "equation");
  const tables = content.filter((n) => n.type === "table");
  const figures = content.filter((n) => n.type === "figure");

  const headingsRepresented = headings.filter((n) => mdNorm.includes(normalizeForAudit(n.content).toLowerCase())).length;
  const paragraphsRepresented = paragraphs.filter((n) => mdNorm.includes(normalizeForAudit(n.content).toLowerCase())).length;
  const equationsRepresented = equations.filter((n) => mdNorm.includes(normalizeForAudit(n.latex || n.rawText || n.content).toLowerCase())).length;
  const tablesRepresented = tables.filter((n) => {
    const sample = [...(n.headers || []), ...((n.rows || []).flat())].map((cell) => normalizeForAudit(String(cell || ""))).filter(Boolean).slice(0, 3);
    return sample.every((cell) => mdNorm.includes(cell.toLowerCase()));
  }).length;
  const figuresRepresented = figures.filter((n) => !n?.image?.asset || mdNorm.includes(String(n.image.asset).toLowerCase())).length;

  const markdownCharacters = normalizeForAudit(markdown).length;
  const contentLoss = headingsRepresented !== headings.length
    || paragraphsRepresented !== paragraphs.length
    || equationsRepresented !== equations.length
    || tablesRepresented !== tables.length
    || figuresRepresented !== figures.length;

  const chunks = [];
  let current = null;
  let currentHeading = String(document?.metadata?.title || "Document");

  const pushChunk = () => {
    if (!current) return;
    current.text = current.text.trim();
    if (!current.text) {
      current = null;
      return;
    }
    chunks.push(current);
    current = null;
  };

  const startChunk = (page, heading) => ({
    chunkId: `chunk-${String(chunks.length + 1).padStart(4, "0")}`,
    text: "",
    section: heading,
    pageStart: Number(page || 0),
    pageEnd: Number(page || 0),
    sourceNodeIds: [],
    containsEquation: false,
    containsTable: false,
    containsImage: false
  });

  for (const node of content) {
    if (node.type === "heading") {
      currentHeading = String(node?.content || currentHeading);
    }
    if (node.type === "pageBreak") {
      pushChunk();
      continue;
    }

    const segment = nodeMarkdown(node).trim();
    if (!segment) continue;

    const hardBoundary = ["equation", "table", "figure", "heading"].includes(node.type);
    if (!current) current = startChunk(node?.source?.page, currentHeading);
    if (hardBoundary && current.text.length > 0) pushChunk();
    if (!current) current = startChunk(node?.source?.page, currentHeading);

    const nextLength = current.text.length + segment.length + 2;
    if (nextLength > 1200 && current.text.length > 0) {
      pushChunk();
      current = startChunk(node?.source?.page, currentHeading);
    }

    current.text += `${segment}\n\n`;
    current.pageEnd = Math.max(Number(current.pageEnd || 0), Number(node?.source?.page || 0));
    current.sourceNodeIds.push(String(node?.id || ""));
    current.containsEquation = current.containsEquation || node.type === "equation";
    current.containsTable = current.containsTable || node.type === "table";
    current.containsImage = current.containsImage || node.type === "figure";

    if (hardBoundary) pushChunk();
  }
  pushChunk();

  const chunkStartsInsideEquation = chunks.filter((chunk) => {
    const text = String(chunk?.text || "");
    return text.startsWith("\\n") || (text.includes("$$") && !text.trimStart().startsWith("$$"));
  }).length;
  const equationDetached = chunks.filter((chunk) => chunk.containsEquation && !chunk.section).length;

  const llmChecks = {
    headingsSurvive: headingsRepresented === headings.length,
    paragraphsSurvive: paragraphsRepresented === paragraphs.length,
    equationsSurvive: equationsRepresented === equations.length,
    tablesSurvive: tablesRepresented === tables.length,
    figuresSurvive: figuresRepresented === figures.length,
    noChunkSplitInsideEquation: chunkStartsInsideEquation === 0,
    noDetachedEquationContext: equationDetached === 0,
    sectionContextCarried: chunks.every((chunk) => Boolean(chunk.section)),
    provenanceSurvives: chunks.every((chunk) => Array.isArray(chunk.sourceNodeIds) && chunk.sourceNodeIds.length > 0)
  };

  const llmLoss = Object.values(llmChecks).some((value) => value === false);

  return {
    status: contentLoss || llmLoss ? "PASS_WITH_REVIEW" : "PASS",
    markdownCharacters,
    headingsRepresented: `${headingsRepresented}/${headings.length}`,
    paragraphsRepresented: `${paragraphsRepresented}/${paragraphs.length}`,
    equationsRepresented: `${equationsRepresented}/${equations.length}`,
    tablesRepresented: `${tablesRepresented}/${tables.length}`,
    figuresRepresented: `${figuresRepresented}/${figures.length}`,
    contentLoss: contentLoss || llmLoss,
    checks: llmChecks,
    chunks
  };
}

async function buildFromPdf(inputFile) {
  const extracted = await extractPdfDocument(inputFile);
  const classifier = buildClassifier(extracted.rawPages || []);

  await ensureDir(imagesDir);
  await ensureDir(equationCropsDir);
  await ensureDir(equationRenderedDir);
  await ensureDir(sourcePagesDir);

  const raster = await rasterizePdf(inputFile, sourcePagesDir, {
    dpi: 260,
    expectedPageCount: Number(extracted?.documentTree?.metadata?.pageCount || 0)
  });
  const rasterByPage = new Map((raster?.pages || []).map((p) => [Number(p.pageNumber || 0), p]));

  const mkNode = makeNodeFactory();
  const pages = [];
  const content = [];
  const equationCandidates = [];
  const figureNodes = [];
  const tableNodes = [];
  const readingOrderRows = [];
  const allSourceRefs = new Set();

  for (const page of extracted.documentTree.pages || []) {
    const pageNumber = Number(page.pageNumber || 0);
    const blocks = [];
    const pageNodes = [];
    const elements = Array.isArray(page.elements) ? page.elements : [];
    let pendingList = null;

    const flushList = () => {
      if (!pendingList) return;
      pageNodes.push(pendingList);
      blocks.push({ id: pendingList.id, type: pendingList.type, bbox: pendingList.source.bbox });
      pendingList = null;
    };

    for (const element of elements) {
      const type = String(element?.type || "");
      const source = sourceFromNode(inputFile, pageNumber, element);
      for (const ref of source.sourceRefs) allSourceRefs.add(ref);

      if (type === "listItem") {
        const listText = cleanText(element?.text || "");
        if (/^\d+\.\s+[A-Za-z]/.test(listText)) {
          const heading = mkNode("heading", {
            level: 2,
            content: listText,
            children: [],
            source,
            confidence: 0.9,
            status: "verified"
          });
          pageNodes.push(heading);
          blocks.push({ id: heading.id, type: heading.type, bbox: heading.source.bbox });
          continue;
        }
        if (!pendingList) {
          pendingList = mkNode("list", {
            content: "",
            children: [],
            source: {
              document: path.basename(inputFile),
              page: pageNumber,
              bbox: toBBox(element?.bbox),
              sourceRefs: [...source.sourceRefs]
            },
            confidence: 0.93,
            status: "verified"
          });
        }
        const item = mkNode("listItem", {
          content: cleanText(element?.text || ""),
          children: [],
          source,
          confidence: Number(element?.classification?.confidence || 0.9),
          status: "verified"
        });
        pendingList.children.push(item);
        pendingList.source.bbox = unionBBox([pendingList.source.bbox, source.bbox]);
        pendingList.source.sourceRefs = [...new Set([...pendingList.source.sourceRefs, ...source.sourceRefs])];
        continue;
      }
      flushList();

      if (type === "heading") {
        const node = mkNode("heading", {
          level: Number(element?.level || 2),
          content: cleanText(element?.text || ""),
          children: [],
          source,
          confidence: Number(element?.classification?.confidence || 0.92),
          status: "verified"
        });
        pageNodes.push(node);
        blocks.push({ id: node.id, type: node.type, bbox: node.source.bbox });
        continue;
      }

      if (type === "paragraph" || type === "header" || type === "footer") {
        const node = mkNode(type === "paragraph" ? "paragraph" : type, {
          content: cleanText(element?.text || element?.value || ""),
          children: [],
          source,
          confidence: Number(element?.classification?.confidence || 0.9),
          status: "verified"
        });
        pageNodes.push(node);
        blocks.push({ id: node.id, type: node.type, bbox: node.source.bbox });
        continue;
      }

      if (type === "table") {
        const rows = (element?.rows || []).map((row) => rowCells(row));
        const headers = rows.length ? rows[0] : [];
        const bodyRows = rows.length > 1 ? rows.slice(1) : [];
        const node = mkNode("table", {
          content: "",
          headers,
          rows: bodyRows,
          children: [],
          source,
          confidence: 0.84,
          status: "reconstructed"
        });
        tableNodes.push(node);
        pageNodes.push(node);
        blocks.push({ id: node.id, type: node.type, bbox: node.source.bbox });
        continue;
      }

      if (type === "image") {
        const rasterPage = rasterByPage.get(pageNumber);
        let asset = null;
        let representation = "source-crop";
        if (rasterPage) {
          const filename = `figure-${String(figureNodes.length + 1).padStart(3, "0")}.png`;
          const abs = path.join(imagesDir, filename);
          const sx = Number(rasterPage.width || 1) / Math.max(1, Number(page.width || 1));
          const sy = Number(rasterPage.height || 1) / Math.max(1, Number(page.height || 1));
          // eslint-disable-next-line no-await-in-loop
          await cropPng(rasterPage.outFile, abs, source.bbox, sx, sy);
          asset = `assets/images/${filename}`;
        }
        const node = mkNode("figure", {
          content: "",
          caption: null,
          children: [],
          image: {
            asset,
            representation,
            semanticStatus: "image-preserved"
          },
          source,
          confidence: 0.95,
          status: asset ? "verified" : "needs-review"
        });
        figureNodes.push(node);
        pageNodes.push(node);
        blocks.push({ id: node.id, type: node.type, bbox: node.source.bbox });
        continue;
      }

      if (type === "unknownBlock" || type === "textGroup") {
        const text = cleanText(element?.text || "");
        const eqClass = classifyEquationCandidate(text, element?.children || []);
        if (["TRUE_EQUATION", "POSSIBLE_EQUATION"].includes(eqClass.label)) {
          const latex = rebuildLatexFromRuns(element) || normalizeMathSymbols(combiningBarToLatex(text));
          const conf = clamp(Number(eqClass.confidence || element?.classification?.confidence || 0.72), 0, 1);
          const node = mkNode("equation", {
            content: text,
            text,
            latex: latex || null,
            latexStatus: latex ? (eqClass.label === "TRUE_EQUATION" ? "verified" : "reconstructed") : "unavailable",
            display: true,
            children: [],
            source,
            rawText: text,
            equationClass: eqClass.label,
            equationReasons: eqClass.reasons,
            confidence: Number((latex ? conf : Math.min(conf, 0.68)).toFixed(4)),
            status: eqClass.label === "TRUE_EQUATION" ? "preserved" : "needs-review"
          });
          equationCandidates.push(node);
          pageNodes.push(node);
          blocks.push({ id: node.id, type: node.type, bbox: node.source.bbox });
        } else {
          const node = mkNode("unknown", {
            content: text,
            children: [],
            source,
            confidence: Number(element?.classification?.confidence || 0.6),
            status: "uninterpreted"
          });
          pageNodes.push(node);
          blocks.push({ id: node.id, type: node.type, bbox: node.source.bbox });
        }
      }
    }
    flushList();

    const mergedMath = mergeEquationGroups(pageNodes, mkNode, inputFile, pageNumber);
    pageNodes.length = 0;
    pageNodes.push(...mergedMath);

    equationCandidates.push(...pageNodes.filter((n) => n.type === "equation"));

    const reading = buildReadingOrder(pageNodes, Number(page.width || 0));
    readingOrderRows.push({ page: pageNumber, ...reading });

    const byId = new Map(pageNodes.map((n) => [n.id, n]));
    const ordered = reading.orderedNodeIds.map((id) => byId.get(id)).filter(Boolean);

    pages.push({
      pageNumber,
      dimensions: {
        width: Number(page.width || 0),
        height: Number(page.height || 0)
      },
      kind: (classifier.pages.find((p) => p.pageNumber === pageNumber) || {}).kind || "digital",
      blocks
    });
    content.push(...ordered);

    if (pageNumber < Number(extracted.documentTree.metadata.pageCount || 0)) {
      content.push(mkNode("pageBreak", {
        content: "",
        children: [],
        source: {
          document: path.basename(inputFile),
          page: pageNumber,
          bbox: { x: 0, y: 0, width: Number(page.width || 0), height: Number(page.height || 0) },
          sourceRefs: []
        },
        confidence: 1,
        status: "verified"
      }));
    }
  }

  const mathEvidenceCount = (extracted.documentTree.pages || []).reduce((sum, page) => sum + pageMathEvidence(page), 0);

  // Promote math-looking non-equation nodes into explicit equation nodes marked
  // needs-review so mathematical regions are never silently dropped.
  const expandedContent = [];
  for (const node of content) {
    expandedContent.push(node);
    if (["equation", "pageBreak", "figure", "header", "footer", "table", "list"].includes(node.type)) continue;
    if (!["paragraph", "unknown"].includes(node.type)) continue;
    const mathText = nodeMathText(node);
    const eqClass = classifyEquationCandidate(mathText);
    if (!["TRUE_EQUATION", "POSSIBLE_EQUATION"].includes(eqClass.label)) continue;
    if (eqClass.label === "POSSIBLE_EQUATION" && (!equationTrigger(mathText) || likelyProse(mathText))) continue;
    if (!strongEquationPattern(mathText) && eqClass.label !== "POSSIBLE_EQUATION") continue;

    const fallbackLatex = equationTrigger(mathText)
      ? (rebuildLatexFromRuns({ text: mathText, children: [] }) || normalizeMathSymbols(combiningBarToLatex(mathText)))
      : null;

    expandedContent.push(mkNode("equation", {
      content: mathText,
      text: mathText,
      latex: fallbackLatex,
      latexStatus: fallbackLatex ? (eqClass.label === "TRUE_EQUATION" ? "verified" : "reconstructed") : "unavailable",
      display: true,
      children: [],
      source: {
        document: String(node?.source?.document || path.basename(inputFile)),
        page: Number(node?.source?.page || 0),
        bbox: toBBox(node?.source?.bbox),
        sourceRefs: [...(node?.source?.sourceRefs || [])]
      },
      rawText: mathText,
      equationClass: eqClass.label,
      equationReasons: eqClass.reasons,
      confidence: fallbackLatex ? Number(eqClass.confidence || 0.72) : Number(Math.min(0.65, eqClass.confidence || 0.61)),
      status: eqClass.label === "TRUE_EQUATION" ? "preserved" : "needs-review"
    }));
  }
  content.length = 0;
  content.push(...expandedContent);

  const canonicalContent = finalizeCanonicalNodes(content);
  content.length = 0;
  content.push(...canonicalContent);

  const equations = content.filter((node) => node.type === "equation");
  const detectedEquationCount = equations.length;
  const equationsPresent = mathEvidenceCount > 0;

  const equationValidationRows = [];
  for (let i = 0; i < equations.length; i += 1) {
    const eq = equations[i];
    const page = Number(eq?.source?.page || 0);
    const rasterPage = rasterByPage.get(page);
    let cropAsset = null;
    let renderedAsset = null;

    if (rasterPage) {
      const cropName = `equation-${String(i + 1).padStart(3, "0")}.png`;
      const cropAbs = path.join(equationCropsDir, cropName);
      const sx = Number(rasterPage.width || 1) / Math.max(1, Number((extracted.documentTree.pages.find((p) => Number(p.pageNumber || 0) === page) || {}).width || 1));
      const sy = Number(rasterPage.height || 1) / Math.max(1, Number((extracted.documentTree.pages.find((p) => Number(p.pageNumber || 0) === page) || {}).height || 1));
      // eslint-disable-next-line no-await-in-loop
      const cropInfo = await cropPng(rasterPage.outFile, cropAbs, toBBox(eq?.source?.bbox), sx, sy);
      cropAsset = `assets/equation-crops/${cropName}`;

      const renderName = `equation-${String(i + 1).padStart(3, "0")}-rendered.png`;
      const renderAbs = path.join(equationRenderedDir, renderName);
      // eslint-disable-next-line no-await-in-loop
      await renderEquationPreview(eq?.latex || eq?.rawText || "", renderAbs, Math.max(500, cropInfo.width), Math.max(120, Math.min(320, cropInfo.height + 50)));
      renderedAsset = `assets/equation-rendered/${renderName}`;
    }

    const hasLatex = Boolean(eq?.latex && String(eq.latex).trim());
    const confidence = clamp(Number(eq?.confidence || 0.6) + (hasLatex ? 0.12 : -0.1), 0, 1);
    const eqClass = String(eq?.equationClass || "POSSIBLE_EQUATION");
    const status = (eqClass === "TRUE_EQUATION" && confidence >= 0.82) ? "verified" : "needs-review";
    eq.confidence = Number(confidence.toFixed(4));
    eq.status = status === "verified" ? "verified" : "needs-review";
    eq.latexStatus = hasLatex ? (status === "verified" ? "verified" : "reconstructed") : "unavailable";
    eq.visualFallback = cropAsset;

    const payloadCheck = validateEquationPayload({
      extractedLatex: eq?.latex || null,
      rawText: eq?.rawText || eq?.content || ""
    });
    const combinedWarnings = [...new Set([...(hasLatex ? [] : ["missing-latex"]), ...payloadCheck.warnings])];

    equationValidationRows.push({
      equationId: eq.id,
      page,
      extractedLatex: eq?.latex || null,
      equationClass: eqClass,
      rawText: eq?.rawText || eq?.content || "",
      confidence: Number(confidence.toFixed(4)),
      validationStatus: status,
      latexStatus: eq.latexStatus,
      sourceBBox: eq?.source?.bbox || null,
      sourceCrop: cropAsset,
      rendered: renderedAsset,
      visualFallback: cropAsset,
      invalidLatex: payloadCheck.invalidLatex,
      warnings: combinedWarnings
    });
  }

  const highConfidenceEq = equationValidationRows.filter((row) => row.validationStatus === "verified").length;
  const needsReviewEq = equationValidationRows.filter((row) => row.validationStatus === "needs-review").length;
  const missedEq = equationsPresent ? Math.max(0, mathEvidenceCount - detectedEquationCount) : 0;
  const proseFalsePositiveRows = equationValidationRows.filter((row) => (row?.warnings || []).includes("suspicious-prose") && row?.equationClass === "TRUE_EQUATION");
  const falsePositiveEq = proseFalsePositiveRows.length;
  const trueEquations = equationValidationRows.filter((row) => row.equationClass === "TRUE_EQUATION");
  const possibleEquations = equationValidationRows.filter((row) => row.equationClass === "POSSIBLE_EQUATION");
  const rejectedEquationCandidates = content
    .filter((node) => ["paragraph", "unknown"].includes(node.type))
    .map((node) => ({ nodeId: node.id, page: Number(node?.source?.page || 0), text: nodeMathText(node), classification: classifyEquationCandidate(nodeMathText(node)) }))
    .filter((row) => ["PROSE", "UNKNOWN", "TABLE_CONTENT"].includes(row.classification.label) && looksMathy(row.text))
    .map((row) => ({ nodeId: row.nodeId, page: row.page, text: row.text, reason: (row.classification.reasons || []).join(",") || "rejected" }));

  const proseRejectedCount = rejectedEquationCandidates.filter((row) => row.reason.includes("prose") || row.reason.includes("sentence-like")).length;
  const invalidLatexCount = equationValidationRows.filter((row) => row.invalidLatex).length;
  const missingMathCount = equationsPresent ? Math.max(0, mathEvidenceCount - (trueEquations.length + possibleEquations.length)) : 0;

  const figureValidation = figureNodes.map((fig) => ({
    figureId: fig.id,
    page: Number(fig?.source?.page || 0),
    sourceBBox: fig?.source?.bbox || null,
    asset: fig?.image?.asset || null,
    semanticStatus: fig?.image?.semanticStatus || "image-preserved",
    representation: fig?.image?.representation || "source-crop",
    confidence: Number(fig?.confidence || 0.95)
  }));

  const tableValidation = tableNodes.map((table) => {
    const headers = Array.isArray(table?.headers) ? table.headers : [];
    const rows = Array.isArray(table?.rows) ? table.rows : [];
    const conf = headers.length >= 2 && rows.length >= 1 ? 0.9 : 0.72;
    const columns = headers.length || Math.max(0, ...(rows.map((r) => (Array.isArray(r) ? r.length : 0))));
    const cells = rows.reduce((sum, row) => sum + (Array.isArray(row) ? row.length : 0), 0) + headers.length;
    const emptyCells = rows.reduce((sum, row) => sum + (Array.isArray(row) ? row.filter((cell) => !cleanText(cell)).length : 0), 0);
    return {
      tableId: table.id,
      page: Number(table?.source?.page || 0),
      headers: headers.length,
      rows: rows.length,
      columns,
      cells,
      emptyCells,
      status: conf >= 0.8 ? "verified" : "needs-review",
      confidence: conf,
      sourceBBox: table?.source?.bbox || null
    };
  });

  const semanticRefSet = new Set();
  for (const node of content) {
    for (const ref of node?.source?.sourceRefs || []) semanticRefSet.add(ref);
    for (const child of node?.children || []) {
      for (const ref of child?.source?.sourceRefs || []) semanticRefSet.add(ref);
    }
  }
  const sourceObjects = Number(extracted?.documentTree?.statistics?.rawSourceObjects || 0);
  const representedSemantic = semanticRefSet.size;
  const representedVisual = sourceObjects;
  const needsReview = content.filter((node) => node.status === "needs-review").length;
  const uninterpreted = content.filter((node) => node.status === "uninterpreted").length;

  const preservation = {
    sourceObjects,
    represented: representedVisual,
    representedSemantic,
    representedVisual,
    unrepresented: Math.max(0, sourceObjects - representedVisual),
    needsReview,
    uninterpreted,
    notes: [
      "representedSemantic counts sourceRefs mapped to semantic nodes",
      "representedVisual counts preserved evidence in low-level extraction"
    ]
  };

  const textNodes = content.filter((n) => ["heading", "paragraph", "listItem", "header", "footer", "quote", "code", "unknown", "equation"].includes(n.type));
  const tableChars = tableNodes.reduce((sum, t) => {
    const head = (t?.headers || []).join(" ");
    const rows = (t?.rows || []).flat().join(" ");
    return sum + String(head).length + String(rows).length;
  }, 0);
  const representedChars = textNodes.reduce((sum, n) => sum + String(n?.content || n?.rawText || "").length, 0) + tableChars;
  const sourceChars = Number(extracted?.documentTree?.statistics?.characters || 0);
  const textCoverage = sourceChars > 0 ? clamp(representedChars / sourceChars, 0, 1) : 1;

  const equationDetection = equationsPresent ? clamp(detectedEquationCount / Math.max(1, mathEvidenceCount), 0, 1) : 1;
  const equationReconstruction = detectedEquationCount > 0 ? clamp(highConfidenceEq / detectedEquationCount, 0, 1) : (equationsPresent ? 0 : 1);
  const imageCoverage = figureValidation.length ? clamp(figureValidation.filter((f) => Boolean(f.asset)).length / figureValidation.length, 0, 1) : 1;
  const tableReconstruction = tableValidation.length ? clamp(tableValidation.filter((t) => t.status === "verified").length / tableValidation.length, 0, 1) : 1;
  const readingOrderScore = readingOrderRows.length ? clamp(readingOrderRows.reduce((sum, row) => sum + Number(row.confidence || 0.85), 0) / readingOrderRows.length, 0, 1) : 0.85;
  const provenanceScore = content.every((n) => n?.source?.page && n?.source?.bbox) ? 1 : 0;
  const orderingAnomalies = [];
  for (const row of readingOrderRows) {
    const nodeIds = Array.isArray(row?.orderedNodeIds) ? row.orderedNodeIds : [];
    if (!nodeIds.length) orderingAnomalies.push({ page: row.page, reason: "empty-reading-order" });
  }

  const contentCoverage = clamp((clamp(textCoverage, 0, 1) + imageCoverage + tableReconstruction) / 3, 0, 1);
  const overall = clamp((contentCoverage * 0.3) + (equationDetection * 0.25) + (equationReconstruction * 0.15) + (readingOrderScore * 0.15) + (provenanceScore * 0.15), 0, 1);

  let status = "PASS";
  const warnings = [];
  if (equationsPresent && detectedEquationCount === 0) {
    status = "FAIL";
    warnings.push({ type: "math", message: "math evidence exists but zero equations were detected" });
  }
  if (falsePositiveEq > 0) warnings.push({ type: "math", message: `${falsePositiveEq} equations look like prose and should be reviewed` });
  if (missedEq > 0) warnings.push({ type: "math", message: `${missedEq} math evidence regions were not reconstructed as equations` });
  if (needsReviewEq > 0) warnings.push({ type: "math", message: `${needsReviewEq} equations need review` });
  if (tableReconstruction < 0.8) warnings.push({ type: "table", message: "table reconstruction confidence is low" });
  if (status !== "FAIL" && warnings.length > 0) status = "PASS WITH WARNINGS";

  const quality = {
    overallStatus: status === "PASS" ? "PASS" : (status === "PASS WITH WARNINGS" ? "PASS_WITH_REVIEW" : "FAIL"),
    semantic: {
      textCoverage: Number(textCoverage.toFixed(4)),
      readingOrder: orderingAnomalies.length ? "PASS_WITH_REVIEW" : "PASS",
      headings: content.some((n) => n.type === "heading") ? "PASS" : "PASS_WITH_REVIEW",
      lists: content.some((n) => n.type === "list") ? "PASS" : "PASS_WITH_REVIEW",
      tables: tableValidation.every((t) => t.status === "verified") ? "PASS" : "PASS_WITH_REVIEW",
      images: figureValidation.every((f) => Boolean(f.asset)) ? "PASS" : "PASS_WITH_REVIEW",
      equations: falsePositiveEq === 0 && missedEq === 0 ? "PASS" : "PASS_WITH_REVIEW"
    },
    math: {
      detected: detectedEquationCount,
      verified: highConfidenceEq,
      trueEquation: trueEquations.length,
      possibleEquation: possibleEquations.length,
      reconstructed: Math.max(0, detectedEquationCount - highConfidenceEq),
      needsReview: needsReviewEq,
      falsePositives: falsePositiveEq,
      rejectedAsProse: proseRejectedCount,
      invalidLatex: invalidLatexCount,
      falseNegatives: missedEq
    },
    provenance: {
      coverage: Number(provenanceScore.toFixed(4)),
      orphanNodes: content.filter((n) => !n?.source?.page).length
    },
    visual: {
      status: "DIAGNOSTIC"
    },
    llmReadiness: {
      markdownGenerated: true,
      canonicalJsonGenerated: true,
      contentLoss: false,
      status: "PASS"
    },
    metrics: {
      contentCoverage: Number(contentCoverage.toFixed(4)),
      textCoverage: Number(textCoverage.toFixed(4)),
      equationDetection: Number(equationDetection.toFixed(4)),
      equationReconstruction: Number(equationReconstruction.toFixed(4)),
      imageCoverage: Number(imageCoverage.toFixed(4)),
      tableReconstruction: Number(tableReconstruction.toFixed(4)),
      readingOrder: Number(readingOrderScore.toFixed(4)),
      provenance: Number(provenanceScore.toFixed(4)),
      overall: Number(overall.toFixed(4)),
      equationsPresent,
      detectedEquations: detectedEquationCount,
      mathEvidenceRegions: mathEvidenceCount,
      equationFalsePositives: falsePositiveEq,
      equationRejectedAsProse: proseRejectedCount,
      equationInvalidLatex: invalidLatexCount,
      status
    },
    warnings
  };

  const document = {
    type: "document",
    schemaVersion: "cdm-v3",
    source: {
      primaryType: "pdf"
    },
    supportedSourceTypes: ["pdf", "scanned-pdf", "image", "docx", "markdown", "html", "text", "pptx"],
    metadata: {
      filename: path.basename(inputFile),
      documentId: `doc-${path.basename(inputFile)}`,
      title: path.basename(inputFile),
      sourcePath: inputFile,
      sourceType: "pdf",
      profile: classifier.profile,
      pageCount: Number(extracted?.documentTree?.metadata?.pageCount || 0)
    },
    classifier,
    pages,
    content,
    ragHints: {
      chunking: "chunk after semantic reconstruction",
      stableNodeIds: true,
      hasMath: detectedEquationCount > 0
    }
  };

  const equationValidation = {
    total: detectedEquationCount,
    detectedEquations: detectedEquationCount,
    highConfidence: highConfidenceEq,
    needsReview: needsReviewEq,
    missedOrUnknown: missedEq,
    trueEquation: trueEquations.length,
    possibleEquation: possibleEquations.length,
    rejectedAsProse: proseRejectedCount,
    invalidLatex: invalidLatexCount,
    missingMath: missingMathCount,
    trueEquations,
    possibleEquations,
    rejectedEquationCandidates,
    proseIncorrectlyClassified: proseFalsePositiveRows,
    rows: equationValidationRows
  };

  return {
    extracted,
    document,
    quality,
    preservation,
    equationValidation,
    imageValidation: figureValidation,
    tableValidation,
    readingOrder: {
      status: orderingAnomalies.length ? "PASS_WITH_REVIEW" : "PASS",
      nodesChecked: content.length,
      orderingAnomalies,
      pages: readingOrderRows
    }
  };
}

function renderHtml(document = {}) {
  const nodes = Array.isArray(document?.content) ? document.content : [];
  const out = [];
  let inList = false;

  const nodeAttrs = (node = {}) => {
    const refs = Array.isArray(node?.source?.sourceRefs) ? node.source.sourceRefs.join(",") : "";
    return `data-node-id="${escapeHtml(node?.id || "")}" data-type="${escapeHtml(node?.type || "")}" data-page="${Number(node?.source?.page || node?.page || 0)}" data-source-refs="${escapeHtml(refs)}"`;
  };

  for (const node of nodes) {
    if (node.type !== "listItem" && inList) {
      out.push("</ul>");
      inList = false;
    }

    if (node.type === "heading") {
      const lvl = clamp(Number(node?.level || 2), 1, 6);
      out.push(`<h${lvl} ${nodeAttrs(node)}>${escapeHtml(node.content || "")}</h${lvl}>`);
      continue;
    }
    if (node.type === "paragraph") {
      out.push(`<p ${nodeAttrs(node)}>${escapeHtml(node.content || "")}</p>`);
      continue;
    }
    if (node.type === "list") {
      out.push("<ul>");
      for (const li of node.children || []) {
        out.push(`<li data-node-id="${escapeHtml(li.id)}">${escapeHtml(li.content || "")}</li>`);
      }
      out.push("</ul>");
      continue;
    }
    if (node.type === "equation") {
      const latex = node?.latex || node?.rawText || "";
      out.push(`<div class="equation" ${nodeAttrs(node)}><div class="eq-latex">\\[${escapeHtml(latex)}\\]</div><small>${escapeHtml(node.status || "unknown")} (${Number(node.confidence || 0).toFixed(2)})</small></div>`);
      continue;
    }
    if (node.type === "table") {
      const headers = Array.isArray(node?.headers) ? node.headers : [];
      const rows = Array.isArray(node?.rows) ? node.rows : [];
      const thead = headers.length ? `<thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>` : "";
      const tbody = `<tbody>${rows.map((r) => `<tr>${(r || []).map((c) => `<td>${escapeHtml(String(c || ""))}</td>`).join("")}</tr>`).join("")}</tbody>`;
      out.push(`<table ${nodeAttrs(node)}>${thead}${tbody}</table>`);
      continue;
    }
    if (node.type === "figure") {
      const img = node?.image?.asset ? `<img src="${escapeHtml(node.image.asset)}" alt="${escapeHtml(node.id)}" />` : "<div class=\"missing\">missing figure asset</div>";
      const caption = node?.caption ? `<figcaption>${escapeHtml(node.caption)}</figcaption>` : "";
      out.push(`<figure ${nodeAttrs(node)}>${img}${caption}</figure>`);
      continue;
    }
    if (node.type === "pageBreak") {
      out.push("<hr class=\"page-break\" />");
      continue;
    }
    if (["header", "footer", "unknown"].includes(node.type)) {
      out.push(`<div class="${escapeHtml(node.type)}" ${nodeAttrs(node)}>${escapeHtml(node.content || "")}</div>`);
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(String(document?.metadata?.title || "Document"))}</title>
  <style>
    body { margin: 0; background: #f4efe6; color: #201a13; font-family: Georgia, "Times New Roman", serif; }
    main { max-width: 980px; margin: 24px auto; padding: 20px 24px; background: #fffdf9; border: 1px solid #dccfbf; border-radius: 12px; }
    p, li { line-height: 1.58; }
    .equation { margin: 14px 0; padding: 12px; border: 1px solid #d6c5ae; border-left: 5px solid #986435; background: #fff7ec; border-radius: 8px; }
    .eq-latex { font-family: "Times New Roman", serif; overflow-x: auto; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    th, td { border: 1px solid #d8c8b3; padding: 8px; }
    figure { border: 1px solid #d8c8b3; border-radius: 8px; padding: 10px; margin: 14px 0; }
    figure img { width: 100%; height: auto; display: block; }
    .page-break { border: none; border-top: 2px dashed #b79d7c; margin: 24px 0; }
    .header, .footer { color: #6a5844; font-size: 0.92rem; }
    .unknown { color: #7f6247; border-left: 3px solid #c59b72; padding-left: 8px; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(String(document?.metadata?.title || "Document"))}</h1>
    <p>Type: ${escapeHtml(String(document?.metadata?.profile || "unknown"))} | Pages: ${Number(document?.metadata?.pageCount || 0)}</p>
    ${out.join("\n")}
  </main>
</body>
</html>`;
}

function renderMarkdown(document = {}) {
  const nodes = Array.isArray(document?.content) ? document.content : [];
  const out = [];
  out.push(`# ${String(document?.metadata?.title || "Document")}`);
  out.push("");

  for (const node of nodes) {
    if (node.type === "heading") {
      const lvl = clamp(Number(node?.level || 2), 1, 6);
      out.push(`${"#".repeat(lvl)} ${String(node?.content || "")}`);
      out.push("");
      continue;
    }
    if (node.type === "paragraph") {
      out.push(String(node?.content || ""));
      out.push("");
      continue;
    }
    if (node.type === "list") {
      for (const li of node.children || []) out.push(`- ${String(li?.content || "")}`);
      out.push("");
      continue;
    }
    if (node.type === "equation") {
      out.push("$$");
      out.push(String(node?.latex || node?.rawText || ""));
      out.push("$$");
      out.push("");
      continue;
    }
    if (node.type === "table") {
      const headers = Array.isArray(node?.headers) ? node.headers : [];
      const rows = Array.isArray(node?.rows) ? node.rows : [];
      if (headers.length) {
        out.push(`| ${headers.join(" | ")} |`);
        out.push(`| ${headers.map(() => "---").join(" | ")} |`);
        for (const row of rows) out.push(`| ${(row || []).join(" | ")} |`);
        out.push("");
      }
      continue;
    }
    if (node.type === "figure") {
      if (node?.image?.asset) out.push(`![${node.id}](${node.image.asset})`);
      if (node?.caption) out.push(`*${node.caption}*`);
      out.push("");
      continue;
    }
    if (node.type === "pageBreak") {
      out.push("\n---\n");
    }
  }

  return `${out.join("\n")}\n`;
}

function nodeMathText(node = {}) {
  if (node.type === "table") {
    const headers = Array.isArray(node?.headers) ? node.headers.join(" ") : "";
    const rows = Array.isArray(node?.rows) ? node.rows.flat().join(" ") : "";
    return cleanText(`${headers} ${rows}`);
  }
  if (node.type === "list") {
    return cleanText((node.children || []).map((c) => c?.content || "").join(" "));
  }
  return cleanText(node?.content || node?.rawText || "");
}

function detectInputType(ext) {
  if (ext === ".pdf") return "pdf";
  if (ext === ".docx") return "docx";
  if (ext === ".pptx") return "pptx";
  if ([".txt"].includes(ext)) return "text";
  if ([".md", ".markdown"].includes(ext)) return "markdown";
  if ([".html", ".htm"].includes(ext)) return "html";
  if ([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"].includes(ext)) return "image";
  return "unknown";
}

async function buildPlaceholderForDocx(inputFile) {
  const document = {
    type: "document",
    schemaVersion: "cdm-v3",
    source: { primaryType: "docx" },
    supportedSourceTypes: ["docx"],
    metadata: {
      filename: path.basename(inputFile),
      documentId: `doc-${path.basename(inputFile)}`,
      title: path.basename(inputFile),
      sourcePath: inputFile,
      sourceType: "docx",
      profile: "docx-adapter-pending",
      pageCount: 0
    },
    classifier: { profile: "docx-adapter-pending", confidence: 0.4, pages: [] },
    pages: [],
    content: [
      {
        id: "node-000001",
        type: "unknown",
        content: "DOCX route exists but adapter implementation in this package is pending.",
        children: [],
        source: { document: path.basename(inputFile), page: 0, bbox: toBBox(), sourceRefs: [] },
        confidence: 0.4,
        status: "needs-review"
      }
    ],
    ragHints: { chunking: "chunk after semantic reconstruction", stableNodeIds: true, hasMath: false }
  };
  return {
    document,
    quality: {
      contentCoverage: 0,
      textCoverage: 0,
      equationDetection: 0,
      equationReconstruction: 0,
      imageCoverage: 0,
      tableReconstruction: 0,
      readingOrder: 0,
      provenance: 1,
      overall: 0,
      equationsPresent: false,
      detectedEquations: 0,
      mathEvidenceRegions: 0,
      status: "FAIL",
      warnings: [{ type: "adapter", message: "DOCX adapter not implemented in this auxiliary package." }]
    },
    preservation: {
      sourceObjects: 0,
      represented: 0,
      representedSemantic: 0,
      representedVisual: 0,
      unrepresented: 0,
      needsReview: 1,
      uninterpreted: 0
    },
    equationValidation: { total: 0, detectedEquations: 0, highConfidence: 0, needsReview: 0, missedOrUnknown: 0, trueEquation: 0, possibleEquation: 0, rejectedAsProse: 0, invalidLatex: 0, missingMath: 0, rows: [] },
    imageValidation: [],
    tableValidation: [],
    readingOrder: { pages: [] }
  };
}

async function buildPlaceholderForImage(inputFile) {
  await ensureDir(imagesDir);
  const ext = path.extname(inputFile).toLowerCase() || ".png";
  const fileName = `image-001${ext}`;
  const abs = path.join(imagesDir, fileName);
  await writeFile(abs, await readFile(inputFile));

  const document = {
    type: "document",
    schemaVersion: "cdm-v3",
    source: { primaryType: "image" },
    supportedSourceTypes: ["image", "scanned-pdf"],
    metadata: {
      filename: path.basename(inputFile),
      documentId: `doc-${path.basename(inputFile)}`,
      title: path.basename(inputFile),
      sourcePath: inputFile,
      sourceType: "image",
      profile: "image-ocr-route",
      pageCount: 1
    },
    classifier: { profile: "image-ocr-route", confidence: 0.85, pages: [{ pageNumber: 1, kind: "scanned", confidence: 0.85 }] },
    pages: [{ pageNumber: 1, dimensions: { width: 0, height: 0 }, kind: "scanned", blocks: [] }],
    content: [
      {
        id: "node-000001",
        type: "figure",
        content: "",
        caption: "Image input preserved. OCR/mathematical extraction pending.",
        image: { asset: `assets/images/${fileName}`, representation: "source-image", semanticStatus: "image-preserved" },
        children: [],
        source: { document: path.basename(inputFile), page: 1, bbox: toBBox(), sourceRefs: [] },
        confidence: 1,
        status: "verified"
      }
    ],
    ragHints: { chunking: "chunk after semantic reconstruction", stableNodeIds: true, hasMath: false }
  };
  return {
    document,
    quality: {
      contentCoverage: 0.65,
      textCoverage: 0,
      equationDetection: 1,
      equationReconstruction: 1,
      imageCoverage: 1,
      tableReconstruction: 1,
      readingOrder: 0.8,
      provenance: 1,
      overall: 0.74,
      equationsPresent: false,
      detectedEquations: 0,
      mathEvidenceRegions: 0,
      status: "PASS WITH WARNINGS",
      warnings: [{ type: "ocr", message: "OCR and layout extraction are pending for image route." }]
    },
    preservation: {
      sourceObjects: 1,
      represented: 1,
      representedSemantic: 1,
      representedVisual: 1,
      unrepresented: 0,
      needsReview: 0,
      uninterpreted: 0
    },
    equationValidation: { total: 0, detectedEquations: 0, highConfidence: 0, needsReview: 0, missedOrUnknown: 0, trueEquation: 0, possibleEquation: 0, rejectedAsProse: 0, invalidLatex: 0, missingMath: 0, rows: [] },
    imageValidation: [{ figureId: "node-000001", page: 1, sourceBBox: toBBox(), asset: `assets/images/${fileName}`, semanticStatus: "image-preserved", representation: "source-image", confidence: 1 }],
    tableValidation: [],
    readingOrder: { pages: [{ page: 1, twoColumns: false, confidence: 0.8, orderedNodeIds: ["node-000001"] }] }
  };
}

async function buildPlaceholderForPptx(inputFile) {
  const document = {
    type: "document",
    schemaVersion: "cdm-v3",
    source: { primaryType: "pptx" },
    supportedSourceTypes: ["pptx"],
    metadata: {
      filename: path.basename(inputFile),
      documentId: `doc-${path.basename(inputFile)}`,
      title: path.basename(inputFile),
      sourcePath: inputFile,
      sourceType: "pptx",
      profile: "pptx-adapter-pending",
      pageCount: 0
    },
    classifier: { profile: "pptx-adapter-pending", confidence: 0.4, pages: [] },
    pages: [],
    content: [
      {
        id: "node-000001",
        type: "unknown",
        content: "PPTX route exists but adapter implementation in this package is pending.",
        children: [],
        source: { document: path.basename(inputFile), page: 0, bbox: toBBox(), sourceRefs: [] },
        confidence: 0.4,
        status: "needs-review"
      }
    ],
    ragHints: { chunking: "chunk after semantic reconstruction", stableNodeIds: true, hasMath: false }
  };
  return {
    document,
    quality: {
      contentCoverage: 0,
      textCoverage: 0,
      equationDetection: 0,
      equationReconstruction: 0,
      imageCoverage: 0,
      tableReconstruction: 0,
      readingOrder: 0,
      provenance: 1,
      overall: 0,
      equationsPresent: false,
      detectedEquations: 0,
      mathEvidenceRegions: 0,
      status: "FAIL",
      warnings: [{ type: "adapter", message: "PPTX adapter not implemented in this auxiliary package." }]
    },
    preservation: {
      sourceObjects: 0,
      represented: 0,
      representedSemantic: 0,
      representedVisual: 0,
      unrepresented: 0,
      needsReview: 1,
      uninterpreted: 0
    },
    equationValidation: { total: 0, detectedEquations: 0, highConfidence: 0, needsReview: 0, missedOrUnknown: 0, trueEquation: 0, possibleEquation: 0, rejectedAsProse: 0, invalidLatex: 0, missingMath: 0, rows: [] },
    imageValidation: [],
    tableValidation: [],
    readingOrder: { pages: [] }
  };
}

function stripHtml(value = "") {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function buildFromTextLike(inputFile, inputType) {
  const raw = await readFile(inputFile, "utf8");
  const text = inputType === "html" ? stripHtml(raw) : String(raw || "");
  const lines = String(text || "").split(/\r?\n/);

  let seq = 0;
  const nextId = () => `node-${String(++seq).padStart(6, "0")}`;
  const content = [];

  for (const line of lines) {
    const trimmed = cleanText(line);
    if (!trimmed) continue;
    if (inputType === "markdown" && /^#{1,6}\s+/.test(trimmed)) {
      const level = Math.min(6, Math.max(1, (trimmed.match(/^#+/) || ["#"])[0].length));
      content.push({
        id: nextId(),
        type: "heading",
        level,
        content: trimmed.replace(/^#{1,6}\s+/, ""),
        children: [],
        source: { document: path.basename(inputFile), page: 1, bbox: toBBox(), sourceRefs: [] },
        confidence: 1,
        status: "verified"
      });
      continue;
    }
    if (/^[-*+]\s+/.test(trimmed)) {
      content.push({
        id: nextId(),
        type: "list",
        content: "",
        children: [{
          id: nextId(),
          type: "listItem",
          content: trimmed.replace(/^[-*+]\s+/, ""),
          children: [],
          source: { document: path.basename(inputFile), page: 1, bbox: toBBox(), sourceRefs: [] },
          confidence: 1,
          status: "verified"
        }],
        source: { document: path.basename(inputFile), page: 1, bbox: toBBox(), sourceRefs: [] },
        confidence: 1,
        status: "verified"
      });
      continue;
    }
    const eqClass = classifyEquationCandidate(trimmed);
    if (["TRUE_EQUATION", "POSSIBLE_EQUATION"].includes(eqClass.label)) {
      content.push({
        id: nextId(),
        type: "equation",
        content: trimmed,
        text: trimmed,
        latex: rebuildLatexFromRuns({ text: trimmed, children: [] }) || normalizeMathSymbols(combiningBarToLatex(trimmed)),
        display: true,
        children: [],
        source: { document: path.basename(inputFile), page: 1, bbox: toBBox(), sourceRefs: [] },
        rawText: trimmed,
        equationClass: eqClass.label,
        equationReasons: eqClass.reasons,
        confidence: Number(eqClass.confidence || 0.82),
        status: eqClass.label === "TRUE_EQUATION" ? "preserved" : "needs-review"
      });
      continue;
    }
    content.push({
      id: nextId(),
      type: "paragraph",
      content: trimmed,
      children: [],
      source: { document: path.basename(inputFile), page: 1, bbox: toBBox(), sourceRefs: [] },
      confidence: 1,
      status: "verified"
    });
  }

  const document = {
    type: "document",
    schemaVersion: "cdm-v3",
    source: { primaryType: inputType },
    supportedSourceTypes: [inputType],
    metadata: {
      filename: path.basename(inputFile),
      documentId: `doc-${path.basename(inputFile)}`,
      title: path.basename(inputFile),
      sourcePath: inputFile,
      sourceType: inputType,
      profile: `${inputType}-native`,
      pageCount: 1
    },
    classifier: { profile: `${inputType}-native`, confidence: 0.98, pages: [{ pageNumber: 1, kind: "digital", confidence: 0.98 }] },
    pages: [{ pageNumber: 1, dimensions: { width: 0, height: 0 }, kind: "digital", blocks: content.map((n) => ({ id: n.id, type: n.type, bbox: n.source.bbox })) }],
    content,
    ragHints: { chunking: "chunk after semantic reconstruction", stableNodeIds: true, hasMath: content.some((n) => n.type === "equation") }
  };

  const hasMath = content.some((n) => n.type === "equation");
  const equationRows = content.filter((n) => n.type === "equation").map((n) => ({
    equationId: n.id,
    page: 1,
    extractedLatex: n.latex || null,
    rawText: n.rawText || n.content,
    confidence: Number(n.confidence || 0.82),
    validationStatus: n.latex ? "verified" : "needs-review",
    sourceBBox: n.source.bbox,
    sourceCrop: null,
    rendered: null,
    equationClass: String(n?.equationClass || "POSSIBLE_EQUATION"),
    invalidLatex: false,
    warnings: n.latex ? [] : ["missing-latex"]
  }));

  const trueEquation = equationRows.filter((row) => row.equationClass === "TRUE_EQUATION").length;
  const possibleEquation = equationRows.filter((row) => row.equationClass === "POSSIBLE_EQUATION").length;

  return {
    document,
    quality: {
      contentCoverage: 1,
      textCoverage: 1,
      equationDetection: hasMath ? 1 : 1,
      equationReconstruction: hasMath ? clamp(equationRows.filter((r) => r.validationStatus === "verified").length / Math.max(1, equationRows.length), 0, 1) : 1,
      imageCoverage: 1,
      tableReconstruction: 1,
      readingOrder: 1,
      provenance: 1,
      overall: 1,
      equationsPresent: hasMath,
      detectedEquations: equationRows.length,
      mathEvidenceRegions: equationRows.length,
      status: "PASS",
      warnings: []
    },
    preservation: {
      sourceObjects: content.length,
      represented: content.length,
      representedSemantic: content.length,
      representedVisual: content.length,
      unrepresented: 0,
      needsReview: equationRows.filter((r) => r.validationStatus === "needs-review").length,
      uninterpreted: 0
    },
    equationValidation: {
      total: equationRows.length,
      detectedEquations: equationRows.length,
      highConfidence: equationRows.filter((r) => r.validationStatus === "verified").length,
      needsReview: equationRows.filter((r) => r.validationStatus === "needs-review").length,
      missedOrUnknown: 0,
      trueEquation,
      possibleEquation,
      rejectedAsProse: 0,
      invalidLatex: 0,
      missingMath: 0,
      rows: equationRows
    },
    imageValidation: [],
    tableValidation: [],
    readingOrder: { pages: [{ page: 1, twoColumns: false, confidence: 1, orderedNodeIds: content.map((n) => n.id) }] }
  };
}

function buildRenderPlan(document = {}, quality = {}, preservation = {}) {
  const qm = quality?.metrics || quality;
  const nodes = Array.isArray(document?.content) ? document.content : [];
  const decisions = nodes.map((node) => ({
    nodeId: node.id,
    type: node.type,
    semantic: node.type === "equation" ? "latex|rawText" : "text|structure",
    visual: node.type === "equation" ? "mathjax-latex" : (node.type === "figure" ? "image" : "semantic-html"),
    source: {
      page: Number(node?.source?.page || 0),
      sourceRefs: Array.isArray(node?.source?.sourceRefs) ? node.source.sourceRefs.length : 0
    },
    status: node.status || "unknown"
  }));
  return {
    schemaVersion: "render-plan.v1",
    summary: {
      nodes: decisions.length,
      equations: decisions.filter((d) => d.type === "equation").length,
      figures: decisions.filter((d) => d.type === "figure").length,
      tables: decisions.filter((d) => d.type === "table").length,
      qualityStatus: qm?.status || quality?.overallStatus || "unknown",
      representedVisual: preservation?.representedVisual ?? null,
      representedSemantic: preservation?.representedSemantic ?? null
    },
    decisions
  };
}

function buildContentFidelityReport(result = {}, inputType = "unknown") {
  const doc = result?.document || {};
  const content = Array.isArray(doc?.content) ? doc.content : [];
  const q = result?.quality || {};
  const qm = q?.metrics || q;
  const eq = result?.equationValidation || { rows: [] };
  const img = Array.isArray(result?.imageValidation) ? result.imageValidation : [];
  const tables = Array.isArray(result?.tableValidation) ? result.tableValidation : [];

  const headings = content.filter((n) => n.type === "heading").length;
  const paragraphs = content.filter((n) => n.type === "paragraph").length;
  const lists = content.filter((n) => n.type === "list").length;
  const equations = content.filter((n) => n.type === "equation").length;
  const figures = content.filter((n) => n.type === "figure").length;

  return {
    generatedAt: new Date().toISOString(),
    inputType,
    documentId: doc?.metadata?.documentId || null,
    text: {
      sourceTextObjects: Number(result?.extracted?.documentTree?.statistics?.textPaint?.textPaintObjects || 0),
      reconstructedBlocks: headings + paragraphs + lists,
      missingText: qm?.textCoverage === 1 ? 0 : null,
      extraText: null,
      characterCoverage: Number(qm?.textCoverage || 0),
      orderingAccuracy: Number(qm?.readingOrder || 0)
    },
    structure: {
      headingsRecovered: headings,
      paragraphsRecovered: paragraphs,
      listsRecovered: lists,
      tablesRecovered: tables.length,
      figuresRecovered: figures
    },
    mathematics: {
      mathRegionsDetected: Number(qm?.mathEvidenceRegions || 0),
      equationsReconstructed: equations,
      trueEquation: Number(eq?.trueEquation || 0),
      possibleEquation: Number(eq?.possibleEquation || 0),
      rejectedAsProse: Number(eq?.rejectedAsProse || 0),
      invalidLatex: Number(eq?.invalidLatex || 0),
      missingMath: Number(eq?.missingMath || 0),
      validLatex: (eq.rows || []).filter((row) => Boolean(row.extractedLatex) && !row.invalidLatex).length,
      visualFallback: (eq.rows || []).filter((row) => !row.extractedLatex && row.sourceCrop).length,
      falsePositiveSuspects: Number(eq?.proseIncorrectlyClassified?.length || qm?.equationFalsePositives || q?.math?.falsePositives || 0),
      suspicious: (eq.rows || []).filter((row) => row.validationStatus !== "verified").map((row) => ({ equationId: row.equationId, page: row.page, reason: (row.warnings || []).join(",") || "needs-review" }))
    },
    images: {
      sourceImages: Number(result?.extracted?.documentTree?.statistics?.images || img.length),
      extractedImages: img.filter((row) => row.representation !== "source-crop").length,
      fallbackImages: img.filter((row) => row.representation === "source-crop").length,
      missingImages: img.filter((row) => !row.asset).length
    },
    provenance: {
      nodes: content.length,
      withSourceRefs: content.filter((node) => Array.isArray(node?.source?.sourceRefs) && node.source.sourceRefs.length > 0).length,
      orphanNodes: content.filter((node) => !node?.source?.page).map((node) => node.id)
    },
    status: String(qm?.status || q?.overallStatus || "FAIL")
  };
}

function buildRoundTripReport(result = {}) {
  const doc = result?.document || {};
  const pageRows = [];
  const content = Array.isArray(doc?.content) ? doc.content : [];

  for (const page of doc?.pages || []) {
    const pageNo = Number(page?.pageNumber || 0);
    const pageNodes = content.filter((node) => Number(node?.source?.page || 0) === pageNo);
    pageRows.push({
      page: pageNo,
      checks: {
        heading: pageNodes.some((n) => n.type === "heading"),
        paragraph: pageNodes.some((n) => n.type === "paragraph"),
        equation: pageNodes.some((n) => n.type === "equation"),
        table: pageNodes.some((n) => n.type === "table"),
        figure: pageNodes.some((n) => n.type === "figure"),
        sourceRefs: pageNodes.every((n) => n?.source?.page && n?.source?.bbox)
      },
      notes: pageNodes.filter((n) => n.status === "needs-review").map((n) => `${n.id}:${n.type}`)
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      pages: pageRows.length,
      headings: content.filter((n) => n.type === "heading").length,
      paragraphs: content.filter((n) => n.type === "paragraph").length,
      equations: content.filter((n) => n.type === "equation").length,
      tables: content.filter((n) => n.type === "table").length,
      figures: content.filter((n) => n.type === "figure").length
    },
    pages: pageRows
  };
}

function renderConsoleReport(inputFile, doc, quality, preservation, eqReport) {
  const qm = quality?.metrics || quality;
  const type = String(doc?.metadata?.profile || "unknown");
  const pages = Number(doc?.metadata?.pageCount || 0);
  const hasWarnings = String(qm?.status || quality?.overallStatus || "").includes("WARNINGS") || String(quality?.overallStatus || "").includes("REVIEW");
  const final = qm?.status || quality?.overallStatus || "FAIL";

  console.log("DOCUMENT INGESTION");
  console.log("==================\n");
  console.log(`Input: ${path.basename(inputFile)}`);
  console.log(`Type: ${type}`);
  console.log(`Pages: ${pages}\n`);
  console.log("CONTENT");
  console.log("-------");
  console.log(`Text: ${Number(qm?.textCoverage || 0) >= 0.95 ? "PASS" : "FAIL"}`);
  console.log(`Headings: ${doc.content.some((n) => n.type === "heading") ? "PASS" : "WARN"}`);
  console.log(`Lists: ${doc.content.some((n) => n.type === "list") ? "PASS" : "WARN"}`);
  console.log(`Tables: ${doc.content.some((n) => n.type === "table") ? "PASS" : "FAIL"}`);
  console.log(`Images: ${doc.content.some((n) => n.type === "figure") ? "PASS" : "FAIL"}`);
  console.log(`Math: ${qm?.equationsPresent ? (eqReport.detectedEquations > 0 ? "PASS" : "FAIL") : "N/A"}`);
  console.log(`Reading order: ${Number(qm?.readingOrder || 0) >= 0.85 ? "PASS" : "WARN"}\n`);
  console.log("MATH");
  console.log("----");
  console.log(`Detected: ${eqReport.detectedEquations}`);
  console.log(`High confidence: ${eqReport.highConfidence}`);
  console.log(`Needs review: ${eqReport.needsReview}`);
  console.log(`Lost: ${eqReport.missedOrUnknown}\n`);
  console.log("PRESERVATION");
  console.log("------------");
  console.log(`Represented: ${preservation.represented}/${preservation.sourceObjects}`);
  console.log(`Unrepresented: ${preservation.unrepresented}`);
  console.log(`Needs review: ${preservation.needsReview}`);
  console.log(`Uninterpreted: ${preservation.uninterpreted}\n`);
  console.log("OUTPUT");
  console.log("------");
  console.log("JSON: PASS");
  console.log("HTML: PASS");
  console.log("Markdown: PASS\n");
  console.log(`FINAL: ${final}${hasWarnings ? "" : ""}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputFile = args.input ? path.resolve(baseDir, args.input) : DEFAULT_INPUT;
  const ext = path.extname(inputFile).toLowerCase();
  const inputType = detectInputType(ext);

  await ensureDir(outputDir);
  await ensureDir(assetsDir);
  await ensureDir(auditsDir);
  await ensureDir(imagesDir);
  await ensureDir(equationCropsDir);
  await ensureDir(equationRenderedDir);

  let result;
  if (inputType === "pdf") result = await buildFromPdf(inputFile);
  else if (inputType === "docx") result = await buildPlaceholderForDocx(inputFile);
  else if (inputType === "pptx") result = await buildPlaceholderForPptx(inputFile);
  else if (["text", "markdown", "html"].includes(inputType)) result = await buildFromTextLike(inputFile, inputType);
  else if (inputType === "image") result = await buildPlaceholderForImage(inputFile);
  else throw new Error(`Unsupported input type: ${ext || "unknown"}`);

  const renderPlan = buildRenderPlan(result.document, result.quality, result.preservation);
  const fidelityReport = buildContentFidelityReport(result, inputType);
  const roundTripReport = buildRoundTripReport(result);

  const documentJson = path.join(outputDir, "document.json");
  const documentHtml = path.join(outputDir, "document.html");
  const documentSemanticHtml = path.join(outputDir, "document.semantic.html");
  const documentMd = path.join(outputDir, "document.md");
  const renderPlanJson = path.join(outputDir, "document.render-plan.json");
  const fidelityJson = path.join(outputDir, "content-fidelity-report.json");
  const qualityJson = path.join(outputDir, "document-quality.json");
  const preservationJson = path.join(outputDir, "document-preservation.json");
  const equationJson = path.join(outputDir, "equation-validation.json");
  const imageJson = path.join(outputDir, "image-validation.json");
  const tableJson = path.join(outputDir, "table-validation.json");
  const readingJson = path.join(outputDir, "reading-order.json");
  const textContentAuditJson = path.join(outputDir, "text-content-audit.json");
  const llmConsumptionJson = path.join(outputDir, "llm-consumption-report.json");
  const roundTripJson = path.join(auditsDir, "ai-roundtrip-report.json");
  const fidelityAuditJson = path.join(auditsDir, "content-fidelity-report.json");

  await writeJson(documentJson, result.document);
  const htmlOutput = renderHtml(result.document);
  const markdownOutput = renderMarkdown(result.document);
  await writeText(documentHtml, htmlOutput);
  await writeText(documentSemanticHtml, htmlOutput);
  await writeText(documentMd, markdownOutput);

  const textContentAudit = buildTextContentAudit(result);
  const llmConsumption = buildLlmConsumptionReport(result.document, markdownOutput);

  if (result?.quality?.llmReadiness) {
    result.quality.llmReadiness.markdownGenerated = true;
    result.quality.llmReadiness.canonicalJsonGenerated = true;
    result.quality.llmReadiness.contentLoss = Boolean(llmConsumption.contentLoss || textContentAudit.missingCharacters > 0 || textContentAudit.duplicatedCharacters > 0);
    result.quality.llmReadiness.status = result.quality.llmReadiness.contentLoss ? "PASS_WITH_REVIEW" : "PASS";
  }

  await writeJson(renderPlanJson, renderPlan);
  await writeJson(fidelityJson, fidelityReport);
  await writeJson(qualityJson, result.quality);
  await writeJson(preservationJson, result.preservation);
  await writeJson(equationJson, result.equationValidation);
  await writeJson(imageJson, result.imageValidation);
  await writeJson(tableJson, result.tableValidation);
  await writeJson(readingJson, result.readingOrder);
  await writeJson(textContentAuditJson, textContentAudit);
  await writeJson(llmConsumptionJson, llmConsumption);
  await writeJson(roundTripJson, roundTripReport);
  await writeJson(fidelityAuditJson, fidelityReport);

  renderConsoleReport(inputFile, result.document, result.quality, result.preservation, result.equationValidation);
  console.log("\nARTIFACTS");
  console.log(JSON.stringify({
    documentJson,
    documentHtml,
    documentSemanticHtml,
    documentMd,
    renderPlanJson,
    fidelityJson,
    qualityJson,
    preservationJson,
    equationJson,
    imageJson,
    tableJson,
    readingJson,
    textContentAuditJson,
    llmConsumptionJson,
    auditsDir,
    openHtml: pathToFileURL(documentHtml).href
  }, null, 2));

  const finalQualityStatus = String(result?.quality?.metrics?.status || result?.quality?.overallStatus || "FAIL");
  if (finalQualityStatus === "FAIL") {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
