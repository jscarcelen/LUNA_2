import JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom";

/**
 * A PowerPoint file as HTML with its pictures embedded (data: URIs), one section per slide, so the reader and
 * the PDF/HTML exports show the real figures and not only a description of them.
 * Pictures are shrunk (longest side MAX_SIDE) and the total is capped so the stored document stays small.
 */

export const MAX_SIDE = 900;
export const MAX_IMAGE_BYTES = 350 * 1024;
export const MAX_TOTAL_BYTES = 2.5 * 1024 * 1024;
const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml" };

const parse = (xml) => new DOMParser({ errorHandler: { warning() {}, error() {}, fatalError() {} } }).parseFromString(xml, "text/xml");
const esc = (value) => String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slideNumber = (path) => Number(/slide(\d+)\.xml$/.exec(path)?.[1] || 0);

async function shrink(buffer, extension) {
  if (extension === "svg" || extension === "gif") return { buffer, extension };
  try {
    const sharp = (await import("sharp")).default;
    const out = await sharp(buffer).rotate().resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();
    return out.length < buffer.length || buffer.length > MAX_IMAGE_BYTES ? { buffer: out, extension: "jpeg" } : { buffer, extension };
  } catch {
    return { buffer, extension };
  }
}

/** @returns {Promise<{ html: string, imageCount: number, skipped: number }>} */
export async function pptxToHtml(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const slides = Object.keys(zip.files).filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path)).sort((a, b) => slideNumber(a) - slideNumber(b));
  let total = 0;
  let imageCount = 0;
  let skipped = 0;
  const sections = [];
  for (const path of slides) {
    const number = slideNumber(path);
    const relsFile = zip.file(`ppt/slides/_rels/slide${number}.xml.rels`);
    const targets = new Map();
    if (relsFile) {
      for (const rel of Array.from(parse(await relsFile.async("string")).getElementsByTagName("Relationship"))) targets.set(rel.getAttribute("Id"), rel.getAttribute("Target"));
    }
    const doc = parse(await zip.file(path).async("string"));
    const parts = [];
    const walk = async (node) => {
      for (const child of Array.from(node.childNodes || [])) {
        if (child.nodeType !== 1) continue;
        const name = child.localName || child.nodeName;
        if (name === "p" && (child.namespaceURI || "").includes("drawingml")) {
          const text = Array.from(child.getElementsByTagName("a:t")).map((t) => t.textContent).join("").trim();
          if (text) parts.push(`<p>${esc(text)}</p>`);
          continue;
        }
        if (name === "blip") {
          const target = targets.get(child.getAttribute("r:embed"));
          const mediaPath = target ? `ppt/${target.replace(/^(\.\.\/)+/, "")}` : "";
          const file = mediaPath ? zip.file(mediaPath) : null;
          const extension = mediaPath.split(".").pop().toLowerCase();
          if (file && MIME[extension]) {
            const small = await shrink(await file.async("nodebuffer"), extension);
            if (total + small.buffer.length > MAX_TOTAL_BYTES) { skipped += 1; continue; }
            total += small.buffer.length;
            imageCount += 1;
            parts.push(`<figure><img alt="Slide ${number} picture" src="data:${MIME[small.extension]};base64,${small.buffer.toString("base64")}" /></figure>`);
          }
          continue;
        }
        await walk(child);
      }
    };
    await walk(doc.documentElement);
    sections.push(`<section data-page="${number}"><h2>Slide ${number}</h2>${parts.join("")}</section>`);
  }
  return { html: sections.join("\n"), imageCount, skipped };
}
