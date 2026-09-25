/**
 * Why answers are wrong.
 *
 * "You got six questions wrong" tells a learner nothing they did not already know. What helps is
 * the shape of the mistakes: a concept that is misunderstood, a procedure slipping, arithmetic,
 * misreading the question, or simply not knowing a prerequisite — each one calls for different
 * work. The taxonomy below is the standard one; the classifier reads the evidence Luna already has
 * (the answer given, the answer expected, how the same learner did on the same topic elsewhere)
 * and says which kind it looks like, and Luna's own reading can refine it.
 */

export const ERROR_TYPES = [
  { id: "conceptual", label: "Conceptual", blurb: "The idea itself is misunderstood.", advice: "Go back to the explanation before practising again.", colour: "#d7003a", ink: "#b30031" },
  { id: "procedural", label: "Procedural", blurb: "Right idea, the steps go wrong.", advice: "Work through two examples slowly, writing every step.", colour: "#b25e00", ink: "#8a4a00" },
  { id: "calculation", label: "Calculation", blurb: "The reasoning is right, the arithmetic is not.", advice: "Slow down on the arithmetic and check the last line.", colour: "#ff9f0a", ink: "#8a5a00" },
  { id: "interpretation", label: "Misread the question", blurb: "Answered something the question did not ask.", advice: "Underline what is being asked before answering.", colour: "#8e44ad", ink: "#73348f" },
  { id: "application", label: "Application", blurb: "Fine in familiar exercises, lost in a new context.", advice: "Practise the same idea in word problems.", colour: "#0aa2c0", ink: "#04708a" },
  { id: "gap", label: "Knowledge gap", blurb: "A prerequisite is missing.", advice: "Cover the prerequisite first — practice will not fix this.", colour: "#5b5bd6", ink: "#4242b0" },
  { id: "careless", label: "Careless", blurb: "Known elsewhere, missed here.", advice: "Re-read the answer before submitting.", colour: "#6e6e73", ink: "#5b5b60" },
  { id: "incomplete", label: "Incomplete", blurb: "Started right, stopped early or left blank.", advice: "Finish the reasoning, even when unsure.", colour: "#8e98ab", ink: "#5f6878" }
];

export const typeOf = (id) => ERROR_TYPES.find((type) => type.id === id) || ERROR_TYPES[0];

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
    const type = row.errorType || classifyError(row, { topicAccuracy, repeats: repeatsOf(row), options: optionsOf(row) });
    return { ...row, errorType: type };
  });

  const counts = new Map();
  for (const row of rows) counts.set(row.errorType, (counts.get(row.errorType) || 0) + 1);
  const types = [...counts.entries()]
    .map(([id, count]) => ({ ...typeOf(id), id, count, share: count / rows.length, examples: rows.filter((row) => row.errorType === id).slice(0, 3) }))
    .sort((a, b) => b.count - a.count);

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
