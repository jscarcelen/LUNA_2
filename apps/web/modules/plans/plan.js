/**
 * Study plans.
 *
 * A plan is how work is spread over time: what has to be achieved, by when, with which material
 * and which activities. Plans nest — "Maths final in June" is made of "Equations" and
 * "Integration" — and a plan can carry several deadlines (a mock, the real exam, a hand-in), so a
 * term's work is one tree rather than a pile of unrelated lists. Goals are expressed as concepts
 * and linked to the resources that teach them, which is what lets progress mean something.
 *
 * Plans are workspace documents tagged `study-plan`, filed in a folder like everything else.
 */

export const PLAN_TAG = "study-plan";

export const PLAN_COLOURS = ["#0071e3", "#2f9e5b", "#b25e00", "#8e44ad", "#d7003a", "#0aa2c0"];

export const ITEM_KINDS = [
  { id: "activity", label: "Do the activity", icon: "✎" },
  { id: "read", label: "Read / study", icon: "📖" },
  { id: "review", label: "Review mistakes", icon: "↻" },
  { id: "exam", label: "Exam / test", icon: "★" }
];

export const DEADLINE_KINDS = [
  { id: "exam", label: "Exam" },
  { id: "mock", label: "Mock / practice exam" },
  { id: "hand_in", label: "Hand-in" },
  { id: "milestone", label: "Milestone" }
];

let counter = 0;
const id = (prefix) => `${prefix}_${Date.now().toString(36)}${(counter += 1).toString(36)}`;

export function parsePlan(document) {
  if (!document || !(document.tags || []).includes(PLAN_TAG)) return null;
  try {
    const parsed = JSON.parse(String(document.content || "{}"));
    if (parsed?.kind !== "study-plan") return null;
    // Plans written before deadlines and sub-plans existed still open.
    return {
      ...parsed,
      documentId: document.id,
      deadlines: Array.isArray(parsed.deadlines) ? parsed.deadlines : (parsed.examDate ? [newDeadline("Exam", parsed.examDate, "exam")] : []),
      goals: Array.isArray(parsed.goals) ? parsed.goals : [],
      items: Array.isArray(parsed.items) ? parsed.items : [],
      parentPlanId: parsed.parentPlanId || ""
    };
  } catch {
    return null;
  }
}

export function buildPlan({ name, examDate = "", deadlines = [], startDate = "", learner = "", colour = PLAN_COLOURS[0], note = "", goals = [], items = [], materialIds = [], parentPlanId = "" }) {
  return {
    kind: "study-plan",
    version: 2,
    name: String(name || "Study plan").trim(),
    deadlines: deadlines.length ? deadlines : (examDate ? [newDeadline("Exam", examDate, "exam")] : []),
    startDate: startDate || new Date().toISOString().slice(0, 10),
    learner,
    colour,
    note,
    parentPlanId,
    goals,
    items,
    materialIds,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export const newDeadline = (title, date, kind = "exam") => ({ id: id("dl"), title: String(title || "Deadline").trim(), date, kind });

/** A goal is what has to be achieved — optionally the concepts that make it up. */
export const newGoal = (title, targetScore = 0.8) => ({ id: id("goal"), title: String(title || "").trim(), targetScore, note: "", concepts: [], resourceIds: [], deadlineId: "" });

export const newItem = ({ resourceId = "", title, kind = "activity", dueDate = "", goalId = "", note = "", minutes = 30 }) => ({
  id: id("item"), resourceId, title: String(title || "").trim(), kind, dueDate, goalId, note, minutes, doneAt: ""
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

/** The plan's next deadline (or its last one when they have all passed). */
export function nextDeadline(plan) {
  const list = [...(plan.deadlines || [])].filter((deadline) => deadline.date).sort((a, b) => a.date.localeCompare(b.date));
  if (!list.length) return null;
  return list.find((deadline) => daysUntil(deadline.date) >= 0) || list[list.length - 1];
}

/** A plan with everything its sub-plans contain, so a parent can be read as one piece of work. */
export function withSubPlans(plan, allPlans = []) {
  const children = allPlans.filter((row) => row.plan.parentPlanId === plan.documentId);
  const items = [...(plan.items || []), ...children.flatMap((row) => withSubPlans(row.plan, allPlans).items)];
  const goals = [...(plan.goals || []), ...children.flatMap((row) => withSubPlans(row.plan, allPlans).goals)];
  const deadlines = [...(plan.deadlines || []), ...children.flatMap((row) => withSubPlans(row.plan, allPlans).deadlines)];
  return { ...plan, items, goals, deadlines, children };
}

/**
 * How a plan is going: an item counts as done when it was ticked off or when its resource has an
 * attempt, so doing the activity on Luna advances the plan by itself.
 */
export function planProgress(plan, attempts = []) {
  const items = plan.items || [];
  const attemptByResource = new Map();
  for (const attempt of attempts) {
    // An attempt with no resource cannot tick anything off — otherwise every unlinked step would
    // count as done the moment the learner did any activity at all.
    if (!attempt.resourceId) continue;
    if (plan.learner && attempt.learner && attempt.learner !== plan.learner) continue;
    const best = attemptByResource.get(attempt.resourceId);
    const score = attempt.total ? attempt.score / attempt.total : 0;
    if (best === undefined || score > best) attemptByResource.set(attempt.resourceId, score);
  }
  const isDone = (item) => Boolean(item.doneAt) || Boolean(item.resourceId && attemptByResource.has(item.resourceId));
  const done = items.filter(isDone);
  const scores = items.map((item) => attemptByResource.get(item.resourceId)).filter((score) => score !== undefined);
  const average = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
  const late = items.filter((item) => !isDone(item) && daysUntil(item.dueDate) !== null && daysUntil(item.dueDate) < 0);
  const next = items.filter((item) => !isDone(item)).sort((a, b) => String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999")));
  const goals = (plan.goals || []).map((goal) => {
    const goalItems = items.filter((item) => item.goalId === goal.id || (goal.resourceIds || []).includes(item.resourceId));
    const goalScores = goalItems.map((item) => attemptByResource.get(item.resourceId)).filter((score) => score !== undefined);
    const reached = goalScores.filter((score) => score >= (goal.targetScore || 0.8)).length;
    return {
      ...goal,
      total: goalItems.length,
      done: goalItems.filter(isDone).length,
      average: goalScores.length ? goalScores.reduce((sum, score) => sum + score, 0) / goalScores.length : 0,
      reached,
      met: goalItems.length > 0 && reached === goalItems.length
    };
  });
  const deadline = nextDeadline(plan);
  return {
    total: items.length,
    done: done.length,
    ratio: items.length ? done.length / items.length : 0,
    average,
    late,
    next,
    goals,
    deadline,
    days: deadline ? daysUntil(deadline.date) : null,
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

export function weekStart(date) {
  const value = new Date(`${date}T00:00:00`);
  const day = (value.getDay() + 6) % 7; // Monday = 0
  value.setDate(value.getDate() - day);
  return value.toISOString().slice(0, 10);
}

export function addDays(date, days) {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

/**
 * Every plan's work on one calendar: what is due each day, from which plan, and how many minutes
 * it adds up to — the view that shows when two plans collide.
 */
export function calendarDays(rows = [], { from, days = 42, attempts = [] } = {}) {
  const start = from || weekStart(new Date().toISOString().slice(0, 10));
  const byDate = new Map();
  for (const { document, plan } of rows) {
    const progress = planProgress(plan, attempts);
    for (const item of plan.items || []) {
      if (!item.dueDate) continue;
      const entry = byDate.get(item.dueDate) || [];
      entry.push({
        ...item,
        planId: document.id,
        planName: plan.name,
        colour: plan.colour,
        done: Boolean(item.doneAt) || Boolean(item.resourceId && progress.scoreByResource.has(item.resourceId))
      });
      byDate.set(item.dueDate, entry);
    }
    for (const deadline of plan.deadlines || []) {
      if (!deadline.date) continue;
      const entry = byDate.get(deadline.date) || [];
      entry.push({ id: deadline.id, title: deadline.title, kind: "deadline", deadlineKind: deadline.kind, planId: document.id, planName: plan.name, colour: plan.colour, minutes: 0, done: false });
      byDate.set(deadline.date, entry);
    }
  }
  return Array.from({ length: days }, (_, index) => {
    const date = addDays(start, index);
    const entries = byDate.get(date) || [];
    return { date, entries, minutes: entries.reduce((sum, entry) => sum + (entry.kind === "deadline" ? 0 : Number(entry.minutes) || 30), 0) };
  });
}

/** What needs doing now, across every plan: late first, then today, then the next few days. */
export function upcoming(rows = [], attempts = [], withinDays = 7) {
  const out = [];
  for (const { document, plan } of rows) {
    const progress = planProgress(plan, attempts);
    for (const item of progress.next) {
      const days = daysUntil(item.dueDate);
      if (days === null || days > withinDays) continue;
      out.push({ ...item, planId: document.id, planName: plan.name, colour: plan.colour, days });
    }
    for (const deadline of plan.deadlines || []) {
      const days = daysUntil(deadline.date);
      if (days === null || days < 0 || days > withinDays) continue;
      out.push({ id: deadline.id, title: deadline.title, kind: "deadline", planId: document.id, planName: plan.name, colour: plan.colour, days, dueDate: deadline.date });
    }
  }
  return out.sort((a, b) => a.days - b.days);
}
