import { RunAgentPage } from "../agent-builder/RunAgentPage";
import { CONCEPT_FLASHCARDS_AGENT } from "./conceptAgent";

function ConceptFlashcardsPage({ toolContext }) {
  return <RunAgentPage toolContext={toolContext} builtinAgent={CONCEPT_FLASHCARDS_AGENT} />;
}

export const conceptFlashcardsTool = {
  id: "concept-flashcards",
  agent: CONCEPT_FLASHCARDS_AGENT,
  name: "Concept Flashcards",
  description: "Flashcards of the key concepts in your material: the concept on the front, its definition on the back.",
  runLabel: "Open Concept Flashcards",
  component: ConceptFlashcardsPage,
  pipelineConfig: { mode: "configurable-rag-pipeline", template: "agent-studio-v1" }
};
