import path from "node:path";
import { readBinaryFile } from "../utils.js";

export async function ingestImagePages(inputPages = []) {
  const pages = [];
  for (let index = 0; index < inputPages.length; index += 1) {
    const page = inputPages[index] || {};
    const absPath = path.resolve(String(page.path || ""));
    const bytes = await readBinaryFile(absPath);
    pages.push({
      id: `image-page-${index + 1}`,
      pageNumber: Number(page.pageNumber || index + 1),
      sourceType: "image",
      path: absPath,
      sizeBytes: bytes.length,
      width: Number(page.width || 0),
      height: Number(page.height || 0),
      ocr: Array.isArray(page.ocr) ? page.ocr : []
    });
  }
  return {
    source: { type: "image", pageCount: pages.length },
    pages
  };
}
