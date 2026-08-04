import { QuizGeneratorToolPage } from "./QuizGeneratorToolPage";

export const quizGeneratorTool = {
  id: "quiz-generator",
  name: "Quiz Generator",
  description: "Build chapter quizzes and exams from selected workspace documents.",
  runLabel: "Open Quiz Generator",
  component: QuizGeneratorToolPage,
  pipelineConfig: {
    mode: "configurable-rag-pipeline",
    template: "quiz-generator-v1"
  }
};
