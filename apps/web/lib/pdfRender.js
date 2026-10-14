/**
 * A PDF as HTML with its embedded pictures (figures, diagrams, photos) kept as images, one section per page,
 * so the reader and the PDF/HTML exports show the real figures and not only a description of them.
 * Tiny images (icons, rules, bullets) are skipped; pictures are shrunk and the total is capped.
 */

export const MIN_IMAGE_SIDE = 80;
export const MAX_SIDE = 900;
export const MAX_IMAGES = 40;
export const MAX_TOTAL_BYTES = 3 * 1024 * 1024;

const esc = (value) => String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function toJpegDataUrl(data) {
  const sharp = (await import("sharp")).default;
  const out = await sharp(Buffer.from(data)).flatten({ background: "#ffffff" }).resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();
  return { url: `data:image/jpeg;base64,${out.toString("base64")}`, bytes: out.length };
}

/** @param {{ getText: Function, getImage: Function }} parser a pdf-parse PDFParse that has the file loaded */
export async function pdfToHtml(parser) {
  const textResult = await parser.getText();
  const imageResult = await parser.getImage({ imageThreshold: MIN_IMAGE_SIDE, imageBuffer: true, imageDataUrl: false });
  const imagesByPage = new Map();
  for (const page of imageResult?.pages || []) if (page.images?.length) imagesByPage.set(page.pageNumber, page.images);
  if (!imagesByPage.size) return { html: "", imageCount: 0, skipped: 0 };

  let total = 0;
  let imageCount = 0;
  let skipped = 0;
  const sections = [];
  for (const page of textResult?.pages || []) {
    const parts = String(page.text || "").split(/\n{2,}/).map((block) => block.replace(/\s+/g, " ").trim()).filter(Boolean).map((block) => `<p>${esc(block)}</p>`);
    for (const image of imagesByPage.get(page.num) || []) {
      if (imageCount >= MAX_IMAGES || total >= MAX_TOTAL_BYTES) { skipped += 1; continue; }
      try {
        const { url, bytes } = await toJpegDataUrl(image.data);
        if (total + bytes > MAX_TOTAL_BYTES) { skipped += 1; continue; }
        total += bytes;
        imageCount += 1;
        parts.push(`<figure><img alt="Figure on page ${page.num}" src="${url}" /></figure>`);
      } catch {
        skipped += 1;
      }
    }
    sections.push(`<section data-page="${page.num}">${parts.join("")}</section>`);
  }
  return { html: imageCount ? sections.join("\n") : "", imageCount, skipped };
}

