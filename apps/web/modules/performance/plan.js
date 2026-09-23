/**
 * Study plan: goals with a target date (an exam, a deadline) and the resources that count towards
 * them. Stored as workspace documents tagged `study-goal`, so they live with the subject.
 */

export const GOAL_TAG = "study-goal";

export function parseGoal(document) {
  if (!document || !(document.tags || []).includes(GOAL_TAG)) return null;
  try {
    const parsed = JSON.parse(String(document.content || "{}"));
    return parsed?.kind === "study-goal" ? { ...parsed, documentId: document.id } : null;
  } catch {
    return null;
  }
}

export function buildGoal({ title, date, learner = "", resourceIds = [], targetScore = 0.8, note = "" }) {
  return { kind: "study-goal", version: 1, title, date, learner, resourceIds, targetScore, note, createdAt: new Date().toISOString() };
}

export function daysUntil(date) {
  if (!date) return null;
  const diff = new Date(`${date}T00:00:00`).getTime() - new Date(new Date().toISOString().slice(0, 10) + "T00:00:00").getTime();
  return Math.round(diff / 86400000);
}

/**
 * Progress of a goal: how many of its resources were done, the average score on them and what is
 * still pending — the answer to "am I on track for this exam?".
 */
export function goalProgress(goal, attempts = [], resources = []) {
  const ids = goal.resourceIds || [];
  const mine = attempts.filter((attempt) => ids.includes(attempt.resourceId) && (!goal.learner || attempt.learner === goal.learner));
  const doneIds = new Set(mine.map((attempt) => attempt.resourceId));
  const scores = ids.map((id) => {
    const forId = mine.filter((attempt) => attempt.resourceId === id && attempt.total > 0);
    return forId.length ? Math.max(...forId.map((attempt) => attempt.score / attempt.total)) : null;
  });
  const scored = scores.filter((score) => score !== null);
  const average = scored.length ? scored.reduce((sum, score) => sum + score, 0) / scored.length : 0;
  const pending = ids.filter((id) => !doneIds.has(id)).map((id) => resources.find((row) => row.document.id === id)).filter(Boolean);
  const mastered = scores.filter((score) => score !== null && score >= (goal.targetScore || 0.8)).length;
  return { total: ids.length, done: doneIds.size, average, mastered, pending, onTrack: ids.length ? mastered / ids.length : 0, days: daysUntil(goal.date) };
}
