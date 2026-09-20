/**
 * Agent Studio — canonical agent model.
 *
 * Agent = content-generation recipe. The compiled prompt is derived from this spec and never
 * stored as the source of truth. Output fields reuse the Template Studio FieldDef so template
 * compatibility is structural.
 */
import type { DataObject, FieldDef, ID } from "../../template-studio/engine/types";

export type { DataObject, FieldDef, ID };

export type InputType = "text" | "number" | "choice" | "multi_choice" | "toggle" | "language";

export interface InputDef {
  id: ID;
  name: string;
  description?: string;
  type: InputType;
  required: boolean;
  default?: unknown;
  options?: string[];
  min?: number;
  max?: number;
}

export type ContextKind = "agent_knowledge" | "user_material";
export type ContextUsage = "source" | "style";

export interface ContextSlot {
  id: ID;
  kind: ContextKind;
  name: string;
  /** How the material should be used — goes into the prompt. */
  description: string;
  required: boolean;
  multiple: boolean;
  usage: ContextUsage;
  /** agent_knowledge only: workspace documents bundled with the agent. */
  documentIds?: ID[];
  /** agent_knowledge only: pasted reference text. */
  text?: string;
}

export interface ExampleDef {
  id: ID;
  inputs: Record<ID, unknown>;
  output: DataObject;
  note?: string;
  source: "pasted" | "uploaded" | "generated";
}

export type ValidationRule =
  | { type: "required_fields" }
  | { type: "count_matches_input"; arrayFieldId: ID; inputId: ID }
  | { type: "no_duplicates"; arrayFieldId: ID; byFieldId: ID }
  | { type: "answer_in_options"; arrayFieldId: ID; answerFieldId: ID; optionsFieldId: ID }
  | { type: "options_count"; arrayFieldId: ID; optionsFieldId: ID; count: number };

/** Kept loose here to avoid a hard type dependency; the Template Studio `Template` is what is stored. */
export type TemplateLike = Record<string, unknown>;

export interface AgentSpec {
  id: ID;
  version: 1;
  name: string;
  purpose: { headline: string; description: string; category?: string };
  instructions: { core: string; style?: string; constraints: string[] };
  inputs: InputDef[];
  contextSlots: ContextSlot[];
  outputSchema: FieldDef[];
  /** The block composition the output was designed with (Template Studio structure, no formatting). Its fields ARE the output schema. */
  outputTemplate?: TemplateLike | null;
  /** Saved template id when the composition came from / was saved to the library. */
  outputTemplateId?: string;
  examples: ExampleDef[];
  validationRules: ValidationRule[];
  model: { model: string; creativity: "low" | "medium" | "high" };
  createdAt: string;
  updatedAt: string;
}

export interface CompiledPrompt {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  model: string;
  creativity: "low" | "medium" | "high";
}

export interface ValidationCheck { rule: ValidationRule["type"] | "valid_json"; ok: boolean; message: string }

export interface SpecChange { path: string; before: string; after: string }
