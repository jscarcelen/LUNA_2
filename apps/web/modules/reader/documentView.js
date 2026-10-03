import { markdownToHtml } from "./markdown.js";

/**
 * Uploaded documents in the reader: their HTML, their text as blocks (so they can be laid out for a
 * PDF like any other output), and the notes and highlights the reader keeps for them.
 */

export const NOTES_TAG = "doc-notes";

/** The document's own rendering (images and maths included), made safe to place in the page. */
export function cleanDocumentHtml(source = "") {
  let html = String(source || "");
  const body = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  if (body) html = body[1];
  return html
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|base)[\s\S]*?(<\/\s*\1\s*>|$)/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|base)\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, "$1=$2#$2");
}

/** What the reader shows for a document: its rendering when it has one, else its text. */
export function htmlOfDocument(document) {
  const rendered = cleanDocumentHtml(document?.sourceRenderHtml || "");
  if (rendered.trim()) return rendered;
  const text = String(document?.content || document?.preview || "").trim();
  return text ? markdownToHtml(text) : "";
}

/** Markdown → the flat blocks Template Studio lays out (headings, paragraphs, bullets). Tables and maths stay as text. */
export function markdownToBlocks(markdown = "", title = "") {
  const blocks = [];
  if (title) blocks.push({ type: "document_header", title });
  let paragraph = [];
  let bullets = [];
  const flushParagraph = () => { if (paragraph.length) blocks.push({ type: "paragraph", text: paragraph.join(" ") }); paragraph = []; };
  const flushBullets = () => { if (bullets.length) blocks.push({ type: "bullet_list", title: null, items: bullets }); bullets = []; };
  for (const raw of String(markdown || "").replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const bullet = /^([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (heading) { flushParagraph(); flushBullets(); blocks.push({ type: "heading", text: heading[2].replace(/[*_`]/g, ""), level: Math.min(4, heading[1].length) }); continue; }
    if (bullet) { flushParagraph(); bullets.push(bullet[2].replace(/[*_`]/g, "")); continue; }
    if (!line) { flushParagraph(); flushBullets(); continue; }
    if (/^!\[.*\]\(.*\)$/.test(line) || /^[-|: ]+$/.test(line)) continue;
    flushBullets();
    paragraph.push(line.replace(/^\|/, "").replace(/\|$/, "").replace(/\s*\|\s*/g, " · ").replace(/[*_`]/g, ""));
  }
  flushParagraph();
  flushBullets();
  return blocks;
}

/* ------------------------------------------------------------------ notes saved next to the document */

export function notesDocumentFor(documents = [], documentId) {
  for (const candidate of documents) {
    if (!(candidate.tags || []).includes(NOTES_TAG)) continue;
    try {
      const parsed = JSON.parse(String(candidate.content || "{}"));
      if (parsed?.kind === "document-notes" && parsed.documentId === documentId) return { document: candidate, highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [] };
    } catch { /* unreadable */ }
  }
  return null;
}

/** Writes the document's notes and highlights: updates the notes file when there is one, else creates it. */
export async function saveDocumentNotes({ document, existing, list, onSaveGeneratedQuizDocument, onUpdateGeneratedDocument }) {
  const content = JSON.stringify({ kind: "document-notes", documentId: document.id, documentName: document.name, highlights: list, updatedAt: new Date().toISOString() }, null, 2);
  const file = { name: `${document.name} · notes.json`, content, preview: `${list.length} highlight${list.length === 1 ? "" : "s"}`, sizeBytes: content.length };
  if (existing?.document && onUpdateGeneratedDocument) return onUpdateGeneratedDocument(existing.document.id, { file }, document.subjectId);
  if (onSaveGeneratedQuizDocument) return onSaveGeneratedQuizDocument({ folderIds: [], tags: [NOTES_TAG], file }, document.subjectId);
  return null;
}

/* ------------------------------------------------------------------ a study step shows only its part of the document */

const STOP_WORDS = new Set(["study", "read", "reading", "review", "concepts", "concept", "the", "and", "for", "with", "from", "practice", "quiz", "summary", "chapter", "about", "into", "its", "your", "exam", "final"]);
const wordsOf = (value) => (String(value || "").toLowerCase().match(/[a-z0-9áéíóúñü]{3,}/g) || []).filter((word) => !STOP_WORDS.has(word));
const countOf = (text, word) => { let count = 0; for (let at = text.indexOf(word); at !== -1; at = text.indexOf(word, at + word.length)) count += 1; return count; };

/**
 * A 100-page document is overwhelming for a step about one topic. This keeps the whole document in
 * the page (so highlights and notes keep their places, and sync with the main document) but hides
 * the sections that have nothing to do with the step: the title and concepts of the step are looked
 * for in each section's heading and text. Returns the HTML unchanged when nothing stands out.
 */
/** @param {string} html @param {{ title?: string, concepts?: string[] }} [focus] */
export function focusSections(html, { title = "", concepts = [] } = {}) {
  const unchanged = { html, focused: false, label: "", shown: 0, total: 0 };
  if (typeof document === "undefined" || !html) return unchanged;
  const top = document.createElement("div");
  top.innerHTML = html;
  let holder = top;
  while (holder.children.length === 1 && holder.children[0].children.length > 1) holder = holder.children[0];
  const sections = [];
  for (const element of [...holder.children]) {
    const level = /^H([1-4])$/.exec(element.tagName)?.[1];
    if (level || !sections.length) sections.push({ level: level ? Number(level) : 0, heading: level ? element.textContent || "" : "", elements: [element] });
    else sections[sections.length - 1].elements.push(element);
  }
  if (sections.filter((section) => section.level).length < 2) return unchanged;

  const phrases = [...(concepts || []), title].map((entry) => String(entry || "").toLowerCase().trim()).filter((entry) => entry.length > 3);
  const queryWords = [...new Set(phrases.flatMap(wordsOf))];
  if (!queryWords.length) return unchanged;
  const scores = sections.map((section) => {
    const heading = section.heading.toLowerCase();
    const text = section.elements.map((element) => element.textContent || "").join(" ").toLowerCase();
    let score = 0;
    for (const phrase of phrases) { if (heading.includes(phrase)) score += 4; else if (text.includes(phrase)) score += 2; }
    for (const word of queryWords) score += (heading.includes(word) ? 2 : 0) + Math.min(countOf(text, word), 4) * 0.5;
    return score;
  });
  const best = Math.max(...scores);
  if (best < 1.5) return unchanged;
  const picked = sections.map((section, index) => scores[index] >= Math.max(1.5, best * 0.45));
  // A matching section brings its sub-sections with it.
  sections.forEach((section, index) => {
    if (!picked[index] || !section.level) return;
    for (let next = index + 1; next < sections.length && sections[next].level > section.level; next += 1) picked[next] = true;
  });
  const length = (section) => section.elements.reduce((sum, element) => sum + (element.textContent || "").length, 0);
  const total = sections.reduce((sum, section) => sum + length(section), 0);
  const shown = sections.reduce((sum, section, index) => sum + (picked[index] ? length(section) : 0), 0);
  if (!shown || shown > total * 0.8) return unchanged;

  sections.forEach((section, index) => {
    if (picked[index]) return;
    for (const element of section.elements) { element.setAttribute("data-luna-hidden", "1"); element.style.display = "none"; }
  });
  const label = sections.filter((section, index) => picked[index] && section.level).slice(0, 3).map((section) => section.heading.trim()).join(" · ");
  return { html: top.innerHTML, focused: true, label, shown: picked.filter(Boolean).length, total: sections.length };
}

/* ------------------------------------------------------------------ edited HTML back to Markdown */

const texOf = (element) => {
  const holder = element.closest?.("[data-latex]") || element.querySelector?.("[data-latex]");
  if (holder) return holder.getAttribute("data-latex") || "";
  return element.querySelector?.('annotation[encoding="application/x-tex"]')?.textContent || "";
};

/** The text of an edited page as Markdown (headings, lists, tables, bold, italics, formulas as $…$) — what search and agents read. */
export function htmlToMarkdown(root) {
  const lines = [];
  const inline = (node) => {
    if (node.nodeType === 3) return node.nodeValue.replace(/\s+/g, " ");
    if (node.nodeType !== 1) return "";
    if (node.getAttribute?.("data-luna-hidden")) return "";
    const tag = node.tagName.toLowerCase();
    if (node.classList?.contains("katex-display") || node.classList?.contains("math-display")) { const tex = texOf(node); return tex ? ` $$${tex}$$ ` : ""; }
    if (node.classList?.contains("katex") || node.classList?.contains("math-inline") || node.hasAttribute?.("data-latex")) { const tex = texOf(node); return tex ? `$${tex}$` : ""; }
    if (tag === "br") return "\n";
    if (tag === "img") return node.getAttribute("alt") ? `[${node.getAttribute("alt")}]` : "";
    const inner = [...node.childNodes].map(inline).join("");
    if (tag === "strong" || tag === "b") return inner.trim() ? `**${inner.trim()}**` : inner;
    if (tag === "em" || tag === "i") return inner.trim() ? `*${inner.trim()}*` : inner;
    if (tag === "code") return `\`${inner}\``;
    return inner;
  };
  const block = (node) => {
    if (node.nodeType === 3) { const text = node.nodeValue.replace(/\s+/g, " ").trim(); if (text) lines.push(text, ""); return; }
    if (node.nodeType !== 1 || node.getAttribute?.("data-luna-hidden")) return;
    const tag = node.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) { lines.push(`${"#".repeat(Number(tag[1]))} ${inline(node).trim()}`, ""); return; }
    if (tag === "p") { const text = inline(node).trim(); if (text) lines.push(text, ""); return; }
    if (tag === "ul" || tag === "ol") {
      [...node.children].filter((child) => child.tagName.toLowerCase() === "li").forEach((item, index) => lines.push(`${tag === "ol" ? `${index + 1}.` : "-"} ${inline(item).trim()}`));
      lines.push("");
      return;
    }
    if (tag === "table") {
      const rows = [...node.querySelectorAll("tr")].map((row) => [...row.children].map((cell) => inline(cell).replace(/\|/g, "/").replace(/\s+/g, " ").trim()));
      if (rows.length) {
        const width = Math.max(...rows.map((row) => row.length));
        const pad = (row) => Array.from({ length: width }, (_, index) => row[index] || "");
        lines.push(`| ${pad(rows[0]).join(" | ")} |`, `| ${pad(rows[0]).map(() => "---").join(" | ")} |`);
        rows.slice(1).forEach((row) => lines.push(`| ${pad(row).join(" | ")} |`));
        lines.push("");
      }
      return;
    }
    if (node.classList?.contains("katex-display") || node.classList?.contains("math-display")) { const tex = texOf(node); if (tex) lines.push(`$$${tex}$$`, ""); return; }
    if (["div", "section", "article", "main", "figure", "blockquote", "body"].includes(tag)) {
      const hasBlocks = [...node.children].some((child) => /^(h[1-6]|p|ul|ol|table|div|section|article|figure|blockquote)$/i.test(child.tagName));
      if (hasBlocks) { [...node.childNodes].forEach(block); return; }
    }
    const text = inline(node).trim();
    if (text) lines.push(text, "");
  };
  [...root.childNodes].forEach(block);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
