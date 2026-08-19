import { createSupabaseAdminClient, getDemoOwnerUserId, isSupabaseConfigured } from "./supabaseClient.js";
import {
  DEFAULT_DOCUMENT_SOURCE_TYPE,
  DEFAULT_SUBJECT_COLOR,
  DEFAULT_WORKSPACE_COLOR,
  normalizeSubjectColor,
  normalizeSubjectName,
  normalizeWorkspaceColor,
  normalizeWorkspaceName,
  DEFAULT_TOPIC_TAG_COLOR,
  dedupeTagNames,
  normalizeTagName,
  normalizeTopicTagColor,
  normalizeDocumentMeta,
  normalizeDocumentName,
  normalizeDocumentSourceType,
  normalizeFolderIds
} from "../modules/core/contracts.js";
import {
  chunkDocument,
  DEFAULT_CHUNK_WORDS,
  DEFAULT_OVERLAP_WORDS
} from "../modules/ai-tools/pipeline/chunking.js";
import {
  embedQuery,
  embedTexts,
  isEmbeddingProviderConfigured,
  toVectorLiteral
} from "../modules/ai-tools/pipeline/embeddings.js";
import { processUploadedDocument } from "../modules/document-processing/index.js";
import JSZip from "jszip";
import katex from "katex";
import TurndownService from "turndown";

let folderHierarchySupported;
let documentFoldersSupported;
let documentChunksSupported;
let documentChunkEmbeddingsSupported;
let documentChunkMarkdownFieldsSupported;
let documentSourceTypeSupported;
let documentReviewFieldsSupported;
let documentReviewEnhancementFieldsSupported;
let documentSourceVisualFieldsSupported;
let documentBlockFieldsSupported;
let documentBlockTemplateLibrarySupported;
let generatedDocumentExportsSupported;
let topicTagColorSupported;
let workspaceColorSupported;
let subjectColorSupported;

const GENERATED_QUIZ_NAME_PREFIX = "Generated Quiz - ";
const GENERATED_DOCUMENT_BUNDLE_VERSION = "generated-document-bundle-v1";
const EQUATION_KEYWORD_PREFIX = "eqid:";
const DOCUMENT_BLOCK_SCHEMA_VERSION = "block-editor-v1";

function normalizeDocumentBlocksJson(value) {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }
  return typeof value === "object" ? value : null;
}

function normalizeEquationIds(ids = []) {
  return Array.from(new Set((Array.isArray(ids) ? ids : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean)));
}

function appendEquationKeywordTags(keywords = [], equationIds = []) {
  const baseKeywords = Array.isArray(keywords)
    ? keywords.map((word) => String(word || "").trim()).filter(Boolean)
    : [];
  const tags = normalizeEquationIds(equationIds).map((id) => `${EQUATION_KEYWORD_PREFIX}${id}`);
  return Array.from(new Set([...baseKeywords, ...tags]));
}

function splitEquationKeywordTags(keywords = []) {
  const list = Array.isArray(keywords)
    ? keywords.map((word) => String(word || "").trim()).filter(Boolean)
    : [];
  const equationIds = [];
  const contentKeywords = [];
  for (const keyword of list) {
    if (keyword.startsWith(EQUATION_KEYWORD_PREFIX)) {
      const id = keyword.slice(EQUATION_KEYWORD_PREFIX.length).trim();
      if (id) equationIds.push(id);
      continue;
    }
    contentKeywords.push(keyword);
  }
  return {
    equationIds: normalizeEquationIds(equationIds),
    keywords: contentKeywords
  };
}

function sanitizeEditableHtml(html = "") {
  return String(html || "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "");
}

function htmlToPlainText(html = "") {
  return String(html || "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
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

function splitTemplateBlockClassesMeta(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const meta = source.__luna_meta && typeof source.__luna_meta === "object" ? source.__luna_meta : {};
  const blockHtmlTemplates = meta.blockHtmlTemplates && typeof meta.blockHtmlTemplates === "object"
    ? meta.blockHtmlTemplates
    : {};
  const blockFormats = meta.blockFormats && typeof meta.blockFormats === "object"
    ? meta.blockFormats
    : {};
  const folderId = String(meta.folderId || "").trim() || "tpl-folder-root";
  const blockClasses = { ...source };
  delete blockClasses.__luna_meta;
  return { blockClasses, blockHtmlTemplates, blockFormats, folderId };
}

function composeTemplateBlockClassesMeta(blockClasses = {}, blockHtmlTemplates = {}, blockFormats = {}, folderId = "tpl-folder-root") {
  const classes = blockClasses && typeof blockClasses === "object" ? { ...blockClasses } : {};
  const htmlTemplates = blockHtmlTemplates && typeof blockHtmlTemplates === "object" ? blockHtmlTemplates : {};
  const formats = blockFormats && typeof blockFormats === "object" ? blockFormats : {};
  classes.__luna_meta = {
    blockHtmlTemplates: htmlTemplates,
    blockFormats: formats,
    folderId: String(folderId || "").trim() || "tpl-folder-root"
  };
  return classes;
}

function fillTemplatePlaceholders(template = "", vars = {}) {
  return String(template || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const value = Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : "";
    return String(value ?? "");
  });
}

function resolveBlockFormatSpec(template = {}, block = {}) {
  const type = String(block?.type || "paragraph");
  const formatName = String(block?.formatName || "").trim();
  const formats = Array.isArray(template?.blockFormats?.[type]) ? template.blockFormats[type] : [];
  const fallbackClass = String(template?.blockClasses?.[type] || "").trim();
  const fallbackHtml = String(template?.blockHtmlTemplates?.[type] || "");
  const match = formats.find((item) => String(item?.name || "").trim() === formatName) || formats[0] || null;
  return {
    className: String(match?.className || fallbackClass || ""),
    htmlTemplate: String(match?.htmlTemplate || fallbackHtml || "")
  };
}

function renderDocumentBlocksHtml(blocks = [], template = {}) {
  const safeBlocks = Array.isArray(blocks) && blocks.length ? blocks : [{ id: "block_empty", type: "paragraph", text: "" }];
  const blockClasses = template?.blockClasses && typeof template.blockClasses === "object" ? template.blockClasses : {};
  const blockHtmlTemplates = template?.blockHtmlTemplates && typeof template.blockHtmlTemplates === "object" ? template.blockHtmlTemplates : {};
  const css = String(template?.css || "").trim();
  const containerClass = String(template?.containerClass || "luna-template-default");

  const renderByType = (block = {}, className = "") => {
    const classAttr = className ? ` class="${escapeHtml(className)}"` : "";
    const blockIdAttr = ` data-block-id="${escapeHtml(block.id || `block_${Date.now().toString(36)}`)}"`;
    const type = String(block.type || "paragraph");
    const overrideTemplates = block.__templateHtml && typeof block.__templateHtml === "object" ? block.__templateHtml : {};
    const templateHtml = String(overrideTemplates[type] || blockHtmlTemplates[type] || "").trim();

    const applyTemplate = (fallback, vars = {}) => {
      if (!templateHtml) return fallback;
      return fillTemplatePlaceholders(templateHtml, vars);
    };

    if (type === "heading1" || type === "heading2" || type === "heading3") {
      const tag = type === "heading1" ? "h1" : (type === "heading2" ? "h2" : "h3");
      const text = escapeHtml(block.text || "");
      return applyTemplate(`<${tag}${classAttr}${blockIdAttr}>${text}</${tag}>`, { text });
    }

    if (type === "standalone_text") {
      const text = escapeHtml(block.text || "").replace(/\n/g, "<br />");
      return applyTemplate(`<div${classAttr}${blockIdAttr}>${text}</div>`, { text });
    }

    if (type === "paragraph") {
      const htmlValue = String(block.html || "").trim();
      const text = escapeHtml(block.text || "").replace(/\n/g, "<br />");
      return htmlValue
        ? applyTemplate(`<div${classAttr}${blockIdAttr}>${htmlValue}</div>`, { html: htmlValue, text })
        : applyTemplate(`<p${classAttr}${blockIdAttr}>${text}</p>`, { text });
    }

    if (type === "bullet_list") {
      const items = Array.isArray(block.items) ? block.items : [];
      const itemHtml = items.map((item) => `<li>${escapeHtml(item || "")}</li>`).join("");
      return applyTemplate(`<ul${classAttr}${blockIdAttr}>${itemHtml}</ul>`, { items: itemHtml });
    }

    if (type === "standalone_formula") {
      const latex = escapeHtml(block.latex || "\\placeholder");
      return applyTemplate(`<div${classAttr}${blockIdAttr}>$$${latex}$$</div>`, { latex });
    }

    if (type === "table") {
      const tableHtml = String(block.tableHtml || "").trim();
      if (tableHtml) {
        const withAttrs = tableHtml.replace(/<table(\s|>)/i, `<table${classAttr}${blockIdAttr}$1`);
        return applyTemplate(withAttrs, { table: withAttrs });
      }
      const rows = Array.isArray(block.rows) ? block.rows : [];
      const rowHtml = rows.map((row) => `<tr>${(Array.isArray(row) ? row : []).map((cell) => `<td>${escapeHtml(cell || "")}</td>`).join("")}</tr>`).join("");
      const table = `<table${classAttr}${blockIdAttr}><tbody>${rowHtml}</tbody></table>`;
      return applyTemplate(table, { table, rows: rowHtml });
    }

    if (type === "image") {
      const src = escapeHtml(block.src || "");
      const alt = escapeHtml(block.alt || "");
      const caption = String(block.caption || "").trim();
      const figureCaption = caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : "";
      return applyTemplate(`<figure${classAttr}${blockIdAttr}><img src="${src}" alt="${alt}" />${figureCaption}</figure>`, { src, alt, caption: escapeHtml(caption) });
    }

    if (type === "url") {
      const href = escapeHtml(block.href || "");
      const text = escapeHtml(block.text || block.href || "");
      return applyTemplate(`<p${classAttr}${blockIdAttr}><a href="${href}">${text}</a></p>`, { href, text });
    }

    if (type === "code") {
      const language = escapeHtml(block.language || "text");
      const code = escapeHtml(block.code || "");
      return applyTemplate(`<pre${classAttr}${blockIdAttr} data-language="${language}"><code>${code}</code></pre>`, { language, code });
    }

    const fallbackText = escapeHtml(block.text || "");
    return applyTemplate(`<p${classAttr}${blockIdAttr}>${fallbackText}</p>`, { text: fallbackText });
  };

  const htmlBlocks = safeBlocks.map((block) => {
    const className = String(blockClasses[String(block.type || "paragraph")] || "");
    const formatSpec = resolveBlockFormatSpec(template, block);
    const nextBlock = {
      ...block,
      __templateHtml: {
        [String(block.type || "paragraph")]: formatSpec.htmlTemplate
      }
    };
    return renderByType(nextBlock, formatSpec.className || className);
  }).join("\n");

  const styleTag = css ? `<style data-luna-template="${escapeHtml(template?.id || "template_default")}">${css}</style>` : "";
  return `${styleTag}<div class="${escapeHtml(containerClass)}" data-template-id="${escapeHtml(template?.id || "template_default")}">${htmlBlocks}</div>`;
}

async function ensureTopicTags(client, subjectId, tags) {
  const hasTopicTagColor = await supportsTopicTagColor(client);
  const normalized = dedupeTagNames(tags);
  if (!normalized.length) return [];

  const { data: existing, error: existingError } = await client
    .from("topic_tags")
    .select("id, tag")
    .eq("subject_id", subjectId)
    .in("tag", normalized);

  if (existingError) throw existingError;

  const existingByTag = new Map((existing || []).map((row) => [row.tag, row.id]));
  const missing = normalized.filter((tag) => !existingByTag.has(tag));

  if (missing.length) {
    const { error: insertError } = await client
      .from("topic_tags")
        .insert(missing.map((tag) => ({ subject_id: subjectId, tag })));

    if (insertError) throw insertError;
  }

  const { data: allTags, error: allTagsError } = await client
    .from("topic_tags")
    .select(hasTopicTagColor ? "id, tag, color" : "id, tag")
    .eq("subject_id", subjectId)
    .in("tag", normalized);

  if (allTagsError) throw allTagsError;
  return allTags || [];
}

async function supportsFolderHierarchy(client) {
  if (typeof folderHierarchySupported === "boolean") {
    return folderHierarchySupported;
  }

  const { error } = await client
    .from("folders")
    .select("parent_folder_id")
    .limit(1);

  folderHierarchySupported = !error;
  return folderHierarchySupported;
}

async function supportsDocumentFolders(client) {
  if (typeof documentFoldersSupported === "boolean") {
    return documentFoldersSupported;
  }

  const { error } = await client
    .from("document_folders")
    .select("document_id")
    .limit(1);

  documentFoldersSupported = !error;
  return documentFoldersSupported;
}

async function supportsDocumentChunks(client) {
  if (typeof documentChunksSupported === "boolean") {
    return documentChunksSupported;
  }

  const { error } = await client
    .from("document_chunks")
    .select("document_id")
    .limit(1);

  documentChunksSupported = !error;
  return documentChunksSupported;
}

async function supportsDocumentChunkEmbeddings(client) {
  if (typeof documentChunkEmbeddingsSupported === "boolean") {
    return documentChunkEmbeddingsSupported;
  }

  const { error } = await client
    .from("document_chunks")
    .select("embedding")
    .limit(1);

  documentChunkEmbeddingsSupported = !error;
  return documentChunkEmbeddingsSupported;
}

async function supportsDocumentChunkMarkdownFields(client) {
  if (typeof documentChunkMarkdownFieldsSupported === "boolean") {
    return documentChunkMarkdownFieldsSupported;
  }

  const { error } = await client
    .from("document_chunks")
    .select("token_count, section, heading_path, page_number, content_markdown")
    .limit(1);

  documentChunkMarkdownFieldsSupported = !error;
  return documentChunkMarkdownFieldsSupported;
}

async function supportsDocumentSourceType(client) {
  if (typeof documentSourceTypeSupported === "boolean") {
    return documentSourceTypeSupported;
  }

  const { error } = await client
    .from("documents")
    .select("source_type")
    .limit(1);

  documentSourceTypeSupported = !error;
  return documentSourceTypeSupported;
}

async function supportsDocumentReviewFields(client) {
  if (typeof documentReviewFieldsSupported === "boolean") {
    return documentReviewFieldsSupported;
  }

  const { error } = await client
    .from("documents")
    .select("review_status, extraction_confidence, extraction_method, extraction_issues, extraction_requires_review, reviewed_at")
    .limit(1);

  documentReviewFieldsSupported = !error;
  return documentReviewFieldsSupported;
}

async function supportsDocumentReviewEnhancementFields(client) {
  if (typeof documentReviewEnhancementFieldsSupported === "boolean") {
    return documentReviewEnhancementFieldsSupported;
  }

  const { error } = await client
    .from("documents")
    .select("source_preview, extraction_risk_markers")
    .limit(1);

  documentReviewEnhancementFieldsSupported = !error;
  return documentReviewEnhancementFieldsSupported;
}

async function supportsDocumentSourceVisualFields(client) {
  if (typeof documentSourceVisualFieldsSupported === "boolean") {
    return documentSourceVisualFieldsSupported;
  }

  const { error } = await client
    .from("documents")
    .select("source_mime_type, source_content_base64, source_render_html")
    .limit(1);

  documentSourceVisualFieldsSupported = !error;
  return documentSourceVisualFieldsSupported;
}

async function supportsDocumentBlockFields(client) {
  if (typeof documentBlockFieldsSupported === "boolean") {
    return documentBlockFieldsSupported;
  }

  const { error } = await client
    .from("documents")
    .select("content_template_id, content_blocks_json, content_blocks_schema_version")
    .limit(1);

  documentBlockFieldsSupported = !error;
  return documentBlockFieldsSupported;
}

async function supportsDocumentBlockTemplateLibrary(client) {
  if (typeof documentBlockTemplateLibrarySupported === "boolean") {
    return documentBlockTemplateLibrarySupported;
  }

  const { error } = await client
    .from("document_block_templates")
    .select("id")
    .limit(1);

  documentBlockTemplateLibrarySupported = !error;
  return documentBlockTemplateLibrarySupported;
}

async function supportsGeneratedDocumentExports(client) {
  if (typeof generatedDocumentExportsSupported === "boolean") {
    return generatedDocumentExportsSupported;
  }

  const { error } = await client
    .from("generated_document_exports")
    .select("document_id")
    .limit(1);

  generatedDocumentExportsSupported = !error;
  return generatedDocumentExportsSupported;
}

function getGeneratedExportSpec(format) {
  const normalized = String(format || "").trim().toLowerCase();
  if (normalized === "html") {
    return { format: "html", extension: "html", mimeType: "text/html" };
  }
  if (normalized === "json") {
    return { format: "json", extension: "json", mimeType: "application/json" };
  }
  if (normalized === "docx") {
    return { format: "docx", extension: "docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  }
  if (normalized === "pdf") {
    return { format: "pdf", extension: "pdf", mimeType: "application/pdf" };
  }
  return { format: "txt", extension: "txt", mimeType: "text/plain" };
}

function withFileExtension(name, extension) {
  const baseName = String(name || "Generated Quiz").trim().replace(/\.[^.]+$/, "") || "Generated Quiz";
  return `${baseName}.${extension}`;
}

function getExtensionFromName(name, fallback = "txt") {
  const match = String(name || "").trim().toLowerCase().match(/\.([a-z0-9]+)$/i);
  return match?.[1] || fallback;
}

function getMimeTypeForExtension(extension) {
  const normalized = String(extension || "").trim().toLowerCase();
  if (normalized === "html" || normalized === "htm") return "text/html";
  if (normalized === "json") return "application/json";
  if (normalized === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (normalized === "pdf") return "application/pdf";
  if (normalized === "md") return "text/markdown";
  if (normalized === "csv") return "text/csv";
  return "text/plain";
}

function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function markdownToBasicHtml(markdown = "") {
  const source = String(markdown || "").replace(/\r\n/g, "\n");
  const lines = source.split("\n");
  const html = [];
  let inList = false;

  for (const rawLine of lines) {
    const line = String(rawLine || "");
    const trimmed = line.trim();

    if (!trimmed) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      const level = headingMatch[1].length;
      html.push(`<h${level}>${escapeHtml(headingMatch[2])}</h${level}>`);
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${escapeHtml(trimmed.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }

    if (inList) {
      html.push("</ul>");
      inList = false;
    }

    html.push(`<p>${escapeHtml(trimmed)}</p>`);
  }

  if (inList) {
    html.push("</ul>");
  }

  return html.join("\n").trim();
}

const DOCX_MEDIA_MIME_BY_EXT = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  emf: "image/emf",
  wmf: "image/wmf"
};

function getDocxMediaMimeType(path = "") {
  const extMatch = String(path || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  const ext = extMatch?.[1] || "";
  return DOCX_MEDIA_MIME_BY_EXT[ext] || "application/octet-stream";
}

function normalizeMediaLookupKey(value = "") {
  return String(value || "")
    .trim()
    .replace(/^\.\//, "")
    .replace(/^\//, "")
    .replace(/[?#].*$/, "");
}

async function extractDocxMediaDataUrls(sourceContentBase64 = "") {
  const encoded = String(sourceContentBase64 || "").trim();
  if (!encoded) return new Map();

  try {
    const sourceBuffer = Buffer.from(encoded, "base64");
    const zip = await JSZip.loadAsync(sourceBuffer);
    const mediaMap = new Map();
    const entries = Object.entries(zip.files || {});

    for (const [zipPath, zipEntry] of entries) {
      if (!zipPath.startsWith("word/media/") || zipEntry?.dir) continue;
      const baseName = zipPath.split("/").pop() || "";
      if (!baseName) continue;
      const mediaBase64 = await zipEntry.async("base64");
      const mimeType = getDocxMediaMimeType(zipPath);
      const dataUrl = `data:${mimeType};base64,${mediaBase64}`;
      mediaMap.set(normalizeMediaLookupKey(baseName), dataUrl);
      mediaMap.set(normalizeMediaLookupKey(`assets/${baseName}`), dataUrl);
      mediaMap.set(normalizeMediaLookupKey(`word/media/${baseName}`), dataUrl);
    }

    return mediaMap;
  } catch {
    return new Map();
  }
}

function mapMediaSource(source = "", mediaMap = new Map()) {
  const key = normalizeMediaLookupKey(source);
  if (!key) return "";
  return mediaMap.get(key) || "";
}

function embedMediaDataUrlsInHtml(html = "", mediaMap = new Map()) {
  if (!mediaMap.size) return String(html || "");
  return String(html || "").replace(
    /(<img\b[^>]*\bsrc\s*=\s*["'])([^"']+)(["'][^>]*>)/gi,
    (match, prefix, src, suffix) => {
      const mapped = mapMediaSource(src, mediaMap);
      return mapped ? `${prefix}${mapped}${suffix}` : match;
    }
  );
}

function embedMediaDataUrlsInMarkdown(markdown = "", mediaMap = new Map()) {
  if (!mediaMap.size) return String(markdown || "");
  return String(markdown || "").replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
    const mapped = mapMediaSource(src, mediaMap);
    return mapped ? `![${alt}](${mapped})` : match;
  });
}

function htmlToMarkdownDocument(html = "", fallbackText = "") {
  const source = String(html || "").trim();
  if (!source) return String(fallbackText || "");

  try {
    const turndown = new TurndownService({
      headingStyle: "atx",
      bulletListMarker: "-",
      codeBlockStyle: "fenced"
    });
    return turndown.turndown(source).trim();
  } catch {
    return String(fallbackText || "");
  }
}

function renderLatexWithKatex(html = "") {
  let rendered = String(html || "");
  if (!rendered.trim()) return rendered;

  rendered = rendered.replace(/<pre\b[^>]*class=["'][^"']*math-display[^"']*["'][^>]*>\s*\$\$([\s\S]*?)\$\$\s*<\/pre>/gi, (_, expr) => {
    const latex = String(expr || "").trim();
    if (!latex) return "";
    try {
      return `<div class="math-display nicer-latex">${katex.renderToString(latex, { displayMode: true, throwOnError: false })}</div>`;
    } catch {
      return `<pre class="math-display">$$\n${escapeHtml(latex)}\n$$</pre>`;
    }
  });

  rendered = rendered.replace(/<code\b[^>]*class=["'][^"']*math-inline[^"']*["'][^>]*>\s*\$([^$\n]+?)\$\s*<\/code>/gi, (_, expr) => {
    const latex = String(expr || "").trim();
    if (!latex) return "";
    try {
      return `<span class="math-inline nicer-latex">${katex.renderToString(latex, { displayMode: false, throwOnError: false })}</span>`;
    } catch {
      return `<code class="math-inline">$${escapeHtml(latex)}$</code>`;
    }
  });

  return rendered;
}

function wrapDownloadedHtmlDocument(html = "") {
  const content = String(html || "").trim();
  const headExtras = `
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" />
<style>
  body { font-family: "Iowan Old Style", "Palatino Linotype", serif; line-height: 1.62; margin: 28px auto; max-width: 900px; padding: 0 20px; color: #1e2333; }
  article { background: linear-gradient(180deg, #ffffff, #fbfcff); border: 1px solid #e6ecff; border-radius: 14px; padding: 24px; box-shadow: 0 8px 26px rgba(36, 68, 128, 0.08); }
  h1, h2, h3, h4 { color: #16234d; }
  p { margin: 0 0 12px; }
  img, .inline-image {
    max-width: 100% !important;
    width: auto !important;
    height: auto !important;
    display: block;
    margin: 8px 0;
    border-radius: 10px;
    border: 1px solid #dbe6ff;
    box-shadow: 0 6px 18px rgba(36, 68, 128, 0.12);
  }
  figure { margin: 16px 0; }
  table { border-collapse: collapse; width: 100%; margin: 16px 0; }
  td, th { border: 1px solid #d5dff6; padding: 8px; vertical-align: top; }
  .nicer-latex { background: linear-gradient(180deg, #f7f9ff, #f0f5ff); border: 1px solid #d0dcfb; border-radius: 10px; padding: 8px 10px; }
  .math-display.nicer-latex { margin: 12px 0; overflow-x: auto; }
  .math-inline.nicer-latex { display: inline-block; margin: 0 2px; }
</style>`;

  if (!content) {
    return `<!DOCTYPE html><html lang="en"><head>${headExtras}</head><body><article><p>(empty)</p></article></body></html>`;
  }

  if (/<html[\s>]/i.test(content)) {
    if (/<head[\s>]/i.test(content)) {
      return content.replace(/<head[^>]*>/i, (match) => `${match}${headExtras}`);
    }
    return content.replace(/<html([^>]*)>/i, `<html$1><head>${headExtras}</head>`);
  }

  return `<!DOCTYPE html><html lang="en"><head>${headExtras}</head><body><article>${content}</article></body></html>`;
}

function buildGeneratedDocumentBundle({ plainText, downloads }) {
  return JSON.stringify({
    version: GENERATED_DOCUMENT_BUNDLE_VERSION,
    plainText: String(plainText || ""),
    downloads: Object.fromEntries(
      Object.entries(downloads || {}).map(([format, contentBase64]) => {
        const spec = getGeneratedExportSpec(format);
        return [spec.format, {
          mimeType: spec.mimeType,
          extension: spec.extension,
          contentBase64: String(contentBase64 || "")
        }];
      }).filter(([, entry]) => entry.contentBase64)
    )
  });
}

function parseGeneratedDocumentBundle(content) {
  const text = String(content || "").trim();
  if (!text.startsWith("{")) return null;

  try {
    const parsed = JSON.parse(text);
    if (parsed?.version !== GENERATED_DOCUMENT_BUNDLE_VERSION || typeof parsed?.plainText !== "string" || typeof parsed?.downloads !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function inferDocumentSourceType(row) {
  const explicit = normalizeDocumentSourceType(row?.source_type || row?.sourceType || DEFAULT_DOCUMENT_SOURCE_TYPE);
  if (row?.source_type || row?.sourceType) return explicit;

  const name = String(row?.name || "").trim();
  return name.startsWith(GENERATED_QUIZ_NAME_PREFIX) ? "generated" : DEFAULT_DOCUMENT_SOURCE_TYPE;
}

async function supportsTopicTagColor(client) {
  if (typeof topicTagColorSupported === "boolean") {
    return topicTagColorSupported;
  }

  const { error } = await client
    .from("topic_tags")
    .select("color")
    .limit(1);

  topicTagColorSupported = !error;
  return topicTagColorSupported;
}

async function supportsWorkspaceColor(client) {
  if (typeof workspaceColorSupported === "boolean") {
    return workspaceColorSupported;
  }

  const { error } = await client
    .from("workspaces")
    .select("color")
    .limit(1);

  workspaceColorSupported = !error;
  return workspaceColorSupported;
}

async function supportsSubjectColor(client) {
  if (typeof subjectColorSupported === "boolean") {
    return subjectColorSupported;
  }

  const { error } = await client
    .from("subjects")
    .select("color")
    .limit(1);

  subjectColorSupported = !error;
  return subjectColorSupported;
}

export async function listWorkspaceTree(ownerUserId = getDemoOwnerUserId()) {
  const client = createSupabaseAdminClient();
  const hasFolderHierarchy = await supportsFolderHierarchy(client);
  const hasDocumentFolders = await supportsDocumentFolders(client);
  const hasDocumentSourceType = await supportsDocumentSourceType(client);
  const hasDocumentReviewFields = await supportsDocumentReviewFields(client);
  const hasDocumentReviewEnhancementFields = await supportsDocumentReviewEnhancementFields(client);
  const hasDocumentSourceVisualFields = await supportsDocumentSourceVisualFields(client);
  const hasDocumentBlockFields = await supportsDocumentBlockFields(client);
  const hasGeneratedDocumentExports = await supportsGeneratedDocumentExports(client);
  const hasTopicTagColor = await supportsTopicTagColor(client);
  const hasWorkspaceColor = await supportsWorkspaceColor(client);
  const hasSubjectColor = await supportsSubjectColor(client);

  const { data: workspaces, error: wsError } = await client
    .from("workspaces")
    .select(hasWorkspaceColor ? "id, name, color, owner_user_id" : "id, name, owner_user_id")
    .eq("owner_user_id", ownerUserId)
    .order("created_at", { ascending: true });

  if (wsError) throw wsError;
  if (!workspaces?.length) return [];

  const workspaceIds = workspaces.map((row) => row.id);

  const { data: subjects, error: subError } = await client
    .from("subjects")
    .select(hasSubjectColor ? "id, workspace_id, name, color" : "id, workspace_id, name")
    .in("workspace_id", workspaceIds)
    .order("created_at", { ascending: true });
  if (subError) throw subError;

  const subjectIds = (subjects || []).map((row) => row.id);

  const [foldersRes, tagsRes, docsRes] = await Promise.all([
    subjectIds.length
      ? client
        .from("folders")
        .select(hasFolderHierarchy ? "id, subject_id, name, parent_folder_id" : "id, subject_id, name")
        .in("subject_id", subjectIds)
        .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    subjectIds.length
      ? client.from("topic_tags").select(hasTopicTagColor ? "id, subject_id, tag, color" : "id, subject_id, tag").in("subject_id", subjectIds).order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    subjectIds.length
      ? client.from("documents").select(
        hasDocumentReviewFields
          ? (hasDocumentReviewEnhancementFields
            ? (hasDocumentSourceType
              ? (hasDocumentSourceVisualFields
                ? "id, subject_id, folder_id, name, content, preview, size_bytes, source_type, created_at, review_status, extraction_confidence, extraction_method, extraction_issues, extraction_requires_review, reviewed_at, source_preview, extraction_risk_markers, source_mime_type, source_content_base64, source_render_html"
                : "id, subject_id, folder_id, name, content, preview, size_bytes, source_type, created_at, review_status, extraction_confidence, extraction_method, extraction_issues, extraction_requires_review, reviewed_at, source_preview, extraction_risk_markers")
              : (hasDocumentSourceVisualFields
                ? "id, subject_id, folder_id, name, content, preview, size_bytes, created_at, review_status, extraction_confidence, extraction_method, extraction_issues, extraction_requires_review, reviewed_at, source_preview, extraction_risk_markers, source_mime_type, source_content_base64, source_render_html"
                : "id, subject_id, folder_id, name, content, preview, size_bytes, created_at, review_status, extraction_confidence, extraction_method, extraction_issues, extraction_requires_review, reviewed_at, source_preview, extraction_risk_markers"))
            : (hasDocumentSourceType
              ? "id, subject_id, folder_id, name, content, preview, size_bytes, source_type, created_at, review_status, extraction_confidence, extraction_method, extraction_issues, extraction_requires_review, reviewed_at"
              : "id, subject_id, folder_id, name, content, preview, size_bytes, created_at, review_status, extraction_confidence, extraction_method, extraction_issues, extraction_requires_review, reviewed_at"))
          : (hasDocumentSourceType
            ? (hasDocumentSourceVisualFields
              ? "id, subject_id, folder_id, name, content, preview, size_bytes, source_type, created_at, source_mime_type, source_content_base64, source_render_html"
              : "id, subject_id, folder_id, name, content, preview, size_bytes, source_type, created_at")
            : (hasDocumentSourceVisualFields
              ? "id, subject_id, folder_id, name, content, preview, size_bytes, created_at, source_mime_type, source_content_base64, source_render_html"
              : "id, subject_id, folder_id, name, content, preview, size_bytes, created_at"))
      ).in("subject_id", subjectIds).order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null })
  ]);

  if (foldersRes.error) throw foldersRes.error;
  if (tagsRes.error) throw tagsRes.error;
  if (docsRes.error) throw docsRes.error;

  const docs = docsRes.data || [];
  const docIds = docs.map((row) => row.id);

  const blockMetaRes = docIds.length && hasDocumentBlockFields
    ? await client
      .from("documents")
      .select("id, content_template_id, content_blocks_json, content_blocks_schema_version")
      .in("id", docIds)
    : { data: [], error: null };

  const docTagsRes = docIds.length
    ? await client
      .from("document_tags")
      .select("document_id, topic_tag_id, topic_tags(id, tag)")
      .in("document_id", docIds)
    : { data: [], error: null };

  const docFoldersRes = docIds.length && hasDocumentFolders
    ? await client
      .from("document_folders")
      .select("document_id, folder_id")
      .in("document_id", docIds)
    : { data: [], error: null };

  if (docTagsRes.error) throw docTagsRes.error;
  if (docFoldersRes.error) throw docFoldersRes.error;
  if (blockMetaRes.error) throw blockMetaRes.error;

  const generatedExportRes = docIds.length && hasGeneratedDocumentExports
    ? await client
      .from("generated_document_exports")
      .select("document_id, format")
      .in("document_id", docIds)
    : { data: [], error: null };

  if (generatedExportRes.error) throw generatedExportRes.error;

  const foldersBySubject = new Map();
  for (const folder of foldersRes.data || []) {
    const list = foldersBySubject.get(folder.subject_id) || [];
    list.push({ id: folder.id, name: folder.name, parentFolderId: folder.parent_folder_id || "", tags: [] });
    foldersBySubject.set(folder.subject_id, list);
  }

  const topicTagsBySubject = new Map();
  for (const tag of tagsRes.data || []) {
    const list = topicTagsBySubject.get(tag.subject_id) || [];
    list.push({
      name: tag.tag,
      color: tag.color || DEFAULT_TOPIC_TAG_COLOR
    });
    topicTagsBySubject.set(tag.subject_id, list);
  }

  const tagsByDocId = new Map();
  for (const row of docTagsRes.data || []) {
    const list = tagsByDocId.get(row.document_id) || [];
    const tag = row.topic_tags?.tag;
    if (tag) list.push(tag);
    tagsByDocId.set(row.document_id, list);
  }

  const folderIdsByDocId = new Map();
  for (const row of docFoldersRes.data || []) {
    const list = folderIdsByDocId.get(row.document_id) || [];
    if (row.folder_id) list.push(row.folder_id);
    folderIdsByDocId.set(row.document_id, list);
  }

  const exportFormatsByDocId = new Map();
  for (const row of generatedExportRes.data || []) {
    const list = exportFormatsByDocId.get(row.document_id) || [];
    list.push(String(row.format || "").trim().toLowerCase());
    exportFormatsByDocId.set(row.document_id, list);
  }

  const blockMetaByDocId = new Map();
  for (const row of blockMetaRes.data || []) {
    blockMetaByDocId.set(row.id, {
      contentTemplateId: row.content_template_id || "",
      contentBlocksJson: normalizeDocumentBlocksJson(row.content_blocks_json),
      contentBlocksSchemaVersion: String(row.content_blocks_schema_version || "").trim() || DOCUMENT_BLOCK_SCHEMA_VERSION
    });
  }

  const docsBySubject = new Map();
  for (const doc of docs) {
    const list = docsBySubject.get(doc.subject_id) || [];
    const mappedFolderIds = hasDocumentFolders ? normalizeFolderIds(folderIdsByDocId.get(doc.id) || []) : [];
    const folderIds = mappedFolderIds.length ? mappedFolderIds : normalizeFolderIds([doc.folder_id || ""]);
    const sourceType = inferDocumentSourceType(doc);
    const bundle = sourceType === "generated" ? parseGeneratedDocumentBundle(doc.content) : null;
    const reviewStatus = String(doc.review_status || (doc.extraction_requires_review ? "needs_review" : "approved"));
    const extractionConfidence = typeof doc.extraction_confidence === "number"
      ? doc.extraction_confidence
      : (reviewStatus === "approved" ? 1 : 0);
    const extractionMethod = String(doc.extraction_method || "").trim();
    const extractionIssues = Array.isArray(doc.extraction_issues) ? doc.extraction_issues : [];
    const extractionRiskMarkers = Array.isArray(doc.extraction_risk_markers) ? doc.extraction_risk_markers : [];
    const sourcePreview = String(doc.source_preview || "");
    const sourceMimeType = String(doc.source_mime_type || "").trim().toLowerCase();
    const sourceContentBase64 = String(doc.source_content_base64 || "");
    const sourceRenderHtml = String(doc.source_render_html || "");
    const blockMeta = blockMetaByDocId.get(doc.id) || {
      contentTemplateId: "",
      contentBlocksJson: null,
      contentBlocksSchemaVersion: ""
    };
    const requiresReview = Boolean(doc.extraction_requires_review || reviewStatus !== "approved");
    const availableFormats = sourceType === "generated"
      ? Array.from(new Set([...(bundle ? Object.keys(bundle.downloads || {}) : []), ...(exportFormatsByDocId.get(doc.id) || []), "txt"]))
      : Array.from(new Set([
        getExtensionFromName(doc.name, "txt"),
        "html",
        "md",
        "original",
        ...(blockMeta.contentBlocksJson ? ["blocks-json"] : [])
      ]));
    const displayContent = bundle?.plainText || doc.content;
    list.push({
      id: doc.id,
      name: doc.name,
      content: displayContent,
      preview: doc.preview,
      folderId: folderIds[0] || "",
      folderIds,
      sizeLabel: `${(Number(doc.size_bytes || 0) / 1024).toFixed(1)} KB`,
      uploadedAt: doc.created_at || "",
      sourceType,
      reviewStatus,
      extractionConfidence,
      extractionMethod,
      extractionIssues,
      extractionRiskMarkers,
      sourcePreview,
      sourceMimeType,
      sourceContentBase64,
      sourceRenderHtml,
      contentTemplateId: blockMeta.contentTemplateId,
      contentBlocksJson: blockMeta.contentBlocksJson,
      contentBlocksSchemaVersion: blockMeta.contentBlocksSchemaVersion,
      requiresReview,
      reviewedAt: doc.reviewed_at || "",
      availableFormats,
      tags: tagsByDocId.get(doc.id) || []
    });
    docsBySubject.set(doc.subject_id, list);
  }

  const subjectsByWorkspace = new Map();
  for (const subject of subjects || []) {
    const list = subjectsByWorkspace.get(subject.workspace_id) || [];
    list.push({
      id: subject.id,
      name: subject.name,
      color: subject.color || DEFAULT_SUBJECT_COLOR,
      folders: foldersBySubject.get(subject.id) || [],
      topicTags: topicTagsBySubject.get(subject.id) || [],
      documents: docsBySubject.get(subject.id) || []
    });
    subjectsByWorkspace.set(subject.workspace_id, list);
  }

  return workspaces.map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    color: workspace.color || DEFAULT_WORKSPACE_COLOR,
    subjects: subjectsByWorkspace.get(workspace.id) || []
  }));
}

export async function createWorkspace(name, ownerUserId = getDemoOwnerUserId()) {
  const client = createSupabaseAdminClient();
  const hasWorkspaceColor = await supportsWorkspaceColor(client);
  const normalizedName = normalizeWorkspaceName(name);
  const { data, error } = await client
    .from("workspaces")
    .insert(hasWorkspaceColor
      ? { name: normalizedName, owner_user_id: ownerUserId, color: DEFAULT_WORKSPACE_COLOR }
      : { name: normalizedName, owner_user_id: ownerUserId })
    .select(hasWorkspaceColor ? "id, name, color" : "id, name")
    .single();
  if (error) throw error;
  return data;
}

export async function renameWorkspace(workspaceId, nextName) {
  const client = createSupabaseAdminClient();
  const { error } = await client
    .from("workspaces")
    .update({ name: normalizeWorkspaceName(nextName), updated_at: new Date().toISOString() })
    .eq("id", workspaceId);
  if (error) throw error;
}

export async function removeWorkspace(workspaceId, force = false) {
  const client = createSupabaseAdminClient();

  const { data: subjects, error: subError } = await client
    .from("subjects")
    .select("id")
    .eq("workspace_id", workspaceId);
  if (subError) throw subError;

  const subjectIds = (subjects || []).map((row) => row.id);

  const [foldersRes, tagsRes, docsRes] = await Promise.all([
    subjectIds.length ? client.from("folders").select("id", { count: "exact", head: true }).in("subject_id", subjectIds) : Promise.resolve({ count: 0, error: null }),
    subjectIds.length ? client.from("topic_tags").select("id", { count: "exact", head: true }).in("subject_id", subjectIds) : Promise.resolve({ count: 0, error: null }),
    subjectIds.length ? client.from("documents").select("id", { count: "exact", head: true }).in("subject_id", subjectIds) : Promise.resolve({ count: 0, error: null })
  ]);

  if (foldersRes.error) throw foldersRes.error;
  if (tagsRes.error) throw tagsRes.error;
  if (docsRes.error) throw docsRes.error;

  const cascade = {
    subjects: subjectIds.length,
    folders: foldersRes.count || 0,
    topicTags: tagsRes.count || 0,
    documents: docsRes.count || 0
  };

  const hasCascadeData = cascade.subjects > 0 || cascade.folders > 0 || cascade.topicTags > 0 || cascade.documents > 0;
  if (hasCascadeData && !force) {
    return { requiresForce: true, cascade };
  }

  const { error } = await client.from("workspaces").delete().eq("id", workspaceId);
  if (error) throw error;
  return { requiresForce: false, cascade };
}

export async function createSubject(workspaceId, name) {
  const client = createSupabaseAdminClient();
  const hasSubjectColor = await supportsSubjectColor(client);
  const normalizedName = normalizeSubjectName(name);
  const { data, error } = await client
    .from("subjects")
    .insert(hasSubjectColor
      ? { workspace_id: workspaceId, name: normalizedName, color: DEFAULT_SUBJECT_COLOR }
      : { workspace_id: workspaceId, name: normalizedName })
    .select(hasSubjectColor ? "id, name, color" : "id, name")
    .single();
  if (error) throw error;
  return data;
}

export async function setWorkspaceColor(workspaceId, color) {
  const client = createSupabaseAdminClient();
  const hasWorkspaceColor = await supportsWorkspaceColor(client);
  if (!hasWorkspaceColor) {
    throw new Error("Workspace colors require migration 202608040005_add_workspace_subject_color.sql to be applied.");
  }

  const nextColor = normalizeWorkspaceColor(color);
  const { error } = await client
    .from("workspaces")
    .update({ color: nextColor, updated_at: new Date().toISOString() })
    .eq("id", workspaceId);
  if (error) throw error;
}

export async function setSubjectColor(subjectId, color) {
  const client = createSupabaseAdminClient();
  const hasSubjectColor = await supportsSubjectColor(client);
  if (!hasSubjectColor) {
    throw new Error("Subject colors require migration 202608040005_add_workspace_subject_color.sql to be applied.");
  }

  const nextColor = normalizeSubjectColor(color);
  const { error } = await client
    .from("subjects")
    .update({ color: nextColor, updated_at: new Date().toISOString() })
    .eq("id", subjectId);
  if (error) throw error;
}

export async function renameSubject(subjectId, nextName) {
  const client = createSupabaseAdminClient();
  const { error } = await client
    .from("subjects")
    .update({ name: normalizeSubjectName(nextName), updated_at: new Date().toISOString() })
    .eq("id", subjectId);
  if (error) throw error;
}

export async function removeSubject(subjectId, force = false) {
  const client = createSupabaseAdminClient();

  const [foldersRes, tagsRes, docsRes] = await Promise.all([
    client.from("folders").select("id", { count: "exact", head: true }).eq("subject_id", subjectId),
    client.from("topic_tags").select("id", { count: "exact", head: true }).eq("subject_id", subjectId),
    client.from("documents").select("id", { count: "exact", head: true }).eq("subject_id", subjectId)
  ]);

  if (foldersRes.error) throw foldersRes.error;
  if (tagsRes.error) throw tagsRes.error;
  if (docsRes.error) throw docsRes.error;

  const cascade = {
    folders: foldersRes.count || 0,
    topicTags: tagsRes.count || 0,
    documents: docsRes.count || 0
  };

  const hasCascadeData = cascade.folders > 0 || cascade.topicTags > 0 || cascade.documents > 0;
  if (hasCascadeData && !force) {
    return { requiresForce: true, cascade };
  }

  const { error } = await client.from("subjects").delete().eq("id", subjectId);
  if (error) throw error;
  return { requiresForce: false, cascade };
}

export async function createFolder(subjectId, name, parentFolderId = "") {
  const client = createSupabaseAdminClient();
  const hasFolderHierarchy = await supportsFolderHierarchy(client);

  if (parentFolderId && !hasFolderHierarchy) {
    throw new Error("Subfolders require migration 202608040002_add_folder_hierarchy.sql to be applied.");
  }

  const { data, error } = await client
    .from("folders")
    .insert(
      hasFolderHierarchy
        ? {
          subject_id: subjectId,
          name: normalizeSubjectName(name),
          parent_folder_id: parentFolderId ? String(parentFolderId) : null
        }
        : {
          subject_id: subjectId,
          name: normalizeSubjectName(name)
        }
    )
    .select(hasFolderHierarchy ? "id, name, parent_folder_id" : "id, name")
    .single();
  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    parentFolderId: data.parent_folder_id || ""
  };
}

export async function renameFolder(folderId, nextName) {
  const client = createSupabaseAdminClient();
  const { error } = await client
    .from("folders")
    .update({ name: normalizeSubjectName(nextName), updated_at: new Date().toISOString() })
    .eq("id", folderId);
  if (error) throw error;
}

export async function removeFolder(folderId) {
  const client = createSupabaseAdminClient();
  // `documents.folder_id` uses ON DELETE SET NULL and child folders use ON DELETE CASCADE.
  const { error } = await client.from("folders").delete().eq("id", folderId);
  if (error) throw error;
}

export async function addTopicTag(subjectId, tag) {
  const client = createSupabaseAdminClient();
  const normalized = normalizeTagName(tag);
  const { error } = await client
    .from("topic_tags")
    .insert({ subject_id: subjectId, tag: normalized });

  if (error && error.code !== "23505") throw error;
}

export async function renameTopicTag(subjectId, prevTag, nextTag) {
  const client = createSupabaseAdminClient();
  const previous = normalizeTagName(prevTag);
  const next = normalizeTagName(nextTag);

  const { data: prevRow, error: findError } = await client
    .from("topic_tags")
    .select("id")
    .eq("subject_id", subjectId)
    .eq("tag", previous)
    .maybeSingle();
  if (findError) throw findError;
  if (!prevRow) return;

  const { error } = await client
    .from("topic_tags")
    .update({ tag: next, updated_at: new Date().toISOString() })
    .eq("id", prevRow.id);
  if (error && error.code !== "23505") throw error;
}

export async function removeTopicTag(subjectId, tag) {
  const client = createSupabaseAdminClient();
  const normalized = normalizeTagName(tag);
  const { data: row, error: findError } = await client
    .from("topic_tags")
    .select("id")
    .eq("subject_id", subjectId)
    .eq("tag", normalized)
    .maybeSingle();
  if (findError) throw findError;
  if (!row) return;

  const { error } = await client
    .from("topic_tags")
    .delete()
    .eq("id", row.id);
  if (error) throw error;
}

export async function setTopicTagColor(subjectId, tag, color) {
  const client = createSupabaseAdminClient();
  const hasTopicTagColor = await supportsTopicTagColor(client);
  if (!hasTopicTagColor) {
    throw new Error("Tag colors require migration 202608040004_add_topic_tag_color.sql to be applied.");
  }

  const normalizedTag = normalizeTagName(tag);
  const nextColor = normalizeTopicTagColor(color);

  const { error } = await client
    .from("topic_tags")
    .update({ color: nextColor, updated_at: new Date().toISOString() })
    .eq("subject_id", subjectId)
    .eq("tag", normalizedTag);

  if (error) throw error;
}

async function persistTextDocuments(subjectId, files, options = {}) {
  const client = createSupabaseAdminClient();
  const hasDocumentFolders = await supportsDocumentFolders(client);
  const hasDocumentChunks = await supportsDocumentChunks(client);
  const hasDocumentChunkEmbeddings = hasDocumentChunks ? await supportsDocumentChunkEmbeddings(client) : false;
  const hasDocumentChunkMarkdownFields = hasDocumentChunks ? await supportsDocumentChunkMarkdownFields(client) : false;
  const hasDocumentSourceType = await supportsDocumentSourceType(client);
  const hasDocumentReviewFields = await supportsDocumentReviewFields(client);
  const hasDocumentReviewEnhancementFields = await supportsDocumentReviewEnhancementFields(client);
  const hasDocumentSourceVisualFields = await supportsDocumentSourceVisualFields(client);
  const meta = normalizeDocumentMeta(options);
  const sourceType = normalizeDocumentSourceType(options.sourceType || DEFAULT_DOCUMENT_SOURCE_TYPE);
  const persistChunks = options.persistChunks !== false && sourceType === DEFAULT_DOCUMENT_SOURCE_TYPE;
  const folderIds = normalizeFolderIds(meta.folderIds || []);
  if (folderIds.length > 1 && !hasDocumentFolders) {
    throw new Error("Multi-folder assignment requires migration 202608040003_add_document_folder_map.sql to be applied.");
  }
  const primaryFolderId = folderIds[0] || null;
  const nowIso = new Date().toISOString();

  const toInsert = files.map((file) => {
    const normalizedName = normalizeDocumentName(file.name || "");
    const fallbackName = sourceType === "generated" ? `${GENERATED_QUIZ_NAME_PREFIX}untitled.txt` : "untitled.txt";
    const baseName = normalizedName || fallbackName;
    const name = sourceType === "generated" && !hasDocumentSourceType && !baseName.startsWith(GENERATED_QUIZ_NAME_PREFIX)
      ? `${GENERATED_QUIZ_NAME_PREFIX}${baseName}`
      : baseName;
    const content = String(file.content || "");
    const preview = String(file.preview || content).trim().slice(0, 180) || "(empty file)";
    const sizeBytes = Number(file.sizeBytes || Buffer.byteLength(content, "utf8") || 0);

    const row = {
      subject_id: subjectId,
      folder_id: primaryFolderId,
      name,
      content,
      preview,
      size_bytes: sizeBytes,
      updated_at: nowIso
    };

    if (hasDocumentSourceType) {
      row.source_type = sourceType;
    }

    if (hasDocumentSourceVisualFields) {
      row.source_mime_type = String(file?.extraction?.sourceMimeType || "").trim().toLowerCase() || null;
      row.source_content_base64 = String(file?.extraction?.sourceContentBase64 || "") || null;
      row.source_render_html = String(file?.extraction?.sourceRenderHtml || "") || null;
    }

    if (hasDocumentReviewFields) {
      const extractionConfidence = Number(file?.extraction?.confidence);
      const extractionMethod = String(file?.extraction?.method || "").trim();
      const extractionIssues = Array.isArray(file?.extraction?.issues) ? file.extraction.issues : [];
      const requiresReview = Boolean(file?.extraction?.requiresReview);

      row.review_status = requiresReview ? "needs_review" : "approved";
      row.extraction_confidence = Number.isFinite(extractionConfidence) ? extractionConfidence : 1;
      row.extraction_method = extractionMethod || null;
      row.extraction_issues = extractionIssues;
      row.extraction_requires_review = requiresReview;
      row.reviewed_at = requiresReview ? null : nowIso;

      if (hasDocumentReviewEnhancementFields) {
        const sourcePreview = String(file?.extraction?.sourcePreview || "").trim();
        const extractionRiskMarkers = Array.isArray(file?.extraction?.riskMarkers) ? file.extraction.riskMarkers : [];
        row.source_preview = sourcePreview || null;
        row.extraction_risk_markers = extractionRiskMarkers;
      }
    }

    return row;
  });

  const { data: docs, error: docsError } = await client
    .from("documents")
    .insert(toInsert)
    .select(hasDocumentSourceType ? "id, subject_id, name, content, source_type" : "id, subject_id, name, content");
  if (docsError) throw docsError;

  if (persistChunks && hasDocumentChunks && docs?.length) {
    const chunkRows = docs.flatMap((doc, index) => {
      const file = files[index] || null;
      const baseDocument = {
        id: doc.id,
        subjectId: doc.subject_id || subjectId,
        name: doc.name,
        content: doc.content,
        canonicalDocument: file?.extraction?.canonicalDocument || null,
        folderIds,
        tags: dedupeTagNames(meta.tags || [])
      };

      return chunkDocument(baseDocument, {
        chunkWords: DEFAULT_CHUNK_WORDS,
        overlapWords: DEFAULT_OVERLAP_WORDS
      }).map((chunk) => ({
        document_id: doc.id,
        subject_id: doc.subject_id || subjectId,
        chunk_index: chunk.chunkIndex,
        chunk_words: DEFAULT_CHUNK_WORDS,
        overlap_words: DEFAULT_OVERLAP_WORDS,
        start_word: chunk.startWord,
        end_word: chunk.endWord,
        word_count: chunk.wordCount,
        semantic_score: chunk.semanticScore,
        keywords: appendEquationKeywordTags(chunk.keywords, chunk.equationIds),
        content: chunk.contentMarkdown || chunk.content,
        ...(hasDocumentChunkMarkdownFields
          ? {
            token_count: Number(chunk.tokenCount || 0),
            section: String(chunk.section || ""),
            heading_path: Array.isArray(chunk.headingPath) ? chunk.headingPath : [],
            page_number: Number.isFinite(Number(chunk.page)) ? Number(chunk.page) : null,
            content_markdown: chunk.contentMarkdown || chunk.content || ""
          }
          : {})
      }));
    });

    if (chunkRows.length) {
      if (hasDocumentChunkEmbeddings && isEmbeddingProviderConfigured()) {
        const embeddings = await embedTexts(chunkRows.map((row) => row.content));
        for (let index = 0; index < chunkRows.length; index += 1) {
          const embedding = embeddings[index];
          if (embedding) {
            chunkRows[index].embedding = toVectorLiteral(embedding);
          }
        }
      }

      const { error: chunkInsertError } = await client
        .from("document_chunks")
        .insert(chunkRows);
      if (chunkInsertError) throw chunkInsertError;
    }
  }

  if (hasDocumentFolders && folderIds.length && docs?.length) {
    const docFolderRows = [];
    for (const doc of docs) {
      for (const folderId of folderIds) {
        docFolderRows.push({
          document_id: doc.id,
          folder_id: folderId
        });
      }
    }

    const { error: docFoldersError } = await client
      .from("document_folders")
      .insert(docFolderRows);
    if (docFoldersError) throw docFoldersError;
  }

  const tags = dedupeTagNames(meta.tags || []);
  if (!tags.length || !docs?.length) {
    return (docs || []).map((doc) => ({
      id: doc.id,
      subjectId: doc.subject_id || subjectId,
      name: doc.name,
      sourceType: inferDocumentSourceType(doc)
    }));
  }

  const topicRows = await ensureTopicTags(client, subjectId, tags);
  const tagIds = topicRows.map((row) => row.id);

  const bridgeRows = [];
  for (const doc of docs) {
    for (const tagId of tagIds) {
      bridgeRows.push({ document_id: doc.id, topic_tag_id: tagId });
    }
  }

  const { error: tagsError } = await client.from("document_tags").insert(bridgeRows);
  if (tagsError) throw tagsError;

  return (docs || []).map((doc) => ({
    id: doc.id,
    subjectId: doc.subject_id || subjectId,
    name: doc.name,
    sourceType: inferDocumentSourceType(doc)
  }));
}

export async function uploadTxtDocuments(subjectId, files, options = {}) {
  const client = createSupabaseAdminClient();
  const hasDocumentReviewFields = await supportsDocumentReviewFields(client);
  const hasGeneratedDocumentExports = await supportsGeneratedDocumentExports(client);
  const strictQualityGate = Boolean(options?.quality?.strict);
  const minConfidence = Number(options?.quality?.minConfidence || 0.72);

  const { parsedFiles, extractionReport } = await prepareUploadedDocumentsForPersistence(files, { minConfidence });

  const flagged = extractionReport.filter((item) => item.requiresReview);
  if (strictQualityGate && flagged.length) {
    const payload = {
      summary: `${flagged.length} file(s) require manual review before indexing`,
      files: flagged
    };
    throw new Error(`QUALITY_GATE_BLOCKED:${JSON.stringify(payload)}`);
  }

  const uploaded = await persistTextDocuments(subjectId, parsedFiles, {
    ...options,
    sourceType: "uploaded",
    persistChunks: true
  });

  for (let index = 0; index < extractionReport.length; index += 1) {
    const uploadedDoc = uploaded[index];
    if (!uploadedDoc) continue;
    extractionReport[index].documentId = uploadedDoc.id;
    extractionReport[index].subjectId = uploadedDoc.subjectId || subjectId;
  }

  if (hasGeneratedDocumentExports) {
    const pdfRows = extractionReport
      .map((item) => {
        const contentBase64 = String(item.generatedPdfContentBase64 || "").trim();
        const documentId = String(item.documentId || "").trim();
        if (!contentBase64 || !documentId) return null;
        return {
          document_id: documentId,
          format: "pdf",
          mime_type: "application/pdf",
          file_name: withFileExtension(item.name || "uploaded-document", "pdf"),
          content_base64: contentBase64
        };
      })
      .filter(Boolean);

    if (pdfRows.length) {
      const { error: pdfArtifactError } = await client
        .from("generated_document_exports")
        .upsert(pdfRows, { onConflict: "document_id,format" });
      if (pdfArtifactError) throw pdfArtifactError;
    }
  }

  return {
    uploaded,
    extractionReport,
    reviewWorkflowAvailable: hasDocumentReviewFields
  };
}

export async function prepareUploadedDocumentsForPersistence(files, options = {}) {
  const minConfidence = Number(options?.minConfidence || 0.72);

  const extractionReport = [];
  const parsedFiles = await Promise.all((files || []).map(async (file) => {
    if (typeof file?.content === "string") {
      const markdown = String(file?.content || "");
      extractionReport.push({
        name: file?.name || "uploaded-file.txt",
        method: "plain-text",
        processingRunId: crypto.randomUUID(),
        processingPipelineVersion: "plain-text-direct",
        processingSummary: {
          schemaVersion: "",
          cdmVersion: "",
          blockCount: 0,
          equationCount: 0,
          headingCount: 0
        },
        confidence: 1,
        issues: [],
        riskMarkers: [],
        canonicalVerification: null,
        canonicalDocument: null,
        markdown,
        sourcePreview: String(file?.content || ""),
        sourceMimeType: String(file?.mimeType || "text/plain").trim().toLowerCase(),
        sourceContentBase64: String(file?.contentBase64 || ""),
        sourceRenderHtml: "",
        generatedPdfContentBase64: "",
        extractedText: String(file?.content || ""),
        requiresReview: false
      });
      return {
        ...file,
        extraction: {
          method: "plain-text",
          confidence: 1,
          issues: [],
          riskMarkers: [],
          markdown,
          sourcePreview: String(file?.content || ""),
          sourceMimeType: String(file?.mimeType || "text/plain").trim().toLowerCase(),
          sourceContentBase64: String(file?.contentBase64 || ""),
          sourceRenderHtml: "",
          generatedPdfContentBase64: "",
          canonicalDocument: null,
          requiresReview: false
        }
      };
    }

    const extracted = await processUploadedDocument(file, { minConfidence });
    extractionReport.push({
      name: file?.name || "uploaded-file",
      method: extracted.method,
        processingRunId: extracted.processingRunId,
        processingPipelineVersion: extracted.processingPipelineVersion,
        processingSummary: extracted.processingSummary || null,
      confidence: extracted.confidence,
      issues: extracted.issues,
      riskMarkers: extracted.riskMarkers,
      canonicalVerification: extracted.canonicalVerification || null,
      canonicalDocument: extracted.canonicalDocument || null,
      sourcePreview: extracted.sourcePreview,
      markdown: extracted.markdown,
      sourceMimeType: extracted.sourceMimeType,
      sourceContentBase64: extracted.sourceContentBase64,
      sourceRenderHtml: extracted.sourceRenderHtml,
      generatedPdfContentBase64: extracted.generatedPdfContentBase64,
      extractedText: extracted.text,
      requiresReview: extracted.requiresReview
    });

    const fallbackText = extracted.text || `No extractable text found in ${file?.name || "uploaded file"}.`;
    const canonicalMarkdown = String(extracted.markdown || "").trim() || fallbackText;

    return {
      name: file?.name || "uploaded-file.txt",
      content: canonicalMarkdown,
      preview: extracted.sourcePreview || fallbackText,
      sizeBytes: Number(file?.sizeBytes || 0),
      extraction: {
        method: extracted.method,
        confidence: extracted.confidence,
        issues: extracted.issues,
        riskMarkers: extracted.riskMarkers,
        processingRunId: extracted.processingRunId,
        processingPipelineVersion: extracted.processingPipelineVersion,
        processingSummary: extracted.processingSummary || null,
        markdown: canonicalMarkdown,
        sourcePreview: extracted.sourcePreview,
        sourceMimeType: extracted.sourceMimeType,
        sourceContentBase64: extracted.sourceContentBase64,
        sourceRenderHtml: extracted.sourceRenderHtml,
        generatedPdfContentBase64: extracted.generatedPdfContentBase64,
        canonicalDocument: extracted.canonicalDocument || null,
        requiresReview: extracted.requiresReview
      }
    };
  }));

  return {
    parsedFiles,
    extractionReport,
    reviewWorkflowAvailable: true
  };
}

export async function reviewDocumentExtraction(subjectId, documentId, options = {}) {
  const client = createSupabaseAdminClient();
  const hasDocumentReviewFields = await supportsDocumentReviewFields(client);
  const hasDocumentReviewEnhancementFields = await supportsDocumentReviewEnhancementFields(client);
  const hasDocumentSourceVisualFields = await supportsDocumentSourceVisualFields(client);

  const hasDocumentChunks = await supportsDocumentChunks(client);
  const hasDocumentChunkEmbeddings = hasDocumentChunks ? await supportsDocumentChunkEmbeddings(client) : false;

  const decisionRaw = String(options?.decision || "approved").trim().toLowerCase();
  let decision = decisionRaw === "rejected" ? "rejected" : (decisionRaw === "needs_review" ? "needs_review" : "approved");
  const correctedContent = typeof options?.correctedContent === "string" ? options.correctedContent.trim() : "";
  const correctedHtml = typeof options?.correctedHtml === "string" ? sanitizeEditableHtml(options.correctedHtml).trim() : "";
  const correctedHtmlText = correctedHtml ? htmlToPlainText(correctedHtml) : "";
  const effectiveCorrectedContent = correctedContent || correctedHtmlText;
  const addressedRiskIds = Array.isArray(options?.addressedRiskIds)
    ? options.addressedRiskIds.map((item) => String(item || "").trim()).filter(Boolean)
    : null;
  const autoApproveWhenAllAddressed = Boolean(options?.autoApproveWhenAllAddressed);

  const { data: document, error: findError } = await client
    .from("documents")
    .select(hasDocumentReviewEnhancementFields
      ? "id, subject_id, name, content, source_type, extraction_issues, extraction_risk_markers"
      : "id, subject_id, name, content, source_type, extraction_issues")
    .eq("id", documentId)
    .eq("subject_id", subjectId)
    .maybeSingle();

  if (findError) throw findError;
  if (!document) {
    throw new Error("Document not found for review update.");
  }

  if (inferDocumentSourceType(document) === "generated") {
    throw new Error("Generated documents do not require extraction review.");
  }

  const nextContent = effectiveCorrectedContent || String(document.content || "");
  if (decision === "approved" && !nextContent.trim()) {
    throw new Error("Cannot approve a document with empty extracted content. Provide corrected content first.");
  }

  const nowIso = new Date().toISOString();
  const nextIssues = Array.isArray(document.extraction_issues) ? [...document.extraction_issues] : [];
  const existingRiskMarkers = Array.isArray(document.extraction_risk_markers) ? [...document.extraction_risk_markers] : [];
  const nextRiskMarkers = addressedRiskIds
    ? existingRiskMarkers.map((marker, index) => {
      const fallbackId = `R${index + 1}`;
      const markerId = String(marker?.id || fallbackId);
      return {
        ...marker,
        id: markerId,
        addressed: addressedRiskIds.includes(markerId)
      };
    })
    : existingRiskMarkers;

  if (autoApproveWhenAllAddressed && nextRiskMarkers.length) {
    const allAddressed = nextRiskMarkers.every((marker) => Boolean(marker?.addressed));
    if (allAddressed) {
      decision = "approved";
    } else if (decision === "approved") {
      decision = "needs_review";
    }
  }
  if (effectiveCorrectedContent || correctedHtml) {
    nextIssues.push("manually-corrected-content");
  }

  const updatePayload = hasDocumentReviewFields
    ? {
      review_status: decision,
      extraction_requires_review: decision !== "approved",
      extraction_issues: Array.from(new Set(nextIssues)),
      reviewed_at: decision === "approved" ? nowIso : null,
      updated_at: nowIso
    }
    : {
      updated_at: nowIso
    };

  if (effectiveCorrectedContent) {
    updatePayload.content = nextContent;
    updatePayload.preview = nextContent.slice(0, 180) || "(empty file)";
    updatePayload.size_bytes = Buffer.byteLength(nextContent, "utf8");
    updatePayload.extraction_confidence = 1;
  }

  if (hasDocumentSourceVisualFields && correctedHtml) {
    updatePayload.source_render_html = correctedHtml;
  }

  if (hasDocumentReviewEnhancementFields && hasDocumentReviewFields) {
    updatePayload.extraction_risk_markers = nextRiskMarkers;
  }

  const { error: updateError } = await client
    .from("documents")
    .update(updatePayload)
    .eq("id", documentId)
    .eq("subject_id", subjectId);

  if (updateError) throw updateError;

  if (decision === "approved" && hasDocumentChunks) {
    const { error: deleteChunksError } = await client
      .from("document_chunks")
      .delete()
      .eq("document_id", documentId);
    if (deleteChunksError) throw deleteChunksError;

    const chunks = chunkDocument({
      id: documentId,
      subjectId,
      name: document.name,
      content: nextContent,
      folderIds: [],
      tags: []
    }, {
      chunkWords: DEFAULT_CHUNK_WORDS,
      overlapWords: DEFAULT_OVERLAP_WORDS
    });

    if (chunks.length) {
      const chunkRows = chunks.map((chunk) => ({
        document_id: documentId,
        subject_id: subjectId,
        chunk_index: chunk.chunkIndex,
        chunk_words: DEFAULT_CHUNK_WORDS,
        overlap_words: DEFAULT_OVERLAP_WORDS,
        start_word: chunk.startWord,
        end_word: chunk.endWord,
        word_count: chunk.wordCount,
        semantic_score: chunk.semanticScore,
        keywords: appendEquationKeywordTags(chunk.keywords, chunk.equationIds),
        content: chunk.content
      }));

      if (hasDocumentChunkEmbeddings && isEmbeddingProviderConfigured()) {
        const embeddings = await embedTexts(chunkRows.map((row) => row.content));
        for (let index = 0; index < chunkRows.length; index += 1) {
          const embedding = embeddings[index];
          if (embedding) {
            chunkRows[index].embedding = toVectorLiteral(embedding);
          }
        }
      }

      const { error: insertChunksError } = await client
        .from("document_chunks")
        .insert(chunkRows);
      if (insertChunksError) throw insertChunksError;
    }
  }

  return {
    documentId,
    reviewStatus: hasDocumentReviewFields ? decision : "approved",
    corrected: Boolean(effectiveCorrectedContent || correctedHtml),
    extractionRiskMarkers: nextRiskMarkers
  };
}

export async function reprocessStoredDocument(subjectId, documentId, options = {}) {
  const client = createSupabaseAdminClient();
  const hasDocumentReviewFields = await supportsDocumentReviewFields(client);
  const hasDocumentReviewEnhancementFields = await supportsDocumentReviewEnhancementFields(client);
  const hasDocumentSourceVisualFields = await supportsDocumentSourceVisualFields(client);
  const hasDocumentChunks = await supportsDocumentChunks(client);
  const hasDocumentChunkEmbeddings = hasDocumentChunks ? await supportsDocumentChunkEmbeddings(client) : false;
  const hasDocumentChunkMarkdownFields = hasDocumentChunks ? await supportsDocumentChunkMarkdownFields(client) : false;
  const hasGeneratedDocumentExports = await supportsGeneratedDocumentExports(client);
  const minConfidence = Number(options?.minConfidence || 0.72);

  const { data: document, error: findError } = await client
    .from("documents")
    .select("id, subject_id, name, content, source_type, source_mime_type, source_content_base64")
    .eq("id", documentId)
    .eq("subject_id", subjectId)
    .maybeSingle();

  if (findError) throw findError;
  if (!document) throw new Error("Document not found for reprocessing.");
  if (inferDocumentSourceType(document) === "generated") {
    throw new Error("Generated documents do not support source reprocessing.");
  }

  const contentBase64 = String(document.source_content_base64 || "").trim();
  if (!contentBase64) {
    throw new Error("Stored source bytes are unavailable for this document.");
  }

  const file = {
    name: String(document.name || "uploaded-file"),
    mimeType: String(document.source_mime_type || "application/octet-stream").trim().toLowerCase(),
    contentBase64
  };

  const extracted = await processUploadedDocument(file, { minConfidence });
  const nextContent = String(extracted.markdown || extracted.text || document.content || "").trim();
  const nowIso = new Date().toISOString();

  const updatePayload = {
    content: nextContent,
    preview: nextContent.slice(0, 180) || "(empty file)",
    size_bytes: Buffer.byteLength(nextContent, "utf8"),
    updated_at: nowIso
  };

  if (hasDocumentSourceVisualFields) {
    updatePayload.source_mime_type = String(extracted.sourceMimeType || file.mimeType || "").trim().toLowerCase() || null;
    updatePayload.source_content_base64 = contentBase64;
    updatePayload.source_render_html = String(extracted.sourceRenderHtml || "") || null;
  }

  if (hasDocumentReviewFields) {
    updatePayload.review_status = extracted.requiresReview ? "needs_review" : "approved";
    updatePayload.extraction_confidence = Number.isFinite(Number(extracted.confidence)) ? Number(extracted.confidence) : 1;
    updatePayload.extraction_method = [String(extracted.method || "").trim(), String(extracted.processingPipelineVersion || "").trim()].filter(Boolean).join("@");
    updatePayload.extraction_issues = Array.isArray(extracted.issues) ? extracted.issues : [];
    updatePayload.extraction_requires_review = Boolean(extracted.requiresReview);
    updatePayload.reviewed_at = extracted.requiresReview ? null : nowIso;
    if (hasDocumentReviewEnhancementFields) {
      updatePayload.source_preview = String(extracted.sourcePreview || "") || null;
      updatePayload.extraction_risk_markers = Array.isArray(extracted.riskMarkers) ? extracted.riskMarkers : [];
    }
  }

  const { error: updateError } = await client
    .from("documents")
    .update(updatePayload)
    .eq("id", documentId)
    .eq("subject_id", subjectId);
  if (updateError) throw updateError;

  if (hasDocumentChunks) {
    const { error: deleteChunksError } = await client
      .from("document_chunks")
      .delete()
      .eq("document_id", documentId);
    if (deleteChunksError) throw deleteChunksError;

    const chunks = chunkDocument({
      id: documentId,
      subjectId,
      name: document.name,
      content: nextContent,
      canonicalDocument: extracted.canonicalDocument || null,
      folderIds: [],
      tags: []
    }, {
      chunkWords: DEFAULT_CHUNK_WORDS,
      overlapWords: DEFAULT_OVERLAP_WORDS
    });

    if (chunks.length) {
      const chunkRows = chunks.map((chunk) => ({
        document_id: documentId,
        subject_id: subjectId,
        chunk_index: chunk.chunkIndex,
        chunk_words: DEFAULT_CHUNK_WORDS,
        overlap_words: DEFAULT_OVERLAP_WORDS,
        start_word: chunk.startWord,
        end_word: chunk.endWord,
        word_count: chunk.wordCount,
        semantic_score: chunk.semanticScore,
        keywords: appendEquationKeywordTags(chunk.keywords, chunk.equationIds),
        content: chunk.contentMarkdown || chunk.content,
        ...(hasDocumentChunkMarkdownFields
          ? {
            token_count: Number(chunk.tokenCount || 0),
            section: String(chunk.section || ""),
            heading_path: Array.isArray(chunk.headingPath) ? chunk.headingPath : [],
            page_number: Number.isFinite(Number(chunk.page)) ? Number(chunk.page) : null,
            content_markdown: chunk.contentMarkdown || chunk.content || ""
          }
          : {})
      }));

      if (hasDocumentChunkEmbeddings && isEmbeddingProviderConfigured()) {
        const embeddings = await embedTexts(chunkRows.map((row) => row.content));
        for (let index = 0; index < chunkRows.length; index += 1) {
          const embedding = embeddings[index];
          if (embedding) {
            chunkRows[index].embedding = toVectorLiteral(embedding);
          }
        }
      }

      const { error: insertChunksError } = await client
        .from("document_chunks")
        .insert(chunkRows);
      if (insertChunksError) throw insertChunksError;
    }
  }

  if (hasGeneratedDocumentExports) {
    const pdfContentBase64 = String(extracted.generatedPdfContentBase64 || "").trim();
    if (pdfContentBase64) {
      const { error: pdfArtifactError } = await client
        .from("generated_document_exports")
        .upsert([{
          document_id: documentId,
          format: "pdf",
          mime_type: "application/pdf",
          file_name: withFileExtension(document.name || "uploaded-document", "pdf"),
          content_base64: pdfContentBase64
        }], { onConflict: "document_id,format" });
      if (pdfArtifactError) throw pdfArtifactError;
    }
  }

  return {
    documentId,
    processingRunId: extracted.processingRunId,
    processingPipelineVersion: extracted.processingPipelineVersion,
    document: {
      id: documentId,
      name: document.name,
      content: nextContent,
      sourceRenderHtml: String(extracted.sourceRenderHtml || ""),
      sourcePreview: String(extracted.sourcePreview || ""),
      sourceMimeType: String(extracted.sourceMimeType || file.mimeType || ""),
      sourceContentBase64: contentBase64,
      extractionMethod: updatePayload.extraction_method || String(extracted.method || ""),
      extractionConfidence: Number(extracted.confidence || 0),
      extractionIssues: Array.isArray(extracted.issues) ? extracted.issues : [],
      extractionRiskMarkers: Array.isArray(extracted.riskMarkers) ? extracted.riskMarkers : [],
      reviewStatus: updatePayload.review_status || "approved",
      requiresReview: Boolean(extracted.requiresReview)
    }
  };
}

export async function saveGeneratedQuizDocument(subjectId, file, options = {}) {
  const saved = await persistTextDocuments(subjectId, [file], {
    ...options,
    sourceType: "generated",
    persistChunks: false
  });

  return saved[0] || null;
}

export async function saveGeneratedQuizBundle(subjectId, file, downloads, options = {}) {
  const plainText = String(file.content || "");
  const bundledFile = {
    ...file,
    content: buildGeneratedDocumentBundle({ plainText, downloads }),
    preview: plainText,
    sizeBytes: Buffer.byteLength(plainText, "utf8")
  };

  const client = createSupabaseAdminClient();
  const hasGeneratedDocumentExports = await supportsGeneratedDocumentExports(client);
  const saved = await saveGeneratedQuizDocument(subjectId, bundledFile, options);

  if (!saved) return null;
  if (!hasGeneratedDocumentExports) {
    return {
      ...saved,
      availableFormats: Array.from(new Set(Object.keys(downloads || {}).concat("txt")))
    };
  }

  const rows = Object.entries(downloads || {}).map(([format, contentBase64]) => {
    const spec = getGeneratedExportSpec(format);
    return {
      document_id: saved.id,
      format: spec.format,
      mime_type: spec.mimeType,
      file_name: withFileExtension(file.name, spec.extension),
      content_base64: String(contentBase64 || "")
    };
  }).filter((row) => row.content_base64);

  if (rows.length) {
    const { error } = await client
      .from("generated_document_exports")
      .insert(rows);
    if (error) throw error;
  }

  return {
    ...saved,
    availableFormats: Array.from(new Set(rows.map((row) => row.format).concat("txt")))
  };
}

export async function getGeneratedDocumentDownload(documentId, format) {
  const client = createSupabaseAdminClient();
  const hasGeneratedDocumentExports = await supportsGeneratedDocumentExports(client);
  const requested = getGeneratedExportSpec(format);

  const { data: document, error: documentError } = await client
    .from("documents")
    .select("id, name, content")
    .eq("id", documentId)
    .maybeSingle();
  if (documentError) throw documentError;
  if (!document) {
    throw new Error("Document not found.");
  }

  const bundle = parseGeneratedDocumentBundle(document.content);

  if (bundle) {
    if (requested.format === "txt") {
      return {
        format: requested.format,
        fileName: withFileExtension(document.name, requested.extension),
        mimeType: requested.mimeType,
        contentBase64: Buffer.from(bundle.plainText, "utf8").toString("base64")
      };
    }

    const bundledExport = bundle.downloads?.[requested.format];
    if (bundledExport?.contentBase64) {
      return {
        format: requested.format,
        fileName: withFileExtension(document.name, bundledExport.extension || requested.extension),
        mimeType: bundledExport.mimeType || requested.mimeType,
        contentBase64: bundledExport.contentBase64
      };
    }
  }

  if (requested.format === "txt") {
    const content = String(document.content || "");
    return {
      format: requested.format,
      fileName: withFileExtension(document.name, requested.extension),
      mimeType: requested.mimeType,
      contentBase64: Buffer.from(content, "utf8").toString("base64")
    };
  }

  if (!hasGeneratedDocumentExports) {
    throw new Error("Saved generated downloads require migration 202608040009_add_generated_document_exports.sql to be applied.");
  }

  const { data: exportRow, error: exportError } = await client
    .from("generated_document_exports")
    .select("format, mime_type, file_name, content_base64")
    .eq("document_id", documentId)
    .eq("format", requested.format)
    .maybeSingle();
  if (exportError) throw exportError;
  if (!exportRow?.content_base64) {
    throw new Error(`No saved ${requested.format.toUpperCase()} download is available for this document.`);
  }

  return {
    format: exportRow.format,
    fileName: exportRow.file_name || withFileExtension(document.name, requested.extension),
    mimeType: exportRow.mime_type || requested.mimeType,
    contentBase64: exportRow.content_base64
  };
}

export async function getUploadedDocumentDownload(documentId, format = "") {
  const client = createSupabaseAdminClient();
  const hasDocumentBlockFields = await supportsDocumentBlockFields(client);
  const hasTemplateLibrary = await supportsDocumentBlockTemplateLibrary(client);
  const documentSelect = hasDocumentBlockFields
    ? "id, name, content, source_mime_type, source_content_base64, source_render_html, content_template_id, content_blocks_json, content_blocks_schema_version"
    : "id, name, content, source_mime_type, source_content_base64, source_render_html";
  const { data: document, error } = await client
    .from("documents")
    .select(documentSelect)
    .eq("id", documentId)
    .maybeSingle();

  if (error) throw error;
  if (!document) {
    throw new Error("Document not found.");
  }

  const requestedFormat = String(format || "").trim().toLowerCase();
  const sourceMimeType = String(document.source_mime_type || "").trim().toLowerCase();
  const sourceContentBase64 = String(document.source_content_base64 || "").trim();
  const sourceRenderHtml = String(document.source_render_html || "").trim();
  const contentTemplateId = String(document.content_template_id || "").trim();
  const contentBlocksJson = normalizeDocumentBlocksJson(document.content_blocks_json);
  const contentBlocksSchemaVersion = String(document.content_blocks_schema_version || "").trim() || DOCUMENT_BLOCK_SCHEMA_VERSION;
  const bundle = parseGeneratedDocumentBundle(document.content);
  const content = bundle?.plainText || String(document.content || "");
  const mediaMap = await extractDocxMediaDataUrls(sourceContentBase64);
  let renderedFromBlocksHtml = "";

  if (hasDocumentBlockFields && hasTemplateLibrary && contentTemplateId && Array.isArray(contentBlocksJson) && contentBlocksJson.length) {
    const { data: templateRow, error: templateError } = await client
      .from("document_block_templates")
      .select("id, name, description, container_class, block_classes, css")
      .eq("id", contentTemplateId)
      .maybeSingle();
    if (templateError) throw templateError;
    if (templateRow) {
      const { blockClasses, blockHtmlTemplates, blockFormats, folderId } = splitTemplateBlockClassesMeta(templateRow.block_classes || {});
      renderedFromBlocksHtml = renderDocumentBlocksHtml(contentBlocksJson, {
        id: templateRow.id,
        name: templateRow.name,
        description: templateRow.description || "",
        containerClass: templateRow.container_class || "",
        folderId,
        blockClasses,
        blockHtmlTemplates,
        blockFormats,
        css: templateRow.css || ""
      });
    }
  }

  if (requestedFormat === "blocks-json" || requestedFormat === "block-json" || requestedFormat === "json-tree") {
    const selectedTemplate = contentTemplateId && hasTemplateLibrary
      ? await client
        .from("document_block_templates")
        .select("id, name, description, container_class, block_classes, css")
        .eq("id", contentTemplateId)
        .maybeSingle()
      : { data: null, error: null };
    if (selectedTemplate.error) throw selectedTemplate.error;

    const payload = {
      schemaVersion: contentBlocksSchemaVersion,
      document: {
        id: document.id,
        name: document.name,
        templateId: contentTemplateId || null,
        blocks: contentBlocksJson,
        sourceRenderHtml,
        plainText: content
      },
      template: selectedTemplate.data ? {
        ...(function mapTemplateForPayload() {
          const { blockClasses, blockHtmlTemplates, blockFormats, folderId } = splitTemplateBlockClassesMeta(selectedTemplate.data.block_classes || {});
          return {
            id: selectedTemplate.data.id,
            name: selectedTemplate.data.name,
            description: selectedTemplate.data.description || "",
            containerClass: selectedTemplate.data.container_class || "",
            folderId,
            blockClasses,
            blockHtmlTemplates,
            blockFormats,
            css: selectedTemplate.data.css || ""
          };
        })()
      } : null
    };

    return {
      format: "blocks-json",
      fileName: withFileExtension(document.name || "document", "blocks.json"),
      mimeType: "application/json",
      contentBase64: Buffer.from(JSON.stringify(payload, null, 2), "utf8").toString("base64")
    };
  }

  if (requestedFormat === "editable-html") {
    const baseHtml = renderedFromBlocksHtml || sourceRenderHtml || markdownToBasicHtml(content);
    const html = embedMediaDataUrlsInHtml(baseHtml, mediaMap);
    return {
      format: "editable-html",
      fileName: withFileExtension(document.name || "document", "html"),
      mimeType: "text/html",
      contentBase64: Buffer.from(html, "utf8").toString("base64")
    };
  }

  if (requestedFormat === "html") {
    const baseHtml = renderedFromBlocksHtml || sourceRenderHtml || markdownToBasicHtml(content);
    const htmlWithMedia = embedMediaDataUrlsInHtml(baseHtml, mediaMap);
    const renderedMathHtml = renderLatexWithKatex(htmlWithMedia);
    const html = wrapDownloadedHtmlDocument(renderedMathHtml);
    return {
      format: "html",
      fileName: withFileExtension(document.name || "document", "html"),
      mimeType: "text/html",
      contentBase64: Buffer.from(html, "utf8").toString("base64")
    };
  }

  if (requestedFormat === "markdown" || requestedFormat === "md") {
    const canonicalHtml = renderedFromBlocksHtml || sourceRenderHtml;
    const markdownSource = canonicalHtml
      ? htmlToMarkdownDocument(canonicalHtml, content)
      : content;
    const markdown = embedMediaDataUrlsInMarkdown(markdownSource, mediaMap);
    return {
      format: "md",
      fileName: withFileExtension(document.name || "document", "md"),
      mimeType: "text/markdown",
      contentBase64: Buffer.from(markdown, "utf8").toString("base64")
    };
  }

  if ((requestedFormat === "original" || !requestedFormat) && sourceContentBase64) {
    const extension = getExtensionFromName(document.name, "bin");
    return {
      format: extension,
      fileName: document.name || `document.${extension}`,
      mimeType: sourceMimeType || getMimeTypeForExtension(extension),
      contentBase64: sourceContentBase64
    };
  }

  const extension = getExtensionFromName(document.name, "txt");

  return {
    format: extension,
    fileName: document.name || `document.${extension}`,
    mimeType: getMimeTypeForExtension(extension),
    contentBase64: Buffer.from(content, "utf8").toString("base64")
  };
}

export async function listDocumentBlockTemplates(ownerUserId = getDemoOwnerUserId()) {
  const client = createSupabaseAdminClient();
  const supported = await supportsDocumentBlockTemplateLibrary(client);
  if (!supported) {
    throw new Error("Document block templates require migration 202608160001_add_document_block_editor_templates.sql to be applied.");
  }

  const { data, error } = await client
    .from("document_block_templates")
    .select("id, owner_user_id, name, description, container_class, block_classes, css, source_document_id, created_at, updated_at")
    .eq("owner_user_id", ownerUserId)
    .order("updated_at", { ascending: false });

  if (error) throw error;

  return (data || []).map((row) => ({
    ...(function mapTemplate() {
      const { blockClasses, blockHtmlTemplates, blockFormats, folderId } = splitTemplateBlockClassesMeta(row.block_classes);
      return {
        id: row.id,
        ownerUserId: row.owner_user_id,
        name: row.name,
        description: row.description || "",
        containerClass: row.container_class || "",
        folderId,
        blockClasses,
        blockHtmlTemplates,
        blockFormats,
        css: row.css || "",
        sourceDocumentId: row.source_document_id || "",
        createdAt: row.created_at || "",
        updatedAt: row.updated_at || ""
      };
    })()
  }));
}

export async function saveDocumentBlockTemplate(ownerUserId, payload = {}) {
  const client = createSupabaseAdminClient();
  const supported = await supportsDocumentBlockTemplateLibrary(client);
  if (!supported) {
    throw new Error("Document block templates require migration 202608160001_add_document_block_editor_templates.sql to be applied.");
  }

  const templateId = String(payload.id || "").trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(templateId);
  const nowIso = new Date().toISOString();
  const templateName = String(payload.name || "").trim() || "Untitled Template";
  const row = {
    owner_user_id: ownerUserId,
    name: templateName,
    description: String(payload.description || "").trim(),
    container_class: String(payload.containerClass || "").trim(),
    block_classes: composeTemplateBlockClassesMeta(
      payload.blockClasses && typeof payload.blockClasses === "object" ? payload.blockClasses : {},
      payload.blockHtmlTemplates && typeof payload.blockHtmlTemplates === "object" ? payload.blockHtmlTemplates : {},
      payload.blockFormats && typeof payload.blockFormats === "object" ? payload.blockFormats : {},
      String(payload.folderId || "tpl-folder-root")
    ),
    css: String(payload.css || ""),
    source_document_id: String(payload.sourceDocumentId || "").trim() || null,
    updated_at: nowIso
  };

  if (isUuid) {
    const { data: existingByName, error: findByNameError } = await client
      .from("document_block_templates")
      .select("id")
      .eq("owner_user_id", ownerUserId)
      .eq("name", templateName)
      .maybeSingle();
    if (findByNameError) throw findByNameError;

    const targetId = existingByName?.id && String(existingByName.id) !== templateId
      ? String(existingByName.id)
      : templateId;

    const { error: updateError } = await client
      .from("document_block_templates")
      .update(row)
      .eq("id", targetId)
      .eq("owner_user_id", ownerUserId);
    if (updateError) {
      if (String(updateError.code || "") === "23505") {
        const { error: upsertFallbackError } = await client
          .from("document_block_templates")
          .upsert({ ...row, created_at: nowIso }, {
            onConflict: "owner_user_id,name",
            ignoreDuplicates: false
          });
        if (upsertFallbackError) throw upsertFallbackError;
      } else {
        throw updateError;
      }
    }
  } else {
    row.created_at = nowIso;
    const { error: upsertError } = await client
      .from("document_block_templates")
      .upsert(row, {
        onConflict: "owner_user_id,name",
        ignoreDuplicates: false
      });
    if (upsertError) throw upsertError;
  }

  const templates = await listDocumentBlockTemplates(ownerUserId);
  const savedTemplate = templates.find((item) => item.name === templateName) || templates[0] || null;

  const resolvedTemplateId = String(savedTemplate?.id || templateId || "").trim();
  if (resolvedTemplateId) {
    await refreshDocumentsUsingTemplate(client, resolvedTemplateId, savedTemplate);
  }

  return savedTemplate;
}

async function refreshDocumentsUsingTemplate(client, templateId, template = null) {
  const resolvedTemplateId = String(templateId || "").trim();
  if (!resolvedTemplateId) return;

  const hasDocumentBlockColumns = await supportsDocumentBlockFields(client);
  const hasSourceVisualField = await supportsDocumentSourceVisualFields(client);
  if (!hasDocumentBlockColumns || !hasSourceVisualField) return;

  const activeTemplate = template || (await (async () => {
    const { data } = await client
      .from("document_block_templates")
      .select("id, name, description, container_class, block_classes, css, source_document_id, created_at, updated_at")
      .eq("id", resolvedTemplateId)
      .maybeSingle();
    if (!data) return null;
    const { blockClasses, blockHtmlTemplates, blockFormats, folderId } = splitTemplateBlockClassesMeta(data.block_classes);
    return {
      id: data.id,
      name: data.name,
      description: data.description || "",
      containerClass: data.container_class || "",
      folderId,
      blockClasses,
      blockHtmlTemplates,
      blockFormats,
      css: data.css || ""
    };
  })());

  if (!activeTemplate) return;

  const { data: docs, error: docsError } = await client
    .from("documents")
    .select("id, content_blocks_json")
    .eq("content_template_id", resolvedTemplateId);
  if (docsError) throw docsError;

  for (const doc of docs || []) {
    const blocks = normalizeDocumentBlocksJson(doc.content_blocks_json);
    if (!Array.isArray(blocks) || !blocks.length) continue;
    const html = renderDocumentBlocksHtml(blocks, activeTemplate);
    const plain = htmlToPlainText(html);
    const { error: updateError } = await client
      .from("documents")
      .update({
        source_render_html: html,
        content: plain,
        preview: plain.slice(0, 180) || "(empty file)",
        size_bytes: Buffer.byteLength(plain, "utf8"),
        updated_at: new Date().toISOString()
      })
      .eq("id", doc.id);
    if (updateError) throw updateError;
  }
}

export async function deleteDocumentBlockTemplate(ownerUserId, templateId) {
  const client = createSupabaseAdminClient();
  const supported = await supportsDocumentBlockTemplateLibrary(client);
  if (!supported) {
    throw new Error("Document block templates require migration 202608160001_add_document_block_editor_templates.sql to be applied.");
  }

  const id = String(templateId || "").trim();
  if (!id) {
    throw new Error("Template id is required.");
  }

  const { error } = await client
    .from("document_block_templates")
    .delete()
    .eq("id", id)
    .eq("owner_user_id", ownerUserId);
  if (error) throw error;

  return { deleted: true, id };
}

export async function renameDocument(documentId, nextName) {
  const client = createSupabaseAdminClient();
  const { error } = await client
    .from("documents")
    .update({ name: normalizeDocumentName(nextName), updated_at: new Date().toISOString() })
    .eq("id", documentId);
  if (error) throw error;
}

export async function removeDocument(documentId) {
  const client = createSupabaseAdminClient();
  const { error } = await client.from("documents").delete().eq("id", documentId);
  if (error) throw error;
}

export async function updateDocumentMeta(subjectId, documentId, options = {}) {
  const client = createSupabaseAdminClient();
  const hasDocumentFolders = await supportsDocumentFolders(client);
  const meta = normalizeDocumentMeta(options);
  const folderIds = normalizeFolderIds(meta.folderIds || []);
  const tags = dedupeTagNames(meta.tags || []);

  if (folderIds.length > 1 && !hasDocumentFolders) {
    throw new Error("Multi-folder assignment requires migration 202608040003_add_document_folder_map.sql to be applied.");
  }

  const primaryFolderId = folderIds[0] || null;
  const { error: docUpdateError } = await client
    .from("documents")
    .update({ folder_id: primaryFolderId, updated_at: new Date().toISOString() })
    .eq("id", documentId)
    .eq("subject_id", subjectId);
  if (docUpdateError) throw docUpdateError;

  if (hasDocumentFolders) {
    const { error: clearFolderLinksError } = await client
      .from("document_folders")
      .delete()
      .eq("document_id", documentId);
    if (clearFolderLinksError) throw clearFolderLinksError;

    if (folderIds.length) {
      const { error: insertFolderLinksError } = await client
        .from("document_folders")
        .insert(folderIds.map((folderId) => ({ document_id: documentId, folder_id: folderId })));
      if (insertFolderLinksError) throw insertFolderLinksError;
    }
  }

  const { error: clearTagsError } = await client
    .from("document_tags")
    .delete()
    .eq("document_id", documentId);
  if (clearTagsError) throw clearTagsError;

  if (!tags.length) return;
  const topicRows = await ensureTopicTags(client, subjectId, tags);
  const bridgeRows = topicRows.map((row) => ({ document_id: documentId, topic_tag_id: row.id }));

  const { error: insertTagsError } = await client
    .from("document_tags")
    .insert(bridgeRows);
  if (insertTagsError) throw insertTagsError;
}

export async function updateDocumentContent(subjectId, documentId, options = {}) {
  const client = createSupabaseAdminClient();
  const hasDocumentSourceVisualFields = await supportsDocumentSourceVisualFields(client);
  const hasDocumentBlockFields = await supportsDocumentBlockFields(client);
  const hasTemplateLibrary = await supportsDocumentBlockTemplateLibrary(client);
  const hasDocumentChunks = await supportsDocumentChunks(client);
  const hasDocumentChunkEmbeddings = hasDocumentChunks ? await supportsDocumentChunkEmbeddings(client) : false;

  const correctedHtml = typeof options?.correctedHtml === "string"
    ? sanitizeEditableHtml(options.correctedHtml).trim()
    : "";
  const correctedContentOption = typeof options?.correctedContent === "string" ? options.correctedContent.trim() : "";
  const correctedContent = correctedContentOption || (correctedHtml ? htmlToPlainText(correctedHtml) : "");
  const hasTemplateInPayload = Object.prototype.hasOwnProperty.call(options || {}, "contentTemplateId");
  const hasBlocksInPayload = Object.prototype.hasOwnProperty.call(options || {}, "contentBlocksJson");
  const contentTemplateId = String(options?.contentTemplateId || "").trim();
  const contentBlocksJson = normalizeDocumentBlocksJson(options?.contentBlocksJson);
  const contentBlocksSchemaVersion = String(options?.contentBlocksSchemaVersion || DOCUMENT_BLOCK_SCHEMA_VERSION).trim() || DOCUMENT_BLOCK_SCHEMA_VERSION;

  if (!correctedContent && !correctedHtml) {
    throw new Error("No content update provided.");
  }

  const { data: document, error: findError } = await client
    .from("documents")
    .select("id, subject_id, name")
    .eq("id", documentId)
    .eq("subject_id", subjectId)
    .maybeSingle();

  if (findError) throw findError;
  if (!document) {
    throw new Error("Document not found.");
  }

  const nowIso = new Date().toISOString();
  const updatePayload = {
    content: correctedContent,
    preview: correctedContent.slice(0, 180) || "(empty file)",
    size_bytes: Buffer.byteLength(correctedContent, "utf8"),
    updated_at: nowIso
  };

  if (hasDocumentSourceVisualFields && correctedHtml) {
    updatePayload.source_render_html = correctedHtml;
  }

  if (hasDocumentBlockFields) {
    if (hasTemplateInPayload) {
      if (contentTemplateId && hasTemplateLibrary) {
        const { data: template, error: templateError } = await client
          .from("document_block_templates")
          .select("id")
          .eq("id", contentTemplateId)
          .maybeSingle();
        if (templateError) throw templateError;
        updatePayload.content_template_id = template?.id || null;
      } else if (contentTemplateId) {
        throw new Error("Document block templates require migration 202608160001_add_document_block_editor_templates.sql to be applied.");
      } else {
        updatePayload.content_template_id = null;
      }
    }

    if (hasBlocksInPayload) {
      updatePayload.content_blocks_json = contentBlocksJson;
      updatePayload.content_blocks_schema_version = contentBlocksJson ? contentBlocksSchemaVersion : null;
    }
  }

  const { error: updateError } = await client
    .from("documents")
    .update(updatePayload)
    .eq("id", documentId)
    .eq("subject_id", subjectId);

  if (updateError) throw updateError;

  if (hasDocumentChunks) {
    const { error: deleteChunksError } = await client
      .from("document_chunks")
      .delete()
      .eq("document_id", documentId);
    if (deleteChunksError) throw deleteChunksError;

    const chunks = chunkDocument({
      id: documentId,
      subjectId,
      name: document.name,
      content: correctedContent,
      folderIds: [],
      tags: []
    }, {
      chunkWords: DEFAULT_CHUNK_WORDS,
      overlapWords: DEFAULT_OVERLAP_WORDS
    });

    if (chunks.length) {
      const chunkRows = chunks.map((chunk) => ({
        document_id: documentId,
        subject_id: subjectId,
        chunk_index: chunk.chunkIndex,
        chunk_words: DEFAULT_CHUNK_WORDS,
        overlap_words: DEFAULT_OVERLAP_WORDS,
        start_word: chunk.startWord,
        end_word: chunk.endWord,
        word_count: chunk.wordCount,
        semantic_score: chunk.semanticScore,
        keywords: appendEquationKeywordTags(chunk.keywords, chunk.equationIds),
        content: chunk.content
      }));

      if (hasDocumentChunkEmbeddings && isEmbeddingProviderConfigured()) {
        const embeddings = await embedTexts(chunkRows.map((row) => row.content));
        for (let index = 0; index < chunkRows.length; index += 1) {
          const embedding = embeddings[index];
          if (embedding) {
            chunkRows[index].embedding = toVectorLiteral(embedding);
          }
        }
      }

      const { error: insertChunksError } = await client
        .from("document_chunks")
        .insert(chunkRows);
      if (insertChunksError) throw insertChunksError;
    }
  }

  return {
    documentId,
    corrected: true,
    content: correctedContent,
    sourceRenderHtml: correctedHtml,
    contentTemplateId: hasDocumentBlockFields ? (updatePayload.content_template_id || null) : null,
    contentBlocksJson: hasDocumentBlockFields ? (contentBlocksJson || null) : null,
    contentBlocksSchemaVersion: hasDocumentBlockFields ? contentBlocksSchemaVersion : null
  };
}

export async function listDocumentChunks(documentIds, options = {}) {
  const ids = Array.isArray(documentIds) ? documentIds.map((id) => String(id || "").trim()).filter(Boolean) : [];
  if (!ids.length) return [];
  if (!isSupabaseConfigured()) return [];

  const client = createSupabaseAdminClient();
  const hasDocumentChunks = await supportsDocumentChunks(client);
  const hasDocumentChunkMarkdownFields = hasDocumentChunks ? await supportsDocumentChunkMarkdownFields(client) : false;
  if (!hasDocumentChunks) return [];

  const chunkWords = Number(options.chunkWords || DEFAULT_CHUNK_WORDS);
  const overlapWords = Number(options.overlapWords || DEFAULT_OVERLAP_WORDS);

  const { data, error } = await client
    .from("document_chunks")
    .select(hasDocumentChunkMarkdownFields
      ? "document_id, subject_id, chunk_index, chunk_words, overlap_words, start_word, end_word, word_count, token_count, semantic_score, keywords, section, heading_path, page_number, content, content_markdown"
      : "document_id, subject_id, chunk_index, chunk_words, overlap_words, start_word, end_word, word_count, semantic_score, keywords, content")
    .in("document_id", ids)
    .eq("chunk_words", chunkWords)
    .eq("overlap_words", overlapWords)
    .order("document_id", { ascending: true })
    .order("chunk_index", { ascending: true });

  if (error) throw error;

  return (data || []).map((row) => {
    const keywordParts = splitEquationKeywordTags(row.keywords || []);
    return {
      documentId: row.document_id,
      subjectId: row.subject_id,
      chunkIndex: row.chunk_index,
      chunkWords: row.chunk_words,
      overlapWords: row.overlap_words,
      startWord: row.start_word,
      endWord: row.end_word,
      tokenCount: Number(row.token_count || row.word_count || 0),
      wordCount: row.word_count,
      semanticScore: row.semantic_score,
      keywords: keywordParts.keywords,
      equationIds: keywordParts.equationIds,
      section: String(row.section || ""),
      headingPath: Array.isArray(row.heading_path) ? row.heading_path : [],
      page: Number.isFinite(Number(row.page_number)) ? Number(row.page_number) : null,
      content: row.content_markdown || row.content || ""
    };
  });
}

export async function matchDocumentChunksByEmbedding(documentIds, queryText, options = {}) {
  const ids = Array.isArray(documentIds) ? documentIds.map((id) => String(id || "").trim()).filter(Boolean) : [];
  const normalizedQuery = String(queryText || "").trim();
  if (!ids.length || !normalizedQuery) return [];
  if (!isSupabaseConfigured() || !isEmbeddingProviderConfigured()) return [];

  const client = createSupabaseAdminClient();
  const hasDocumentChunks = await supportsDocumentChunks(client);
  const hasDocumentChunkEmbeddings = hasDocumentChunks ? await supportsDocumentChunkEmbeddings(client) : false;
  const hasDocumentChunkMarkdownFields = hasDocumentChunks ? await supportsDocumentChunkMarkdownFields(client) : false;
  if (!hasDocumentChunks || !hasDocumentChunkEmbeddings) return [];

  const embedding = await embedQuery(normalizedQuery);
  if (!embedding) return [];

  const chunkWords = Number(options.chunkWords || DEFAULT_CHUNK_WORDS);
  const overlapWords = Number(options.overlapWords || DEFAULT_OVERLAP_WORDS);
  const matchCount = Math.max(1, Number(options.matchCount || 12));

  const { data, error } = await client.rpc("match_document_chunks", {
    query_embedding: toVectorLiteral(embedding),
    match_count: matchCount,
    filter_document_ids: ids,
    filter_chunk_words: chunkWords,
    filter_overlap_words: overlapWords
  });

  if (error) throw error;

  return (data || []).map((row) => {
    const keywordParts = splitEquationKeywordTags(row.keywords || []);
    return {
      documentId: row.document_id,
      subjectId: row.subject_id,
      chunkIndex: row.chunk_index,
      chunkWords: row.chunk_words,
      overlapWords: row.overlap_words,
      startWord: row.start_word,
      endWord: row.end_word,
      tokenCount: Number(row.token_count || row.word_count || 0),
      wordCount: row.word_count,
      semanticScore: row.semantic_score,
      keywords: keywordParts.keywords,
      equationIds: keywordParts.equationIds,
      section: hasDocumentChunkMarkdownFields ? String(row.section || "") : "",
      headingPath: hasDocumentChunkMarkdownFields && Array.isArray(row.heading_path) ? row.heading_path : [],
      page: hasDocumentChunkMarkdownFields && Number.isFinite(Number(row.page_number)) ? Number(row.page_number) : null,
      content: row.content_markdown || row.content || "",
      vectorSimilarity: Number(row.similarity || 0)
    };
  });
}
