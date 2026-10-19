/**
 * resourcePolicy — maps (student concept state + context) → recommended resource kind.
 *
 * Pure function — no DB access. The planner and the "Do it now" wiring call this.
 * Rules are evaluated in order; first match wins.
 */
import { tEn } from "../../lib/i18n/index.js";

/**
 * @param {object} state - student_concept_state row (may be partial / {} for first exposure)
 * @param {object} context
 *   @param {number}  [context.daysUntilExam=365]
 *   @param {boolean} [context.prereqsMastered=true] - false if any prerequisite mastery < 0.6
 *   @param {number}  [context.sessionNumber=1]      - how many sessions the student has done
 * @returns {{ kind: string, durationMinutes: number, reason: string }}
 */
export function selectResource(state, context = {}, t = tEn) {
  const {
    daysUntilExam    = 365,
    prereqsMastered  = true,
  } = context;

  const mastery        = state.mastery ?? 0;
  const attemptsTotal  = state.attempts_total ?? 0;
  const lastPracticed  = state.last_practiced;
  const daysSince      = lastPracticed
    ? (Date.now() - new Date(lastPracticed)) / 86400000
    : 999;

  const dominant   = getDominantError(state);
  const examSoon   = daysUntilExam <= 14;
  const examImminent = daysUntilExam <= 3;

  const rules = [
    {
      cond: !prereqsMastered,
      kind: "prerequisite_first",
      duration: 15,
      reason: t("progress.policy.prereq"),
    },
    {
      cond: attemptsTotal === 0,
      kind: "explanation",
      duration: 10,
      reason: t("progress.policy.first"),
    },
    {
      cond: examImminent,
      kind: "mixed_exam",
      duration: 30,
      reason: t("progress.policy.exam3"),
    },
    {
      cond: mastery < 0.2,
      kind: "explanation",
      duration: 12,
      reason: t("progress.policy.veryLow"),
    },
    {
      cond: mastery < 0.4,
      kind: "flashcards",
      duration: 15,
      reason: t("progress.policy.low"),
    },
    {
      cond: mastery < 0.6 && dominant === "calculation",
      kind: "worksheet",
      duration: 20,
      reason: t("progress.policy.calc"),
    },
    {
      cond: mastery < 0.6 && dominant === "interpretation",
      kind: "scenario_quiz",
      duration: 20,
      reason: t("progress.policy.interp"),
    },
    {
      cond: mastery < 0.6 && dominant === "conceptual",
      kind: "explanation_then_quiz",
      duration: 20,
      reason: t("progress.policy.concept"),
    },
    {
      cond: mastery < 0.6 && dominant === "gap",
      kind: "explanation",
      duration: 15,
      reason: t("progress.policy.gap"),
    },
    {
      cond: mastery < 0.7,
      kind: "targeted_quiz",
      duration: 15,
      reason: t("progress.policy.building"),
    },
    {
      cond: mastery >= 0.7 && daysSince > 14,
      kind: "spaced_retrieval",
      duration: 10,
      reason: t("progress.policy.spaced"),
    },
    {
      cond: mastery >= 0.7 && examSoon,
      kind: "mixed_exam",
      duration: 25,
      reason: t("progress.policy.examSoon"),
    },
    {
      cond: mastery >= 0.7 && dominant === "careless",
      kind: "targeted_practice",
      duration: 10,
      reason: t("progress.policy.careless"),
    },
    {
      cond: mastery >= 0.8,
      kind: "interleaved_challenge",
      duration: 20,
      reason: t("progress.policy.strong"),
    },
    // Default
    {
      cond: true,
      kind: "quiz",
      duration: 15,
      reason: t("progress.policy.general"),
    },
  ];

  const match = rules.find((r) => r.cond);
  return { kind: match.kind, durationMinutes: match.duration, reason: match.reason };
}

/**
 * Returns the error type with the highest count, or null if no errors recorded.
 * @param {object} state - student_concept_state row
 * @returns {string|null}
 */
export function getDominantError(state) {
  const entries = [
    ["conceptual",    state.err_conceptual    ?? 0],
    ["procedural",    state.err_procedural    ?? 0],
    ["calculation",   state.err_calculation   ?? 0],
    ["interpretation",state.err_interpretation ?? 0],
    ["application",   state.err_application   ?? 0],
    ["gap",           state.err_gap           ?? 0],
    ["careless",      state.err_careless      ?? 0],
    ["incomplete",    state.err_incomplete    ?? 0],
  ];
  const max = entries.reduce((best, e) => (e[1] > best[1] ? e : best), ["", 0]);
  return max[1] > 0 ? max[0] : null;
}

/**
 * Returns the error profile as an array sorted by frequency (descending).
 * @param {object} state - student_concept_state row
 * @returns {{ type: string, count: number }[]}
 */
export function errorProfile(state) {
  return [
    { type: "conceptual",     count: state.err_conceptual     ?? 0 },
    { type: "procedural",     count: state.err_procedural     ?? 0 },
    { type: "calculation",    count: state.err_calculation    ?? 0 },
    { type: "interpretation", count: state.err_interpretation ?? 0 },
    { type: "application",    count: state.err_application    ?? 0 },
    { type: "gap",            count: state.err_gap            ?? 0 },
    { type: "careless",       count: state.err_careless       ?? 0 },
    { type: "incomplete",     count: state.err_incomplete     ?? 0 },
  ].filter((e) => e.count > 0).sort((a, b) => b.count - a.count);
}
