/**
 * The agents a study plan may use to build its resources.
 *
 * When a plan is generated the learner picks a *scope*: the agents Luna is allowed to use — not a
 * checklist, the planner uses only what the plan needs. The built-in agents make the familiar
 * kinds (quiz, exam, worksheet, flashcards); every agent the learner built or bought
 * can be added too. The scope is stored on the plan, so re-planning stays inside it.
 *
 * A step's `generate` value is a *key*: a built-in kind ("quiz", "flashcards"…) or `agent:<id>`
 * for a saved agent.
 */

import { tEn } from "../../lib/i18n/index.js";

// The built-in agents of the Create tab (the Summary Notes Consolidator is not here: the plan builds its master document itself), then whatever the learner built or bought.
export const BUILTIN_PLAN_AGENTS = [
  { id: "quiz", label: "Quiz Generator", purpose: "Questions to answer — multiple choice, true/false and short answer — plus practice exams and worksheets.", makes: ["quiz", "exam", "worksheet"] },
  { id: "flashcards", label: "Vocabulary Flashcards", purpose: "Front/back cards for memorising terms, definitions and ideas.", makes: ["flashcards"] },
  { id: "summary", label: "Topic Summary", purpose: "A 1–2 page summary of a group of topics with the key ideas, messages and formulas, read before the original notes to set the scene.", makes: ["summary"] },
  // The rest of the built-in agents of the Create tab, so the plan can use every one of them.
  { id: "math", label: "Math Problem Set", purpose: "Problems that use the formulas in the material, with fully worked step-by-step answers.", makes: ["math"] },
  { id: "concept-flashcards", label: "Concept Flashcards", purpose: "The key concepts of the material, each on a card with its definition.", makes: ["concept-flashcards"] },
  { id: "document-summarizer", label: "Document Summarizer", purpose: "One or two pages with the key messages, concepts, formulas and what to remember, written like a consultant's briefing.", makes: ["document-summarizer"] },
  { id: "formulas", label: "Formula Sheet", purpose: "Every key formula of the material with what each variable means, the logic behind it and when to use it.", makes: ["formulas"] },
  { id: "reading-splitter", label: "Reading Splitter", purpose: "Cuts a long document into short reading parts (the material's own text, copied exactly) so a reading step is one part, not the whole file.", makes: ["reading"] },
  { id: "level-test", label: "Level Test", purpose: "A short diagnostic test of the foundations the material builds on, to find out where to start.", makes: ["level-test"] }
];

/** Keys whose output is read, not answered: a summary-like document, scoped by topics rather than tested per concept. */
export const isSummaryKey = (key) => ["summary", "document-summarizer", "formulas", "reading"].includes(String(key || ""));

export const DEFAULT_PLAN_AGENT_IDS = ["quiz", "flashcards", "summary"];

export const customAgentKey = (documentId) => `agent:${documentId}`;
export const isCustomKey = (key) => String(key || "").startsWith("agent:");

/** Saved and bought agents found in the workspace's documents. */
export function customPlanAgents(documents = []) {
  const out = [];
  for (const document of documents) {
    if (document.sourceType !== "generated" || !(document.tags || []).includes("ai-agent")) continue;
    let parsed = {};
    try { parsed = JSON.parse(String(document.content || "{}")); } catch { parsed = {}; }
    out.push({
      id: customAgentKey(document.id),
      label: String(parsed.name || document.name || "Agent").replace(/\.agent\.json$/, ""),
      purpose: String(parsed.tagline || parsed.description || "").slice(0, 200),
      makes: [customAgentKey(document.id)],
      custom: true,
      documentId: document.id,
      bought: Boolean(parsed.installedFrom?.listingId)
    });
  }
  return out;
}

export const planAgentCatalog = (documents = []) => [...BUILTIN_PLAN_AGENTS, ...customPlanAgents(documents)];

/** What is stored on the plan: self-contained, so re-planning needs nothing else. */
export function scopeFromIds(ids = [], catalog = []) {
  return catalog.filter((agent) => ids.includes(agent.id)).map(({ id, label, purpose, makes, custom, documentId }) => ({ id, label, purpose, makes, ...(custom ? { custom: true, documentId } : {}) }));
}

/** The `generate` values the plan may use. */
export const generateKeys = (scope) => [...new Set((scope || []).flatMap((agent) => agent.makes || []))];

const GEN_KEYS = new Set(["quiz", "exam", "worksheet", "flashcards", "summary", "math", "concept-flashcards", "document-summarizer", "formulas", "reading", "level-test"]);

/** Human name of a `generate` key, for step notes and previews. */
export function generateLabel(key, scope, t = tEn) {
  if (!key) return "";
  const agent = (scope || []).find((entry) => (entry.makes || []).includes(key));
  if (isCustomKey(key)) return agent?.label || t("plans.gen.agent");
  return (GEN_KEYS.has(key) ? t(`plans.gen.${key}`) : "") || key;
}

/** Text for the planner prompt: which agents exist and what each can make. */
export function describeScope(scope) {
  return (scope || []).map((agent) => `- ${agent.label}: ${agent.purpose || "builds study material"} → generate = ${(agent.makes || []).join(" | ")}`).join("\n");
}
