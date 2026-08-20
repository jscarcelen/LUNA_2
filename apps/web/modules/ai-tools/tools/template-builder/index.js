import { TemplateBuilderPage } from "./TemplateBuilderPage";

export const templateBuilderTool = {
  id: "template-builder",
  name: "Template Builder",
  description: "Design document templates visually: blocks, components, layout, data mapping, and multi-format export.",
  runLabel: "Open Template Builder",
  component: TemplateBuilderPage,
  pipelineConfig: {
    mode: "visual-template-editor",
    template: "template-builder-v1"
  }
};
