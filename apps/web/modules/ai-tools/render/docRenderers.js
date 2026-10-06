import { PDFDocument, PDFString, StandardFonts, degrees, rgb } from "pdf-lib";
import { Document, ExternalHyperlink, Packer, Paragraph, TextRun, AlignmentType, ImageRun } from "docx";
import { texToDocxMath } from "./docxMath.js";
import { layoutDocument, lineHeightMm } from "./docModel.js";
import { mathSpanHtml, mathStyleTag } from "./mathHtml.js";
import { drawMathBox, embedMathFonts, pdfMathBox } from "./pdfMath.js";
import { latexToUnicode } from "../../template-studio/engine/math/unicode";

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

/** `/source?…` links are the ones that open an original document: the app reader can take them over. */
const isSourceHref = (href) => /\/source\?/.test(String(href || ""));

/** Segments of one laid-out line: prose, KaTeX formulas, links. */
function richSegHtml(seg) {
  if (seg.t === "math") return mathSpanHtml(seg);
  if (seg.t === "link") return `<a href="${escapeHtml(seg.href)}" target="_blank" rel="noopener noreferrer"${isSourceHref(seg.href) ? " data-luna-source" : ""}>${escapeHtml(seg.text)}</a>`;
  return escapeHtml(seg.text);
}

/** A text item that carries formulas / links: one block per laid-out line, at the height the layout reserved for it. */
function richItemHtml(item) {
  return item.math.lines.map((line) => `<div class="lm${line.display ? " lm-d" : ""}" style="min-height:${Number(line.pitch).toFixed(2)}mm">${line.segs.length ? line.segs.map(richSegHtml).join("") : "&nbsp;"}</div>`).join("");
}

/**
 * Inside the app a source link should open the document reader instead of a new tab. The preview
 * iframe is sandboxed (no same-origin access), so the link posts a message to the page that hosts it.
 */
const SOURCE_LINK_SCRIPT = `<script>document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a[data-luna-source]");if(!a)return;try{var u=new URL(a.href);var p=u.searchParams;parent.postMessage({type:"luna-open-source",documentId:p.get("d")||"",page:p.get("p")||"",section:p.get("s")||"",chunk:p.get("c")||"",quote:p.get("q")||"",href:a.href},"*");e.preventDefault();}catch(x){}});</script>`;

export function renderDocHtml(template, data = {}, { showFieldMarkers = false, prelaid = null, highlight = [], interactiveLinks = false } = {}) {
  const { pages } = prelaid || layoutDocument(template, data);
  // Fields the user is inspecting: every place they fill is outlined, wherever it appears.
  const highlighted = new Set(highlight.map((value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "")).filter(Boolean));
  const isHighlighted = (item) => highlighted.size > 0 && item.isField && [item.path, item.fieldId].some((value) => value && highlighted.has(String(value).toLowerCase().replace(/[^a-z0-9]+/g, "")));
  const pageHtml = pages.map((page) => {
    const bg = page.background?.src ? `<img src="${escapeHtml(page.background.src)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:fill;pointer-events:none;opacity:${page.background.opacity ?? 1};" />` : "";
    const pageColor = page.background?.color || "#fff";
    const items = page.items.map((item) => {
      const base = `position:absolute;left:${item.x}mm;top:${item.y}mm;width:${item.w}mm;`;
      if (item.type === "rect") return `<div style="${base}height:${item.h}mm;background:${item.style.fill || "transparent"};border:${item.style.stroke ? `${item.style.strokeWidth || 0.3}mm solid ${item.style.stroke}` : "0"};border-radius:${item.ellipse ? "50%" : item.style.squareLeft ? `0 ${item.style.radius || 0}mm ${item.style.radius || 0}mm 0` : `${item.style.radius || 0}mm`};opacity:${item.style.opacity ?? 1};"></div>`;
      if (item.type === "line") return `<div style="${base}height:0;border-top:${Math.max(0.3, item.h)}mm solid ${item.style.stroke || "#d2d2d7"};"></div>`;
      if (item.type === "image") return item.src ? `<img src="${escapeHtml(item.src)}" alt="" style="${base}height:${item.h}mm;object-fit:contain;" />` : `<div style="${base}height:${item.h}mm;border:0.3mm dashed #c7c7cc;border-radius:1mm;"></div>`;
      const marker = showFieldMarkers && item.isField ? `<span style="position:absolute;top:-3.2mm;left:0;font-size:6pt;color:#0060c0;background:#eef2ff;padding:0 1mm;border-radius:1mm;">AI · ${escapeHtml(item.path)}</span>` : "";
      const fieldStyle = `${item.isField && !item.hasValue ? "color:#0060c0;background:rgba(0,113,227,0.06);border-radius:1mm;" : ""}${isHighlighted(item) ? "box-shadow:0 0 0 0.6mm rgba(0,113,227,0.85);background:rgba(0,113,227,0.12);border-radius:1mm;" : ""}`;
      const deg = Number(item.style.rotate) || 0;
      if (deg) {
        // Rotated label: a vertical box (the unrotated frame turned about its centre) written top→bottom (-90) or bottom→top (90).
        const left = item.x + item.w / 2 - item.h / 2;
        const top = item.y + item.h / 2 - item.w / 2;
        const mode = deg < 0 ? "writing-mode:vertical-rl;" : "writing-mode:vertical-rl;transform:rotate(180deg);";
        return `<div style="position:absolute;left:${left}mm;top:${top}mm;width:${item.h}mm;height:${item.w}mm;${mode}display:flex;align-items:center;justify-content:${item.style.align === "center" ? "center" : item.style.align === "right" ? "flex-end" : "flex-start"};font-family:${FONT_STACKS[item.style.fontFamily] || FONT_STACKS.sans};font-size:${item.style.fontSize}pt;font-weight:${item.style.fontWeight === "bold" ? 700 : 400};color:${item.style.color};line-height:${item.style.lineHeight};white-space:nowrap;overflow:hidden;">${item.lines.map(escapeHtml).join(" ")}</div>`;
      }
      const content = item.math ? richItemHtml(item) : item.lines.map(escapeHtml).join("\n");
      return `<div style="${base}min-height:${item.h}mm;font-family:${FONT_STACKS[item.style.fontFamily] || FONT_STACKS.sans};font-size:${item.style.fontSize}pt;font-weight:${item.style.fontWeight === "bold" ? 700 : 400};color:${item.style.color};text-align:${item.style.align};line-height:${item.style.lineHeight};white-space:${item.math ? "normal" : "pre-wrap"};word-wrap:break-word;${fieldStyle}">${marker}${item.href ? `<a href="${escapeHtml(item.href)}" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline;text-underline-offset:2px">${content}</a>` : content}</div>`;
    }).join("\n");
    return `<section class="doc-page" style="position:relative;width:${page.width}mm;height:${page.height}mm;background:${pageColor};overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.12);margin:0 auto 10mm;page-break-after:always;">${bg}${items}</section>`;
  }).join("\n");
  const linkCss = !pageHtml.includes("<a ") ? "" : ".doc-pages a[data-luna-source]{color:rgb(0,113,227);text-decoration:none}.doc-pages a[data-luna-source]:hover{text-decoration:underline}.doc-pages .lm a:not([data-luna-source]){color:inherit;text-decoration:underline;text-underline-offset:2px}";
  return `<style>@media print{.doc-page{box-shadow:none;margin:0;}}${linkCss}</style>${mathStyleTag(pageHtml)}<div class="doc-pages">${pageHtml}</div>${interactiveLinks && pageHtml.includes("data-luna-source") ? SOURCE_LINK_SCRIPT : ""}`;
}

export function wrapDocHtml(fragment, { forPrint = false } = {}) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:${forPrint ? "#fff" : "#e9e9ee"};}body{padding:${forPrint ? 0 : "10mm"};}@page{margin:0;}</style></head><body>${fragment}</body></html>`;
}

/* ------------------------------------------------------------------------------ PDF */

/**
 * pdf-lib's standard fonts speak WinAnsi only, so a formula's ∑ or a stray emoji would abort the
 * whole export. Characters the font cannot draw become their closest readable ASCII spelling.
 */
const PDF_FALLBACK = {
  "∑": "sum", "∏": "prod", "∫": "int", "√": "sqrt", "∞": "inf", "≤": "<=", "≥": ">=", "≠": "!=",
  "≈": "~=", "≡": "=", "∼": "~", "∝": "prop", "∈": "in", "∉": "not in", "⊂": "subset", "⊆": "subset=",
  "⊃": "superset", "⊇": "superset=", "∪": "U", "∩": "n", "∀": "for all", "∃": "exists", "¬": "not",
  "∧": "and", "∨": "or", "∅": "empty", "∠": "angle", "⊥": "perp", "→": "->", "←": "<-", "↔": "<->",
  "⇒": "=>", "⇔": "<=>", "∂": "d", "∇": "grad", "…": "...", "⋯": "...", "∓": "-/+", "∗": "*", "⋆": "*",
  "≪": "<<", "≫": ">>", "∴": "therefore", "∬": "int int", "∮": "int",
  "⁰": "^0", "¹": "^1", "⁴": "^4", "⁵": "^5", "⁶": "^6", "⁷": "^7", "⁸": "^8", "⁹": "^9",
  "⁺": "^+", "⁻": "^-", "⁼": "^=", "⁽": "^(", "⁾": "^)", "ⁿ": "^n", "ⁱ": "^i", "ᵀ": "^T",
  "₀": "_0", "₁": "_1", "₂": "_2", "₃": "_3", "₄": "_4", "₅": "_5", "₆": "_6", "₇": "_7", "₈": "_8", "₉": "_9",
  "₊": "_+", "₋": "_-", "₌": "_=", "₍": "_(", "₎": "_)", "ₐ": "_a", "ₑ": "_e", "ᵢ": "_i", "ⱼ": "_j",
  "ₖ": "_k", "ₘ": "_m", "ₙ": "_n", "ₒ": "_o", "ₚ": "_p", "ᵣ": "_r", "ₛ": "_s", "ₜ": "_t", "ᵤ": "_u", "ᵥ": "_v", "ₓ": "_x",
  "α": "alpha", "β": "beta", "γ": "gamma", "δ": "delta", "ε": "epsilon", "ζ": "zeta", "η": "eta",
  "θ": "theta", "ϑ": "theta", "ι": "iota", "κ": "kappa", "λ": "lambda", "ν": "nu", "ξ": "xi",
  "π": "pi", "ρ": "rho", "σ": "sigma", "τ": "tau", "υ": "upsilon", "φ": "phi", "χ": "chi", "ψ": "psi", "ω": "omega",
  "Γ": "Gamma", "Δ": "Delta", "Θ": "Theta", "Λ": "Lambda", "Ξ": "Xi", "Π": "Pi", "Σ": "Sigma", "Φ": "Phi", "Ψ": "Psi", "Ω": "Omega",
  "•": "-", "—": "-", "–": "-", "“": '"', "”": '"', "‘": "'", "’": "'", "\u00a0": " "
};

function pdfSafeText(value = "") {
  // Combining marks (x̄) have no WinAnsi form: drop the mark, keep the letter.
  const flat = String(value).normalize("NFC").replace(/[\u0300-\u036f\u20d0-\u20ff]/g, "");
  let out = "";
  for (const char of flat) {
    if (char.charCodeAt(0) < 256) { out += char; continue; }
    const mapped = PDF_FALLBACK[char];
    out += mapped === undefined ? "?" : mapped;
  }
  return out;
}

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

/** A clickable rectangle over a stretch of text (an annotation pdf-lib has no helper for). */
function addPdfLink(pdf, page, href, x, y, width, height) {
  try {
    const annotation = pdf.context.obj({ Type: "Annot", Subtype: "Link", Rect: [x, y, x + width, y + height], Border: [0, 0, 0], A: { Type: "Action", S: "URI", URI: PDFString.of(href) } });
    page.node.addAnnot(pdf.context.register(annotation));
  } catch {
    // A link that cannot be written is only a missing click target.
  }
}

const LINK_COLOR = rgb(0, 0.443, 0.89);

/**
 * A text item that carries formulas and links, drawn line by line at the heights the layout reserved:
 * prose in the item's font, formulas typeset by the box typesetter, links blue and clickable. A line
 * wider than the box is scaled down to fit, so nothing leaves the card.
 */
function drawRichItem({ pdf, pdfPage, item, font, math, x, top, w, pageH, color }) {
  const fontSize = Number(item.style.fontSize) || 11;
  let cursorTop = top;
  for (const line of item.math.lines) {
    const pitch = line.pitch * MM_TO_PT;
    const lineHeight = lineHeightMm(item.style) * MM_TO_PT;
    // Plain lines sit where the old text drawing put them; a tall line keeps its content centred in the extra room.
    const baseline = pageH - cursorTop - fontSize - Math.max(0, (pitch - lineHeight) / 2);
    const parts = line.segs.map((seg) => {
      if (seg.t === "math") {
        const box = pdfMathBox(math, seg.tex, seg.display);
        if (box) return { seg, box, width: box.w * fontSize * 1.05 * (seg.shrink || 1) };
        const text = pdfSafeText(latexToUnicode(seg.tex));
        return { seg: { t: "text", text }, width: font.widthOfTextAtSize(text, fontSize) };
      }
      const text = pdfSafeText(seg.text);
      return { seg: { ...seg, text }, width: font.widthOfTextAtSize(text, fontSize) };
    });
    const total = parts.reduce((sum, part) => sum + part.width, 0);
    const fit = total > w ? Math.max(0.6, w / total) : 1;
    const size = fontSize * fit;
    const used = total * fit;
    const align = line.display ? "center" : item.style.align;
    let cursorX = x + (align === "center" ? (w - used) / 2 : align === "right" ? w - used : 0);
    for (const part of parts) {
      const width = part.width * fit;
      if (part.box) {
        drawMathBox(pdfPage, math, part.box, cursorX, baseline, size * 1.05 * (part.seg.shrink || 1), color);
      } else if (part.seg.text) {
        const isLink = part.seg.t === "link";
        pdfPage.drawText(part.seg.text, { x: cursorX, y: baseline, size, font, color: isLink ? LINK_COLOR : color });
        if (isLink) {
          addPdfLink(pdf, pdfPage, part.seg.href, cursorX, baseline - size * 0.25, width, size * 1.15);
          pdfPage.drawLine({ start: { x: cursorX, y: baseline - size * 0.12 }, end: { x: cursorX + width, y: baseline - size * 0.12 }, thickness: 0.4, color: LINK_COLOR });
        }
      }
      cursorX += width;
    }
    cursorTop += pitch;
  }
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
  let mathFonts = null;
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
      if (item.math && !Number(item.style.rotate)) {
        if (!mathFonts) mathFonts = await embedMathFonts(pdf);
        drawRichItem({ pdf, pdfPage, item, font, math: mathFonts, x, top, w, pageH, color: rgb(color.r, color.g, color.b) });
        if (item.href) addPdfLink(pdf, pdfPage, item.href, x, pageH - top - h, w, h);
        continue;
      }
      const lh = lineHeightMm(item.style) * MM_TO_PT;
      let cursorY = pageH - top - fontSize;
      for (const rawLine of item.lines) {
        // Re-wrap with real glyph metrics so PDF lines never overflow the box.
        const words = pdfSafeText(rawLine).split(/\s+/);
        let line = "";
        const flush = () => {
          const textWidth = font.widthOfTextAtSize(line, fontSize);
          const offset = item.style.align === "center" ? (w - textWidth) / 2 : item.style.align === "right" ? w - textWidth : 0;
          const deg = Number(item.style.rotate) || 0;
          if (deg) {
            // Rotate about the box centre: the text runs along the box's long side, turned ±90°.
            const cx = x + w / 2;
            const cy = pageH - top - h / 2;
            const half = textWidth / 2;
            if (deg > 0) pdfPage.drawText(line, { x: cx + fontSize * 0.35, y: cy - half, size: fontSize, font, color: rgb(color.r, color.g, color.b), rotate: degrees(90) });
            else pdfPage.drawText(line, { x: cx - fontSize * 0.35, y: cy + half, size: fontSize, font, color: rgb(color.r, color.g, color.b), rotate: degrees(-90) });
          } else {
            pdfPage.drawText(line, { x: x + Math.max(0, offset), y: cursorY, size: fontSize, font, color: rgb(color.r, color.g, color.b) });
          }
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
      if (item.math) {
        // Formulas become native Word equations (editable), links real hyperlinks.
        const runStyle = { bold: item.style.fontWeight === "bold", size: Math.round((Number(item.style.fontSize) || 11) * 2), color: String(item.style.color || "#1d1d1f").replace("#", ""), font: item.style.fontFamily === "serif" ? "Georgia" : item.style.fontFamily === "mono" ? "Courier New" : "Calibri" };
        for (const line of item.math.lines) {
          const runs = line.segs.map((seg) => {
            if (seg.t === "math") return texToDocxMath(seg.tex, seg.display) || new TextRun({ ...runStyle, text: latexToUnicode(seg.tex) });
            if (seg.t === "link") return new ExternalHyperlink({ link: seg.href, children: [new TextRun({ ...runStyle, text: seg.text, color: "0071E3", underline: {} })] });
            return new TextRun({ ...runStyle, text: seg.text });
          });
          children.push(new Paragraph({ alignment: line.display ? AlignmentType.CENTER : alignment, spacing: { after: 40 }, children: runs.length ? runs : [new TextRun({ ...runStyle, text: "" })] }));
        }
        continue;
      }
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
      const textStyle = { fontSize: Number(item.style.fontSize) || 11, bold: item.style.fontWeight === "bold", color: String(item.style.color || "#1d1d1f").replace("#", ""), fontFace: item.style.fontFamily === "serif" ? "Georgia" : item.style.fontFamily === "mono" ? "Courier New" : "Calibri" };
      if (item.math && !Number(item.style.rotate)) {
        // PowerPoint cannot typeset LaTeX: formulas are written in readable Unicode, links stay clickable.
        const runs = [];
        item.math.lines.forEach((line, index) => {
          const segs = line.segs.length ? line.segs : [{ t: "text", text: "" }];
          segs.forEach((seg, at) => {
            const options = { ...textStyle, ...(seg.t === "link" ? { hyperlink: { url: seg.href }, color: "0071E3", underline: { style: "sng" } } : {}), ...(at === segs.length - 1 && index < item.math.lines.length - 1 ? { breakLine: true } : {}) };
            runs.push({ text: seg.t === "math" ? latexToUnicode(seg.tex) : seg.text, options });
          });
        });
        slide.addText(runs, { ...box, align: item.style.align || "left", valign: "top", margin: 0 });
        continue;
      }
      slide.addText(item.lines.join("\n"), { ...box, ...(item.href ? { hyperlink: { url: item.href } } : {}), rotate: Number(item.style.rotate) ? (Number(item.style.rotate) > 0 ? 270 : 90) : 0, fontSize: Number(item.style.fontSize) || 11, bold: item.style.fontWeight === "bold", color: String(item.style.color || "#1d1d1f").replace("#", ""), align: item.style.align || "left", valign: "top", fontFace: item.style.fontFamily === "serif" ? "Georgia" : item.style.fontFamily === "mono" ? "Courier New" : "Calibri", margin: 0 });
    }
  }
  const output = await pptx.write({ outputType: "nodebuffer" });
  return Buffer.from(output);
}
