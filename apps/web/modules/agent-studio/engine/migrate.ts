import type { AgentSpec, InputDef, InputType } from "./types";
import { createAgentSpec, createCollection, createInput, createSlot } from "./model";
import { compileAgent } from "./compile";
import { legacyFields, outputJsonSchema } from "./schema";
import { createField } from "../../template-studio/engine/model";

const INPUT_FROM_QUESTION: Record<string, InputType> = { text: "text", number: "number", "single-select": "choice", "multi-select": "multi_choice", "yes-no": "toggle" };
const QUESTION_FROM_INPUT: Record<InputType, string> = { text: "text", number: "number", choice: "single-select", multi_choice: "multi-select", toggle: "yes-no", language: "single-select" };

/** Legacy `.agent.json` config (or a built-in legacy agent object) → AgentSpec. */
export function specFromLegacy(config: any): AgentSpec {
  if (config?.spec?.version === 1) return config.spec as AgentSpec;
  const spec = createAgentSpec(String(config?.name || "Untitled agent"));
  spec.purpose = { headline: String(config?.tagline || config?.name || ""), description: String(config?.description || config?.instructions || "").slice(0, 400) };
  spec.instructions = { core: String(config?.instructions || ""), constraints: [] };
  spec.inputs = (Array.isArray(config?.questions) ? config.questions : []).map((q: any) => createInput(String(q.text || "Question"), INPUT_FROM_QUESTION[q.type] || "text", { id: q.id, required: q.required !== false, options: Array.isArray(q.options) ? q.options : undefined }));
  spec.contextSlots = [createSlot("user_material", "Source material", { description: "Draw the content from this material.", required: false, multiple: true })];
  if (config?.contextPrompt) spec.contextSlots.push(createSlot("agent_knowledge", "Reference notes", { description: "Reference text bundled with the agent.", text: String(config.contextPrompt) }));
  const fields = (Array.isArray(config?.template?.fields) ? config.template.fields : []).map((f: any) => (f.type === "array" ? createField(f.label || f.name, "array", { description: f.description, children: [createField(`${f.label || f.name} item`, "text")] }) : createField(f.label || f.name, f.type === "number" ? "number" : f.type === "boolean" ? "boolean" : "text", { description: f.description, required: true })));
  spec.outputSchema = [createCollection("Items", fields)];
  spec.model = { model: String(config?.model || "gpt-4o-mini"), creativity: (config?.creativity as AgentSpec["model"]["creativity"]) || "medium" };
  return spec;
}

/**
 * AgentSpec → the legacy run config RunAgentPage and the runtime consume. The compiled prompt
 * goes into `instructions`; the JSON schema and validation rules travel alongside.
 */
export function runConfigFromSpec(spec: AgentSpec, extra: Record<string, unknown> = {}) {
  const compiled = compileAgent(spec);
  const userSlots = spec.contextSlots.filter((slot) => slot.kind === "user_material");
  return {
    name: spec.name,
    tagline: spec.purpose.headline,
    description: spec.purpose.description,
    howItWorks: [
      { title: "Choose your material", text: userSlots.length ? userSlots.map((slot) => `${slot.name}${slot.required ? " (required)" : ""}: ${slot.description}`).join(" ") : "This agent runs from its own knowledge." },
      { title: "Make your choices", text: spec.inputs.length ? spec.inputs.map((input) => input.name).join(" · ") : "Nothing to choose." },
      { title: "Pick a layout", text: "Any template with matching fields works — the content stays the same." },
      { title: "Export or save", text: "PDF, Word, PowerPoint, HTML — or straight into your workspace." }
    ],
    instructions: compiled.system,
    contextPrompt: "",
    knowledgeText: spec.contextSlots.filter((slot) => slot.kind === "agent_knowledge" && slot.text).map((slot) => `${slot.name}: ${slot.text}`).join("\n\n"),
    questions: spec.inputs.map((input) => ({ id: input.id, text: input.name, type: QUESTION_FROM_INPUT[input.type], options: input.type === "language" ? undefined : input.options, required: input.required, defaultValue: input.default, description: input.description })),
    outputExample: spec.examples[0] ? JSON.stringify(spec.examples[0].output) : "",
    template: { fields: legacyFields(spec.outputSchema) },
    outputJsonSchema: outputJsonSchema(spec.outputSchema),
    // Every agent gets the distinct-items check, even specs saved before it became a default.
    validationRules: spec.validationRules.some((rule) => rule.type === "no_duplicates")
      ? spec.validationRules
      : [...spec.validationRules, { type: "no_duplicates", arrayFieldId: "__primary__", byFieldId: "__first__" }],
    model: spec.model.model,
    creativity: spec.model.creativity,
    scope: { workspaceId: "", subjectId: "", documentIds: spec.contextSlots.flatMap((slot) => (slot.kind === "agent_knowledge" ? slot.documentIds || [] : [])), styleDocumentIds: [] },
    materialSlots: userSlots.map((slot) => ({ id: slot.id, name: slot.name, description: slot.description, required: slot.required, usage: slot.usage })),
    spec,
    ...extra
  };
}

export type { InputDef };
