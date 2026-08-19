import { AgentBuilderPage } from "./AgentBuilderPage";

export const agentBuilderTool = {
  id: "agent-builder",
  name: "Create AI Agent",
  description: "Configure, test, and publish a custom AI agent from your workspace documents.",
  runLabel: "Open Agent Builder",
  component: AgentBuilderPage,
  pipelineConfig: {
    mode: "configurable-rag-pipeline",
    template: "agent-builder-v1"
  }
};
