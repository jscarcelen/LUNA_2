import { parseResource } from "../resources/resource.js";
import { parsePlan } from "../plans/plan.js";
import { splitAfterSentenceEnd } from "../../lib/regexCompat.js";

/**
 * Where a document is tested and covered.
 *
 * Everything Luna builds from a document remembers where it came from: a question keeps the passage it was
 * written from (`source.extract`), and a summary, formula sheet or any other written output keeps the passages it
 * was written from (`data.sources`). This walks the workspace's resources, collects those pointers for one
 * document, and matches them to the paragraphs on screen, so the reader can draw, next to each paragraph, which
 * activities test it and how often. Pure functions: the matching works on plain strings.
 */

const MIN_PIECE = 20;

/** Lower-case words only, so a different quote mark, hyphen or line break never hides a match. */
export const normaliseText = (value) => String(value ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** An extract is a few sentences: each one on its own is enough to find the paragraph it came from. */
const piecesOf = (extract) => splitAfterSentenceEnd(String(extract ?? ""), { always: /\n+|…/gu }).map(normaliseText).filter((piece) => piece.length >= MIN_PIECE);

/**
 * The pointers into `documentId` found in the workspace's documents: one per question that cites it, one per
 * passage a written output was made from. Each carries what the reader needs to name it and open it.
 */
export function collectCoverageRefs(documentId, documents = []) {
  if (!documentId) return [];
  const plans = documents.map((document) => ({ document, plan: parsePlan(document) })).filter((row) => row.plan);
  const refs = [];
  for (const document of documents) {
    const resource = parseResource(document);
    if (!resource || document.id === documentId) continue;
    const inPlans = plans.filter((row) => (row.plan.items || []).some((item) => item.resourceId === document.id)).map((row) => row.plan.name || "Study plan");
    const base = { activityId: document.id, activityName: resource.name || document.name || "Activity", plans: inPlans };
    const questions = Array.isArray(resource.activity?.questions) ? resource.activity.questions : [];
    if (questions.length) {
      const cards = questions.every((question) => question.kind === "flashcard");
      questions.forEach((question, index) => {
        if (question.source?.documentId !== documentId || !String(question.source?.extract || "").trim()) return;
        refs.push({ ...base, kind: cards ? "flashcards" : "questions", label: `${cards ? "Card" : "Question"} ${index + 1}`, pieces: piecesOf(question.source.extract) });
      });
      continue;
    }
    // A written output (summary, formula sheet, notes): it covers the passages it was written from.
    const passages = (Array.isArray(resource.data?.sources) ? resource.data.sources : []).filter((passage) => passage?.documentId === documentId && String(passage.content || "").trim());
    passages.forEach((passage) => {
      const whole = normaliseText(passage.content);
      if (whole.length >= MIN_PIECE) refs.push({ ...base, kind: "document", label: "Written from this part", pieces: [whole] });
    });
  }
  return refs.filter((ref) => ref.pieces.length);
}

/** For each paragraph text, the indexes of the refs that cover it. A paragraph matches when it contains a piece of the ref, or sits inside one. */
export function matchReferences(texts = [], refs = []) {
  const normalised = texts.map(normaliseText);
  return normalised.map((text) => {
    if (text.length < 12) return [];
    const hits = [];
    refs.forEach((ref, index) => {
      if (ref.pieces.some((piece) => text.includes(piece) || (text.length >= MIN_PIECE && piece.includes(text)))) hits.push(index);
    });
    return hits;
  });
}

/** The share of the text (by characters) that at least one activity covers, and how many activities reach this document. */
export function coverageSummary(texts = [], matches = [], refs = []) {
  let total = 0;
  let covered = 0;
  texts.forEach((text, index) => {
    const length = normaliseText(text).length;
    if (length < 12) return;
    total += length;
    if (matches[index]?.length) covered += length;
  });
  return { share: total ? covered / total : 0, activities: new Set(refs.map((ref) => ref.activityId)).size };
}

/** One paragraph's refs grouped by activity, for the popover: "Quiz A · Questions 2, 5 · in plan X". */
export function groupByActivity(indexes = [], refs = []) {
  const groups = new Map();
  for (const index of indexes) {
    const ref = refs[index];
    if (!ref) continue;
    if (!groups.has(ref.activityId)) groups.set(ref.activityId, { activityId: ref.activityId, name: ref.activityName, kind: ref.kind, plans: ref.plans, labels: [] });
    groups.get(ref.activityId).labels.push(ref.label);
  }
  return [...groups.values()];
}

const MIN_SECTION_HEIGHT = 220;
const FALLBACK_SECTION_HEIGHT = 700;

const kindOf = (node) => (node.matches(".luna-page-break, .md-page") ? "page" : node.matches("figure, img") ? "image" : node.matches(".katex-display, .math-display") ? "formula" : node.matches("table") ? "table" : "text");

/**
 * Groups the pieces into sections: a new section starts at a heading (h1–h3) once the current one is tall enough, otherwise at a
 * page line; a document with neither is cut every few hundred pixels. Returns [{ title, top, bottom, nodes, counts }].
 */
export function buildSections(pieces, box) {
  const sections = [];
  let current = null;
  const open = (title) => { current = { title, top: Infinity, bottom: 0, nodes: [], counts: { formula: 0, image: 0, table: 0 } }; sections.push(current); };
  const hasHeadings = pieces.some((node) => /^H[1-3]$/.test(node.tagName));
  for (const node of pieces) {
    const kind = kindOf(node);
    const rect = node.getBoundingClientRect();
    if (kind === "page") { if (!hasHeadings && current && current.bottom - current.top >= MIN_SECTION_HEIGHT) current = null; continue; }
    if (rect.height <= 0) continue;
    const top = rect.top - box.top;
    const isHeading = /^H[1-3]$/.test(node.tagName);
    const tall = current ? current.bottom - current.top : 0;
    if (!current || (isHeading && tall >= MIN_SECTION_HEIGHT) || (!hasHeadings && tall >= FALLBACK_SECTION_HEIGHT)) open(isHeading ? (node.textContent || "").trim() : "");
    if (isHeading && !current.title) current.title = (node.textContent || "").trim();
    current.top = Math.min(current.top, top);
    current.bottom = Math.max(current.bottom, top + rect.height);
    if (kind === "text") current.nodes.push(node);
    else { current.counts[kind] += 1; if (kind === "table") current.nodes.push(node); }
  }
  return sections.filter((section) => section.bottom > section.top);
}

