import { createDocumentSummarySpec } from "../../../agent-studio/engine/model";
import { runConfigFromSpec } from "../../../agent-studio/engine/migrate";

/** The Document Summarizer as a built-in agent (a plain config, so plans and "Update…" can use it without loading the page). */
export const DOCUMENT_SUMMARIZER_AGENT = runConfigFromSpec(createDocumentSummarySpec(), {
  id: "builtin-document-summarizer",
  howItWorks: [
    { title: "Choose your documents", text: "One or several: they are merged into a single summary." },
    { title: "Choose the length", text: "One page or two, the language, and optionally a topic to give the most room." },
    { title: "Luna writes the briefing", text: "The big picture, the key messages, the concepts, the formulas, what to remember and where to focus, in plain language." },
    { title: "Read it, export it", text: "Read it inside Luna, or download it as PDF, Word or HTML." }
  ]
});
