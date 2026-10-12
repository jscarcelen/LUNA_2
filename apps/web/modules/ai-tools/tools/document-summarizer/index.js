import { RunAgentPage } from "../agent-builder/RunAgentPage";
import { DOCUMENT_SUMMARIZER_AGENT } from "./summarizerAgent";

function DocumentSummarizerPage({ toolContext }) {
  return <RunAgentPage toolContext={toolContext} builtinAgent={DOCUMENT_SUMMARIZER_AGENT} />;
}

export const documentSummarizerTool = {
  id: "document-summarizer",
  agent: DOCUMENT_SUMMARIZER_AGENT,
  name: "Document Summarizer",
  description: "One or more documents become a single one-to-two page summary: key messages, concepts, formulas and what to remember.",
  runLabel: "Open Document Summarizer",
  component: DocumentSummarizerPage,
  pipelineConfig: { mode: "configurable-rag-pipeline", template: "agent-studio-v1" }
};
