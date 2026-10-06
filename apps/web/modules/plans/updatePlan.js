/**
 * Updating a study plan with words: "lighter workload in the last two weeks", "add a mock exam two days
 * before the deadline", "I can only study 1 hour a week now".
 *
 * The planner model proposes the steps still to do; THIS file decides what is allowed to change. The rules
 * are kept here, in plain functions, so they hold whatever the model answers:
 *  - a step that is DONE is never touched (nor is the resource a built step points at);
 *  - a step with a built resource can be moved or retitled, never removed;
 *  - a deadline that someone else set (`deadline.setBy`, e.g. a teacher) is never changed or dropped;
 *  - new steps only ask for the agents in the plan's scope;
 *  - every date stays between today and the plan's last deadline;
 *  - what the model leaves out is kept, not dropped: removing a step has to be said.
 * The last five versions of the plan are kept in `plan.history` so an update can be undone.
 *
 * Pure functions: the model call lives in /api/plans/update.
 */
import { newGoal, newItem } from "./plan.js";
import { generateKeys, generateLabel } from "./agents.js";
import { coverageOf, conceptNames } from "./coverage.js";
import { minutesPerWeek as currentMinutesPerWeek, plannedKinds, reviseWindow, spreadDates } from "./revise.js";

export const MAX_PLAN_HISTORY = 5;
export const CHANGE_KINDS = ["kept", "moved", "added", "removed", "edited"];
export const STEP_KINDS = ["activity", "read", "review", "exam"];
export const PLAN_UPDATE_SUGGESTIONS = [
  "Lighter workload in the last two weeks",
  "Add a mock exam two days before the deadline",
  "Focus on the weakest topics",
  "I can only study 1 hour a week now",
  "Move everything one week earlier",
  "Add flashcards for the key terms"
];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const todayIso = () => new Date().toISOString().slice(0, 10);
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const sameList = (a = [], b = []) => JSON.stringify([...a].map(clean).sort()) === JSON.stringify([...b].map(clean).sort());

/** A deadline someone else set (a teacher's assignment, say): it is theirs to change. */
export const isImposedDeadline = (deadline) => Boolean(deadline && deadline.setBy);

/** The deadline the learner may move from the "new deadline" field: the next one that is their own. */
export function editableDeadline(plan, today = todayIso()) {
  const own = (plan.deadlines || []).filter((deadline) => DATE.test(deadline.date || "") && !isImposedDeadline(deadline)).sort((a, b) => a.date.localeCompare(b.date));
  return own.find((deadline) => deadline.date >= today) || own[own.length - 1] || null;
}

/** Which `generate` keys a plan's new steps may use: its agent scope, else what it already generates. */
export const allowedGenerateKeys = (plan) => (Array.isArray(plan.agentScope) ? generateKeys(plan.agentScope) : plannedKinds(plan));

/**
 * Deadlines after the request. The learner's own fields and the model's `deadlineChanges` may move a
 * deadline that nobody imposed; imposed ones come back exactly as they were. Returns the new list and
 * what moved.
 */
export function applyDeadlineChanges(plan, requested = [], { today = todayIso() } = {}) {
  const moves = [];
  const wanted = new Map();
  for (const change of requested) {
    if (change?.id && DATE.test(clean(change.date)) && clean(change.date) >= today) wanted.set(change.id, clean(change.date));
  }
  const deadlines = (plan.deadlines || []).map((deadline) => {
    const date = wanted.get(deadline.id);
    if (!date || isImposedDeadline(deadline) || date === deadline.date) return deadline;
    moves.push({ id: deadline.id, title: deadline.title, from: deadline.date || "", to: date });
    return { ...deadline, date };
  });
  return { deadlines, moves };
}

/** The window the work has to fit in, from the deadlines as they will be. */
export const updateWindow = (plan, deadlines, today = todayIso()) => reviseWindow({ ...plan, deadlines }, today);

/** Minutes a week the plan currently asks for (rounded to half hours), unless the learner said otherwise before. */
export function currentPace(plan, today = todayIso()) {
  if (Number(plan.minutesPerWeek) > 0) return Number(plan.minutesPerWeek);
  return currentMinutesPerWeek(plan, reviseWindow(plan, today));
}

/* ------------------------------------------------------------------------------------ the request */

const describeStep = (item, done) => ({
  id: item.id,
  title: item.title,
  kind: item.kind,
  dueDate: item.dueDate || "",
  minutes: Number(item.minutes) || 30,
  generate: item.generate || "",
  built: Boolean(item.resourceId),
  done,
  concepts: item.concepts || [],
  goal: ""
});

/** What the model needs: the whole plan (done steps fixed), the request, the pace and the room there is. */
export function buildPlanUpdatePayload({ plan, instruction, doneIds, minutesPerWeek, deadlines = null, conceptMap = [], performance = null, window, today = todayIso() }) {
  const list = deadlines || plan.deadlines || [];
  const goals = plan.goals || [];
  const goalTitle = (id) => goals.find((goal) => goal.id === id)?.title || "";
  const scoped = Array.isArray(plan.agentScope);
  return {
    today,
    horizon: window.horizon,
    instruction: clean(instruction),
    minutesPerWeek: Number(minutesPerWeek) || currentPace(plan, today),
    deadlines: list.map((deadline) => ({ id: deadline.id, title: deadline.title, date: deadline.date || "", kind: deadline.kind || "", locked: isImposedDeadline(deadline) })),
    kinds: allowedGenerateKeys(plan),
    ...(scoped ? { agents: plan.agentScope } : {}),
    steps: (plan.items || []).map((item) => ({ ...describeStep(item, doneIds.has(item.id)), goal: goalTitle(item.goalId) })),
    goals: goals.map((goal) => ({ title: goal.title, concepts: goal.concepts || [] })),
    conceptMap: conceptMap.map((concept) => ({ name: concept.name, topic: concept.topic || "" })),
    performance
  };
}

/** The strict JSON schema the planner answers with; `generate` is limited to the keys the plan may use. */
export function planUpdateSchema(keys = []) {
  return {
    type: "object", additionalProperties: false,
    properties: {
      summary: { type: "string", description: "Two short sentences to the learner, in the language of the request: what changed and why. Name the steps." },
      steps: {
        type: "array",
        description: "Every step still to do, in date order: kept, moved, edited, added — and the ones to remove, marked removed. Never include done steps.",
        items: {
          type: "object", additionalProperties: false,
          properties: {
            id: { type: "string", description: "Id of the existing pending step this is. Empty for a new step." },
            change: { type: "string", enum: CHANGE_KINDS },
            title: { type: "string" },
            kind: { type: "string", enum: STEP_KINDS },
            dueDate: { type: "string", description: "YYYY-MM-DD, between today and the horizon" },
            minutes: { type: "integer", description: "Realistic working minutes, 15–90." },
            generate: { type: "string", enum: ["", ...new Set(keys)], description: "Non-empty only for a NEW step (or an unbuilt one) where Luna should generate the material." },
            sourceId: { type: "string", description: "Id of the uploaded material or generated resource a new step works on, or empty." },
            goal: { type: "string", description: "Title of the goal it serves, or empty." },
            concepts: { type: "array", items: { type: "string" } }
          },
          required: ["id", "change", "title", "kind", "dueDate", "minutes", "generate", "sourceId", "goal", "concepts"]
        }
      },
      deadlineChanges: {
        type: "array",
        description: "Only when the request moves a deadline that is not locked: its id and the new date. Empty otherwise.",
        items: { type: "object", additionalProperties: false, properties: { id: { type: "string" }, date: { type: "string" } }, required: ["id", "date"] }
      },
      newGoals: {
        type: "array",
        description: "0–2 goals only when the request introduces something no existing goal covers.",
        items: { type: "object", additionalProperties: false, properties: { title: { type: "string" }, concepts: { type: "array", items: { type: "string" } }, targetScore: { type: "number" } }, required: ["title", "concepts", "targetScore"] }
      }
    },
    required: ["summary", "steps", "deadlineChanges", "newGoals"]
  };
}

/* ------------------------------------------------------------------------------------ merging */

const clampDate = (value, from, to) => {
  const date = clean(value);
  if (!DATE.test(date)) return "";
  return date < from ? from : date > to ? to : date;
};
const clampMinutes = (value, fallback) => {
  const minutes = Math.round(Number(value) || 0);
  return minutes ? Math.min(120, Math.max(10, minutes)) : fallback || 30;
};

const sameContent = (a, b) => clean(a.title) === clean(b.title) && a.kind === b.kind && (Number(a.minutes) || 30) === (Number(b.minutes) || 30) && sameList(a.concepts || [], b.concepts || []) && (a.generate || "") === (b.generate || "");

/**
 * The plan after the update, with every change classified against the plan as it was.
 *
 * `update` is what the model answered ({ summary, steps, deadlineChanges, newGoals }); `ctx`:
 *  { doneIds: Set, today, generatedIds?: Set (generated resources a new step may point at), deadlineEdit?: [{ id, date }] (the learner's own fields),
 *    conceptMap?: [{ name }], minutesPerWeek?: number (the pace the learner chose), instruction }
 * Returns { plan, changes: [{ change, item, before }], counts, deadlineMoves, summary, changed, coverage }.
 */
export function applyPlanUpdate(plan, update, { doneIds = new Set(), today = todayIso(), generatedIds = new Set(), deadlineEdit = [], conceptMap = [], minutesPerWeek = 0, now = new Date().toISOString(), instruction = "" } = {}) {
  const items = plan.items || [];
  const done = items.filter((item) => doneIds.has(item.id));
  const pendingById = new Map(items.filter((item) => !doneIds.has(item.id)).map((item) => [item.id, item]));
  const allowed = new Set(allowedGenerateKeys(plan));
  const scoped = Array.isArray(plan.agentScope);

  // Deadlines first: the window the steps must fit in depends on them.
  const { deadlines, moves: deadlineMoves } = applyDeadlineChanges(plan, [...(deadlineEdit || []), ...((update.deadlineChanges || []))], { today });
  const window = updateWindow(plan, deadlines, today);

  const goals = [...(plan.goals || [])];
  for (const proposed of update.newGoals || []) {
    const title = clean(proposed?.title);
    if (title && !goals.some((goal) => goal.title.toLowerCase() === title.toLowerCase())) goals.push({ ...newGoal(title, proposed.targetScore || 0.8), concepts: proposed.concepts || [] });
  }
  const goalId = (title) => goals.find((goal) => goal.title.toLowerCase() === clean(title).toLowerCase())?.id || "";
  const allowedGenerate = (key) => (key && (allowed.has(key) || (!scoped && key === "summary")) ? key : "");

  const used = new Set();
  const removedIds = new Set();
  const next = [];
  for (const proposed of update.steps || []) {
    const existing = proposed.id ? pendingById.get(proposed.id) : null;
    // A finished step is fixed, whatever the model says about it.
    if (proposed.id && doneIds.has(proposed.id)) continue;
    if (existing) {
      if (used.has(existing.id) || removedIds.has(existing.id)) continue;
      if (proposed.change === "removed") {
        // A step that has its material already is not thrown away: the resource would be orphaned.
        if (existing.resourceId) { used.add(existing.id); next.push({ ...existing, dueDate: clampDate(existing.dueDate, window.today, window.horizon) }); } else removedIds.add(existing.id);
        continue;
      }
      used.add(existing.id);
      const built = Boolean(existing.resourceId);
      next.push({
        ...existing,
        title: clean(proposed.title) || existing.title,
        kind: STEP_KINDS.includes(proposed.kind) && !built ? proposed.kind : existing.kind,
        dueDate: clampDate(proposed.dueDate, window.today, window.horizon) || clampDate(existing.dueDate, window.today, window.horizon),
        minutes: clampMinutes(proposed.minutes, existing.minutes),
        concepts: proposed.concepts?.length ? proposed.concepts : existing.concepts,
        generate: built ? "" : (allowedGenerate(proposed.generate) || (existing.generate && (allowed.has(existing.generate) || !scoped) ? existing.generate : "")),
        goalId: existing.goalId || goalId(proposed.goal)
      });
      continue;
    }
    // A new step. Without a title there is nothing to add.
    if (proposed.change === "removed" || !clean(proposed.title)) continue;
    const generate = allowedGenerate(proposed.generate);
    const isResource = !generate && proposed.sourceId && generatedIds.has(proposed.sourceId);
    next.push({
      ...newItem({ resourceId: isResource ? proposed.sourceId : "", title: proposed.title, kind: STEP_KINDS.includes(proposed.kind) ? proposed.kind : "activity", dueDate: clampDate(proposed.dueDate, window.today, window.horizon), goalId: goalId(proposed.goal), minutes: clampMinutes(proposed.minutes, 30) }),
      generate,
      sourceDocumentId: !isResource ? clean(proposed.sourceId) : "",
      concepts: proposed.concepts || [],
      note: generate ? `Luna will generate ${generateLabel(generate, plan.agentScope)} for this step.` : ""
    });
  }
  // What the model did not mention stays as it is (a removal has to be said), kept inside the window.
  for (const item of pendingById.values()) {
    if (used.has(item.id) || removedIds.has(item.id)) continue;
    next.push({ ...item, dueDate: clampDate(item.dueDate, window.today, window.horizon) });
  }
  // A step without a date is spread over the time that is left.
  const undated = next.filter((item) => !item.dueDate);
  if (undated.length) {
    const dates = spreadDates(undated.length, window.today, window.horizon);
    undated.forEach((item, index) => { item.dueDate = dates[index]; });
  }
  next.sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));

  // Classify every change against the plan as it was.
  const changes = [];
  for (const item of done) changes.push({ change: "kept", item, before: item, done: true });
  for (const item of next) {
    const before = pendingById.get(item.id);
    if (!before) { changes.push({ change: "added", item, before: null }); continue; }
    const change = !sameContent(before, item) ? "edited" : (before.dueDate || "") !== (item.dueDate || "") ? "moved" : "kept";
    changes.push({ change, item, before });
  }
  for (const id of removedIds) changes.push({ change: "removed", item: null, before: pendingById.get(id) });

  const counts = { done: done.length, kept: 0, moved: 0, added: 0, removed: 0, edited: 0 };
  for (const entry of changes) if (!entry.done) counts[entry.change] += 1;
  const changed = counts.moved + counts.added + counts.removed + counts.edited + deadlineMoves.length > 0;

  const names = conceptNames(conceptMap);
  const finalItems = [...done, ...next];
  const coverage = names.length ? (() => { const after = coverageOf(finalItems, names); const before = coverageOf(items, names); return { total: names.length, untested: after.missingTest.length, untestedBefore: before.missingTest.length }; })() : null;

  const nextPlan = {
    ...plan,
    deadlines,
    goals,
    items: finalItems,
    ...(Number(minutesPerWeek) > 0 ? { minutesPerWeek: Number(minutesPerWeek) } : {}),
    updatedAt: now
  };
  return {
    plan: changed ? { ...nextPlan, history: pushPlanVersion(plan, { instruction, summary: clean(update.summary), at: now }) } : nextPlan,
    changes,
    counts,
    deadlineMoves,
    summary: clean(update.summary) || describeCounts(counts, deadlineMoves),
    changed,
    coverage,
    window
  };
}

/** "Moved 3 steps, added 2 and removed 1." — when the model gave no summary of its own. */
export function describeCounts(counts, deadlineMoves = []) {
  const part = (n, verb, noun = "step") => (n ? `${verb} ${n} ${noun}${n === 1 ? "" : "s"}` : "");
  const parts = [part(counts.moved, "moved"), part(counts.edited, "changed"), part(counts.added, "added"), part(counts.removed, "removed"), deadlineMoves.length ? `moved ${deadlineMoves.length} deadline${deadlineMoves.length === 1 ? "" : "s"}` : ""].filter(Boolean);
  if (!parts.length) return "Nothing needed to change.";
  const text = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

/** The changes worth showing, grouped, newest-meaning first: added, removed, moved, edited. Kept steps are only counted. */
export function groupChanges(changes = []) {
  const by = (kind) => changes.filter((entry) => !entry.done && entry.change === kind);
  return { added: by("added"), removed: by("removed"), moved: by("moved"), edited: by("edited"), kept: by("kept").length };
}

/* ------------------------------------------------------------------------------------ history */

let versionCounter = 0;
const versionId = () => `pv_${Date.now().toString(36)}${(versionCounter += 1).toString(36)}`;

/** The plan as it was before an update; the newest MAX_PLAN_HISTORY, newest first. */
export function pushPlanVersion(plan, { instruction = "", summary = "", at = new Date().toISOString() } = {}) {
  const entry = {
    id: versionId(),
    at,
    instruction: clean(instruction),
    summary: clean(summary),
    items: (plan.items || []).map((item) => ({ ...item })),
    deadlines: (plan.deadlines || []).map((deadline) => ({ ...deadline })),
    goals: (plan.goals || []).map((goal) => ({ ...goal })),
    note: plan.note || "",
    ...(plan.minutesPerWeek ? { minutesPerWeek: plan.minutesPerWeek } : {})
  };
  return [entry, ...(Array.isArray(plan.history) ? plan.history : [])].slice(0, MAX_PLAN_HISTORY);
}

/**
 * Go back to an earlier version of the plan. What has happened since is not lost: finished steps stay
 * finished, steps that were built keep their material, a deadline someone set stays; and the version being
 * left becomes a version too, so restoring can be undone.
 */
export function restorePlanVersion(plan, id, { at = new Date().toISOString() } = {}) {
  const history = Array.isArray(plan.history) ? plan.history : [];
  const target = history.find((entry) => entry.id === id);
  if (!target) return plan;
  const now = new Map((plan.items || []).map((item) => [item.id, item]));
  const restored = target.items.map((item) => {
    const current = now.get(item.id);
    if (!current) return { ...item };
    return {
      ...item,
      doneAt: current.doneAt || item.doneAt || "",
      ...(current.resourceId ? { resourceId: current.resourceId, generate: "", note: current.note || item.note } : {}),
      ...(current.summaryDocumentId ? { summaryDocumentId: current.summaryDocumentId } : {})
    };
  });
  const known = new Set(restored.map((item) => item.id));
  const finishedSince = (plan.items || []).filter((item) => item.doneAt && !known.has(item.id));
  const imposed = (plan.deadlines || []).filter(isImposedDeadline);
  const deadlines = [...imposed, ...target.deadlines.filter((deadline) => !isImposedDeadline(deadline) && !imposed.some((entry) => entry.id === deadline.id))];
  const goalIds = new Set(target.goals.map((goal) => goal.id));
  const goals = [...target.goals, ...(plan.goals || []).filter((goal) => !goalIds.has(goal.id))];
  const left = pushPlanVersion(plan, { instruction: `Restored the version of ${new Date(target.at).toLocaleDateString()}`, summary: "", at })[0];
  return {
    ...plan,
    items: [...restored, ...finishedSince],
    deadlines,
    goals,
    note: target.note,
    ...(target.minutesPerWeek ? { minutesPerWeek: target.minutesPerWeek } : {}),
    history: [left, ...history.filter((entry) => entry.id !== id)].slice(0, MAX_PLAN_HISTORY),
    updatedAt: at
  };
}

/** Steps the update added that Luna should now build (they promise material and have none yet). */
export const stepsToBuild = (plan, changes = []) => changes.filter((entry) => entry.change === "added" && entry.item?.generate && !entry.item.resourceId).map((entry) => plan.items.find((item) => item.id === entry.item.id) || entry.item);

