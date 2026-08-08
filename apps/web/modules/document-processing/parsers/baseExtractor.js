import { extractTextFromUploadedFile } from "../../../lib/fileTextExtraction.js";
import JSZip from "jszip";

function decodeXmlEntities(text = "") {
  return String(text || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function stripXml(value = "") {
  return decodeXmlEntities(String(value || "")
    .replace(/<w:tab\s*\/?\s*>/g, " ")
    .replace(/<w:br\s*\/?\s*>/g, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

async function inspectDocxSource(contentBase64 = "") {
  try {
    const buffer = Buffer.from(String(contentBase64 || ""), "base64");
    if (!buffer.length) {
      return { sourcePreview: "", sourceEquationCount: 0, sourceTableCount: 0, sourceTextLength: 0 };
    }

    const zip = await JSZip.loadAsync(buffer);
    const docXml = await zip.file("word/document.xml")?.async("string");
    const source = String(docXml || "");
    const fullText = stripXml(source);
    const sourcePreview = fullText.slice(0, 1000);
    const sourceEquationCount = (source.match(/<m:oMath\b|<m:oMathPara\b/g) || []).length;
    const sourceTableCount = (source.match(/<w:tbl\b/g) || []).length;

    return {
      sourcePreview,
      sourceEquationCount,
      sourceTableCount,
      sourceTextLength: fullText.length
    };
  } catch {
    return { sourcePreview: "", sourceEquationCount: 0, sourceTableCount: 0, sourceTextLength: 0 };
  }
}

export async function extractBaseDocument(file = {}, { minConfidence = 0.72, detectedType = "unknown", allowLegacyDocxFallback = false } = {}) {
  if (detectedType === "docx") {
    const {
      sourcePreview,
      sourceEquationCount,
      sourceTableCount,
      sourceTextLength
    } = await inspectDocxSource(file?.contentBase64);

    if (!sourcePreview && allowLegacyDocxFallback) {
      const legacyExtraction = await extractTextFromUploadedFile(file, { minConfidence });
      return {
        ...legacyExtraction,
        method: "docx-legacy-adapter",
        issues: Array.from(new Set([...(legacyExtraction.issues || []), "legacy-docx-adapter-path"]))
      };
    }

    return {
      method: "docx-ooxml-cdm",
      confidence: 1,
      issues: sourcePreview ? [] : ["docx-source-preview-unavailable"],
      riskMarkers: [],
      verification: {
        sourceCounts: {
          equations: sourceEquationCount,
          tables: sourceTableCount,
          textLength: sourceTextLength
        }
      },
      sourcePreview,
      sourceMimeType: String(file?.mimeType || "application/vnd.openxmlformats-officedocument.wordprocessingml.document").trim().toLowerCase(),
      sourceContentBase64: String(file?.contentBase64 || ""),
      sourceRenderHtml: "",
      markdown: "",
      text: "",
      requiresReview: false,
      generatedPdfContentBase64: ""
    };
  }

  return extractTextFromUploadedFile(file, { minConfidence });
}
