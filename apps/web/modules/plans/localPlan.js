/**
 * The study plan without a model (no OpenAI key): a plain, sensible schedule built by code so plan
 * generation keeps working offline, like provider-local.js does for agents. It is deliberately simple:
 * the concepts are taken in the order of the concept map (or one group per document), each group is read
 * and then practised with the first agent the learner allowed, spaced over the first four fifths of the
 * time, then a review and a practice exam on the last days. The route then runs the same checks on it as
 * on a model's plan (coverage, agent use, daily cap, consolidated view first).
 * Pure: dates come from the arguments, never from the clock.
 */

const day = (iso) => new Date(`${iso}T12:00:00Z`);
const iso = (date) => date.toISOString().slice(0, 10);
const addDays = (value, days) => iso(new Date(day(value).getTime() + days * 86400000));
const daysBetween = (from, to) => Math.max(0, Math.round((day(to) - day(from)) / 86400000));

/** What practises a group, in order of preference among the kinds the learner allowed. */
const PRACTICE = ["quiz", "flashcards", "concept-flashcards", "worksheet", "math"];
const LABEL = { quiz: "Quiz", flashcards: "Flashcards", "concept-flashcards": "Concept flashcards", worksheet: "Worksheet", math: "Problem set" };

const chunk = (list, size) => {
  const out = [];
  for (let index = 0; index < list.length; index += size) out.push(list.slice(index, index + size));
  return out;
};

/**
 * @param {{ today: string, deadline: string, materials: {id:string,name?:string,kind?:string,concepts?:string[]}[], kinds?: string[], conceptMap?: {name:string,topic?:string}[], maxPerDay?: number }} input
 * @returns {{ name: string, note: string, goals: object[], items: object[] }} the same shape the model returns
 */
export function localPlan({ today, deadline, materials = [], kinds = [], conceptMap = [], maxPerDay = 90 }) {
  const allowed = new Set(kinds);
  const practice = PRACTICE.find((key) => allowed.has(key)) || "";
  const examKey = allowed.has("exam") ? "exam" : allowed.has("quiz") ? "quiz" : "";
  const uploads = materials.filter((material) => (material.kind || "material") === "material");
  const sources = uploads.length ? uploads : materials;
  const names = [...new Set(conceptMap.map((concept) => String(concept?.name || "").trim()).filter(Boolean))];

  // Groups of six concepts (a step lists at most 8); without a concept map, one group per document.
  const groups = names.length
    ? chunk(names, 6).map((concepts, index) => ({ concepts, source: sources[index % Math.max(1, sources.length)] }))
    : sources.map((source) => ({ concepts: Array.isArray(source.concepts) ? source.concepts.slice(0, 8) : [], source }));

  const span = Math.max(1, daysBetween(today, deadline));
  const studyDays = Math.max(1, Math.floor(span * 0.8));
  const minutes = Math.max(15, Math.min(45, Math.floor(maxPerDay / 2)));
  const items = [];
  groups.forEach((group, index) => {
    const at = addDays(today, Math.min(studyDays - 1, Math.floor((index * studyDays) / Math.max(1, groups.length))));
    const topic = group.concepts.length ? group.concepts.slice(0, 3).join(", ") : group.source?.name || "the material";
    items.push({ title: `Read: ${topic}`, kind: "read", dueDate: at, minutes, sourceId: group.source?.id || "", generate: allowed.has("reading") ? "reading" : "", goal: "", concepts: group.concepts });
    if (practice) items.push({ title: `${LABEL[practice]}: ${topic}`, kind: "activity", dueDate: addDays(at, span > groups.length * 2 ? 1 : 0), minutes, sourceId: group.source?.id || "", generate: practice, goal: "", concepts: group.concepts });
  });
  const reviewDay = addDays(today, Math.min(span, studyDays));
  items.push({ title: "Review: your mistakes so far", kind: "review", dueDate: reviewDay > deadline ? deadline : reviewDay, minutes, sourceId: "", generate: "", goal: "", concepts: names.slice(0, 8) });
  items.push({ title: "Practice exam", kind: "exam", dueDate: deadline, minutes: Math.min(90, Math.max(30, maxPerDay)), sourceId: sources[0]?.id || "", generate: examKey, goal: "", concepts: names });

  const goal = { title: "Know and practise every topic of the material", concepts: names, targetScore: 0.8 };
  for (const item of items) item.goal = goal.title;
  return {
    name: sources.length === 1 ? `Plan: ${sources[0].name || "my material"}` : "Study plan",
    note: "This plan was built without the AI planner (no model is configured), so it follows the order of your material. Every step can be moved or changed.",
    goals: [goal],
    items: items.filter((item) => item.dueDate >= today && item.dueDate <= deadline).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  };
}
