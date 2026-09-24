/**
 * Study plans.
 *
 * A plan is how a student (or the teacher/parent who sets it up) turns resources into a schedule:
 * what has to be achieved, by when, with which material and which activities. Several plans can
 * run at once — a maths exam, a reading habit, a summer catch-up — so each one is its own document
 * in the subject, tagged `study-plan`, and every item points at a resource that already exists.
 */

export const PLAN_TAG = "study-plan";

export const PLAN_COLOURS = ["#0071e3", "#2f9e5b", "#b25e00", "#8e44ad", "#d7003a", "#0aa2c0"];

export const ITEM_KINDS = [
  { id: "activity", label: "Do the activity", icon: "✎" },
  { id: "read", label: "Read / study", icon: "📖" },
  { id: "review", label: "Review mistakes", icon: "↻" },
  { id: "exam", label: "Exam / test", icon: "★" }
];

let counter = 0;
const id = (prefix) => `${prefix}_${Date.now().toString(36)}${(counter += 1).toString(36)}`;

export function parsePlan(document) {
  if (!document || !(document.tags || []).includes(PLAN_TAG)) return null;
  try {
    const parsed = JSON.parse(String(document.content || "{}"));
    return parsed?.kind === "study-plan" ? { ...parsed, documentId: document.id } : null;
  } catch {
    return null;
  }
}

export function buildPlan({ name, examDate = "", startDate = "", learner = "", colour = PLAN_COLOURS[0], note = "", goals = [], items = [], materialIds = [] }) {
  return {
    kind: "study-plan",
    version: 1,
    name: String(name || "Study plan").trim(),
    examDate,
    startDate: startDate || new Date().toISOString().slice(0, 10),
    learner,
    colour,
    note,
    goals,
    items,
    materialIds,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export const newGoal = (title, targetScore = 0.8) => ({ id: id("goal"), title: String(title || "").trim(), targetScore, note: "" });

export const newItem = ({ resourceId = "", title, kind = "activity", dueDate = "", goalId = "", note = "" }) => ({
  id: id("item"), resourceId, title: String(title || "").trim(), kind, dueDate, goalId, note, doneAt: ""
});

export function daysUntil(date) {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00`).getTime();
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00`).getTime();
  return Math.round((target - today) / 86400000);
}

export function dueLabel(date) {
  const days = daysUntil(date);
  if (days === null) return "No date";
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} late`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days <= 7) return `In ${days} days`;
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/**
 * How a plan is going: an item counts as done when it was ticked off or when its resource has an
 * attempt, so doing the activity on Luna advances the plan by itself.
 */
export function planProgress(plan, attempts = []) {
  const items = plan.items || [];
  const attemptByResource = new Map();
  for (const attempt of attempts) {
    if (plan.learner && attempt.learner && attempt.learner !== plan.learner) continue;
    const best = attemptByResource.get(attempt.resourceId);
    const score = attempt.total ? attempt.score / attempt.total : 0;
    if (!best || score > best) attemptByResource.set(attempt.resourceId, score);
  }
  const done = items.filter((item) => item.doneAt || attemptByResource.has(item.resourceId));
  const scores = items.map((item) => attemptByResource.get(item.resourceId)).filter((score) => score !== undefined);
  const average = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
  const late = items.filter((item) => !item.doneAt && !attemptByResource.has(item.resourceId) && daysUntil(item.dueDate) !== null && daysUntil(item.dueDate) < 0);
  const next = items
    .filter((item) => !item.doneAt && !attemptByResource.has(item.resourceId))
    .sort((a, b) => String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999")));
  const goals = (plan.goals || []).map((goal) => {
    const goalItems = items.filter((item) => item.goalId === goal.id);
    const goalScores = goalItems.map((item) => attemptByResource.get(item.resourceId)).filter((score) => score !== undefined);
    const reached = goalScores.filter((score) => score >= (goal.targetScore || 0.8)).length;
    return {
      ...goal,
      total: goalItems.length,
      done: goalItems.filter((item) => item.doneAt || attemptByResource.has(item.resourceId)).length,
      average: goalScores.length ? goalScores.reduce((sum, score) => sum + score, 0) / goalScores.length : 0,
      reached,
      met: goalItems.length > 0 && reached === goalItems.length
    };
  });
  return {
    total: items.length,
    done: done.length,
    ratio: items.length ? done.length / items.length : 0,
    average,
    late,
    next,
    goals,
    days: daysUntil(plan.examDate),
    scoreByResource: attemptByResource
  };
}

/** Items grouped by the week they are due, oldest first — the plan seen as a calendar. */
export function planWeeks(plan) {
  const items = [...(plan.items || [])].sort((a, b) => String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999")));
  const weeks = new Map();
  for (const item of items) {
    const key = item.dueDate ? weekStart(item.dueDate) : "";
    if (!weeks.has(key)) weeks.set(key, []);
    weeks.get(key).push(item);
  }
  return [...weeks.entries()].map(([start, list]) => ({ start, items: list }));
}

function weekStart(date) {
  const value = new Date(`${date}T00:00:00`);
  const day = (value.getDay() + 6) % 7; // Monday = 0
  value.setDate(value.getDate() - day);
  return value.toISOString().slice(0, 10);
}
