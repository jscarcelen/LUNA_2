import { extractPdfDocument } from "../extractPdf.js";
import { buildPdfEvidenceLayer } from "../source/pdfSourceModel.js";
import { ensureCanonicalProvenance } from "./provenance.js";

export async function buildCanonicalPageModelFromPdf(sourceFile) {
  const extracted = await extractPdfDocument(sourceFile);
  const evidenceLayer = buildPdfEvidenceLayer(extracted.rawPages || []);

  const documentTree = {
    ...extracted.documentTree,
    evidenceLayer,
    interpretationPolicy: {
      preserveEvidence: true,
      semanticIsAdvisory: true,
      visualIsAuthoritative: true
    }
  };

  const provenanceCheck = ensureCanonicalProvenance(documentTree);
  return {
    documentTree,
    summary: extracted.summary,
    rawPages: extracted.rawPages,
    textPaintPages: extracted.textPaintPages,
    lossAccounting: extracted.lossAccounting,
    provenanceCheck
  };
}
