import type { AgentSpec, CompiledPrompt, InputDef } from "./types";
import { outputJsonSchema } from "./schema";
import { collectionFields, primaryCollection } from "./model";
import { flattenFields, slug } from "../../template-studio/engine/model";

export interface RunInputs { values: Record<string, unknown> }

function formatValue(input: InputDef, value: unknown): string {
  if (value === undefined || value === null || value === "") return input.default !== undefined ? `${input.default} (default)` : "not specified";
  return Array.isArray(value) ? value.join(", ") : String(value);
}

/** Plain-language rendering of the output contract, one line per field. */
export function describeOutput(spec: AgentSpec): string {
  const primary = primaryCollection(spec);
  const lines: string[] = [];
  if (primary) {
    lines.push(`Return a list called "items" (${primary.name}). Each element of the list is ONE ${singular(primary.name)}, distinct and self-contained — never put several ${primary.name.toLowerCase()} into one element. Each item has:`);
    for (const entry of flattenFields(collectionFields(primary))) {
      const f = entry.field;
      lines.push(`  - ${slug(f.name)} — ${f.description || f.name} (${f.type}${f.required === false ? ", optional" : ""})`);
    }
  }
  for (const field of spec.outputSchema.filter((f) => f !== primary)) lines.push(`- ${slug(field.name)} — ${field.description || field.name} (${field.type})`);
  return lines.join("\n");
}

/**
 * Prompt compiler: structured spec + run inputs → model prompt. Section order is fixed; nothing
 * here is stored. Material (chunks) is attached by the runtime from the context slots.
 */
export function compileAgent(spec: AgentSpec, run: RunInputs = { values: {} }): CompiledPrompt {
  const constraints = spec.instructions.constraints.filter(Boolean);
  const system = [
    `You are "${spec.name}", an AI agent that creates ${spec.purpose.headline || "structured educational content"}.`,
    spec.purpose.description,
    "",
    "INSTRUCTIONS",
    spec.instructions.core,
    spec.instructions.style ? `Style: ${spec.instructions.style}` : "",
    constraints.length ? `Rules:\n${constraints.map((c) => `- ${c}`).join("\n")}` : "",
    "",
    "OUTPUT",
    describeOutput(spec),
    "Output only valid JSON matching the schema. Content only — no formatting or styling instructions.",
    validationHints(spec)
  ].filter((line) => line !== "").join("\n");

  const choices = spec.inputs.map((input) => `- ${input.name}: ${formatValue(input, run.values[input.id])}${input.description ? ` (${input.description})` : ""}`).join("\n");
  const materialNotes = spec.contextSlots.map((slot) => `- ${slot.name} (${slot.kind === "agent_knowledge" ? "agent knowledge" : "provided by the user"}${slot.usage === "style" ? ", style example — imitate format and level, do not copy content" : ""}): ${slot.description}`).join("\n");
  const examples = spec.examples.map((example, index) => `Example ${index + 1}${example.note ? ` (${example.note})` : ""}:\nInputs: ${JSON.stringify(Object.fromEntries(Object.entries(example.inputs).map(([id, value]) => [spec.inputs.find((i) => i.id === id)?.name || id, value])))}\nOutput: ${JSON.stringify(example.output)}`).join("\n\n");
  const user = [
    "USER CHOICES",
    choices || "(none)",
    materialNotes ? `\nMATERIAL\n${materialNotes}\nThe material itself follows as referenceMaterial / styleExamples.` : "",
    examples ? `\nEXAMPLES OF GOOD OUTPUT\n${examples}` : ""
  ].filter(Boolean).join("\n");

  return { system, user, schema: outputJsonSchema(spec.outputSchema), model: spec.model.model, creativity: spec.model.creativity };
}

function singular(name: string): string {
  const n = name.trim();
  return /ies$/i.test(n) ? n.replace(/ies$/i, "y") : /s$/i.test(n) ? n.slice(0, -1) : n;
}

function validationHints(spec: AgentSpec): string {
  const hints: string[] = [];
  const countInput = spec.inputs.find((i) => i.type === "number");
  if (!spec.validationRules.some((r) => r.type === "count_matches_input")) hints.push(countInput ? `Return as many items as "${countInput.name}" asks for.` : "If the instructions mention a number of items, return exactly that many elements in items.");
  for (const rule of spec.validationRules) {
    if (rule.type === "count_matches_input") hints.push(`Return exactly the number of items requested in "${spec.inputs.find((i) => i.id === rule.inputId)?.name || "the count"}".`);
    if (rule.type === "no_duplicates") hints.push("Do not repeat items.");
    if (rule.type === "answer_in_options") hints.push("The answer must be exactly one of the options.");
    if (rule.type === "options_count") hints.push(`Each item has exactly ${rule.count} options.`);
  }
  return hints.length ? `Checks:\n${hints.map((h) => `- ${h}`).join("\n")}` : "";
}
