import { ChatPage } from "../../../chat/ChatPage";

export const chatbotTool = {
  id: "chatbot",
  name: "Chatbot",
  description: "Your AI tutor, agent builder and Luna guide: ask about your material with references, have it run agents or write documents, and turn routines into agents.",
  runLabel: "Open Chatbot",
  component: ChatPage,
  pipelineConfig: {
    mode: "assistant",
    template: "chatbot-v2"
  }
};
