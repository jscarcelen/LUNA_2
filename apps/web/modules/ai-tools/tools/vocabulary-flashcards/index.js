import { RunAgentPage } from "../agent-builder/RunAgentPage";
import { createVocabularyFlashcardsSpec } from "../../../agent-studio/engine/model";
import { runConfigFromSpec } from "../../../agent-studio/engine/migrate";

const FLASHCARDS_AGENT = runConfigFromSpec(createVocabularyFlashcardsSpec());

function VocabularyFlashcardsPage({ toolContext }) {
  return <RunAgentPage toolContext={toolContext} builtinAgent={FLASHCARDS_AGENT} />;
}

export const vocabularyFlashcardsTool = {
  id: "vocabulary-flashcards",
  name: "Vocabulary Flashcards",
  description: "Flashcards pairing words between two languages — from your material or general knowledge.",
  runLabel: "Open Vocabulary Flashcards",
  component: VocabularyFlashcardsPage,
  pipelineConfig: { mode: "configurable-rag-pipeline", template: "agent-studio-v1" }
};
