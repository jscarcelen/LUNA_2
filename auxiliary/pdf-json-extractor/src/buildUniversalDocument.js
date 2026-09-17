import path from "node:path";
import { pathToFileURL } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";
import { extractPdfDocument } from "./extractPdf.js";
import { rasterizePdf } from "./fidelityRasterizer.js";
import { ensureDir, escapeHtml, normalizeWhitespace, parseArgs, resolveProjectPath, writeJson, writeText } from "./utils.js";

const baseDir = process.cwd();
const outputDir = path.join(baseDir, "output");
const assetsDir = path.join(outputDir, "assets");
const sourcePagesDir = path.join(outputDir, "fidelity", "source-pages");
const DEFAULT_INPUT = resolveProjectPath("..", "..", "Statistics.pdf");

function fileExt(filePath = "") {
  return path.extname(String(filePath || "")).toLowerCase();
}

function toBBox(box = null) {
  if (!box) return { x: 0, y: 0, width: 0, height: 0 };
  return {
    x: Number(box.x || 0),
    y: Number(box.y || 0),
    width: Number(box.width || 0),
    height: Number(box.height || 0)
  };
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function cleanText(value = "") {
  return normalizeWhitespace(String(value || ""));
}

function hasMathSignal(text = "") {
  return /[=+\-*/^_∑∫√±≈≤≥µσπα-ωΑ-Ω]/.test(String(text || ""));
}

function greekToLatex(char = "") {
  const map = {
    α: "\\alpha", β: "\\beta", γ: "\\gamma", δ: "\\delta", ε: "\\epsilon", θ: "\\theta", λ: "\\lambda",
    μ: "\\mu", π: "\\pi", σ: "\\sigma", φ: "\\phi", ω: "\\omega", Δ: "\\Delta", Σ: "\\Sigma", Ω: "\\Omega", Π: "\\Pi"
  };
  return map[char] || char;
}

function unicodeMathToLatex(text = "") {
  return Array.from(String(text || "")).map((ch) => {
    if (ch === "≤") return "\\leq";
    if (ch === "≥") return "\\geq";
    if (ch === "≈") return "\\approx";
    if (ch === "±") return "\\pm";
    if (ch === "∑") return "\\sum";
    if (ch === "∫") return "\\int";
    if (ch === "√") return "\\sqrt{}";
    return greekToLatex(ch);
  }).join("");
}

function equationLatexFromRuns(node = {}) {
  const runs = Array.isArray(node?.children) ? node.children : [];
  if (!runs.length) {
    const raw = cleanText(node?.text || "");
    return unicodeMathToLatex(raw);
  }

  let latex = "";
  for (const run of runs) {
    const text = unicodeMathToLatex(cleanText(run?.text || ""));
    if (!text) continue;
    const align = String(run?.style?.verticalAlign || "baseline");
    if (align === "superscript") {
      latex += `^{${text}}`;
      continue;
    }
    if (align === "subscript") {
      latex += `_{${text}}`;
      continue;
    }
    if (latex && !/[\s({[+\-*/=]$/.test(latex) && /^[A-Za-z0-9]/.test(text)) latex += " ";
    latex += text;
  }
  return latex.trim();
}

function classifyPdfPage(rawPage = {}) {
  const textObjects = Array.isArray(rawPage?.textObjects) ? rawPage.textObjects : [];
  let nonWhitespace = 0;
  let totalChars = 0;

  for (const obj of textObjects) {
    const text = String(obj?.text || "");
    if (!text.trim()) continue;
    nonWhitespace += 1;
    totalChars += text.length;
  }

  const scanned = nonWhitespace < 5 || totalChars < 50;
  return {
    pageNumber: Number(rawPage?.pageNumber || 0),
    kind: scanned ? "scanned" : "digital",
    textObjects: nonWhitespace,
    chars: totalChars,
    confidence: scanned ? 0.86 : 0.95
  };
}

function classifyPdfDocument(rawPages = []) {
  const pages = (rawPages || []).map((page) => classifyPdfPage(page));
  const digital = pages.filter((p) => p.kind === "digital").length;
  const scanned = pages.filter((p) => p.kind === "scanned").length;
  const profile = scanned === 0 ? "digital-pdf" : (digital === 0 ? "scanned-pdf" : "mixed-pdf");
  return {
    profile,
    confidence: profile === "mixed-pdf" ? 0.88 : 0.95,
    pages
  };
}

function detectColumns(nodes = []) {
  const textNodes = nodes.filter((n) => ["heading", "paragraph", "listItem", "equation", "inlineEquation", "quote", "code"].includes(n.type));
  if (textNodes.length < 10) {
    return { twoColumn: false, splitX: null, confidence: 0.9 };
  }

  const xs = textNodes.map((n) => Number(n?.source?.bbox?.x || 0)).sort((a, b) => a - b);
  const medianX = xs[Math.floor(xs.length / 2)] || 0;
  const left = textNodes.filter((n) => Number(n?.source?.bbox?.x || 0) <= medianX);
  const right = textNodes.filter((n) => Number(n?.source?.bbox?.x || 0) > medianX);

  if (left.length < 3 || right.length < 3) return { twoColumn: false, splitX: null, confidence: 0.85 };

  const leftMax = Math.max(...left.map((n) => Number(n?.source?.bbox?.x || 0) + Number(n?.source?.bbox?.width || 0)));
  const rightMin = Math.min(...right.map((n) => Number(n?.source?.bbox?.x || 0)));
  const gap = rightMin - leftMax;
  const twoColumn = gap > 20;
  return {
    twoColumn,
    splitX: twoColumn ? (leftMax + rightMin) / 2 : null,
    confidence: twoColumn ? 0.93 : 0.88
  };
}

function reorderByReadingOrder(nodes = []) {
  const column = detectColumns(nodes);
  if (!column.twoColumn) {
    return {
      ordered: [...nodes].sort((a, b) => {
        const ay = Number(a?.source?.bbox?.y || 0);
        const by = Number(b?.source?.bbox?.y || 0);
        if (Math.abs(ay - by) > 1.5) return ay - by;
        return Number(a?.source?.bbox?.x || 0) - Number(b?.source?.bbox?.x || 0);
      }),
      confidence: column.confidence
    };
  }

  const left = [];
  const right = [];
  for (const node of nodes) {
    const x = Number(node?.source?.bbox?.x || 0);
    if (x <= Number(column.splitX || 0)) left.push(node);
    else right.push(node);
  }

  const sortY = (a, b) => {
    const ay = Number(a?.source?.bbox?.y || 0);
    const by = Number(b?.source?.bbox?.y || 0);
    if (Math.abs(ay - by) > 1.5) return ay - by;
    return Number(a?.source?.bbox?.x || 0) - Number(b?.source?.bbox?.x || 0);
  };

  return {
    ordered: [...left.sort(sortY), ...right.sort(sortY)],
    confidence: column.confidence
  };
}

function sourceFromNode(inputFile, pageNumber, node = {}) {
  const refs = Array.isArray(node?.sourceRefs) ? node.sourceRefs : [];
  return {
    document: path.basename(inputFile),
    page: Number(pageNumber || 0),
    bbox: toBBox(node?.bbox),
    sourceRefs: refs.map((ref) => String(ref?.sourceId || "")).filter(Boolean)
  };
}

function nodeBase(id, type, inputFile, pageNumber, node) {
  return {
    id,
    type,
    source: sourceFromNode(inputFile, pageNumber, node)
  };
}

function tableToSemantic(id, inputFile, pageNumber, node = {}) {
  const rows = Array.isArray(node?.rows) ? node.rows : [];
  const body = rows.map((row) => (Array.isArray(row?.cells) ? row.cells : []).map((cell) => {
    const cellRuns = Array.isArray(cell?.children) ? cell.children : [];
    return cleanText(cellRuns.map((run) => run?.text || "").join(" "));
  }));
  const headers = body.length ? body[0] : [];
  const dataRows = body.length > 1 ? body.slice(1) : [];
  return {
    ...nodeBase(id, "table", inputFile, pageNumber, node),
    headers,
    rows: dataRows,
    rawRows: body,
    caption: null
  };
}

function makeEquationNode(id, inputFile, pageNumber, node = {}) {
  const sourceText = cleanText(node?.text || "");
  const latex = equationLatexFromRuns(node);
  const mathSignals = (sourceText.match(/[=+\-*/^_∑∫√±≈≤≥]/g) || []).length;
  const runCount = Array.isArray(node?.children) ? node.children.length : 0;
  const baseConfidence = Number(node?.classification?.confidence || node?.confidence?.overall || 0.7);
  let confidence = clamp(baseConfidence + Math.min(0.2, mathSignals * 0.01) + (runCount > 1 ? 0.05 : 0), 0, 1);
  const warnings = [];

  if (!latex) {
    confidence = 0.35;
    warnings.push("empty-latex");
  }
  if (latex && /sqrt\{\}/.test(latex)) warnings.push("incomplete-root-structure");
  if (latex && /\^\{\}|_\{\}/.test(latex)) warnings.push("empty-super-subscript");

  const status = confidence >= 0.75 ? "ok" : "needs-review";
  return {
    ...nodeBase(id, "equation", inputFile, pageNumber, node),
    latex: latex || null,
    mathml: null,
    display: true,
    confidence: Number(confidence.toFixed(4)),
    status,
    sourceText,
    warnings
  };
}

function shouldTreatAsEquation(node = {}) {
  const text = cleanText(node?.text || "");
  const runs = Array.isArray(node?.children) ? node.children : [];
  const superSubRuns = runs.filter((run) => ["superscript", "subscript"].includes(String(run?.style?.verticalAlign || ""))).length;
  const symbolCount = (text.match(/[=+\-*/^_∑∫√±≈≤≥(){}\[\]]/g) || []).length;
  const greekCount = (text.match(/[α-ωΑ-Ωµπσ]/g) || []).length;
  const hasKeyword = /\b(sum|sqrt|sigma|mu|theta|lambda|cov|corr|var|std|mean|frac|log|exp)\b/i.test(text);
  const score = symbolCount * 0.08 + greekCount * 0.24 + superSubRuns * 0.2 + (hasKeyword ? 0.25 : 0);
  return {
    isEquation: hasMathSignal(text) && score >= 0.25,
    score
  };
}

function paragraphNode(id, inputFile, pageNumber, node = {}) {
  return {
    ...nodeBase(id, "paragraph", inputFile, pageNumber, node),
    text: cleanText(node?.text || "")
  };
}

function headingNode(id, inputFile, pageNumber, node = {}) {
  return {
    ...nodeBase(id, "heading", inputFile, pageNumber, node),
    level: Number(node?.level || 2),
    text: cleanText(node?.text || "")
  };
}

function listItemNode(id, inputFile, pageNumber, node = {}) {
  return {
    ...nodeBase(id, "listItem", inputFile, pageNumber, node),
    ordered: Boolean(node?.ordered),
    marker: node?.marker || null,
    text: cleanText(node?.text || "")
  };
}

function makeHyperlinks(text = "") {
  const matches = String(text || "").match(/https?:\/\/[^\s)]+/g) || [];
  return matches.map((href, idx) => ({ id: `link-${idx + 1}`, type: "hyperlink", href, text: href }));
}

function semanticFromExtracted(inputFile, extracted, figureAssetMap = new Map()) {
  const rawPages = Array.isArray(extracted?.rawPages) ? extracted.rawPages : [];
  const pageClass = classifyPdfDocument(rawPages);
  const pageMode = new Map(pageClass.pages.map((entry) => [entry.pageNumber, entry]));

  let counter = 0;
  const content = [];
  const renderingEvidence = [];
  let readingConfAcc = 0;
  let readingConfCount = 0;

  for (const page of extracted?.documentTree?.pages || []) {
    const pageNumber = Number(page?.pageNumber || 0);
    const mode = pageMode.get(pageNumber) || { kind: "digital", confidence: 0.9 };
    const semanticNodes = [];

    for (const element of page?.elements || []) {
      const id = `node-${String(++counter).padStart(5, "0")}`;
      if (element?.type === "heading") {
        semanticNodes.push(headingNode(id, inputFile, pageNumber, element));
        continue;
      }
      if (element?.type === "paragraph") {
        const p = paragraphNode(id, inputFile, pageNumber, element);
        semanticNodes.push(p);
        for (const link of makeHyperlinks(p.text)) {
          semanticNodes.push({ ...nodeBase(`node-${String(++counter).padStart(5, "0")}`, "hyperlink", inputFile, pageNumber, element), ...link });
        }
        continue;
      }
      if (element?.type === "listItem") {
        semanticNodes.push(listItemNode(id, inputFile, pageNumber, element));
        continue;
      }
      if (element?.type === "table") {
        semanticNodes.push(tableToSemantic(id, inputFile, pageNumber, element));
        continue;
      }
      if (element?.type === "image") {
        const asset = figureAssetMap.get(String(element?.id || "")) || null;
        semanticNodes.push({
          ...nodeBase(id, "figure", inputFile, pageNumber, element),
          caption: null,
          image: {
            type: "image",
            asset: asset?.asset || null,
            representation: asset?.representation || "source-crop",
            confidence: Number(asset?.confidence || 0.95)
          }
        });
        continue;
      }
      if (element?.type === "header") {
        semanticNodes.push({ ...nodeBase(id, "header", inputFile, pageNumber, element), text: cleanText(element?.text || "") });
        continue;
      }
      if (element?.type === "footer") {
        semanticNodes.push({ ...nodeBase(id, "footer", inputFile, pageNumber, element), text: cleanText(element?.text || "") });
        continue;
      }
      if (element?.type === "textGroup" && element?.semanticCandidate === "math") {
        const eqCheck = shouldTreatAsEquation(element);
        if (eqCheck.isEquation) {
          semanticNodes.push(makeEquationNode(id, inputFile, pageNumber, element));
        } else {
          semanticNodes.push(paragraphNode(id, inputFile, pageNumber, element));
        }
        continue;
      }
      if (element?.type === "unknownBlock" && element?.classification?.candidate === "equation") {
        const eqCheck = shouldTreatAsEquation(element);
        if (eqCheck.isEquation) {
          semanticNodes.push(makeEquationNode(id, inputFile, pageNumber, element));
        } else {
          semanticNodes.push(paragraphNode(id, inputFile, pageNumber, element));
        }
        continue;
      }
      if (element?.type === "pageNumber") {
        semanticNodes.push({ ...nodeBase(id, "footnote", inputFile, pageNumber, element), text: cleanText(element?.value || "") });
        continue;
      }
      if (["vectorPath", "imagePaint", "vectorPaint", "textPaint"].includes(String(element?.type || ""))) {
        renderingEvidence.push({
          id,
          rawType: element?.type,
          page: pageNumber,
          source: sourceFromNode(inputFile, pageNumber, element)
        });
      }
    }

    if (mode.kind === "scanned") {
      semanticNodes.push({
        id: `node-${String(++counter).padStart(5, "0")}`,
        type: "image",
        source: {
          document: path.basename(inputFile),
          page: pageNumber,
          bbox: { x: 0, y: 0, width: Number(page?.width || 0), height: Number(page?.height || 0) },
          sourceRefs: []
        },
        asset: null,
        note: "Scanned page detected. OCR/vision enrichment required.",
        confidence: Number(mode.confidence || 0.86)
      });
    }

    const orderedResult = reorderByReadingOrder(semanticNodes);
    for (const node of orderedResult.ordered) content.push(node);
    readingConfAcc += Number(orderedResult.confidence || 0.85);
    readingConfCount += 1;

    if (pageNumber < Number(extracted?.documentTree?.metadata?.pageCount || 0)) {
      content.push({
        id: `node-${String(++counter).padStart(5, "0")}`,
        type: "pageBreak",
        source: {
          document: path.basename(inputFile),
          page: pageNumber,
          bbox: { x: 0, y: 0, width: Number(page?.width || 0), height: Number(page?.height || 0) },
          sourceRefs: []
        }
      });
    }
  }

  const readingOrderConfidence = readingConfCount ? Number((readingConfAcc / readingConfCount).toFixed(4)) : 0.85;
  const unresolved = content.filter((node) => !node?.source?.page || !node?.source?.bbox).length;

  return {
    semantic: {
      schemaVersion: "2.0",
      document: {
        id: `doc-${path.basename(inputFile)}`,
        title: path.basename(inputFile),
        sourceType: "pdf",
        profile: pageClass.profile,
        pageCount: Number(extracted?.documentTree?.metadata?.pageCount || 0)
      },
      extraction: {
        classifier: pageClass,
        paths: {
          docx: "adapter-contract-defined",
          pdfDigital: "pdf-native-extraction",
          pdfScanned: "ocr-vision-route",
          image: "vision-ocr-route"
        }
      },
      content,
      renderingEvidence,
      validation: {
        readingOrderConfidence,
        unresolvedNodes: unresolved
      }
    },
    readingOrderConfidence,
    unresolved
  };
}

function semanticCounts(content = []) {
  const count = (type) => content.filter((node) => node.type === type).length;
  return {
    headings: count("heading"),
    paragraphs: count("paragraph"),
    equations: count("equation"),
    figures: count("figure"),
    tables: count("table"),
    listItems: count("listItem")
  };
}

function equationValidationFromSemantic(semantic = {}) {
  const equations = (semantic?.content || []).filter((node) => node.type === "equation");
  return {
    generatedAt: new Date().toISOString(),
    equations: equations.map((eq) => ({
      equationId: eq.id,
      page: Number(eq?.source?.page || 0),
      latex: eq?.latex || null,
      confidence: Number(eq?.confidence || 0),
      status: eq?.status || "needs-review",
      source: eq?.source || null,
      warnings: Array.isArray(eq?.warnings) ? eq.warnings : []
    }))
  };
}

function qualityReport(semantic = {}, extracted = {}, equationValidation = {}) {
  const content = Array.isArray(semantic?.content) ? semantic.content : [];
  const sourceChars = Number(extracted?.documentTree?.statistics?.characters || 0);
  const representedChars = content
    .filter((node) => ["heading", "paragraph", "listItem", "header", "footer", "quote", "code", "footnote"].includes(node.type))
    .reduce((sum, node) => sum + String(node?.text || "").length, 0);

  const counts = semanticCounts(content);
  const sourceHeadings = Number(extracted?.documentTree?.statistics?.headings || 0);
  const sourceEquCandidates = Number(extracted?.documentTree?.statistics?.mathCandidates || 0) + Number(extracted?.documentTree?.statistics?.equations || 0);
  const sourceImages = Number(extracted?.documentTree?.statistics?.images || 0);
  const sourceTables = Number(extracted?.documentTree?.statistics?.tables || 0);

  const eqAll = Array.isArray(equationValidation?.equations) ? equationValidation.equations : [];
  const eqNeedsReview = eqAll.filter((eq) => eq.status === "needs-review").length;

  const textCoverage = sourceChars > 0 ? representedChars / sourceChars : 1;
  const headingCoverage = sourceHeadings > 0 ? counts.headings / sourceHeadings : 1;
  const equationCoverage = sourceEquCandidates > 0 ? counts.equations / sourceEquCandidates : 1;
  const imageCoverage = sourceImages > 0 ? counts.figures / sourceImages : 1;
  const tableCoverage = sourceTables > 0 ? counts.tables / sourceTables : 1;

  const warnings = [];
  if (eqNeedsReview > 0) warnings.push({ type: "math", message: `${eqNeedsReview} equations need review` });
  if (textCoverage < 0.95) warnings.push({ type: "text", message: "text coverage below 0.95" });
  if (imageCoverage < 1) warnings.push({ type: "image", message: "not all figures represented" });
  if (tableCoverage < 1) warnings.push({ type: "table", message: "not all tables represented" });

  const unresolvedNodes = Number(semantic?.validation?.unresolvedNodes || 0);
  if (unresolvedNodes > 0) warnings.push({ type: "provenance", message: `${unresolvedNodes} nodes missing source info` });

  const pass = textCoverage >= 0.95 && headingCoverage >= 0.95 && equationCoverage >= 0.9 && imageCoverage >= 0.95 && tableCoverage >= 0.95 && unresolvedNodes === 0;
  const status = pass ? (warnings.length ? "PASS WITH WARNINGS" : "PASS") : "FAIL";

  return {
    status,
    textCoverage: Number(textCoverage.toFixed(4)),
    headingCoverage: Number(headingCoverage.toFixed(4)),
    equationCoverage: Number(equationCoverage.toFixed(4)),
    imageCoverage: Number(imageCoverage.toFixed(4)),
    tableCoverage: Number(tableCoverage.toFixed(4)),
    readingOrderConfidence: Number((semantic?.validation?.readingOrderConfidence || 0.85).toFixed(4)),
    unresolvedNodes,
    represented: {
      headings: counts.headings,
      paragraphs: counts.paragraphs,
      equations: counts.equations,
      figures: counts.figures,
      tables: counts.tables,
      listItems: counts.listItems,
      equationsNeedingReview: eqNeedsReview
    },
    source: {
      textObjects: Number(extracted?.documentTree?.statistics?.textPaint?.textPaintObjects || 0),
      sourceChars,
      equationCandidates: sourceEquCandidates,
      images: sourceImages,
      tables: sourceTables
    },
    warnings
  };
}

function htmlFromSemantic(semantic = {}) {
  const nodes = Array.isArray(semantic?.content) ? semantic.content : [];
  let listOpen = false;
  const htmlNodes = [];

  for (const node of nodes) {
    if (node.type !== "listItem" && listOpen) {
      htmlNodes.push("</ul>");
      listOpen = false;
    }

    if (node.type === "heading") {
      const level = clamp(Number(node?.level || 2), 1, 6);
      htmlNodes.push(`<h${level} data-node-id="${escapeHtml(node.id)}">${escapeHtml(node.text || "")}</h${level}>`);
      continue;
    }
    if (node.type === "paragraph") {
      htmlNodes.push(`<p data-node-id="${escapeHtml(node.id)}">${escapeHtml(node.text || "")}</p>`);
      continue;
    }
    if (node.type === "listItem") {
      if (!listOpen) {
        htmlNodes.push("<ul>");
        listOpen = true;
      }
      htmlNodes.push(`<li data-node-id="${escapeHtml(node.id)}">${escapeHtml(node.text || "")}</li>`);
      continue;
    }
    if (node.type === "equation") {
      htmlNodes.push(`<div class="equation" data-node-id="${escapeHtml(node.id)}"><pre>$$${escapeHtml(node.latex || node.sourceText || "")}$$</pre><small>Status: ${escapeHtml(node.status || "unknown")}, confidence=${Number(node.confidence || 0).toFixed(2)}</small></div>`);
      continue;
    }
    if (node.type === "table") {
      const header = Array.isArray(node?.headers) ? node.headers : [];
      const rows = Array.isArray(node?.rows) ? node.rows : [];
      const thead = header.length ? `<thead><tr>${header.map((cell) => `<th>${escapeHtml(cell || "")}</th>`).join("")}</tr></thead>` : "";
      const tbody = `<tbody>${rows.map((row) => `<tr>${(row || []).map((cell) => `<td>${escapeHtml(cell || "")}</td>`).join("")}</tr>`).join("")}</tbody>`;
      htmlNodes.push(`<table data-node-id="${escapeHtml(node.id)}">${thead}${tbody}</table>`);
      continue;
    }
    if (node.type === "figure") {
      const src = String(node?.image?.asset || "").trim();
      const img = src ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(node.id)}" />` : "<div class=\"missing-asset\">missing image asset</div>";
      htmlNodes.push(`<figure data-node-id="${escapeHtml(node.id)}">${img}${node?.caption ? `<figcaption>${escapeHtml(node.caption)}</figcaption>` : ""}</figure>`);
      continue;
    }
    if (node.type === "pageBreak") {
      htmlNodes.push("<hr class=\"page-break\" />");
      continue;
    }
    if (node.type === "header" || node.type === "footer" || node.type === "footnote" || node.type === "quote" || node.type === "code") {
      htmlNodes.push(`<div class="${escapeHtml(node.type)}" data-node-id="${escapeHtml(node.id)}">${escapeHtml(node.text || "")}</div>`);
    }
  }
  if (listOpen) htmlNodes.push("</ul>");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(String(semantic?.document?.title || "Document"))}</title>
  <style>
    :root {
      --bg: #f5f2ec;
      --card: #fffdf9;
      --ink: #1f1a15;
      --line: #d8ccbb;
      --accent: #9b5b2a;
    }
    body { margin: 0; background: linear-gradient(180deg, #f7f3ec, #efe7dc); color: var(--ink); font-family: Georgia, "Times New Roman", serif; }
    main { max-width: 980px; margin: 28px auto; padding: 24px; background: var(--card); border: 1px solid var(--line); border-radius: 14px; }
    h1, h2, h3 { color: #3a2a1c; }
    p, li { line-height: 1.55; }
    .equation { border: 1px solid #d7c6ac; border-left: 6px solid var(--accent); background: #fff8ee; border-radius: 10px; padding: 12px; margin: 14px 0; overflow-x: auto; }
    table { border-collapse: collapse; width: 100%; margin: 14px 0; }
    th, td { border: 1px solid var(--line); padding: 8px; text-align: left; }
    figure { margin: 18px 0; border: 1px solid var(--line); border-radius: 10px; padding: 10px; }
    figure img { width: 100%; height: auto; display: block; }
    .page-break { border: none; border-top: 2px dashed #b49a7b; margin: 24px 0; }
    .header, .footer, .footnote { color: #6e5a44; font-size: 0.92rem; }
    .missing-asset { min-height: 48px; border: 1px dashed #bb9d82; display: flex; align-items: center; justify-content: center; color: #7a6047; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(String(semantic?.document?.title || "Document"))}</h1>
    <p>Profile: ${escapeHtml(String(semantic?.document?.profile || "unknown"))} | Source: ${escapeHtml(String(semantic?.document?.sourceType || "unknown"))}</p>
    ${htmlNodes.join("\n")}
  </main>
</body>
</html>`;
}

function markdownFromSemantic(semantic = {}) {
  const out = [];
  out.push(`# ${String(semantic?.document?.title || "Document")}`);
  out.push("");

  let listOpen = false;
  for (const node of semantic?.content || []) {
    if (node.type !== "listItem" && listOpen) {
      out.push("");
      listOpen = false;
    }

    if (node.type === "heading") {
      const level = clamp(Number(node?.level || 2), 1, 6);
      out.push(`${"#".repeat(level)} ${String(node?.text || "")}`);
      out.push("");
      continue;
    }
    if (node.type === "paragraph") {
      out.push(String(node?.text || ""));
      out.push("");
      continue;
    }
    if (node.type === "listItem") {
      out.push(`- ${String(node?.text || "")}`);
      listOpen = true;
      continue;
    }
    if (node.type === "equation") {
      out.push("$$");
      out.push(String(node?.latex || node?.sourceText || ""));
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
      continue;
    }
    if (["header", "footer", "footnote", "quote", "code"].includes(node.type)) {
      out.push(String(node?.text || ""));
      out.push("");
    }
  }

  return `${out.join("\n")}\n`;
}

async function cropPng(pagePath, outPath, bbox, scaleX, scaleY) {
  const png = PNG.sync.read(await readFile(pagePath));
  const x = clamp(Math.floor(Number(bbox.x || 0) * scaleX), 0, Math.max(0, png.width - 1));
  const y = clamp(Math.floor(Number(bbox.y || 0) * scaleY), 0, Math.max(0, png.height - 1));
  const w = clamp(Math.max(1, Math.ceil(Number(bbox.width || 1) * scaleX)), 1, png.width - x);
  const h = clamp(Math.max(1, Math.ceil(Number(bbox.height || 1) * scaleY)), 1, png.height - y);

  const crop = new PNG({ width: w, height: h });
  PNG.bitblt(png, crop, x, y, w, h, 0, 0);
  const buffer = PNG.sync.write(crop);
  await writeFile(outPath, buffer);
}

async function buildFigureAssets(inputFile, extracted) {
  const images = [];
  for (const page of extracted?.documentTree?.pages || []) {
    for (const node of page?.elements || []) {
      if (node?.type === "image") images.push({ pageNumber: Number(page.pageNumber || 0), node });
    }
  }
  if (!images.length) return new Map();

  await ensureDir(assetsDir);
  await ensureDir(sourcePagesDir);

  const raster = await rasterizePdf(inputFile, sourcePagesDir, {
    dpi: 220,
    expectedPageCount: Number(extracted?.documentTree?.metadata?.pageCount || 0)
  });

  const pageMap = new Map((raster?.pages || []).map((p) => [Number(p.pageNumber || 0), p]));
  const assetMap = new Map();

  for (let idx = 0; idx < images.length; idx += 1) {
    const item = images[idx];
    const page = pageMap.get(item.pageNumber);
    if (!page) continue;

    const srcPage = extracted?.documentTree?.pages?.find((p) => Number(p.pageNumber || 0) === item.pageNumber);
    const pageWidth = Number(srcPage?.width || 1);
    const pageHeight = Number(srcPage?.height || 1);
    const scaleX = Number(page.width || 1) / Math.max(1, pageWidth);
    const scaleY = Number(page.height || 1) / Math.max(1, pageHeight);

    const filename = `figure-${String(idx + 1).padStart(3, "0")}.png`;
    const absPath = path.join(assetsDir, filename);
    await cropPng(page.outFile, absPath, toBBox(item.node?.bbox), scaleX, scaleY);

    assetMap.set(String(item.node?.id || ""), {
      asset: `assets/${filename}`,
      representation: "source-crop",
      confidence: 0.95,
      page: item.pageNumber
    });
  }

  return assetMap;
}

async function processPdf(inputFile) {
  const extracted = await extractPdfDocument(inputFile);
  const figureAssets = await buildFigureAssets(inputFile, extracted);
  const built = semanticFromExtracted(inputFile, extracted, figureAssets);
  const equationValidation = equationValidationFromSemantic(built.semantic);
  const quality = qualityReport(built.semantic, extracted, equationValidation);

  return {
    semantic: built.semantic,
    markdown: markdownFromSemantic(built.semantic),
    html: htmlFromSemantic(built.semantic),
    quality,
    equationValidation,
    evidence: extracted.documentTree
  };
}

async function processImage(inputFile) {
  await ensureDir(assetsDir);
  const assetName = `image-001${fileExt(inputFile) || ".png"}`;
  const target = path.join(assetsDir, assetName);
  const bytes = await readFile(inputFile);
  await writeFile(target, bytes);

  const semantic = {
    schemaVersion: "2.0",
    document: {
      id: `doc-${path.basename(inputFile)}`,
      title: path.basename(inputFile),
      sourceType: "image",
      profile: "handwritten-or-image",
      pageCount: 1
    },
    extraction: {
      classifier: { profile: "handwritten-or-image", confidence: 0.85, pages: [{ pageNumber: 1, kind: "scanned" }] },
      paths: {
        docx: "adapter-contract-defined",
        pdfDigital: "pdf-native-extraction",
        pdfScanned: "ocr-vision-route",
        image: "vision-ocr-route"
      }
    },
    content: [
      {
        id: "node-00001",
        type: "figure",
        source: {
          document: path.basename(inputFile),
          page: 1,
          bbox: { x: 0, y: 0, width: 0, height: 0 },
          sourceRefs: []
        },
        caption: "Image input. OCR and equation extraction pending manual review.",
        image: {
          type: "image",
          asset: `assets/${assetName}`,
          representation: "source-image",
          confidence: 1
        }
      }
    ],
    renderingEvidence: [],
    validation: {
      readingOrderConfidence: 0.8,
      unresolvedNodes: 0
    }
  };

  const equationValidation = { generatedAt: new Date().toISOString(), equations: [] };
  const quality = {
    status: "PASS WITH WARNINGS",
    textCoverage: 0,
    headingCoverage: 1,
    equationCoverage: 0,
    imageCoverage: 1,
    tableCoverage: 1,
    readingOrderConfidence: 0.8,
    unresolvedNodes: 0,
    represented: { headings: 0, paragraphs: 0, equations: 0, figures: 1, tables: 0, listItems: 0, equationsNeedingReview: 0 },
    source: { textObjects: 0, sourceChars: 0, equationCandidates: 0, images: 1, tables: 0 },
    warnings: [{ type: "ocr", message: "OCR/Vision extraction not yet executed for image input." }]
  };

  return {
    semantic,
    markdown: markdownFromSemantic(semantic),
    html: htmlFromSemantic(semantic),
    quality,
    equationValidation,
    evidence: null
  };
}

async function processDocx(inputFile) {
  const semantic = {
    schemaVersion: "2.0",
    document: {
      id: `doc-${path.basename(inputFile)}`,
      title: path.basename(inputFile),
      sourceType: "docx",
      profile: "docx-pending-adapter",
      pageCount: 0
    },
    extraction: {
      classifier: { profile: "docx-pending-adapter", confidence: 0.4 },
      paths: {
        docx: "adapter-contract-defined",
        pdfDigital: "pdf-native-extraction",
        pdfScanned: "ocr-vision-route",
        image: "vision-ocr-route"
      }
    },
    content: [
      {
        id: "node-00001",
        type: "paragraph",
        source: { document: path.basename(inputFile), page: 0, bbox: { x: 0, y: 0, width: 0, height: 0 }, sourceRefs: [] },
        text: "DOCX adapter is declared but not implemented in this auxiliary pipeline yet."
      }
    ],
    renderingEvidence: [],
    validation: {
      readingOrderConfidence: 0,
      unresolvedNodes: 0
    }
  };
  const equationValidation = { generatedAt: new Date().toISOString(), equations: [] };
  const quality = {
    status: "FAIL",
    textCoverage: 0,
    headingCoverage: 0,
    equationCoverage: 0,
    imageCoverage: 0,
    tableCoverage: 0,
    readingOrderConfidence: 0,
    unresolvedNodes: 0,
    represented: { headings: 0, paragraphs: 1, equations: 0, figures: 0, tables: 0, listItems: 0, equationsNeedingReview: 0 },
    source: { textObjects: 0, sourceChars: 0, equationCandidates: 0, images: 0, tables: 0 },
    warnings: [{ type: "adapter", message: "DOCX adapter not implemented in this package." }]
  };
  return { semantic, markdown: markdownFromSemantic(semantic), html: htmlFromSemantic(semantic), quality, equationValidation, evidence: null };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputFile = args.input ? path.resolve(baseDir, args.input) : DEFAULT_INPUT;
  const ext = fileExt(inputFile);

  await ensureDir(outputDir);

  let result;
  if (ext === ".pdf") {
    result = await processPdf(inputFile);
  } else if ([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"].includes(ext)) {
    result = await processImage(inputFile);
  } else if (ext === ".docx") {
    result = await processDocx(inputFile);
  } else {
    throw new Error(`Unsupported input type: ${ext || "unknown"}`);
  }

  const documentFile = path.join(outputDir, "document.json");
  const htmlFile = path.join(outputDir, "document.html");
  const mdFile = path.join(outputDir, "document.md");
  const qualityFile = path.join(outputDir, "document-quality.json");
  const equationFile = path.join(outputDir, "equation-validation.json");
  const evidenceFile = path.join(outputDir, "document.evidence.json");

  await writeJson(documentFile, result.semantic);
  await writeText(htmlFile, result.html);
  await writeText(mdFile, result.markdown);
  await writeJson(qualityFile, result.quality);
  await writeJson(equationFile, result.equationValidation);
  if (result.evidence) await writeJson(evidenceFile, result.evidence);

  console.log(JSON.stringify({
    input: inputFile,
    output: {
      documentJson: documentFile,
      documentHtml: htmlFile,
      documentMarkdown: mdFile,
      documentQuality: qualityFile,
      equationValidation: equationFile,
      evidence: result.evidence ? evidenceFile : null,
      openHtml: pathToFileURL(htmlFile).href
    },
    status: result.quality?.status,
    pages: Number(result?.semantic?.document?.pageCount || 0),
    semanticNodes: Array.isArray(result?.semantic?.content) ? result.semantic.content.length : 0
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
