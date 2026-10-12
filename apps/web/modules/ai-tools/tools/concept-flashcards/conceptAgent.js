import { createConceptFlashcardsSpec } from "../../../agent-studio/engine/model";
import { runConfigFromSpec } from "../../../agent-studio/engine/migrate";

/** Concept Flashcards as a built-in agent (a plain config, so plans and "Update…" can use it without loading the page). */
export const CONCEPT_FLASHCARDS_AGENT = runConfigFromSpec(createConceptFlashcardsSpec(), {
  id: "builtin-concept-flashcards",
  howItWorks: [
    { title: "Choose your material", text: "Pick the documents the concepts should come from." },
    { title: "Choose the set", text: "How many cards, the language, and optionally a chapter or topic to focus on." },
    { title: "Luna finds the concepts", text: "It picks the key terms and ideas you need to know and writes each one as a card: the concept on the front, its definition on the back." },
    { title: "Learn them", text: "Flip the cards inside Luna, or export them. Cards you miss feed your Progress." }
  ]
});
