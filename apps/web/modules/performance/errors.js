/**
 * Why answers are wrong.
 *
 * "You got six questions wrong" tells a learner nothing they did not already know. What helps is
 * the shape of the mistakes, and each kind calls for different work. There are three, they do not
 * overlap and between them they cover every wrong answer (mutually exclusive, collectively
 * exhaustive).
 *
 *  - ANALYTICAL — the learner went wrong in a mathematical / analytical PROCESS: a calculation,
 *    applying a formula or procedure, a multi-step derivation, interpreting numbers or data. Only a
 *    question that needs maths or quantitative analysis can have one (`isQuantitative`).
 *  - TOPIC KNOWLEDGE (conceptual) — everything else that is wrong because the idea, definition, fact
 *    or relationship is not known or is confused. Every wrong answer to a question that needs no
 *    maths ("which is NOT…", "what is the difference between…", a classification, a definition) is
 *    this, and can never be analytical.
 *  - ACCURACY — the learner wrote something close to what was expected but not exactly: a slip, a
 *    wrong detail, unit, sign, rounding or spelling, an answer that is on the right track but
 *    incomplete, a misread question, or an answer left blank on a topic they otherwise master.
 *
 * The decision is one short function, `decideError`, read top to bottom:
 *
 *   1. a cause already stored with the answer (the AI grader's) is used as it is;
 *   2. blank → accuracy when the learner is strong on the topic elsewhere (≥ 70 %), else knowledge;
 *   3. the answer was "close" (AI or local verdict) → accuracy;
 *   4. wrong, and the question needs maths → analytical;
 *   5. wrong, and it does not → knowledge.
 *
 * Finer causes still exist underneath (the mastery engine counts eight of them); each one belongs to
 * exactly one of the three. `classifyError` returns the fine cause, `decideError` the group and why.
 */
import { gradeLocally, creditOf } from "../activities/grading.js";
import { isQuantitative, numbersIn } from "../activities/quantitative.js";

export const ERROR_TYPES = [
  { id: "knowledge", label: "Topic knowledge gap", blurb: "The idea, definition, fact or relationship is not known or is confused — every wrong answer to a question that needs no maths.", advice: "Go back to the explanation and the prerequisite before practising again.", colour: "#d7003a", ink: "#b30031", covers: ["conceptual", "gap"] },
  { id: "analytical", label: "Analytical gap", blurb: "The maths or analytical process goes wrong: a calculation, applying a formula or procedure, a multi-step derivation, reading numbers or data.", advice: "Work through two examples slowly, writing every step, then try a new context.", colour: "#b25e00", ink: "#8a4a00", covers: ["procedural", "calculation", "application"] },
  { id: "accuracy", label: "Accuracy", blurb: "Close to what was expected but not exact: a slip, a wrong detail, unit, sign or rounding, an incomplete answer, a misread question, or a blank on a topic you know.", advice: "Underline what is asked, answer every question, and re-read before submitting.", colour: "#6e6e73", ink: "#5b5b60", covers: ["careless", "interpretation", "incomplete"] }
];

/** The one of the three a finer cause (or an older stored label) belongs to. */
export const groupOf = (id) => ERROR_TYPES.find((type) => type.id === id || type.covers.includes(id))?.id || "knowledge";
export const typeOf = (id) => ERROR_TYPES.find((type) => type.id === groupOf(id)) || ERROR_TYPES[0];

export { isQuantitative };

/** How strong the learner has to be on the rest of a topic for a blank answer to be a lapse, not a gap. */
export const STRONG_TOPIC = 0.7;
/** Answers elsewhere on the topic needed before "strong on the topic" is believed. */
const MIN_TOPIC_EVIDENCE = 2;

const normalise = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
const isGroup = (value) => ERROR_TYPES.some((type) => type.id === value);
const isKnownCause = (value) => isGroup(value) || ERROR_TYPES.some((type) => type.covers.includes(value));

/**
 * What kind of wrong answer this was, before the cause is chosen:
 * "blank" (nothing written), "close" (essentially right, not exact) or "incorrect".
 * A stored verdict (the AI grader's) wins; otherwise written and numeric answers are compared locally
 * and multiple-choice style answers are simply wrong.
 */
export function verdictOfWrong(row) {
  if (!normalise(row.given)) return "blank";
  if (row.verdict === "close") return "close";
  if (row.verdict === "incorrect") return "incorrect";
  const kind = row.kind || "";
  if (!kind || kind === "text" || kind === "number") {
    if (gradeLocally({ given: row.given, expected: row.expected }).verdict === "close") return "close";
  }
  return "incorrect";
}

/**
 * Which of the three a wrong answer is, and why — the transparent decision.
 * `context.topicAccuracy` is how the learner did on the rest of the topic (0..1) and
 * `context.topicEvidence` how many answers that is based on (unknown = enough).
 */
export function decideError(row, context = {}) {
  const { topicAccuracy = 0, topicEvidence = Infinity } = context;
  const quantitative = isQuantitative(row);
  const stored = String(row.errorCause || "").toLowerCase();
  const verdict = verdictOfWrong(row);
  if (stored && isKnownCause(stored)) return { group: groupOf(stored), verdict, quantitative, reason: "graded together with the answer" };
  if (verdict === "blank") {
    const strong = topicAccuracy >= STRONG_TOPIC && topicEvidence >= MIN_TOPIC_EVIDENCE;
    return strong
      ? { group: "accuracy", verdict, quantitative, reason: "left blank on a topic that is otherwise strong" }
      : { group: "knowledge", verdict, quantitative, reason: "left blank on a topic that is not yet strong" };
  }
  if (verdict === "close") return { group: "accuracy", verdict, quantitative, reason: "close to the expected answer but not exact" };
  if (quantitative) return { group: "analytical", verdict, quantitative, reason: "wrong in a question that needs maths: the calculation or method went wrong" };
  return { group: "knowledge", verdict, quantitative, reason: "wrong in a question that needs no maths: the idea is not known or is confused" };
}

/** The finer cause inside the chosen group, from the other evidence (repeats, certainty, how close). */
function fineCause(group, row, context, decision) {
  const { topicAccuracy = 0, repeats = 0, options = [] } = context;
  const given = normalise(row.given);
  const expected = normalise(row.expected);
  const confidence = String(row.confidence || "").toLowerCase();
  const numbersGiven = numbersIn(given);
  const numbersExpected = numbersIn(expected);
  const spread = numbersGiven.length && numbersExpected.length
    ? (Math.abs(numbersExpected[0]) > 0 ? Math.abs(numbersGiven[0] - numbersExpected[0]) / Math.abs(numbersExpected[0]) : Math.abs(numbersGiven[0] - numbersExpected[0]))
    : null;

  if (group === "knowledge") {
    if (decision.verdict === "blank") return "gap";
    // Sure and wrong is a misconception, not a slip; a shrug on a weak topic is a gap.
    if (confidence === "high" && topicAccuracy < 0.85) return repeats > 1 ? "gap" : "conceptual";
    if (confidence === "low" && topicAccuracy <= 0.5) return "gap";
    if (repeats > 1) return "conceptual";
    return topicAccuracy <= 0.25 ? "gap" : "conceptual";
  }
  if (group === "analytical") {
    // Near the right number on a topic that is otherwise fine: the method held, the arithmetic did not.
    if (spread !== null && spread > 0 && spread <= 0.25) return topicAccuracy >= 0.5 ? "calculation" : "procedural";
    if (repeats > 1 || topicAccuracy < 0.5) return "procedural";
    return "application";
  }
  if (decision.verdict === "blank") return "incomplete";
  // The answer given belongs to another question of the same set: the question was misread.
  if (options.some((option) => normalise(option) === given) && given !== expected) return "interpretation";
  if (numbersGiven.length && numbersExpected.length) return "careless";
  return given.length > 0 && expected.length > given.length * 1.6 ? "incomplete" : "careless";
}

/**
 * Classifies one wrong answer from what is around it and returns the finer cause
 * (`groupOf` gives the group). `context` carries the learner's other evidence on the same topic:
 * `topicAccuracy`, `repeats` (the same wrong answer on the topic), `options` (the other questions'
 * answers), and optionally `topicEvidence`. The row may carry what the grader already decided:
 * `verdict`, `errorCause`, `quantitative`, `kind`, `skill`, `prompt`.
 */
export function classifyError(row, context = {}) {
  const decision = decideError(row, context);
  return fineCause(decision.group, row, context, decision);
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
    // How the learner did on the REST of the topic: a blank answer is a lapse only if the rest is strong.
    const elsewhere = (byTopic.get(row.topic) || []).filter((entry) => entry !== row);
    const topicAccuracy = elsewhere.length ? elsewhere.reduce((sum, entry) => sum + creditOf(entry), 0) / elsewhere.length : 0;
    const context = { topicAccuracy, topicEvidence: elsewhere.length, repeats: repeatsOf(row), options: optionsOf(row) };
    const decision = decideError(row, context);
    const cause = fineCause(decision.group, row, context, decision);
    return { ...row, errorType: decision.group, cause, reason: decision.reason, quantitative: decision.quantitative, verdict: row.verdict || decision.verdict };
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
