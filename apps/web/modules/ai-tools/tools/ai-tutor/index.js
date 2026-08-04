import { ChatView } from "../../../../components/views";

export const aiTutorTool = {
  id: "ai-tutor",
  name: "AI Tutor",
  description: "Step-by-step tutoring and practice hints constrained by your study scope.",
  runLabel: "Open AI Tutor",
  component: ChatView,
  pipelineConfig: {
    mode: "placeholder",
    template: "ai-tutor-v1"
  }
};
