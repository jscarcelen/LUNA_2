import path from "node:path";
import { writeFile } from "node:fs/promises";
import { buildCanonicalPageModelFromPdf } from "../canonical/canonicalPageModel.js";
import { annotateTextInterpretation } from "../interpretation/text.js";
import { annotateMathInterpretation } from "../interpretation/math.js";
import { annotateTableInterpretation } from "../interpretation/tables.js";
import { classifyDocumentRegions } from "../interpretation/regions.js";
import { renderSemanticPageHtml } from "../rendering/semantic/htmlRenderer.js";
import { renderFidelityPageHtml } from "../rendering/fidelity/htmlRenderer.js";
import { validateSchema } from "../validation/schema.js";
import { validateProvenanceInvariants } from "../validation/invariants.js";
import { ensureDir, writeJson } from "../utils.js";

export async function runPdfPipeline(sourceFile, options = {}) {
  const baseDir = process.cwd();
  const outputDir = options.outputDir || path.join(baseDir, "output");

  await ensureDir(outputDir);

  const model = await buildCanonicalPageModelFromPdf(sourceFile);
  const documentTree = annotateTableInterpretation(
    annotateMathInterpretation(
      classifyDocumentRegions(
        annotateTextInterpretation(model.documentTree)
      )
    )
  );

  const schema = validateSchema(documentTree);
  const invariants = validateProvenanceInvariants(documentTree, model.rawPages || []);

  const semanticHtml = renderSemanticPageHtml(documentTree);
  const fidelityHtml = renderFidelityPageHtml(documentTree);

  await writeJson(path.join(outputDir, "document.json"), documentTree);
  await writeJson(path.join(outputDir, "document.summary.json"), model.summary || {});
  await writeJson(path.join(outputDir, "raw-pages.json"), {
    schemaVersion: "raw-pdf-page-model-v1",
    sourceFile,
    pages: model.rawPages || []
  });
  await writeJson(path.join(outputDir, "text-paints.json"), {
    sourceFile,
    pages: model.textPaintPages || []
  });
  await writeJson(path.join(outputDir, "loss-accounting.json"), {
    sourceFile,
    statuses: model.lossAccounting || []
  });

  await writeFile(path.join(outputDir, "document.semantic.html"), semanticHtml, "utf8");
  await writeFile(path.join(outputDir, "document.fidelity.html"), fidelityHtml, "utf8");

  return {
    documentTree,
    schema,
    invariants
  };
}
