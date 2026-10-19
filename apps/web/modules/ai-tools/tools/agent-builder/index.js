import { AgentStudio } from "../../../agent-studio/AgentStudio";

export const agentBuilderTool = {
  id: "agent-builder",
  name: "Build a tool",
  description: "Build your own tool: what it creates, what people customise, what it reads, what it returns. Test and improve in plain words.",
  runLabel: "Open the tool builder",
  component: AgentStudio,
  pipelineConfig: {
    mode: "configurable-rag-pipeline",
    template: "agent-studio-v1"
  }
};
