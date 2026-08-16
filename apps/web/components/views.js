import { useEffect, useRef, useState } from "react";
import katex from "katex";
import { kpiCards } from "./data";
import {
  buildFolderChildrenMap,
  buildFolderPathMap,
  DEFAULT_SUBJECT_COLOR,
  DEFAULT_TOPIC_TAG_COLOR,
  DEFAULT_WORKSPACE_COLOR,
  filterDocuments,
  flattenFolders,
  getDocumentFolderIds,
  normalizeSubjectColor,
  normalizeTagName,
  normalizeTopicTagColor,
  splitDocumentsByFolder,
  normalizeWorkspaceColor
} from "../modules/core";

function getUploadedDocuments(documents = []) {
  return documents.filter((doc) => doc.sourceType !== "generated");
}

function getGeneratedDocuments(documents = []) {
  return documents.filter((doc) => doc.sourceType === "generated");
}

const TAG_VISUAL_PALETTE = [
  { bg: "#ffe6ea", border: "#f5a3b4", text: "#7a2437" },
  { bg: "#e8f6ff", border: "#95c9ef", text: "#1d4f71" },
  { bg: "#e9f8ef", border: "#8dd6a6", text: "#1f5d36" },
  { bg: "#fff4df", border: "#f0c48a", text: "#7a4a14" },
  { bg: "#efeaff", border: "#baa8ef", text: "#4a2e87" },
  { bg: "#e9f7f5", border: "#92d7cc", text: "#1f5b52" }
];

function hashTagName(tagName) {
  return String(tagName || "").split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

const WORKSPACES_API = "/api/workspaces-supabase";
const BLOCK_TEMPLATE_STORAGE_KEY = "luna.blockTemplates.v1";

const DEFAULT_BLOCK_TEMPLATES = [
  {
    id: "template_default",
    name: "Default Clean",
    description: "Neutral reading layout for mixed academic documents.",
    containerClass: "luna-template-default",
    blockClasses: {
      heading1: "tpl-h1",
      heading2: "tpl-h2",
      heading3: "tpl-h3",
      paragraph: "tpl-p",
      bullet_list: "tpl-list",
      inline_formula: "tpl-inline-math",
      standalone_formula: "tpl-display-math",
      table: "tpl-table",
      image: "tpl-image",
      url: "tpl-url",
      code: "tpl-code"
    },
    css: [
      ".luna-template-default{font-family:Georgia,serif;color:#1f2937;line-height:1.6}",
      ".luna-template-default .tpl-h1{font-size:2rem;font-weight:700;margin:.8rem 0}",
      ".luna-template-default .tpl-h2{font-size:1.55rem;font-weight:700;margin:.7rem 0}",
      ".luna-template-default .tpl-h3{font-size:1.2rem;font-weight:600;margin:.6rem 0}",
      ".luna-template-default .tpl-display-math{background:#f8fafc;border:1px solid #dbe4f0;border-radius:8px;padding:.7rem;font-family:'Times New Roman',serif}",
      ".luna-template-default .tpl-code{background:#0f172a;color:#e2e8f0;padding:.8rem;border-radius:8px;overflow:auto}",
      ".luna-template-default table{border-collapse:collapse;width:100%}",
      ".luna-template-default td,.luna-template-default th{border:1px solid #cbd5e1;padding:.45rem .5rem}"
    ].join("\n")
  },
  {
    id: "template_study_cards",
    name: "Study Cards",
    description: "Higher contrast blocks for active review sessions.",
    containerClass: "luna-template-study-cards",
    blockClasses: {
      heading1: "tpl-h1",
      heading2: "tpl-h2",
      heading3: "tpl-h3",
      paragraph: "tpl-card",
      bullet_list: "tpl-card",
      inline_formula: "tpl-inline-math",
      standalone_formula: "tpl-math-card",
      table: "tpl-card",
      image: "tpl-card",
      url: "tpl-card",
      code: "tpl-code"
    },
    css: [
      ".luna-template-study-cards{font-family:'Avenir Next',system-ui,sans-serif;color:#0f172a}",
      ".luna-template-study-cards .tpl-h1{font-size:2rem;font-weight:800;margin:.9rem 0;color:#7c2d12}",
      ".luna-template-study-cards .tpl-h2{font-size:1.45rem;font-weight:700;margin:.7rem 0;color:#0f766e}",
      ".luna-template-study-cards .tpl-card{background:#fff8ef;border:1px solid #f2c48f;border-radius:12px;padding:.7rem .8rem;margin:.45rem 0}",
      ".luna-template-study-cards .tpl-math-card{background:#ecfeff;border:1px solid #7dd3fc;border-radius:12px;padding:.7rem .8rem;font-family:'Times New Roman',serif}",
      ".luna-template-study-cards .tpl-code{background:#111827;color:#f9fafb;padding:.8rem;border-radius:10px;overflow:auto}"
    ].join("\n")
  }
];

const BLOCK_TYPE_OPTIONS = [
  { value: "heading1", label: "Heading 1" },
  { value: "heading2", label: "Heading 2" },
  { value: "heading3", label: "Heading 3" },
  { value: "paragraph", label: "Paragraph" },
  { value: "bullet_list", label: "Bullet List" },
  { value: "inline_formula", label: "In-text Formula" },
  { value: "standalone_formula", label: "Standalone Formula" },
  { value: "table", label: "Table" },
  { value: "image", label: "Image" },
  { value: "url", label: "URL" },
  { value: "code", label: "Code" }
];

function createBlockId() {
  return `block_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createDefaultBlock(type = "paragraph") {
  const block = {
    id: createBlockId(),
    type
  };

  if (type === "heading1" || type === "heading2" || type === "heading3" || type === "paragraph") {
    block.text = "";
    return block;
  }
  if (type === "bullet_list") {
    block.items = [""];
    return block;
  }
  if (type === "inline_formula") {
    block.textBefore = "";
    block.latex = "";
    block.textAfter = "";
    return block;
  }
  if (type === "standalone_formula") {
    block.latex = "";
    return block;
  }
  if (type === "table") {
    block.rows = [["Cell 1", "Cell 2"], ["Cell 3", "Cell 4"]];
    return block;
  }
  if (type === "image") {
    block.src = "";
    block.alt = "";
    block.caption = "";
    return block;
  }
  if (type === "url") {
    block.href = "https://";
    block.text = "Link text";
    return block;
  }
  if (type === "code") {
    block.language = "text";
    block.code = "";
    return block;
  }

  block.text = "";
  return block;
}

function sanitizeCellText(value = "") {
  return String(value || "").replace(/\r/g, "").trim();
}

function readBlockTemplatesFromStorage() {
  if (typeof window === "undefined") return DEFAULT_BLOCK_TEMPLATES;
  try {
    const raw = window.localStorage.getItem(BLOCK_TEMPLATE_STORAGE_KEY);
    if (!raw) return DEFAULT_BLOCK_TEMPLATES;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return DEFAULT_BLOCK_TEMPLATES;
    return parsed;
  } catch {
    return DEFAULT_BLOCK_TEMPLATES;
  }
}

function writeBlockTemplatesToStorage(templates = []) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BLOCK_TEMPLATE_STORAGE_KEY, JSON.stringify(templates));
  } catch {
    // Ignore localStorage quota issues and keep in-memory state.
  }
}

function blockRowsToText(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => (Array.isArray(row) ? row.map((cell) => String(cell || "").trim()).join(" | ") : ""))
    .join("\n");
}

function tableTextToRows(value = "") {
  return String(value || "")
    .split(/\n+/)
    .map((line) => line.split("|").map((cell) => sanitizeCellText(cell)).filter((cell) => cell.length > 0))
    .filter((row) => row.length > 0);
}

function inlineFormulaFromText(text = "") {
  const match = String(text || "").match(/^(.*?)\$([^$]+)\$(.*?)$/);
  if (!match) return null;
  return {
    textBefore: String(match[1] || ""),
    latex: String(match[2] || "").trim(),
    textAfter: String(match[3] || "")
  };
}

function normalizeNodeText(node) {
  return String(node?.textContent || "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeStandaloneFormula(text = "") {
  const value = String(text || "").trim();
  if (!value) return false;
  if (/^\$\$[\s\S]+\$\$$/.test(value)) return true;
  const hasMathSyntax = /[=+\-*/^]|\\frac|\\sum|\\int|\\bar|√|∑/.test(value);
  if (!hasMathSyntax) return false;
  const tokenCount = value.split(/\s+/).filter(Boolean).length;
  const symbolCount = (value.match(/[=+\-*/^()]/g) || []).length;
  return symbolCount >= 2 && tokenCount <= 28;
}

function hasBlockChildren(node) {
  const BLOCK_TAGS = "h1,h2,h3,h4,h5,h6,p,ul,ol,table,figure,pre,code,blockquote,article,section,div";
  return Boolean(node?.querySelector?.(BLOCK_TAGS));
}

function htmlToBlocks(htmlSource = "") {
  const source = String(htmlSource || "").trim();
  if (!source) return [createDefaultBlock("paragraph")];

  try {
    const parser = new DOMParser();
    const parsed = parser.parseFromString(`<body>${source}</body>`, "text/html");
    const body = parsed.body;
    const blocks = [];

    const pushBlock = (block) => {
      if (!block || typeof block !== "object") return;
      blocks.push({ id: createBlockId(), ...block });
    };

    const parseNode = (node) => {
      const tag = String(node.tagName || "").toLowerCase();

      if (tag === "h1" || tag === "h2" || tag === "h3") {
        pushBlock({ type: `heading${tag.slice(1)}`, text: normalizeNodeText(node) });
        return;
      }

      if (tag === "h4" || tag === "h5" || tag === "h6") {
        pushBlock({ type: "heading3", text: normalizeNodeText(node) });
        return;
      }

      if (tag === "ul" || tag === "ol") {
        const items = Array.from(node.children || [])
          .filter((child) => String(child.tagName || "").toLowerCase() === "li")
          .map((li) => normalizeNodeText(li))
          .filter(Boolean);
        pushBlock({ type: "bullet_list", items: items.length ? items : [""] });
        return;
      }

      if (tag === "table") {
        const rows = Array.from(node.querySelectorAll("tr")).map((tr) => Array.from(tr.querySelectorAll("th,td")).map((td) => String(td.textContent || "").trim()));
        pushBlock({ type: "table", rows: rows.length ? rows : [["Cell"]] });
        return;
      }

      if (tag === "figure") {
        const image = node.querySelector("img");
        if (image) {
          pushBlock({
            type: "image",
            src: String(image.getAttribute("src") || ""),
            alt: String(image.getAttribute("alt") || ""),
            caption: normalizeNodeText(node.querySelector("figcaption"))
          });
          return;
        }
      }

      if (tag === "img") {
        pushBlock({
          type: "image",
          src: String(node.getAttribute("src") || ""),
          alt: String(node.getAttribute("alt") || ""),
          caption: ""
        });
        return;
      }

      if (tag === "a") {
        const href = String(node.getAttribute("href") || "").trim();
        const text = normalizeNodeText(node);
        if (href || text) {
          pushBlock({
          type: "url",
            href,
            text: text || href
          });
          return;
        }
      }

      if (tag === "pre" || tag === "code") {
        pushBlock({
          type: "code",
          language: "text",
          code: String(node.textContent || "")
        });
        return;
      }

      if ((tag === "div" || tag === "section" || tag === "article") && hasBlockChildren(node)) {
        for (const child of Array.from(node.children || [])) {
          parseNode(child);
        }
        return;
      }

      const text = normalizeNodeText(node);
      if (!text) {
        const images = Array.from(node.querySelectorAll?.("img") || []);
        for (const image of images) {
          parseNode(image);
        }
        return;
      }

      const displayMatch = text.match(/^\$\$([\s\S]+)\$\$$/);
      if (displayMatch) {
        pushBlock({ type: "standalone_formula", latex: String(displayMatch[1] || "").trim() });
        return;
      }

      if (looksLikeStandaloneFormula(text)) {
        pushBlock({ type: "standalone_formula", latex: text.replace(/^\$\$|\$\$$/g, "").trim() });
        return;
      }

      const inline = inlineFormulaFromText(text);
      if (inline) {
        pushBlock({ type: "inline_formula", ...inline });
        return;
      }

      pushBlock({ type: "paragraph", text });
    };

    const rootChildren = Array.from(body.children || []);
    const roots = rootChildren.length === 1 && ["div", "article", "section"].includes(String(rootChildren[0]?.tagName || "").toLowerCase())
      ? Array.from(rootChildren[0].children || [])
      : rootChildren;

    for (const node of roots) {
      parseNode(node);
    }

    return blocks.length ? blocks : [createDefaultBlock("paragraph")];
  } catch {
    return [{ id: createBlockId(), type: "paragraph", text: htmlToPlainText(source) }];
  }
}

function blockToHtml(block = {}, blockClass = "") {
  const classAttr = blockClass ? ` class="${escapeHtml(blockClass)}"` : "";
  const blockIdAttr = ` data-block-id="${escapeHtml(block.id || createBlockId())}"`;
  const type = String(block.type || "paragraph");

  if (type === "heading1") return `<h1${classAttr}${blockIdAttr}>${escapeHtml(block.text || "")}</h1>`;
  if (type === "heading2") return `<h2${classAttr}${blockIdAttr}>${escapeHtml(block.text || "")}</h2>`;
  if (type === "heading3") return `<h3${classAttr}${blockIdAttr}>${escapeHtml(block.text || "")}</h3>`;
  if (type === "paragraph") return `<p${classAttr}${blockIdAttr}>${escapeHtml(block.text || "").replace(/\n/g, "<br />")}</p>`;
  if (type === "bullet_list") {
    const items = Array.isArray(block.items) ? block.items : [];
    const li = items.map((item) => `<li>${escapeHtml(item || "")}</li>`).join("");
    return `<ul${classAttr}${blockIdAttr}>${li}</ul>`;
  }
  if (type === "inline_formula") {
    const textBefore = escapeHtml(block.textBefore || "");
    const latex = escapeHtml(block.latex || "");
    const textAfter = escapeHtml(block.textAfter || "");
    return `<p${classAttr}${blockIdAttr}>${textBefore}<span data-inline-latex="true">$${latex}$</span>${textAfter}</p>`;
  }
  if (type === "standalone_formula") return `<div${classAttr}${blockIdAttr}>$$${escapeHtml(block.latex || "\\placeholder")}$$</div>`;
  if (type === "table") {
    const rows = Array.isArray(block.rows) ? block.rows : [];
    const rowHtml = rows.map((row) => `<tr>${(Array.isArray(row) ? row : []).map((cell) => `<td>${escapeHtml(cell || "")}</td>`).join("")}</tr>`).join("");
    return `<table${classAttr}${blockIdAttr}><tbody>${rowHtml}</tbody></table>`;
  }
  if (type === "image") {
    const src = escapeHtml(block.src || "");
    const alt = escapeHtml(block.alt || "");
    const caption = String(block.caption || "").trim();
    const figureCaption = caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : "";
    return `<figure${classAttr}${blockIdAttr}><img src="${src}" alt="${alt}" />${figureCaption}</figure>`;
  }
  if (type === "url") {
    const href = escapeHtml(block.href || "");
    const text = escapeHtml(block.text || block.href || "");
    return `<p${classAttr}${blockIdAttr}><a href="${href}">${text}</a></p>`;
  }
  if (type === "code") {
    const language = escapeHtml(block.language || "text");
    const code = escapeHtml(block.code || "");
    return `<pre${classAttr}${blockIdAttr} data-language="${language}"><code>${code}</code></pre>`;
  }

  return `<p${classAttr}${blockIdAttr}>${escapeHtml(block.text || "")}</p>`;
}

function blocksToHtml(blocks = [], template = null) {
  const safeBlocks = Array.isArray(blocks) && blocks.length ? blocks : [{ id: "block_empty", type: "paragraph", text: "" }];
  const activeTemplate = template || DEFAULT_BLOCK_TEMPLATES[0];
  const blockClasses = activeTemplate?.blockClasses && typeof activeTemplate.blockClasses === "object"
    ? activeTemplate.blockClasses
    : {};
  const css = String(activeTemplate?.css || "").trim();
  const containerClass = String(activeTemplate?.containerClass || "luna-template-default");

  const htmlBlocks = safeBlocks.map((block) => {
    const className = String(blockClasses[String(block.type || "paragraph")] || "");
    return blockToHtml(block, className);
  }).join("\n");

  const styleTag = css ? `<style data-luna-template="${escapeHtml(activeTemplate?.id || "template_default")}">${css}</style>` : "";
  return `${styleTag}<div class="${escapeHtml(containerClass)}" data-template-id="${escapeHtml(activeTemplate?.id || "template_default")}">${htmlBlocks}</div>`;
}

function downloadBase64File(base64, filename, mimeType) {
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }

  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadTextFile(content, filename, mimeType = "text/plain") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function decodeBase64Utf8(base64 = "") {
  const source = String(base64 || "").trim();
  if (!source) return "";
  try {
    const raw = atob(source);
    const bytes = new Uint8Array(raw.length);
    for (let index = 0; index < raw.length; index += 1) {
      bytes[index] = raw.charCodeAt(index);
    }
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return "";
  }
}

function extractEditableBodyHtml(fullHtml = "") {
  const source = String(fullHtml || "").trim();
  if (!source) return "";
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(source, "text/html");
    const article = doc.querySelector("article");
    if (article?.innerHTML) return String(article.innerHTML || "");
    if (doc.body?.innerHTML) return String(doc.body.innerHTML || "");
  } catch {
    // Fallback to the raw source if parsing fails.
  }
  return source;
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function riskColorBySeverity(severity = "medium") {
  const normalized = String(severity || "medium").trim().toLowerCase();
  if (normalized === "critical") {
    return { bg: "#ffe3ea", border: "#df6a8f", text: "#751d3a" };
  }
  if (normalized === "high") {
    return { bg: "#ffe9d9", border: "#e59f63", text: "#7a4212" };
  }
  if (normalized === "low") {
    return { bg: "#e8f7ef", border: "#75be94", text: "#24573a" };
  }
  return { bg: "#e8f1ff", border: "#87aee6", text: "#234573" };
}

function formulaParserTierStyle(formula) {
  const tier = String(formula?.parserConfidenceTier || "").toLowerCase();
  if (tier === "high") {
    return {
      label: "Parser HIGH",
      bg: "#e7f8ee",
      border: "#80c89c",
      text: "#1f5b36"
    };
  }
  if (tier === "medium") {
    return {
      label: "Parser MED",
      bg: "#fff2df",
      border: "#e6bf85",
      text: "#7c4a11"
    };
  }
  return {
    label: "Parser LOW",
    bg: "#ffe7ea",
    border: "#e3939f",
    text: "#7f2736"
  };
}

function toDataUrl(mimeType = "", contentBase64 = "") {
  if (!contentBase64) return "";
  return `data:${mimeType || "application/octet-stream"};base64,${contentBase64}`;
}

function buildRiskEntries(item) {
  const markers = Array.isArray(item?.extractionRiskMarkers) ? item.extractionRiskMarkers : [];
  return markers.map((marker, index) => ({
    id: String(marker?.id || `R${index + 1}`),
    label: String(marker?.label || `Risk ${index + 1}`),
    type: String(marker?.type || "general-risk"),
    order: index,
    excerpt: String(marker?.excerpt || "").trim(),
    severity: String(marker?.severity || "medium"),
    addressed: Boolean(marker?.addressed),
    anchor: marker?.anchor && typeof marker.anchor === "object" ? marker.anchor : null,
    formula: marker?.formula && typeof marker.formula === "object" ? marker.formula : null
  }));
}

function applyInlineRiskMarkers(content = "", entries = []) {
  let next = String(content || "");
  for (const entry of entries) {
    if (!entry.excerpt) continue;
    const markerToken = `[${entry.id}]`;
    if (next.includes(markerToken)) continue;
    const at = next.indexOf(entry.excerpt);
    if (at >= 0) {
      next = `${next.slice(0, at)}${markerToken} ${next.slice(at)}`;
    }
  }
  return next;
}

function buildHighlightedRiskHtml(content = "", entries = [], activeRiskId = "") {
  const source = String(content || "");
  if (!source.trim()) return "<em>(empty)</em>";

  const chunks = [{ text: source, riskId: "", severity: "" }];
  for (const entry of entries) {
    if (!entry.excerpt) continue;
    for (let idx = 0; idx < chunks.length; idx += 1) {
      const chunk = chunks[idx];
      if (chunk.riskId) continue;
      const hit = chunk.text.indexOf(entry.excerpt);
      if (hit < 0) continue;
      const before = chunk.text.slice(0, hit);
      const match = chunk.text.slice(hit, hit + entry.excerpt.length);
      const after = chunk.text.slice(hit + entry.excerpt.length);
      const replacement = [];
      if (before) replacement.push({ text: before, riskId: "", severity: "" });
      replacement.push({ text: match, riskId: entry.id, severity: entry.severity });
      if (after) replacement.push({ text: after, riskId: "", severity: "" });
      chunks.splice(idx, 1, ...replacement);
      break;
    }
  }

  return chunks.map((chunk) => {
    const html = escapeHtml(chunk.text);
    if (!chunk.riskId) return html;
    const color = riskColorBySeverity(chunk.severity);
    const activeStyle = chunk.riskId === activeRiskId ? "box-shadow:0 0 0 2px #5f78d6;" : "";
    return `<mark data-risk-id="${escapeHtml(chunk.riskId)}" style="background:${color.bg};border:1px solid ${color.border};color:${color.text};padding:0 2px;border-radius:4px;cursor:pointer;${activeStyle}" title="${chunk.riskId}">${escapeHtml(`[${chunk.riskId}] `)}${html}</mark>`;
  }).join("");
}

function buildRiskSnippetHtml(snippet = "", entry = null) {
  const source = String(snippet || "");
  if (!source.trim()) return "<em>(empty)</em>";

  let html = escapeHtml(source).replace(/\n/g, "<br />");
  const excerpt = String(entry?.excerpt || "").trim();
  if (excerpt) {
    const escapedExcerpt = escapeHtml(excerpt);
    const at = html.indexOf(escapedExcerpt);
    if (at >= 0) {
      html = `${html.slice(0, at)}<mark style="background:#fff0cc;border:1px solid #e6bf85;color:#7c4a11;padding:0 2px;border-radius:4px;">${escapedExcerpt}</mark>${html.slice(at + escapedExcerpt.length)}`;
    }
  }

  if (entry?.formula?.mathMl || entry?.formula?.linear) {
      const preferredLatex = String(entry?.formula?.latex || "").trim();
      const formulaBody = preferredLatex
        ? `<code>$$ ${escapeHtml(preferredLatex)} $$</code>`
        : (entry?.formula?.mathMl
          ? `<div class="risk-snippet-formula-math">${String(entry.formula.mathMl)}</div>`
          : `<code>${escapeHtml(String(entry?.formula?.linear || "[FORMULA]"))}</code>`);
      html += `<div class="risk-snippet-formula" style="margin-top:8px;padding:8px;border:1px solid #c8d7ff;border-radius:8px;background:#ffffff;">${formulaBody}</div>`;
  }

  return html;
}

function appendFormulaBlocksToSourceHtml(sourceRenderHtml = "", entries = []) {
  return String(sourceRenderHtml || "").trim();
}

function sanitizeEditableHtml(html = "") {
  return String(html || "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "");
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

function plainTextToHtml(text = "") {
  const source = String(text || "").replace(/\r/g, "").trim();
  if (!source) return "<p>(empty)</p>";
  const paragraphs = source.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  if (!paragraphs.length) return `<p>${escapeHtml(source).replace(/\n/g, "<br />")}</p>`;
  return paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`).join("");
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

  return html.join("\n").trim() || "<p>(empty)</p>";
}

function stripRiskMarkupFromHtml(html = "") {
  return String(html || "")
    .replace(/<mark\b[^>]*data-source-risk-id="[^"]+"[^>]*>([\s\S]*?)<\/mark>/gi, "$1")
    .replace(/<span\b[^>]*class="luna-source-formula-id"[^>]*>[\s\S]*?<\/span>/gi, "");
}

function annotateRiskHtml(sourceHtml = "", entries = [], activeRiskId = "") {
  let html = String(sourceHtml || "");
  if (!html.trim()) return "<p>(empty)</p>";

  const riskEntries = Array.isArray(entries) ? entries : [];
  for (const entry of riskEntries) {
    const excerpt = String(entry?.excerpt || "").trim();
    if (!excerpt) continue;
    const escaped = excerpt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(escaped);
    if (!pattern.test(html)) continue;

    const color = riskColorBySeverity(entry.severity);
    const isActive = String(entry.id) === String(activeRiskId || "");
    const activeStyle = isActive ? "box-shadow:0 0 0 2px #5f78d6;animation:luna-risk-flash 0.9s ease 1;" : "";
    html = html.replace(pattern, `<mark data-source-risk-id="${escapeHtml(entry.id)}" style="background:${color.bg};border:1px solid ${color.border};color:${color.text};padding:0 2px;border-radius:4px;cursor:pointer;${activeStyle}">${excerpt}</mark>`);
  }

  return html;
}

function riskCategoryLabel(type = "") {
  const normalized = String(type || "").toLowerCase();
  if (normalized.includes("formula") || normalized.includes("math") || normalized.includes("equation")) return "Formula";
  if (normalized.includes("ocr") || normalized.includes("image")) return "OCR";
  if (normalized.includes("citation")) return "Citation";
  if (normalized.includes("format")) return "Formatting";
  return "Content";
}

function getFormulaDebugRows(item) {
  return buildRiskEntries(item)
    .filter((entry) => entry?.formula)
    .map((entry) => ({
      id: entry.id,
      label: entry.label,
      omml: String(entry.formula?.sourceXmlSnippet || "").trim(),
      mathMl: String(entry.formula?.mathMl || "").trim(),
      latex: String(entry.formula?.latex || entry.formula?.linear || "").trim()
    }));
}

function renderLatexInHtml(html = "") {
  const source = String(html || "");
  if (!source.trim()) return source;

  let rendered = source;
  rendered = rendered.replace(/\$\$([\s\S]+?)\$\$/g, (_, expr) => {
    const latex = String(expr || "").trim();
    if (!latex) return "";
    try {
      return katex.renderToString(latex, { displayMode: true, throwOnError: false });
    } catch {
      return `<pre>${escapeHtml(`$$\n${latex}\n$$`)}</pre>`;
    }
  });

  rendered = rendered.replace(/\$(?!\$)([^$\n]+?)\$/g, (_, expr) => {
    const latex = String(expr || "").trim();
    if (!latex) return "";
    try {
      return katex.renderToString(latex, { displayMode: false, throwOnError: false });
    } catch {
      return escapeHtml(`$${latex}$`);
    }
  });

  return rendered;
}

function ScopeBar({ label = "Scope" }) {
  return (
    <div className="scope-bar">
      <b>{label}</b>
      <span>Workspace: High School 2024</span>
      <span>Subject: Mathematics</span>
      <span>Folder: Calculus</span>
      <span>Tags: Exam 1, Hard</span>
    </div>
  );
}

export function DashboardView() {
  return (
    <section className="view-stack">
      <div className="kpi-grid">
        {kpiCards.map((card) => (
          <article className={"kpi-card " + card.tone} key={card.label}>
            <p>{card.label}</p>
            <h3>{card.value}</h3>
            <small>{card.trend}</small>
          </article>
        ))}
      </div>

      <div className="panel-grid three">
        <article className="panel">
          <h4>Weak Skill</h4>
          <p>Integration by Parts</p>
          <div className="meter"><span style={{ width: "41%" }} /></div>
          <button className="ghost-btn">Practice</button>
        </article>
        <article className="panel">
          <h4>Needs Review</h4>
          <p>Cellular Respiration</p>
          <div className="meter"><span style={{ width: "63%" }} /></div>
          <button className="ghost-btn">Review</button>
        </article>
        <article className="panel">
          <h4>Strong</h4>
          <p>Linear Equations</p>
          <div className="meter"><span style={{ width: "94%" }} /></div>
          <button className="ghost-btn">Challenge</button>
        </article>
      </div>

      <div className="panel-grid two">
        <article className="panel">
          <h4>Recent Activity</h4>
          <ul className="line-list">
            <li>Quiz completed: Calculus Ch.4 (18/20)</li>
            <li>Summary generated: Biology Notes</li>
            <li>Uploaded: Exam_2023.pdf indexed</li>
            <li>Agent purchased: GMAT Coach</li>
          </ul>
        </article>
        <article className="panel">
          <h4>Quick Actions</h4>
          <div className="chip-grid">
            <button className="chip">Generate Quiz</button>
            <button className="chip">Make Summary</button>
            <button className="chip">Flashcards</button>
            <button className="chip">Ask Tutor</button>
            <button className="chip">Upload Doc</button>
            <button className="chip">Browse Agents</button>
          </div>
        </article>
      </div>

      <div className="panel-grid three">
        <article className="panel">
          <h4>Mastery</h4>
          <h3>78%</h3>
          <p className="hint">Up 12% this month</p>
        </article>
        <article className="panel">
          <h4>Strong</h4>
          <ul className="line-list">
            <li>Derivatives: 91%</li>
            <li>Limits: 86%</li>
          </ul>
        </article>
        <article className="panel">
          <h4>Needs Work</h4>
          <ul className="line-list">
            <li>Integration: 63%</li>
            <li>Integration by Parts: 41%</li>
          </ul>
        </article>
      </div>
      <article className="panel accent">
        AI Insight placeholder: 3 short sessions on Integration by Parts can improve projected score.
      </article>
    </section>
  );
}

export function AIToolsHubView({ onOpenTool }) {
  const tools = [
    {
      key: "ai-tool-quiz",
      name: "Quiz Generator",
      description: "Build chapter quizzes and exams from selected workspace documents.",
      action: "Open Quiz Generator"
    },
    {
      key: "ai-tool-tutor",
      name: "AI Tutor",
      description: "Step-by-step tutoring and practice hints constrained by your study scope.",
      action: "Open AI Tutor"
    },
    {
      key: "ai-tool-chatbot",
      name: "Chatbot",
      description: "General purpose learning assistant for quick questions and summaries.",
      action: "Open Chatbot"
    }
  ];

  return (
    <section className="view-stack">
      <article className="panel accent">
        <h4 style={{ marginTop: 0 }}>AI Tools Library</h4>
        <p className="hint">This catalog will keep growing. Click any tool to open its full page.</p>
      </article>

      <div className="panel-grid three">
        {tools.map((tool) => (
          <article key={tool.key} className="panel ai-tool-card">
            <h4>{tool.name}</h4>
            <p>{tool.description}</p>
            <button className="primary-btn" type="button" onClick={() => onOpenTool(tool.key)}>{tool.action}</button>
          </article>
        ))}
      </div>
    </section>
  );
}

export function AIToolPageView({ title, description, onBack, children }) {
  return (
    <section className="view-stack">
      <article className="panel">
        <div className="inline-actions" style={{ justifyContent: "space-between" }}>
          <div>
            <h4 style={{ margin: 0 }}>{title}</h4>
            <p className="hint" style={{ margin: "6px 0 0" }}>{description}</p>
          </div>
          <button className="table-btn" type="button" onClick={onBack}>Back To AI Tools</button>
        </div>
      </article>
      {children}
    </section>
  );
}

export function WorkspacesView() {
  return <section className="view-stack" />;
}

export function WorkspacesManagerView({
  role = "student",
  workspaces,
  selectedWorkspaceId,
  selectedSubjectId,
  statusMessage,
  isWorking,
  onSelectWorkspace,
  onSelectSubject,
  onCreateWorkspace,
  onRenameWorkspace,
  onSetWorkspaceColor,
  onRemoveWorkspace,
  onCreateSubject,
  onRenameSubject,
  onSetSubjectColor,
  onRemoveSubject,
  onCreateFolder,
  onAddTopicTag,
  onRenameFolder,
  onRemoveFolder,
  onRenameTopicTag,
  onRemoveTopicTag,
  onSetTopicTagColor,
  onUpdateDocumentContent,
  onUploadTxt,
  onRenameDocument,
  onRemoveDocument,
  onUpdateDocumentMeta,
  onListDocumentBlockTemplates,
  onSaveDocumentBlockTemplate,
  onDeleteDocumentBlockTemplate,
  onReviewDocumentExtraction,
  onReprocessDocument
}) {
  const [subjectName, setSubjectName] = useState("");
  const [folderName, setFolderName] = useState("");
  const [parentFolderId, setParentFolderId] = useState("");
  const [topicTagName, setTopicTagName] = useState("");
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState("folders");
  const [uploadFolderIds, setUploadFolderIds] = useState([]);
  const [uploadSelectedTags, setUploadSelectedTags] = useState([]);
  const [uploadTagDraft, setUploadTagDraft] = useState("");
  const [pendingFiles, setPendingFiles] = useState([]);
  const [uploadStrictQualityGate, setUploadStrictQualityGate] = useState(false);
  const [uploadStatusMessage, setUploadStatusMessage] = useState("");
  const [uploadErrorMessage, setUploadErrorMessage] = useState("");
  const [uploadEmergencyMessage, setUploadEmergencyMessage] = useState("");
  const [fallbackReviewItems, setFallbackReviewItems] = useState([]);
  const [reviewStatusMessage, setReviewStatusMessage] = useState("");
  const [reviewingDocumentId, setReviewingDocumentId] = useState("");
  const [isBulkReviewing, setIsBulkReviewing] = useState(false);
  const [reviewDraftByDocId, setReviewDraftByDocId] = useState({});
  const [reviewHtmlDraftByDocId, setReviewHtmlDraftByDocId] = useState({});
  const [riskAddressedByDocId, setRiskAddressedByDocId] = useState({});
  const [suppressedRiskByDocId, setSuppressedRiskByDocId] = useState({});
  const [reviewCompareDoc, setReviewCompareDoc] = useState(null);
  const [activeCompareRiskId, setActiveCompareRiskId] = useState("");
  const [showFullCompareEditor, setShowFullCompareEditor] = useState(false);
  const [riskSnippetEditor, setRiskSnippetEditor] = useState(null);
  const [generatedPdfArtifactByDocId, setGeneratedPdfArtifactByDocId] = useState({});
  const [preferGeneratedPdfPreview, setPreferGeneratedPdfPreview] = useState(false);
  const [renderLatexPreview, setRenderLatexPreview] = useState(false);
  const [showFormulaDebug, setShowFormulaDebug] = useState(false);
  const compareTextareaRef = useRef(null);
  const sourceViewerRef = useRef(null);
  const sourceEditorRef = useRef(null);
  const editContentEditorRef = useRef(null);
  const editContentImageInputRef = useRef(null);
  const editContentWorkingHtmlRef = useRef("");
  const [activeFolderId, setActiveFolderId] = useState("");
  const [filterFolderId, setFilterFolderId] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [filterText, setFilterText] = useState("");
  const [renameDocId, setRenameDocId] = useState("");
  const [renameDocName, setRenameDocName] = useState("");
  const [renameSubjectId, setRenameSubjectId] = useState("");
  const [renameSubjectName, setRenameSubjectName] = useState("");
  const [renameWorkspaceId, setRenameWorkspaceId] = useState("");
  const [renameWorkspaceName, setRenameWorkspaceName] = useState("");
  const [workspaceColorDraftById, setWorkspaceColorDraftById] = useState({});
  const [subjectColorDraftById, setSubjectColorDraftById] = useState({});
  const [renameFolderId, setRenameFolderId] = useState("");
  const [renameFolderName, setRenameFolderName] = useState("");
  const [renameTopicTagFrom, setRenameTopicTagFrom] = useState("");
  const [renameTopicTagTo, setRenameTopicTagTo] = useState("");
  const [showTagEditor, setShowTagEditor] = useState(false);
  const [showFolderActionMenu, setShowFolderActionMenu] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [workspaceActionMenuId, setWorkspaceActionMenuId] = useState("");
  const [workspaceEditId, setWorkspaceEditId] = useState("");
  const [subjectActionMenuId, setSubjectActionMenuId] = useState("");
  const [folderActionMenuId, setFolderActionMenuId] = useState("");
  const [docActionMenuId, setDocActionMenuId] = useState("");
  const [docInfoMenuId, setDocInfoMenuId] = useState("");
  const [collapsedFolders, setCollapsedFolders] = useState({});
  const [collapsedFolderDocs, setCollapsedFolderDocs] = useState({});
  const [unfiledCollapsed, setUnfiledCollapsed] = useState(true);
  const [downloadPickerDoc, setDownloadPickerDoc] = useState(null);
  const [reviewContentMode, setReviewContentMode] = useState("html");
  const [editDocMeta, setEditDocMeta] = useState(null);
  const [editDocFolderIds, setEditDocFolderIds] = useState([]);
  const [editDocSelectedTags, setEditDocSelectedTags] = useState([]);
  const [editDocTagDraft, setEditDocTagDraft] = useState("");
  const [editContentDoc, setEditContentDoc] = useState(null);
  const [editContentHtmlDraft, setEditContentHtmlDraft] = useState("");
  const [editContentMode, setEditContentMode] = useState("blocks");
  const [editContentBlocks, setEditContentBlocks] = useState([]);
  const [editContentTemplates, setEditContentTemplates] = useState(DEFAULT_BLOCK_TEMPLATES);
  const [editContentTemplateId, setEditContentTemplateId] = useState(DEFAULT_BLOCK_TEMPLATES[0].id);
  const [editContentTemplateCssDraft, setEditContentTemplateCssDraft] = useState(DEFAULT_BLOCK_TEMPLATES[0].css);
  const [editContentStatusMessage, setEditContentStatusMessage] = useState("");
  const [editContentFontFamily, setEditContentFontFamily] = useState("Avenir Next");
  const [editContentFontSize, setEditContentFontSize] = useState("16");
  const [editContentTextColorValue, setEditContentTextColorValue] = useState("#1f3a8a");
  const [editContentBackgroundColorValue, setEditContentBackgroundColorValue] = useState("#fff59d");
  const [isPreparingEditContent, setIsPreparingEditContent] = useState(false);
  const [isSavingEditContent, setIsSavingEditContent] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewMode, setPreviewMode] = useState("txt");
  const [previewDownloads, setPreviewDownloads] = useState({});
  const [previewLoadingMode, setPreviewLoadingMode] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [tagColorDraftByName, setTagColorDraftByName] = useState({});
  const editContentDragIndexRef = useRef(-1);

  const selectedWorkspace = workspaces.find((item) => item.id === selectedWorkspaceId) || null;
  const subjects = selectedWorkspace ? selectedWorkspace.subjects : [];
  const selectedSubject = subjects.find((item) => item.id === selectedSubjectId) || null;
  const folders = selectedSubject?.folders || [];
  const topicTags = selectedSubject?.topicTags || [];
  const documents = selectedSubject?.documents || [];
  const uploadedDocuments = getUploadedDocuments(documents);
  const generatedDocuments = getGeneratedDocuments(documents);
  const pendingUploadedDocuments = uploadedDocuments.filter((doc) => String(doc.reviewStatus || "approved") !== "approved" || Boolean(doc.requiresReview));
  const pendingFolderIds = new Set();
  let pendingUnfiledCount = 0;
  for (const pendingDoc of pendingUploadedDocuments) {
    const folderIds = getDocumentFolderIds(pendingDoc);
    if (!folderIds.length) {
      pendingUnfiledCount += 1;
      continue;
    }
    for (const folderId of folderIds) {
      pendingFolderIds.add(folderId);
    }
  }
  const topicTagNames = topicTags.map((item) => item.name);
  const tagColorByName = Object.fromEntries(topicTags.map((item) => [item.name, item.color || DEFAULT_TOPIC_TAG_COLOR]));

  function getWorkspaceColor(workspace) {
    return normalizeWorkspaceColor(workspaceColorDraftById[workspace.id] || workspace.color || DEFAULT_WORKSPACE_COLOR);
  }

  function getSubjectColor(subject) {
    return normalizeSubjectColor(subjectColorDraftById[subject.id] || subject.color || DEFAULT_SUBJECT_COLOR);
  }

  function cardStyle(colorHex) {
    const safe = normalizeWorkspaceColor(colorHex);
    return {
      background: `linear-gradient(180deg, rgba(255, 255, 255, 0.98), ${safe}1F)`,
      borderColor: `${safe}38`,
      boxShadow: `0 20px 34px ${safe}18`
    };
  }

  function getTagColor(tagName) {
    return normalizeTopicTagColor(tagColorDraftByName[tagName] || tagColorByName[tagName] || DEFAULT_TOPIC_TAG_COLOR);
  }

  function getTagVisualStyle(tagName) {
    const palette = TAG_VISUAL_PALETTE[hashTagName(tagName) % TAG_VISUAL_PALETTE.length];
    return {
      backgroundColor: palette.bg,
      borderColor: palette.border,
      color: palette.text
    };
  }

  function renderActionGlyph(kind) {
    if (kind === "folder") {
      return (
        <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" focusable="false">
          <path d="M3 7.5a2 2 0 0 1 2-2h4l1.4 1.8H19a2 2 0 0 1 2 2v7.2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="currentColor" />
        </svg>
      );
    }
    if (kind === "document") {
      return (
        <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" focusable="false">
          <path d="M7 3.8h7l4 4v12.4a1.8 1.8 0 0 1-1.8 1.8H7a1.8 1.8 0 0 1-1.8-1.8V5.6A1.8 1.8 0 0 1 7 3.8z" fill="currentColor" />
          <path d="M14 3.8v4h4" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    }
    if (kind === "tag") {
      return (
        <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" focusable="false">
          <path d="M12.8 3.5H6A2.5 2.5 0 0 0 3.5 6v6.8a2.3 2.3 0 0 0 .7 1.7l5.3 5.3a2.4 2.4 0 0 0 3.4 0l6.9-6.9a2.4 2.4 0 0 0 0-3.4l-5.3-5.3a2.3 2.3 0 0 0-1.7-.7z" fill="currentColor" />
          <circle cx="7.9" cy="7.9" r="1.4" fill="#fff" />
        </svg>
      );
    }
    return (
      <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" focusable="false">
        <path d="M5 17.3V20h2.7l8-8-2.7-2.7z" fill="currentColor" />
        <path d="M17.6 6.4a1.7 1.7 0 0 1 2.4 0l.6.6a1.7 1.7 0 0 1 0 2.4l-1.3 1.3-3-3z" fill="currentColor" />
      </svg>
    );
  }

  const flattenedFolders = flattenFolders(folders);
  const folderLabels = buildFolderPathMap(folders);
  const effectiveFolderFilter = filterFolderId || activeFolderId;
  const selectedFolderLabel = folderLabels.get(activeFolderId) || "All folders";

  const filteredUploadedDocuments = filterDocuments(uploadedDocuments, {
    folderId: effectiveFolderFilter,
    tag: filterTag,
    text: filterText
  });

  const filteredGeneratedDocuments = filterDocuments(generatedDocuments, {
    folderId: effectiveFolderFilter,
    tag: filterTag,
    text: filterText
  });

  const showReviewCenter = workspaceTab === "review-center";
  const workspaceReviewQueue = (selectedWorkspace?.subjects || []).flatMap((subject) => {
    return (subject.documents || [])
      .filter((doc) => doc.sourceType !== "generated")
      .filter((doc) => String(doc.reviewStatus || "approved") !== "approved" || Boolean(doc.requiresReview))
      .map((doc) => ({
        ...doc,
        subjectId: subject.id,
        subjectName: subject.name
      }));
  });
  const effectiveReviewQueue = workspaceReviewQueue.length ? workspaceReviewQueue : fallbackReviewItems;

  const folderChildrenMap = buildFolderChildrenMap(flattenedFolders);
  const { documentsByFolder: uploadedDocumentsByFolder, unfiledDocuments: unfiledUploadedDocuments } = splitDocumentsByFolder(filteredUploadedDocuments);
  const { documentsByFolder: generatedDocumentsByFolder, unfiledDocuments: unfiledGeneratedDocuments } = splitDocumentsByFolder(filteredGeneratedDocuments);

  function formatUploadedAt(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }

  useEffect(() => {
    function handleWindowClick(event) {
      if (event.target.closest(".doc-inline-menu-wrap")) return;
      setWorkspaceActionMenuId("");
      setSubjectActionMenuId("");
      setFolderActionMenuId("");
      setDocActionMenuId("");
      setDocInfoMenuId("");
      setShowFolderActionMenu(false);
      setShowFilterMenu(false);
    }

    window.addEventListener("click", handleWindowClick);
    return () => window.removeEventListener("click", handleWindowClick);
  }, []);

  useEffect(() => {
    setCollapsedFolders((previous) => {
      const next = { ...previous };
      let changed = false;
      for (const folder of flattenedFolders) {
        if (!Object.prototype.hasOwnProperty.call(next, folder.id)) {
          next[folder.id] = true;
          changed = true;
        }
      }
      return changed ? next : previous;
    });

    setCollapsedFolderDocs((previous) => {
      const next = { ...previous };
      let changed = false;
      for (const folder of flattenedFolders) {
        for (const group of ["uploaded", "generated"]) {
          const key = `${folder.id}:${group}`;
          if (!Object.prototype.hasOwnProperty.call(next, key)) {
            next[key] = true;
            changed = true;
          }
        }
      }
      if (!Object.prototype.hasOwnProperty.call(next, "unfiled-generated")) {
        next["unfiled-generated"] = true;
        changed = true;
      }
      return changed ? next : previous;
    });
  }, [flattenedFolders]);

  useEffect(() => {
    if (!reviewCompareDoc) return;
    const entries = getCompareRiskEntries(reviewCompareDoc);
    if (!entries.length) return;

    const current = entries.find((entry) => entry.id === activeCompareRiskId);
    if (current) return;

    const frameId = window.requestAnimationFrame(() => {
      activateCompareRisk(reviewCompareDoc, entries[0]);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [reviewCompareDoc, activeCompareRiskId, reviewDraftByDocId]);

  useEffect(() => {
    let cancelled = false;

    async function loadTemplates() {
      let templates = readBlockTemplatesFromStorage();
      if (typeof onListDocumentBlockTemplates === "function") {
        try {
          const sharedTemplates = await onListDocumentBlockTemplates();
          if (Array.isArray(sharedTemplates) && sharedTemplates.length) {
            templates = sharedTemplates;
            writeBlockTemplatesToStorage(sharedTemplates);
          }
        } catch {
          // Keep local fallback templates when shared repository is not available.
        }
      }

      if (cancelled || !Array.isArray(templates) || !templates.length) return;
      setEditContentTemplates(templates);
      if (!templates.some((item) => item.id === editContentTemplateId)) {
        setEditContentTemplateId(templates[0].id);
        setEditContentTemplateCssDraft(String(templates[0].css || ""));
      }
    }

    loadTemplates();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const activeTemplate = editContentTemplates.find((item) => item.id === editContentTemplateId) || editContentTemplates[0];
    if (!activeTemplate) return;
    setEditContentTemplateCssDraft(String(activeTemplate.css || ""));
  }, [editContentTemplateId, editContentTemplates]);

  function clearFilters() {
    setFilterFolderId("");
    setFilterTag("");
    setFilterText("");
    setActiveFolderId("");
  }

  function toggleUploadFolder(folderId) {
    setUploadFolderIds((prev) => (prev.includes(folderId) ? prev.filter((id) => id !== folderId) : [...prev, folderId]));
  }

  function handleCreateSubject() {
    const name = subjectName.trim();
    if (!name) return;
    onCreateSubject(name);
    setSubjectName("");
    setShowAddSubject(false);
  }

  function handleStartRenameSubject(subject) {
    setRenameSubjectId(subject.id);
    setRenameSubjectName(subject.name);
    setSubjectActionMenuId("");
  }

  function handleSaveRenameSubject(subjectId) {
    const nextName = renameSubjectName.trim();
    if (!nextName) return;
    onRenameSubject(subjectId, nextName);
    setRenameSubjectId("");
    setRenameSubjectName("");
  }

  function handleAddFolder() {
    const name = folderName.trim();
    if (!name) return;
    onCreateFolder(name, parentFolderId);
    setFolderName("");
    setParentFolderId("");
    setShowFolderModal(false);
  }

  function handleAddTopicTag(event) {
    event.preventDefault();
    const tag = topicTagName.trim();
    if (!tag) return;
    onAddTopicTag(tag);
    setTopicTagName("");
  }

  async function handleUploadSubmit() {
    if (!pendingFiles.length) return;
    setUploadErrorMessage("");
    setUploadEmergencyMessage("");
    setUploadStatusMessage("");

    const pathToFolderId = new Map();
    for (const folder of flattenedFolders) {
      const pathLabel = folderLabels.get(folder.id);
      if (pathLabel) {
        pathToFolderId.set(pathLabel, folder.id);
      }
    }

    async function ensureFolderPath(pathLabel) {
      const normalizedPath = String(pathLabel || "").trim();
      if (!normalizedPath) return "";
      if (pathToFolderId.has(normalizedPath)) return pathToFolderId.get(normalizedPath);

      const segments = normalizedPath.split(" / ").map((item) => item.trim()).filter(Boolean);
      let currentPath = "";
      let parentFolderId = "";

      for (const segment of segments) {
        currentPath = currentPath ? `${currentPath} / ${segment}` : segment;
        if (pathToFolderId.has(currentPath)) {
          parentFolderId = pathToFolderId.get(currentPath) || "";
          continue;
        }

        const created = await onCreateFolder(segment, parentFolderId);
        if (created?.id) {
          pathToFolderId.set(currentPath, created.id);
          parentFolderId = created.id;
        }
      }

      return pathToFolderId.get(normalizedPath) || "";
    }

    const groupedByFolder = new Map();
    const plainFiles = [];

    for (const file of pendingFiles) {
      const relativePath = String(file.webkitRelativePath || "").trim();
      if (!relativePath.includes("/")) {
        plainFiles.push(file);
        continue;
      }

      const parts = relativePath.split("/").filter(Boolean);
      const folderParts = parts.slice(1, -1);
      if (!folderParts.length) {
        plainFiles.push(file);
        continue;
      }

      const folderPathLabel = folderParts.join(" / ");
      const folderId = await ensureFolderPath(folderPathLabel);
      const mapKey = folderId || "";
      const list = groupedByFolder.get(mapKey) || [];
      list.push(file);
      groupedByFolder.set(mapKey, list);
    }

    async function runUploadPass(strictMode) {
      const reports = [];
      const reviewAvailability = [];

      if (plainFiles.length) {
        const response = await onUploadTxt(plainFiles, {
          folderIds: uploadFolderIds,
          tags: uploadSelectedTags,
          quality: {
            strict: strictMode,
            minConfidence: 0.72
          }
        });
        if (Array.isArray(response?.uploadReport)) {
          reports.push(...response.uploadReport);
        }
        reviewAvailability.push(response?.reviewWorkflowAvailable !== false);
      }

      for (const [folderId, files] of groupedByFolder.entries()) {
        const response = await onUploadTxt(files, {
          folderIds: folderId ? [folderId] : uploadFolderIds,
          tags: uploadSelectedTags,
          quality: {
            strict: strictMode,
            minConfidence: 0.72
          }
        });
        if (Array.isArray(response?.uploadReport)) {
          reports.push(...response.uploadReport);
        }
        reviewAvailability.push(response?.reviewWorkflowAvailable !== false);
      }

      return {
        reports,
        reviewWorkflowAvailable: reviewAvailability.every(Boolean)
      };
    }

    try {
      let reports = [];
      let reviewWorkflowAvailable = true;
      try {
        const uploadPass = await runUploadPass(uploadStrictQualityGate);
        reports = uploadPass.reports;
        reviewWorkflowAvailable = uploadPass.reviewWorkflowAvailable;
      } catch (error) {
        if (uploadStrictQualityGate && error?.qualityReport) {
          // Fall back to non-blocking mode so risky docs can be triaged in Review Center.
          const uploadPass = await runUploadPass(false);
          reports = uploadPass.reports;
          reviewWorkflowAvailable = uploadPass.reviewWorkflowAvailable;
          setUploadStatusMessage("Uploaded with review required. Open Review Center to approve flagged documents.");
          setWorkspaceTab("review-center");
        } else {
          throw error;
        }
      }

      const flagged = reports.filter((item) => item?.requiresReview);
      if (flagged.length) {
        setUploadStatusMessage(`${flagged.length} file(s) were uploaded and sent to Review Center.`);
        setFallbackReviewItems(flagged.map((item, index) => ({
          id: item.documentId || `fallback-review-${Date.now()}-${index}`,
          name: item.name || `uploaded-file-${index + 1}`,
          subjectId: item.subjectId || selectedSubjectId,
          subjectName: selectedSubject?.name || "Current subject",
          reviewStatus: "needs_review",
          extractionConfidence: Number(item.confidence || 0),
          extractionMethod: String(item.method || ""),
          extractionIssues: Array.isArray(item.issues) ? item.issues : [],
          extractionRiskMarkers: Array.isArray(item.riskMarkers) ? item.riskMarkers : [],
          requiresReview: true,
          sourcePreview: String(item.sourcePreview || ""),
          sourceMimeType: String(item.sourceMimeType || ""),
          sourceContentBase64: String(item.sourceContentBase64 || ""),
          sourceRenderHtml: String(item.sourceRenderHtml || ""),
          canonicalVerification: item?.canonicalVerification && typeof item.canonicalVerification === "object"
            ? item.canonicalVerification
            : null,
          canonicalDocument: item?.canonicalDocument && typeof item.canonicalDocument === "object"
            ? item.canonicalDocument
            : null,
          content: String(item.extractedText || ""),
          sizeLabel: "",
          uploadedAt: ""
        })));
        const migrationWarning = reviewWorkflowAvailable
          ? ""
          : " Review tracking fields are not configured yet, so this comparison is shown in temporary mode.";
        setUploadEmergencyMessage(`Emergency alert: ${flagged.length} uploaded file(s) have conversion risk. Review before generating quizzes.${migrationWarning}`);
        setWorkspaceTab("review-center");
      } else {
        setFallbackReviewItems([]);
        setUploadStatusMessage(`Uploaded ${pendingFiles.length} file(s) successfully.`);
      }

      setPendingFiles([]);
      setUploadFolderIds([]);
      setUploadSelectedTags([]);
      setUploadTagDraft("");
      setShowUploadModal(false);
    } catch (error) {
      setUploadErrorMessage(String(error.message || error));
      return;
    }
  }

  function handleStartRenameWorkspace(workspace) {
    setRenameWorkspaceId(workspace.id);
    setRenameWorkspaceName(workspace.name);
  }

  function handleSaveRenameWorkspace(workspaceId) {
    const nextName = renameWorkspaceName.trim();
    if (!nextName) return;
    onRenameWorkspace(workspaceId, nextName);
    setRenameWorkspaceId("");
    setRenameWorkspaceName("");
  }

  function handleStartRenameFolder(folder) {
    setRenameFolderId(folder.id);
    setRenameFolderName(folder.name);
  }

  function handleSaveRenameFolder(folderId) {
    const nextName = renameFolderName.trim();
    if (!nextName) return;
    onRenameFolder(folderId, nextName);
    setRenameFolderId("");
    setRenameFolderName("");
  }

  function handleRemoveFolder(folderId) {
    if (!window.confirm("Remove this folder? Documents remain and only lose folder assignments.")) return;
    onRemoveFolder(folderId);
    setUploadFolderIds((prev) => prev.filter((id) => id !== folderId));
    if (activeFolderId === folderId) setActiveFolderId("");
    if (filterFolderId === folderId) setFilterFolderId("");
  }

  function handleStartRenameTopicTag(tag) {
    setRenameTopicTagFrom(tag.name);
    setRenameTopicTagTo(tag.name);
  }

  function handleSaveRenameTopicTag() {
    const nextTag = renameTopicTagTo.trim();
    if (!renameTopicTagFrom || !nextTag) return;
    onRenameTopicTag(renameTopicTagFrom, nextTag);
    setRenameTopicTagFrom("");
    setRenameTopicTagTo("");
  }

  function handleRemoveTopicTag(tag) {
    if (!window.confirm("Remove this topic tag from this subject and linked docs?")) return;
    onRemoveTopicTag(tag.name);
  }

  function handleStartRenameDoc(doc) {
    setRenameDocId(doc.id);
    setRenameDocName(doc.name);
  }

  function handleSaveRenameDoc(documentId) {
    const nextName = renameDocName.trim();
    if (!nextName) return;
    onRenameDocument(documentId, nextName);
    setRenameDocId("");
    setRenameDocName("");
  }

  function handleRemoveDoc(documentId) {
    if (!window.confirm("Remove this document?")) return;
    onRemoveDocument(documentId);
    if (previewDoc?.id === documentId) setPreviewDoc(null);
  }

  function toggleFolderCollapsed(folderId) {
    setCollapsedFolders((prev) => ({ ...prev, [folderId]: !prev[folderId] }));
  }

  function toggleFolderDocsCollapsed(folderId) {
    setCollapsedFolderDocs((prev) => ({ ...prev, [folderId]: !prev[folderId] }));
  }

  async function handleDownloadGeneratedDocument(doc, formatOverride = "") {
    try {
      const response = await fetch(WORKSPACES_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "downloadGeneratedDocument",
          payload: {
            documentId: doc.id,
            format: formatOverride || "txt"
          }
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Download failed");
      }

      downloadBase64File(data.download.contentBase64, data.download.fileName, data.download.mimeType);
    } catch (error) {
      window.alert(String(error.message || error));
    }
  }

  async function handleDownloadUploadedDocument(doc, format = "original") {
    try {
      const response = await fetch(WORKSPACES_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "downloadUploadedDocument",
          payload: {
            documentId: doc.id,
            format
          }
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Download failed");
      }

      downloadBase64File(data.download.contentBase64, data.download.fileName, data.download.mimeType);
    } catch (error) {
      window.alert(String(error.message || error));
    }
  }

  async function loadUploadedPreviewMode(documentId, format) {
    const docId = String(documentId || "").trim();
    const targetFormat = String(format || "").trim().toLowerCase();
    if (!docId || !targetFormat || targetFormat === "txt" || targetFormat === "original") return;
    if (previewDownloads[targetFormat]) return;

    setPreviewLoadingMode(targetFormat);
    setPreviewError("");
    try {
      const response = await fetch(WORKSPACES_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "downloadUploadedDocument",
          payload: {
            documentId: docId,
            format: targetFormat
          }
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Preview load failed");
      }

      const decoded = decodeBase64Utf8(data?.download?.contentBase64 || "");
      setPreviewDownloads((previous) => ({
        ...previous,
        [targetFormat]: {
          content: decoded,
          mimeType: String(data?.download?.mimeType || ""),
          fileName: String(data?.download?.fileName || "")
        }
      }));
    } catch (error) {
      setPreviewError(String(error.message || error));
    } finally {
      setPreviewLoadingMode("");
    }
  }

  function renderGeneratedDownloadControls(doc) {
    if (doc.sourceType !== "generated") return null;
    return (
      <button className="table-btn" type="button" onClick={() => setDownloadPickerDoc(doc)} disabled={isWorking}>
        Download
      </button>
    );
  }

  function getUploadedDownloadFormats() {
    return ["original", "html", "markdown"];
  }

  function renderUploadedDownloadControl(doc, options = {}) {
    if (doc.sourceType === "generated") return null;
    return (
      <button className={options.compact ? "table-btn icon-btn" : "table-btn"} type="button" onClick={() => setDownloadPickerDoc(doc)} disabled={isWorking}>
        Download
      </button>
    );
  }

  function renderInlineDocumentRow(doc, rowKey) {
    const actionOpen = docActionMenuId === doc.id;
    const infoOpen = docInfoMenuId === doc.id;
    const rowTone = doc.sourceType === "generated" ? "generated" : "uploaded";
    const isPendingReview = doc.sourceType !== "generated" && (String(doc.reviewStatus || "approved") !== "approved" || Boolean(doc.requiresReview));
    const riskMarkers = Array.isArray(doc.extractionRiskMarkers) ? doc.extractionRiskMarkers : [];
    const formulaLossSuspected = Boolean(
      (Array.isArray(doc.extractionIssues) ? doc.extractionIssues : []).includes("docx-formula-omitted-risk-needs-verification") ||
      riskMarkers.some((marker) => String(marker?.type || "") === "formula-loss-suspected")
    );
    const rowIcon = doc.sourceType === "generated" ? "🤖" : "📄";
    const uploadLabel = formatUploadedAt(doc.uploadedAt);

    return (
      <div className={`doc-inline-row ${rowTone}`} key={rowKey}>
        <div className="doc-inline-head">
          <div className="doc-inline-title">
            <span className="row-icon-badge">{rowIcon}</span>
            <span>{doc.name}</span>
            {isPendingReview ? <span className="scope-chip" style={{ backgroundColor: "#fff1c9", borderColor: "#efb545", color: "#6b4b00" }}>⚠️ Review</span> : null}
            {formulaLossSuspected ? <span className="scope-chip" style={{ backgroundColor: "#ffdce6", borderColor: "#e58aab", color: "#7f2643" }}>Formula Loss Suspected</span> : null}
          </div>

          <div className="inline-actions doc-inline-right" onClick={(event) => event.stopPropagation()}>
            <div className="doc-inline-menu-wrap">
              <button
                className="table-btn icon-btn doc-info-btn"
                type="button"
                onClick={() => {
                  setDocInfoMenuId((previous) => (previous === doc.id ? "" : doc.id));
                  setDocActionMenuId("");
                }}
                aria-label="Document info"
              >
                ℹ️
              </button>
              {infoOpen ? (
                <div className="row-menu doc-info-menu">
                  <p className="hint doc-info-line">{doc.sizeLabel}{uploadLabel ? ` · Uploaded ${uploadLabel}` : ""}</p>
                  {(doc.tags || []).length ? (
                    <div className="chip-wrap doc-info-tags">
                      {(doc.tags || []).map((tag) => (
                        <span className="scope-chip doc-tag-chip" key={`${doc.id}-${tag}`} style={getTagVisualStyle(tag)}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="hint doc-info-line">No tags</p>
                  )}
                </div>
              ) : null}
            </div>

            <div className="doc-inline-menu-wrap">
              <button
                className="table-btn icon-btn"
                type="button"
                onClick={() => {
                  setDocActionMenuId((previous) => (previous === doc.id ? "" : doc.id));
                  setDocInfoMenuId("");
                }}
              >
                ...
              </button>
              {actionOpen ? (
                <div className="row-menu">
                  <button className="table-btn" type="button" onClick={() => handleOpenPreview(doc)}>Preview</button>
                  {isPendingReview ? <button className="table-btn" type="button" onClick={() => openDocumentReviewFromFolder(doc)}>Open In Review Center</button> : null}
                  {doc.sourceType === "generated" ? renderGeneratedDownloadControls(doc) : renderUploadedDownloadControl(doc)}
                  <button className="table-btn" type="button" onClick={() => handleStartRenameDoc(doc)}>Rename</button>
                  <button className="table-btn" type="button" onClick={() => handleStartEditDocMeta(doc)}>Edit</button>
                  {doc.sourceType !== "generated" ? <button className="table-btn" type="button" onClick={() => handleStartEditContent(doc)}>Edit Content</button> : null}
                  <button className="table-btn danger" type="button" onClick={() => handleRemoveDoc(doc.id)}>Delete</button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderFolderActionMenu(folder) {
    const open = folderActionMenuId === folder.id;
    return (
      <div className="doc-inline-menu-wrap">
        <button
          className="table-btn icon-btn"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setFolderActionMenuId((previous) => (previous === folder.id ? "" : folder.id));
          }}
          disabled={isWorking}
        >
          ...
        </button>
        {open ? (
          <div className="row-menu">
            <button className="table-btn" type="button" onClick={() => handleStartRenameFolder(folder)} disabled={isWorking}>Edit</button>
            <button className="table-btn danger" type="button" onClick={() => handleRemoveFolder(folder.id)} disabled={isWorking}>Delete</button>
          </div>
        ) : null}
      </div>
    );
  }

  function renderWorkspaceActionMenu(workspace) {
    const open = workspaceActionMenuId === workspace.id;
    return (
      <div className="doc-inline-menu-wrap">
        <button
          className="table-btn icon-btn emoji-menu-btn"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setWorkspaceActionMenuId((previous) => (previous === workspace.id ? "" : workspace.id));
          }}
        >
          🛠️
        </button>
        {open ? (
          <div className="row-menu">
            <button
              className="table-btn"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setWorkspaceEditId(workspace.id);
                setWorkspaceActionMenuId("");
              }}
            >
              Edit
            </button>
            <button className="table-btn danger" type="button" onClick={() => onRemoveWorkspace(workspace.id)} disabled={isWorking}>Delete</button>
          </div>
        ) : null}
      </div>
    );
  }

  function renderSubjectActionMenu(subject) {
    const open = subjectActionMenuId === subject.id;
    return (
      <div className="doc-inline-menu-wrap" onClick={(event) => event.stopPropagation()}>
        <button
          className="table-btn icon-btn emoji-menu-btn"
          type="button"
          onClick={() => setSubjectActionMenuId((previous) => (previous === subject.id ? "" : subject.id))}
          disabled={isWorking}
        >
          🛠️
        </button>
        {open ? (
          <div className="row-menu">
            <button className="table-btn" type="button" onClick={() => handleStartRenameSubject(subject)} disabled={isWorking}>Edit</button>
            <button className="table-btn danger" type="button" onClick={() => onRemoveSubject(subject.id)} disabled={isWorking}>Delete</button>
          </div>
        ) : null}
      </div>
    );
  }

  function renderFolderNode(folder, depth) {
    const childFolders = folderChildrenMap.get(folder.id) || [];
    const uploadedFolderDocs = uploadedDocumentsByFolder.get(folder.id) || [];
    const generatedFolderDocs = generatedDocumentsByFolder.get(folder.id) || [];
    const isCollapsed = Boolean(collapsedFolders[folder.id]);
    const hasTreeToggle = childFolders.length > 0 || uploadedFolderDocs.length > 0 || generatedFolderDocs.length > 0;

    const hasPendingAlert = pendingFolderIds.has(folder.id);

    return (
      <div key={folder.id} className="folder-indent-wrap" style={{ marginLeft: `${depth * 18}px` }}>
        <div className={activeFolderId === folder.id ? "folder-node on" : "folder-node"}>
          {renameFolderId === folder.id ? (
            <div className="inline-actions">
              <input
                className="input"
                value={renameFolderName}
                onChange={(event) => setRenameFolderName(event.target.value)}
                disabled={isWorking}
              />
              <button className="table-btn" type="button" onClick={() => handleSaveRenameFolder(folder.id)} disabled={isWorking}>Save</button>
              <button className="table-btn" type="button" onClick={() => setRenameFolderId("")} disabled={isWorking}>Cancel</button>
            </div>
          ) : (
            <>
              <div className="folder-node-head">
                <div className="folder-node-title">
                  {hasTreeToggle ? (
                    <button className="tree-toggle" type="button" onClick={() => toggleFolderCollapsed(folder.id)} disabled={isWorking}>
                      {isCollapsed ? "+" : "-"}
                    </button>
                  ) : <span className="tree-toggle-empty" />}
                  <button className="folder-node-main" type="button" onClick={() => setActiveFolderId(folder.id)} disabled={isWorking}>
                    <span className="row-icon-badge">📁</span> {folder.name} {hasPendingAlert ? <span aria-label="pending review" title="Contains documents pending review">⚠️</span> : null}
                  </button>
                </div>
                <div className="inline-actions">
                  {renderFolderActionMenu(folder)}
                </div>
              </div>

              {!isCollapsed ? (
                <div className="folder-children-wrap">
                  {workspaceTab !== "generated" ? renderFolderDocumentGroup(folder.id, "uploaded", "Uploaded Documents", uploadedFolderDocs, `${folder.id}:uploaded`) : null}
                  {workspaceTab !== "files" ? renderFolderDocumentGroup(folder.id, "generated", "Generated Documents", generatedFolderDocs, `${folder.id}:generated`) : null}

                  {childFolders.map((child) => renderFolderNode(child, depth + 1))}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    );
  }

  function renderFolderDocumentGroup(folderId, kind, label, docs, collapseKey) {
    if (!docs.length) return null;
    const isCollapsed = Boolean(collapsedFolderDocs[collapseKey]);
    const icon = kind === "generated" ? "🤖" : "📄";
    const headingClass = kind === "generated" ? "doc-group-toggle generated" : "doc-group-toggle uploaded";
    return (
      <div className={`folder-docs-block ${kind}`}>
        <button className={headingClass} type="button" onClick={() => toggleFolderDocsCollapsed(collapseKey)}>
          <span className="doc-group-toggle-icon" aria-hidden="true">{isCollapsed ? "➕" : "➖"}</span>
          <strong>{icon} {label}</strong>
          <span className="doc-group-count">({docs.length})</span>
        </button>
        {!isCollapsed ? (
          <div className="folder-docs-list">
            {docs.map((doc) => renderInlineDocumentRow(doc, `${folderId}-${doc.id}-${collapseKey}`))}
          </div>
        ) : null}
      </div>
    );
  }

  function handleStartEditDocMeta(doc) {
    const folderIds = getDocumentFolderIds(doc);
    setEditDocMeta(doc);
    setEditDocFolderIds(folderIds);
    setEditDocSelectedTags(doc.tags || []);
    setEditDocTagDraft("");
  }

  function toggleEditDocFolder(folderId) {
    setEditDocFolderIds((prev) => (prev.includes(folderId) ? prev.filter((id) => id !== folderId) : [...prev, folderId]));
  }

  function handleSaveDocMeta() {
    if (!editDocMeta) return;
    onUpdateDocumentMeta(editDocMeta.id, {
      folderIds: editDocFolderIds,
      tags: editDocSelectedTags
    });
    setEditDocMeta(null);
    setEditDocFolderIds([]);
    setEditDocSelectedTags([]);
    setEditDocTagDraft("");
  }

  function syncEditContentDraftFromEditor() {
    const editor = editContentEditorRef.current;
    if (!editor) return;
    editContentWorkingHtmlRef.current = String(editor.innerHTML || "");
  }

  function activeBlockTemplate() {
    return editContentTemplates.find((item) => item.id === editContentTemplateId) || editContentTemplates[0] || DEFAULT_BLOCK_TEMPLATES[0];
  }

  function syncBlocksFromHtml(htmlSource = "") {
    const nextBlocks = htmlToBlocks(htmlSource);
    setEditContentBlocks(nextBlocks);
  }

  function syncHtmlFromBlocks(blocksOverride = null) {
    const blocks = Array.isArray(blocksOverride) ? blocksOverride : editContentBlocks;
    const html = blocksToHtml(blocks, activeBlockTemplate());
    setEditContentHtmlDraft(html);
    editContentWorkingHtmlRef.current = html;
    return html;
  }

  function changeBlockTemplate(nextTemplateId = "") {
    const nextId = String(nextTemplateId || "").trim();
    if (!nextId) return;
    setEditContentTemplateId(nextId);
    window.requestAnimationFrame(() => {
      syncHtmlFromBlocks();
    });
  }

  function updateTemplateCssDraft(nextCss = "") {
    setEditContentTemplateCssDraft(String(nextCss || ""));
  }

  async function applyTemplateCssDraft() {
    const nextTemplates = editContentTemplates.map((item) => (item.id === editContentTemplateId ? {
      ...item,
      css: String(editContentTemplateCssDraft || "")
    } : item));

    let syncedWithServer = false;

    if (typeof onSaveDocumentBlockTemplate === "function") {
      const active = nextTemplates.find((item) => item.id === editContentTemplateId);
      if (active) {
        try {
          const saved = await onSaveDocumentBlockTemplate(active);
          if (Array.isArray(saved?.templates) && saved.templates.length) {
            setEditContentTemplates(saved.templates);
            writeBlockTemplatesToStorage(saved.templates);
            syncedWithServer = true;
          }
        } catch {
          // Keep local update when shared save fails.
        }
      }
    }

    if (!syncedWithServer) {
      setEditContentTemplates(nextTemplates);
      writeBlockTemplatesToStorage(nextTemplates);
    }
    setEditContentStatusMessage("Template CSS updated.");
    syncHtmlFromBlocks();
  }

  async function saveCurrentTemplateAsNew() {
    const name = window.prompt("Template name", "My Template");
    const nextName = String(name || "").trim();
    if (!nextName) return;
    const source = activeBlockTemplate();
    const nextTemplate = {
      ...source,
      id: `template_${Date.now().toString(36)}`,
      name: nextName,
      css: String(editContentTemplateCssDraft || source?.css || "")
    };
    const nextTemplates = [...editContentTemplates, nextTemplate];

    if (typeof onSaveDocumentBlockTemplate === "function") {
      try {
        const saved = await onSaveDocumentBlockTemplate(nextTemplate);
        if (Array.isArray(saved?.templates) && saved.templates.length) {
          setEditContentTemplates(saved.templates);
          const savedId = String(saved?.template?.id || "").trim();
          setEditContentTemplateId(savedId || nextTemplate.id);
          writeBlockTemplatesToStorage(saved.templates);
          setEditContentStatusMessage(`Saved template: ${nextName}`);
          return;
        }
      } catch {
        // Fallback to local repository.
      }
    }

    setEditContentTemplates(nextTemplates);
    setEditContentTemplateId(nextTemplate.id);
    writeBlockTemplatesToStorage(nextTemplates);
    setEditContentStatusMessage(`Saved template: ${nextName}`);
  }

  async function deleteCurrentTemplate() {
    const active = activeBlockTemplate();
    if (!active?.id) return;
    if (editContentTemplates.length <= 1) {
      setEditContentStatusMessage("At least one template is required.");
      return;
    }

    const confirmed = window.confirm(`Delete template \"${active.name || "Untitled"}\"?`);
    if (!confirmed) return;

    if (typeof onDeleteDocumentBlockTemplate === "function") {
      try {
        const templates = await onDeleteDocumentBlockTemplate(active.id);
        if (Array.isArray(templates) && templates.length) {
          setEditContentTemplates(templates);
          setEditContentTemplateId(String(templates[0].id || DEFAULT_BLOCK_TEMPLATES[0].id));
          writeBlockTemplatesToStorage(templates);
          setEditContentStatusMessage("Template deleted.");
          return;
        }
      } catch {
        // Fallback to local delete.
      }
    }

    const nextTemplates = editContentTemplates.filter((item) => item.id !== active.id);
    setEditContentTemplates(nextTemplates);
    setEditContentTemplateId(String(nextTemplates[0]?.id || DEFAULT_BLOCK_TEMPLATES[0].id));
    writeBlockTemplatesToStorage(nextTemplates);
    setEditContentStatusMessage("Template deleted.");
  }

  function addContentBlock(type = "paragraph", afterIndex = null) {
    const nextBlock = createDefaultBlock(type);
    setEditContentBlocks((previous) => {
      const list = Array.isArray(previous) ? [...previous] : [];
      const insertAt = Number.isInteger(afterIndex) ? Math.min(list.length, Math.max(0, afterIndex + 1)) : list.length;
      list.splice(insertAt, 0, nextBlock);
      window.requestAnimationFrame(() => {
        syncHtmlFromBlocks(list);
      });
      return list;
    });
  }

  function updateContentBlock(blockId, patch = {}) {
    const key = String(blockId || "");
    if (!key) return;
    setEditContentBlocks((previous) => {
      const list = (Array.isArray(previous) ? previous : []).map((block) => (block.id === key ? { ...block, ...patch } : block));
      window.requestAnimationFrame(() => {
        syncHtmlFromBlocks(list);
      });
      return list;
    });
  }

  function changeContentBlockType(blockId, nextType) {
    const key = String(blockId || "");
    const targetType = String(nextType || "paragraph");
    if (!key) return;
    setEditContentBlocks((previous) => {
      const list = Array.isArray(previous) ? [...previous] : [];
      const index = list.findIndex((block) => block.id === key);
      if (index < 0) return previous;
      const replacement = createDefaultBlock(targetType);
      replacement.id = key;
      list[index] = replacement;
      window.requestAnimationFrame(() => {
        syncHtmlFromBlocks(list);
      });
      return list;
    });
  }

  function moveContentBlock(fromIndex, toIndex) {
    if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return;
    if (fromIndex === toIndex) return;
    setEditContentBlocks((previous) => {
      const list = Array.isArray(previous) ? [...previous] : [];
      if (fromIndex < 0 || fromIndex >= list.length) return previous;
      if (toIndex < 0 || toIndex >= list.length) return previous;
      const [moved] = list.splice(fromIndex, 1);
      list.splice(toIndex, 0, moved);
      window.requestAnimationFrame(() => {
        syncHtmlFromBlocks(list);
      });
      return list;
    });
  }

  function removeContentBlock(blockId) {
    const key = String(blockId || "");
    if (!key) return;
    setEditContentBlocks((previous) => {
      const list = (Array.isArray(previous) ? previous : []).filter((block) => block.id !== key);
      const normalized = list.length ? list : [createDefaultBlock("paragraph")];
      window.requestAnimationFrame(() => {
        syncHtmlFromBlocks(normalized);
      });
      return normalized;
    });
  }

  function exportContentBlocksJson() {
    const payload = {
      schemaVersion: "block-editor-v1",
      templateId: editContentTemplateId,
      blocks: editContentBlocks
    };
    downloadTextFile(JSON.stringify(payload, null, 2), `${String(editContentDoc?.name || "document")}.blocks.json`, "application/json");
  }

  function getEditContentSelectionCell() {
    const editor = editContentEditorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return null;
    let node = selection.getRangeAt(0).startContainer;
    if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
    if (!(node instanceof HTMLElement)) return null;
    const cell = node.closest("td,th");
    if (!cell || !editor.contains(cell)) return null;
    const row = cell.parentElement;
    const table = row?.closest("table");
    if (!row || !table) return null;
    const columnIndex = Array.from(row.children).indexOf(cell);
    const rowIndex = Array.from(table.querySelectorAll("tr")).indexOf(row);
    return { cell, row, table, columnIndex, rowIndex };
  }

  function addTableToEditContent() {
    const rows = Number(window.prompt("Number of rows", "3") || 0);
    const columns = Number(window.prompt("Number of columns", "3") || 0);
    if (!rows || !columns || rows < 1 || columns < 1) return;

    const rowHtml = "<tr>" + new Array(columns).fill("<td>Cell</td>").join("") + "</tr>";
    const tableHtml = `<table><tbody>${new Array(rows).fill(rowHtml).join("")}</tbody></table><p></p>`;
    runEditContentCommand("insertHTML", tableHtml);
    syncEditContentDraftFromEditor();
  }

  function addTableRowInEditContent(after = true) {
    const hit = getEditContentSelectionCell();
    if (!hit) return;
    const sourceCells = Array.from(hit.row.children);
    const nextRow = document.createElement("tr");
    sourceCells.forEach((sourceCell) => {
      const tagName = sourceCell.tagName.toLowerCase() === "th" ? "th" : "td";
      const cell = document.createElement(tagName);
      cell.innerHTML = "&nbsp;";
      nextRow.appendChild(cell);
    });
    if (after) {
      hit.row.insertAdjacentElement("afterend", nextRow);
    } else {
      hit.row.insertAdjacentElement("beforebegin", nextRow);
    }
    syncEditContentDraftFromEditor();
  }

  function deleteTableRowInEditContent() {
    const hit = getEditContentSelectionCell();
    if (!hit) return;
    const rows = hit.table.querySelectorAll("tr");
    if (rows.length <= 1) return;
    hit.row.remove();
    syncEditContentDraftFromEditor();
  }

  function addTableColumnInEditContent(after = true) {
    const hit = getEditContentSelectionCell();
    if (!hit) return;
    const rows = Array.from(hit.table.querySelectorAll("tr"));
    rows.forEach((row) => {
      const cells = Array.from(row.children);
      const source = cells[hit.columnIndex] || cells[cells.length - 1];
      const tagName = source?.tagName?.toLowerCase() === "th" ? "th" : "td";
      const cell = document.createElement(tagName);
      cell.innerHTML = "&nbsp;";
      const target = cells[hit.columnIndex];
      if (!target) {
        row.appendChild(cell);
      } else if (after) {
        target.insertAdjacentElement("afterend", cell);
      } else {
        target.insertAdjacentElement("beforebegin", cell);
      }
    });
    syncEditContentDraftFromEditor();
  }

  function deleteTableColumnInEditContent() {
    const hit = getEditContentSelectionCell();
    if (!hit) return;
    const rows = Array.from(hit.table.querySelectorAll("tr"));
    const maxCols = Math.max(...rows.map((row) => row.children.length));
    if (maxCols <= 1) return;
    rows.forEach((row) => {
      const target = row.children[hit.columnIndex];
      if (target) target.remove();
    });
    syncEditContentDraftFromEditor();
  }

  async function handleStartEditContent(doc) {
    if (!doc || doc.sourceType === "generated") return;
    setIsPreparingEditContent(true);
    setEditContentStatusMessage("");
    const seededHtml = String(doc.sourceRenderHtml || "").trim() || markdownToBasicHtml(String(doc.content || ""));
    setEditContentDoc(doc);
    setEditContentHtmlDraft(seededHtml);
    editContentWorkingHtmlRef.current = seededHtml;
    if (Array.isArray(doc.contentBlocksJson) && doc.contentBlocksJson.length) {
      setEditContentBlocks(doc.contentBlocksJson);
    } else {
      syncBlocksFromHtml(seededHtml);
    }
    if (String(doc.contentTemplateId || "").trim()) {
      setEditContentTemplateId(String(doc.contentTemplateId || ""));
    }
    try {
      const response = await fetch(WORKSPACES_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "downloadUploadedDocument",
          payload: {
            documentId: doc.id,
            format: "editable-html"
          }
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Unable to prepare image-rich editor content.");
      }
      const fullHtml = decodeBase64Utf8(data?.download?.contentBase64 || "");
      const editableHtml = extractEditableBodyHtml(fullHtml);
      if (editableHtml.trim()) {
        setEditContentHtmlDraft(editableHtml);
        editContentWorkingHtmlRef.current = editableHtml;
        syncBlocksFromHtml(editableHtml);
      }
    } catch {
      setEditContentStatusMessage("Opened editor with fallback HTML. Some original image links may need to be reinserted.");
    } finally {
      setIsPreparingEditContent(false);
    }
  }

  function runEditContentCommand(command, value = null) {
    const editor = editContentEditorRef.current;
    if (!editor) return;
    editor.focus();
    try {
      document.execCommand(command, false, value);
      syncEditContentDraftFromEditor();
    } catch {
      // Ignore unsupported commands to keep the editor responsive.
    }
  }

  function applyEditContentHeading(level = 2) {
    const normalized = Math.min(6, Math.max(1, Number(level || 2)));
    runEditContentCommand("formatBlock", `<h${normalized}>`);
  }

  function applyEditContentFontFamily(nextFamily = "") {
    const family = String(nextFamily || "").trim();
    if (!family) return;
    setEditContentFontFamily(family);
    runEditContentCommand("fontName", family);
  }

  function applyEditContentFontSize(nextSize = "") {
    const parsed = Number(nextSize || 16);
    const sizePx = Number.isFinite(parsed) ? Math.max(10, Math.min(64, Math.round(parsed))) : 16;
    setEditContentFontSize(String(sizePx));
    const editor = editContentEditorRef.current;
    if (!editor) return;
    editor.focus();
    try {
      document.execCommand("styleWithCSS", false, true);
      document.execCommand("fontSize", false, "7");
      const nodes = editor.querySelectorAll("font[size='7']");
      nodes.forEach((node) => {
        node.removeAttribute("size");
        node.style.fontSize = `${sizePx}px`;
      });
      syncEditContentDraftFromEditor();
    } catch {
      // Ignore unsupported commands to keep the editor responsive.
    }
  }

  function insertEditContentLatex(displayMode = false) {
    const wrapper = displayMode ? "$$\n\\placeholder\n$$" : "$\\placeholder$";
    runEditContentCommand("insertText", wrapper);
  }

  function insertEditContentImage() {
    const imageUrl = window.prompt("Paste image URL or data URL");
    const nextUrl = String(imageUrl || "").trim();
    if (!nextUrl) return;
    runEditContentCommand("insertImage", nextUrl);
  }

  function openEditContentImageFilePicker() {
    editContentImageInputRef.current?.click();
  }

  function handleEditContentImageFileChange(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    if (!String(file.type || "").toLowerCase().startsWith("image/")) {
      setEditContentStatusMessage("Selected file is not an image.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (dataUrl) {
        runEditContentCommand("insertImage", dataUrl);
        setEditContentStatusMessage("Inserted image from file.");
      }
      event.target.value = "";
    };
    reader.onerror = () => {
      setEditContentStatusMessage("Failed to read image file.");
      event.target.value = "";
    };
    reader.readAsDataURL(file);
  }

  function setEditContentTextColor(nextColor = "") {
    const color = String(nextColor || "").trim();
    if (!color) return;
    setEditContentTextColorValue(color);
    runEditContentCommand("foreColor", color);
  }

  function setEditContentBackgroundColor(nextColor = "") {
    const color = String(nextColor || "").trim();
    if (!color) return;
    setEditContentBackgroundColorValue(color);
    runEditContentCommand("hiliteColor", color);
  }

  async function persistEditedContent(options = {}) {
    if (!editContentDoc?.id || !onUpdateDocumentContent) return;
    const editedHtml = editContentMode === "blocks"
      ? syncHtmlFromBlocks()
      : (editContentEditorRef.current
        ? String(editContentEditorRef.current.innerHTML || "")
        : String(editContentWorkingHtmlRef.current || editContentHtmlDraft || ""));
    const correctedHtml = stripRiskMarkupFromHtml(editedHtml).trim();
    const correctedContent = htmlToPlainText(correctedHtml);
    if (!correctedHtml || !correctedContent) {
      setEditContentStatusMessage("Edited HTML cannot be empty.");
      return null;
    }

    setIsSavingEditContent(true);
    setEditContentStatusMessage("");
    try {
      await onUpdateDocumentContent(editContentDoc.id, {
        correctedHtml,
        correctedContent,
        contentTemplateId: String(editContentTemplateId || ""),
        contentBlocksJson: editContentBlocks,
        contentBlocksSchemaVersion: "block-editor-v1"
      });
      if (previewDoc?.id === editContentDoc.id) {
        setPreviewDoc((previous) => previous ? {
          ...previous,
          content: correctedContent,
          sourceRenderHtml: correctedHtml,
          contentTemplateId: String(editContentTemplateId || ""),
          contentBlocksJson: editContentBlocks,
          contentBlocksSchemaVersion: "block-editor-v1"
        } : previous);
      }
      if (reviewCompareDoc?.id === editContentDoc.id) {
        setReviewCompareDoc((previous) => previous ? {
          ...previous,
          content: correctedContent,
          sourceRenderHtml: correctedHtml,
          contentTemplateId: String(editContentTemplateId || ""),
          contentBlocksJson: editContentBlocks,
          contentBlocksSchemaVersion: "block-editor-v1"
        } : previous);
      }
      const closeOnSuccess = options?.closeOnSuccess !== false;
      if (closeOnSuccess) {
        setEditContentDoc(null);
        setEditContentHtmlDraft("");
        setEditContentBlocks([]);
        editContentWorkingHtmlRef.current = "";
      }
      return {
        documentId: editContentDoc.id,
        correctedHtml,
        correctedContent
      };
    } catch (error) {
      setEditContentStatusMessage(String(error.message || error));
      return null;
    } finally {
      setIsSavingEditContent(false);
    }
  }

  async function handleSaveEditedContent() {
    const saved = await persistEditedContent({ closeOnSuccess: true });
    if (saved) {
      setEditContentStatusMessage("Saved all edits.");
    }
  }

  async function handleDownloadEditedContentHtml() {
    if (!editContentDoc?.id) return;
    const saved = await persistEditedContent({ closeOnSuccess: false });
    if (!saved) return;

    try {
      const response = await fetch(WORKSPACES_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "downloadUploadedDocument",
          payload: {
            documentId: editContentDoc.id,
            format: "html"
          }
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Download failed");
      }

      downloadBase64File(data.download.contentBase64, data.download.fileName, data.download.mimeType);
      setEditContentStatusMessage("Downloaded HTML with latest saved edits.");
    } catch (error) {
      setEditContentStatusMessage(String(error.message || error));
    }
  }

  function addTagToSelection(rawValue, setter) {
    const nextTag = normalizeTagName(rawValue);
    if (!nextTag) return;
    setter((prev) => (prev.includes(nextTag) ? prev : [...prev, nextTag]));
  }

  function removeTagFromSelection(tagName, setter) {
    setter((prev) => prev.filter((item) => item !== tagName));
  }

  async function handleOpenPreview(doc) {
    setPreviewMode("txt");
    setPreviewDownloads({});
    setPreviewLoadingMode("");
    setPreviewError("");

    if (!doc || doc.sourceType === "generated" || !doc.sourceContentBase64 || !onReprocessDocument) {
      setPreviewDoc(doc);
      return;
    }

    try {
      const refreshed = await onReprocessDocument(doc.id, { subjectId: selectedSubjectId, minConfidence: 0.72 });
      setPreviewDoc(refreshed?.document ? { ...doc, ...refreshed.document } : doc);
    } catch {
      setPreviewDoc(doc);
    }
  }

  function getPreviewModeOptions(doc) {
    if (!doc) return ["txt"];
    if (doc.sourceType === "generated") return ["txt"];
    return ["txt", "markdown", "html"];
  }

  function getPreviewModeLabel(mode) {
    const key = String(mode || "").toLowerCase();
    if (key === "markdown") return "Markdown";
    if (key === "html") return "HTML";
    return "Text";
  }

  async function handleReviewDecision(reviewItem, decision) {
    if (!onReviewDocumentExtraction || !reviewItem?.id || !reviewItem?.subjectId) return;
    const correctedContent = String(reviewDraftByDocId[reviewItem.id] || "").trim();
    const correctedHtml = String(reviewHtmlDraftByDocId[reviewItem.id] || "").trim();

    setReviewStatusMessage("");
    setReviewingDocumentId(reviewItem.id);
    try {
      await onReviewDocumentExtraction(reviewItem.id, {
        subjectId: reviewItem.subjectId,
        decision,
        correctedContent,
        correctedHtml
      });
      setFallbackReviewItems((previous) => {
        if (!previous.length) return previous;
        if (decision === "needs_review") {
          return previous;
        }
        return previous.filter((item) => item.id !== reviewItem.id);
      });
      if (decision === "approved") {
        setReviewDraftByDocId((previous) => ({ ...previous, [reviewItem.id]: "" }));
      }
      setReviewStatusMessage(`Updated review status for ${reviewItem.name}.`);
    } catch (error) {
      setReviewStatusMessage(String(error.message || error));
    } finally {
      setReviewingDocumentId("");
    }
  }

  async function handleBulkReview(items, decision) {
    if (!onReviewDocumentExtraction || !items.length) return;
    setIsBulkReviewing(true);
    setReviewStatusMessage("");

    let updatedCount = 0;
    for (const item of items) {
      try {
        await onReviewDocumentExtraction(item.id, {
          subjectId: item.subjectId,
          decision
        });
        updatedCount += 1;
      } catch {
        // Continue with remaining documents to complete as much of the batch as possible.
      }
    }

    if (!updatedCount) {
      setReviewStatusMessage("Bulk update did not modify any document.");
    } else {
      setReviewStatusMessage(`Bulk update complete: ${updatedCount} document(s) set to ${decision.replace("_", " ")}.`);
    }
    setIsBulkReviewing(false);
  }

  async function handleBulkApproveHighConfidence() {
    const targets = effectiveReviewQueue.filter((item) => Number(item.extractionConfidence || 0) >= 0.85);
    if (!targets.length) {
      setReviewStatusMessage("No high-confidence pending documents found.");
      return;
    }
    await handleBulkReview(targets, "approved");
  }

  async function handleBulkRejectEmptyExtraction() {
    const targets = effectiveReviewQueue.filter((item) => {
      const issues = Array.isArray(item.extractionIssues) ? item.extractionIssues : [];
      const noTextIssue = issues.includes("no-text-extracted");
      const isEmptyContent = !String(item.content || "").trim();
      return noTextIssue || isEmptyContent;
    });

    if (!targets.length) {
      setReviewStatusMessage("No empty-extraction pending documents found.");
      return;
    }
    await handleBulkReview(targets, "rejected");
  }

  function handleExportReviewReportCsv() {
    const headers = [
      "workspace",
      "subject",
      "document",
      "review_status",
      "requires_review",
      "extraction_confidence",
      "extraction_method",
      "issues",
      "size_label",
      "uploaded_at"
    ];

    const rows = effectiveReviewQueue.map((item) => [
      selectedWorkspace?.name || "",
      item.subjectName || "",
      item.name || "",
      String(item.reviewStatus || "needs_review"),
      String(Boolean(item.requiresReview)),
      String(Number(item.extractionConfidence || 0)),
      String(item.extractionMethod || ""),
      Array.isArray(item.extractionIssues) ? item.extractionIssues.join(" | ") : "",
      item.sizeLabel || "",
      item.uploadedAt || ""
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => csvEscape(cell)).join(","))
      .join("\n");

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadTextFile(csvContent, `review-center-report-${timestamp}.csv`, "text/csv;charset=utf-8");
    setReviewStatusMessage(`Exported review report CSV with ${rows.length} row(s).`);
  }

  async function loadGeneratedPdfArtifact(documentId) {
    const docId = String(documentId || "").trim();
    if (!docId) return null;

    const existing = generatedPdfArtifactByDocId[docId];
    if (existing?.contentBase64) {
      return existing;
    }

    const response = await fetch(WORKSPACES_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "downloadGeneratedDocument",
        payload: {
          documentId: docId,
          format: "pdf"
        }
      })
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const mimeType = String(data?.download?.mimeType || "").toLowerCase();
    const contentBase64 = String(data?.download?.contentBase64 || "");
    if (mimeType !== "application/pdf" || !contentBase64) {
      return null;
    }

    const artifact = { mimeType, contentBase64 };
    setGeneratedPdfArtifactByDocId((previous) => ({
      ...previous,
      [docId]: artifact
    }));
    return artifact;
  }

  function getReviewHtmlDraft(item) {
    if (!item?.id) return "";
    const existing = String(reviewHtmlDraftByDocId[item.id] || "").trim();
    if (existing) return existing;
    const sourceHtml = String(item?.sourceRenderHtml || "").trim();
    if (sourceHtml) return sourceHtml;
    return plainTextToHtml(String(reviewDraftByDocId[item.id] || item?.content || ""));
  }

  function setReviewHtmlDraft(item, html) {
    if (!item?.id) return;
    const sanitized = sanitizeEditableHtml(String(html || ""));
    setReviewHtmlDraftByDocId((previous) => ({
      ...previous,
      [item.id]: sanitized
    }));

    const nextText = htmlToPlainText(sanitized);
    setReviewDraftByDocId((previous) => ({
      ...previous,
      [item.id]: nextText
    }));
  }

  function getConsolidatedReviewHtml(item) {
    const baseHtml = getReviewHtmlDraft(item);
    const suppressed = new Set(suppressedRiskByDocId[item?.id] || []);
    const entries = getCompareRiskEntries(item).filter((entry) => !suppressed.has(entry.id));
    const htmlWithFormula = appendFormulaBlocksToSourceHtml(baseHtml, entries);
    return annotateRiskHtml(stripRiskMarkupFromHtml(htmlWithFormula), entries, activeCompareRiskId);
  }

  function getConsolidatedRenderedHtml(item) {
    const base = getConsolidatedReviewHtml(item);
    return renderLatexPreview ? renderLatexInHtml(base) : base;
  }

  function getReviewProgressStats(item) {
    const entries = getCompareRiskEntries(item);
    const total = entries.length;
    const approved = entries.filter((entry) => Boolean(entry.addressed)).length;
    const pending = entries.filter((entry) => !entry.addressed).length;
    const rejected = 0;
    const progress = total ? Math.round((approved / total) * 100) : 100;
    return { total, approved, pending, rejected, progress };
  }

  function focusSourceEditorAtRisk(riskId = "") {
    const sourceRoot = sourceViewerRef.current;
    const editor = sourceEditorRef.current;
    if (!sourceRoot || !editor || !riskId) return;
    const target = sourceRoot.querySelector(`[data-source-risk-id="${riskId}"]`);
    if (!target) return;

    target.scrollIntoView({ block: "center", behavior: "smooth" });
    editor.focus();
    try {
      const selection = window.getSelection();
      if (!selection) return;
      const range = document.createRange();
      range.selectNodeContents(target);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    } catch {
      // Keep focus behavior even if range manipulation fails.
    }
  }

  async function approveRiskFromSection(item, riskId) {
    if (!item?.id || !riskId) return;
    const currentMap = {
      ...(riskAddressedByDocId[item.id] || {})
    };
    currentMap[riskId] = true;
    setRiskAddressedByDocId((previous) => ({ ...previous, [item.id]: currentMap }));
    const addressedIds = Object.entries(currentMap)
      .filter(([, value]) => Boolean(value))
      .map(([id]) => id);
    await persistAddressedRiskState(item, addressedIds);
  }

  function runEditorCommand(command, value = null) {
    const editor = sourceEditorRef.current;
    if (!editor) return;
    editor.focus();
    try {
      document.execCommand(command, false, value);
    } catch {
      // Ignore unsupported commands and keep editing session alive.
    }
  }

  function insertLatexAtSelection(displayMode = false) {
    const wrapper = displayMode ? "$$\n\\placeholder\n$$" : "$\\placeholder$";
    runEditorCommand("insertText", wrapper);
  }

  function captureCurrentEditorState(item) {
    const editor = sourceEditorRef.current;
    const fallbackHtml = String(reviewHtmlDraftByDocId[item?.id] || "").trim();
    const rawHtml = editor ? String(editor.innerHTML || "") : fallbackHtml;
    const stripped = stripRiskMarkupFromHtml(rawHtml).trim();

    const visibleRiskIds = new Set();
    for (const match of rawHtml.matchAll(/data-source-risk-id="([^"]+)"/g)) {
      const id = String(match[1] || "").trim();
      if (id) visibleRiskIds.add(id);
    }

    const expectedRiskIds = getCompareRiskEntries(item).map((entry) => entry.id);
    const removedRiskIds = expectedRiskIds.filter((id) => !visibleRiskIds.has(id));
    return { stripped, removedRiskIds };
  }

  async function saveReviewHtmlDraft(item) {
    if (!item?.id || !item?.subjectId || !onReviewDocumentExtraction) return;
    const markdownDraft = String(reviewDraftByDocId[item.id] || item.content || "");
    const { stripped, removedRiskIds } = reviewContentMode === "markdown"
      ? { stripped: markdownToBasicHtml(markdownDraft), removedRiskIds: [] }
      : captureCurrentEditorState(item);
    const correctedHtml = stripped;
    const correctedContent = reviewContentMode === "markdown" ? markdownDraft : htmlToPlainText(correctedHtml);
    const addressedIds = getAddressedRiskIds(item);

    if (removedRiskIds.length) {
      setSuppressedRiskByDocId((previous) => {
        const existing = new Set(previous[item.id] || []);
        for (const id of removedRiskIds) existing.add(id);
        return {
          ...previous,
          [item.id]: Array.from(existing)
        };
      });
    }

    setReviewHtmlDraftByDocId((previous) => ({
      ...previous,
      [item.id]: correctedHtml
    }));
    setReviewDraftByDocId((previous) => ({
      ...previous,
      [item.id]: correctedContent
    }));

    setReviewingDocumentId(item.id);
    setReviewStatusMessage("");
    try {
      await onReviewDocumentExtraction(item.id, {
        subjectId: item.subjectId,
        decision: "needs_review",
        correctedHtml,
        correctedContent,
        addressedRiskIds: addressedIds
      });

      if (reviewCompareDoc?.id === item.id) {
        setReviewCompareDoc((previous) => previous ? {
          ...previous,
          sourceRenderHtml: correctedHtml,
          content: correctedContent
        } : previous);
      }

      setReviewHtmlDraftByDocId((previous) => ({
        ...previous,
        [item.id]: correctedHtml
      }));
      setReviewDraftByDocId((previous) => ({
        ...previous,
        [item.id]: correctedContent
      }));

      setReviewStatusMessage(`Saved HTML draft for ${item.name}.`);
    } catch (error) {
      setReviewStatusMessage(String(error.message || error));
    } finally {
      setReviewingDocumentId("");
    }
  }

  async function bulkApproveCurrentDocument(item) {
    if (!item?.id || !item?.subjectId || !onReviewDocumentExtraction) return;

    const entries = getCompareRiskEntries(item);
    const addressedIds = entries.map((entry) => String(entry.id || "")).filter(Boolean);
    const addressedMap = {};
    for (const entryId of addressedIds) {
      addressedMap[entryId] = true;
    }

    setRiskAddressedByDocId((previous) => ({
      ...previous,
      [item.id]: addressedMap
    }));

    const markdownDraft = String(reviewDraftByDocId[item.id] || item.content || "");
    const { stripped, removedRiskIds } = reviewContentMode === "markdown"
      ? { stripped: markdownToBasicHtml(markdownDraft), removedRiskIds: [] }
      : captureCurrentEditorState(item);
    const correctedHtml = stripped;
    const correctedContent = reviewContentMode === "markdown" ? markdownDraft : htmlToPlainText(correctedHtml);

    if (removedRiskIds.length) {
      setSuppressedRiskByDocId((previous) => {
        const existing = new Set(previous[item.id] || []);
        for (const id of removedRiskIds) existing.add(id);
        return {
          ...previous,
          [item.id]: Array.from(existing)
        };
      });
    }

    setReviewHtmlDraftByDocId((previous) => ({
      ...previous,
      [item.id]: correctedHtml
    }));
    setReviewDraftByDocId((previous) => ({
      ...previous,
      [item.id]: correctedContent
    }));

    setReviewingDocumentId(item.id);
    setReviewStatusMessage("");
    try {
      await onReviewDocumentExtraction(item.id, {
        subjectId: item.subjectId,
        decision: "approved",
        correctedHtml,
        correctedContent,
        addressedRiskIds: addressedIds,
        autoApproveWhenAllAddressed: true
      });

      if (reviewCompareDoc?.id === item.id) {
        setReviewCompareDoc((previous) => previous ? {
          ...previous,
          sourceRenderHtml: correctedHtml,
          content: correctedContent
        } : previous);
      }

      setReviewHtmlDraftByDocId((previous) => ({
        ...previous,
        [item.id]: correctedHtml
      }));
      setReviewDraftByDocId((previous) => ({
        ...previous,
        [item.id]: correctedContent
      }));

      setReviewStatusMessage(`Document approved: ${item.name}`);
      setReviewCompareDoc(null);
    } catch (error) {
      setReviewStatusMessage(String(error.message || error));
    } finally {
      setReviewingDocumentId("");
    }
  }

  async function openReviewCompare(item) {
    setActiveCompareRiskId("");
    setShowFullCompareEditor(false);
    setShowFormulaDebug(false);
    setRiskSnippetEditor(null);
    setPreferGeneratedPdfPreview(false);
    setReviewCompareDoc(item);
    const seededAddressed = {};
    for (const entry of buildRiskEntries(item)) {
      seededAddressed[entry.id] = Boolean(entry.addressed);
    }
    setRiskAddressedByDocId((previous) => ({
      ...previous,
      [item.id]: {
        ...(previous[item.id] || {}),
        ...seededAddressed
      }
    }));
    setReviewDraftByDocId((previous) => ({
      ...previous,
      [item.id]: previous[item.id] ?? String(item.content || "")
    }));
    setSuppressedRiskByDocId((previous) => ({
      ...previous,
      [item.id]: previous[item.id] || []
    }));
    setReviewHtmlDraftByDocId((previous) => ({
      ...previous,
      [item.id]: previous[item.id]
        ?? (String(item?.sourceRenderHtml || "").trim() || plainTextToHtml(String(item.content || "")))
    }));
    setReviewContentMode(String(item?.sourceRenderHtml || "").trim() ? "html" : "markdown");

    const sourceMime = String(item?.sourceMimeType || "").toLowerCase();
    const isWordLike = sourceMime.includes("wordprocessingml") || sourceMime === "application/msword";
    const isPptLike = sourceMime.includes("presentationml") || sourceMime === "application/vnd.ms-powerpoint";
    if (isWordLike || isPptLike) {
      await loadGeneratedPdfArtifact(item.id);
    }
  }

  function normalizeWordToken(value = "") {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function tokenizeWordsWithRanges(text = "") {
    const sample = String(text || "");
    const words = [];
    for (const match of sample.matchAll(/\S+/g)) {
      const raw = match[0] || "";
      const start = match.index || 0;
      const end = start + raw.length;
      words.push({
        raw,
        start,
        end,
        normalized: normalizeWordToken(raw)
      });
    }
    return words;
  }

  function getWordWindowBounds(words, startWordIndex, endWordIndex, beforeWords = 20, afterWords = 20) {
    if (!Array.isArray(words) || !words.length) return { start: 0, end: 0, found: false };
    const safeStart = Math.max(0, Math.min(words.length - 1, Number(startWordIndex || 0)));
    const safeEnd = Math.max(safeStart, Math.min(words.length - 1, Number(endWordIndex || safeStart)));
    const rangeStartWord = Math.max(0, safeStart - Math.max(0, beforeWords));
    const rangeEndWord = Math.min(words.length - 1, safeEnd + Math.max(0, afterWords));
    return {
      start: words[rangeStartWord].start,
      end: words[rangeEndWord].end,
      found: true
    };
  }

  function getSnippetRangeFromAnchor(text, anchor, beforeWords = 20, afterWords = 20) {
    const sample = String(text || "");
    if (!sample || !anchor || typeof anchor !== "object") return null;

    const start = Number(anchor?.start);
    const end = Number(anchor?.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;

    const safeStart = Math.max(0, Math.min(sample.length, Math.floor(start)));
    const safeEnd = Math.max(safeStart, Math.min(sample.length, Math.floor(end)));

    const words = tokenizeWordsWithRanges(sample);
    if (!words.length) return null;

    let startWordIndex = words.findIndex((word) => word.start <= safeStart && word.end >= safeStart);
    if (startWordIndex < 0) {
      startWordIndex = words.findIndex((word) => word.start >= safeStart);
      if (startWordIndex < 0) startWordIndex = words.length - 1;
    }

    let endWordIndex = words.findIndex((word) => word.start <= safeEnd && word.end >= safeEnd);
    if (endWordIndex < 0) {
      endWordIndex = words.findIndex((word) => word.start >= safeEnd);
      if (endWordIndex < 0) endWordIndex = words.length - 1;
    }

    return getWordWindowBounds(words, startWordIndex, endWordIndex, beforeWords, afterWords);
  }

  function getFuzzySnippetRange(text, excerpt, beforeWords = 20, afterWords = 20, hintRatio = null) {
    const sample = String(text || "");
    const target = String(excerpt || "").trim();
    if (!sample || !target) return null;

    const words = tokenizeWordsWithRanges(sample);
    if (!words.length) return null;

    const targetWords = tokenizeWordsWithRanges(target)
      .map((item) => item.normalized)
      .filter(Boolean)
      .slice(0, 20);

    if (!targetWords.length) return null;

    let bestStart = -1;
    let bestScore = 0;
    const hintWordIndex = typeof hintRatio === "number"
      ? Math.max(0, Math.min(words.length - 1, Math.round(hintRatio * (words.length - 1))))
      : null;

    for (let startIndex = 0; startIndex < words.length; startIndex += 1) {
      let score = 0;
      for (let offset = 0; offset < targetWords.length; offset += 1) {
        const sourceWord = words[startIndex + offset];
        if (!sourceWord) break;
        if (sourceWord.normalized !== targetWords[offset]) break;
        score += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        bestStart = startIndex;
      } else if (score > 0 && score === bestScore && hintWordIndex !== null && bestStart >= 0) {
        const currentDistance = Math.abs(startIndex - hintWordIndex);
        const bestDistance = Math.abs(bestStart - hintWordIndex);
        if (currentDistance < bestDistance) {
          bestStart = startIndex;
        }
      }
      if (bestScore === targetWords.length) break;
    }

    const minScore = Math.max(2, Math.ceil(targetWords.length * 0.35));
    if (bestStart < 0 || bestScore < minScore) return null;

    return getWordWindowBounds(words, bestStart, bestStart + bestScore - 1, beforeWords, afterWords);
  }

  function getSnippetRange(text, excerpt, beforeWords = 20, afterWords = 20) {
    const sample = String(text || "");
    const target = String(excerpt || "").trim();
    if (!sample || !target) return null;
    const at = sample.indexOf(target);
    if (at < 0) return null;

    const words = [];
    for (const match of sample.matchAll(/\S+/g)) {
      const token = match[0] || "";
      const start = match.index || 0;
      const end = start + token.length;
      words.push({ start, end });
    }

    if (!words.length) return null;

    const focusStart = at;
    const focusEnd = at + target.length;
    let startWordIndex = 0;
    let endWordIndex = words.length - 1;

    for (let index = 0; index < words.length; index += 1) {
      if (words[index].start <= focusStart && words[index].end >= focusStart) {
        startWordIndex = index;
        break;
      }
      if (words[index].start > focusStart) {
        startWordIndex = Math.max(0, index - 1);
        break;
      }
    }

    for (let index = startWordIndex; index < words.length; index += 1) {
      if (words[index].start <= focusEnd && words[index].end >= focusEnd) {
        endWordIndex = index;
        break;
      }
      if (words[index].start > focusEnd) {
        endWordIndex = Math.max(startWordIndex, index - 1);
        break;
      }
    }

    return getWordWindowBounds(words, startWordIndex, endWordIndex, beforeWords, afterWords);
  }

  function openSnippetEditorForRisk(item, entry) {
    if (!item?.id || !entry?.id) return;
    const currentText = String(reviewDraftByDocId[item.id] || item.content || "");
    const entries = getCompareRiskEntries(item);
    const entryIndex = Math.max(0, entries.findIndex((candidate) => candidate.id === entry.id));
    const hintRatio = entries.length > 1 ? (entryIndex / (entries.length - 1)) : 0;
    let range = getSnippetRangeFromAnchor(currentText, entry.anchor, 20, 20);
    if (!range) {
      range = getSnippetRange(currentText, entry.excerpt, 20, 20);
    }
    if (!range) {
      range = getFuzzySnippetRange(currentText, entry.excerpt, 20, 20, hintRatio);
    }
    if (!range) {
      const words = tokenizeWordsWithRanges(currentText);
      if (!words.length) {
        setRiskSnippetEditor({
          docId: item.id,
          riskId: entry.id,
          start: 0,
          end: 0,
          text: "",
          matchFound: false
        });
        return;
      }
      const anchorWordIndex = Math.max(0, Math.min(words.length - 1, Math.round(hintRatio * (words.length - 1))));
      const fallbackRange = getWordWindowBounds(words, anchorWordIndex, anchorWordIndex, 20, 20);
      setRiskSnippetEditor({
        docId: item.id,
        riskId: entry.id,
        start: fallbackRange.start,
        end: fallbackRange.end,
        text: currentText.slice(fallbackRange.start, fallbackRange.end),
        matchFound: false
      });
      return;
    }

    setRiskSnippetEditor({
      docId: item.id,
      riskId: entry.id,
      start: range.start,
      end: range.end,
      text: currentText.slice(range.start, range.end),
      matchFound: true
    });
  }

  function applySnippetEditorChanges(item) {
    if (!item?.id || !riskSnippetEditor || riskSnippetEditor.docId !== item.id) return;
    const currentText = String(reviewDraftByDocId[item.id] || item.content || "");
    const safeStart = Math.max(0, Math.min(currentText.length, Number(riskSnippetEditor.start || 0)));
    const safeEnd = Math.max(safeStart, Math.min(currentText.length, Number(riskSnippetEditor.end || 0)));
    const patchedText = `${currentText.slice(0, safeStart)}${String(riskSnippetEditor.text || "")}${currentText.slice(safeEnd)}`;
    setReviewDraftByDocId((previous) => ({ ...previous, [item.id]: patchedText }));

    const refreshedRange = getSnippetRange(patchedText, String(riskSnippetEditor.text || "").trim(), 0, 0)
      || getFuzzySnippetRange(patchedText, String(riskSnippetEditor.text || "").trim(), 0, 0, null);
    const nextEnd = refreshedRange ? refreshedRange.end : (safeStart + String(riskSnippetEditor.text || "").length);
    setRiskSnippetEditor((previous) => previous ? {
      ...previous,
      start: safeStart,
      end: nextEnd,
      matchFound: true
    } : previous);
    setReviewStatusMessage("Snippet changes applied to transformed TXT.");
  }

  function getRiskAuthoringGuidance(item, entry) {
    const markerType = String(entry?.type || "").toLowerCase();
    const markerLabel = String(entry?.label || "").toLowerCase();
    const issues = Array.isArray(item?.extractionIssues) ? item.extractionIssues : [];
    const sourceMime = String(item?.sourceMimeType || "").toLowerCase();

    const isFormulaRisk = markerType.includes("formula") || markerType.includes("math") || markerType.includes("equation")
      || markerLabel.includes("formula") || markerLabel.includes("math") || markerLabel.includes("equation")
      || issues.some((issue) => {
        const value = String(issue || "").toLowerCase();
        return value.includes("formula") || value.includes("math") || value.includes("equation");
      });

    if (isFormulaRisk) {
      return "Formula tip: write equations in linear plain text (example: integral_0^1 f(x) dx, sqrt(x^2+1), x_(n+1)=x_n+r). Avoid screenshots of formulas when possible.";
    }

    const isImageRisk = sourceMime.startsWith("image/") || issues.some((issue) => String(issue || "").toLowerCase().includes("ocr"));
    if (isImageRisk) {
      return "Image/OCR tip: add a short caption with title, labels, axis names, units, key values, and conclusion so extraction keeps the meaning.";
    }

    return "Edit this focused snippet only. Keep key nouns, numbers, and symbols explicit for reliable downstream processing.";
  }

  function activateCompareRisk(item, entry, options = {}) {
    if (!item || !entry) return;
    openSnippetEditorForRisk(item, entry);
    const shouldFocusEditor = options.focusEditor === true || (options.focusEditor !== false && showFullCompareEditor);
    const shouldJumpSource = options.jumpSource !== false;
    if (shouldFocusEditor) {
      focusEditorAtExcerpt(item, entry.excerpt, entry.id);
    } else if (entry.id) {
      setActiveCompareRiskId(entry.id);
    }
    if (shouldJumpSource) {
      jumpToSourceForRisk(item, entry.id, entry.excerpt);
    }
  }

  function stepCompareRisk(item, step = 1) {
    const entries = getCompareRiskEntries(item);
    if (!entries.length) return;
    const currentIndex = entries.findIndex((entry) => entry.id === activeCompareRiskId);
    const startIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (startIndex + step + entries.length) % entries.length;
    activateCompareRisk(item, entries[nextIndex]);
  }

  function focusEditorAtExcerpt(item, excerpt = "", riskId = "") {
    if (!item?.id) return;
    const text = String(reviewDraftByDocId[item.id] || item.content || "");
    const needle = String(excerpt || "").trim();
    if (!needle) return;
    const at = text.indexOf(needle);
    if (at < 0) return;

    const lineStart = Math.max(0, text.lastIndexOf("\n", at) + 1);
    const lineEndPos = text.indexOf("\n", at + needle.length);
    const lineEnd = lineEndPos >= 0 ? lineEndPos : text.length;
    const textarea = compareTextareaRef.current;
    if (!textarea) return;

    textarea.focus();
    textarea.setSelectionRange(lineStart, lineEnd);

    const lineNumber = text.slice(0, lineStart).split("\n").length - 1;
    const lineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight || "20") || 20;
    textarea.scrollTop = Math.max(0, (lineNumber - 2) * lineHeight);

    if (riskId) {
      setActiveCompareRiskId(riskId);
    }
  }

  function jumpToSourceForRisk(item, riskId = "", excerpt = "") {
    const sourceRoot = sourceViewerRef.current;
    if (!sourceRoot || !riskId) return;

    setActiveCompareRiskId(riskId);
    const selector = `[data-source-risk-id="${riskId}"]`;
    const target = sourceRoot.querySelector(selector);
    if (target) {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      focusSourceEditorAtRisk(riskId);
      return;
    }

    const mime = String(item?.sourceMimeType || "").toLowerCase();
    if (mime === "application/pdf" || mime.startsWith("image/")) {
      setReviewStatusMessage("Source jump is limited for binary preview types (PDF/image). Use the risk chip + editor line highlight for alignment.");
      return;
    }

    const fallbackNeedle = String(excerpt || "").trim();
    if (!fallbackNeedle) return;
    const sourceTextNode = sourceRoot.querySelector("pre");
    if (sourceTextNode && sourceTextNode.textContent?.includes(fallbackNeedle)) {
      sourceTextNode.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  function handleRiskChipClick(item, entry) {
    if (!entry) return;
    activateCompareRisk(item, entry);
  }

  function openDocumentReviewFromFolder(doc) {
    const match = effectiveReviewQueue.find((item) => item.id === doc.id)
      || {
        ...doc,
        subjectId: selectedSubject?.id || selectedSubjectId,
        subjectName: selectedSubject?.name || "Current subject",
        reviewStatus: String(doc.reviewStatus || "needs_review"),
        extractionConfidence: Number(doc.extractionConfidence || 0),
        extractionMethod: String(doc.extractionMethod || ""),
        extractionIssues: Array.isArray(doc.extractionIssues) ? doc.extractionIssues : [],
        extractionRiskMarkers: Array.isArray(doc.extractionRiskMarkers) ? doc.extractionRiskMarkers : [],
        sourcePreview: String(doc.sourcePreview || ""),
        sourceMimeType: String(doc.sourceMimeType || ""),
        sourceContentBase64: String(doc.sourceContentBase64 || ""),
        sourceRenderHtml: String(doc.sourceRenderHtml || ""),
        canonicalVerification: doc?.canonicalVerification && typeof doc.canonicalVerification === "object"
          ? doc.canonicalVerification
          : null,
        canonicalDocument: doc?.canonicalDocument && typeof doc.canonicalDocument === "object"
          ? doc.canonicalDocument
          : null,
        requiresReview: true
      };

    setWorkspaceTab("review-center");
    openReviewCompare(match);
  }

  function getCompareRiskEntries(item) {
    const baseEntries = buildRiskEntries(item);
    const addressedMap = item?.id ? (riskAddressedByDocId[item.id] || {}) : {};
    return baseEntries.map((entry) => ({
      ...entry,
      addressed: Boolean(addressedMap[entry.id] ?? entry.addressed)
    }));
  }

  function getAddressedRiskIds(item) {
    return getCompareRiskEntries(item)
      .filter((entry) => Boolean(entry.addressed))
      .map((entry) => entry.id);
  }

  async function persistAddressedRiskState(item, addressedIds) {
    if (!item?.id || !item?.subjectId || !onReviewDocumentExtraction) return;
    const correctedContent = String(reviewDraftByDocId[item.id] || "").trim();
    const correctedHtml = String(reviewHtmlDraftByDocId[item.id] || "").trim();
    const entries = getCompareRiskEntries(item);
    const allAddressed = entries.length > 0 && entries.every((entry) => addressedIds.includes(entry.id));
    const decision = allAddressed ? "approved" : "needs_review";

    setReviewingDocumentId(item.id);
    try {
      const reviewed = await onReviewDocumentExtraction(item.id, {
        subjectId: item.subjectId,
        decision,
        correctedContent,
        correctedHtml,
        addressedRiskIds: addressedIds,
        autoApproveWhenAllAddressed: true
      });

      if (Array.isArray(reviewed?.extractionRiskMarkers)) {
        const nextMarkers = reviewed.extractionRiskMarkers;
        const addressedMap = {};
        nextMarkers.forEach((marker, index) => {
          const markerId = String(marker?.id || `R${index + 1}`);
          addressedMap[markerId] = Boolean(marker?.addressed);
        });
        setRiskAddressedByDocId((previous) => ({ ...previous, [item.id]: addressedMap }));
        if (reviewCompareDoc?.id === item.id) {
          setReviewCompareDoc((previous) => previous ? { ...previous, extractionRiskMarkers: nextMarkers, reviewStatus: reviewed.reviewStatus || previous.reviewStatus } : previous);
        }
      }

      if (decision === "approved") {
        setReviewStatusMessage(`All risks addressed for ${item.name}. Document approved automatically.`);
      } else {
        setReviewStatusMessage(`Saved risk checklist for ${item.name}.`);
      }
    } catch (error) {
      setReviewStatusMessage(String(error.message || error));
    } finally {
      setReviewingDocumentId("");
    }
  }

  async function handleToggleRiskAddressed(item, riskId, checked) {
    if (!item?.id || !riskId) return;
    const nextMap = {
      ...(riskAddressedByDocId[item.id] || {}),
      [riskId]: Boolean(checked)
    };
    setRiskAddressedByDocId((previous) => ({ ...previous, [item.id]: nextMap }));
    const addressedIds = Object.entries(nextMap)
      .filter(([, value]) => Boolean(value))
      .map(([id]) => id);
    await persistAddressedRiskState(item, addressedIds);
  }

  function applyCompareInlineMarkers(item) {
    if (!item?.id) return;
    const current = String(reviewDraftByDocId[item.id] || item.content || "");
    const entries = getCompareRiskEntries(item);
    const next = applyInlineRiskMarkers(current, entries);
    setReviewDraftByDocId((previous) => ({ ...previous, [item.id]: next }));
  }

  function hasMathRiskSignals(item) {
    const issues = Array.isArray(item?.extractionIssues) ? item.extractionIssues : [];
    const markers = Array.isArray(item?.extractionRiskMarkers) ? item.extractionRiskMarkers : [];

    if (issues.some((issue) => {
      const value = String(issue || "").toLowerCase();
      return value.includes("formula") || value.includes("math") || value.includes("equation");
    })) {
      return true;
    }

    return markers.some((marker) => {
      const type = String(marker?.type || "").toLowerCase();
      const label = String(marker?.label || "").toLowerCase();
      return type.includes("formula") || type.includes("math") || type.includes("equation")
        || label.includes("formula") || label.includes("math") || label.includes("equation");
    });
  }

  function hasPdfSourcePreview(item) {
    const mime = String(item?.sourceMimeType || "").toLowerCase();
    const base64 = String(item?.sourceContentBase64 || "");
    return mime === "application/pdf" && Boolean(toDataUrl(mime, base64));
  }

  function renderCanonicalVerificationPanel(item, compact = false) {
    const verification = item?.canonicalVerification && typeof item.canonicalVerification === "object"
      ? item.canonicalVerification
      : null;
    if (!verification) {
      return (
        <div className="selection-box" style={{ margin: compact ? "8px 0" : "10px 0", background: "#fff", borderColor: "#d8d3f0" }}>
          <p className="hint" style={{ margin: 0 }}>Canonical parity diagnostics are not available for this document.</p>
        </div>
      );
    }

    const sourceCounts = verification?.sourceCounts && typeof verification.sourceCounts === "object" ? verification.sourceCounts : {};
    const extractedCounts = verification?.extractedCounts && typeof verification.extractedCounts === "object" ? verification.extractedCounts : {};
    const coverage = verification?.coverage && typeof verification.coverage === "object" ? verification.coverage : {};
    const unresolved = Array.isArray(verification?.unresolved) ? verification.unresolved : [];
    const gatePassed = Boolean(verification?.gatePassed);
    const chipStyle = gatePassed
      ? { background: "#e8f7ef", borderColor: "#75be94", color: "#24573a" }
      : { background: "#ffe3ea", borderColor: "#df6a8f", color: "#751d3a" };
    const pct = (value) => `${(Number(value || 0) * 100).toFixed(1)}%`;

    return (
      <div className="selection-box" style={{ margin: compact ? "8px 0" : "10px 0", background: "#fff", borderColor: "#d8d3f0" }}>
        <div className="inline-actions" style={{ justifyContent: "space-between", width: "100%", flexWrap: "wrap" }}>
          <strong style={{ color: "#1a2a4d" }}>Canonical Verification</strong>
          <span className="scope-chip" style={chipStyle}>{gatePassed ? "Gate passed" : "Gate failed"}</span>
        </div>
        <p className="hint" style={{ margin: "6px 0 4px" }}>
          Equations: {Number(extractedCounts.equations || 0)} / {Number(sourceCounts.equations || 0)} ({pct(coverage.equations)}) ·
          Tables: {Number(extractedCounts.tables || 0)} / {Number(sourceCounts.tables || 0)} ({pct(coverage.tables)}) ·
          Text: {Number(extractedCounts.textLength || 0)} / {Number(sourceCounts.textLength || 0)} ({pct(coverage.text)})
        </p>
        {unresolved.length ? (
          <div className="chip-wrap" style={{ marginTop: "6px" }}>
            {unresolved.map((issue, index) => (
              <span key={`cdm-unresolved-${item?.id || "doc"}-${index}`} className="scope-chip" style={{ background: "#fff0f4", borderColor: "#df6a8f", color: "#751d3a" }}>
                {String(issue || "")}
              </span>
            ))}
          </div>
        ) : (
          <p className="hint" style={{ margin: "6px 0 0" }}>No unresolved canonical parity issues.</p>
        )}
      </div>
    );
  }

  function renderSourceVisualizer(item) {
    const mime = String(item?.sourceMimeType || "").toLowerCase();
    const sourceDataUrl = toDataUrl(mime, String(item?.sourceContentBase64 || ""));
    const sourceRenderHtml = getReviewHtmlDraft(item);
    const generatedPdfArtifact = generatedPdfArtifactByDocId[item?.id] || null;
    const generatedPdfDataUrl = toDataUrl(
      String(generatedPdfArtifact?.mimeType || "application/pdf"),
      String(generatedPdfArtifact?.contentBase64 || "")
    );
    const hasNativePdf = hasPdfSourcePreview(item);
    const hasGeneratedPdf = Boolean(generatedPdfDataUrl);
    const hasMathRisk = hasMathRiskSignals(item);
    const shouldUseGeneratedPdf = Boolean(preferGeneratedPdfPreview) && hasGeneratedPdf;

    if (hasMathRisk && hasNativePdf && sourceDataUrl) {
      return <iframe title={`source-${item?.id || "document"}`} src={sourceDataUrl} style={{ width: "100%", minHeight: "520px", border: "1px solid #d8d3f0", borderRadius: "10px" }} />;
    }

    if (shouldUseGeneratedPdf) {
      return <iframe title={`source-generated-pdf-${item?.id || "document"}`} src={generatedPdfDataUrl} style={{ width: "100%", minHeight: "520px", border: "1px solid #d8d3f0", borderRadius: "10px" }} />;
    }

    if (mime.startsWith("image/") && sourceDataUrl) {
      return <img src={sourceDataUrl} alt={item?.name || "Uploaded source"} style={{ width: "100%", borderRadius: "10px", border: "1px solid #d8d3f0" }} />;
    }

    if (mime === "application/pdf" && sourceDataUrl) {
      return <iframe title={`source-${item?.id || "document"}`} src={sourceDataUrl} style={{ width: "100%", minHeight: "520px", border: "1px solid #d8d3f0", borderRadius: "10px" }} />;
    }

    if (sourceRenderHtml || String(reviewDraftByDocId[item?.id] || item?.content || "").trim()) {
      const editableHtml = getConsolidatedReviewHtml(item);
      const markdownDraft = String(reviewDraftByDocId[item?.id] || item?.content || "");
      return (
        <div>
          <div className="inline-actions" style={{ marginBottom: "8px", flexWrap: "wrap" }}>
            <span className="hint">Edit mode: switch between HTML and Markdown, then save or approve.</span>
            <button className="table-btn" type="button" onClick={() => setReviewContentMode((previous) => previous === "html" ? "markdown" : "html")}>
              {reviewContentMode === "html" ? "Switch To Markdown" : "Switch To HTML"}
            </button>
            {reviewContentMode === "html" ? (
              <button className="table-btn" type="button" onClick={() => setRenderLatexPreview((previous) => !previous)}>
                {renderLatexPreview ? "Show Raw LaTeX" : "Render LaTeX Preview"}
              </button>
            ) : null}
          </div>
          {reviewContentMode === "html" ? (
            <>
              <div className="inline-actions rich-editor-toolbar" style={{ marginBottom: "8px", flexWrap: "wrap" }}>
                <button className="table-btn" type="button" onClick={() => runEditorCommand("bold")}><b>B</b></button>
                <button className="table-btn" type="button" onClick={() => runEditorCommand("italic")}><i>I</i></button>
                <button className="table-btn" type="button" onClick={() => runEditorCommand("underline")}><u>U</u></button>
                <button className="table-btn" type="button" onClick={() => runEditorCommand("formatBlock", "<h2>")}>H2</button>
                <button className="table-btn" type="button" onClick={() => runEditorCommand("formatBlock", "<h3>")}>H3</button>
                <button className="table-btn" type="button" onClick={() => runEditorCommand("insertUnorderedList")}>Bullets</button>
                <button className="table-btn" type="button" onClick={() => runEditorCommand("insertOrderedList")}>Numbered</button>
                <button className="table-btn" type="button" onClick={() => runEditorCommand("removeFormat")}>Clear Format</button>
                <button className="table-btn" type="button" onClick={() => insertLatexAtSelection(false)}>Insert Inline LaTeX</button>
                <button className="table-btn" type="button" onClick={() => insertLatexAtSelection(true)}>Insert Display LaTeX</button>
              </div>
              <div
                ref={sourceEditorRef}
                className="doc-preview rich-html-editor"
                style={{ maxHeight: "520px", overflow: "auto", background: "#fff" }}
                contentEditable
                suppressContentEditableWarning
                onInput={() => {
                  // Keep editor uncontrolled while typing to avoid re-injecting highlights mid-delete.
                }}
                dangerouslySetInnerHTML={{ __html: editableHtml }}
              />
              {renderLatexPreview ? (
                <div
                  className="doc-preview rich-html-render"
                  style={{ maxHeight: "280px", overflow: "auto", background: "#fff", marginTop: "10px" }}
                  dangerouslySetInnerHTML={{ __html: getConsolidatedRenderedHtml(item) }}
                />
              ) : null}
            </>
          ) : (
            <textarea
              className="input"
              rows={20}
              style={{ width: "100%", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              value={markdownDraft}
              onChange={(event) => {
                const nextMarkdown = event.target.value;
                setReviewDraftByDocId((previous) => ({ ...previous, [item.id]: nextMarkdown }));
                setReviewHtmlDraftByDocId((previous) => ({ ...previous, [item.id]: markdownToBasicHtml(nextMarkdown) }));
              }}
            />
          )}
        </div>
      );
    }

    const sourcePreview = String(item?.sourcePreview || "Source preview unavailable for this upload.");
    const previewHtml = buildHighlightedRiskHtml(sourcePreview, getCompareRiskEntries(item), activeCompareRiskId);
    return <pre className="doc-preview" style={{ whiteSpace: "pre-wrap" }} dangerouslySetInnerHTML={{ __html: previewHtml }} />;
  }

  function renderReviewCenterPanel() {
    return (
      <div className="selection-box">
        <h5 style={{ marginTop: 0 }}>Review Center</h5>
        <p className="hint">All non-approved uploads are blocked from AI quiz generation until approved.</p>
        <div className="inline-actions" style={{ marginBottom: "8px", flexWrap: "wrap" }}>
          <button className="table-btn" type="button" onClick={handleBulkApproveHighConfidence} disabled={isBulkReviewing || isWorking}>Approve All High-Confidence</button>
          <button className="table-btn danger" type="button" onClick={handleBulkRejectEmptyExtraction} disabled={isBulkReviewing || isWorking}>Reject All Empty-Extraction</button>
          <button className="table-btn" type="button" onClick={handleExportReviewReportCsv}>Export Review Report CSV</button>
        </div>

        {effectiveReviewQueue.length ? (
          <div className="chip-stack">
            {effectiveReviewQueue.map((item) => {
              const status = String(item.reviewStatus || "needs_review").replace("_", " ");
              const confidence = Number(item.extractionConfidence || 0);
              const issues = Array.isArray(item.extractionIssues) && item.extractionIssues.length
                ? item.extractionIssues.join(", ")
                : "No issues listed";
              const busy = reviewingDocumentId === item.id;

              return (
                <div key={`review-center-${item.id}`} className="quiz-picker-row" style={{ alignItems: "stretch", flexDirection: "column" }}>
                  <div className="inline-actions" style={{ justifyContent: "space-between", width: "100%" }}>
                    <strong>{item.name}</strong>
                    <span className="scope-chip">{status}</span>
                  </div>
                  <p className="hint" style={{ margin: "4px 0" }}>
                    Subject: {item.subjectName} · Method: {item.extractionMethod || "unknown"} · Confidence: {(confidence * 100).toFixed(1)}%
                  </p>
                  <p className="hint" style={{ margin: "0 0 8px" }}>Issues: {issues}</p>
                  {renderCanonicalVerificationPanel(item, true)}
                  <button className="table-btn" type="button" onClick={() => openReviewCompare(item)} disabled={busy || isWorking}>Open HTML/Markdown Risk Manager</button>
                  <div className="inline-actions" style={{ marginTop: "8px" }}>
                    <button className="primary-btn" type="button" onClick={() => handleReviewDecision(item, "approved")} disabled={busy || isWorking || !item.id}>
                      {busy ? "Saving..." : "Approve"}
                    </button>
                    <button className="table-btn" type="button" onClick={() => handleReviewDecision(item, "needs_review")} disabled={busy || isWorking || !item.id}>Keep In Review</button>
                    <button className="table-btn danger" type="button" onClick={() => handleReviewDecision(item, "rejected")} disabled={busy || isWorking || !item.id}>Reject</button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
                  <p className="hint">No documents pending review in this workspace.</p>
        )}
      </div>
    );
  }

  return (
    <section className="view-stack">
      {statusMessage ? <p className="hint">{statusMessage}</p> : null}
      {isWorking ? <p className="hint">Syncing changes...</p> : null}
      {uploadStatusMessage ? <p className="hint">{uploadStatusMessage}</p> : null}
      {uploadEmergencyMessage ? <p className="hint" style={{ color: "#b84a77", fontWeight: 700 }}>{uploadEmergencyMessage}</p> : null}
      {reviewStatusMessage ? <p className="hint">{reviewStatusMessage}</p> : null}

      {selectedWorkspace ? (
        <article className="workspace-shell">
          <div className="workspace-shell-head workspace-shell-title-row">
            <div>
              <h3>{selectedWorkspace.name}</h3>
              <p className="hint">Choose a subject, then folders. Documents open below for the selected folder.</p>
            </div>
            <button className="table-btn icon-btn workspace-emoji-action workspace-subject-add" type="button" onClick={() => setShowAddSubject((previous) => !previous)} aria-label={showAddSubject ? "Close subject form" : "Add subject"}>
              {showAddSubject ? "✕" : "➕"}
            </button>
          </div>

          {showAddSubject ? (
            <div className="workspace-add-inline">
              <input
                className="input"
                placeholder="e.g. Mathematics"
                value={subjectName}
                onChange={(event) => setSubjectName(event.target.value)}
                disabled={isWorking}
              />
              <button className="primary-btn" type="button" onClick={handleCreateSubject} disabled={isWorking}>Create Subject</button>
            </div>
          ) : null}

          <div className="subject-strip">
            <div className="subject-grid">
              {subjects.map((subject) => (
                <article
                  key={subject.id}
                  className={subject.id === selectedSubjectId ? "subject-card on" : "subject-card"}
                  style={cardStyle(getSubjectColor(subject))}
                  onClick={() => onSelectSubject(subject.id)}
                >
                  {renameSubjectId === subject.id ? (
                    <div className="form-stack" onClick={(event) => event.stopPropagation()}>
                      <input
                        className="input"
                        value={renameSubjectName}
                        onChange={(event) => setRenameSubjectName(event.target.value)}
                        disabled={isWorking}
                      />
                      <input
                        className="input color-input"
                        type="color"
                        value={getSubjectColor(subject)}
                        onChange={(event) => {
                          const nextColor = normalizeSubjectColor(event.target.value);
                          setSubjectColorDraftById((prev) => ({ ...prev, [subject.id]: nextColor }));
                          onSetSubjectColor(subject.id, nextColor);
                        }}
                        disabled={isWorking}
                      />
                      <div className="inline-actions">
                        <button className="table-btn" type="button" onClick={() => handleSaveRenameSubject(subject.id)} disabled={isWorking}>Save</button>
                        <button className="table-btn" type="button" onClick={() => setRenameSubjectId("")} disabled={isWorking}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="workspace-card-head">
                        <h4>{subject.name}</h4>
                        {renderSubjectActionMenu(subject)}
                      </div>
                      <p className="hint">{getUploadedDocuments(subject.documents || []).length} uploaded · {getGeneratedDocuments(subject.documents || []).length} generated</p>
                    </>
                  )}
                </article>
              ))}
            </div>
          </div>

          <div className="workspace-content-tabs">
            <button className={workspaceTab === "folders" ? "workspace-tab on" : "workspace-tab"} type="button" onClick={() => setWorkspaceTab("folders")}>📁 Folders</button>
            <button className={workspaceTab === "files" ? "workspace-tab on" : "workspace-tab"} type="button" onClick={() => setWorkspaceTab("files")}>📄 Files</button>
            <button className={workspaceTab === "generated" ? "workspace-tab on" : "workspace-tab"} type="button" onClick={() => setWorkspaceTab("generated")}>🤖 Generated</button>
            <button className={workspaceTab === "shared" ? "workspace-tab on" : "workspace-tab"} type="button" onClick={() => setWorkspaceTab("shared")}>👥 Shared With Me</button>
            <button className={workspaceTab === "review-center" ? "workspace-tab on" : "workspace-tab"} type="button" onClick={() => setWorkspaceTab("review-center")}>🛡️ Review Center</button>
          </div>

          {selectedSubject ? (
            <>
              <div className="folder-box">
                <div className="box-head workspace-folder-head">
                  <div className="workspace-folder-top-row">
                    <h4>{workspaceTab === "folders" ? "Folders" : (workspaceTab === "files" ? "Files" : (workspaceTab === "generated" ? "Generated" : (workspaceTab === "review-center" ? "Review Center" : "Shared")))}</h4>
                    {!showReviewCenter ? <div className="inline-actions workspace-folder-actions">
                    <div className="doc-inline-menu-wrap">
                      <button className="table-btn icon-btn workspace-emoji-action" type="button" onClick={() => setShowFolderActionMenu((previous) => !previous)} disabled={isWorking}>➕</button>
                      {showFolderActionMenu ? (
                        <div className="row-menu workspace-collapse-menu">
                          <button className="table-btn" type="button" onClick={() => { setShowFolderModal(true); setShowFolderActionMenu(false); }} disabled={isWorking}>📁 Add Folder</button>
                          <button className="table-btn" type="button" onClick={() => { setShowUploadModal(true); setShowFolderActionMenu(false); }} disabled={isWorking}>📄 Add Document</button>
                          <button className="table-btn" type="button" onClick={() => { setShowTagEditor(true); setShowFolderActionMenu(false); }} disabled={isWorking}>🏷️ Add Tag</button>
                          <button className="table-btn" type="button" onClick={() => { setShowTagEditor((prev) => !prev); setShowFolderActionMenu(false); }} disabled={isWorking}>✏️ {showTagEditor ? "Hide Tags" : "Edit Tags"}</button>
                        </div>
                      ) : null}
                    </div>
                    <div className="doc-inline-menu-wrap">
                      <button className="table-btn icon-btn workspace-emoji-action" type="button" onClick={() => setShowFilterMenu((previous) => !previous)} disabled={isWorking}>⚙️</button>
                      {showFilterMenu ? (
                        <div className="row-menu workspace-collapse-menu workspace-filter-menu" onClick={(event) => event.stopPropagation()}>
                          <label className="form-stack">
                            <span className="field-label">Filter by folder</span>
                            <select className="input" value={filterFolderId} onChange={(event) => setFilterFolderId(event.target.value)}>
                              <option value="">All folders</option>
                              {flattenedFolders.map((folder) => (
                                <option key={folder.id} value={folder.id}>{folderLabels.get(folder.id)}</option>
                              ))}
                            </select>
                          </label>
                          <label className="form-stack">
                            <span className="field-label">Filter by tag</span>
                            <select className="input" value={filterTag} onChange={(event) => setFilterTag(event.target.value)}>
                              <option value="">All tags</option>
                              {topicTags.map((tag) => (
                                <option key={tag.name} value={tag.name}>{tag.name}</option>
                              ))}
                            </select>
                          </label>
                          <label className="form-stack">
                            <span className="field-label">Search by name/content</span>
                            <input className="input" value={filterText} onChange={(event) => setFilterText(event.target.value)} placeholder="search..." />
                          </label>
                          <button className="table-btn" type="button" onClick={() => { clearFilters(); setShowFilterMenu(false); }}>Reset Filters</button>
                        </div>
                      ) : null}
                    </div>
                  </div> : null}
                  </div>
                  <p className="hint">{showReviewCenter ? `Pending review: ${effectiveReviewQueue.length}` : `Selected: ${selectedFolderLabel} · Showing ${workspaceTab === "generated" ? 0 : filteredUploadedDocuments.length} uploaded and ${workspaceTab === "files" ? 0 : filteredGeneratedDocuments.length} generated`}</p>
                </div>

                {showTagEditor ? (
                  <div className="selection-box workspace-tags-collapse">
                    <div className="box-head">
                      <h5>Topic Tags</h5>
                    </div>

                    <form className="form-stack" onSubmit={handleAddTopicTag}>
                      <input
                        className="input"
                        placeholder="Add a topic tag"
                        value={topicTagName}
                        onChange={(event) => setTopicTagName(event.target.value)}
                        disabled={isWorking}
                      />
                      <button className="ghost-btn" type="submit" disabled={isWorking}>Add Tag</button>
                    </form>

                    <div className="chip-stack" style={{ marginTop: "10px" }}>
                      {topicTags.map((tag) => (
                        <div className="scope-chip-row tag-row" key={tag.name}>
                          {renameTopicTagFrom === tag.name ? (
                            <>
                              <input
                                className="input chip-input"
                                value={renameTopicTagTo}
                                onChange={(event) => setRenameTopicTagTo(event.target.value)}
                                disabled={isWorking}
                              />
                              <button className="table-btn" type="button" onClick={handleSaveRenameTopicTag} disabled={isWorking}>Save</button>
                              <button className="table-btn" type="button" onClick={() => setRenameTopicTagFrom("")} disabled={isWorking}>Cancel</button>
                            </>
                          ) : (
                            <>
                              <span className="scope-chip" style={{ backgroundColor: `${getTagColor(tag.name)}2a`, borderColor: getTagColor(tag.name) }}>#{tag.name}</span>
                              <input
                                className="input color-input"
                                type="color"
                                value={getTagColor(tag.name)}
                                onChange={(event) => {
                                  const nextColor = normalizeTopicTagColor(event.target.value);
                                  setTagColorDraftByName((prev) => ({ ...prev, [tag.name]: nextColor }));
                                  onSetTopicTagColor(tag.name, nextColor);
                                }}
                                disabled={isWorking}
                              />
                              <button className="table-btn" type="button" onClick={() => handleStartRenameTopicTag(tag)} disabled={isWorking}>Rename</button>
                              <button className="table-btn danger" type="button" onClick={() => handleRemoveTopicTag(tag)} disabled={isWorking}>Delete</button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {showReviewCenter ? renderReviewCenterPanel() : null}

                {!showReviewCenter && workspaceTab === "shared" ? (
                  <div className="selection-box">
                    <h5 style={{ marginTop: 0 }}>Shared With Me</h5>
                    <p className="hint">No shared files yet. This placeholder keeps the same visual workspace structure.</p>
                  </div>
                ) : null}

                {!showReviewCenter && workspaceTab !== "shared" ? (
                  <div className="folder-tree-visual">
                    {(folderChildrenMap.get("") || []).map((folder) => renderFolderNode(folder, 0))}

                    {workspaceTab !== "generated" && unfiledUploadedDocuments.length ? (
                    <div className="folder-indent-wrap">
                      <div className="folder-node unfiled uploaded-group">
                        <div className="folder-node-head">
                          <div className="folder-node-title">
                            <button className="tree-toggle" type="button" onClick={() => setUnfiledCollapsed((prev) => !prev)}>
                              {unfiledCollapsed ? "+" : "-"}
                            </button>
                            <span className="folder-node-main">📄 Unfiled Uploaded Documents {pendingUnfiledCount > 0 ? <span aria-label="pending review" title="Contains documents pending review">⚠️</span> : null}</span>
                          </div>
                        </div>
                        {!unfiledCollapsed ? (
                          <div className="folder-docs-list">
                            {unfiledUploadedDocuments.map((doc) => renderInlineDocumentRow(doc, `unfiled-uploaded-${doc.id}`))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    ) : null}
                    {workspaceTab !== "files" && unfiledGeneratedDocuments.length ? (
                    <div className="folder-indent-wrap">
                      <div className="folder-node unfiled generated-group">
                        <div className="folder-node-head">
                          <div className="folder-node-title">
                            <button className="tree-toggle" type="button" onClick={() => toggleFolderDocsCollapsed("unfiled-generated")}>
                              {collapsedFolderDocs["unfiled-generated"] ? "+" : "-"}
                            </button>
                            <span className="folder-node-main">🤖 Unfiled Generated Documents</span>
                          </div>
                        </div>
                        {!collapsedFolderDocs["unfiled-generated"] ? (
                          <div className="folder-docs-list">
                            {unfiledGeneratedDocuments.map((doc) => renderInlineDocumentRow(doc, `unfiled-generated-${doc.id}`))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    ) : null}
                    {!flattenedFolders.length ? <p className="hint">No folders yet for this subject.</p> : null}
                  </div>
                ) : null}

              </div>
            </>
          ) : (
            <p className="hint">Choose a subject to view folders and documents.</p>
          )}
        </article>
      ) : null}

      {showFolderModal ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-head">
              <h4>Add Folder / Subfolder</h4>
              <button className="table-btn" type="button" onClick={() => setShowFolderModal(false)}>Close</button>
            </div>
            <div className="form-stack" style={{ marginTop: "10px" }}>
              <input
                className="input"
                placeholder="Folder name"
                value={folderName}
                onChange={(event) => setFolderName(event.target.value)}
              />
              <select className="input" value={parentFolderId} onChange={(event) => setParentFolderId(event.target.value)}>
                <option value="">Top level folder</option>
                {flattenedFolders.map((folder) => (
                  <option key={folder.id} value={folder.id}>{folderLabels.get(folder.id)}</option>
                ))}
              </select>
              <button className="primary-btn" type="button" onClick={handleAddFolder}>Add</button>
            </div>
          </div>
        </div>
      ) : null}

      {showUploadModal ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-head">
              <h4>Add Uploaded Documents</h4>
              <button className="table-btn" type="button" onClick={() => setShowUploadModal(false)}>Close</button>
            </div>
            <div className="form-stack" style={{ marginTop: "10px" }}>
              <label className="upload-box">
                <span>Select files (TXT, PDF, DOCX, PPTX, images, and more)</span>
                <input
                  type="file"
                  accept=".txt,.md,.csv,.json,.pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tif,.tiff,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/*"
                  multiple
                  onChange={(event) => {
                    const incoming = Array.from(event.target.files || []);
                    setPendingFiles((previous) => previous.concat(incoming));
                  }}
                />
              </label>

              <label className="upload-box">
                <span>Or upload a folder structure</span>
                <input
                  type="file"
                  multiple
                  webkitdirectory="true"
                  directory="true"
                  onChange={(event) => {
                    const incoming = Array.from(event.target.files || []);
                    setPendingFiles((previous) => previous.concat(incoming));
                  }}
                />
              </label>

              {pendingFiles.length ? <p className="hint">{pendingFiles.length} files selected</p> : null}

              <label className="scope-chip-row" style={{ marginTop: "6px" }}>
                <input
                  type="checkbox"
                  checked={uploadStrictQualityGate}
                  onChange={(event) => setUploadStrictQualityGate(event.target.checked)}
                />
                <span className="scope-chip">
                  Strict extraction quality gate (block low-confidence files before upload)
                </span>
              </label>
              <p className="hint" style={{ margin: 0 }}>
                If disabled, files upload and appear with a warning in folders and Review Center until approved.
              </p>

              <div>
                <p className="field-label">Assign to folders</p>
                <div className="chip-stack finder-upload-folders">
                  {flattenedFolders.map((folder) => (
                    <label className="scope-chip-row" key={folder.id}>
                      <input
                        type="checkbox"
                        checked={uploadFolderIds.includes(folder.id)}
                        onChange={() => toggleUploadFolder(folder.id)}
                      />
                      <span className="scope-chip">{folderLabels.get(folder.id)}</span>
                    </label>
                  ))}
                </div>
              </div>

              <input
                className="input"
                placeholder="Type a new tag"
                value={uploadTagDraft}
                onChange={(event) => setUploadTagDraft(event.target.value)}
              />

              <div className="inline-actions">
                <button
                  className="table-btn"
                  type="button"
                  onClick={() => {
                    addTagToSelection(uploadTagDraft, setUploadSelectedTags);
                    setUploadTagDraft("");
                  }}
                >
                  Add Tag
                </button>
              </div>

              <div className="chip-wrap">
                {topicTagNames.map((tagName) => (
                  <button
                    key={`upload-existing-${tagName}`}
                    className="table-btn"
                    type="button"
                    onClick={() => addTagToSelection(tagName, setUploadSelectedTags)}
                  >
                    + {tagName}
                  </button>
                ))}
              </div>

              <div className="chip-wrap">
                {uploadSelectedTags.map((tagName) => (
                    <span className="scope-chip tag-picked" key={`upload-picked-${tagName}`} style={{ backgroundColor: `${getTagColor(tagName)}2a`, borderColor: getTagColor(tagName) }}>
                    {tagName}
                    <button type="button" className="tag-remove-btn" onClick={() => removeTagFromSelection(tagName, setUploadSelectedTags)}>x</button>
                  </span>
                ))}
              </div>

              <button className="primary-btn" type="button" onClick={handleUploadSubmit} disabled={!pendingFiles.length}>Add Uploaded Documents</button>
              {uploadErrorMessage ? <p className="hint" style={{ color: "#b84a77" }}>{uploadErrorMessage}</p> : null}
              <div className="inline-actions">
                <button className="table-btn" type="button" onClick={() => { setWorkspaceTab("review-center"); setShowUploadModal(false); }}>Go To Review Center</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {previewDoc ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-head">
              <h4>{previewDoc.name}</h4>
              <button className="table-btn" onClick={() => setPreviewDoc(null)} type="button">Close</button>
            </div>
            <p className="hint">{previewDoc.sizeLabel} · Preview</p>

            <div className="chip-wrap" style={{ marginTop: "10px" }}>
              {getPreviewModeOptions(previewDoc).map((mode) => (
                <button
                  key={`preview-mode-${previewDoc.id}-${mode}`}
                  className="table-btn"
                  type="button"
                  onClick={async () => {
                    setPreviewMode(mode);
                    if (mode !== "txt") {
                      await loadUploadedPreviewMode(previewDoc.id, mode);
                    }
                  }}
                  disabled={previewLoadingMode === mode}
                  style={previewMode === mode ? { borderColor: "#71ddff", boxShadow: "inset 0 0 0 1px #71ddff" } : undefined}
                >
                  {getPreviewModeLabel(mode)}
                </button>
              ))}
            </div>

            {previewError ? <p className="hint" style={{ color: "#b84a77" }}>{previewError}</p> : null}

            {previewMode === "txt" ? (
              <pre className="doc-preview">{previewDoc.content || "(empty file)"}</pre>
            ) : null}

            {previewMode === "markdown" ? (
              <>
                {previewLoadingMode === "markdown" ? <p className="hint">Loading Markdown preview…</p> : null}
                {previewDownloads.markdown?.content ? (
                  <>
                    <div
                      className="doc-preview rich-html-render"
                      dangerouslySetInnerHTML={{ __html: renderLatexInHtml(markdownToBasicHtml(previewDownloads.markdown.content)) }}
                    />
                    <details style={{ marginTop: "8px" }}>
                      <summary className="hint">Show raw Markdown</summary>
                      <pre className="doc-preview" style={{ marginTop: "8px" }}>{previewDownloads.markdown.content}</pre>
                    </details>
                  </>
                ) : null}
              </>
            ) : null}

            {previewMode === "html" ? (
              <>
                {previewLoadingMode === "html" ? <p className="hint">Loading HTML preview…</p> : null}
                {previewDownloads.html?.content ? (
                  <iframe
                    title={`HTML preview for ${previewDoc.name}`}
                    className="doc-preview-frame"
                    srcDoc={previewDownloads.html.content}
                  />
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {reviewCompareDoc ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ maxWidth: "1200px" }}>
            <style>{`@keyframes luna-risk-flash { 0% { box-shadow: 0 0 0 0 rgba(95,120,214,0.55); } 100% { box-shadow: 0 0 0 8px rgba(95,120,214,0); } }`}</style>
            <div className="modal-head">
              <h4>Review Document: {reviewCompareDoc.name}</h4>
              <button className="table-btn" type="button" onClick={() => setReviewCompareDoc(null)}>Close</button>
            </div>
            <p className="hint" style={{ marginTop: "8px" }}>
              Risk manager mode: edit the uploaded document as HTML or Markdown, then save or bulk-approve when ready.
            </p>
            <section className="selection-box" style={{ marginTop: "12px" }}>
              {(() => {
                const stats = getReviewProgressStats(reviewCompareDoc);
                return (
                  <div className="inline-actions" style={{ marginBottom: "8px", flexWrap: "wrap" }}>
                    <span className="scope-chip">Risk highlights: {stats.total}</span>
                    <span className="hint">You can delete and rewrite any highlighted text directly in the HTML document.</span>
                  </div>
                );
              })()}
              <div ref={sourceViewerRef}>
                {renderSourceVisualizer(reviewCompareDoc)}
              </div>
            </section>
            {renderCanonicalVerificationPanel(reviewCompareDoc, false)}
            <div className="inline-actions" style={{ marginTop: "10px" }}>
              <button
                className="table-btn"
                type="button"
                disabled={reviewingDocumentId === reviewCompareDoc.id || isWorking}
                onClick={() => saveReviewHtmlDraft(reviewCompareDoc)}
              >
                Save
              </button>
              <button
                className="table-btn"
                type="button"
                onClick={() => setShowFormulaDebug((previous) => !previous)}
              >
                {showFormulaDebug ? "Hide Formula Debug" : "Show Formula Debug"}
              </button>
              <button
                className="primary-btn"
                type="button"
                disabled={reviewingDocumentId === reviewCompareDoc.id || isWorking}
                onClick={() => bulkApproveCurrentDocument(reviewCompareDoc)}
              >
                Bulk Approve Document
              </button>
              <button className="primary-btn" type="button" onClick={() => setReviewCompareDoc(null)}>Done Editing</button>
            </div>

            {showFormulaDebug ? (
              <section className="selection-box" style={{ marginTop: "10px" }}>
                <h5 style={{ marginTop: 0 }}>Formula Extraction Debug</h5>
                {getFormulaDebugRows(reviewCompareDoc).length ? (
                  <div className="chip-stack">
                    {getFormulaDebugRows(reviewCompareDoc).map((row) => (
                      <div key={`formula-debug-${row.id}`} className="selection-box" style={{ margin: 0, background: "#fff", borderColor: "#c8d7ff" }}>
                        <p style={{ margin: "0 0 6px", fontWeight: 700, color: "#1a2a4d" }}>[{row.id}] {row.label}</p>
                        <p className="hint" style={{ margin: "0 0 4px" }}><b>OMML snippet</b></p>
                        <pre className="doc-preview" style={{ marginTop: 0, maxHeight: "120px", overflow: "auto" }}>{row.omml || "(none)"}</pre>
                        <p className="hint" style={{ margin: "8px 0 4px" }}><b>Transformed MathML</b></p>
                        <pre className="doc-preview" style={{ marginTop: 0, maxHeight: "120px", overflow: "auto" }}>{row.mathMl || "(none)"}</pre>
                        <p className="hint" style={{ margin: "8px 0 4px" }}><b>Final LaTeX used in viewer</b></p>
                        <pre className="doc-preview" style={{ marginTop: 0 }}>{row.latex || "(none)"}</pre>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="hint">No formula tokens found for this document.</p>
                )}
              </section>
            ) : null}
          </div>
        </div>
      ) : null}

      {downloadPickerDoc ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-head">
              <h4>Download {downloadPickerDoc.name}</h4>
              <button className="table-btn" type="button" onClick={() => setDownloadPickerDoc(null)}>Close</button>
            </div>

            <p className="hint" style={{ marginTop: "6px" }}>Choose export format</p>
            <div className="chip-wrap" style={{ marginTop: "10px" }}>
              {((downloadPickerDoc.sourceType === "generated")
                ? (Array.isArray(downloadPickerDoc.availableFormats) && downloadPickerDoc.availableFormats.length ? downloadPickerDoc.availableFormats : ["txt"])
                : getUploadedDownloadFormats()).map((format) => (
                <button
                  key={`${downloadPickerDoc.id}-download-${format}`}
                  className="table-btn"
                  type="button"
                  onClick={async () => {
                    if (downloadPickerDoc.sourceType === "generated") {
                      await handleDownloadGeneratedDocument(downloadPickerDoc, format);
                    } else {
                      await handleDownloadUploadedDocument(downloadPickerDoc, format);
                    }
                    setDownloadPickerDoc(null);
                  }}
                >
                  {String(format || "").toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {editDocMeta ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-head">
              <h4>Edit Document Metadata</h4>
              <button className="table-btn" onClick={() => setEditDocMeta(null)} type="button">Close</button>
            </div>

            <p className="hint" style={{ marginTop: "8px" }}>{editDocMeta.name}</p>

            <div className="doc-meta-grid">
              <div className="form-stack">
                <span className="field-label">Folders</span>
                <div className="chip-stack finder-upload-folders">
                  {flattenedFolders.map((folder) => (
                    <label className="scope-chip-row" key={`edit-${folder.id}`}>
                      <input
                        type="checkbox"
                        checked={editDocFolderIds.includes(folder.id)}
                        onChange={() => toggleEditDocFolder(folder.id)}
                      />
                      <span className="scope-chip">{folderLabels.get(folder.id)}</span>
                    </label>
                  ))}
                </div>
              </div>

              <label className="form-stack">
                <span className="field-label">Tags</span>
                <input
                  className="input"
                  value={editDocTagDraft}
                  onChange={(event) => setEditDocTagDraft(event.target.value)}
                  placeholder="Type a new tag"
                />

                <div className="inline-actions">
                  <button
                    className="table-btn"
                    type="button"
                    onClick={() => {
                      addTagToSelection(editDocTagDraft, setEditDocSelectedTags);
                      setEditDocTagDraft("");
                    }}
                  >
                    Add Tag
                  </button>
                </div>

                <div className="chip-wrap">
                  {topicTagNames.map((tagName) => (
                    <button
                      key={`edit-existing-${tagName}`}
                      className="table-btn"
                      type="button"
                      onClick={() => addTagToSelection(tagName, setEditDocSelectedTags)}
                    >
                      + {tagName}
                    </button>
                  ))}
                </div>

                <div className="chip-wrap">
                  {editDocSelectedTags.map((tagName) => (
                    <span className="scope-chip tag-picked" key={`edit-picked-${tagName}`} style={{ backgroundColor: `${getTagColor(tagName)}2a`, borderColor: getTagColor(tagName) }}>
                      {tagName}
                      <button type="button" className="tag-remove-btn" onClick={() => removeTagFromSelection(tagName, setEditDocSelectedTags)}>x</button>
                    </span>
                  ))}
                </div>
              </label>
            </div>

            <div className="inline-actions" style={{ marginTop: "10px" }}>
              <button className="primary-btn" type="button" onClick={handleSaveDocMeta}>Save Changes</button>
              <button className="table-btn" type="button" onClick={() => setEditDocMeta(null)}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}

      {editContentDoc ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ maxWidth: "1100px" }}>
            <div className="modal-head">
              <h4>Visual Content Editor</h4>
              <button
                className="table-btn"
                onClick={() => {
                  setEditContentDoc(null);
                  setEditContentHtmlDraft("");
                  setEditContentBlocks([]);
                  editContentWorkingHtmlRef.current = "";
                  setEditContentStatusMessage("");
                }}
                type="button"
              >
                Close
              </button>
            </div>

            <p className="hint" style={{ marginTop: "8px" }}>
              Edit directly in the viewer like a document editor. Save applies changes to review center, downloads (HTML/Markdown), and LLM input.
            </p>

            <div className="inline-actions" style={{ marginTop: "10px", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
              <div className="inline-actions" style={{ gap: "8px", flexWrap: "wrap" }}>
                <button
                  className={editContentMode === "blocks" ? "primary-btn" : "table-btn"}
                  type="button"
                  onClick={() => {
                    const sourceHtml = editContentEditorRef.current
                      ? String(editContentEditorRef.current.innerHTML || "")
                      : String(editContentWorkingHtmlRef.current || editContentHtmlDraft || "");
                    if (sourceHtml.trim()) {
                      syncBlocksFromHtml(sourceHtml);
                    }
                    setEditContentMode("blocks");
                  }}
                >
                  Block Editor
                </button>
                <button
                  className={editContentMode === "rich" ? "primary-btn" : "table-btn"}
                  type="button"
                  onClick={() => {
                    const nextHtml = syncHtmlFromBlocks();
                    setEditContentHtmlDraft(nextHtml);
                    editContentWorkingHtmlRef.current = nextHtml;
                    setEditContentMode("rich");
                  }}
                >
                  Rich HTML
                </button>
              </div>
              <p className="hint" style={{ margin: 0 }}>Block mode supports add, reorder, type-switch, templates, and JSON export.</p>
            </div>

            {editContentMode === "blocks" ? (
              <>
                <div className="panel" style={{ marginTop: "10px", background: "#fff" }}>
                  <div className="inline-actions" style={{ gap: "8px", flexWrap: "wrap" }}>
                    <label className="search" style={{ minWidth: "260px" }}>
                      <span>Template</span>
                      <select className="input" value={editContentTemplateId} onChange={(event) => changeBlockTemplate(event.target.value)}>
                        {editContentTemplates.map((template) => (
                          <option key={template.id} value={template.id}>{template.name}</option>
                        ))}
                      </select>
                    </label>
                    <button className="table-btn" type="button" onClick={saveCurrentTemplateAsNew}>Save Template As New</button>
                    <button className="table-btn" type="button" onClick={deleteCurrentTemplate}>Delete Template</button>
                    <button className="table-btn" type="button" onClick={exportContentBlocksJson}>Download Blocks JSON</button>
                  </div>
                  <label className="search full" style={{ marginTop: "8px" }}>
                    <span>Template CSS (template repository)</span>
                    <textarea className="input" rows={4} value={editContentTemplateCssDraft} onChange={(event) => updateTemplateCssDraft(event.target.value)} />
                  </label>
                  <div className="inline-actions" style={{ marginTop: "8px" }}>
                    <button className="table-btn" type="button" onClick={applyTemplateCssDraft}>Apply Template CSS</button>
                  </div>
                </div>

                <div className="panel" style={{ marginTop: "10px", background: "#fff" }}>
                  <div className="inline-actions" style={{ gap: "8px", flexWrap: "wrap" }}>
                    {BLOCK_TYPE_OPTIONS.map((option) => (
                      <button key={`add-${option.value}`} className="table-btn" type="button" onClick={() => addContentBlock(option.value)}>
                        + {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: "10px", maxHeight: "56vh", overflow: "auto", background: "#f8fafc", border: "1px solid #dbe5f0", borderRadius: "10px", padding: "10px" }}>
                  {editContentBlocks.map((block, index) => {
                    const type = String(block.type || "paragraph");
                    return (
                      <div
                        key={block.id}
                        className="panel"
                        style={{ marginBottom: "10px", background: "#fff", border: "1px solid #d7e1ee" }}
                        draggable
                        onDragStart={() => { editContentDragIndexRef.current = index; }}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => {
                          const from = Number(editContentDragIndexRef.current);
                          moveContentBlock(from, index);
                          editContentDragIndexRef.current = -1;
                        }}
                      >
                        <div className="inline-actions" style={{ justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <div className="inline-actions" style={{ gap: "8px", flexWrap: "wrap" }}>
                            <strong>Block {index + 1}</strong>
                            <select className="input" value={type} onChange={(event) => changeContentBlockType(block.id, event.target.value)}>
                              {BLOCK_TYPE_OPTIONS.map((option) => (
                                <option key={`${block.id}-${option.value}`} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </div>
                          <div className="inline-actions" style={{ gap: "6px", flexWrap: "wrap" }}>
                            <button className="table-btn" type="button" onClick={() => moveContentBlock(index, Math.max(0, index - 1))}>Up</button>
                            <button className="table-btn" type="button" onClick={() => moveContentBlock(index, Math.min(editContentBlocks.length - 1, index + 1))}>Down</button>
                            <button className="table-btn" type="button" onClick={() => addContentBlock("paragraph", index)}>Insert After</button>
                            <button className="table-btn" type="button" onClick={() => removeContentBlock(block.id)}>Delete</button>
                          </div>
                        </div>

                        {(type === "heading1" || type === "heading2" || type === "heading3" || type === "paragraph") ? (
                          <label className="search full" style={{ marginTop: "8px" }}>
                            <span>Text</span>
                            <textarea
                              className="input"
                              rows={type.startsWith("heading") ? 2 : 4}
                              value={String(block.text || "")}
                              onChange={(event) => updateContentBlock(block.id, { text: event.target.value })}
                            />
                          </label>
                        ) : null}

                        {type === "bullet_list" ? (
                          <label className="search full" style={{ marginTop: "8px" }}>
                            <span>One bullet per line</span>
                            <textarea
                              className="input"
                              rows={5}
                              value={(Array.isArray(block.items) ? block.items : []).join("\n")}
                              onChange={(event) => updateContentBlock(block.id, { items: String(event.target.value || "").split(/\n+/).map((item) => item.trim()).filter(Boolean) })}
                            />
                          </label>
                        ) : null}

                        {type === "inline_formula" ? (
                          <div className="inline-actions" style={{ marginTop: "8px", flexWrap: "wrap" }}>
                            <label className="search" style={{ minWidth: "220px", flex: 1 }}>
                              <span>Text Before</span>
                              <input className="input" value={String(block.textBefore || "")} onChange={(event) => updateContentBlock(block.id, { textBefore: event.target.value })} />
                            </label>
                            <label className="search" style={{ minWidth: "220px", flex: 1 }}>
                              <span>LaTeX</span>
                              <input className="input" value={String(block.latex || "")} onChange={(event) => updateContentBlock(block.id, { latex: event.target.value })} />
                            </label>
                            <label className="search" style={{ minWidth: "220px", flex: 1 }}>
                              <span>Text After</span>
                              <input className="input" value={String(block.textAfter || "")} onChange={(event) => updateContentBlock(block.id, { textAfter: event.target.value })} />
                            </label>
                          </div>
                        ) : null}

                        {type === "standalone_formula" ? (
                          <label className="search full" style={{ marginTop: "8px" }}>
                            <span>Display LaTeX</span>
                            <textarea className="input" rows={3} value={String(block.latex || "")} onChange={(event) => updateContentBlock(block.id, { latex: event.target.value })} />
                          </label>
                        ) : null}

                        {type === "table" ? (
                          <label className="search full" style={{ marginTop: "8px" }}>
                            <span>Table rows (use | between cells)</span>
                            <textarea
                              className="input"
                              rows={5}
                              value={blockRowsToText(block.rows || [])}
                              onChange={(event) => updateContentBlock(block.id, { rows: tableTextToRows(event.target.value) })}
                            />
                          </label>
                        ) : null}

                        {type === "image" ? (
                          <div className="inline-actions" style={{ marginTop: "8px", flexWrap: "wrap" }}>
                            <label className="search" style={{ minWidth: "260px", flex: 2 }}>
                              <span>Image URL or Data URL</span>
                              <input className="input" value={String(block.src || "")} onChange={(event) => updateContentBlock(block.id, { src: event.target.value })} />
                            </label>
                            <label className="search" style={{ minWidth: "180px", flex: 1 }}>
                              <span>Alt Text</span>
                              <input className="input" value={String(block.alt || "")} onChange={(event) => updateContentBlock(block.id, { alt: event.target.value })} />
                            </label>
                            <label className="search" style={{ minWidth: "180px", flex: 1 }}>
                              <span>Caption</span>
                              <input className="input" value={String(block.caption || "")} onChange={(event) => updateContentBlock(block.id, { caption: event.target.value })} />
                            </label>
                          </div>
                        ) : null}

                        {type === "url" ? (
                          <div className="inline-actions" style={{ marginTop: "8px", flexWrap: "wrap" }}>
                            <label className="search" style={{ minWidth: "260px", flex: 2 }}>
                              <span>URL</span>
                              <input className="input" value={String(block.href || "")} onChange={(event) => updateContentBlock(block.id, { href: event.target.value })} />
                            </label>
                            <label className="search" style={{ minWidth: "180px", flex: 1 }}>
                              <span>Label</span>
                              <input className="input" value={String(block.text || "")} onChange={(event) => updateContentBlock(block.id, { text: event.target.value })} />
                            </label>
                          </div>
                        ) : null}

                        {type === "code" ? (
                          <>
                            <label className="search" style={{ marginTop: "8px", maxWidth: "220px" }}>
                              <span>Language</span>
                              <input className="input" value={String(block.language || "text")} onChange={(event) => updateContentBlock(block.id, { language: event.target.value })} />
                            </label>
                            <label className="search full" style={{ marginTop: "8px" }}>
                              <span>Code</span>
                              <textarea className="input" rows={5} value={String(block.code || "")} onChange={(event) => updateContentBlock(block.id, { code: event.target.value })} />
                            </label>
                          </>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="rich-editor-toolbar-group-grid" style={{ marginTop: "10px" }}>
                <details className="rich-editor-group" open>
                  <summary>Text Format</summary>
                  <div className="inline-actions rich-editor-toolbar" style={{ marginTop: "8px", flexWrap: "wrap" }}>
                    <button className="table-btn" type="button" onClick={() => runEditContentCommand("bold")}><b>B</b></button>
                    <button className="table-btn" type="button" onClick={() => runEditContentCommand("italic")}><i>I</i></button>
                    <button className="table-btn" type="button" onClick={() => runEditContentCommand("underline")}><u>U</u></button>
                    <button className="table-btn" type="button" onClick={() => runEditContentCommand("undo")}>Undo</button>
                    <button className="table-btn" type="button" onClick={() => runEditContentCommand("redo")}>Redo</button>
                    <select className="input" style={{ maxWidth: "220px" }} value={editContentFontFamily} onChange={(event) => applyEditContentFontFamily(event.target.value)}>
                      <option value="Avenir Next">Avenir Next</option>
                      <option value="Georgia">Georgia</option>
                      <option value="Times New Roman">Times New Roman</option>
                      <option value="Arial">Arial</option>
                      <option value="Courier New">Courier New</option>
                    </select>
                    <select className="input" style={{ maxWidth: "120px" }} value={editContentFontSize} onChange={(event) => applyEditContentFontSize(event.target.value)}>
                      <option value="12">12px</option>
                      <option value="14">14px</option>
                      <option value="16">16px</option>
                      <option value="18">18px</option>
                      <option value="20">20px</option>
                      <option value="24">24px</option>
                      <option value="28">28px</option>
                      <option value="32">32px</option>
                    </select>
                    <button className="table-btn" type="button" onClick={() => applyEditContentHeading(1)}>H1</button>
                    <button className="table-btn" type="button" onClick={() => applyEditContentHeading(2)}>H2</button>
                    <button className="table-btn" type="button" onClick={() => applyEditContentHeading(3)}>H3</button>
                    <button className="table-btn" type="button" onClick={() => applyEditContentHeading(4)}>H4</button>
                    <button className="table-btn" type="button" onClick={() => applyEditContentHeading(5)}>H5</button>
                    <button className="table-btn" type="button" onClick={() => applyEditContentHeading(6)}>H6</button>
                    <label className="table-btn" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                      Text
                      <input type="color" value={editContentTextColorValue} onChange={(event) => setEditContentTextColor(event.target.value)} />
                    </label>
                    <label className="table-btn" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                      Background
                      <input type="color" value={editContentBackgroundColorValue} onChange={(event) => setEditContentBackgroundColor(event.target.value)} />
                    </label>
                    <button className="table-btn" type="button" onClick={() => runEditContentCommand("removeFormat")}>Clear Format</button>
                  </div>
                </details>

                <details className="rich-editor-group">
                  <summary>Insert</summary>
                  <div className="inline-actions rich-editor-toolbar" style={{ marginTop: "8px", flexWrap: "wrap" }}>
                    <button className="table-btn" type="button" onClick={() => runEditContentCommand("createLink", window.prompt("Paste link URL") || "")}>Link / URL</button>
                    <button className="table-btn" type="button" onClick={insertEditContentImage}>Image URL</button>
                    <button className="table-btn" type="button" onClick={openEditContentImageFilePicker}>Image File</button>
                    <button className="table-btn" type="button" onClick={addTableToEditContent}>Table</button>
                  </div>
                </details>

                <details className="rich-editor-group">
                  <summary>Lists</summary>
                  <div className="inline-actions rich-editor-toolbar" style={{ marginTop: "8px", flexWrap: "wrap" }}>
                    <button className="table-btn" type="button" onClick={() => runEditContentCommand("insertUnorderedList")}>Bullets</button>
                    <button className="table-btn" type="button" onClick={() => runEditContentCommand("insertOrderedList")}>Numbering</button>
                  </div>
                </details>

                <details className="rich-editor-group">
                  <summary>Tables</summary>
                  <div className="inline-actions rich-editor-toolbar" style={{ marginTop: "8px", flexWrap: "wrap" }}>
                    <button className="table-btn" type="button" onClick={() => addTableRowInEditContent(false)}>Add Row Above</button>
                    <button className="table-btn" type="button" onClick={() => addTableRowInEditContent(true)}>Add Row Below</button>
                    <button className="table-btn" type="button" onClick={deleteTableRowInEditContent}>Delete Row</button>
                    <button className="table-btn" type="button" onClick={() => addTableColumnInEditContent(false)}>Add Col Left</button>
                    <button className="table-btn" type="button" onClick={() => addTableColumnInEditContent(true)}>Add Col Right</button>
                    <button className="table-btn" type="button" onClick={deleteTableColumnInEditContent}>Delete Col</button>
                  </div>
                </details>

                <details className="rich-editor-group">
                  <summary>Math</summary>
                  <div className="inline-actions rich-editor-toolbar" style={{ marginTop: "8px", flexWrap: "wrap" }}>
                    <button className="table-btn" type="button" onClick={() => insertEditContentLatex(false)}>Inline LaTeX</button>
                    <button className="table-btn" type="button" onClick={() => insertEditContentLatex(true)}>Display LaTeX</button>
                  </div>
                </details>
              </div>
            )}

            <input
              ref={editContentImageInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleEditContentImageFileChange}
            />

            {isPreparingEditContent ? <p className="hint" style={{ marginTop: "8px" }}>Preparing editor content with embedded images...</p> : null}

            {editContentMode === "rich" ? (
              <div
                ref={editContentEditorRef}
                className="doc-preview rich-html-editor"
                style={{ minHeight: "340px", maxHeight: "56vh", overflow: "auto", background: "#fff" }}
                contentEditable
                suppressContentEditableWarning
                onInput={syncEditContentDraftFromEditor}
                dangerouslySetInnerHTML={{ __html: editContentHtmlDraft }}
              />
            ) : (
              <div
                className="doc-preview rich-html-render"
                style={{ minHeight: "220px", maxHeight: "38vh", overflow: "auto", background: "#fff", marginTop: "10px" }}
                dangerouslySetInnerHTML={{ __html: blocksToHtml(editContentBlocks, activeBlockTemplate()) }}
              />
            )}

            <div className="inline-actions" style={{ marginTop: "12px" }}>
              <button className="table-btn" type="button" onClick={handleDownloadEditedContentHtml} disabled={isPreparingEditContent || isSavingEditContent || isWorking}>
                Download HTML
              </button>
              <button className="primary-btn" type="button" onClick={handleSaveEditedContent} disabled={isSavingEditContent || isWorking}>
                {isSavingEditContent ? "Saving..." : "Save All Edits"}
              </button>
            </div>
            {editContentStatusMessage ? <p className="hint" style={{ marginTop: "10px" }}>{editContentStatusMessage}</p> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function QuizView() {
  return (
    <section className="view-stack">
      <ScopeBar />
      <div className="panel-grid two-wide">
        <article className="panel">
          <h4>Question 7 of 20</h4>
          <p>What is the derivative of f(x) = x ln(x)?</p>
          <ul className="line-list">
            <li>A. ln(x) + 1</li>
            <li>B. 1/x</li>
            <li>C. ln(x)</li>
            <li>D. x ln(x) + x</li>
          </ul>
          <p className="hint">Placeholder feedback and grading flow.</p>
        </article>
        <article className="panel">
          <h4>Progress</h4>
          <ul className="line-list">
            <li>Answered: 6/20</li>
            <li>Correct: 5</li>
            <li>Accuracy: 83%</li>
          </ul>
          <h4>Export</h4>
          <div className="chip-grid">
            <button className="chip">PDF Student</button>
            <button className="chip">PDF Teacher</button>
            <button className="chip">Word</button>
            <button className="chip">JSON</button>
          </div>
        </article>
      </div>
    </section>
  );
}

export function ChatView() {
  return (
    <section className="view-stack">
      <ScopeBar />
      <article className="panel">
        <h4>Tutor Chat</h4>
        <div className="chat-feed">
          <p><b>AI:</b> I am limited to Mathematics with Integrals tag.</p>
          <p><b>You:</b> Explain chain rule with my notes.</p>
          <p><b>AI:</b> Chain rule placeholder response with citation.</p>
        </div>
        <label className="search full">
          <span>Ask within selected scope</span>
          <input placeholder="Type your question" />
        </label>
      </article>
    </section>
  );
}

export function AnalyticsView() {
  return (
    <section className="view-stack">
      <ScopeBar label="Assess" />
      <div className="panel-grid three">
        <article className="panel">
          <h4>Mastery</h4>
          <h3>78%</h3>
          <p className="hint">Up 12% this month</p>
        </article>
        <article className="panel">
          <h4>Strong</h4>
          <ul className="line-list">
            <li>Derivatives: 91%</li>
            <li>Limits: 86%</li>
          </ul>
        </article>
        <article className="panel">
          <h4>Needs Work</h4>
          <ul className="line-list">
            <li>Integration: 63%</li>
            <li>Integration by Parts: 41%</li>
          </ul>
        </article>
      </div>
      <article className="panel accent">
        AI Insight placeholder: 3 short sessions on Integration by Parts can improve projected score.
      </article>
    </section>
  );
}

export function MarketplaceView({ onGoBuilder }) {
  return (
    <section className="view-stack">
      <div className="panel-grid three">
        <article className="panel"><h4>GMAT Coach</h4><p>Adaptive exam prep placeholder.</p></article>
        <article className="panel"><h4>IELTS Speaking Coach</h4><p>Speaking simulation placeholder.</p></article>
        <article className="panel"><h4>Worksheet Generator</h4><p>Teacher worksheet placeholder.</p></article>
      </div>
      <article className="panel">
        <h4>Build your own agent</h4>
        <p>Create prompt, scope and pricing without coding.</p>
        <button className="primary-btn" onClick={onGoBuilder}>Create Agent</button>
      </article>
    </section>
  );
}

export function BuilderView() {
  return (
    <section className="view-stack">
      <div className="panel-grid two-wide">
        <article className="panel">
          <h4>Agent Configuration</h4>
          <ul className="line-list">
            <li>Name and category placeholder</li>
            <li>Description and system prompt placeholder</li>
            <li>Knowledge scope placeholder</li>
            <li>Input/output schema placeholder</li>
          </ul>
        </article>
        <article className="panel">
          <h4>Pricing and Publish</h4>
          <ul className="line-list">
            <li>Model selector placeholder</li>
            <li>Subscription price placeholder</li>
            <li>Visibility placeholder</li>
            <li>Sandbox test placeholder</li>
          </ul>
        </article>
      </div>
    </section>
  );
}

export function RevenueView() {
  return (
    <section className="view-stack">
      <div className="kpi-grid">
        <article className="kpi-card teal"><p>Revenue 30d</p><h3>$4,820</h3><small>+23%</small></article>
        <article className="kpi-card orange"><p>Total Runs</p><h3>12.4k</h3><small>+1.8k</small></article>
        <article className="kpi-card sky"><p>Active Users</p><h3>842</h3><small>+96</small></article>
        <article className="kpi-card rose"><p>Avg Rating</p><h3>4.8</h3><small>312 reviews</small></article>
      </div>
      <article className="panel">
        <h4>Agent performance table placeholder</h4>
        <p className="hint">Detailed financial reporting remains UI-only for now.</p>
      </article>
    </section>
  );
}
