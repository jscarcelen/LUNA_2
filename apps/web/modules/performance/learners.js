"use client";

/**
 * Who did an activity. Until student accounts exist, learners are names kept per browser; each
 * attempt stores its learner so teachers and parents can filter results by child.
 */
const KEY = "luna.learners.v1";

export function readLearners() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addLearner(name) {
  const clean = String(name || "").trim();
  if (!clean) return readLearners();
  const next = [...new Set([...readLearners(), clean])];
  try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  return next;
}

export function removeLearner(name) {
  const next = readLearners().filter((item) => item !== name);
  try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  return next;
}

/** The learner a role works as by default: a student is themself; a teacher or parent picks a child. */
export function defaultLearner(role, profileName) {
  if (role === "student") return profileName || "Me";
  return readLearners()[0] || "";
}
