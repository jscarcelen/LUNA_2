import { chatbotTool } from "./tools/chatbot";
import { quizGeneratorTool } from "./tools/quiz-generator";
import { agentBuilderTool } from "./tools/agent-builder";
import { templateBuilderTool } from "./tools/template-builder";
import { vocabularyFlashcardsTool } from "./tools/vocabulary-flashcards";
import { summaryConsolidatorTool } from "./tools/summary-consolidator";
import { mathProblemSetTool } from "./tools/math-problem-set";
import { conceptFlashcardsTool } from "./tools/concept-flashcards";
import { documentSummarizerTool } from "./tools/document-summarizer";
import { levelTestTool } from "./tools/level-test";
import { validateAiToolManifest } from "../core";

const toolCandidates = [
  quizGeneratorTool,
  mathProblemSetTool,
  levelTestTool,
  conceptFlashcardsTool,
  vocabularyFlashcardsTool,
  documentSummarizerTool,
  summaryConsolidatorTool,
  agentBuilderTool,
  templateBuilderTool,
  chatbotTool
];

for (const tool of toolCandidates) {
  const validation = validateAiToolManifest(tool);
  if (!validation.ok && process.env.NODE_ENV !== "production") {
    // Non-blocking warning keeps Phase 1 integration safe while surfacing invalid manifests in development.
    console.warn(`[ai-tools] Invalid tool manifest for ${String(tool?.id || "unknown")}: ${validation.issues.join(", ")}`);
  }
}

export const aiToolsRegistry = toolCandidates;

export function findAiToolById(toolId) {
  return aiToolsRegistry.find((tool) => tool.id === toolId) || null;
}
