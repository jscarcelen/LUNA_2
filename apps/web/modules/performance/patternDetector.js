/**
 * patternDetector — cross-topic transversal skill gap detection.
 *
 * Pure function — no DB access.
 * Requires at least MIN_ATTEMPTS attempts per concept before flagging patterns.
 */

import { getDominantError } from "./resourcePolicy.js";

const MIN_ATTEMPTS = 3;   // minimum questions answered before a concept counts
const MIN_TOPICS   = 3;   // minimum distinct topics before flagging a transversal pattern

/**
 * Detect transversal skill gaps and prerequisite risks across the student's concept states.
 *
 * @param {object} stateByConceptId  - { [conceptId]: student_concept_state row }
 * @param {object} conceptById       - { [conceptId]: concepts row }
 * @returns {object[]} pattern objects with { kind, severity, description, conceptIds, topics, errorType? }
 */
export function detectTransversalPatterns(stateByConceptId, conceptById) {
  const patterns = [];

  // --- 1. Error type patterns spanning multiple topics ---
  const byError = {};
  for (const [conceptId, state] of Object.entries(stateByConceptId)) {
    if ((state.attempts_total ?? 0) < MIN_ATTEMPTS) continue;
    const dominant = getDominantError(state);
    if (!dominant) continue;
    if (!byError[dominant]) byError[dominant] = [];
    byError[dominant].push({ conceptId, concept: conceptById[conceptId], state });
  }

  for (const [errorType, items] of Object.entries(byError)) {
    const topics = [...new Set(items.map((i) => i.concept?.topic).filter(Boolean))];
    if (topics.length < MIN_TOPICS) continue;

    const totalErrors = items.reduce(
      (sum, i) => sum + (i.state[`err_${errorType}`] ?? 0), 0
    );

    patterns.push({
      kind:       "transversal_error_pattern",
      errorType,
      topics,
      conceptIds: items.map((i) => i.conceptId),
      severity:   Math.min(1, totalErrors / (items.length * 5)), // normalised 0–1
      description: `${errorType} errors detected across ${topics.length} topics (${topics.slice(0, 3).join(", ")}${topics.length > 3 ? " and more" : ""})`,
    });
  }

  // --- 2. Prerequisite risk: concept is weak AND its prerequisite is also weak ---
  for (const [conceptId, state] of Object.entries(stateByConceptId)) {
    if ((state.mastery ?? 0) >= 0.5) continue;
    if ((state.attempts_total ?? 0) < MIN_ATTEMPTS) continue;

    const concept   = conceptById[conceptId];
    if (!concept) continue;

    // conceptById may include concept.prerequisites as an array of IDs if the caller joined them
    const prereqIds = Array.isArray(concept.prerequisites) ? concept.prerequisites : [];
    const weakPrereqs = prereqIds.filter(
      (pid) => (stateByConceptId[pid]?.mastery ?? 0) < 0.6
    );

    if (weakPrereqs.length === 0) continue;

    patterns.push({
      kind:        "prerequisite_risk",
      conceptId,
      weakPrereqs,
      severity:    1 - (state.mastery ?? 0),
      description: `Weak mastery on "${concept.name}" may be caused by ${weakPrereqs.length} unmastered prerequisite(s). Study those first.`,
    });
  }

  // --- 3. Consistent careless errors (across many concepts) ---
  const carelessConcepts = Object.entries(stateByConceptId).filter(
    ([, s]) => (s.err_careless ?? 0) >= 2 && (s.attempts_total ?? 0) >= MIN_ATTEMPTS
  );
  if (carelessConcepts.length >= 4) {
    patterns.push({
      kind:       "careless_pattern",
      conceptIds: carelessConcepts.map(([id]) => id),
      severity:   Math.min(1, carelessConcepts.length / 10),
      description: `Careless errors detected across ${carelessConcepts.length} concepts — focus on checking work before submitting.`,
    });
  }

  return patterns.sort((a, b) => b.severity - a.severity);
}
