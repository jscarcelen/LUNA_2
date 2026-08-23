import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";

function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getPath(source, path) {
  if (!path) return undefined;
  return String(path).split(".").reduce((acc, key) => (acc && typeof acc === "object" ? acc[key] : undefined), source);
}

function letterForIndex(index) {
  return String.fromCharCode(65 + (index % 26));
}

function hexToRgb(hex = "#1f2937") {
  const normalized = String(hex || "#1f2937").replace("#", "");
  const full = normalized.length === 3 ? normalized.split("").map((char) => char + char).join("") : normalized;
  const value = parseInt(full, 16);
  if (Number.isNaN(value)) return rgb(0.12, 0.14, 0.22);
  return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}

function positionMetrics(position = {}) {
  const y = Number(position?.y || 0);
  const height = Number(position?.height || position?.h || 14);
  return {
    y,
    height,
    bottom: y + height
  };
}

function shiftPosition(position, offsetY = 0) {
  if (!position || typeof position !== "object") return position;
  const nextY = Number(position.y || 0) + offsetY;
  return { ...position, y: nextY };
}

// Expands components and repeated (array-bound) blocks into a flat, ordered render list.
export function buildCanvasRenderList(template = {}, sampleData = {}) {
  const pageLayouts = Array.isArray(template.pageLayouts) && template.pageLayouts.length
    ? template.pageLayouts
    : [{ id: template.activePageId || "page-1", pageFormat: template.pageFormat, blocks: Array.isArray(template.canvasBlocks) ? template.canvasBlocks : [] }];
  const components = Array.isArray(template.components) ? template.components : [];
  const blockFormats = template.blockFormats && typeof template.blockFormats === "object" ? template.blockFormats : {};
  const blockClasses = template.blockClasses && typeof template.blockClasses === "object" ? template.blockClasses : {};
  const formatSets = Array.isArray(template.formatSets) ? template.formatSets : [];
  const activeFormatSet = formatSets.find((set) => set.id === template.activeFormatSetId) || formatSets[0] || null;
  const collection = template.repeatCollectionField ? getPath(sampleData, template.repeatCollectionField) : null;
  const outputRecords = Array.isArray(collection) && collection.length ? collection : [sampleData];
  const hasOutputCollection = Array.isArray(collection);
  const normalizeRepeatScope = (scope = "once") => scope === "per-item" ? "per-output" : scope;

  function expandEntry(entry) {
    if (entry.componentRefId) {
      const component = components.find((item) => item.id === entry.componentRefId);
      return Array.isArray(component?.blocks)
        ? component.blocks.map((block, index) => ({
          ...block,
          repeatScope: block.repeatScope || entry.repeatScope || "once",
          position: block.position || (entry.position ? {
            ...entry.position,
            y: Number(entry.position.y || 0) + index * 14,
            height: Number(block.position?.height || block.position?.h || 12)
          } : null)
        }))
        : [];
    }
    return [entry];
  }

  function resolveFormat(type, formatName) {
    const list = Array.isArray(blockFormats[type]) ? blockFormats[type] : [];
    const setFormatName = activeFormatSet?.formats?.[type];
    return list.find((item) => item.name === setFormatName)
      || list.find((item) => item.name === formatName)
      || list[0]
      || null;
  }

  const rendered = [];

  for (const page of pageLayouts) {
    const canvasBlocks = Array.isArray(page?.blocks) && page.blocks.length
      ? page.blocks
      : (Array.isArray(template.canvasBlocks) ? template.canvasBlocks : []);
    const pageId = page?.id || template.activePageId || "page-1";

    for (const entry of canvasBlocks) {
      const expandedSpecs = expandEntry(entry);
      const positionedSpecs = expandedSpecs.filter((spec) => spec.position && typeof spec.position === "object");
      const baseY = positionedSpecs.length ? Math.min(...positionedSpecs.map((spec) => positionMetrics(spec.position).y)) : 0;
      const maxBottom = positionedSpecs.length ? Math.max(...positionedSpecs.map((spec) => positionMetrics(spec.position).bottom)) : 0;
      const entryStackGap = 6;
      const entrySpan = Math.max(14, maxBottom - baseY) + entryStackGap;
      for (const spec of expandedSpecs) {
        const repeatScope = normalizeRepeatScope(spec.repeatScope || entry.repeatScope || "once");
        const records = repeatScope === "per-output" && hasOutputCollection ? outputRecords : [sampleData];
        for (const [recordIndex, record] of records.entries()) {
          const type = String(spec.type || "paragraph");
          const formatName = String(spec.formatName || "");
          const format = resolveFormat(type, formatName);
          const className = format?.className || blockClasses[type] || "";
          const style = format?.style && typeof format.style === "object" ? format.style : {};
          const isAbsolute = String(style.layoutMode || "").toLowerCase() === "absolute";
          const htmlTemplate = String(format?.htmlTemplate || "");
          const specPosition = spec.position || entry.position || null;
          const blockMetrics = positionMetrics(specPosition || {});
          const blockStackGap = 4;
          const repeatedPosition = specPosition
            ? shiftPosition(specPosition, recordIndex * entrySpan)
            : null;

          if (repeatScope === "per-field" || spec.repeatField) {
            const values = getPath(record, spec.repeatField);
            const items = Array.isArray(values) ? values : [];
            items.forEach((value, index) => {
              rendered.push({
                type,
                formatName,
                className,
                style,
                htmlTemplate,
                position: isAbsolute && repeatedPosition ? shiftPosition(repeatedPosition, index * (blockMetrics.height + blockStackGap)) : null,
                pageId,
                hidden: Boolean(spec.hidden || entry.hidden),
                text: typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? ""),
                imageSrc: spec.imageSrc || entry.imageSrc || "",
                opacity: spec.opacity ?? entry.opacity ?? style.opacity ?? 1,
                index: index + 1,
                letter: letterForIndex(index)
              });
            });
            continue;
          }

          const value = spec.bindField ? getPath(record, spec.bindField) : "";
          const fallbackText = String(spec.illustrativeText || entry.illustrativeText || "Content placeholder");
          rendered.push({
            type,
            formatName,
            className,
            style,
            htmlTemplate,
            position: isAbsolute ? repeatedPosition : null,
            pageId,
            hidden: Boolean(spec.hidden || entry.hidden),
            text: value === undefined || value === null || value === ""
              ? fallbackText
              : (Array.isArray(value) ? value.join(", ") : String(value)),
            imageSrc: spec.imageSrc || entry.imageSrc || "",
            opacity: spec.opacity ?? entry.opacity ?? style.opacity ?? 1
          });
        }
      }
    }
  }

  return rendered;
}

function fillTemplate(source = "", vars = {}) {
  return String(source || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => String(vars[key] ?? ""));
}

function styleObjectToCss(style = {}) {
  const rules = [];
  if (style.fontFamily) rules.push(`font-family:${style.fontFamily}`);
  if (style.fontSize) rules.push(`font-size:${style.fontSize}`);
  if (style.color) rules.push(`color:${style.color}`);
  if (style.backgroundColor) rules.push(`background-color:${style.backgroundColor}`);
  if (style.fontWeight) rules.push(`font-weight:${style.fontWeight}`);
  if (style.fontStyle) rules.push(`font-style:${style.fontStyle}`);
  if (style.textDecoration) rules.push(`text-decoration:${style.textDecoration}`);
  if (style.textAlign) rules.push(`text-align:${style.textAlign}`);
  if (style.lineHeight) rules.push(`line-height:${style.lineHeight}`);
  if (style.letterSpacing) rules.push(`letter-spacing:${style.letterSpacing}`);
  if (style.padding) rules.push(`padding:${style.padding}`);
  if (style.margin) rules.push(`margin:${style.margin}`);
  if (style.borderWidth && style.borderColor) rules.push(`border:${style.borderWidth} solid ${style.borderColor}`);
  if (style.radius) rules.push(`border-radius:${style.radius}`);
  if (style.opacity !== undefined) rules.push(`opacity:${Number(style.opacity)}`);
  if (style.objectFit) rules.push(`object-fit:${style.objectFit}`);
  if (style.keepTogether) rules.push("break-inside:avoid");
  if (style.layoutMode === "Absolute") rules.push("position:absolute");
  return rules.join(";");
}

function positionObjectToCss(position = {}) {
  if (!position || typeof position !== "object") return "";
  const unit = String(position.unit || "mm");
  const value = (key) => position[key] === undefined || position[key] === "" ? "" : `${position[key]}${unit}`;
  return [
    ["left", value("x")],
    ["top", value("y")],
    ["width", value("width") || value("w")],
    ["min-height", value("height") || value("h")]
  ].filter(([, rule]) => rule).map(([property, rule]) => `${property}:${rule}`).join(";");
}

function renderBlockHtml(block) {
  const classAttr = block.className ? ` class="${escapeHtml(block.className)}"` : "";
  const css = [block.position ? "position:absolute" : "", styleObjectToCss(block.style), positionObjectToCss(block.position)].filter(Boolean).join(";");
  const styleAttr = css ? ` style="${escapeHtml(css)}"` : "";
  const text = escapeHtml(block.text || "");
  const vars = { text, value: text, index: block.index ?? "", letter: block.letter ?? "" };

  if (block.htmlTemplate.trim()) {
    const renderedTemplate = fillTemplate(block.htmlTemplate, vars);
    return block.position ? `<div${classAttr}${styleAttr}>${renderedTemplate}</div>` : renderedTemplate;
  }

  if (block.type === "heading1") return `<h1${classAttr}${styleAttr}>${text}</h1>`;
  if (block.type === "heading2") return `<h2${classAttr}${styleAttr}>${text}</h2>`;
  if (block.type === "heading3") return `<h3${classAttr}${styleAttr}>${text}</h3>`;
  if (block.type === "divider") return `<hr${classAttr}${styleAttr} />`;
  if (block.type === "badge") return `<span${classAttr}${styleAttr}>${text}</span>`;
  if (block.type === "image") {
    const src = block.imageSrc || "data:image/svg+xml;charset=UTF-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="220"><rect width="100%" height="100%" fill="#f5f3ff"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="22" fill="#7c5cf0">Image</text></svg>');
    const imageCss = css ? `${css};width:100%;max-width:100%;height:auto;display:block;object-fit:cover;` : "width:100%;max-width:100%;height:auto;display:block;object-fit:cover;";
    return `<img${classAttr} src="${src}" alt="${text}" style="${imageCss}" />`;
  }
  if (block.type === "spacer") return `<div${classAttr}${styleAttr} style="height:16px;${css}"></div>`;
  if (block.type === "page_break") return "<div style=\"page-break-after:always;\"></div>";
  if (block.type === "bullet_list" || block.type === "numbered_list") {
    const tag = block.type === "numbered_list" ? "ol" : "ul";
    return `<${tag}${classAttr}${styleAttr}><li>${text}</li></${tag}>`;
  }
  if (block.type === "answer_choice") {
    return `<div${classAttr}${styleAttr}><strong>${escapeHtml(block.letter || "")}</strong> ${text}</div>`;
  }
  if (block.type === "question_number") {
    return `<span${classAttr}${styleAttr}>Q${text}</span>`;
  }
  return `<p${classAttr}${styleAttr}>${text}</p>`;
}

const PAGE_FORMAT_DIMENSIONS_MM = {
  "a4-portrait": { width: 210, height: 297 },
  "a4-landscape": { width: 297, height: 210 },
  "letter-portrait": { width: 216, height: 279 },
  "letter-landscape": { width: 279, height: 216 },
  "ppt-16-9": { width: 254, height: 143 },
  "ppt-4-3": { width: 254, height: 190 }
};

export function getPageFormatDimensionsMm(pageFormat = "a4-portrait", custom = {}) {
  if (pageFormat === "custom") {
    return { width: Number(custom?.width) || 210, height: Number(custom?.height) || 297 };
  }
  return PAGE_FORMAT_DIMENSIONS_MM[pageFormat] || PAGE_FORMAT_DIMENSIONS_MM["a4-portrait"];
}

export function renderTemplateHtml(template = {}, sampleData = {}) {
  const blocks = buildCanvasRenderList(template, sampleData);
  const css = String(template.css || "");
  const containerClass = String(template.containerClass || "luna-template-default");
  const pageLayouts = Array.isArray(template.pageLayouts) && template.pageLayouts.length
    ? template.pageLayouts
    : [{ id: template.activePageId || "page-1", pageFormat: template.pageFormat, blocks: Array.isArray(template.canvasBlocks) ? template.canvasBlocks : [] }];
  const pageCss = `.${containerClass}{display:flex;flex-direction:column;gap:18px;}`;
  const body = pageLayouts.map((page, pageIndex) => {
    const pageBlocks = blocks.filter((block) => (block.pageId || "page-1") === (page.id || "page-1") || (pageIndex === 0 && !block.pageId));
    const activeDimensions = getPageFormatDimensionsMm(page.pageFormat || template.pageFormat, page.customPageSize || template.customPageSize);
    const pageStyle = `position:relative;width:${activeDimensions.width}mm;min-height:${activeDimensions.height}mm;box-sizing:border-box;padding:16mm;margin:0 auto;background:#fff;border:1px solid #e5e1f7;box-shadow:0 3px 10px rgba(43, 49, 84, 0.06);page-break-inside:avoid;`
    return `<div class="${escapeHtml(containerClass)}-page" style="${pageStyle}">${pageBlocks.map(renderBlockHtml).join("\n")}</div>`;
  }).join("\n");
  const styleTag = css || pageCss ? `<style>${pageCss}${css}</style>` : "";
  return `${styleTag}<div class="${escapeHtml(containerClass)}">${body}</div>`;
}

function wrapPlainText(text, size, maxWidth, useFont) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (useFont.widthOfTextAtSize(next, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export async function renderTemplatePdfBuffer(template = {}, sampleData = {}) {
  const blocks = buildCanvasRenderList(template, sampleData);
  const pageLayouts = Array.isArray(template.pageLayouts) && template.pageLayouts.length
    ? template.pageLayouts
    : [{ id: template.activePageId || "page-1", pageFormat: template.pageFormat, blocks: Array.isArray(template.canvasBlocks) ? template.canvasBlocks : [] }];

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  for (const [pageIndex, page] of pageLayouts.entries()) {
    const dimensions = getPageFormatDimensionsMm(page.pageFormat || template.pageFormat, page.customPageSize || template.customPageSize);
    const pageWidth = (dimensions.width / 25.4) * 72;
    const pageHeight = (dimensions.height / 25.4) * 72;
    const marginX = 48;
    const maxWidth = pageWidth - marginX * 2;
    const pdfPage = pdf.addPage([pageWidth, pageHeight]);
    let y = pageHeight - 48;
    const pageBlocks = blocks.filter((block) => (block.pageId || "page-1") === (page.id || "page-1") || (pageIndex === 0 && !block.pageId));

    for (const block of pageBlocks) {
      if (block.hidden) continue;
      const baseSize = Number(String(block.style?.fontSize || "").replace("px", "")) || (block.type.startsWith("heading") ? 18 : 11);
      const minSize = Number(block.style?.minFontSize) || Math.min(9, baseSize);
      const isBold = block.style?.fontWeight === "700" || block.type.startsWith("heading");
      const useFont = isBold ? boldFont : font;
      const color = block.style?.color ? hexToRgb(block.style.color) : rgb(0.12, 0.14, 0.22);
      const label = block.type === "answer_choice" ? `${block.letter}  ${block.text}` : (block.type === "question_number" ? `Q${block.text}` : block.text);

      let size = baseSize;
      let lines = wrapPlainText(label, size, maxWidth, useFont);
      while (lines.length * (size + 4) > pageHeight - 96 && size > minSize) {
        size -= 1;
        lines = wrapPlainText(label, size, maxWidth, useFont);
      }

      const positioned = block.position && (block.position.x !== undefined || block.position.y !== undefined);
      const positionUnit = String(block.position?.unit || "mm");
      const positionScale = positionUnit === "pt" ? 1 : 72 / 25.4;
      const blockX = positioned ? marginX + Number(block.position?.x || 0) * positionScale : marginX;
      const blockY = positioned ? pageHeight - 48 - Number(block.position?.y || 0) * positionScale : y;
      let lineY = blockY;
      for (const line of lines) {
        pdfPage.drawText(line, { x: blockX, y: positioned ? lineY : y, size, font: useFont, color });
        lineY -= size + 6;
        if (!positioned) y -= size + 6;
      }
      if (!positioned) y -= 6;
    }
  }

  return Buffer.from(await pdf.save());
}

export async function renderTemplateDocxBuffer(template = {}, sampleData = {}) {
  const blocks = buildCanvasRenderList(template, sampleData);

  const children = blocks.map((block) => {
    if (block.type === "heading1") return new Paragraph({ text: block.text, heading: HeadingLevel.HEADING_1 });
    if (block.type === "heading2") return new Paragraph({ text: block.text, heading: HeadingLevel.HEADING_2 });
    if (block.type === "heading3") return new Paragraph({ text: block.text, heading: HeadingLevel.HEADING_3 });
    if (block.type === "divider") return new Paragraph({ text: "\u2015\u2015\u2015\u2015\u2015" });
    const isBold = block.style?.fontWeight === "700";
    const isItalic = block.style?.fontStyle === "italic";
    const label = block.type === "answer_choice" ? `${block.letter}  ${block.text}` : (block.type === "question_number" ? `Q${block.text}` : block.text);
    return new Paragraph({ children: [new TextRun({ text: label, bold: isBold, italics: isItalic })] });
  });

  const document = new Document({ sections: [{ children }] });
  return Packer.toBuffer(document);
}
