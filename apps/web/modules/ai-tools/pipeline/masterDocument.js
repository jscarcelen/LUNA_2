/**
 * The master document: one consolidated, de-duplicated set of notes written from several uploaded
 * documents (by the "Summary Notes Consolidator" agent), filed in a study plan's folder.
 *
 * It is stored like every generated document (a `resource` with typed blocks, so it opens in the
 * reader and exports like any other) and tagged `master-document`. Every block carries where it
 * came from: `_tags` (the short tags printed in the text, e.g. "[D1 p.3 · D2 §Osmosis]") and `_refs`
 * (the same places as data: document id, name, page, section), one entry per unit of text.
 *
 * Retrieval, the /source page and the chat read documents as Markdown. `masterDocumentMarkdown`
 * turns the blocks into that Markdown, expanding each short tag into the full document name, so a
 * passage taken from the master document still says which ORIGINAL documents it comes from.
 *
 * Pure: no I/O, so it runs in the browser (plans) and on the server (retrieval) alike.
 */

export const MASTER_TAG = "master-document";

export const isMasterDocument = (document) => (document?.tags || []).some((tag) => String(tag).toLowerCase() === MASTER_TAG);

/** The stored resource of a master document, or null. Accepts the document or its parsed resource. */
export function parseMasterResource(documentOrResource) {
  if (!documentOrResource) return null;
  let resource = documentOrResource;
  if (typeof documentOrResource.content === "string" || documentOrResource.tags) {
    try { resource = JSON.parse(String(documentOrResource.content || "{}")); } catch { return null; }
  }
  if (!resource || resource.kind !== "resource") return null;
  return resource;
}

/** `{ originals: [{ tag, id, name, passages }], coverage }`: which documents a master resource consolidates (null if none is recorded). */
export function masterInfo(resource) {
  if (resource && typeof resource.master === "object" && resource.master) return resource.master;
  if (Array.isArray(resource?.data?.originals)) return { originals: resource.data.originals, coverage: resource.data.coverage || null };
  return null;
}

/** Short tag text for a list of source places: "D1 p.3, p.5 · D2 §Osmosis" (grouped by document). */
export function formatSourceTag(refs = []) {
  const byDoc = new Map();
  for (const ref of refs) {
    if (!ref?.tag) continue;
    const places = byDoc.get(ref.tag) || [];
    const place = ref.page ? `p.${ref.page}` : ref.heading ? `§${String(ref.heading).slice(0, 40)}` : "";
    if (place && !places.includes(place)) places.push(place);
    byDoc.set(ref.tag, places);
  }
  return [...byDoc.entries()].map(([tag, places]) => (places.length ? `${tag} ${places.slice(0, 3).join(", ")}` : tag)).join(" · ");
}

/** Full-name version of the same places, for Markdown: "Biology notes.docx, p. 3; Lab manual › Osmosis". */
export function formatSourceNames(refs = []) {
  const parts = [];
  for (const ref of refs) {
    if (!ref?.documentName) continue;
    const place = ref.page ? `p. ${ref.page}` : ref.heading ? String(ref.heading).slice(0, 60) : "";
    const text = place ? `${ref.documentName}, ${place}` : ref.documentName;
    if (!parts.includes(text)) parts.push(text);
  }
  return parts.join("; ");
}

const cell = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim();

/** Removes the visible tag the pipeline appended to a unit of text, so it can be written in full. */
function withoutTag(text, tag) {
  const value = String(text ?? "");
  return tag && value.endsWith(tag) ? value.slice(0, -tag.length).trimEnd() : value;
}

/** `(Source: …)` in Markdown emphasis, or "" when the unit has no known place. */
const cite = (refs) => {
  const names = formatSourceNames(refs);
  return names ? ` *(Source: ${names})*` : "";
};

/**
 * Typed blocks → Markdown, with every unit's source expanded to the original documents' names.
 * Consecutive `vocabulary` rows become one table.
 */
export function blocksToMarkdown(blocks = []) {
  const out = [];
  let rows = [];
  const flushRows = () => {
    if (!rows.length) return;
    const withDetail = rows.some((row) => row.detail);
    out.push([`| Term | Meaning${withDetail ? " | Detail" : ""} |`, `| --- | ---${withDetail ? " | ---" : ""} |`, ...rows.map((row) => `| ${cell(row.term)} | ${cell(row.meaning)}${withDetail ? ` | ${cell(row.detail)}` : ""} |`)].join("\n"));
    rows = [];
  };
  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (!block || typeof block !== "object") continue;
    const type = String(block.type || "");
    const tags = Array.isArray(block._tags) ? block._tags : [];
    const refs = Array.isArray(block._refs) ? block._refs : [];
    if (type !== "vocabulary") flushRows();
    switch (type) {
      case "document_header":
      case "exam_header":
        if (block.title) out.push(`# ${block.title}`);
        break;
      case "section_header":
        out.push(`## ${block.title || block.text || ""}${block.intro ? `\n\n${block.intro}` : ""}`);
        break;
      case "heading":
        out.push(`${"#".repeat(Math.min(6, Math.max(2, (Number(block.level) || 2) + 1)))} ${block.text || ""}`);
        break;
      case "paragraph":
        out.push(`${withoutTag(block.text, tags[0])}${cite(refs[0])}`);
        break;
      case "callout":
        out.push(`> **${String(block.callout_type || "note").replace(/^./, (c) => c.toUpperCase())}:** ${withoutTag(block.text, tags[0])}${cite(refs[0])}`);
        break;
      case "bullet_list":
        out.push([block.title ? `**${block.title}**\n` : "", ...(Array.isArray(block.items) ? block.items : []).map((item, index) => `- ${withoutTag(item, tags[index])}${cite(refs[index])}`)].join("\n").trim());
        break;
      case "vocabulary": {
        // Source of a table row is written into the Meaning cell.
        rows.push({ term: block.word, meaning: `${withoutTag(block.translation, tags[0])}${cite(refs[0])}`, detail: block.example });
        break;
      }
      case "divider":
        out.push("---");
        break;
      default:
        break;
    }
  }
  flushRows();
  return out.filter(Boolean).join("\n\n");
}

/** The Markdown of a master document (a stored resource or the document holding it); "" if it is not one. */
export function masterDocumentMarkdown(documentOrResource) {
  const resource = parseMasterResource(documentOrResource);
  const blocks = resource?.data?.blocks;
  if (!resource || !Array.isArray(blocks)) return "";
  return blocksToMarkdown(blocks);
}
