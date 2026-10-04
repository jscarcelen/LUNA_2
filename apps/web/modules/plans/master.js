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

export const MASTER_STEP_ID = "master";

const isUploaded = (document) => document && document.sourceType !== "generated";

/** The plan's uploaded reference documents that still exist (generated resources are not consolidated). */
export function uploadedMaterialIds(plan, documents = []) {
  const byId = new Map(documents.map((document) => [document.id, document]));
  return [...new Set(plan?.materialIds || [])].filter((id) => isUploaded(byId.get(id)));
}

/** Does this plan get a master document? Two or more uploaded reference documents. */
export const needsMasterDocument = (plan, documents = []) => uploadedMaterialIds(plan, documents).length >= 2;

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
 * it) for every step; without one, the step's own source document, else all the plan's material.
 */
export function stepSourceIds({ step, plan, documents = [], master = null }) {
  if (master) return [master.id];
  const source = documents.find((document) => document.id === step?.sourceDocumentId);
  return source ? [source.id] : (plan?.materialIds || []);
}

/** Name of the master document: it is a document of the plan, named after it. */
export const masterTitle = (plan) => `${String(plan?.name || "Study plan").trim()} — master document`;

/**
 * The ordered steps of the plan build the dialog shows. With a master document it is the FIRST thing
 * built, before any quiz or summary, so it comes right before the writing step.
 */
export function planBuildSteps({ documentCount = 0, uploadedCount = documentCount, buildNow = true, withMaster = uploadedCount >= 2 } = {}) {
  return [
    { id: "concepts", title: "Reading your material", detail: `Luna is reading ${documentCount} document${documentCount === 1 ? "" : "s"} and listing the concepts in them, so the plan can cover every one.` },
    { id: "schedule", title: "Planning the schedule", detail: "Spreading the concepts over the weeks until your deadline, fitted to your time per week and what you keep getting wrong — then checking that nothing is left untested." },
    { id: "save", title: "Saving the plan and setting up its folders", detail: "Filing the plan under Generated material → Study plans, with a link to your uploaded material." },
    ...(buildNow && withMaster ? [{ id: MASTER_STEP_ID, title: "Merging your documents into one master document", detail: `Luna is consolidating ${uploadedCount} documents into a single set of notes — every fact once, with formulas, tables and figures, each tagged with the document it came from. Quizzes and summaries will cite this document.` }] : []),
    ...(buildNow ? [{ id: "build", title: "Writing the quizzes, flashcards and summaries", detail: `Each study step gets its material, written by the agent you allowed from ${withMaster ? "the master document" : "your documents"}. This is the longest part.` }] : [])
  ];
}
