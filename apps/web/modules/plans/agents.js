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

// Only the agents of the AI agents tab: the two built-in ones, then whatever the learner built or bought.
export const BUILTIN_PLAN_AGENTS = [
  { id: "quiz", label: "Quiz Generator", purpose: "Questions to answer — multiple choice, true/false and short answer — plus practice exams and worksheets.", makes: ["quiz", "exam", "worksheet"] },
  { id: "flashcards", label: "Vocabulary Flashcards", purpose: "Front/back cards for memorising terms, definitions and ideas.", makes: ["flashcards"] }
];

export const DEFAULT_PLAN_AGENT_IDS = ["quiz", "flashcards"];

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

/** Human name of a `generate` key, for step notes and previews. */
export function generateLabel(key, scope) {
  if (!key) return "";
  const agent = (scope || []).find((entry) => (entry.makes || []).includes(key));
  if (isCustomKey(key)) return agent?.label || "agent";
  return ({ quiz: "quiz", exam: "practice exam", worksheet: "worksheet", flashcards: "flashcards" })[key] || key;
}

/** Text for the planner prompt: which agents exist and what each can make. */
export function describeScope(scope) {
  return (scope || []).map((agent) => `- ${agent.label}: ${agent.purpose || "builds study material"} → generate = ${(agent.makes || []).join(" | ")}`).join("\n");
}
