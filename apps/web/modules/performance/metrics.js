import { parseResource, resourceTags } from "../resources/resource";

/**
 * Performance model: attempts (what was answered) joined with resources (what it was) so results
 * can be sliced by folder, agent, template, source material, activity type, topic and learner.
 */

export function readAttempts(documents = []) {
  const out = [];
  for (const document of documents) {
    if (!(document.tags || []).includes("activity-attempt")) continue;
    try {
      const parsed = JSON.parse(String(document.content || "{}"));
      if (parsed?.attempt) out.push({ documentId: document.id, learner: parsed.learner || "", activityDocumentId: parsed.activityDocumentId || "", ...parsed.attempt });
    } catch { /* unreadable */ }
  }
  return out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

export function readResources(documents = []) {
  return documents.map((document) => ({ document, resource: parseResource(document) })).filter((row) => row.resource);
}

/** Attempt rows enriched with their resource (folder, agent, template, material, tags). */
export function joinAttempts(documents = []) {
  const resources = readResources(documents);
  const byId = new Map(resources.map((row) => [row.document.id, row]));
  const byActivityId = new Map(resources.filter((row) => row.resource.activity).map((row) => [row.resource.activity.id, row]));
  return readAttempts(documents).map((attempt) => {
    const row = byId.get(attempt.activityDocumentId) || byActivityId.get(attempt.activityId) || null;
    return {
      ...attempt,
      resourceId: row?.document.id || "",
      resourceName: row?.resource.name || attempt.activityTitle,
      folderIds: row?.document.folderIds || [],
      agentName: row?.resource.meta.agentName || "",
      templateName: row?.resource.meta.templateName || "",
      sourceNames: row?.resource.meta.sourceNames || [],
      tags: row ? resourceTags(row.document) : [],
      kinds: [...new Set((attempt.results || []).map((result) => result.kind))]
    };
  });
}

const pct = (score, total) => (total ? score / total : 0);

/** Aggregate numbers for a set of attempts. */
export function summarise(attempts = []) {
  const done = attempts.length;
  const graded = attempts.filter((attempt) => attempt.total > 0);
  const score = graded.reduce((sum, attempt) => sum + pct(attempt.score, attempt.total), 0) / (graded.length || 1);
  const errors = attempts.reduce((sum, attempt) => sum + (attempt.results || []).filter((result) => result.correct === false).length, 0);
  const questions = attempts.reduce((sum, attempt) => sum + (attempt.results || []).length, 0);
  const minutes = attempts.reduce((sum, attempt) => sum + (attempt.durationMs || 0), 0) / 60000;
  const timed = attempts.flatMap((attempt) => (attempt.results || []).filter((result) => result.ms > 0));
  const perQuestion = timed.length ? timed.reduce((sum, result) => sum + result.ms, 0) / timed.length / 1000 : 0;
  return { done, score: graded.length ? score : 0, errors, questions, minutes: Math.round(minutes), perQuestion: Math.round(perQuestion), resources: new Set(attempts.map((a) => a.resourceId || a.activityId)).size };
}

/** Errors grouped by topic (or the question's section), most frequent first. */
export function errorsByTopic(attempts = []) {
  const map = new Map();
  for (const attempt of attempts) for (const result of attempt.results || []) {
    if (result.correct !== false) continue;
    const key = result.topic || result.group || "Other";
    const entry = map.get(key) || { topic: key, errors: 0, asked: 0, examples: [] };
    entry.errors += 1;
    if (entry.examples.length < 3) entry.examples.push({ prompt: result.prompt, expected: result.expected, given: result.given, at: attempt.at, resourceName: attempt.resourceName });
    map.set(key, entry);
  }
  for (const attempt of attempts) for (const result of attempt.results || []) {
    const key = result.topic || result.group || "Other";
    const entry = map.get(key);
    if (entry) entry.asked += 1;
  }
  return [...map.values()].map((entry) => ({ ...entry, rate: entry.asked ? entry.errors / entry.asked : 0 })).sort((a, b) => b.errors - a.errors);
}

/** One row per resource: how many times it was done, best/last score, whether it improved. */
export function byResource(attempts = []) {
  const map = new Map();
  for (const attempt of attempts) {
    const key = attempt.resourceId || attempt.activityId;
    const entry = map.get(key) || { key, name: attempt.resourceName, attempts: [], agentName: attempt.agentName, templateName: attempt.templateName, folderIds: attempt.folderIds };
    entry.attempts.push(attempt);
    map.set(key, entry);
  }
  return [...map.values()].map((entry) => {
    const ordered = [...entry.attempts].sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const first = pct(ordered[0].score, ordered[0].total);
    const last = pct(ordered[ordered.length - 1].score, ordered[ordered.length - 1].total);
    return { ...entry, times: ordered.length, first, last, best: Math.max(...ordered.map((a) => pct(a.score, a.total))), delta: last - first, lastAt: ordered[ordered.length - 1].at, errors: ordered.reduce((sum, a) => sum + (a.results || []).filter((r) => r.correct === false).length, 0) };
  }).sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)));
}

/** Daily activity for the last `days` days: how many attempts and the average score. */
export function timeline(attempts = [], days = 30) {
  const today = new Date();
  const out = [];
  for (let index = days - 1; index >= 0; index -= 1) {
    const day = new Date(today.getTime() - index * 86400000);
    const key = day.toISOString().slice(0, 10);
    const ofDay = attempts.filter((attempt) => String(attempt.at).slice(0, 10) === key);
    const graded = ofDay.filter((attempt) => attempt.total > 0);
    out.push({ date: key, count: ofDay.length, score: graded.length ? graded.reduce((sum, attempt) => sum + pct(attempt.score, attempt.total), 0) / graded.length : null });
  }
  return out;
}

export function activityKindLabel(kind) {
  return { choice: "Multiple choice", boolean: "True / false", text: "Written", number: "Numeric", match: "Matching", flashcard: "Flashcards", tiles: "Puzzle" }[kind] || kind;
}

/** What the questions test: mistakes and time by skill category (concept, calculation, vocabulary…). */
export function bySkill(attempts = []) {
  const map = new Map();
  for (const attempt of attempts) for (const result of attempt.results || []) {
    const key = result.skill || "unclassified";
    const entry = map.get(key) || { skill: key, asked: 0, errors: 0, ms: 0, timed: 0 };
    entry.asked += 1;
    if (result.correct === false) entry.errors += 1;
    if (result.ms > 0) { entry.ms += result.ms; entry.timed += 1; }
    map.set(key, entry);
  }
  return [...map.values()]
    .map((entry) => ({ ...entry, rate: entry.asked ? entry.errors / entry.asked : 0, seconds: entry.timed ? Math.round(entry.ms / entry.timed / 1000) : 0 }))
    .sort((a, b) => b.errors - a.errors || b.asked - a.asked);
}

/** Seconds per question by activity type, plus how long a full activity of that type takes. */
export function timeByKind(attempts = []) {
  const map = new Map();
  for (const attempt of attempts) for (const result of attempt.results || []) {
    if (!result.ms) continue;
    const entry = map.get(result.kind) || { kind: result.kind, ms: 0, count: 0 };
    entry.ms += result.ms;
    entry.count += 1;
    map.set(result.kind, entry);
  }
  return [...map.values()].map((entry) => ({ ...entry, seconds: Math.round(entry.ms / entry.count / 1000) })).sort((a, b) => b.seconds - a.seconds);
}

/** Difficulty view: are the mistakes on the hard ones, and how much longer do they take? */
export function byDifficulty(attempts = []) {
  const order = ["easy", "medium", "hard", "unrated"];
  const map = new Map();
  for (const attempt of attempts) for (const result of attempt.results || []) {
    const key = result.difficulty || "unrated";
    const entry = map.get(key) || { difficulty: key, asked: 0, errors: 0, ms: 0, timed: 0 };
    entry.asked += 1;
    if (result.correct === false) entry.errors += 1;
    if (result.ms > 0) { entry.ms += result.ms; entry.timed += 1; }
    map.set(key, entry);
  }
  return [...map.values()]
    .map((entry) => ({ ...entry, rate: entry.asked ? entry.errors / entry.asked : 0, seconds: entry.timed ? Math.round(entry.ms / entry.timed / 1000) : 0 }))
    .sort((a, b) => order.indexOf(a.difficulty) - order.indexOf(b.difficulty));
}

/** How long an exam of `questionCount` questions would take at this learner's pace. */
export function estimateExamMinutes(attempts = [], questionCount = 20) {
  const timed = attempts.flatMap((attempt) => (attempt.results || []).filter((result) => result.ms > 0));
  if (!timed.length) return null;
  const perQuestion = timed.reduce((sum, result) => sum + result.ms, 0) / timed.length;
  return Math.max(1, Math.round((perQuestion * questionCount) / 60000));
}
