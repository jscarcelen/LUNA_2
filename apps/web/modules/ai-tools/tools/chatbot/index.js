import { ChatView } from "../../../../components/views";

export const chatbotTool = {
  id: "chatbot",
  name: "Chatbot",
  description: "General purpose learning assistant for quick questions and summaries.",
  runLabel: "Open Chatbot",
  component: ChatView,
  pipelineConfig: {
    mode: "placeholder",
    template: "chatbot-v1"
  }
};
