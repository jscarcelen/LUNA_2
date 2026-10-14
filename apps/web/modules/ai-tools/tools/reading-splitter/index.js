import { RunAgentPage } from "../agent-builder/RunAgentPage";
import { READING_SPLITTER_AGENT } from "./readingAgent";

function ReadingSplitterPage({ toolContext }) {
  return <RunAgentPage toolContext={toolContext} builtinAgent={READING_SPLITTER_AGENT} />;
}

export const readingSplitterTool = {
  id: "reading-splitter",
  agent: READING_SPLITTER_AGENT,
  name: "Reading Splitter",
  description: "Splits a long document into short reading parts, by topic, reading time or difficulty, using the material's own text.",
  runLabel: "Open Reading Splitter",
  component: ReadingSplitterPage,
  pipelineConfig: { mode: "configurable-rag-pipeline", template: "agent-studio-v1" }
};
