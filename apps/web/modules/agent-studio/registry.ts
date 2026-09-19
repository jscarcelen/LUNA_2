import type { InputType } from "./engine/types";

/** Input-type registry: how creators configure each type and how end users answer it. */
export interface InputTypeDef { type: InputType; label: string; icon: string; hint: string; needsOptions: boolean; defaultValue: unknown }
const inputTypes: InputTypeDef[] = [
  { type: "text", label: "Text", icon: "T", hint: "A free answer, e.g. a topic", needsOptions: false, defaultValue: "" },
  { type: "number", label: "Number", icon: "#", hint: "e.g. how many items", needsOptions: false, defaultValue: 10 },
  { type: "choice", label: "Choice", icon: "◉", hint: "Pick one option", needsOptions: true, defaultValue: "" },
  { type: "multi_choice", label: "Multiple choice", icon: "☑", hint: "Pick several options", needsOptions: true, defaultValue: [] },
  { type: "toggle", label: "Yes / no", icon: "⏻", hint: "A simple switch", needsOptions: false, defaultValue: "no" },
  { type: "language", label: "Language", icon: "🌐", hint: "Pick a language", needsOptions: false, defaultValue: "English" }
];
export function listInputTypes(): InputTypeDef[] { return inputTypes; }
export function getInputType(type: InputType): InputTypeDef { return inputTypes.find((item) => item.type === type) || inputTypes[0]; }

export const outputTypes: { type: string; label: string; hint: string }[] = [
  { type: "text", label: "Text", hint: "A word, phrase or sentence" },
  { type: "rich_text", label: "Rich text", hint: "Paragraphs with bold, lists, formulas" },
  { type: "number", label: "Number", hint: "" },
  { type: "boolean", label: "Yes / no", hint: "" },
  { type: "image", label: "Image", hint: "A picture URL" },
  { type: "formula", label: "Formula", hint: "LaTeX maths" },
  { type: "array", label: "List", hint: "Several values, e.g. answer options" }
];
