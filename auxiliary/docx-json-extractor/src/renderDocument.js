import path from "node:path";
import { readFile } from "node:fs/promises";
import { ensureDir } from "./utils.js";
import { renderMathMlFromLatex } from "./mathCanonical.js";

const outputDir = path.join(process.cwd(), "output");
const inputFile = path.join(outputDir, "statistics.json");
const htmlOutputFile = path.join(outputDir, "statistics.html");
const markdownOutputFile = path.join(outputDir, "statistics.md");

function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHtmlAttribute(value = "") {
  return escapeHtml(value).replace(/\n/g, "&#10;");
}

function escapeMarkdown(value = "") {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/([*_`~\[\]<>])/g, "\\$1");
}

function documentTitle(documentTree) {
  const headerText = documentTree.headers?.[0]?.children?.[0]?.children?.map((child) => child.text || "").join("").trim();
  return headerText || String(documentTree.source?.filename || "Document").replace(/\.docx$/i, "");
}

function imagePath(sourcePart = "") {
  const basename = path.basename(String(sourcePart || ""));
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

function renderInlineMathHtml(node) {
  try {
    const mathMl = renderMathMlFromLatex(node.latex || "", { displayMode: false });
    return `<span class="math inline" data-latex="${escapeHtmlAttribute(node.latex || "")}">${mathMl}</span>`;
  } catch {
    return `<code class="math-fallback">${escapeHtml(node.latex || "")}</code>`;
  }
}

function renderDisplayMathHtml(node) {
  try {
    const mathMl = renderMathMlFromLatex(node.latex || "", { displayMode: true });
    return `<div class="math display" data-latex="${escapeHtmlAttribute(node.latex || "")}">${mathMl}</div>`;
  } catch {
    return `<pre class="math-fallback">${escapeHtml(node.latex || "")}</pre>`;
  }
}

function renderInlineHtml(node) {
  if (!node || typeof node !== "object") return "";
  if (node.type === "text") return applyTextFormatHtml(node.text || "", node.format || {});
  if (node.type === "inline_math") return renderInlineMathHtml(node);
  if (node.type === "image") {
    const src = imagePath(node.source?.part || "");
    return `<img class="inline-image" src="${escapeHtmlAttribute(src)}" alt="${escapeHtmlAttribute(node.altText || node.caption || "")}" />`;
  }
  if (node.type === "page_break") return `<span class="page-break-marker"></span>`;
  if (node.type === "link") {
    const children = (node.children || []).map(renderInlineHtml).join("");
    return `<a href="${escapeHtmlAttribute(node.url || "")}">${children}</a>`;
  }
  return "";
}

function renderInlineMarkdown(node) {
  if (!node || typeof node !== "object") return "";
  if (node.type === "text") return applyTextFormatHtml(node.text || "", node.format || {});
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

function renderListHtml(node) {
  const tag = node.ordered ? "ol" : "ul";
  const items = (node.items || []).map((item) => renderBlockHtml(item)).join("");
  return `<${tag}>${items}</${tag}>`;
}

function indentMarkdownBlock(content = "", spaces = 2) {
  const prefix = " ".repeat(spaces);
  return String(content || "").split("\n").map((line) => (line ? `${prefix}${line}` : line)).join("\n");
}

function renderListMarkdown(node) {
  const tag = node.ordered ? "ol" : "ul";
  const items = (node.items || []).map((item) => renderBlockMarkdown(item)).join("");
  return `<${tag}>${items}</${tag}>`;
}

function renderListItemMarkdown(node, ordered, index = 0) {
  const _marker = ordered ? `${index + 1}. ` : "- ";
  return `<li>${(node.children || []).map(renderBlockMarkdown).filter(Boolean).join("")}</li>`;
}

function renderImageHtml(node) {
  const src = imagePath(node.source?.part || "");
  const alt = node.altText || node.caption || "";
  const width = node.dimensions?.width ? ` width="${node.dimensions.width}"` : "";
  const height = node.dimensions?.height ? ` height="${node.dimensions.height}"` : "";
  const caption = node.caption ? `<figcaption>${escapeHtml(node.caption)}</figcaption>` : "";
  return `<figure class="image-block"><img src="${escapeHtmlAttribute(src)}" alt="${escapeHtmlAttribute(alt)}"${width}${height} />${caption}</figure>`;
}

function renderImageMarkdown(node) {
  const src = imagePath(node.source?.part || "");
  return `![${escapeMarkdown(node.caption || node.altText || "image")}](${src})`;
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
      return renderDisplayMathHtml(node);
    case "list":
      return renderListHtml(node);
    case "list_item":
      return `<li>${(node.children || []).map(renderBlockHtml).join("")}</li>`;
    case "table":
      return renderTableHtml(node);
    case "image":
      return renderImageHtml(node);
    case "page_break":
      return `<hr class="page-break" />`;
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
      return `<h${level}>${renderParagraphChildrenMarkdown(node.children || [])}</h${level}>`;
    }
    case "paragraph":
      return `<p>${renderParagraphChildrenMarkdown(node.children || [])}</p>`;
    case "display_math":
      return `$$\n${node.latex || ""}\n$$`;
    case "list":
      return renderListMarkdown(node);
    case "list_item":
      return renderListItemMarkdown(node, node.ordered);
    case "table":
      return renderTableHtml(node);
    case "image":
      return renderImageHtml(node);
    case "page_break":
      return `<hr class="page-break" />`;
    default:
      return "";
  }
}

function renderHeaderFooterHtml(documentTree) {
  const headerBlocks = (documentTree.headers || []).flatMap((header) => header.children || []).map(renderBlockHtml).join("");
  const footerBlocks = (documentTree.footers || []).flatMap((footer) => footer.children || []).map(renderBlockHtml).join("");
  return {
    header: headerBlocks ? `<header class="doc-header">${headerBlocks}</header>` : "",
    footer: footerBlocks ? `<footer class="doc-footer">${footerBlocks}</footer>` : ""
  };
}

function renderHeaderFooterMarkdown(documentTree) {
  const header = (documentTree.headers || []).flatMap((item) => item.children || []).map(renderBlockMarkdown).filter(Boolean).join("\n\n");
  const footer = (documentTree.footers || []).flatMap((item) => item.children || []).map(renderBlockMarkdown).filter(Boolean).join("\n\n");
  return { header, footer };
}

function renderHtmlDocument(documentTree) {
  const title = documentTitle(documentTree);
  const { header, footer } = renderHeaderFooterHtml(documentTree);
  const body = (documentTree.body?.children || []).map(renderBlockHtml).join("");
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light;
        --page-width: 820px;
        --text: #1f2328;
        --muted: #5f6b7a;
        --line: #d8dee4;
        --paper: #ffffff;
        --surface: #f6f8fa;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 32px 20px 56px;
        font-family: Georgia, "Times New Roman", serif;
        color: var(--text);
        background: linear-gradient(180deg, #eef2f6 0%, #f8fafc 100%);
      }
      .document-shell {
        max-width: var(--page-width);
        margin: 0 auto;
        background: var(--paper);
        border: 1px solid var(--line);
        box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
        padding: 40px 52px;
      }
      .doc-header, .doc-footer {
        color: var(--muted);
        font-size: 0.95rem;
        border-bottom: 1px solid var(--line);
        padding-bottom: 14px;
        margin-bottom: 24px;
      }
      .doc-footer {
        border-bottom: 0;
        border-top: 1px solid var(--line);
        padding-top: 14px;
        margin-top: 28px;
      }
      h1, h2, h3, h4, h5, h6 {
        margin: 1.5em 0 0.5em;
        line-height: 1.2;
      }
      p, li { line-height: 1.65; font-size: 1.02rem; }
      p { margin: 0 0 1rem; }
      ul, ol { margin: 0 0 1rem 1.4rem; padding: 0; }
      li > p:first-child { margin-top: 0; }
      table {
        width: 100%;
        border-collapse: collapse;
        margin: 1.25rem 0;
        font-size: 0.96rem;
      }
      td, th {
        border: 1px solid var(--line);
        vertical-align: top;
        padding: 10px 12px;
      }
      .math.display {
        overflow-x: auto;
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 10px;
        padding: 14px 18px;
        margin: 1rem 0 1.2rem;
      }
      .math.inline {
        vertical-align: middle;
      }
      .image-block {
        margin: 1.25rem 0;
      }
      .image-block img {
        max-width: 100%;
        height: auto;
        display: block;
        border: 1px solid var(--line);
      }
      .image-block figcaption {
        color: var(--muted);
        font-size: 0.92rem;
        margin-top: 0.5rem;
      }
      .page-break {
        border: 0;
        border-top: 2px dashed var(--line);
        margin: 2rem 0;
      }
      @media (max-width: 720px) {
        .document-shell { padding: 24px 18px; }
      }
    </style>
  </head>
  <body>
    <main class="document-shell">
      ${header}
      <article>
        ${body}
      </article>
      ${footer}
    </main>
  </body>
</html>
`;
}

function renderMarkdownDocument(documentTree) {
  const title = documentTitle(documentTree);
  const { header, footer } = renderHeaderFooterMarkdown(documentTree);
  const body = (documentTree.body?.children || []).map(renderBlockMarkdown).filter(Boolean).join("\n");
  const parts = [`# ${title}`];
  if (header) parts.push(header);
  if (body) parts.push(body);
  if (footer) parts.push(footer);
  return `${parts.join("\n\n").trim()}\n`;
}

async function main() {
  await ensureDir(outputDir);
  const documentTree = JSON.parse(await readFile(inputFile, "utf8"));
  const html = renderHtmlDocument(documentTree);
  const markdown = renderMarkdownDocument(documentTree);
  await Promise.all([
    Bun.write ? Bun.write(htmlOutputFile, html) : null,
    Bun.write ? Bun.write(markdownOutputFile, markdown) : null
  ].filter(Boolean));
}

main().catch(async (error) => {
  if (error?.name === "ReferenceError" || typeof Bun === "undefined") {
    const { writeFile } = await import("node:fs/promises");
    const documentTree = JSON.parse(await readFile(inputFile, "utf8"));
    const html = renderHtmlDocument(documentTree);
    const markdown = renderMarkdownDocument(documentTree);
    await writeFile(htmlOutputFile, html, "utf8");
    await writeFile(markdownOutputFile, markdown, "utf8");
    console.log(JSON.stringify({ htmlOutputFile, markdownOutputFile }, null, 2));
    return;
  }
  console.error(error);
  process.exitCode = 1;
});