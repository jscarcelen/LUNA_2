import type { FieldDef } from "./types";

export type Importance = "essential" | "useful" | "extra";

/**
 * How well a template fits an agent.
 *
 * Not every field matters equally: an exam without its questions or answers is not an exam, while
 * a missing topic tag costs nothing. Fields therefore carry an importance, and a template is
 * judged on the essential ones — so a user can adapt a template, run it while it is still missing
 * a "difficulty" chip, and only be stopped when something that carries the meaning is not placed.
 */

const ESSENTIAL = /^(question|answer|correct[_ ]?answer|statement|prompt|front|back|word|translation|term|definition|content|body|task|exercise|problem|solution|text)$/i;
const USEFUL = /^(options?|answer[_ ]?options?|choices?|explanation|example|hint|clue|image|picture|title|heading|instructions?|summary|caption)$/i;
const EXTRA = /^(topic|subject|difficulty|level|skill|tag|tags|category|type|question[_ ]?type|points?|score|marks?|number|index|source|reference|language|date|notes?)$/i;

/** Importance the creator set, or a sensible reading of the field's name and type. */
export function importanceOf(field: { name?: string; importance?: Importance; type?: string; required?: boolean }): Importance {
  if (field.importance) return field.importance;
  const name = String(field.name || "").trim();
  if (EXTRA.test(name)) return "extra";
  if (ESSENTIAL.test(name)) return "essential";
  if (USEFUL.test(name)) return "useful";
  if (field.required === false) return "extra";
  return "useful";
}

export const IMPORTANCE_LABEL: Record<Importance, string> = {
  essential: "Essential",
  useful: "Useful",
  extra: "Nice to have"
};

export interface FitField { name: string; label?: string; importance?: Importance; required?: boolean; type?: string }

export interface TemplateFit {
  /** Agent fields the template shows. */
  covered: FitField[];
  /** Agent fields the template has nowhere to put, worst first. */
  missing: FitField[];
  missingEssential: FitField[];
  /** Template slots nothing fills yet. */
  emptySlots: string[];
  /** 0–1, weighted by importance: 1 = every essential and useful field has a place. */
  score: number;
  verdict: "fits" | "partial" | "poor";
  summary: string;
}

const WEIGHT: Record<Importance, number> = { essential: 5, useful: 2, extra: 0.5 };

/**
 * Compares what an agent produces with what a template asks for.
 * `mappedAgentFields` are the agent field names currently bound to a slot.
 */
export function templateFit(agentFields: FitField[], mappedAgentFields: string[], emptySlots: string[] = []): TemplateFit {
  const mapped = new Set(mappedAgentFields.filter(Boolean));
  const covered: FitField[] = [];
  const missing: FitField[] = [];
  let total = 0;
  let got = 0;
  for (const field of agentFields) {
    const weight = WEIGHT[importanceOf(field)];
    total += weight;
    if (mapped.has(field.name)) { covered.push(field); got += weight; } else missing.push(field);
  }
  missing.sort((a, b) => WEIGHT[importanceOf(b)] - WEIGHT[importanceOf(a)]);
  const missingEssential = missing.filter((field) => importanceOf(field) === "essential");
  const score = total ? got / total : 1;
  const verdict = missingEssential.length ? (score > 0.5 ? "partial" : "poor") : score >= 0.85 ? "fits" : "partial";
  const summary = missingEssential.length
    ? `Misses ${missingEssential.map((field) => `“${field.label || field.name}”`).join(", ")}`
    : missing.length
      ? `Shows everything essential · leaves out ${missing.length} extra field${missing.length === 1 ? "" : "s"}`
      : "Shows everything this agent produces";
  return { covered, missing, missingEssential, emptySlots, score, verdict, summary };
}

/** Marks a field tree with importance so a saved agent carries the creator's judgement. */
export function withImportance(fields: FieldDef[]): FieldDef[] {
  return fields.map((field) => ({
    ...field,
    importance: field.importance || (field.type === "array" || field.type === "object" ? undefined : importanceOf(field)),
    children: field.children ? withImportance(field.children) : field.children
  }));
}
