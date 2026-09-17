import path from "node:path";
import { readBinaryFile } from "../utils.js";
import { buildRawPdfPageModels, loadPdfForRawModel } from "../rawPageModel.js";

export async function ingestPdf(pdfPath, options = {}) {
  const absolute = path.resolve(pdfPath);
  const sourceBuffer = await readBinaryFile(absolute);
  const pdf = await loadPdfForRawModel(sourceBuffer);
  const rawPages = await buildRawPdfPageModels(pdf, options.rawModelOptions || {});

  return {
    source: {
      type: "pdf",
      path: absolute,
      sizeBytes: sourceBuffer.length,
      pageCount: rawPages.length
    },
    rawPages,
    pdf
  };
}
