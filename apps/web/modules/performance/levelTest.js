import { normaliseSkillIds, skillLabel } from "../skills/taxonomy.js";

/**
 * Where you start.
 *
 * A level test asks about the FOUNDATIONS a document builds on, grouped into components (the `topic` of each
 * question holds the component's name, in the order they run from basic to advanced). This reads the
 * most recent level test of each document and says, per component, whether it is solid, worth a
 * review or the place to start, and where to begin overall.
 */

export const LEVEL_TEST_NAME = "Level Test";
export const STRONG = 0.8;
export const REVIEW = 0.5;

export const isLevelTest = (attempt) => String(attempt?.agentName || "").trim() === LEVEL_TEST_NAME || /\blevel test\b/i.test(String(attempt?.activityTitle || attempt?.resourceName || ""));

/** Solid, to review, or a place to start. */
export const statusOfComponent = (accuracy) => (accuracy >= STRONG ? "strong" : accuracy >= REVIEW ? "review" : "start");

/** One level-test attempt as a report: components in the order they were asked, each with its result. */
export function levelReport(attempt) {
  const order = [];
  const byName = new Map();
  for (const result of attempt.results || []) {
    if (result.correct !== true && result.correct !== false) continue;
    const name = String(result.topic || result.group || "General").trim() || "General";
    if (!byName.has(name)) { byName.set(name, { name, asked: 0, right: 0, skills: new Map() }); order.push(name); }
    const entry = byName.get(name);
    entry.asked += 1;
    if (result.correct) entry.right += 1;
    for (const id of normaliseSkillIds(result.skills)) entry.skills.set(id, (entry.skills.get(id) || 0) + 1);
  }
  const components = order.map((name) => {
    const entry = byName.get(name);
    const accuracy = entry.asked ? entry.right / entry.asked : 0;
    const skill = [...entry.skills.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
    return { name, asked: entry.asked, right: entry.right, accuracy, status: statusOfComponent(accuracy), skill, skillLabel: skill ? skillLabel(skill) : "" };
  });
  const asked = components.reduce((sum, component) => sum + component.asked, 0);
  const right = components.reduce((sum, component) => sum + component.right, 0);
  // Foundations build on each other: start at the first one that is not solid, even if a later one went well.
  const startAt = components.find((component) => component.status !== "strong") || null;
  return {
    id: attempt.resourceId || attempt.activityId || "",
    title: attempt.resourceName || attempt.activityTitle || "Level test",
    at: attempt.at || "",
    asked, accuracy: asked ? right / asked : 0,
    components, startAt,
    ready: components.length > 0 && !startAt,
    summary: summaryOf(components, startAt)
  };
}

function summaryOf(components, startAt) {
  if (!components.length) return "No answers to read yet.";
  if (!startAt) return "Every foundation is solid: you can start the material.";
  const solid = components.filter((component) => component.status === "strong").length;
  const label = startAt.status === "start" ? "Start with" : "Review";
  return `${solid} of ${components.length} foundations are solid. ${label} ${startAt.name.toLowerCase()} before moving on.`;
}

/** The latest level-test report of each document, newest first. */
export function latestLevelReports(attempts = []) {
  const latest = new Map();
  for (const attempt of attempts.filter(isLevelTest)) {
    const key = attempt.resourceId || attempt.activityTitle || attempt.activityId;
    const kept = latest.get(key);
    if (!kept || String(attempt.at) > String(kept.at)) latest.set(key, attempt);
  }
  return [...latest.values()].sort((a, b) => String(b.at).localeCompare(String(a.at))).map(levelReport).filter((report) => report.components.length);
}
