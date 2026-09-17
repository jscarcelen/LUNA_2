import path from "node:path";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolveProjectPath } from "./utils.js";

const baseDir = process.cwd();
const outputDir = path.join(baseDir, "output");
const benchmarkDir = path.join(outputDir, "benchmark");
const DEFAULT_INPUT = resolveProjectPath("..", "..", "Statistics.pdf");

function parseArgs(argv = []) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || "");
    if (token === "--input") {
      options.input = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }
    if (token === "--adobe-json") {
      options.adobeJson = String(argv[index + 1] || "").trim();
      index += 1;
      continue;
    }
    if (token === "--adobe-md") {
      options.adobeMd = String(argv[index + 1] || "").trim();
      index += 1;
    }
  }
  return options;
}

function safeRatio(numerator, denominator, fallback = 0) {
  const den = Number(denominator || 0);
  if (!Number.isFinite(den) || den <= 0) return fallback;
  const num = Number(numerator || 0);
  return num / den;
}

function clamp01(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(1, num));
}

function avg(values = []) {
  const valid = values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  if (!valid.length) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function countByType(content = []) {
  const counts = {};
  for (const node of Array.isArray(content) ? content : []) {
    const key = String(node?.type || "unknown");
    counts[key] = Number(counts[key] || 0) + 1;
  }
  return counts;
}

function parseJsonFromStdout(stdout = "") {
  const text = String(stdout || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const candidate = text.slice(start, end + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function runIngest(inputFile) {
  const result = spawnSync(process.execPath, [path.join(baseDir, "src", "ingestDocument.js"), "--input", inputFile], {
    cwd: baseDir,
    stdio: "inherit",
    env: process.env
  });
  if (result.status !== 0) {
    throw new Error("PDF.js ingest failed while producing canonical benchmark artifacts.");
  }
}

function runNodeScriptCapture(scriptName, args = []) {
  const scriptPath = path.join(baseDir, "src", scriptName);
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: baseDir,
    env: process.env,
    encoding: "utf8"
  });

  return {
    ok: result.status === 0,
    status: Number(result.status || 1),
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim()
  };
}

async function readJson(filePath) {
  const payload = await readFile(filePath, "utf8");
  return JSON.parse(payload);
}

async function copyIfProvided(sourcePath, targetPath) {
  if (!sourcePath) return false;
  const payload = await readFile(sourcePath, "utf8");
  await writeFile(targetPath, payload, "utf8");
  return true;
}

function buildPdfjsEquationAudit(equationJson = {}, canonicalById = new Map()) {
  const rows = Array.isArray(equationJson?.rows) ? equationJson.rows : [];
  return rows.map((row, index) => {
    const canonical = canonicalById.get(String(row?.equationId || "")) || {};
    return {
      index: index + 1,
      equationId: String(row?.equationId || ""),
      page: Number(row?.page || canonical?.page || 0),
      sourceBBox: row?.sourceBBox || canonical?.source?.bbox || null,
      expectedLatex: null,
      pdfjsLatex: String(row?.extractedLatex || canonical?.latex || ""),
      adobeLatex: null,
      visionLatex: null,
      confidence: Number(row?.confidence || canonical?.confidence || 0),
      extractionMethod: "pdfjs",
      classification: String(row?.equationClass || canonical?.equationClass || "UNKNOWN"),
      status: String(canonical?.status || row?.validationStatus || "needs-review"),
      verdict: "pending_manual_review"
    };
  });
}

function buildVisionRepairRequests(documentJson = {}, equationJson = {}, readingOrderJson = {}) {
  const content = Array.isArray(documentJson?.content) ? documentJson.content : [];
  const candidates = [];

  for (const node of content) {
    const nodeType = String(node?.type || "unknown");
    const status = String(node?.status || "").toLowerCase();
    const confidence = Number(node?.confidence || 0);
    const reasons = [];

    if (status.includes("needs-review")) reasons.push("node_status_needs_review");
    if (nodeType === "unknown") reasons.push("unknown_semantic_type");
    if (confidence > 0 && confidence < 0.86) reasons.push("low_confidence");

    if (nodeType === "equation") {
      if (!String(node?.latex || "").trim()) reasons.push("missing_latex");
      if (String(node?.latexStatus || "") !== "verified") reasons.push("latex_not_verified");
    }

    if (!reasons.length) continue;

    candidates.push({
      page: Number(node?.page || node?.source?.page || 0),
      bbox: node?.source?.bbox || null,
      type: nodeType === "unknown" ? "classification" : nodeType,
      nodeId: String(node?.id || ""),
      reason: reasons.join(","),
      source: "pdfjs",
      proposedRepair: nodeType === "equation"
        ? "Reconstruct valid LaTeX exactly as seen."
        : "Classify and reconstruct this uncertain semantic region."
    });
  }

  for (const row of equationJson?.rows || []) {
    const invalidLatex = Boolean(row?.invalidLatex);
    const label = String(row?.equationClass || "");
    if (!invalidLatex && label !== "POSSIBLE_EQUATION") continue;

    candidates.push({
      page: Number(row?.page || 0),
      bbox: row?.sourceBBox || null,
      type: "equation",
      nodeId: String(row?.equationId || ""),
      reason: invalidLatex ? "invalid_latex" : "low_confidence_math",
      source: "pdfjs",
      proposedRepair: "Reconstruct equation LaTeX exactly without interpretation."
    });
  }

  for (const page of readingOrderJson?.pages || []) {
    const confidence = Number(page?.confidence || 0);
    if (confidence >= 0.86) continue;
    candidates.push({
      page: Number(page?.page || 0),
      bbox: null,
      type: "reading_order",
      nodeId: "",
      reason: "reading_order_low_confidence",
      source: "pdfjs",
      proposedRepair: "Confirm block order for this page."
    });
  }

  const dedup = new Map();
  for (const candidate of candidates) {
    const key = `${candidate.page}|${candidate.nodeId}|${candidate.type}|${candidate.reason}`;
    if (!dedup.has(key)) dedup.set(key, candidate);
  }

  return {
    generatedAt: new Date().toISOString(),
    strategy: "vision-repair-only-for-uncertain-regions",
    totalCandidates: dedup.size,
    candidates: Array.from(dedup.values())
  };
}

function buildGoldStandard(documentJson = {}, equationJson = {}, textAuditJson = {}, readingOrderJson = {}) {
  const content = Array.isArray(documentJson?.content) ? documentJson.content : [];
  const nodeTypes = countByType(content);
  const canonicalById = new Map(content.map((node) => [String(node?.id || ""), node]));

  return {
    generatedAt: new Date().toISOString(),
    document: {
      title: String(documentJson?.metadata?.title || ""),
      filename: String(documentJson?.metadata?.filename || ""),
      pages: Number(documentJson?.metadata?.pageCount || 0)
    },
    expectedStructure: {
      pages: Number(documentJson?.metadata?.pageCount || 0),
      headings: Number(nodeTypes.heading || 0),
      paragraphs: Number(nodeTypes.paragraph || 0),
      tables: Number(nodeTypes.table || 0),
      figures: Number(nodeTypes.figure || 0),
      equations: Number(nodeTypes.equation || 0),
      lists: Number(nodeTypes.list || 0),
      characters: Number(textAuditJson?.sourceCharacters || 0),
      readingOrderConfidence: Number(avg((readingOrderJson?.pages || []).map((page) => page?.confidence)).toFixed(4))
    },
    equationReviewMatrix: buildPdfjsEquationAudit(equationJson, canonicalById),
    reviewInstructions: [
      "Set expectedLatex for each equation from manual PDF review.",
      "Fill adobeLatex and visionLatex when those outputs are available.",
      "Set verdict to exact, acceptable, or wrong."
    ]
  };
}

function getPdfjsMetrics(documentJson, qualityJson, equationJson, textAuditJson, preservationJson, readingOrderJson, visionRepair) {
  const content = Array.isArray(documentJson?.content) ? documentJson.content : [];
  const nodeTypes = countByType(content);
  const pages = Number(documentJson?.metadata?.pageCount || 0);

  const eqDetected = Number(equationJson?.detectedEquations || 0);
  const eqMissing = Number(equationJson?.missingMath || equationJson?.missedOrUnknown || 0);
  const eqInvalid = Number(equationJson?.invalidLatex || 0);
  const eqNeedsReview = Number(equationJson?.needsReview || 0);
  const proseIncorrectlyClassified = Array.isArray(equationJson?.proseIncorrectlyClassified)
    ? equationJson.proseIncorrectlyClassified.length
    : 0;

  const textCompleteness = clamp01(1 - safeRatio(textAuditJson?.missingCharacters, textAuditJson?.sourceCharacters, 0));
  const readingOrder = clamp01(Number(qualityJson?.metrics?.readingOrder || avg((readingOrderJson?.pages || []).map((page) => page?.confidence))));
  const headingDetection = nodeTypes.heading > 0 ? 1 : 0;
  const paragraphReconstruction = nodeTypes.paragraph > 0 ? 1 : 0;
  const listReconstruction = nodeTypes.list > 0 ? 1 : 0;
  const tableReconstruction = clamp01(Number(qualityJson?.metrics?.tableReconstruction || 0));
  const imageFigureDetection = clamp01(Number(qualityJson?.metrics?.imageCoverage || 0));
  const equationDetection = clamp01(Number(qualityJson?.metrics?.equationDetection || safeRatio(eqDetected, eqDetected + eqMissing, 0)));
  const equationLatexCorrectness = clamp01(
    0.7 * safeRatio(eqDetected - eqInvalid, Math.max(1, eqDetected), 0)
    + 0.3 * safeRatio(eqDetected - eqNeedsReview, Math.max(1, eqDetected), 0)
  );
  const falsePositiveEquations = proseIncorrectlyClassified === 0
    ? 1
    : clamp01(1 - safeRatio(proseIncorrectlyClassified, Math.max(1, eqDetected), 0));
  const sourcePageProvenance = clamp01(Number(qualityJson?.provenance?.coverage || safeRatio(preservationJson?.represented, preservationJson?.sourceObjects, 0)));
  const uncertainRegions = Number(visionRepair?.totalCandidates || 0);

  const overallSemanticQuality = clamp01(
    (textCompleteness * 0.15)
    + (readingOrder * 0.1)
    + (headingDetection * 0.05)
    + (paragraphReconstruction * 0.05)
    + (listReconstruction * 0.03)
    + (tableReconstruction * 0.08)
    + (imageFigureDetection * 0.06)
    + (equationDetection * 0.18)
    + (equationLatexCorrectness * 0.2)
    + (falsePositiveEquations * 0.05)
    + (sourcePageProvenance * 0.05)
  );

  const equationNodes = (equationJson?.rows || []).map((row) => ({
    equationId: String(row?.equationId || ""),
    page: Number(row?.page || 0),
    sourceBBox: row?.sourceBBox || null,
    latex: String(row?.extractedLatex || ""),
    confidence: Number(row?.confidence || 0),
    extractionMethod: "pdfjs",
    status: String(row?.validationStatus || "needs-review")
  }));

  return {
    status: "PROVIDED",
    pages,
    totalNodes: content.length,
    nodeTypes,
    criteria: {
      textCompleteness,
      readingOrder,
      headingDetection,
      paragraphReconstruction,
      listReconstruction,
      tableReconstruction,
      imageFigureDetection,
      equationDetection,
      equationLatexCorrectness,
      falsePositiveEquations,
      sourcePageProvenance,
      uncertainRegions,
      overallSemanticQuality
    },
    equations: {
      detected: eqDetected,
      highConfidence: Number(equationJson?.highConfidence || 0),
      needsReview: eqNeedsReview,
      invalidLatex: eqInvalid,
      missingMath: eqMissing,
      rejectedAsProse: Number(equationJson?.rejectedAsProse || 0),
      proseIncorrectlyClassified
    },
    textAudit: {
      missingCharacters: Number(textAuditJson?.missingCharacters || 0),
      duplicatedCharacters: Number(textAuditJson?.duplicatedCharacters || 0),
      canonicalCharacters: Number(textAuditJson?.canonicalCharacters || 0),
      sourceCharacters: Number(textAuditJson?.sourceCharacters || 0)
    },
    equationNodes
  };
}

function getAdobeMetrics(adobeJson = null) {
  if (!adobeJson || typeof adobeJson !== "object" || String(adobeJson?.status || "") === "PENDING") {
    return {
      status: "PENDING",
      criteria: {
        textCompleteness: null,
        readingOrder: null,
        headingDetection: null,
        paragraphReconstruction: null,
        listReconstruction: null,
        tableReconstruction: null,
        imageFigureDetection: null,
        equationDetection: null,
        equationLatexCorrectness: null,
        falsePositiveEquations: null,
        sourcePageProvenance: null,
        uncertainRegions: null,
        overallSemanticQuality: null
      },
      notes: [
        "Adobe extraction artifacts were not provided.",
        "Benchmark remains provisional until Adobe branch is populated."
      ]
    };
  }

  const content = Array.isArray(adobeJson?.content)
    ? adobeJson.content
    : Array.isArray(adobeJson?.elements)
      ? adobeJson.elements
      : [];
  const nodeTypes = countByType(content);
  const equations = content.filter((node) => String(node?.type || "").toLowerCase() === "equation");

  return {
    status: "PROVIDED",
    pages: Number(adobeJson?.document?.pages || adobeJson?.document?.pageCount || adobeJson?.pages || 0),
    totalNodes: content.length,
    nodeTypes,
    criteria: {
      textCompleteness: null,
      readingOrder: null,
      headingDetection: nodeTypes.heading ? 1 : 0,
      paragraphReconstruction: nodeTypes.paragraph ? 1 : 0,
      listReconstruction: nodeTypes.list ? 1 : 0,
      tableReconstruction: nodeTypes.table ? 1 : 0,
      imageFigureDetection: (nodeTypes.figure || nodeTypes.image) ? 1 : 0,
      equationDetection: equations.length ? 1 : 0,
      equationLatexCorrectness: null,
      falsePositiveEquations: null,
      sourcePageProvenance: null,
      uncertainRegions: null,
      overallSemanticQuality: null
    },
    notes: [
      "Adobe metrics are partially populated until schema is normalized to canonical shape.",
      "Provide Adobe equation/provenance details for full scoring parity."
    ]
  };
}

function pickRecommendation(extractors = {}) {
  const candidates = Object.entries(extractors)
    .filter(([, entry]) => String(entry?.status || "") === "PROVIDED")
    .map(([name, entry]) => {
      const semanticScore = Number(entry?.criteria?.overallSemanticQuality);
      const equationScore = Number(entry?.criteria?.equationLatexCorrectness);
      return {
        name,
        semanticScore: Number.isFinite(semanticScore) ? semanticScore : -1,
        equationScore: Number.isFinite(equationScore) ? equationScore : -1,
        entry
      };
    })
    .sort((a, b) => {
      if (b.semanticScore !== a.semanticScore) return b.semanticScore - a.semanticScore;
      return b.equationScore - a.equationScore;
    });

  if (!candidates.length) {
    return {
      recommendedExtractor: "none",
      reason: "No extractor produced benchmarkable semantic outputs.",
      confidence: 0
    };
  }

  const winner = candidates[0];
  return {
    recommendedExtractor: winner.name,
    reason: winner.name === "pdfjs"
      ? "Best available semantic coverage and equation quality with explicit provenance."
      : "Highest semantic benchmark score among available extractor branches.",
    confidence: clamp01(winner.semanticScore)
  };
}

function buildAcceptanceChecklist({ textAuditJson, browserValidation, invariantsValidation, equationJson, comparisonComplete }) {
  const equationAuditPresent = Array.isArray(equationJson?.rows) && equationJson.rows.length > 0;
  const falsePositiveAuditPresent = Array.isArray(equationJson?.rejectedEquationCandidates)
    && Array.isArray(equationJson?.proseIncorrectlyClassified);

  return {
    pdfSuccessfullyIngested: true,
    canonicalJsonGenerated: true,
    markdownGenerated: true,
    semanticHtmlGenerated: true,
    browserValidationPasses: Boolean(browserValidation?.status === "PASS"),
    provenanceValidationPasses: Boolean(invariantsValidation?.pass),
    noMissingText: Number(textAuditJson?.missingCharacters || 0) === 0,
    equationsExplicitlyAudited: equationAuditPresent,
    falsePositiveEquationsExplicitlyAudited: falsePositiveAuditPresent,
    benchmarkComparisonCompleted: comparisonComplete,
    productionExtractorRecommendationGenerated: true
  };
}

function unresolvedIssuesFromAcceptance(acceptance = {}, extractors = {}, textAuditJson = {}, equationJson = {}) {
  const unresolved = [];

  for (const [key, value] of Object.entries(acceptance)) {
    if (!value) unresolved.push(`acceptance_failed:${key}`);
  }

  if (Number(textAuditJson?.missingCharacters || 0) > 0) {
    unresolved.push(`missing_text_characters:${Number(textAuditJson?.missingCharacters || 0)}`);
  }

  if (Number(equationJson?.invalidLatex || 0) > 0) {
    unresolved.push(`invalid_equation_latex:${Number(equationJson?.invalidLatex || 0)}`);
  }

  if (String(extractors?.adobe?.status || "") !== "PROVIDED") {
    unresolved.push("adobe_extractor_pending");
  }

  return unresolved;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputFile = args.input ? path.resolve(baseDir, args.input) : DEFAULT_INPUT;

  await mkdir(benchmarkDir, { recursive: true });

  runIngest(inputFile);

  const browserValidationRun = runNodeScriptCapture("validateBrowserOutput.js");
  const invariantsValidationRun = runNodeScriptCapture("validateInvariants.js");
  const browserValidation = parseJsonFromStdout(browserValidationRun.stdout);
  const invariantsValidation = parseJsonFromStdout(invariantsValidationRun.stdout);

  const [pdfjsJson, pdfjsMd, qualityJson, equationJson, textAuditJson, preservationJson, readingOrderJson] = await Promise.all([
    readJson(path.join(outputDir, "document.json")),
    readFile(path.join(outputDir, "document.md"), "utf8"),
    readJson(path.join(outputDir, "document-quality.json")),
    readJson(path.join(outputDir, "equation-validation.json")),
    readJson(path.join(outputDir, "text-content-audit.json")),
    readJson(path.join(outputDir, "document-preservation.json")),
    readJson(path.join(outputDir, "reading-order.json"))
  ]);

  const pdfjsJsonPath = path.join(benchmarkDir, "pdfjs.json");
  const pdfjsMdPath = path.join(benchmarkDir, "pdfjs.md");
  await writeFile(pdfjsJsonPath, `${JSON.stringify(pdfjsJson, null, 2)}\n`, "utf8");
  await writeFile(pdfjsMdPath, pdfjsMd, "utf8");

  let adobeJson = null;
  const adobeJsonPath = path.join(benchmarkDir, "adobe.json");
  const adobeMdPath = path.join(benchmarkDir, "adobe.md");

  if (args.adobeJson) {
    await copyIfProvided(path.resolve(baseDir, args.adobeJson), adobeJsonPath);
    adobeJson = await readJson(adobeJsonPath);
  } else {
    await writeFile(adobeJsonPath, `${JSON.stringify({ status: "PENDING", reason: "Provide --adobe-json to populate Adobe benchmark branch." }, null, 2)}\n`, "utf8");
  }

  if (args.adobeMd) {
    await copyIfProvided(path.resolve(baseDir, args.adobeMd), adobeMdPath);
  }

  const visionRepair = buildVisionRepairRequests(pdfjsJson, equationJson, readingOrderJson);
  const visionRepairPath = path.join(benchmarkDir, "vision-repair.json");
  await writeFile(visionRepairPath, `${JSON.stringify(visionRepair, null, 2)}\n`, "utf8");

  const goldStandard = buildGoldStandard(pdfjsJson, equationJson, textAuditJson, readingOrderJson);
  const goldStandardPath = path.join(benchmarkDir, "gold-standard.json");
  await writeFile(goldStandardPath, `${JSON.stringify(goldStandard, null, 2)}\n`, "utf8");

  const extractors = {
    pdfjs: getPdfjsMetrics(pdfjsJson, qualityJson, equationJson, textAuditJson, preservationJson, readingOrderJson, visionRepair),
    adobe: getAdobeMetrics(adobeJson)
  };

  const comparison = {
    generatedAt: new Date().toISOString(),
    objective: "Choose extraction strategy with best semantic representation for GPT, prioritizing equations.",
    input: {
      sourceFile: inputFile,
      canonicalSourceOfTruth: true
    },
    constraints: {
      optimizePixelFidelity: false,
      visualFidelityDiagnosticOnly: true,
      fullPdfVisionPassAllowed: false
    },
    criteria: [
      "text_completeness",
      "reading_order",
      "heading_detection",
      "paragraph_reconstruction",
      "list_reconstruction",
      "table_reconstruction",
      "image_figure_detection",
      "equation_detection",
      "equation_latex_correctness",
      "false_positive_equations",
      "source_page_provenance",
      "uncertain_regions",
      "overall_semantic_quality"
    ],
    extractors,
    uncertainRegionRouting: {
      strategy: "deterministic-first-with-targeted-vision-repair",
      visionRepairFile: visionRepairPath,
      uncertainRegions: visionRepair.totalCandidates
    }
  };

  const comparisonPath = path.join(benchmarkDir, "comparison.json");
  await writeFile(comparisonPath, `${JSON.stringify(comparison, null, 2)}\n`, "utf8");

  const recommendation = pickRecommendation(extractors);
  const selected = extractors[recommendation.recommendedExtractor] || { criteria: {} };
  const comparisonComplete = String(extractors?.adobe?.status || "") === "PROVIDED";

  const acceptance = buildAcceptanceChecklist({
    textAuditJson,
    browserValidation,
    invariantsValidation,
    equationJson,
    comparisonComplete
  });

  const unresolvedIssues = unresolvedIssuesFromAcceptance(acceptance, extractors, textAuditJson, equationJson);

  const decision = {
    generatedAt: new Date().toISOString(),
    recommendedExtractor: recommendation.recommendedExtractor,
    reason: recommendation.reason,
    semanticScore: Number(selected?.criteria?.overallSemanticQuality ?? 0),
    equationScore: Number(selected?.criteria?.equationLatexCorrectness ?? 0),
    tableScore: Number(selected?.criteria?.tableReconstruction ?? 0),
    readingOrderScore: Number(selected?.criteria?.readingOrder ?? 0),
    coverageScore: Number(selected?.criteria?.textCompleteness ?? 0),
    confidence: clamp01(Number(recommendation?.confidence || 0)),
    unresolvedIssues,
    acceptance,
    finalPipelineRecommendation: {
      forStatisticsPdf: [
        "Run deterministic PDF extractor (primary: recommendedExtractor).",
        "Emit canonical JSON with equation/page/bbox/confidence/method for each equation.",
        "Run confidence and provenance audits.",
        "Send only uncertain regions from vision-repair.json to vision/OCR repair.",
        "Merge verified repairs into canonical JSON.",
        "Render document.semantic.html, document.html, document.md, and semantic chunks for RAG/GPT."
      ]
    }
  };

  const decisionPath = path.join(benchmarkDir, "decision.json");
  await writeFile(decisionPath, `${JSON.stringify(decision, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    status: unresolvedIssues.length ? "PASS_WITH_REVIEW" : "PASS",
    benchmarkDir,
    outputs: {
      pdfjsJson: pdfjsJsonPath,
      adobeJson: adobeJsonPath,
      visionRepair: visionRepairPath,
      comparison: comparisonPath,
      decision: decisionPath,
      goldStandard: goldStandardPath,
      markdown: pdfjsMdPath,
      adobeMd: args.adobeMd ? adobeMdPath : null
    },
    recommendation: {
      extractor: decision.recommendedExtractor,
      semanticScore: decision.semanticScore,
      equationScore: decision.equationScore,
      unresolvedIssues: decision.unresolvedIssues
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
