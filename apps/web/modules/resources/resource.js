/**
 * A resource is one generated document: the agent output plus everything needed to open it as an
 * activity, export it in any of its template's views, and regenerate it later (the request that
 * produced it). Stored as a workspace document tagged `resource`.
 */

export const RESOURCE_TAG = "resource";

export function parseResource(document) {
  if (!document || !(document.tags || []).includes(RESOURCE_TAG)) return null;
  try {
    const parsed = JSON.parse(String(document.content || "{}"));
    return parsed && parsed.kind === "resource" ? parsed : null;
  } catch {
    return null;
  }
}

/** Builds the stored payload. `request` is everything needed to regenerate (config + mapping). */
export function buildResource({ name, activity = null, data = {}, request = {}, meta = {} }) {
  return {
    kind: "resource",
    version: 1,
    name,
    createdAt: new Date().toISOString(),
    activity,
    data,
    request,
    meta: {
      agentId: meta.agentId || "",
      agentName: meta.agentName || "",
      templateId: meta.templateId || "",
      templateName: meta.templateName || "",
      sourceDocumentIds: meta.sourceDocumentIds || [],
      sourceNames: meta.sourceNames || [],
      difficulty: meta.difficulty || "",
      topic: meta.topic || "",
      questionCount: activity ? activity.questions.length : 0
    }
  };
}

const flag = (document, prefix) => (document.tags || []).find((tag) => String(tag).startsWith(prefix));

export const isFavourite = (document) => (document.tags || []).includes("favourite");
export const resourceDifficulty = (document) => (flag(document, "difficulty:") || "").slice(11);
export function resourceTags(document) {
  return (document.tags || []).filter((tag) => !["resource", "favourite", "activity", "activity-attempt"].includes(tag) && !String(tag).includes(":"));
}

/** Attempts of this resource's activity, newest first. */
export function attemptsFor(resourceDocumentId, activityId, documents = []) {
  const out = [];
  for (const document of documents) {
    if (!(document.tags || []).includes("activity-attempt")) continue;
    try {
      const parsed = JSON.parse(String(document.content || "{}"));
      if (!parsed?.attempt) continue;
      if (parsed.activityDocumentId === resourceDocumentId || (activityId && parsed.activityId === activityId)) out.push(parsed.attempt);
    } catch { /* unreadable */ }
  }
  return out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

export function resourceStats(resourceDocumentId, activityId, documents = []) {
  const attempts = attemptsFor(resourceDocumentId, activityId, documents);
  const errors = attempts.reduce((sum, attempt) => sum + (attempt.results || []).filter((result) => result.correct === false).length, 0);
  const best = attempts.reduce((max, attempt) => Math.max(max, attempt.total ? attempt.score / attempt.total : 0), 0);
  return { attempts, times: attempts.length, errors, best, lastAt: attempts[0]?.at || "" };
}
