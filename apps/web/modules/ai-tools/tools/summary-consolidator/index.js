import { RunAgentPage } from "../agent-builder/RunAgentPage";
import { CONSOLIDATOR_AGENT } from "./consolidatorAgent";

function SummaryNotesConsolidatorPage({ toolContext }) {
  return <RunAgentPage toolContext={toolContext} builtinAgent={CONSOLIDATOR_AGENT} />;
}

export const summaryConsolidatorTool = {
  id: "summary-notes-consolidator",
  agent: CONSOLIDATOR_AGENT,
  name: "Summary Notes Consolidator",
  description: "Merge several documents into one exhaustive set of notes: overlaps written once, formulas, tables and figures kept, every statement traced to its source.",
  runLabel: "Open Summary Notes Consolidator",
  component: SummaryNotesConsolidatorPage,
  pipelineConfig: { mode: "multi-pass-consolidation", template: "agent-studio-v1" }
};
