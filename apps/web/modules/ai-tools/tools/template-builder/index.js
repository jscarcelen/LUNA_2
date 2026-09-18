import { TemplateStudio } from "../../../template-studio/TemplateStudio";

export const templateBuilderTool = {
  id: "template-builder",
  name: "Template Studio",
  description: "Design the document: static design, AI fields, repeating groups, views — one template, every export format.",
  runLabel: "Open Template Studio",
  component: TemplateStudio,
  pipelineConfig: {
    mode: "visual-template-editor",
    template: "template-studio-v3"
  }
};
