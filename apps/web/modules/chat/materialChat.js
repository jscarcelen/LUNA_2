import { PLAN_TAG, parsePlan } from "../plans/plan";

/**
 * "Ask Luna" next to a piece of material: the pure parts.
 *
 * The chat that sits beside a quiz, a summary or an uploaded document answers from the material
 * the learner is studying, so two things are worked out before it opens: WHICH documents it may
 * read (`selectMaterial`: the study plan the item belongs to, its master document, the reference
 * documents it was made from — or, when none of that is known, the subject's uploaded documents),
 * and WHAT the learner is doing right now (`describeView`, a sentence the model is told). Both are
 * plain functions of data, so they are tested without a browser or a model.
 */

export const MAX_CONTEXT_CHARS = 900;

/** The only tools the embedded chat gets: it reads material, it does not make or run anything. */
export const EMBEDDED_TOOLS = ["search_material", "list_documents"];

/** What the server accepts as the "what is the user doing" line. */
export function cleanContext(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, MAX_CONTEXT_CHARS);
}

const quote = (value, max = 120) => `"${String(value || "").replace(/\s+/g, " ").replace(/"/g, "'").trim().slice(0, max)}"`;
const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * One sentence on what the user is looking at and doing.
 *   kind: "quiz" | "flashcards" | "document" (an uploaded file) | "generated" (a summary, guide…)
 *   progress (quizzes): { answered, total, checked, score, current: { number, prompt } }
 *   section: the part of a long document shown (a study step shows its part), "" for all of it.
 */
/** @param {{ kind?: string, title?: string, agentName?: string, planName?: string, planDeadline?: string, progress?: any, section?: string, notesView?: boolean }} [view] */
export function describeView({ kind = "document", title = "", agentName = "", planName = "", planDeadline = "", progress = null, section = "", notesView = false } = {}) {
  const name = quote(title || "Untitled");
  const plan = planName ? ` It is part of the study plan ${quote(planName)}${planDeadline ? ` (next deadline ${planDeadline})` : ""}.` : "";
  if (kind === "quiz") {
    const noun = /\b(exam|mock|midterm|final)\b/i.test(title) ? "exam" : "quiz";
    let state = "";
    if (progress?.total) {
      state = progress.checked
        ? ` Already checked: ${progress.score} of ${progress.total} correct, so the correct answers are now visible to the user.`
        : ` ${plural(progress.answered || 0, "question")} of ${progress.total} answered; it has NOT been checked, so the user has not seen any correct answer yet.`;
      if (!progress.checked && progress.current?.prompt) state += ` The question the user last worked on is number ${progress.current.number}: ${quote(progress.current.prompt, 240)}.`;
      if (progress.checked && progress.current?.prompt) state += ` The question they last looked at is number ${progress.current.number}: ${quote(progress.current.prompt, 240)}.`;
    }
    return cleanContext(`Doing the ${noun} ${name}.${state}${plan}`);
  }
  if (kind === "flashcards") {
    const cards = progress?.total ? ` (${plural(progress.total, "card")})` : "";
    return cleanContext(`Studying the flashcard set ${name}${cards}. The back of a card is only shown once the user flips it.${plan}`);
  }
  if (kind === "generated") {
    const by = agentName ? ` made by the agent ${quote(agentName, 60)}` : "";
    return cleanContext(`Reading the generated document ${name}${by}.${notesView ? " The notes view is on, with their highlights." : ""}${plan}`);
  }
  const part = section ? `, showing the part about ${section}` : "";
  return cleanContext(`Reading the document ${name}${part}.${notesView ? " The notes view is on, with their highlights." : ""}${plan}`);
}

const documentsOf = (workspace) => (workspace?.subjects || []).flatMap((subject) => (subject.documents || []).map((document) => ({ document, subject })));

/**
 * Which documents the chat reads for an item (a resource, a plan step, an uploaded document).
 *
 * `documentId` is the item itself; `planId` is a study plan the caller already knows it belongs to;
 * `sourceDocumentIds` are the reference documents it was made from; `readSelf` says the item's own
 * text can be cited (an uploaded document, a summary — never a quiz, whose answers would leak).
 *
 * The result is the exact `documentIds` (plus the generated ones that may be read: master
 * documents and the item itself when `readSelf`). With no plan and no reference documents to go on it
 * falls back to the whole subject's uploaded documents (`fallback: true`, no `documentIds`).
 */
/**
 * @param {any} workspace
 * @param {{ subjectId?: string, documentId?: string, planId?: string, sourceDocumentIds?: string[], readSelf?: boolean }} [item]
 */
export function selectMaterial(workspace, { subjectId = "", documentId = "", planId = "", sourceDocumentIds = [], readSelf = false } = {}) {
  const everything = documentsOf(workspace);
  const byId = new Map(everything.map((entry) => [entry.document.id, entry]));
  const home = (documentId && byId.get(documentId)?.subject) || (workspace?.subjects || []).find((subject) => subject.id === subjectId) || null;
  const homeId = home?.id || subjectId || "";

  const rows = [];
  for (const { document, subject } of everything) {
    if (!(document.tags || []).includes(PLAN_TAG)) continue;
    const plan = parsePlan(document);
    if (plan) rows.push({ document, plan, subjectId: subject.id });
  }
  const touches = (row) => {
    if (planId && row.document.id === planId) return true;
    if (planId) return false;
    if (!documentId) return false;
    return (row.plan.items || []).some((item) => item.resourceId === documentId)
      || (row.plan.materialIds || []).includes(documentId)
      || row.plan.masterDocumentId === documentId;
  };
  const direct = rows.filter(touches);
  // A plan's sub-plans are part of it.
  const matched = [...direct];
  for (const row of rows) if (!matched.includes(row) && direct.some((parent) => row.plan.parentPlanId === parent.document.id)) matched.push(row);

  const wanted = [];
  const generatedOk = [];
  for (const row of matched) {
    wanted.push(...(row.plan.materialIds || []));
    if (row.plan.masterDocumentId) { wanted.push(row.plan.masterDocumentId); generatedOk.push(row.plan.masterDocumentId); }
  }
  wanted.push(...(sourceDocumentIds || []));
  const basis = wanted.filter((id) => id && byId.has(id) && !(byId.get(id).document.tags || []).includes(PLAN_TAG));
  if (readSelf && documentId) { wanted.push(documentId); generatedOk.push(documentId); }

  const documentIds = [...new Set(wanted.filter((id) => id && byId.has(id) && !(byId.get(id).document.tags || []).includes(PLAN_TAG)))];
  const readableGeneratedIds = [...new Set(generatedOk.filter((id) => documentIds.includes(id)))];
  const documents = documentIds.map((id) => ({ id, name: byId.get(id).document.name }));
  const plans = matched.map((row) => ({ id: row.document.id, name: row.plan.name, deadline: row.plan.deadlines?.find((entry) => entry.date)?.date || "" }));
  const workspaceId = workspace?.id || "";

  // Nothing known about a plan or reference documents: the whole subject's uploaded documents (and the item itself, if it can be read).
  if (!basis.length) {
    const self = readSelf && documentId && byId.has(documentId) ? [documentId] : [];
    return { workspaceId, subjectId: homeId, fallback: true, documentIds: [], referencedDocumentIds: self, readableGeneratedIds: self, documents: [], plans, scope: { workspaceId, subjectId: homeId, focus: true, readableGeneratedIds: self }, label: home ? `All uploaded documents in ${home.name}` : "Your uploaded documents" };
  }
  const label = plans.length
    ? `${plans.length === 1 ? `Plan “${plans[0].name}”` : `${plans.length} study plans`} · ${plural(documents.length, "document")}`
    : plural(documents.length, "reference document");
  return {
    workspaceId,
    subjectId: homeId,
    fallback: false,
    documentIds,
    referencedDocumentIds: documentIds,
    readableGeneratedIds,
    documents,
    plans,
    scope: { workspaceId, subjectId: homeId, focus: true, documentIds, readableGeneratedIds },
    label
  };
}

const SKIP_KEYS = new Set(["type", "id", "key", "variant", "level", "style", "kind", "icon", "colour", "color"]);

/**
 * The readable text of a generated document stored as a resource (`{ kind: "resource", data: { blocks } }`):
 * headings as Markdown headings, everything else as its text, so it can be chunked and cited like an uploaded
 * document. Anything that is not a resource is returned as it is.
 */
export function resourceText(content) {
  let parsed = null;
  try { parsed = JSON.parse(String(content || "")); } catch { return String(content || ""); }
  if (parsed?.kind !== "resource") return String(content || "");
  const lines = [];
  const walk = (value) => {
    if (typeof value === "string") { if (value.trim()) lines.push(value.trim()); return; }
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (!value || typeof value !== "object") return;
    if (value.type === "heading" && typeof value.text === "string") { lines.push(`${"#".repeat(Math.min(4, Math.max(1, Number(value.level) || 2)))} ${value.text.trim()}`); return; }
    if (value.type === "document_header" && typeof value.title === "string") { lines.push(`# ${value.title.trim()}`); if (typeof value.subtitle === "string" && value.subtitle.trim()) lines.push(value.subtitle.trim()); return; }
    for (const [key, entry] of Object.entries(value)) if (!SKIP_KEYS.has(key)) walk(entry);
    lines.push("");
  };
  walk(parsed.data?.blocks ?? parsed.data?.items ?? []);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
