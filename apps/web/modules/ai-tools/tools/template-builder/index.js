import { TemplateStudioPage } from "./TemplateStudioPage";

export const templateBuilderTool = {
  id: "template-builder",
  name: "Template Studio",
  description: "Design how agent output looks: add blocks, tag them with fields, and export the same layout to PDF, Word, slides or HTML.",
  runLabel: "Open Template Studio",
  component: TemplateStudioPage,
  pipelineConfig: {
    mode: "visual-template-editor",
    template: "template-builder-v1"
  }
};
