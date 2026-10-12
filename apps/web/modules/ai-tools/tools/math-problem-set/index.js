import { RunAgentPage } from "../agent-builder/RunAgentPage";
import { MATH_AGENT } from "./mathAgent";

function MathProblemSetPage({ toolContext }) {
  return <RunAgentPage toolContext={toolContext} builtinAgent={MATH_AGENT} />;
}

export const mathProblemSetTool = {
  id: "math-problem-set",
  name: MATH_AGENT.name,
  description: MATH_AGENT.tagline,
  agent: MATH_AGENT,
  runLabel: "Open Math Problem Set",
  component: MathProblemSetPage,
  pipelineConfig: { mode: "configurable-rag-pipeline", template: "math-problem-set-v1" }
};
