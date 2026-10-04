/**
 * Why answers are wrong.
 *
 * "You got six questions wrong" tells a learner nothing they did not already know. What helps is
 * the shape of the mistakes: a concept that is misunderstood, a procedure slipping, arithmetic,
 * misreading the question, or simply not knowing a prerequisite — each one calls for different
 * work. The classifier reads the evidence Luna already has
 * (the answer given, the answer expected, how the same learner did on the same topic elsewhere)
 * and says which kind it looks like, and Luna's own reading can refine it.
 */

/**
 * Three kinds of gap, and no more. They do not overlap and between them they cover every wrong
 * answer (mutually exclusive, collectively exhaustive), because each one is fixed by different work:
 *
 *  - Topic knowledge: the idea is not understood, or something it rests on is missing → go back to the explanation.
 *  - Analytical: the idea is there, the reasoning or the working goes wrong (steps, arithmetic, applying it to a new case) → practise the method.
 *  - Accuracy: attention to detail — a slip, a misread question, an answer left blank or unfinished → slow down and check.
 *
 * Finer causes still exist underneath (the mastery engine counts eight of them); each one belongs to exactly one of the three.
 */
export const ERROR_TYPES = [
  { id: "knowledge", label: "Topic knowledge gap", blurb: "The concept is not understood, or something it builds on is missing.", advice: "Go back to the explanation and the prerequisite before practising again.", colour: "#d7003a", ink: "#b30031", covers: ["conceptual", "gap"] },
  { id: "analytical", label: "Analytical gap", blurb: "The idea is there; the maths or the reasoning goes wrong.", advice: "Work through two examples slowly, writing every step, then try a new context.", colour: "#b25e00", ink: "#8a4a00", covers: ["procedural", "calculation", "application"] },
  { id: "accuracy", label: "Accuracy", blurb: "Attention to detail: slips, misread questions, questions left blank.", advice: "Underline what is asked, answer every question, and re-read before submitting.", colour: "#6e6e73", ink: "#5b5b60", covers: ["careless", "interpretation", "incomplete"] }
];

/** The one of the three a finer cause (or an older stored label) belongs to. */
export const groupOf = (id) => ERROR_TYPES.find((type) => type.id === id || type.covers.includes(id))?.id || "knowledge";
export const typeOf = (id) => ERROR_TYPES.find((type) => type.id === groupOf(id)) || ERROR_TYPES[0];

const normalise = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
const numbersIn = (value) => (String(value || "").match(/-?\d+(?:[.,]\d+)?/g) || []).map((entry) => Number(entry.replace(",", ".")));

/**
 * Classifies one wrong answer from what is around it.
 * `context` carries the learner's other evidence on the same topic, so "careless" can be told from
 * "conceptual": the same mistake twice on a topic they otherwise fail is conceptual; a single slip
 * on a topic they otherwise pass is careless.
 */
export function classifyError(row, context = {}) {
  const given = normalise(row.given);
  const expected = normalise(row.expected);
  const { topicAccuracy = 0, repeats = 0, options = [] } = context;
  /**
   * What the learner said before checking. Certainty is the strongest single signal there is: being
   * sure and wrong is a misconception, not a slip, and no amount of extra practice fixes it. A
   * shrug on a weak topic is a gap. Only used when the activity asked.
   */
  const confidence = String(row.confidence || "").toLowerCase();

  if (!given) return repeats > 1 || topicAccuracy < 0.4 ? "gap" : "incomplete";
  if (confidence === "high" && topicAccuracy < 0.85) return repeats > 1 ? "gap" : "conceptual";
  if (confidence === "low" && topicAccuracy <= 0.5) return "gap";

  const givenNumbers = numbersIn(given);
  const expectedNumbers = numbersIn(expected);
  if (givenNumbers.length && expectedNumbers.length) {
    const [a] = givenNumbers;
    const [b] = expectedNumbers;
    const spread = Math.abs(b) > 0 ? Math.abs(a - b) / Math.abs(b) : Math.abs(a - b);
    // Close but wrong, on a topic that is otherwise fine: the method held, the arithmetic did not.
    if (spread > 0 && spread <= 0.25 && topicAccuracy >= 0.5) return "calculation";
    if (spread > 0 && spread <= 0.25) return "procedural";
  }

  // The answer given belongs to another question of the same set: the question was misread.
  if (options.some((option) => normalise(option) === given) && given !== expected) {
    return repeats > 1 ? "conceptual" : "interpretation";
  }

  if (repeats > 1) return "conceptual";
  if (topicAccuracy >= 0.7) return "careless";
  if (topicAccuracy <= 0.25) return "gap";
  if (given.length > 0 && expected.length > given.length * 2) return "incomplete";
  return "application";
}

/**
 * Every wrong answer in the evidence, classified, with the shares that make the picture:
 * "42% of your mistakes are conceptual" is the sentence this produces.
 */
export function analyseErrors(evidence = []) {
  const wrong = evidence.filter((row) => !row.correct);
  if (!wrong.length) return { total: 0, types: [], byTopic: new Map(), rows: [] };

  const byTopic = new Map();
  for (const row of evidence) {
    if (!byTopic.has(row.topic)) byTopic.set(row.topic, []);
    byTopic.get(row.topic).push(row);
  }
  const repeatsOf = (row) => wrong.filter((other) => other.topic === row.topic && normalise(other.given) === normalise(row.given)).length;
  const optionsOf = (row) => byTopic.get(row.topic)?.map((other) => other.expected) || [];

  const rows = wrong.map((row) => {
    const topicRows = byTopic.get(row.topic) || [];
    const topicAccuracy = topicRows.length ? topicRows.filter((entry) => entry.correct).length / topicRows.length : 0;
    const cause = row.errorType || classifyError(row, { topicAccuracy, repeats: repeatsOf(row), options: optionsOf(row) });
    return { ...row, errorType: groupOf(cause), cause };
  });

  const counts = new Map(ERROR_TYPES.map((type) => [type.id, 0]));
  for (const row of rows) counts.set(row.errorType, (counts.get(row.errorType) || 0) + 1);
  // All three are always listed, so the framework is visible even when one of them is empty.
  const types = [...counts.entries()]
    .map(([id, count]) => ({ ...typeOf(id), id, count, share: count / rows.length, examples: rows.filter((row) => row.errorType === id).slice(0, 3) }))
    .sort((a, b) => b.count - a.count || ERROR_TYPES.findIndex((type) => type.id === a.id) - ERROR_TYPES.findIndex((type) => type.id === b.id));

  const perTopic = new Map();
  for (const row of rows) {
    const list = perTopic.get(row.topic) || new Map();
    list.set(row.errorType, (list.get(row.errorType) || 0) + 1);
    perTopic.set(row.topic, list);
  }
  const topicTypes = new Map(
    [...perTopic.entries()].map(([topic, list]) => {
      const total = [...list.values()].reduce((sum, count) => sum + count, 0);
      return [topic, [...list.entries()].map(([id, count]) => ({ ...typeOf(id), id, count, share: count / total })).sort((a, b) => b.count - a.count)];
    })
  );

  return { total: rows.length, types, byTopic: topicTypes, rows };
}

/** One sentence a parent can read: what the mistakes are mostly about. */
export function errorSummary(analysis) {
  if (!analysis.total) return "No mistakes recorded yet.";
  const [first, second] = analysis.types;
  const part = (entry) => `${Math.round(entry.share * 100)}% ${entry.label.toLowerCase()}`;
  return `${part(first)}${second ? `, ${part(second)}` : ""} — ${first.blurb.toLowerCase()}`;
}
