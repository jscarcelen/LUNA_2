/**
 * priorityEngine — concept priority scoring for the adaptive planner.
 *
 * Pure functions — no DB access.
 */

/**
 * Compute priority score for a concept given the student's current state and exam context.
 * Higher score = study sooner.
 *
 * @param {object} state   - student_concept_state row (may be partial / {})
 * @param {object} concept - concepts table row (needs .importance, .difficulty, .is_prerequisite_for_count)
 * @param {Date|string|null} examDate
 * @returns {number} 0–1+ (can exceed 1 in urgent situations; callers should rank, not cap)
 */
export function conceptPriority(state, concept, examDate = null) {
  const daysUntilExam = examDate
    ? Math.max(0, (new Date(examDate) - Date.now()) / 86400000)
    : 365;

  const mastery    = state.mastery ?? 0;
  const masteryGap = 1 - mastery;                              // 0–1

  const importance = concept.importance ?? 0.5;                // 0–1 from knowledge graph

  // Urgency ramps up sharply in the last 14 days
  const urgency = daysUntilExam <= 3  ? 2.5
    : daysUntilExam <= 7  ? 2.0
    : daysUntilExam <= 14 ? 1.5
    : daysUntilExam <= 30 ? 1.2
    : 1.0;

  // Forgetting risk — increases after 7+ days without practice
  const daysSince = state.last_practiced
    ? (Date.now() - new Date(state.last_practiced)) / 86400000
    : 999;
  const forgetting = daysSince > 14 ? Math.min(2.0, 1 + (daysSince - 7) * 0.04)
    : daysSince > 7 ? 1.2
    : 1.0;

  // Error frequency — topics with high recent error rate need more attention
  const totalErrors = (state.err_conceptual ?? 0)
    + (state.err_procedural ?? 0)
    + (state.err_calculation ?? 0)
    + (state.err_interpretation ?? 0)
    + (state.err_application ?? 0)
    + (state.err_gap ?? 0);
  const errorRate   = state.attempts_total > 0 ? totalErrors / state.attempts_total : 0;
  const errorFactor = 1 + errorRate * 0.5;

  // Prerequisite risk — if this concept is a prerequisite for others, prioritise it
  const prereqFactor = (concept.is_prerequisite_for_count ?? 0) > 0 ? 1.25 : 1.0;

  // Never waste time on already-mastered concepts (unless review is due)
  if (mastery >= 0.9 && daysSince < 7) return 0.05;

  const score = masteryGap * importance * urgency * forgetting * errorFactor * prereqFactor;
  return score;
}

/**
 * Sort concepts by priority (highest first) and return the top N for today's session.
 *
 * @param {object[]} concepts       - concepts table rows (with .id, .importance, etc.)
 * @param {object}   stateByConceptId - { [conceptId]: student_concept_state row }
 * @param {object}   opts
 *   @param {Date|string|null} [opts.examDate]
 *   @param {number}           [opts.topN=5]
 *   @param {number}           [opts.minutesAvailable=60]
 * @returns {{ concept, state, priority, recommended }[]}
 */
export function rankConcepts(concepts, stateByConceptId, opts = {}) {
  const { examDate = null, topN = 5 } = opts;

  const ranked = concepts.map((concept) => {
    const state    = stateByConceptId[concept.id] ?? {};
    const priority = conceptPriority(state, concept, examDate);
    return { concept, state, priority };
  }).sort((a, b) => b.priority - a.priority);

  return ranked.slice(0, topN);
}

/**
 * Check whether any prerequisite concepts are unmastered.
 *
 * @param {object[]} prereqConcepts    - prerequisite concept rows
 * @param {object}   stateByConceptId
 * @param {number}   [masteryThreshold=0.6]
 * @returns {boolean} true if ALL prerequisites are mastered
 */
export function prereqsMastered(prereqConcepts, stateByConceptId, masteryThreshold = 0.6) {
  return prereqConcepts.every((c) => (stateByConceptId[c.id]?.mastery ?? 0) >= masteryThreshold);
}
