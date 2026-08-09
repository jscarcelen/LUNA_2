import JSZip from "jszip";
import { parseDocument } from "./auxiliary-docx/parseDocument.js";

function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeMarkdown(value = "") {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/([*_`~\[\]<>])/g, "\\$1");
}

function imagePath(sourcePart = "") {
  const source = String(sourcePart || "");
  const chunks = source.split("/");
  const basename = chunks[chunks.length - 1] || "";
  return basename ? `assets/${basename}` : "";
}

function applyTextFormatHtml(text, format = {}) {
  if (!String(text || "").trim()) return escapeHtml(text);
  let content = escapeHtml(text);
  if (format.bold) content = `<strong>${content}</strong>`;
  if (format.italic) content = `<em>${content}</em>`;
  if (format.underline) content = `<u>${content}</u>`;
  if (format.strike) content = `<s>${content}</s>`;
  if (format.verticalAlign === "superscript") content = `<sup>${content}</sup>`;
  if (format.verticalAlign === "subscript") content = `<sub>${content}</sub>`;
  return content;
}

function applyTextFormatMarkdown(text, format = {}) {
  if (!String(text || "").trim()) return text;
  let content = escapeHtml(text);
  if (format.bold) content = `<strong>${content}</strong>`;
  if (format.italic) content = `<em>${content}</em>`;
  if (format.underline) content = `<u>${content}</u>`;
  if (format.strike) content = `<s>${content}</s>`;
  if (format.verticalAlign === "superscript") content = `<sup>${content}</sup>`;
  if (format.verticalAlign === "subscript") content = `<sub>${content}</sub>`;
  return content;
}

function sameFormat(left = {}, right = {}) {
  return JSON.stringify(left || {}) === JSON.stringify(right || {});
}

function normalizeInlineChildren(children = []) {
  const normalized = [];
  for (const child of children) {
    const previous = normalized[normalized.length - 1] || null;
    const current = child && typeof child === "object" ? { ...child, format: child.format ? { ...child.format } : child.format } : child;
    if (current?.type === "text" && previous?.type === "text" && sameFormat(previous.format, current.format)) {
      previous.text = `${previous.text || ""}${current.text || ""}`;
      continue;
    }
    normalized.push(current);
  }
  return normalized;
}

function renderInlineHtml(node) {
  if (!node || typeof node !== "object") return "";
  if (node.type === "text") return applyTextFormatHtml(node.text || "", node.format || {});
  if (node.type === "inline_math") return `<code class="math-inline">$${escapeHtml(node.latex || "")}$</code>`;
  if (node.type === "image") {
    const src = imagePath(node.source?.part || "");
    return `<img class="inline-image" src="${escapeHtml(src)}" alt="${escapeHtml(node.altText || node.caption || "")}" />`;
  }
  if (node.type === "page_break") return "<span class=\"page-break-marker\"></span>";
  if (node.type === "link") {
    const children = (node.children || []).map(renderInlineHtml).join("");
    return `<a href="${escapeHtml(node.url || "")}">${children}</a>`;
  }
  return "";
}

function renderInlineMarkdown(node) {
  if (!node || typeof node !== "object") return "";
  if (node.type === "text") return applyTextFormatMarkdown(node.text || "", node.format || {});
  if (node.type === "inline_math") return `$${node.latex || ""}$`;
  if (node.type === "image") {
    const src = imagePath(node.source?.part || "");
    return `![${escapeMarkdown(node.caption || node.altText || "image")}](${src})`;
  }
  if (node.type === "page_break") return "";
  if (node.type === "link") {
    const children = (node.children || []).map(renderInlineMarkdown).join("");
    return `[${children}](${node.url || ""})`;
  }
  return "";
}

function renderParagraphChildrenHtml(children = []) {
  return normalizeInlineChildren(children).map(renderInlineHtml).join("");
}

function renderParagraphChildrenMarkdown(children = []) {
  return normalizeInlineChildren(children).map(renderInlineMarkdown).join("");
}

function flattenCellMarkdown(children = []) {
  return children
    .map((child) => {
      if (child.type === "paragraph" || child.type === "heading") return renderParagraphChildrenMarkdown(child.children || []);
      if (child.type === "display_math") return `$${child.latex || ""}$`;
      if (child.type === "image") return `![${escapeMarkdown(child.caption || child.altText || "image")}](${imagePath(child.source?.part || "")})`;
      return "";
    })
    .filter(Boolean)
    .join(" <br> ");
}

function renderTableHtml(node) {
  const rows = (node.rows || []).map((row) => {
    const cells = (row.cells || []).map((cell) => {
      const content = (cell.children || []).map(renderBlockHtml).join("");
      const colSpan = cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : "";
      return `<td${colSpan}>${content}</td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
  return `<table>${rows}</table>`;
}

function renderTableMarkdown(node) {
  const rows = node.rows || [];
  if (!rows.length) return "";
  const bodyRows = rows.map((row) => (row.cells || []).map((cell) => flattenCellMarkdown(cell.children || [])));
  const columnCount = Math.max(...bodyRows.map((row) => row.length), 0);
  const header = bodyRows[0] || new Array(columnCount).fill("");
  const separator = new Array(columnCount).fill("---");
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${separator.join(" | ")} |`
  ];
  for (const row of bodyRows.slice(1)) {
    const padded = [...row, ...new Array(Math.max(columnCount - row.length, 0)).fill("")];
    lines.push(`| ${padded.join(" | ")} |`);
  }
  return `${lines.join("\n")}\n`;
}

function renderBlockHtml(node) {
  if (!node || typeof node !== "object") return "";
  switch (node.type) {
    case "section":
      return `<section>${(node.children || []).map(renderBlockHtml).join("")}</section>`;
    case "heading": {
      const level = Math.min(Math.max(Number(node.level || 1), 1), 6);
      return `<h${level}>${renderParagraphChildrenHtml(node.children || [])}</h${level}>`;
    }
    case "paragraph":
      return `<p>${renderParagraphChildrenHtml(node.children || [])}</p>`;
    case "display_math":
      return `<pre class="math-display">$$\n${escapeHtml(node.latex || "")}\n$$</pre>`;
    case "list": {
      const tag = node.ordered ? "ol" : "ul";
      const items = (node.items || []).map((item) => renderBlockHtml(item)).join("");
      return `<${tag}>${items}</${tag}>`;
    }
    case "list_item":
      return `<li>${(node.children || []).map(renderBlockHtml).join("")}</li>`;
    case "table":
      return renderTableHtml(node);
    case "image": {
      const src = imagePath(node.source?.part || "");
      return `<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(node.altText || node.caption || "")}" /></figure>`;
    }
    case "page_break":
      return "<hr class=\"page-break\" />";
    default:
      return "";
  }
}

function renderBlockMarkdown(node) {
  if (!node || typeof node !== "object") return "";
  switch (node.type) {
    case "section":
      return (node.children || []).map(renderBlockMarkdown).filter(Boolean).join("\n");
    case "heading": {
      const level = Math.min(Math.max(Number(node.level || 1), 1), 6);
      return `${"#".repeat(level)} ${renderParagraphChildrenMarkdown(node.children || [])}`.trim();
    }
    case "paragraph":
      return renderParagraphChildrenMarkdown(node.children || []).trim();
    case "display_math":
      return `$$\n${node.latex || ""}\n$$`;
    case "list": {
      const items = (node.items || []).map((item) => renderBlockMarkdown(item).trim()).filter(Boolean);
      return items.map((item, index) => `${node.ordered ? `${index + 1}.` : "-"} ${item}`).join("\n");
    }
    case "list_item":
      return (node.children || []).map(renderBlockMarkdown).filter(Boolean).join(" ");
    case "table":
      return renderTableMarkdown(node);
    case "image": {
      const src = imagePath(node.source?.part || "");
      return `![${escapeMarkdown(node.caption || node.altText || "image")}](${src})`;
    }
    case "page_break":
      return "---";
    default:
      return "";
  }
}

function renderHtmlDocument(documentTree = {}) {
  const body = (documentTree.body?.children || []).map(renderBlockHtml).join("");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body><article>${body}</article></body></html>`;
}

function renderMarkdownDocument(documentTree = {}) {
  const body = (documentTree.body?.children || []).map(renderBlockMarkdown).filter(Boolean).join("\n\n");
  return `${body.trim()}\n`;
}

function htmlToPlainText(html = "") {
  return String(html || "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function diagnosticsToMarkers(summary = {}) {
  const warnings = Array.isArray(summary?.warnings) ? summary.warnings : [];
  const unsupported = Array.isArray(summary?.unsupportedElements) ? summary.unsupportedElements : [];
  const markers = [];

  for (let index = 0; index < warnings.length; index += 1) {
    markers.push({
      id: `AUX-W${index + 1}`,
      type: "auxiliary-warning",
      severity: "medium",
      label: "Auxiliary parser warning",
      excerpt: String(warnings[index] || ""),
      formula: null,
      confidence: 0.8
    });
  }

  for (let index = 0; index < unsupported.length; index += 1) {
    const item = unsupported[index] || {};
    markers.push({
      id: `AUX-U${index + 1}`,
      type: "auxiliary-unsupported-element",
      severity: "high",
      label: "Unsupported OOXML element",
      excerpt: String(item?.originalElement || "unknown"),
      formula: null,
      confidence: 0.65
    });
  }

  return markers;
}

export async function runAuxiliaryDocxPipeline(file = {}) {
  const mimeType = String(file?.mimeType || "application/vnd.openxmlformats-officedocument.wordprocessingml.document").trim().toLowerCase();
  const contentBase64 = String(file?.contentBase64 || "").trim();
  const sourceBuffer = Buffer.from(contentBase64, "base64");
  if (!sourceBuffer.length) {
    throw new Error("DOCX source bytes are missing.");
  }

  const zip = await JSZip.loadAsync(sourceBuffer);
  const parsed = await parseDocument(zip, {});
  const documentTree = parsed?.documentTree || {};
  const summary = parsed?.summary || {};

  const sourceRenderHtml = renderHtmlDocument(documentTree);
  const markdown = renderMarkdownDocument(documentTree);
  const text = htmlToPlainText(sourceRenderHtml) || String(markdown || "").trim();

  const riskMarkers = diagnosticsToMarkers(summary);
  const hasUnsupported = riskMarkers.some((marker) => marker.type === "auxiliary-unsupported-element");
  const confidence = hasUnsupported ? 0.72 : 0.96;
  const issues = [];
  if (hasUnsupported) issues.push("auxiliary-unsupported-ooxml-elements");
  if (!text) issues.push("no-text-extracted");

  return {
    method: "docx-auxiliary-json-extractor",
    confidence,
    issues,
    riskMarkers,
    sourcePreview: text.slice(0, 1200),
    sourceMimeType: mimeType,
    sourceContentBase64: contentBase64,
    sourceRenderHtml,
    markdown,
    text,
    generatedPdfContentBase64: "",
    canonicalDocument: documentTree,
    canonicalVerification: {
      gatePassed: !hasUnsupported,
      sourceCounts: {
        equations: Number(summary?.statistics?.inlineMath || 0) + Number(summary?.statistics?.displayMath || 0),
        tables: Number(summary?.statistics?.tables || 0),
        textLength: text.length
      },
      extractedCounts: {
        equations: Number(summary?.statistics?.inlineMath || 0) + Number(summary?.statistics?.displayMath || 0),
        tables: Number(summary?.statistics?.tables || 0),
        textLength: text.length
      },
      coverage: {
        equations: 1,
        tables: 1,
        text: text.length ? 1 : 0
      },
      unresolved: hasUnsupported ? ["Auxiliary parser found unsupported elements"] : []
    },
    requiresReview: hasUnsupported || !text
  };
}
