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
