/**
 * Drafts: a quiz the learner started and has not submitted yet.
 *
 * A draft holds the answers, the "how sure" taps, the typed working (never the photo of it), the question the
 * learner was on, and how long they have spent. It is NOT an attempt: it is never marked, never sent to the
 * performance tracker and never counts as "done". Submitting turns it into an attempt and deletes it.
 *
 * Pure functions only (shape, merge, resume, progress counting). The browser side (localStorage + the
 * `/api/activities/drafts` route) is in `draftStore.js`.
 */

export const DRAFT_VERSION = 1;
/** A draft is a few answers: anything larger is not a draft (and would not fit a keepalive request). */
export const MAX_DRAFT_CHARS = 60000;
const MAX_TEXT = 4000;

const clip = (value, max) => String(value ?? "").slice(0, max);

/** Has the learner answered this question? (A matching question needs every pair; a tile puzzle every slot.) */
export function isAnswered(question, value) {
  if (!question) return false;
  if (question.kind === "match") return Boolean(value) && typeof value === "object" && Object.values(value).filter((entry) => String(entry || "") !== "").length === (question.pairs || []).length && (question.pairs || []).length > 0;
  if (question.kind === "tiles") return Array.isArray(value) && value.length > 0 && !value.includes(null);
  return value !== undefined && value !== null && value !== "";
}

/** How many of the questions have an answer. */
export function countAnswered(questions = [], answers = {}) {
  return (questions || []).filter((question) => isAnswered(question, answers?.[question.id])).length;
}

/** The first question without an answer (index), or -1 when everything is answered. */
export function firstUnanswered(questions = [], answers = {}) {
  return (questions || []).findIndex((question) => !isAnswered(question, answers?.[question.id]));
}

/** The key a draft is stored under in this browser: one per account (or guest) and activity. */
export function draftStorageKey(scope, activityKey) {
  return `luna.draft.v${DRAFT_VERSION}:${String(scope || "guest")}:${String(activityKey || "")}`;
}

/** Is a value a plausible answer for that kind of question? (A draft written for an older version of the quiz may not fit.) */
function fits(question, value) {
  if (value === undefined || value === null) return false;
  switch (question.kind) {
    case "choice": return typeof value === "string" && (question.options || []).includes(value);
    case "boolean": return value === "true" || value === "false";
    case "flashcard": return value === "known" || value === "unknown";
    case "text": case "number": return typeof value === "string" || typeof value === "number";
    case "match": {
      if (!value || typeof value !== "object" || Array.isArray(value)) return false;
      const lefts = new Set((question.pairs || []).map((pair) => pair.left));
      return Object.keys(value).every((left) => lefts.has(left));
    }
    case "tiles": {
      const size = (question.tiles || []).length;
      return Array.isArray(value) && value.length === size && value.every((entry) => entry === null || (Number.isInteger(entry) && entry >= 0 && entry < size));
    }
    default: return false;
  }
}

/**
 * The draft to store, from the player's state. Only questions that still exist are kept, the working loses its
 * photo (it is shrunk for the grader only and would make the draft too big), and the counts are recorded so the
 * Practice list can say "3/6 answered" without loading the quiz.
 */
export function makeDraft(activity, { answers = {}, confidence = {}, work = {}, index = 0, elapsedMs = 0, durations = {} } = {}, now = new Date()) {
  const questions = activity?.questions || [];
  const ids = new Set(questions.map((question) => question.id));
  const keep = (object, map = (value) => value) => Object.fromEntries(Object.entries(object || {}).filter(([id, value]) => ids.has(id) && value !== undefined && value !== "").map(([id, value]) => [id, map(value)]));
  const cleanAnswers = keep(answers, (value) => (typeof value === "string" ? clip(value, MAX_TEXT) : value));
  const cleanWork = Object.fromEntries(Object.entries(keep(work)).map(([id, value]) => [id, { text: clip(value?.text, 1500), image: "", full: value?.full === true }]).filter(([, value]) => value.text));
  return {
    v: DRAFT_VERSION,
    activityId: String(activity?.id || ""),
    answers: cleanAnswers,
    confidence: keep(confidence, (value) => clip(value, 10)),
    work: cleanWork,
    index: Math.max(0, Math.min(questions.length ? questions.length - 1 : 0, Math.round(Number(index) || 0))),
    elapsedMs: Math.max(0, Math.round(Number(elapsedMs) || 0)),
    durations: keep(durations, (value) => Math.max(0, Math.round(Number(value) || 0))),
    answered: countAnswered(questions, cleanAnswers),
    total: questions.length,
    updatedAt: (now instanceof Date ? now : new Date(now)).toISOString()
  };
}

/** Is there anything in it worth keeping? */
export function isDraftEmpty(draft) {
  if (!draft || typeof draft !== "object") return true;
  return !Object.keys(draft.answers || {}).length && !Object.keys(draft.work || {}).length && !Object.keys(draft.confidence || {}).length;
}

/** A stored value read back (from JSON): null when it is not a draft. */
export function parseDraft(value) {
  let draft = value;
  if (typeof value === "string") { try { draft = JSON.parse(value); } catch { return null; } }
  if (!draft || typeof draft !== "object" || Array.isArray(draft) || typeof draft.answers !== "object" || draft.answers === null) return null;
  return draft;
}

const timeOf = (draft) => { const at = Date.parse(draft?.updatedAt || ""); return Number.isFinite(at) ? at : 0; };

/**
 * This browser's copy and the server's copy: the most recent wins (the learner may have continued on another device,
 * or saved here while offline). On a tie the server's copy wins, because it is the one other devices see.
 */
export function mergeDrafts(local, server) {
  const a = parseDraft(local);
  const b = parseDraft(server);
  if (!a) return b;
  if (!b) return a;
  return timeOf(a) > timeOf(b) ? a : b;
}

/**
 * Where to pick up: the answers that still fit the quiz (a quiz updated since keeps what it can), the question the
 * learner was on, and the time already spent. Null when there is nothing to resume.
 */
export function resumeState(draft, activity) {
  const parsed = parseDraft(draft);
  const questions = activity?.questions || [];
  if (!parsed || !questions.length) return null;
  const byId = new Map(questions.map((question) => [question.id, question]));
  const answers = Object.fromEntries(Object.entries(parsed.answers || {}).filter(([id, value]) => byId.has(id) && fits(byId.get(id), value)));
  const confidence = Object.fromEntries(Object.entries(parsed.confidence || {}).filter(([id, value]) => byId.has(id) && ["high", "medium", "low"].includes(value)));
  const work = Object.fromEntries(Object.entries(parsed.work || {}).filter(([id, value]) => byId.has(id) && value && typeof value.text === "string" && value.text.trim()).map(([id, value]) => [id, { text: value.text, image: "", full: value.full === true }]));
  if (!Object.keys(answers).length && !Object.keys(work).length) return null;
  const index = Math.max(0, Math.min(questions.length - 1, Math.round(Number(parsed.index) || 0)));
  const durations = Object.fromEntries(Object.entries(parsed.durations || {}).filter(([id]) => byId.has(id)).map(([id, value]) => [id, Math.max(0, Number(value) || 0)]));
  return { answers, confidence, work, index, elapsedMs: Math.max(0, Number(parsed.elapsedMs) || 0), durations, answered: countAnswered(questions, answers), total: questions.length, updatedAt: parsed.updatedAt || "" };
}

/** What the Practice list says about a draft: { answered, total } from the stored counts (the quiz need not be loaded). */
export function draftProgress(draft, activity = null) {
  const parsed = parseDraft(draft);
  if (!parsed) return null;
  if (activity?.questions?.length) {
    const resumed = resumeState(parsed, activity);
    return resumed ? { answered: resumed.answered, total: resumed.total } : null;
  }
  const total = Math.max(0, Number(parsed.total) || 0);
  return { answered: Math.min(total || Infinity, Math.max(0, Number(parsed.answered) || 0)), total };
}
