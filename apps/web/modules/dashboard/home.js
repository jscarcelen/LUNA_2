import { daysUntil, parsePlan, planProgress, withSubPlans } from "../plans/plan";
import { forPlan, joinAttempts, repeatedMistakes } from "../performance/metrics";
import { buildEvidence, topicMastery } from "../performance/mastery";
import { analyseErrors } from "../performance/errors";
import { targetsFor } from "../performance/targets";
import { parseResource } from "../resources/resource";

/** The Home gallery is one row of at most this many plan cards. */
export const HOME_PLAN_LIMIT = 4;

const TITLES = /^(prof|professor|dr|mr|mrs|ms|miss|mx|sr|sra|mtro|mtra)\.?$/i;

/** "Maria G." → "Maria"; "Prof. Rivera" → "Rivera"; nothing usable → "". */
export function firstName(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  const word = words.find((entry) => !TITLES.test(entry)) || "";
  return word.replace(/[.,;:]+$/, "");
}

/** "Hi Maria" — or just "Hi" when there is no name yet. */
export function greeting(name) {
  const first = firstName(name);
  return first ? `Hi ${first}` : "Hi";
}

/** Every study plan of a workspace, whatever subject it lives in, tagged with where it came from. */
export function planRowsOf(workspace) {
  const rows = [];
  for (const subject of workspace?.subjects || []) {
    for (const document of subject.documents || []) {
      const plan = parsePlan(document);
      if (plan) rows.push({ document, plan, subjectId: subject.id, subjectName: subject.name, workspaceId: workspace.id });
    }
  }
  return rows;
}

/** Every document of a workspace (all subjects), for joining attempts to the resources they were made on. */
export function documentsOf(workspace) {
  return (workspace?.subjects || []).flatMap((subject) => subject.documents || []);
}

/**
 * The plans that need attention first. Root plans only (a sub-plan lives inside its parent's card,
 * which rolls its steps and deadlines in), most urgent first:
 *   1. plans with work left and a deadline still ahead, the closest deadline first (more late steps break a tie);
 *   2. plans with work left whose deadline has passed (the most recent first), then those with no deadline at all;
 *   3. plans that are finished.
 * Returns `{ document, plan, children, progress, days, subjectId, subjectName, workspaceId }` for each.
 */
export function rankPlans(rows = [], attempts = [], { limit = HOME_PLAN_LIMIT } = {}) {
  const ids = new Set(rows.map((row) => row.document.id));
  const roots = rows.filter((row) => !row.plan.parentPlanId || !ids.has(row.plan.parentPlanId));
  const entries = roots.map((row) => {
    const children = rows.filter((other) => other.plan.parentPlanId === row.document.id);
    const progress = planProgress(children.length ? withSubPlans(row.plan, rows) : row.plan, attempts);
    const days = progress.deadline ? daysUntil(progress.deadline.date) : null;
    const finished = progress.total > 0 && progress.done >= progress.total;
    let group = 1;
    if (finished) group = 2;
    else if (days !== null && days >= 0) group = 0;
    return { ...row, children, progress, days, group };
  });
  entries.sort((a, b) => {
    if (a.group !== b.group) return a.group - b.group;
    if (a.group === 0 || a.group === 2) {
      const left = (a.days ?? 99999) - (b.days ?? 99999);
      if (left) return left;
    } else {
      // Deadline passed (most recently) before no deadline at all.
      const aDays = a.days === null ? -99999 : a.days;
      const bDays = b.days === null ? -99999 : b.days;
      if (aDays !== bDays) return bDays - aDays;
    }
    if (a.progress.late.length !== b.progress.late.length) return b.progress.late.length - a.progress.late.length;
    return String(a.plan.name).localeCompare(String(b.plan.name));
  });
  return entries.slice(0, Math.max(0, limit)).map(({ group: _group, ...entry }) => entry);
}

/**
 * What the coach reads for the Home: the evidence from the given (most urgent) plans only — the
 * mastery per topic, the kinds of mistake, the questions that keep going wrong — and one summary of
 * where those plans stand, with their next steps merged soonest first.
 */
export function coachInputFor(entries = [], documents = [], allRows = []) {
  const attempts = joinAttempts(documents);
  const resourceByDocumentId = new Map();
  for (const document of documents) {
    const resource = parseResource(document);
    if (resource) resourceByDocumentId.set(document.id, resource);
  }
  const conceptsOfResource = (attempt) => (resourceByDocumentId.get(attempt.resourceId)?.concepts || []).map((concept) => concept.name);
  // A parent's step list already includes its sub-plans, so evidence for the card is evidence for the whole.
  const aggregated = entries.map((entry) => (entry.children?.length ? withSubPlans(entry.plan, allRows) : entry.plan));
  const seen = new Set();
  const scoped = [];
  for (const plan of aggregated) {
    for (const attempt of forPlan(attempts, plan)) {
      const key = `${attempt.activityDocumentId || ""}|${attempt.at}|${attempt.resourceId}|${attempt.learner || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      scoped.push(attempt);
    }
  }
  const targets = targetsFor("plan", { plans: allRows.length ? allRows : entries, conceptsOfResource });
  const evidence = buildEvidence(scoped, { subjectOf: targets.subjectOf, conceptsOf: targets.conceptsOf });
  const topics = topicMastery(evidence);
  const errors = analyseErrors(evidence);

  const several = entries.length > 1;
  const progresses = aggregated.map((plan) => planProgress(plan, attempts));
  const upcomingSteps = progresses
    .flatMap((progress, index) => progress.next.map((item) => ({ title: several ? `${entries[index].plan.name}: ${item.title}` : item.title, dueDate: item.dueDate || "", kind: item.kind })))
    .sort((a, b) => String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999")))
    .slice(0, 6);
  const deadlines = progresses.map((progress) => progress.deadline?.date).filter(Boolean).sort();
  const nextDeadline = deadlines.find((date) => daysUntil(date) >= 0) || deadlines[0] || "";
  const plan = entries.length ? {
    name: entries.map((entry) => entry.plan.name).join(" · "),
    deadline: nextDeadline,
    done: progresses.reduce((sum, progress) => sum + progress.done, 0),
    total: progresses.reduce((sum, progress) => sum + progress.total, 0),
    late: progresses.reduce((sum, progress) => sum + progress.late.length, 0),
    upcoming: upcomingSteps
  } : null;
  return { topics, errorTypes: errors.types, stuck: repeatedMistakes(scoped), plan, attemptCount: scoped.length };
}

/**
 * Next steps without the model: the steps of the urgent plans that are due soonest (late ones first).
 * Shown while there are no results to read yet, so Home never has an empty "what next".
 */
export function nextSteps(entries = [], limit = 5) {
  return entries
    .flatMap((entry) => entry.progress.next.map((item) => ({
      id: `${entry.document.id}:${item.id}`,
      title: item.title,
      kind: item.kind,
      dueDate: item.dueDate || "",
      days: item.dueDate ? daysUntil(item.dueDate) : null,
      planId: entry.document.id,
      planName: entry.plan.name,
      colour: entry.plan.colour,
      subjectId: entry.subjectId
    })))
    .sort((a, b) => {
      const left = a.days === null ? 99999 : a.days;
      const right = b.days === null ? 99999 : b.days;
      return left - right;
    })
    .slice(0, limit);
}
