import { buildCanonicalDocumentFromDocxFile, buildCanonicalDocumentFromExtraction } from "./canonical/model.js";
import { normalizeCanonicalDocument } from "./normalization/semanticNormalizer.js";
import { extractBaseDocument } from "./parsers/baseExtractor.js";
import { ComponentRegistry, DocumentPipelineRegistry, createPipelineSpec } from "./pipeline/components.js";
import { PipelineRegistry, createStage } from "./pipeline/registry.js";
import { renderCanonicalDocumentToHtml } from "./renderers/htmlRenderer.js";
import { renderCanonicalDocumentToMarkdown } from "./renderers/markdownRenderer.js";
import { renderCanonicalDocumentToText } from "./renderers/textRenderer.js";
import { buildCanonicalVerification, buildCanonicalVerificationMarkers } from "./verification/verification.js";
import { runAuxiliaryDocxPipeline } from "./parsers/auxiliaryDocxPipeline.js";

export const DOCUMENT_PROCESSING_PIPELINE_VERSION = "CDM_V2_REAL_PIPELINE_TEST_001";

function detectDocumentType(file = {}) {
  const name = String(file?.name || "").toLowerCase();
  const mime = String(file?.mimeType || "").toLowerCase();

  if (name.endsWith(".docx") || mime.includes("wordprocessingml")) return "docx";
  if (name.endsWith(".pdf") || mime === "application/pdf") return "pdf";
  if (name.endsWith(".pptx") || mime.includes("presentationml")) return "pptx";
  if (name.endsWith(".md") || name.endsWith(".markdown") || mime === "text/markdown") return "markdown";
  if (name.endsWith(".html") || name.endsWith(".htm") || mime === "text/html") return "html";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("text/")) return "text";
  return "unknown";
}

function collectLowConfidenceItems(canonicalDocument = {}, threshold = 0.85) {
  const lowConfidence = [];
  const equations = Array.isArray(canonicalDocument?.equations) ? canonicalDocument.equations : [];
  for (const equation of equations) {
    const confidence = Number(equation?.confidence);
    if (Number.isFinite(confidence) && confidence < threshold) {
      lowConfidence.push({
        kind: "equation",
        id: String(equation?.id || ""),
        confidence
      });
    }
  }

  const sections = Array.isArray(canonicalDocument?.sections) ? canonicalDocument.sections : [];
  for (const section of sections) {
    const blocks = Array.isArray(section?.blocks) ? section.blocks : [];
    for (const block of blocks) {
      const confidence = Number(block?.confidence);
      if (Number.isFinite(confidence) && confidence < threshold) {
        lowConfidence.push({
          kind: "block",
          type: String(block?.type || ""),
          nodePath: String(block?.nodePath || ""),
          confidence
        });
      }
    }
  }

  return lowConfidence;
}

function createEngine() {
  const registry = new PipelineRegistry();
  const parserRegistry = new ComponentRegistry("document parser");
  const rendererRegistry = new ComponentRegistry("renderer");
  const pipelineRegistry = new DocumentPipelineRegistry();

  parserRegistry
    .register({ id: "docx-ooxml-parser" })
    .register({ id: "generic-base-extractor" });

  rendererRegistry
    .register({ id: "cdm-html-renderer" })
    .register({ id: "cdm-markdown-renderer" })
    .register({ id: "cdm-text-renderer" });

  pipelineRegistry
    .register("docx", createPipelineSpec({
      parserId: "docx-ooxml-parser",
      rendererId: "cdm-html-renderer",
      validatorId: "canonical-verifier"
    }))
    .register("pdf", createPipelineSpec({
      parserId: "generic-base-extractor",
      rendererId: "cdm-html-renderer",
      validatorId: "canonical-verifier"
    }))
    .register("default", createPipelineSpec({
      parserId: "generic-base-extractor",
      rendererId: "cdm-html-renderer",
      validatorId: "canonical-verifier"
    }));

  registry.register(createStage("detect", async (context) => {
    const detectedType = detectDocumentType(context.file);
    return {
      ...context,
      detectedType,
      activePipeline: pipelineRegistry.get(detectedType),
      componentCatalog: {
        parsers: parserRegistry.list(),
        renderers: rendererRegistry.list(),
        pipelines: pipelineRegistry.listTypes()
      }
    };
  }));

  registry.register(createStage("base-extract", async (context) => {
    const extraction = await extractBaseDocument(context.file, {
      minConfidence: context.minConfidence,
      detectedType: context.detectedType,
      allowLegacyDocxFallback: Boolean(context?.options?.allowLegacyDocxFallback)
    });
    return {
      ...context,
      extraction
    };
  }));

  registry.register(createStage("canonical-model", async (context) => {
    const canonicalDocument = context.detectedType === "docx"
      ? await buildCanonicalDocumentFromDocxFile(context.file, context.extraction)
      : await buildCanonicalDocumentFromExtraction({
        file: context.file,
        extraction: context.extraction,
        detectedType: context.detectedType
      });

    return {
      ...context,
      canonicalDocument
    };
  }));

  registry.register(createStage("normalize", async (context) => {
    const normalizedCanonicalDocument = normalizeCanonicalDocument(context.canonicalDocument);
    return {
      ...context,
      rawCanonicalDocument: context.canonicalDocument,
      canonicalDocument: normalizedCanonicalDocument
    };
  }));

  registry.register(createStage("render", async (context) => {
    const html = renderCanonicalDocumentToHtml(context.canonicalDocument);
    const markdown = renderCanonicalDocumentToMarkdown(context.canonicalDocument);
    const text = renderCanonicalDocumentToText(context.canonicalDocument);

    return {
      ...context,
      extraction: {
        ...(context.extraction || {}),
        text,
        markdown,
        sourceRenderHtml: html
      },
      rendered: {
        html,
        markdown,
        text
      }
    };
  }));

  registry.register(createStage("verify", async (context) => {
    const verification = buildCanonicalVerification(context.canonicalDocument, context.extraction);

    return {
      ...context,
      canonicalVerification: verification,
      canonicalVerificationMarkers: buildCanonicalVerificationMarkers(verification)
    };
  }));

  return registry;
}

const engine = createEngine();

export async function processUploadedDocument(file, options = {}) {
  const processingRunId = crypto.randomUUID();
  const PIPELINE_DIAGNOSTIC = {
    version: DOCUMENT_PROCESSING_PIPELINE_VERSION,
    timestamp: new Date().toISOString()
  };
  const minConfidence = Number(options?.minConfidence || 0.72);
  const confidenceReviewThreshold = Number(options?.confidenceReviewThreshold || 0.85);

  const detectedType = detectDocumentType(file);
  if (detectedType === "docx") {
    const extracted = await runAuxiliaryDocxPipeline(file);
    return {
      ...extracted,
      processingRunId,
      processingPipelineVersion: "auxiliary-docx-json-extractor-v1",
      pipelineDiagnostic: PIPELINE_DIAGNOSTIC,
      pipelineStageTrace: [
        "[STAGE 1] DOCX UPLOAD",
        "[STAGE 2] AUXILIARY OOXML PARSER",
        "[STAGE 3] AUXILIARY HTML/MARKDOWN RENDER"
      ],
      processingSummary: {
        schemaVersion: String(extracted?.canonicalDocument?.schemaVersion || ""),
        cdmVersion: "auxiliary-docx-tree",
        blockCount: Array.isArray(extracted?.canonicalDocument?.body?.children)
          ? extracted.canonicalDocument.body.children.length
          : 0,
        equationCount: Number(extracted?.canonicalVerification?.sourceCounts?.equations || 0),
        headingCount: 0
      },
      confidenceSignals: []
    };
  }

  const context = await engine.run({
    file,
    minConfidence,
    options
  });

  const extraction = context.extraction || {};
  const verification = context.canonicalVerification || null;
  const markers = [
    ...(Array.isArray(extraction.riskMarkers) ? extraction.riskMarkers : []),
    ...(Array.isArray(context.canonicalVerificationMarkers) ? context.canonicalVerificationMarkers : [])
  ];
  const issues = [
    ...(Array.isArray(extraction.issues) ? extraction.issues : []),
    ...(verification && !verification.gatePassed ? ["canonical-document-verification-failed"] : [])
  ];
  const lowConfidenceItems = collectLowConfidenceItems(context.canonicalDocument, confidenceReviewThreshold);
  const confidenceMarkers = lowConfidenceItems.map((item, index) => ({
    id: `CDM-C${index + 1}`,
    type: "confidence-review",
    severity: "medium",
    label: item.kind === "equation" ? `Low confidence equation ${item.id}` : `Low confidence block ${item.type}`,
    excerpt: item.nodePath || item.id || item.type || "",
    formula: null,
    confidence: item.confidence
  }));
  if (lowConfidenceItems.length) {
    issues.push("canonical-low-confidence-content");
  }

  return {
    ...extraction,
    method: extraction.method || context.detectedType || "unknown",
    text: String(context?.rendered?.text || extraction.text || "").trim(),
    markdown: String(context?.rendered?.markdown || extraction.markdown || "").trim(),
    sourceRenderHtml: String(context?.rendered?.html || extraction.sourceRenderHtml || "").trim(),
    canonicalDocument: context.canonicalDocument,
    canonicalVerification: verification,
    componentCatalog: context.componentCatalog,
    activePipeline: context.activePipeline,
    processingRunId,
    processingPipelineVersion: DOCUMENT_PROCESSING_PIPELINE_VERSION,
    pipelineDiagnostic: PIPELINE_DIAGNOSTIC,
    pipelineStageTrace: [
      "[STAGE 1] DOCX UPLOAD",
      "[STAGE 2] OOXML PARSER",
      "[STAGE 3] CDM V2",
      "[STAGE 4] SEMANTIC NORMALIZER",
      "[STAGE 5] MATH SERVICE",
      "[STAGE 6] MARKDOWN RENDERER",
      "[STAGE 7] FINAL OUTPUT"
    ],
    processingSummary: {
      schemaVersion: String(context?.canonicalDocument?.schemaVersion || ""),
      cdmVersion: String(context?.canonicalDocument?.schema_version || ""),
      blockCount: Number(context?.canonicalDocument?.stats?.block_count || 0),
      equationCount: Number(context?.canonicalDocument?.stats?.equation_count || 0),
      headingCount: Array.isArray(context?.canonicalDocument?.sections)
        ? context.canonicalDocument.sections.reduce((sum, section) => sum + (Array.isArray(section?.blocks) ? section.blocks.filter((block) => block?.type === "heading").length : 0), 0)
        : 0
    },
    confidenceSignals: lowConfidenceItems,
    riskMarkers: [...markers, ...confidenceMarkers],
    issues: Array.from(new Set(issues)),
    requiresReview: Boolean(extraction.requiresReview)
      || Boolean(verification && !verification.gatePassed)
      || Boolean(lowConfidenceItems.length)
  };
}

export function listDocumentProcessingStages() {
  return engine.listStageIds();
}
