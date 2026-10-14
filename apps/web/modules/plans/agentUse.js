/**
 * The learner chose these agents on purpose, so the plan uses every one of them. The planner is told so, and this is the
 * check that makes it true even when the model forgets one: an agent with no step gets one (or, for the Reading Splitter,
 * every read step of an uploaded document becomes a reading part instead of "read the whole file").
 * Pure functions: the route and the tests share them.
 */

const day = (iso) => new Date(`${iso}T12:00:00Z`);
const iso = (date) => date.toISOString().slice(0, 10);
const addDays = (value, days) => iso(new Date(day(value).getTime() + days * 86400000));

/** Where in the schedule an agent's step sits best (fraction of the way from today to the deadline) and what kind of step it is. */
const PLACEMENT = {
  "level-test": { at: 0, kind: "activity", minutes: 20 },
  summary: { at: 0.05, kind: "read", minutes: 20 },
  "document-summarizer": { at: 0.05, kind: "read", minutes: 25 },
  formulas: { at: 0.15, kind: "read", minutes: 25 },
  reading: { at: 0.05, kind: "read", minutes: 25 },
  flashcards: { at: 0.3, kind: "activity", minutes: 20 },
  "concept-flashcards": { at: 0.35, kind: "activity", minutes: 20 },
  math: { at: 0.5, kind: "activity", minutes: 30 },
  quiz: { at: 0.45, kind: "activity", minutes: 25 }
};

const LABEL = { "level-test": "Level test", summary: "Summary", "document-summarizer": "Summary", formulas: "Formula sheet", reading: "Reading", flashcards: "Flashcards", "concept-flashcards": "Concept flashcards", math: "Problem set", quiz: "Quiz" };

const lastFifthStart = (today, deadline) => addDays(today, Math.floor((day(deadline) - day(today)) / 86400000 * 0.8));

/**
 * @param {object[]} items   the planner's steps
 * @param {object[]} agents  the chosen scope: [{ id, label, makes: [keys] }]
 * @param {{ today: string, deadline: string, materials: {id:string,kind?:string}[], concepts?: string[] }} context
 * @returns {{ items: object[], added: string[], converted: number }}
 */
export function ensureAgentUse(items = [], agents = [], { today, deadline, materials = [], concepts = [] } = {}) {
  let out = items.map((item) => ({ ...item }));
  const added = [];
  let converted = 0;
  const keys = new Set(agents.flatMap((agent) => agent.makes || []));
  const uploaded = new Set(materials.filter((material) => (material.kind || "material") === "material").map((material) => material.id));

  // Reading Splitter: a read step of an uploaded document is a reading part, not the whole file.
  if (keys.has("reading")) {
    out = out.map((item) => {
      if (item.kind === "read" && !item.generate && uploaded.has(item.sourceId)) { converted += 1; return { ...item, generate: "reading" }; }
      return item;
    });
  }

  const used = (key) => out.some((item) => item.generate === key || item.madeAs === key);
  const span = Math.max(1, Math.floor((day(deadline) - day(today)) / 86400000));
  const reviewStart = lastFifthStart(today, deadline);
  const firstMaterial = materials.find((material) => (material.kind || "material") === "material") || materials[0];

  for (const agent of agents) {
    const key = (agent.makes || [])[0];
    if (!key || (agent.makes || []).some(used)) continue;
    if (String(key).startsWith("agent:") === false && !PLACEMENT[key]) continue;
    const place = PLACEMENT[key] || { at: 0.5, kind: "activity", minutes: 25 };
    let due = addDays(today, Math.round(span * place.at));
    if (due >= reviewStart) due = addDays(reviewStart, -1) < today ? today : addDays(reviewStart, -1);
    const label = agent.label || LABEL[key] || "Activity";
    const topics = concepts.slice(0, 8);
    out.push({
      title: `${LABEL[key] || label}: ${topics.length ? topics.slice(0, 3).join(", ") : firstMaterial?.name || "the material"}`,
      kind: place.kind,
      dueDate: due,
      minutes: place.minutes,
      sourceId: firstMaterial?.id || "",
      generate: key,
      goal: "",
      concepts: topics
    });
    added.push(key);
  }
  out.sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  return { items: out, added, converted };
}
