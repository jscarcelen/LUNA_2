/**
 * masteryEngine — concept-level mastery update after each answer.
 *
 * V1: weighted formula compatible with existing masteryOf() in mastery.js.
 * V2 upgrade path: replace updateConceptMastery() with a full BKT or FSRS pass.
 *
 * Pure functions — no side effects. Callers (masteryService.js, attemptsRepository.js) handle DB.
 */

const SM2_MIN_EASE = 1.3;

/**
 * Convert a student's answer result into an SM-2 quality score (0–5).
 * correct + confident = 5, correct + medium = 4, correct + low = 3,
 * wrong + confident = 1, wrong + other = 0.
 */
function sm2Quality(correct, confidence) {
  if (correct) {
    return confidence === "high" ? 5 : confidence === "medium" ? 4 : 3;
  }
  return confidence === "high" ? 1 : 0;
}

/**
 * Update SM-2 spacing fields given previous state and the latest answer quality.
 * Returns updated { ease_factor, interval_days, next_review_at }.
 */
function updateSpacing(prev, quality) {
  let ease = prev.ease_factor ?? 2.5;
  let interval = prev.interval_days ?? 0;

  ease = Math.max(SM2_MIN_EASE, ease + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

  if (quality < 3) {
    interval = 1; // failed — reset to 1 day
  } else if (interval === 0) {
    interval = 1;
  } else if (interval === 1) {
    interval = 6;
  } else {
    interval = Math.round(interval * ease);
  }

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + interval);

  return {
    ease_factor: ease,
    interval_days: interval,
    next_review_at: nextReview.toISOString(),
  };
}

/**
 * Compute mastery score from accumulated evidence.
 * Mirrors the existing masteryOf() formula in mastery.js but at the concept level.
 *
 * @param {object} state - current student_concept_state row (or partial)
 * @param {float} recentAccuracy - accuracy of the last min(4, 40%) of attempts
 * @returns {float} mastery 0–1
 */
function computeMastery(state, recentAccuracy) {
  const overall = state.overall_accuracy ?? state.attempts_correct / Math.max(1, state.attempts_total);
  const recent  = recentAccuracy ?? state.recent_accuracy ?? overall;

  // Blend: recent performance weighted more heavily
  const blended = recent * 0.65 + overall * 0.35;

  // Difficulty scalar: harder questions count more when mastered
  const diff = parseFloat(state._concept_difficulty ?? 0.5);
  const diffScalar = 0.8 + diff * 0.4; // 0.8 at diff=0, 1.2 at diff=1

  // Coverage cap: low question count reduces confidence
  const n = state.attempts_total ?? 0;
  const coverageCap = n >= 10 ? 1 : n >= 5 ? 0.85 : n >= 2 ? 0.7 : 0.5;

  // Retention blend: if retention data exists, blend it in
  const retention = state.retention_estimate;
  const retentionBlend = retention !== null && retention !== undefined
    ? blended * 0.8 + retention * 0.2
    : blended;

  // Staleness decay: mastery degrades if not practiced recently
  const daysSince = state.last_practiced
    ? (Date.now() - new Date(state.last_practiced)) / 86400000
    : 999;
  const freshness = daysSince > 30 ? 0.6
    : daysSince > 14 ? 0.75
    : daysSince > 7 ? 0.9
    : 1.0;

  return Math.min(1, Math.max(0, retentionBlend * diffScalar * coverageCap * freshness));
}

/**
 * Increment error counters for a wrong answer.
 * @param {object} state - current student_concept_state row
 * @param {string|null} errorType - one of the 8 error types, or null
 * @returns {object} partial state with incremented error counter
 */
function incrementError(state, errorType) {
  if (!errorType) return {};
  const key = `err_${errorType}`;
  return { [key]: (state[key] ?? 0) + 1 };
}

/**
 * Full concept state update after one answer result.
 *
 * @param {object} prev - existing student_concept_state row (or {} for first attempt)
 * @param {object} result - { correct, confidence, error_type, difficulty_float? }
 * @returns {object} updated state fields to upsert into student_concept_state
 */
export function updateConceptState(prev, result) {
  const { correct, confidence, error_type } = result;
  const now = new Date().toISOString();

  const attemptsTotal   = (prev.attempts_total ?? 0) + 1;
  const attemptsCorrect = (prev.attempts_correct ?? 0) + (correct ? 1 : 0);
  const overallAccuracy = attemptsCorrect / attemptsTotal;

  const quality   = sm2Quality(correct, confidence);
  const spacing   = updateSpacing(prev, quality);
  const errors    = correct ? {} : incrementError(prev, error_type);
  const mastery   = computeMastery(
    { ...prev, overall_accuracy: overallAccuracy, attempts_total: attemptsTotal },
    prev.recent_accuracy  // will be refreshed by masteryService.recalculate()
  );

  return {
    ...errors,
    ...spacing,
    attempts_total:   attemptsTotal,
    attempts_correct: attemptsCorrect,
    overall_accuracy: overallAccuracy,
    mastery,
    first_practiced:  prev.first_practiced ?? now,
    last_practiced:   now,
    updated_at:       now,
  };
}

/**
 * Recompute recent_accuracy from the last N results (called by masteryService after batch load).
 * @param {object[]} lastResults - last N attempt_results rows for this concept (ordered by created_at desc)
 * @param {object} state - existing state (to pick window size from attempts_total)
 * @returns {float} recent accuracy 0–1
 */
export function computeRecentAccuracy(lastResults, state) {
  const n   = state.attempts_total ?? 0;
  const win = Math.max(4, Math.floor(n * 0.4));
  const slice = lastResults.slice(0, win);
  if (!slice.length) return state.overall_accuracy ?? 0;
  return slice.filter((r) => r.correct).length / slice.length;
}

/**
 * Determine whether a concept is "due" for spaced repetition review.
 * @param {object} state - student_concept_state row
 * @returns {boolean}
 */
export function isDue(state) {
  if (!state.next_review_at) return state.attempts_total > 0;
  return new Date(state.next_review_at) <= new Date();
}

export { computeMastery, sm2Quality };
