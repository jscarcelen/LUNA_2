/**
 * resourcePolicy — maps (student concept state + context) → recommended resource kind.
 *
 * Pure function — no DB access. The planner and the "Do it now" wiring call this.
 * Rules are evaluated in order; first match wins.
 */

/**
 * @param {object} state - student_concept_state row (may be partial / {} for first exposure)
 * @param {object} context
 *   @param {number}  [context.daysUntilExam=365]
 *   @param {boolean} [context.prereqsMastered=true] - false if any prerequisite mastery < 0.6
 *   @param {number}  [context.sessionNumber=1]      - how many sessions the student has done
 * @returns {{ kind: string, durationMinutes: number, reason: string }}
 */
export function selectResource(state, context = {}) {
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
      reason: "A prerequisite concept needs practice before tackling this one.",
    },
    {
      cond: attemptsTotal === 0,
      kind: "explanation",
      duration: 10,
      reason: "First exposure — start with a clear explanation and worked example.",
    },
    {
      cond: examImminent,
      kind: "mixed_exam",
      duration: 30,
      reason: "Exam in ≤ 3 days — exam-style mixed practice.",
    },
    {
      cond: mastery < 0.2,
      kind: "explanation",
      duration: 12,
      reason: "Very low mastery — explain the concept before quizzing.",
    },
    {
      cond: mastery < 0.4,
      kind: "flashcards",
      duration: 15,
      reason: "Low mastery — build recall with flashcards before quizzing.",
    },
    {
      cond: mastery < 0.6 && dominant === "calculation",
      kind: "worksheet",
      duration: 20,
      reason: "Repeated calculation errors — targeted worked-problem practice.",
    },
    {
      cond: mastery < 0.6 && dominant === "interpretation",
      kind: "scenario_quiz",
      duration: 20,
      reason: "Interpretation errors — scenario-based questions to build meaning.",
    },
    {
      cond: mastery < 0.6 && dominant === "conceptual",
      kind: "explanation_then_quiz",
      duration: 20,
      reason: "Conceptual gap — re-explain then quiz.",
    },
    {
      cond: mastery < 0.6 && dominant === "gap",
      kind: "explanation",
      duration: 15,
      reason: "Knowledge gap detected — explain the missing foundation.",
    },
    {
      cond: mastery < 0.7,
      kind: "targeted_quiz",
      duration: 15,
      reason: "Building mastery — focused retrieval practice.",
    },
    {
      cond: mastery >= 0.7 && daysSince > 14,
      kind: "spaced_retrieval",
      duration: 10,
      reason: "Mastered but not recently reviewed — spaced retrieval to maintain.",
    },
    {
      cond: mastery >= 0.7 && examSoon,
      kind: "mixed_exam",
      duration: 25,
      reason: "Exam approaching — exam-style mixed practice.",
    },
    {
      cond: mastery >= 0.7 && dominant === "careless",
      kind: "targeted_practice",
      duration: 10,
      reason: "Careless errors dominate — short focused drill.",
    },
    {
      cond: mastery >= 0.8,
      kind: "interleaved_challenge",
      duration: 20,
      reason: "Strong mastery — interleaved challenge to transfer learning.",
    },
    // Default
    {
      cond: true,
      kind: "quiz",
      duration: 15,
      reason: "General practice.",
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
