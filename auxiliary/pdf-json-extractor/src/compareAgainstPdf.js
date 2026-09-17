import path from "node:path";
import { readFile } from "node:fs/promises";
import { extractPdfDocument } from "./extractPdf.js";
import { normalizeWhitespace, parseArgs, resolveProjectPath, writeJson } from "./utils.js";

const baseDir = process.cwd();
const outputDir = path.join(baseDir, "output");
const reportFile = path.join(outputDir, "document.comparison.json");
const treeFile = path.join(outputDir, "document.json");
const semanticHtmlFile = path.join(outputDir, "document.semantic.html");
const fidelityHtmlFile = path.join(outputDir, "document.fidelity.html");
const DEFAULT_INPUT = resolveProjectPath("..", "..", "Statistics.pdf");

function tokens(value = "") {
  return normalizeWhitespace(value)
    .toLowerCase()
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function jaccardSimilarity(left = "", right = "") {
  const leftSet = new Set(tokens(left));
  const rightSet = new Set(tokens(right));
  if (!leftSet.size && !rightSet.size) return 1;
  let intersection = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) intersection += 1;
  }
  const union = leftSet.size + rightSet.size - intersection;
  return union ? intersection / union : 0;
}

function textFromTree(documentTree = {}) {
  const pages = Array.isArray(documentTree?.pages) ? documentTree.pages : [];
  const lines = [];
  for (const page of pages) {
    const elements = Array.isArray(page?.elements) ? page.elements : [];
    for (const element of elements) {
      const text = String(element?.text || element?.value || element?.math?.source || "").trim();
      if (text) lines.push(text);
    }
  }
  return lines.join("\n");
}

function htmlToText(value = "") {
  const stripped = String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\bimg:[^\s]+/gi, " ")
    .replace(/\btable\s+\d+\s+rows\b/gi, " ")
    .replace(/\bpage\s+\d+\b/gi, " ");
  return normalizeWhitespace(stripped);
}

function normalizeNodeText(node = {}) {
  return normalizeWhitespace(String(node?.text || node?.value || node?.math?.source || "").toLowerCase());
}

function bboxIoU(a = {}, b = {}) {
  const ax1 = Number(a.x || 0);
  const ay1 = Number(a.y || 0);
  const ax2 = ax1 + Number(a.width || 0);
  const ay2 = ay1 + Number(a.height || 0);

  const bx1 = Number(b.x || 0);
  const by1 = Number(b.y || 0);
  const bx2 = bx1 + Number(b.width || 0);
  const by2 = by1 + Number(b.height || 0);

  const ix1 = Math.max(ax1, bx1);
  const iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);

  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  const areaA = Math.max(0, ax2 - ax1) * Math.max(0, ay2 - ay1);
  const areaB = Math.max(0, bx2 - bx1) * Math.max(0, by2 - by1);
  const union = areaA + areaB - inter;
  return union > 0 ? inter / union : 0;
}

function comparePageLayout(basePage = {}, outputPage = {}) {
  const typesToCheck = ["heading", "paragraph", "equation", "image", "table", "listItem", "pageNumber", "header", "footer"];
  const issues = [];
  const layoutScores = [];

  for (const type of typesToCheck) {
    const baseNodes = (basePage.elements || []).filter((node) => node.type === type);
    const outputNodes = (outputPage.elements || []).filter((node) => node.type === type);

    for (const baseNode of baseNodes) {
      const baseText = normalizeNodeText(baseNode);
      let best = null;
      let bestScore = -1;

      for (const outputNode of outputNodes) {
        const sameText = baseText && normalizeNodeText(outputNode) === baseText;
        const score = sameText ? bboxIoU(baseNode.bbox, outputNode.bbox) : 0;
        if (score > bestScore) {
          bestScore = score;
          best = outputNode;
        }
      }

      if (!best) {
        issues.push({ type, severity: "high", description: `Missing ${type} node` });
        layoutScores.push(0);
        continue;
      }

      const iou = Math.max(0, bestScore);
      layoutScores.push(iou);
      if (iou < 0.72) {
        issues.push({
          type,
          severity: iou < 0.5 ? "high" : "medium",
          description: `${type} displaced (IoU=${iou.toFixed(2)})`
        });
      }
    }
  }

  const superscriptBase = (basePage.elements || []).flatMap((node) => Array.isArray(node.children) ? node.children : []).filter((run) => run?.style?.verticalAlign === "superscript").length;
  const superscriptOut = (outputPage.elements || []).flatMap((node) => Array.isArray(node.children) ? node.children : []).filter((run) => run?.style?.verticalAlign === "superscript").length;
  const subscriptBase = (basePage.elements || []).flatMap((node) => Array.isArray(node.children) ? node.children : []).filter((run) => run?.style?.verticalAlign === "subscript").length;
  const subscriptOut = (outputPage.elements || []).flatMap((node) => Array.isArray(node.children) ? node.children : []).filter((run) => run?.style?.verticalAlign === "subscript").length;

  if (superscriptBase !== superscriptOut) {
    issues.push({ type: "equation", severity: "high", description: "Superscript run count mismatch" });
  }
  if (subscriptBase !== subscriptOut) {
    issues.push({ type: "equation", severity: "high", description: "Subscript run count mismatch" });
  }

  const layoutScore = layoutScores.length ? layoutScores.reduce((sum, score) => sum + score, 0) / layoutScores.length : 1;
  return {
    layoutScore,
    superscript: { baseline: superscriptBase, output: superscriptOut },
    subscript: { baseline: subscriptBase, output: subscriptOut },
    issues
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceFile = args.input ? path.resolve(baseDir, args.input) : DEFAULT_INPUT;

  const [baseline, treePayload, semanticHtmlPayload, fidelityHtmlPayload] = await Promise.all([
    extractPdfDocument(sourceFile),
    readFile(treeFile, "utf8"),
    readFile(semanticHtmlFile, "utf8"),
    readFile(fidelityHtmlFile, "utf8")
  ]);

  const baselineTree = baseline.documentTree;
  const outputTree = JSON.parse(treePayload);
  const semanticHtml = String(semanticHtmlPayload || "");
  const fidelityHtml = String(fidelityHtmlPayload || "");

  const baselineText = textFromTree(baselineTree);
  const outputText = textFromTree(outputTree);
  const semanticHtmlText = htmlToText(semanticHtml);
  const fidelityHtmlText = htmlToText(fidelityHtml);

  const baselinePages = Array.isArray(baselineTree?.pages) ? baselineTree.pages : [];
  const outputPages = Array.isArray(outputTree?.pages) ? outputTree.pages : [];

  const pageReports = [];
  for (const basePage of baselinePages) {
    const outputPage = outputPages.find((page) => Number(page.pageNumber) === Number(basePage.pageNumber));
    if (!outputPage) {
      pageReports.push({
        page: basePage.pageNumber,
        visualSimilarity: 0,
        layoutScore: 0,
        issues: [{ type: "page", severity: "high", description: "Missing page in output" }]
      });
      continue;
    }

    const layout = comparePageLayout(basePage, outputPage);
    pageReports.push({
      page: basePage.pageNumber,
      visualSimilarity: layout.layoutScore,
      textRecall: jaccardSimilarity(
        (basePage.elements || []).map((node) => node.text || node.value || "").join("\n"),
        (outputPage.elements || []).map((node) => node.text || node.value || "").join("\n")
      ),
      equationRecall: Number(outputPage.elements?.filter((node) => node.type === "equation").length || 0)
        / Math.max(1, Number(basePage.elements?.filter((node) => node.type === "equation").length || 0)),
      imageRecall: Number(outputPage.elements?.filter((node) => node.type === "image").length || 0)
        / Math.max(1, Number(basePage.elements?.filter((node) => node.type === "image").length || 0)),
      layoutScore: layout.layoutScore,
      issues: layout.issues
    });
  }

  const contentFidelity = {
    textSimilarityJson: jaccardSimilarity(baselineText, outputText),
    textSimilaritySemanticHtml: jaccardSimilarity(baselineText, semanticHtmlText),
    textSimilarityFidelityHtml: jaccardSimilarity(baselineText, fidelityHtmlText),
    headingRecall: Number(outputTree?.statistics?.headings || 0) / Math.max(1, Number(baselineTree?.statistics?.headings || 0)),
    equationRecall: Number(outputTree?.statistics?.equations || 0) / Math.max(1, Number(baselineTree?.statistics?.equations || 0)),
    imageRecall: Number(outputTree?.statistics?.images || 0) / Math.max(1, Number(baselineTree?.statistics?.images || 0)),
    tableRecall: Number(outputTree?.statistics?.tables || 0) / Math.max(1, Number(baselineTree?.statistics?.tables || 0)),
    listRecall: Number(outputTree?.statistics?.listItems || 0) / Math.max(1, Number(baselineTree?.statistics?.listItems || 0))
  };

  const visualFidelity = {
    pageScores: pageReports,
    averageVisualSimilarity: pageReports.length
      ? pageReports.reduce((sum, page) => sum + Number(page.visualSimilarity || 0), 0) / pageReports.length
      : 0,
    averageLayoutScore: pageReports.length
      ? pageReports.reduce((sum, page) => sum + Number(page.layoutScore || 0), 0) / pageReports.length
      : 0,
    issueCount: pageReports.reduce((sum, page) => sum + (Array.isArray(page.issues) ? page.issues.length : 0), 0)
  };

  const pass = Boolean(
    contentFidelity.textSimilarityJson >= 0.95
    && contentFidelity.textSimilaritySemanticHtml >= 0.68
    && contentFidelity.textSimilarityFidelityHtml >= 0.68
    && contentFidelity.headingRecall >= 0.9
    && contentFidelity.equationRecall >= 0.9
    && visualFidelity.averageVisualSimilarity >= 0.82
    && visualFidelity.averageLayoutScore >= 0.82
  );

  const report = {
    sourceFile,
    generatedAt: new Date().toISOString(),
    contentFidelity,
    visualFidelity,
    pass,
    notes: [
      "Visual fidelity currently uses geometric node alignment (IoU) rather than full raster pixel SSIM.",
      "Fidelity HTML is generated from canonical JSON and compared page-by-page with extracted baseline structure."
    ]
  };

  await writeJson(reportFile, report);
  console.log(JSON.stringify(report, null, 2));

  if (!pass) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
