import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Document, Packer, Paragraph, TextRun, AlignmentType, ImageRun } from "docx";
import { layoutDocument, lineHeightMm } from "./docModel.js";

const MM_TO_PT = 72 / 25.4;
const FONT_STACKS = {
  sans: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, 'Segoe UI', Helvetica, Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "'SF Mono', Menlo, Consolas, monospace"
};

function escapeHtml(value = "") {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function hexToRgb(hex = "#1d1d1f") {
  const normalized = String(hex || "").replace("#", "");
  const full = normalized.length === 3 ? normalized.split("").map((char) => char + char).join("") : normalized;
  const value = parseInt(full, 16);
  if (Number.isNaN(value) || full.length !== 6) return null;
  return { r: ((value >> 16) & 255) / 255, g: ((value >> 8) & 255) / 255, b: (value & 255) / 255 };
}

/* ------------------------------------------------------------------------------ HTML */

export function renderDocHtml(template, data = {}, { showFieldMarkers = false, prelaid = null } = {}) {
  const { pages } = prelaid || layoutDocument(template, data);
  const pageHtml = pages.map((page) => {
    const bg = page.background?.src ? `<img src="${escapeHtml(page.background.src)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:fill;pointer-events:none;opacity:${page.background.opacity ?? 1};" />` : "";
    const pageColor = page.background?.color || "#fff";
    const items = page.items.map((item) => {
      const base = `position:absolute;left:${item.x}mm;top:${item.y}mm;width:${item.w}mm;`;
      if (item.type === "rect") return `<div style="${base}height:${item.h}mm;background:${item.style.fill || "transparent"};border:${item.style.stroke ? `${item.style.strokeWidth || 0.3}mm solid ${item.style.stroke}` : "0"};border-radius:${item.ellipse ? "50%" : `${item.style.radius || 0}mm`};opacity:${item.style.opacity ?? 1};"></div>`;
      if (item.type === "line") return `<div style="${base}height:0;border-top:${Math.max(0.3, item.h)}mm solid ${item.style.stroke || "#d2d2d7"};"></div>`;
      if (item.type === "image") return item.src ? `<img src="${escapeHtml(item.src)}" alt="" style="${base}height:${item.h}mm;object-fit:contain;" />` : `<div style="${base}height:${item.h}mm;border:0.3mm dashed #c7c7cc;border-radius:1mm;"></div>`;
      const marker = showFieldMarkers && item.isField ? `<span style="position:absolute;top:-3.2mm;left:0;font-size:6pt;color:#0060c0;background:#eef2ff;padding:0 1mm;border-radius:1mm;">AI · ${escapeHtml(item.path)}</span>` : "";
      const fieldStyle = item.isField && !item.hasValue ? "color:#0060c0;background:rgba(0,113,227,0.06);border-radius:1mm;" : "";
      return `<div style="${base}min-height:${item.h}mm;font-family:${FONT_STACKS[item.style.fontFamily] || FONT_STACKS.sans};font-size:${item.style.fontSize}pt;font-weight:${item.style.fontWeight === "bold" ? 700 : 400};color:${item.style.color};text-align:${item.style.align};line-height:${item.style.lineHeight};white-space:pre-wrap;word-wrap:break-word;${fieldStyle}">${marker}${item.lines.map(escapeHtml).join("\n")}</div>`;
    }).join("\n");
    return `<section class="doc-page" style="position:relative;width:${page.width}mm;height:${page.height}mm;background:${pageColor};overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.12);margin:0 auto 10mm;page-break-after:always;">${bg}${items}</section>`;
  }).join("\n");
  return `<style>@media print{.doc-page{box-shadow:none;margin:0;}}</style><div class="doc-pages">${pageHtml}</div>`;
}

export function wrapDocHtml(fragment, { forPrint = false } = {}) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:${forPrint ? "#fff" : "#e9e9ee"};}body{padding:${forPrint ? 0 : "10mm"};}@page{margin:0;}</style></head><body>${fragment}</body></html>`;
}

/* ------------------------------------------------------------------------------ PDF */

async function embedImage(pdf, src) {
  if (!src) return null;
  try {
    if (src.startsWith("data:image/png")) return await pdf.embedPng(Buffer.from(src.split(",")[1], "base64"));
    if (src.startsWith("data:image/jpeg") || src.startsWith("data:image/jpg")) return await pdf.embedJpg(Buffer.from(src.split(",")[1], "base64"));
    if (/^https?:\/\//.test(src)) {
      const response = await fetch(src);
      const bytes = Buffer.from(await response.arrayBuffer());
      const type = response.headers.get("content-type") || "";
      return type.includes("png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    }
  } catch {
    return null;
  }
  return null;
}

export async function renderDocPdfBuffer(template, data = {}, { prelaid = null } = {}) {
  const { size, pages } = prelaid || layoutDocument(template, data);
  const pdf = await PDFDocument.create();
  const fonts = {
    sans: await pdf.embedFont(StandardFonts.Helvetica),
    sansBold: await pdf.embedFont(StandardFonts.HelveticaBold),
    serif: await pdf.embedFont(StandardFonts.TimesRoman),
    serifBold: await pdf.embedFont(StandardFonts.TimesRomanBold),
    mono: await pdf.embedFont(StandardFonts.Courier),
    monoBold: await pdf.embedFont(StandardFonts.CourierBold)
  };
  const pageW = size.width * MM_TO_PT;
  const pageH = size.height * MM_TO_PT;
  const imageCache = new Map();
  const getImage = async (src) => {
    if (!imageCache.has(src)) imageCache.set(src, await embedImage(pdf, src));
    return imageCache.get(src);
  };

  for (const page of pages) {
    const pdfPage = pdf.addPage([pageW, pageH]);
    if (page.background?.src) {
      const image = await getImage(page.background.src);
      if (image) pdfPage.drawImage(image, { x: 0, y: 0, width: pageW, height: pageH });
    }
    for (const item of page.items) {
      const x = item.x * MM_TO_PT;
      const top = item.y * MM_TO_PT;
      const w = item.w * MM_TO_PT;
      const h = item.h * MM_TO_PT;
      if (item.type === "rect") {
        const fill = hexToRgb(item.style.fill);
        const stroke = hexToRgb(item.style.stroke);
        pdfPage.drawRectangle({ x, y: pageH - top - h, width: w, height: h, color: fill ? rgb(fill.r, fill.g, fill.b) : undefined, borderColor: stroke ? rgb(stroke.r, stroke.g, stroke.b) : undefined, borderWidth: stroke ? 0.8 : 0, opacity: fill ? 1 : 0, borderOpacity: stroke ? 1 : 0 });
        continue;
      }
      if (item.type === "line") {
        const stroke = hexToRgb(item.style.stroke) || { r: 0.82, g: 0.82, b: 0.84 };
        pdfPage.drawLine({ start: { x, y: pageH - top }, end: { x: x + w, y: pageH - top }, thickness: Math.max(0.5, item.h * MM_TO_PT), color: rgb(stroke.r, stroke.g, stroke.b) });
        continue;
      }
      if (item.type === "image") {
        const image = item.src ? await getImage(item.src) : null;
        if (image) {
          const scale = Math.min(w / image.width, h / image.height);
          const drawW = image.width * scale;
          const drawH = image.height * scale;
          pdfPage.drawImage(image, { x: x + (w - drawW) / 2, y: pageH - top - h + (h - drawH) / 2, width: drawW, height: drawH });
        }
        continue;
      }
      const family = item.style.fontFamily === "serif" ? "serif" : item.style.fontFamily === "mono" ? "mono" : "sans";
      const font = fonts[`${family}${item.style.fontWeight === "bold" ? "Bold" : ""}`];
      const fontSize = Number(item.style.fontSize) || 11;
      const color = hexToRgb(item.style.color) || { r: 0.11, g: 0.11, b: 0.12 };
      const lh = lineHeightMm(item.style) * MM_TO_PT;
      let cursorY = pageH - top - fontSize;
      for (const rawLine of item.lines) {
        // Re-wrap with real glyph metrics so PDF lines never overflow the box.
        const words = String(rawLine).split(/\s+/);
        let line = "";
        const flush = () => {
          const textWidth = font.widthOfTextAtSize(line, fontSize);
          const offset = item.style.align === "center" ? (w - textWidth) / 2 : item.style.align === "right" ? w - textWidth : 0;
          pdfPage.drawText(line, { x: x + Math.max(0, offset), y: cursorY, size: fontSize, font, color: rgb(color.r, color.g, color.b) });
          cursorY -= lh;
          line = "";
        };
        for (const word of words) {
          const candidate = line ? `${line} ${word}` : word;
          if (font.widthOfTextAtSize(candidate, fontSize) > w && line) flush();
          line = line ? `${line} ${word}` : word;
        }
        if (line || !words.length) flush();
      }
    }
  }
  return Buffer.from(await pdf.save());
}

/* ------------------------------------------------------------------------------ DOCX (flow approximation) */

export async function renderDocDocxBuffer(template, data = {}, { prelaid = null } = {}) {
  const { pages } = prelaid || layoutDocument(template, data);
  const children = [];
  for (const [pageIndex, page] of pages.entries()) {
    if (pageIndex > 0) children.push(new Paragraph({ pageBreakBefore: true, children: [] }));
    const ordered = [...page.items].filter((item) => item.type !== "rect" && item.type !== "line").sort((a, b) => a.y - b.y || a.x - b.x);
    for (const item of ordered) {
      if (item.type === "image") {
        if (item.src && item.src.startsWith("data:image/")) {
          try {
            children.push(new Paragraph({ children: [new ImageRun({ data: Buffer.from(item.src.split(",")[1], "base64"), transformation: { width: Math.round(item.w * 3.78), height: Math.round(item.h * 3.78) } })] }));
          } catch {
            // unsupported image
          }
        }
        continue;
      }
      const alignment = item.style.align === "center" ? AlignmentType.CENTER : item.style.align === "right" ? AlignmentType.RIGHT : AlignmentType.LEFT;
      for (const line of item.lines) {
        children.push(new Paragraph({
          alignment,
          spacing: { after: 40 },
          children: [new TextRun({ text: line, bold: item.style.fontWeight === "bold", size: Math.round((Number(item.style.fontSize) || 11) * 2), color: String(item.style.color || "#1d1d1f").replace("#", ""), font: item.style.fontFamily === "serif" ? "Georgia" : item.style.fontFamily === "mono" ? "Courier New" : "Calibri" })]
        }));
      }
    }
  }
  const document = new Document({ sections: [{ children: children.length ? children : [new Paragraph({ children: [new TextRun("")] })] }] });
  return Buffer.from(await Packer.toBuffer(document));
}

/* ------------------------------------------------------------------------------ PPTX */

export async function renderDocPptxBuffer(template, data = {}, { prelaid = null } = {}) {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const { size, pages } = prelaid || layoutDocument(template, data);
  const pptx = new PptxGenJS();
  const toIn = (mm) => mm / 25.4;
  pptx.defineLayout({ name: "LUNA", width: toIn(size.width), height: toIn(size.height) });
  pptx.layout = "LUNA";
  for (const page of pages) {
    const slide = pptx.addSlide();
    if (page.background?.src) slide.background = { data: page.background.src };
    for (const item of page.items) {
      const box = { x: toIn(item.x), y: toIn(item.y), w: toIn(item.w), h: toIn(Math.max(item.h, 2)) };
      if (item.type === "rect") {
        slide.addShape(pptx.ShapeType.roundRect, { ...box, fill: item.style.fill ? { color: item.style.fill.replace("#", "") } : { type: "none" }, line: item.style.stroke ? { color: item.style.stroke.replace("#", ""), width: 0.75 } : { type: "none" }, rectRadius: 0.05 });
        continue;
      }
      if (item.type === "line") {
        slide.addShape(pptx.ShapeType.line, { x: box.x, y: box.y, w: box.w, h: 0, line: { color: (item.style.stroke || "#d2d2d7").replace("#", ""), width: 0.75 } });
        continue;
      }
      if (item.type === "image") {
        if (item.src) slide.addImage({ ...box, data: item.src.startsWith("data:") ? item.src : undefined, path: item.src.startsWith("data:") ? undefined : item.src, sizing: { type: "contain", w: box.w, h: box.h } });
        continue;
      }
      slide.addText(item.lines.join("\n"), { ...box, fontSize: Number(item.style.fontSize) || 11, bold: item.style.fontWeight === "bold", color: String(item.style.color || "#1d1d1f").replace("#", ""), align: item.style.align || "left", valign: "top", fontFace: item.style.fontFamily === "serif" ? "Georgia" : item.style.fontFamily === "mono" ? "Courier New" : "Calibri", margin: 0 });
    }
  }
  const output = await pptx.write({ outputType: "nodebuffer" });
  return Buffer.from(output);
}
