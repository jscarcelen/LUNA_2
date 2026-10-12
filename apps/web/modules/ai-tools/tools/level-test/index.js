import { RunAgentPage } from "../agent-builder/RunAgentPage";
import { LEVEL_AGENT } from "./levelAgent";

function LevelTestPage({ toolContext }) {
  return <RunAgentPage toolContext={toolContext} builtinAgent={LEVEL_AGENT} />;
}

export const levelTestTool = {
  id: "level-test",
  name: LEVEL_AGENT.name,
  description: LEVEL_AGENT.tagline,
  agent: LEVEL_AGENT,
  runLabel: "Open Level Test",
  component: LevelTestPage,
  pipelineConfig: { mode: "configurable-rag-pipeline", template: "level-test-v1" }
};
