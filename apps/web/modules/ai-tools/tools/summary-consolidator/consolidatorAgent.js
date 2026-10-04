import { createSummaryNotesConsolidatorSpec } from "../../../agent-studio/engine/model";
import { runConfigFromSpec } from "../../../agent-studio/engine/migrate";

/**
 * The Summary Notes Consolidator as a built-in agent: the documents the runner picks (from any subject
 * or folder) become ONE exhaustive, de-duplicated document organised by topic, every statement tagged
 * with the original document and page/section it came from. It is an ordinary agent spec flagged
 * `pipeline: "consolidate"`, so it runs through RunAgentPage like every other agent; only the server
 * side differs (a multi-pass pipeline instead of one model call — see `pipeline/consolidator.js`).
 */
export const CONSOLIDATOR_AGENT = runConfigFromSpec(createSummaryNotesConsolidatorSpec(), {
  id: "builtin-summary-notes-consolidator",
  howItWorks: [
    { title: "Choose your documents", text: "Pick the documents to merge, from any subject or folder of your workspace." },
    { title: "Pick the language", text: "Optionally name a topic to put first. Everything else is still included." },
    { title: "Luna merges them", text: "Every document is read in full, overlapping information is written once, and the notes are organised by topic with formulas, tables and figure descriptions." },
    { title: "Read it, export it", text: "Each statement ends with the document and page or section it came from. Download it or save it — study plans use it as their master document." }
  ]
});
