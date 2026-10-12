import { RunAgentPage } from "../agent-builder/RunAgentPage";
import { FORMULA_SHEET_AGENT } from "./formulaAgent";

function FormulaSheetPage({ toolContext }) {
  return <RunAgentPage toolContext={toolContext} builtinAgent={FORMULA_SHEET_AGENT} />;
}

export const formulaSheetTool = {
  id: "formula-sheet",
  agent: FORMULA_SHEET_AGENT,
  name: "Formula Sheet",
  description: "Every key formula in your documents with what each variable means, the logic behind it and when to use it.",
  runLabel: "Open Formula Sheet",
  component: FormulaSheetPage,
  pipelineConfig: { mode: "configurable-rag-pipeline", template: "agent-studio-v1" }
};
