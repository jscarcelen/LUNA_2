import { forPlan, joinAttempts } from "./metrics.js";
import { parsePlan } from "../plans/plan.js";
import { diagnosisRows } from "./skillDiagnosis.js";
import { SKILL_FAMILIES, skillById, skillLabel } from "../skills/taxonomy.js";

/**
 * The skills grid, one level above topic: workspace (a main folder) → study plan, against skills grouped
 * by family. A topic-by-topic grid is too detailed to read, so the plan is the row; the topics behind a
 * cell are one tap away (`topicSplit`), and the full workspace → plan → topic table is the advanced view.
 *
 * Pure functions over the same rows `diagnosisRows` gives the heatmap.
 */

export const OVERVIEW = { minSkill: 3, weakMin: 2, weak: 0.65, perFamily: 3, fallback: 6 };

/** How the rows fare on one skill: asked, wrong, accuracy. A mistake the grader pinned on another skill is not counted against this one. */
export function cellOf(rows, id) {
  const hit = rows.filter((row) => row.skills.includes(id));
  if (!hit.length) return null;
  const wrong = hit.filter((row) => !row.correct && (!row.blame?.length || row.blame.includes(id)));
  return { asked: hit.length, wrong: wrong.length, acc: 1 - wrong.length / hit.length };
}

/**
 * The columns: families (Quantitative, Reasoning…) with their sub-skills under them. Compact keeps only the
 * skills that matter: enough answers to mean something, or a visible weakness, at most a few per family.
 * Expanded is every skill that was answered at all.
 */
export function overviewColumns(rows, { expanded = false, thresholds = OVERVIEW } = {}) {
  const stats = new Map();
  for (const row of rows) for (const id of row.skills) if (skillById(id) && !stats.has(id)) stats.set(id, cellOf(rows, id));
  let ids = [...stats.keys()];
  if (!expanded) {
    const relevant = ids.filter((id) => { const cell = stats.get(id); return cell.asked >= thresholds.minSkill || (cell.asked >= thresholds.weakMin && cell.acc < thresholds.weak); });
    ids = relevant.length ? relevant : ids.sort((a, b) => stats.get(b).asked - stats.get(a).asked).slice(0, thresholds.fallback);
  }
  return SKILL_FAMILIES.map((family) => {
    const own = ids.filter((id) => skillById(id).family === family.id).sort((a, b) => stats.get(b).asked - stats.get(a).asked);
    const kept = expanded ? own : own.slice(0, thresholds.perFamily);
    return { family: { id: family.id, label: family.label }, skills: kept.map((id) => ({ id, label: skillLabel(id) })) };
  }).filter((group) => group.skills.length);
}

/** The rows of a set of answers grouped by topic, most answered first. */
export function topicGroups(rows) {
  const map = new Map();
  for (const row of rows) { if (!map.has(row.topic)) map.set(row.topic, []); map.get(row.topic).push(row); }
  return [...map.entries()].map(([topic, own]) => ({ topic, rows: own })).sort((a, b) => b.rows.length - a.rows.length || a.topic.localeCompare(b.topic));
}

/** Behind one cell: which topics the questions that needed the skill came from, and how each went. */
export function topicSplit(rows, id) {
  const total = rows.filter((row) => row.skills.includes(id)).length;
  return topicGroups(rows).map(({ topic, rows: own }) => ({ topic, cell: cellOf(own, id) })).filter((entry) => entry.cell)
    .map((entry) => ({ topic: entry.topic, ...entry.cell, share: total ? entry.cell.asked / total : 0 }))
    .sort((a, b) => b.asked - a.asked || a.acc - b.acc);
}

/**
 * Every subject of the workspace with its study plans and their answers. Answers on a resource that is in no
 * plan sit under "Outside a study plan" so the numbers still add up; a resource in two plans counts in both.
 * `keep` is the screen's own filter (learner, dates).
 */
export function skillOverview(workspace, keep = () => true) {
  const subjects = (workspace?.subjects || []).map((subject) => {
    const documents = subject.documents || [];
    const all = joinAttempts(documents).filter(keep);
    const planned = new Set();
    const plans = documents.map((document) => ({ document, plan: parsePlan(document, { folders: subject.folders || [] }) })).filter((row) => row.plan).map(({ document, plan }) => {
      const attempts = forPlan(all, plan);
      attempts.forEach((attempt) => planned.add(attempt));
      return { id: document.id, name: plan.name || "Study plan", rows: diagnosisRows(attempts) };
    });
    const loose = diagnosisRows(all.filter((attempt) => !planned.has(attempt)));
    if (loose.length) plans.push({ id: "outside-plan", name: "Outside a study plan", rows: loose });
    return { id: subject.id, name: subject.name || "Workspace", rows: diagnosisRows(all), plans: plans.filter((plan) => plan.rows.length) };
  }).filter((subject) => subject.plans.length);
  return { subjects, rows: subjects.flatMap((subject) => subject.rows) };
}
