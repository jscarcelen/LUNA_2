import { QuizGeneratorPage } from "./QuizGeneratorPage";
import { QUIZ_AGENT } from "./quizAgent";

export const quizGeneratorTool = {
  id: "quiz-generator",
  name: QUIZ_AGENT.name,
  description: QUIZ_AGENT.tagline,
  agent: QUIZ_AGENT,
  runLabel: "Open Quiz Generator",
  component: QuizGeneratorPage,
  pipelineConfig: {
    mode: "configurable-rag-pipeline",
    template: "quiz-generator-v1"
  }
};
