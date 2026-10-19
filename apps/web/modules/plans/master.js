/**
 * A plan's master document.
 *
 * When a study plan is built from two or more uploaded documents, the first thing built is ONE master
 * document: the Summary Notes Consolidator merges all of them into a single, de-duplicated set of
 * notes whose every statement says which original document it came from. It is filed once, in the
 * plan's folder (Generated material / Study plans / <plan>), and stored on the plan as
 * `masterDocumentId` (with `masterSourceIds`: the uploads it was built from).
 *
 * Every quiz, flashcard set or summary the plan builds afterwards reads its source passages from the
 * master document instead of the individual files, so the "source" links point at one consolidated
 * document (which itself traces back to the originals).
 *
 * The plan's `materialIds` stay the uploaded documents (concept maps, the "Reference materials"
 * shortcut to Uploaded material, deletion protection); the master document is generated material and
 * is deleted with the plan like any other.
 *
 * Pure functions: no I/O.
 */

import { tEn } from "../../lib/i18n/index.js";

export const MASTER_STEP_ID = "master";

const isUploaded = (document) => document && document.sourceType !== "generated";

/** The plan's uploaded reference documents that still exist (generated resources are not consolidated). */
export function uploadedMaterialIds(plan, documents = []) {
  const byId = new Map(documents.map((document) => [document.id, document]));
  return [...new Set(plan?.materialIds || [])].filter((id) => isUploaded(byId.get(id)));
}

/**
 * The "Consolidated view of the resources": with many documents (3 or more uploaded ones) or a lot of
 * material (more than CONSOLIDATED_MIN_CHARS characters, about 25,000 words or two hours of reading), the
 * FIRST step of the plan is reading one generated document that brings all the material together (a unified
 * outline by topic, overlaps merged, every section citing its sources). It is the plan's master document,
 * made by the Summary Notes Consolidator, and every later step is built on it.
 */
export const CONSOLIDATED_MIN_DOCUMENTS = 3;
export const CONSOLIDATED_MIN_CHARS = 150000;
/** The `generate` key of that first step (the same recipe as the master document). */
export const CONSOLIDATED_KEY = "master";

/** The rule, on counts: { uploadedCount, totalChars } of the plan's uploaded reference documents. */
export function needsConsolidatedView({ uploadedCount = 0, totalChars = 0 } = {}) {
  if (uploadedCount < 1) return false;
  return uploadedCount >= CONSOLIDATED_MIN_DOCUMENTS || Number(totalChars) >= CONSOLIDATED_MIN_CHARS;
}

/** Length of a document's text, from its content (or its stored size when the content is not loaded). */
export const documentChars = (document) => String(document?.content || "").length || Number(document?.sizeBytes) || 0;

/** The rule, on a plan: its uploaded documents and their total length. */
export function planNeedsConsolidatedView(plan, documents = []) {
  const byId = new Map(documents.map((document) => [document.id, document]));
  const ids = uploadedMaterialIds(plan, documents);
  return needsConsolidatedView({ uploadedCount: ids.length, totalChars: ids.reduce((sum, id) => sum + documentChars(byId.get(id)), 0) });
}

/** Does this plan get a master document? Two or more uploaded reference documents, or a consolidated view (a lot of material), or a step that asks for it. */
export const needsMasterDocument = (plan, documents = []) =>
  uploadedMaterialIds(plan, documents).length >= 2
  || planNeedsConsolidatedView(plan, documents)
  || (uploadedMaterialIds(plan, documents).length >= 1 && (plan?.items || []).some((item) => item.generate === CONSOLIDATED_KEY));

/**
 * Makes the consolidated view the plan's FIRST step, exactly once: kind "read", generate = master, dated on
 * the first day of the plan (the earliest step's date, never before today). A copy the model wrote is kept
 * (its title and minutes), moved to the front; duplicates are dropped. Pure: the route and the tests share it.
 * @returns {{ items: object[], added: boolean }}
 */
export function ensureConsolidatedStep(items = [], { today = "", title = "Consolidated view of the resources", minutes = 40, concepts = [] } = {}) {
  const isConsolidated = (item) => item?.generate === CONSOLIDATED_KEY || item?.madeAs === CONSOLIDATED_KEY;
  const existing = items.find(isConsolidated);
  const rest = items.filter((item) => !isConsolidated(item));
  const dates = rest.map((item) => String(item.dueDate || "")).filter(Boolean).sort();
  const first = dates[0] && (!today || dates[0] >= today) ? dates[0] : today || dates[0] || "";
  const step = {
    title: String(existing?.title || "").trim() || title,
    kind: "read",
    dueDate: existing?.madeAs ? existing.dueDate : first,
    minutes: Math.min(90, Math.max(15, Number(existing?.minutes) || minutes)),
    sourceId: "",
    generate: existing?.madeAs ? existing.generate || "" : CONSOLIDATED_KEY,
    goal: String(existing?.goal || ""),
    concepts: Array.isArray(existing?.concepts) && existing.concepts.length ? existing.concepts : concepts.slice(0, 8),
    ...(existing && existing.id ? { id: existing.id } : {}),
    ...(existing?.madeAs ? { madeAs: existing.madeAs, resourceId: existing.resourceId } : {})
  };
  return { items: [step, ...rest], added: !existing };
}

/** The plan's master document, if it was built and still exists. */
export function findMasterDocument(plan, documents = []) {
  const id = plan?.masterDocumentId;
  return id ? documents.find((document) => document.id === id) || null : null;
}

/** A master document is current while it was built from exactly the uploads the plan has now. */
export function masterIsCurrent(plan, documents = []) {
  const built = [...new Set(plan?.masterSourceIds || [])].sort().join("|");
  const now = [...uploadedMaterialIds(plan, documents)].sort().join("|");
  return built === now;
}

/**
 * Which documents a step's material is written from. With a master document, that document (and only
 * it) for every step except a reading part of an uploaded document (the material's own text); without
 * one, the step's own source document, else all the plan's material.
 */
export function stepSourceIds({ step, plan, documents = [], master = null }) {
  const source = documents.find((document) => document.id === step?.sourceDocumentId);
  // A reading part is the material's OWN text: it is cut from the step's original document, not from the master.
  if (step?.generate === "reading" && source && source.sourceType !== "generated") return [source.id];
  if (master) return [master.id];
  return source ? [source.id] : (plan?.materialIds || []);
}

/** Name of the master document: it is a document of the plan, named after it. */
export const masterTitle = (plan) => `${String(plan?.name || "Study plan").trim()} — master document`;

/**
 * The ordered steps of the plan build the dialog shows. With a master document it is the FIRST thing
 * built, before any quiz or summary, so it comes right before the writing step.
 */
export function planBuildSteps({ documentCount = 0, uploadedCount = documentCount, buildNow = true, withMaster = uploadedCount >= 2 } = {}, t = tEn) {
  return [
    { id: "concepts", title: t("plans.build.concepts.title"), detail: t.plural("plans.build.concepts.detail", documentCount) },
    { id: "schedule", title: t("plans.build.schedule.title"), detail: t("plans.build.schedule.detail") },
    { id: "save", title: t("plans.build.save.title"), detail: t("plans.build.save.detail") },
    ...(buildNow && withMaster ? [{ id: MASTER_STEP_ID, title: t("plans.build.master.title"), detail: t("plans.build.master.detail", { count: uploadedCount }) }] : []),
    ...(buildNow ? [{ id: "build", title: t("plans.build.write.title"), detail: t("plans.build.write.detail", { source: withMaster ? t("plans.build.write.master") : t("plans.build.write.docs") }) }] : [])
  ];
}
