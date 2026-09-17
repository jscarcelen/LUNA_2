import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildCanonicalPageModelFromPdf } from "../canonical/canonicalPageModel.js";
import { ingestPdf } from "../ingestion/pdfIngestor.js";
import { parseArgs, ensureDir, escapeHtml, writeJson, writeText, resolveProjectPath } from "../utils.js";

const baseDir = process.cwd();
const outputDir = path.join(baseDir, "output", "trial");
const DEFAULT_INPUT = resolveProjectPath("..", "..", "Statistics.pdf");

function extOf(filePath = "") {
  return path.extname(String(filePath || "")).toLowerCase();
}

function countMathSignals(text = "") {
  const sample = String(text || "");
  return (sample.match(/[=+\-*/^_∑∫√±≈≤≥µσπα-ωΑ-Ω]/g) || []).length;
}

function classifyPdf(rawPages = []) {
  let nonWhitespace = 0;
  let totalChars = 0;
  let mathSignals = 0;

  for (const page of rawPages || []) {
    for (const item of page.textObjects || []) {
      const text = String(item?.text || "");
      if (!text.trim()) continue;
      nonWhitespace += 1;
      totalChars += text.length;
      mathSignals += countMathSignals(text);
    }
  }

  const pageCount = Math.max(1, Number(rawPages.length || 1));
  const textObjectsPerPage = nonWhitespace / pageCount;
  const charsPerPage = totalChars / pageCount;
  const mathPerPage = mathSignals / pageCount;

  const scanned = textObjectsPerPage < 20 || charsPerPage < 120;
  const mathHeavy = mathPerPage > 15;

  return {
    kind: scanned ? "scanned-pdf" : "digital-pdf",
    mathHeavy,
    confidence: scanned ? 0.86 : 0.95,
    metrics: {
      textObjects: nonWhitespace,
      totalChars,
      mathSignals,
      textObjectsPerPage: Number(textObjectsPerPage.toFixed(3)),
      charsPerPage: Number(charsPerPage.toFixed(3)),
      mathPerPage: Number(mathPerPage.toFixed(3))
    }
  };
}

function nodeTypeFromElementType(type = "") {
  if (type === "heading") return "heading";
  if (type === "paragraph") return "paragraph";
  if (type === "listItem") return "list_item";
  if (type === "table") return "table";
  if (type === "image") return "figure";
  if (type === "vectorPath") return "vector";
  if (type === "pageNumber") return "page_number";
  if (type === "textGroup" || type === "unknownBlock") return "equation_candidate";
  return "block";
}

function normalizeNode(node = {}, pageNumber = 0, idx = 0) {
  const rawType = String(node?.type || "block");
  const kind = nodeTypeFromElementType(rawType);
  const text = String(node?.text || node?.value || "").trim();
  const sourceRefs = Array.isArray(node?.sourceRefs) ? node.sourceRefs : [];
  const confidence = Number(node?.confidence?.overall || node?.confidence || 0.8);

  const out = {
    id: String(node?.id || `node-${pageNumber}-${idx + 1}`),
    type: kind,
    rawType,
    page: Number(pageNumber || 0),
    bbox: node?.bbox || null,
    text,
    readingOrder: Number(node?.readingOrder || idx + 1),
    confidence: Number.isFinite(confidence) ? Number(confidence.toFixed(4)) : 0.8,
    sourceRefs
  };

  if (kind === "heading") out.level = Number(node?.level || 2);
  if (kind === "equation_candidate") {
    out.equation = {
      latex: null,
      sourceText: text,
      detected: true,
      source: "pdf-layout-heuristic"
    };
  }
  if (kind === "table") {
    out.table = {
      rows: Array.isArray(node?.rows) ? node.rows.length : 0,
      cells: Array.isArray(node?.rows)
        ? node.rows.reduce((sum, row) => sum + (Array.isArray(row?.cells) ? row.cells.length : 0), 0)
        : 0
    };
  }
  if (kind === "figure") {
    out.figure = {
      sourceObjectId: node?.source?.objectId || null,
      bytesExtractable: node?.source?.bytesExtractable ?? null
    };
  }

  return out;
}

function canonicalFromDigital(documentTree = {}, classification = {}, sourcePath = "") {
  const content = [];
  for (const page of documentTree.pages || []) {
    const pageNumber = Number(page?.pageNumber || 0);
    const elements = Array.isArray(page?.elements) ? page.elements : [];
    const sorted = [...elements].sort((a, b) => Number(a?.readingOrder || 0) - Number(b?.readingOrder || 0));
    for (let idx = 0; idx < sorted.length; idx += 1) {
      content.push(normalizeNode(sorted[idx], pageNumber, idx));
    }
  }

  return {
    schemaVersion: "trial.cdm.v1",
    document: {
      id: `trial-${path.basename(sourcePath)}`,
      title: path.basename(sourcePath),
      sourceType: "pdf",
      profile: classification?.kind || "digital-pdf",
      pageCount: Number(documentTree?.metadata?.pageCount || (documentTree?.pages || []).length || 0)
    },
    extraction: {
      classifier: classification,
      strategy: {
        primary: "pdf-native",
        fallback: "ocr-layout",
        math: classification?.mathHeavy ? "math-enhanced" : "standard"
      }
    },
    content
  };
}

function canonicalFromScanned(rawPages = [], classification = {}, sourcePath = "") {
  const content = [];
  for (const page of rawPages || []) {
    const pageNumber = Number(page?.pageNumber || 0);
    content.push({
      id: `scanned-page-${pageNumber}`,
      type: "scanned_page",
      page: pageNumber,
      bbox: { x: 0, y: 0, width: Number(page?.geometry?.width || 0), height: Number(page?.geometry?.height || 0) },
      text: "",
      confidence: 0.45,
      sourceRefs: [],
      note: "Low native text density detected. Route to OCR/Vision adapter for full reconstruction."
    });
  }

  return {
    schemaVersion: "trial.cdm.v1",
    document: {
      id: `trial-${path.basename(sourcePath)}`,
      title: path.basename(sourcePath),
      sourceType: "pdf",
      profile: "scanned-pdf",
      pageCount: Number(rawPages.length || 0)
    },
    extraction: {
      classifier: classification,
      strategy: {
        primary: "ocr-layout",
        fallback: "pdf-native",
        math: "math-ocr"
      }
    },
    content
  };
}

function renderCanonicalHtml(canonical = {}) {
  const title = escapeHtml(canonical?.document?.title || "Document");
  const rows = Array.isArray(canonical?.content) ? canonical.content : [];

  const body = rows.map((node) => {
    const attrs = `data-node-id="${escapeHtml(node.id)}" data-page="${Number(node.page || 0)}"`;
    const text = escapeHtml(node.text || "");

    if (node.type === "heading") {
      const level = Math.max(1, Math.min(6, Number(node.level || 2)));
      return `<h${level} ${attrs}>${text}</h${level}>`;
    }
    if (node.type === "paragraph") return `<p ${attrs}>${text}</p>`;
    if (node.type === "list_item") return `<li ${attrs}>${text}</li>`;
    if (node.type === "equation_candidate") {
      return `<div class="equation" ${attrs}><code>${escapeHtml(node?.equation?.sourceText || text)}</code></div>`;
    }
    if (node.type === "table") {
      return `<div class="table" ${attrs}>Table node (${Number(node?.table?.rows || 0)} rows, ${Number(node?.table?.cells || 0)} cells)</div>`;
    }
    if (node.type === "figure") {
      return `<figure ${attrs}><figcaption>Figure ${escapeHtml(String(node?.figure?.sourceObjectId || node.id))}</figcaption></figure>`;
    }
    if (node.type === "scanned_page") {
      return `<section class="scanned" ${attrs}>Scanned page placeholder. OCR/Vision adapter required for text reconstruction.</section>`;
    }
    return `<div class="block" ${attrs}>${text}</div>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 24px; background: #f7f8fb; color: #111827; font-family: Georgia, "Times New Roman", serif; }
    main { max-width: 980px; margin: 0 auto; background: #fff; border: 1px solid #d9dee8; border-radius: 12px; padding: 20px 24px; }
    h1, h2, h3 { margin-top: 1.2em; }
    p, li { line-height: 1.5; }
    .equation { background: #f4f6fb; border: 1px solid #d6deef; border-radius: 8px; padding: 10px 12px; margin: 10px 0; }
    .table, .block, .scanned, figure { border: 1px solid #e3e7f0; border-radius: 8px; padding: 8px 10px; margin: 10px 0; }
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p>Profile: ${escapeHtml(canonical?.document?.profile || "unknown")} | Source type: ${escapeHtml(canonical?.document?.sourceType || "unknown")}</p>
    ${body}
  </main>
</body>
</html>`;
}

async function processPdf(sourcePath) {
  const { rawPages } = await ingestPdf(sourcePath, {});
  const classification = classifyPdf(rawPages);

  if (classification.kind === "digital-pdf") {
    const digital = await buildCanonicalPageModelFromPdf(sourcePath);
    const canonical = canonicalFromDigital(digital.documentTree, classification, sourcePath);
    return { canonical, classification };
  }

  const canonical = canonicalFromScanned(rawPages, classification, sourcePath);
  return { canonical, classification };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputFile = args.input ? path.resolve(baseDir, args.input) : DEFAULT_INPUT;
  const ext = extOf(inputFile);

  await ensureDir(outputDir);

  let result;
  if (ext === ".pdf") {
    result = await processPdf(inputFile);
  } else if ([".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp"].includes(ext)) {
    result = {
      canonical: {
        schemaVersion: "trial.cdm.v1",
        document: {
          id: `trial-${path.basename(inputFile)}`,
          title: path.basename(inputFile),
          sourceType: "image",
          profile: "handwritten-or-image",
          pageCount: 1
        },
        extraction: {
          classifier: {
            kind: "handwritten-or-image",
            confidence: 0.85,
            metrics: {}
          },
          strategy: {
            primary: "ocr-vision",
            fallback: "none",
            math: "math-ocr"
          }
        },
        content: [
          {
            id: "image-page-1",
            type: "scanned_page",
            page: 1,
            bbox: null,
            text: "",
            confidence: 0.45,
            sourceRefs: [],
            note: "Image input trial node. Plug OCR output here for production extraction."
          }
        ]
      },
      classification: { kind: "handwritten-or-image", confidence: 0.85 }
    };
  } else {
    throw new Error(`Unsupported input type: ${ext || "unknown"}`);
  }

  const outBase = path.basename(inputFile).replace(/\.[^.]+$/, "");
  const jsonFile = path.join(outputDir, `${outBase}.trial.json`);
  const htmlFile = path.join(outputDir, `${outBase}.trial.html`);
  const html = renderCanonicalHtml(result.canonical);

  await writeJson(jsonFile, result.canonical);
  await writeText(htmlFile, html);

  console.log(JSON.stringify({
    input: inputFile,
    classification: result.classification,
    jsonTree: jsonFile,
    htmlView: htmlFile,
    openHtml: pathToFileURL(htmlFile).href,
    contentNodes: Array.isArray(result.canonical?.content) ? result.canonical.content.length : 0
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
