/**
 * What the phone screens show, read from the same workspace data as the website. Pure (no React, no fetch), tested in
 * tests/mobile/model.test.js. Every number here comes from a stored document: an activity, an attempt or a plan. When
 * there is nothing to show, the functions return empty lists and the screens hide the section instead of inventing one.
 * Words go through `t` (useT() from the screen; English without it), as everywhere else in the app.
 * `drafts` is { activity document id → { answered, total } }: quizzes the student started and has not handed in
 * (activities/draftStore.js `loadAllDrafts`, read through `draftProgress`).
 */

import { tEn } from "../../lib/i18n/index.js";

import { daysUntil, dueLabel, planProgress, withSubPlans } from "../plans/plan.js";
import { effectiveDue } from "../plans/deadlines.js";
import { dueInfoOf, isReservedSubjectName } from "../accounts/shared.js";
import { joinAttempts } from "../performance/metrics.js";
import { buildEvidence, nextActions, overallMastery, topicMastery } from "../performance/mastery.js";
import { analyseErrors } from "../performance/errors.js";
import { PLAN_TAG } from "../plans/plan.js";
import { nextSteps, planRowsOf, rankPlans } from "../dashboard/home.js";

/** Tags of documents that are bookkeeping, not study material: never listed in the Library. */
const HIDDEN_TAGS = ["activity-attempt", "ai-agent", PLAN_TAG, "doc-notes", "study-goal"];

const parse = (document) => {
  try { return JSON.parse(String(document?.content || "{}")); } catch { return null; }
};

/** "Cell biology.pdf" → "Cell biology"; generated names lose their ".resource.json" tail too. */
export function displayName(name = "") {
  return String(name || "").replace(/\.(resource|activity|plan|agent)?\.?json$/i, "").replace(/\.[a-z0-9]{2,5}$/i, "").trim() || String(name || "Untitled");
}

/** The playable activity a document carries (a quiz, flashcards…), or null. */
export function playableOf(document) {
  if (!document || (document.tags || []).includes("activity-attempt")) return null;
  const parsed = parse(document);
  return parsed?.activity?.questions?.length ? parsed : null;
}

/** The kind of a library item, as an id (`mobile.type.<id>` is its word): which tool made it, else its file type. */
const AGENT_TYPES = {
  "quiz-generator": "quiz",
  "math-problem-set": "problemSet",
  "level-test": "levelTest",
  "concept-flashcards": "flashcards",
  "vocabulary-flashcards": "flashcards",
  "document-summarizer": "summary",
  "formula-sheet": "formulaSheet",
  "summary-consolidator": "combinedNotes"
};

/** What kind of activity it is (an id): read from the tool that made it, else from its questions. */
export function activityTypeId(resource) {
  const questions = resource?.activity?.questions || [];
  if (questions.length && questions.every((question) => question.kind === "flashcard")) return "flashcards";
  const byAgent = AGENT_TYPES[resource?.meta?.agentId || resource?.activity?.meta?.agentId || ""];
  if (byAgent && byAgent !== "summary" && byAgent !== "formulaSheet") return byAgent;
  if (/exam|examen/i.test(String(resource?.meta?.agentName || resource?.activity?.title || ""))) return "exam";
  if (questions.length && questions.every((question) => question.kind === "match" || question.kind === "tiles")) return "matching";
  return "quiz";
}

/** The same, in a word the student knows ("Quiz", "Flashcards"…). */
export const activityType = (resource, t = tEn) => t(`mobile.type.${activityTypeId(resource)}`);

const SOURCE_TYPES = [
  [/\.pdf$/i, "pdf"],
  [/\.(docx?|odt|rtf)$/i, "document"],
  [/\.(pptx?|key)$/i, "slides"],
  [/\.(png|jpe?g|webp|gif|heic|bmp|tiff?)$/i, "photo"],
  [/\.(txt|md)$/i, "notes"],
  [/\.(csv|xlsx?)$/i, "table"]
];

/** The kind of a library item, as an id ("quiz", "summary", "pdf"…). */
export function resourceTypeId(document) {
  const playable = playableOf(document);
  if (playable) return activityTypeId(playable);
  if ((document.tags || []).includes("master-document")) return "combinedNotes";
  if (document.sourceType === "generated") {
    const parsed = parse(document);
    return AGENT_TYPES[parsed?.meta?.agentId || ""] || "madeByLuna";
  }
  const match = SOURCE_TYPES.find(([pattern]) => pattern.test(String(document.name || "")));
  return match ? match[1] : "material";
}

/**
 * Every document of the workspace a student would look for, grouped by subject: the material they (or a teacher) added,
 * and what Luna made from it. `query` filters by name, type and subject, case-insensitively.
 * @returns {{ subjectId, subjectName, shared, items: { id, name, type, typeId, kind: "source"|"made", playable, subjectId, subjectName, folderName, updatedAt }[] }[]}
 */
export function libraryGroups(workspace, query = "", t = tEn) {
  const needle = String(query || "").trim().toLowerCase();
  const groups = [];
  for (const subject of workspace?.subjects || []) {
    const folderName = (document) => (subject.folders || []).find((folder) => (document.folderIds || []).includes(folder.id))?.name || "";
    const items = (subject.documents || [])
      .filter((document) => !(document.tags || []).some((tag) => HIDDEN_TAGS.includes(tag)))
      .map((document) => {
        const playable = playableOf(document);
        const made = document.sourceType === "generated" || Boolean(playable);
        const typeId = resourceTypeId(document);
        return {
          id: document.id,
          name: displayName(playable?.name || playable?.activity?.title || document.name),
          type: t(`mobile.type.${typeId}`),
          typeId,
          kind: made ? "made" : "source",
          playable: Boolean(playable),
          subjectId: subject.id,
          subjectName: subject.name,
          folderName: folderName(document),
          updatedAt: document.updatedAt || document.createdAt || ""
        };
      })
      .filter((item) => !needle || [item.name, item.type, item.subjectName, item.folderName].some((text) => String(text).toLowerCase().includes(needle)))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)) || a.name.localeCompare(b.name));
    if (items.length) groups.push({ subjectId: subject.id, subjectName: subject.name, shared: isReservedSubjectName(subject.name), items });
  }
  return groups;
}

/** The subjects material can be uploaded into: not the "Shared documents" / "Shared with me" topics other people fill. */
export function uploadSubjects(workspace) {
  return (workspace?.subjects || []).filter((subject) => !isReservedSubjectName(subject.name));
}

/**
 * The activities a student can do, each with the reason it is suggested, most useful first:
 *   1. not done yet and due (late first, then soonest);
 *   2. not done yet, no date;
 *   3. done, but with mistakes to go over (lowest best score first);
 *   4. done well.
 * `drafts` marks the ones the student started and has not handed in yet: those come first.
 */
export function studyActivities(workspace, { subjectId = "", drafts = {} } = {}, t = tEn) {
  const documents = (workspace?.subjects || []).flatMap((subject) => (subject.documents || []).map((document) => ({ document, subject })));
  const attempts = joinAttempts(documents.map((entry) => entry.document));
  const rows = [];
  for (const { document, subject } of documents) {
    if (subjectId && subject.id !== subjectId) continue;
    const resource = playableOf(document);
    if (!resource) continue;
    const activity = resource.activity;
    const mine = attempts.filter((attempt) => attempt.resourceId === document.id || attempt.activityDocumentId === document.id);
    const latest = mine[0] || null;
    const best = mine.reduce((top, attempt) => Math.max(top, attempt.total ? attempt.score / attempt.total : 0), 0);
    const due = dueInfoOf(document).date;
    const days = due ? daysUntil(due) : null;
    const draft = drafts[document.id] || null;
    let group = 3;
    if (!mine.length) group = days === null ? 1 : 0;
    else if (best < 0.8) group = 2;
    let reason = "";
    if (draft) reason = t("mobile.reason.started", { answered: draft.answered || 0, total: activity.questions.length });
    else if (!mine.length && days !== null) reason = dueText(due, t);
    else if (!mine.length) reason = t("mobile.reason.notTried");
    else if (latest && best < 0.8) reason = t("mobile.reason.retry", { score: formatScore(latest.score), total: latest.total });
    else if (latest) reason = t("mobile.reason.last", { score: formatScore(latest.score), total: latest.total });
    rows.push({
      documentId: document.id,
      subjectId: subject.id,
      subjectName: subject.name,
      resource,
      title: displayName(resource.name || activity.title || document.name),
      type: activityType(resource, t),
      typeId: activityTypeId(resource),
      questionCount: activity.questions.length,
      topics: [...new Set(activity.questions.map((question) => question.topic).filter(Boolean))].slice(0, 3),
      attempts: mine.length,
      best,
      due,
      days,
      draft,
      reason,
      group: draft ? -1 : group
    });
  }
  rows.sort((a, b) => a.group - b.group
    || (a.group === 0 ? a.days - b.days : 0)
    || (a.group === 2 ? a.best - b.best : 0)
    || a.title.localeCompare(b.title));
  return rows.map(({ group: _group, ...row }) => row);
}

/** "3 days late", "Due today", "Due tomorrow", "Due in 4 days", "Due 24 Oct". Empty without a date. */
export function dueText(date, t = tEn) {
  const days = daysUntil(date);
  if (days === null) return "";
  if (days < 0) return dueLabel(date, t);
  if (days === 0) return t("mobile.due.today");
  if (days === 1) return t("mobile.due.tomorrow");
  if (days <= 7) return t("mobile.due.inDays", { days });
  return t("mobile.due.on", { date: dueLabel(date, t) });
}

/** "Test in 4 days", "Test today", "Test was 2 days ago": a plan's deadline with its own name. */
export function deadlineText(deadline, t = tEn) {
  const days = daysUntil(deadline?.date);
  if (days === null) return "";
  const title = String(deadline?.title || "").trim() || t("mobile.deadline");
  if (days < 0) return t.plural("mobile.deadline.past", -days, { title });
  if (days === 0) return t("mobile.deadline.today", { title });
  if (days === 1) return t("mobile.deadline.tomorrow", { title });
  if (days <= 7) return t("mobile.deadline.inDays", { title, days });
  return t("mobile.deadline.on", { title, date: dueLabel(deadline.date, t) });
}

export const formatScore = (score) => (Number.isInteger(score) ? String(score) : Number(score || 0).toFixed(1));

/** Where a plan step stands: done when ticked or its activity was answered; in progress when it has a draft. */
export function stepStatus(item, progress, drafts = {}) {
  if (item.doneAt || (item.resourceId && progress.scoreByResource?.has(item.resourceId))) return "done";
  return item.resourceId && drafts[item.resourceId] ? "started" : "todo";
}

/**
 * The study plans as a list of tasks a phone can show: each root plan (sub-plans rolled in, as on the website) with its
 * steps in date order and a status per step. `entries` are `rankPlans` rows (dashboard/home.js).
 */
export function planTasks(entries = [], rows = [], workspace = null, drafts = {}, t = tEn) {
  const documents = (workspace?.subjects || []).flatMap((subject) => subject.documents || []);
  const byId = new Map(documents.map((document) => [document.id, document]));
  const attempts = joinAttempts(documents);
  return entries.map((entry) => {
    const plan = entry.children?.length ? withSubPlans(entry.plan, rows) : entry.plan;
    const progress = planProgress(plan, attempts);
    const steps = (plan.items || [])
      .map((item) => {
        const due = effectiveDue(item);
        const resourceDocument = item.resourceId ? byId.get(item.resourceId) : null;
        return {
          id: item.id,
          title: item.title || displayName(resourceDocument?.name || t("mobile.step")),
          kind: item.kind,
          due,
          days: due ? daysUntil(due) : null,
          minutes: Number(item.minutes) > 0 ? Number(item.minutes) : 0,
          status: stepStatus(item, progress, drafts),
          resourceId: resourceDocument ? item.resourceId : "",
          playable: Boolean(resourceDocument && playableOf(resourceDocument)),
          subjectId: resourceDocument ? (workspace?.subjects || []).find((subject) => (subject.documents || []).some((document) => document.id === resourceDocument.id))?.id || entry.subjectId : entry.subjectId
        };
      })
      .sort((a, b) => (a.status === "done") - (b.status === "done") || String(a.due || "9999").localeCompare(String(b.due || "9999")));
    return {
      planId: entry.document.id,
      subjectId: entry.subjectId,
      subjectName: entry.subjectName,
      name: entry.plan.name,
      colour: entry.plan.colour,
      done: progress.done,
      total: progress.total,
      deadline: progress.deadline,
      days: progress.days,
      steps
    };
  });
}

/**
 * The Progress tab: mastery per topic from the answered questions (the same engine as the website's Progress page),
 * the topics with real evidence of difficulty, the latest activities, and what to do next.
 * Empty (`hasData: false`) until a first activity has been answered.
 */
export function progressModel(workspace, { learner = "" } = {}, t = tEn) {
  const subjects = workspace?.subjects || [];
  const documents = subjects.flatMap((subject) => subject.documents || []);
  const subjectOfDocument = new Map(subjects.flatMap((subject) => (subject.documents || []).map((document) => [document.id, subject.name])));
  let attempts = joinAttempts(documents);
  if (learner) attempts = attempts.filter((attempt) => !attempt.learner || attempt.learner === learner);
  if (!attempts.length) return { hasData: false, overall: null, subjects: [], topics: [], weak: [], recent: [], actions: [] };
  const subjectOf = (attempt) => subjectOfDocument.get(attempt.resourceId) || subjectOfDocument.get(attempt.documentId) || "";
  const evidence = buildEvidence(attempts, { subjectOf });
  const topics = topicMastery(evidence);
  const errors = analyseErrors(evidence);
  const bySubject = new Map();
  for (const row of evidence) {
    if (!bySubject.has(row.subject)) bySubject.set(row.subject, []);
    bySubject.get(row.subject).push(row);
  }
  const subjectRows = [...bySubject.entries()]
    .map(([name, rows]) => ({ name: name || t("mobile.other"), ...overallMastery(topicMastery(rows)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  // "Needs more practice" only lists topics with enough answers to be believed (nextActions asks for 2 or more).
  const actions = nextActions(topics, errors.byTopic, 3, t);
  // The website's error labels ("Analytical gap") are for teachers; a student reads what went wrong in plain words.
  const PLAIN_REASON = { knowledge: "mobile.weak.knowledge", analytical: "mobile.weak.analytical", accuracy: "mobile.weak.accuracy" };
  const weak = actions.map((action) => {
    const topic = topics.find((entry) => entry.topic === action.topic);
    return { topic: action.topic, mastery: action.mastery, status: topic?.status || null, reason: PLAIN_REASON[action.reasonId] ? t(PLAIN_REASON[action.reasonId]) : action.reason, advice: action.advice, questions: topic?.questions || 0, subject: topic?.rows?.[0]?.subject || "" };
  });
  const recent = attempts.slice(0, 5).map((attempt) => ({
    id: attempt.documentId,
    title: displayName(attempt.resourceName || attempt.activityTitle || t("mobile.activity")),
    subject: subjectOf(attempt),
    at: attempt.at,
    score: attempt.score,
    total: attempt.total,
    resourceId: attempt.resourceId
  }));
  return {
    hasData: true,
    overall: overallMastery(topics),
    subjects: subjectRows,
    topics: [...topics].sort((a, b) => b.questions - a.questions).slice(0, 8).map((topic) => ({ topic: topic.topic, mastery: topic.mastery, status: topic.status, questions: topic.questions, trend: topic.trend })),
    weak,
    recent,
    actions
  };
}

/** "Today", "Yesterday", "3 days ago", "12 Oct". */
export function whenLabel(at, t = tEn, now = Date.now()) {
  const time = new Date(at).getTime();
  if (!Number.isFinite(time)) return "";
  const days = Math.floor((startOfDay(now) - startOfDay(time)) / 86400000);
  if (days <= 0) return t("mobile.when.today");
  if (days === 1) return t("mobile.when.yesterday");
  if (days < 7) return t("mobile.when.daysAgo", { days });
  return new Date(time).toLocaleDateString(t.locale === "es" ? "es-ES" : "en-GB", { day: "numeric", month: "short" });
}

const startOfDay = (time) => { const date = new Date(time); date.setHours(0, 0, 0, 0); return date.getTime(); };

/**
 * Home on the phone: ONE next step, what was left half-way, and what is coming up. Read from the study plans first (the
 * most urgent step, as on the website's Home), then from the activities (one not tried yet, or one with mistakes to go
 * over). `next` is null when there is truly nothing: the screen then says so and offers real ways to start.
 */
export function homeModel(workspace, { drafts = {}, examDates = [] } = {}, t = tEn) {
  const subjects = workspace?.subjects || [];
  const documents = subjects.flatMap((subject) => subject.documents || []);
  const subjectOf = (documentId) => subjects.find((subject) => (subject.documents || []).some((document) => document.id === documentId)) || null;
  const rows = planRowsOf(workspace);
  const entries = rankPlans(rows, joinAttempts(documents), { limit: 50 });
  const steps = nextSteps(entries, 6);
  const activities = studyActivities(workspace, { drafts }, t);
  const hasMaterial = documents.some((document) => document.sourceType !== "generated" && !(document.tags || []).some((tag) => HIDDEN_TAGS.includes(tag)));

  let next = null;
  const step = steps[0] || null;
  if (step) {
    const entry = entries.find((candidate) => candidate.document.id === step.planId);
    const item = (entry?.plan.items || []).find((candidate) => `${step.planId}:${candidate.id}` === step.id) || null;
    const resource = item?.resourceId ? documents.find((document) => document.id === item.resourceId) || null : null;
    const playable = resource ? playableOf(resource) : null;
    const kindReason = { review: t("mobile.next.review"), exam: t("mobile.next.exam"), read: t("mobile.next.read") }[step.kind] || (playable ? t.plural("mobile.next.questions", playable.activity.questions.length) : t("mobile.next.step"));
    next = {
      source: "plan",
      subject: entry?.subjectName || "",
      topic: step.planName,
      title: step.title,
      reason: kindReason,
      when: dueText(step.dueDate, t),
      late: step.days !== null && step.days < 0,
      documentId: resource?.id || "",
      subjectId: resource ? subjectOf(resource.id)?.id || step.subjectId : step.subjectId,
      planId: step.planId
    };
  } else {
    const candidate = activities.find((row) => !row.draft && (row.attempts === 0 || row.best < 0.8));
    if (candidate) {
      next = {
        source: "activity",
        subject: candidate.subjectName,
        topic: candidate.topics[0] || candidate.type,
        title: candidate.title,
        reason: candidate.attempts ? t("mobile.next.tricky") : t.plural("mobile.next.new", candidate.questionCount, { type: candidate.type }),
        when: candidate.attempts ? "" : dueText(candidate.due, t),
        late: candidate.days !== null && candidate.days < 0 && !candidate.attempts,
        documentId: candidate.documentId,
        subjectId: candidate.subjectId,
        planId: ""
      };
    }
  }

  const continueItems = activities.filter((row) => row.draft).slice(0, 2).map((row) => ({
    documentId: row.documentId,
    subjectId: row.subjectId,
    subject: row.subjectName,
    type: row.type,
    title: row.title,
    answered: Number(row.draft.answered) || 0,
    total: row.questionCount
  }));

  const upcoming = [
    ...steps.slice(step ? 1 : 0).filter((entry) => entry.dueDate).map((entry) => ({ id: entry.id, title: entry.title, detail: entry.planName, when: dueText(entry.dueDate, t), late: entry.days < 0, planId: entry.planId, date: entry.dueDate })),
    ...examDates.filter((entry) => !entry.dismissedAt && daysUntil(entry.date) !== null && daysUntil(entry.date) >= 0).map((entry) => ({ id: `exam:${entry.id}`, title: entry.title, detail: entry.senderName ? t("mobile.exam.from", { name: entry.senderName }) : t("mobile.exam"), when: deadlineText({ title: t("mobile.exam"), date: entry.date }, t), late: false, planId: entry.linkedPlanIds?.[0] || "", date: entry.date }))
  ].sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 2);

  return { next, continueItems, upcoming, hasMaterial, hasPlans: entries.length > 0, hasActivities: activities.length > 0 };
}
