import { createFormulaSheetSpec } from "../../../agent-studio/engine/model";
import { runConfigFromSpec } from "../../../agent-studio/engine/migrate";

/** The Formula Sheet as a built-in agent (a plain config, so plans and "Update…" can use it without loading the page). */
export const FORMULA_SHEET_AGENT = runConfigFromSpec(createFormulaSheetSpec(), {
  id: "builtin-formula-sheet",
  howItWorks: [
    { title: "Choose your documents", text: "One or several: their formulas are merged into a single sheet." },
    { title: "Choose the language", text: "And optionally a topic whose formulas come first." },
    { title: "Luna writes the sheet", text: "Every key formula exactly as your material states it, what each variable means, the logic behind it and when to use it." },
    { title: "Read it, export it", text: "Read it inside Luna, or download it as PDF, Word or HTML." }
  ]
});
