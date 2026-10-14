import { createReadingPartsSpec } from "../../../agent-studio/engine/model";
import { runConfigFromSpec } from "../../../agent-studio/engine/migrate";

/** The Reading Splitter as a built-in agent (a plain config, so plans and "Update…" can use it without loading the page). */
export const READING_SPLITTER_AGENT = runConfigFromSpec(createReadingPartsSpec(), {
  id: "builtin-reading-splitter",
  howItWorks: [
    { title: "Choose your documents", text: "One or several long documents." },
    { title: "Choose how to cut", text: "By topic, by reading time or by difficulty, and how many minutes each part should take." },
    { title: "Luna splits it", text: "Each part is your material's own text, copied exactly, so you read a short piece instead of the whole file." },
    { title: "Read it, export it", text: "Read the parts inside Luna, or download them as PDF, Word or HTML." }
  ]
});
