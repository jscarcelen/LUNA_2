/**
 * Re-planning when material is added.
 *
 * A plan has two different kinds of thing in it, and they must not be mixed:
 *  - UPLOADED MATERIAL: documents the learner studies from. They feed the concept map and are the
 *    source Luna generates practice from (`plan.materialIds`).
 *  - GENERATED RESOURCES: quizzes, summaries, flashcards… made by agents. They are the work itself,
 *    scheduled as steps of the plan (`item.resourceId`).
 *
 * When either is added the schedule is redone from today: what is already done stays exactly as it
 * is, and everything still to do — the old pending steps and the new ones — is spread over the
 * time that is left, with the last stretch kept for review.
 *
 * Pure functions: the model call lives in /api/plans/revise, this file prepares what it needs and
 * turns its answer (or a local fallback) into the next plan.
 */
import { addDays, newGoal, newItem, planProgress } from "./plan.js";
import { generateKeys, generateLabel } from "./agents.js";
import { ensureCoverage } from "./coverage.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const todayIso = () => new Date().toISOString().slice(0, 10);

/** Generated = made by an agent (a parsed resource, or any saved agent output); everything else was uploaded. */
export function isGeneratedDocument(document, resourceIds = new Set()) {
  return resourceIds.has(document.id) || document.sourceType === "generated";
}

/** The workspace's documents split into the two kinds a plan distinguishes. */
export function splitDocuments(documents = [], resources = []) {
  const resourceIds = new Set(resources.map((row) => row.document.id));
  const uploaded = [];
  const generated = [];
  for (const document of documents) (isGeneratedDocument(document, resourceIds) ? generated : uploaded).push(document);
  return { uploaded, generated, resourceIds };
}

/** Ids of the steps already done — ticked off, or with an attempt on their resource. */
export function doneItemIds(plan, attempts = []) {
  const pending = new Set(planProgress(plan, attempts).next.map((item) => item.id));
  return new Set((plan.items || []).filter((item) => !pending.has(item.id)).map((item) => item.id));
}

/** The window the remaining work has to fit in: today to the plan's last deadline (or four weeks). */
export function reviseWindow(plan, today = todayIso()) {
  const dates = (plan.deadlines || []).map((deadline) => deadline.date).filter((date) => DATE.test(date || "") && date >= today).sort();
  const horizon = dates[dates.length - 1] || addDays(today, 28);
  return { today, horizon, days: Math.max(1, Math.round((new Date(`${horizon}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000)) };
}

/** How much the learner has been planning to work per week, read from the plan itself. */
export function minutesPerWeek(plan, window) {
  const total = (plan.items || []).reduce((sum, item) => sum + (Number(item.minutes) || 30), 0);
  const start = DATE.test(plan.startDate || "") ? plan.startDate : window.today;
  const weeks = Math.max(1, (new Date(`${window.horizon}T00:00:00`) - new Date(`${start}T00:00:00`)) / (7 * 86400000));
  const guess = total ? total / weeks : 120;
  return Math.min(360, Math.max(60, Math.round(guess / 30) * 30));
}

/** Which practice the plan has been generating, so new material gets the same treatment. */
export function plannedKinds(plan) {
  // The agent scope chosen when the plan was made wins; older plans fall back to what they already generate.
  if (Array.isArray(plan.agentScope)) return generateKeys(plan.agentScope);
  const kinds = [...new Set((plan.items || []).map((item) => item.generate).filter(Boolean))];
  return kinds.length ? kinds : ["quiz", "flashcards"];
}

const clampDate = (value, from, to) => {
  const date = String(value || "").trim();
  if (!DATE.test(date)) return "";
  return date < from ? from : date > to ? to : date;
};

/** `count` dates spread evenly from `from` to `to`, earliest first. */
export function spreadDates(count, from, to) {
  const span = Math.max(1, Math.round((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000));
  return Array.from({ length: count }, (_, index) => addDays(from, Math.min(span, Math.floor((index * (span + 1)) / Math.max(1, count)))));
}

/** What the model needs: the finished work (fixed), the pending steps (movable) and the new material. */
export function buildRevisePayload({ plan, doneIds, newUploaded = [], resourceNames = new Map(), conceptsFor = () => [], conceptMap = [], performance = null, window }) {
  const items = plan.items || [];
  const describe = (item) => ({ id: item.id, title: item.title, kind: item.kind, dueDate: item.dueDate || "", minutes: Number(item.minutes) || 30, generate: item.generate || "", built: Boolean(item.resourceId), concepts: item.concepts || [] });
  return {
    today: window.today,
    deadline: window.horizon,
    deadlines: (plan.deadlines || []).map((deadline) => ({ title: deadline.title, date: deadline.date, kind: deadline.kind })),
    minutesPerWeek: minutesPerWeek(plan, window),
    kinds: plannedKinds(plan),
    ...(Array.isArray(plan.agentScope) ? { agents: plan.agentScope } : {}),
    done: items.filter((item) => doneIds.has(item.id)).map(describe),
    pending: items.filter((item) => !doneIds.has(item.id)).map(describe),
    newUploaded: newUploaded.map((document) => ({ id: document.id, name: document.name, concepts: conceptsFor(document.id) })),
    goals: (plan.goals || []).map((goal) => ({ title: goal.title, concepts: goal.concepts || [] })),
    conceptMap: conceptMap.map((concept) => ({ name: concept.name, topic: concept.topic || "" })),
    performance,
    resourceNames: Object.fromEntries(resourceNames)
  };
}

/**
 * The next plan. `revision.items` is the new schedule of everything still to do; items it keeps by
 * `keepId` retain their built resource, the others are new steps. Dates are forced inside the
 * window, and any step without a usable date is spread over what is left.
 */
export function applyRevision(plan, revision, { doneIds, window, generatedIds = new Set(), conceptNames = [] }) {
  const items = plan.items || [];
  const done = items.filter((item) => doneIds.has(item.id));
  const pendingById = new Map(items.filter((item) => !doneIds.has(item.id)).map((item) => [item.id, item]));
  const goals = [...(plan.goals || [])];
  for (const proposed of revision.newGoals || []) {
    const title = String(proposed?.title || "").trim();
    if (title && !goals.some((goal) => goal.title.toLowerCase() === title.toLowerCase())) goals.push({ ...newGoal(title, proposed.targetScore || 0.8), concepts: proposed.concepts || [] });
  }
  const goalId = (title) => goals.find((goal) => goal.title.toLowerCase() === String(title || "").toLowerCase())?.id || "";

  const used = new Set();
  const next = [];
  let moved = 0;
  let added = 0;
  for (const proposed of revision.items || []) {
    const date = clampDate(proposed.dueDate, window.today, window.horizon);
    const kept = proposed.keepId ? pendingById.get(proposed.keepId) : null;
    if (kept && !used.has(kept.id)) {
      used.add(kept.id);
      // A step the model gave no usable date keeps its own if still ahead; one in the past moves to today.
      const dueDate = date || clampDate(kept.dueDate, window.today, window.horizon);
      if (dueDate && dueDate !== (kept.dueDate || "")) moved += 1;
      next.push({ ...kept, dueDate, minutes: Number(proposed.minutes) || kept.minutes || 30, concepts: proposed.concepts?.length ? proposed.concepts : kept.concepts, goalId: kept.goalId || goalId(proposed.goal) });
      continue;
    }
    const isResource = proposed.sourceId && generatedIds.has(proposed.sourceId) && !proposed.generate;
    added += 1;
    next.push({
      ...newItem({ resourceId: isResource ? proposed.sourceId : "", title: proposed.title, kind: proposed.kind || "activity", dueDate: date, goalId: goalId(proposed.goal), minutes: Number(proposed.minutes) || 30 }),
      generate: isResource ? "" : proposed.generate || "",
      sourceDocumentId: isResource ? "" : proposed.sourceId || "",
      concepts: proposed.concepts || [],
      note: proposed.generate ? `Luna will generate ${generateLabel(proposed.generate, plan.agentScope)} from the new material.` : ""
    });
  }

  // Pending steps the new schedule did not mention. A step with a built resource, or one the learner
  // wrote by hand, is never thrown away; only planned-but-unbuilt practice is replaced.
  let dropped = 0;
  for (const item of pendingById.values()) {
    if (used.has(item.id)) continue;
    if (item.generate && !item.resourceId) { dropped += 1; continue; }
    const dueDate = clampDate(item.dueDate, window.today, window.horizon);
    if (dueDate !== (item.dueDate || "")) moved += 1;
    next.push({ ...item, dueDate });
  }

  // Anything still without a date is spread over the time that is left, in schedule order.
  const undated = next.filter((item) => !item.dueDate);
  if (undated.length) {
    const dates = spreadDates(undated.length, window.today, window.horizon);
    undated.forEach((item, index) => { item.dueDate = dates[index]; });
  }
  next.sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));

  // Exhaustive coverage survives re-planning: every concept still gets studied and tested. Finished
  // steps count as covered; what is missing is added to the steps that are still to do.
  let coverageRepairs = [];
  if (conceptNames.length) {
    const checked = ensureCoverage([...done, ...next], conceptNames);
    coverageRepairs = checked.repairs.filter((entry) => entry.as !== "exam");
    next.splice(0, next.length, ...checked.items.slice(done.length));
  }

  return {
    plan: { ...plan, goals, items: [...done, ...next], note: revision.note ? revision.note : plan.note, updatedAt: new Date().toISOString() },
    summary: { kept: done.length, moved, added, dropped, remaining: next.length, days: window.days },
    added: next.filter((item) => !pendingById.has(item.id)),
    coverageRepairs,
    droppedItems: [...pendingById.values()].filter((item) => !used.has(item.id) && item.generate && !item.resourceId)
  };
}

const titleFor = (kind, scope) => {
  const known = { flashcards: "Flashcards", summary: "Summary", exam: "Practice exam", worksheet: "Worksheet", quiz: "Quiz" }[kind];
  if (known) return known;
  const label = generateLabel(kind, scope || []);
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : "Practice";
};

/**
 * The schedule without a model: the pending steps stay in order, every new document gets a
 * reading step plus the kinds of practice the plan already generates, every new resource is
 * scheduled as it is, and review/exam steps go last. Used when the model is unavailable.
 */
export function fallbackRevision({ plan, doneIds, newUploaded = [], window }) {
  const pending = (plan.items || []).filter((item) => !doneIds.has(item.id));
  const kinds = plannedKinds(plan);
  const fresh = newUploaded.flatMap((document) => [
    { keepId: "", title: `Read: ${document.name}`, kind: "read", dueDate: "", minutes: 30, sourceId: document.id, generate: "", goal: "", concepts: [] },
    ...kinds.map((kind) => ({ keepId: "", title: `${titleFor(kind, plan.agentScope)}: ${document.name}`, kind: kind === "exam" ? "exam" : "activity", dueDate: "", minutes: 30, sourceId: document.id, generate: kind, goal: "", concepts: [] }))
  ]);
  const old = pending.map((item) => ({ keepId: item.id, title: item.title, kind: item.kind, dueDate: "", minutes: item.minutes || 30, sourceId: item.resourceId || "", generate: item.generate || "", goal: "", concepts: item.concepts || [] }));
  const isFinal = (entry) => entry.kind === "exam" || entry.kind === "review";
  const ordered = [...old.filter((entry) => !isFinal(entry)), ...fresh.filter((entry) => !isFinal(entry)), ...old.filter(isFinal), ...fresh.filter(isFinal)];
  const dates = spreadDates(ordered.length, window.today, window.horizon);
  return { note: "", newGoals: [], items: ordered.map((entry, index) => ({ ...entry, dueDate: dates[index] })) };
}
