"use client";

import { RunAgentPage } from "../agent-builder/RunAgentPage";
import { QUIZ_AGENT } from "./quizAgent";

/** Quiz Generator = the reference built-in agent rendered through the shared agent flow. */
export function QuizGeneratorPage({ toolContext }) {
  return <RunAgentPage toolContext={toolContext} builtinAgent={QUIZ_AGENT} />;
}
