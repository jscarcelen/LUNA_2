/**
 * replanDetector — detects when a study plan needs to be revised.
 *
 * Pure function — no DB access.
 */

/**
 * Compare the current student mastery to the snapshot taken at plan generation time.
 * Returns whether a re-plan is warranted and why.
 *
 * @param {object} plan - study_plans row with { mastery_snapshot, exam_date, items[] }
 * @param {object} currentConceptStates - { [conceptId]: student_concept_state row }
 * @returns {{ shouldReplan: boolean, reasons: object[] }}
 */
export function shouldReplan(plan, currentConceptStates) {
  const snapshot = plan.mastery_snapshot ?? {};
  const reasons  = [];

  for (const [conceptId, snapshotMastery] of Object.entries(snapshot)) {
    const current = currentConceptStates[conceptId]?.mastery ?? 0;
    const delta   = current - snapshotMastery;

    if (delta >= 0.25) {
      reasons.push({
        kind:      "mastered_faster",
        conceptId,
        delta,
        message:   `Mastery improved by ${Math.round(delta * 100)}% — plan can be accelerated.`,
      });
    }
    if (delta <= -0.15) {
      reasons.push({
        kind:      "falling_behind",
        conceptId,
        delta,
        message:   `Mastery dropped by ${Math.round(Math.abs(delta) * 100)}% — plan needs review.`,
      });
    }
  }

  // Check plan adherence: overdue pending items
  const items = Array.isArray(plan.items) ? plan.items : [];
  const overdue = items.filter(
    (i) => i.status === "pending" && i.due_date && new Date(i.due_date) < new Date()
  );
  if (overdue.length >= 3) {
    reasons.push({
      kind:         "plan_lag",
      overdueCount: overdue.length,
      message:      `${overdue.length} plan items are overdue — schedule needs adjustment.`,
    });
  }

  // Exam approaching with unmastered concepts
  const examDate   = plan.exam_date ? new Date(plan.exam_date) : null;
  const daysToExam = examDate ? (examDate - Date.now()) / 86400000 : 999;
  if (daysToExam <= 7 && daysToExam >= 0) {
    const unmasteredCount = Object.values(currentConceptStates)
      .filter((s) => (s?.mastery ?? 0) < 0.7).length;
    if (unmasteredCount >= 3) {
      reasons.push({
        kind:           "exam_risk",
        unmasteredCount,
        daysToExam:     Math.round(daysToExam),
        message:        `Exam in ${Math.round(daysToExam)} days with ${unmasteredCount} concepts below mastery — urgent replan needed.`,
      });
    }
  }

  return {
    shouldReplan: reasons.length > 0,
    reasons,
  };
}

/**
 * Summarise plan progress as a simple object for display and coach input.
 * @param {object[]} items - study_plan_items rows
 * @param {string|null} examDate
 * @returns {{ done, total, late, onTrack, daysToExam }}
 */
export function planProgress(items, examDate) {
  const total    = items.length;
  const done     = items.filter((i) => i.status === "done").length;
  const late     = items.filter(
    (i) => i.status === "pending" && i.due_date && new Date(i.due_date) < new Date()
  ).length;
  const daysToExam = examDate
    ? Math.max(0, Math.round((new Date(examDate) - Date.now()) / 86400000))
    : null;

  return { done, total, late, onTrack: late === 0, daysToExam };
}
