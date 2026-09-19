import { AgentStudio } from "../../../agent-studio/AgentStudio";

export const agentBuilderTool = {
  id: "agent-builder",
  name: "Create AI Agent",
  description: "Build an agent recipe: what it creates, what people customise, what it reads, what it returns. Test and improve in plain words.",
  runLabel: "Open Agent Studio",
  component: AgentStudio,
  pipelineConfig: {
    mode: "configurable-rag-pipeline",
    template: "agent-studio-v1"
  }
};
