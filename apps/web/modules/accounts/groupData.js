/**
 * Turns the members of a group (what /api/accounts/linked/members returns, each student's redacted workspace tree)
 * into the shapes the teacher's views draw. Pure (tests in tests/accounts/groupData.test.js).
 *
 *  - `buildGroupWorkspaces` merges the members' topics into ONE synthetic workspace the existing performance page can
 *    read as a class: every attempt is labelled with the student it belongs to (`learner`), so the class panels
 *    (class × topic heatmap, who needs attention, topic coverage, headline) work on a group exactly as they do on a class.
 *  - `compareMembers` is the one-row-per-student comparison.
 *  - `memberPlanRows` is the Study plans table of the group.
 *  - `examPlanStatus` says, for one exam date, whether a student has a plan for it and how far it is.
 */
import { joinAttempts } from "../performance/metrics.js";
import { buildEvidence, overallMastery, topicMastery } from "../performance/mastery.js";
import { daysUntil, nextDeadline, parsePlan, planProgress } from "../plans/plan.js";
import { isImposed } from "../plans/deadlines.js";

const text = (value) => String(value || "").trim();

export const GROUP_WORKSPACE_ID = "group-view";
export const GROUP_SUBJECT_ID = "group-subject";

/** Two students with the same name stay two rows: the second gets its email in brackets. */
export function memberLabels(members) {
  const counts = new Map();
  for (const member of members) {
    const name = text(member.student?.displayName) || text(member.student?.email) || "Student";
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return new Map(members.map((member) => {
    const name = text(member.student?.displayName) || text(member.student?.email) || "Student";
    return [member.student.id, counts.get(name) > 1 ? `${name} (${text(member.student?.email)})` : name];
  }));
}

/** Every topic name any member has, in order of first appearance. */
export function subjectNamesOf(members) {
  const names = [];
  for (const member of members) for (const workspace of member.workspaces || []) for (const subject of workspace.subjects || []) if (!names.includes(subject.name)) names.push(subject.name);
  return names;
}

/** An attempt document, labelled with the student it belongs to. Anything else is returned as it is. */
function labelled(document, label) {
  if (!(document.tags || []).includes("activity-attempt")) return document;
  try {
    const parsed = JSON.parse(String(document.content || "{}"));
    return { ...document, content: JSON.stringify({ ...parsed, learner: label }) };
  } catch {
    return document;
  }
}

/**
 * One synthetic workspace for the group, holding the members' documents of the topic called `subjectName` (every
 * topic when it is empty). Shape: what PerformancePage / SubjectTabs take as `workspaces`.
 */
export function buildGroupWorkspaces(members, { groupName = "Group", subjectName = "" } = {}) {
  const labels = memberLabels(members);
  const documents = [];
  const folders = [];
  for (const member of members) {
    const label = labels.get(member.student.id);
    for (const workspace of member.workspaces || []) {
      for (const subject of workspace.subjects || []) {
        if (subjectName && subject.name !== subjectName) continue;
        for (const document of subject.documents || []) documents.push(labelled(document, label));
        for (const folder of subject.folders || []) folders.push(folder);
      }
    }
  }
  return [{ id: GROUP_WORKSPACE_ID, name: groupName, subjects: [{ id: GROUP_SUBJECT_ID, name: subjectName || "All topics", documents, folders }] }];
}

/** All of one member's documents across every topic (their plans can live anywhere). */
const documentsOf = (member) => (member.workspaces || []).flatMap((workspace) => (workspace.subjects || []).flatMap((subject) => subject.documents || []));

/**
 * One row per member, weakest first: how they are doing and what needs a look.
 * @returns {Array<{ id: string, name: string, attempts: number, mastery: number | null, lastAt: string, late: number, plans: number, idleDays: number | null }>}
 */
export function compareMembers(members, { now = Date.now() } = {}) {
  const labels = memberLabels(members);
  return members.map((member) => {
    const documents = documentsOf(member);
    const attempts = joinAttempts(documents);
    const evidence = buildEvidence(attempts, { subjectOf: () => "", conceptsOf: () => [] });
    const topics = topicMastery(evidence);
    const plans = documents.map((document) => parsePlan(document)).filter(Boolean);
    const late = plans.reduce((sum, plan) => sum + planProgress(plan, attempts).late.length, 0);
    const last = attempts.reduce((max, attempt) => (String(attempt.at) > max ? String(attempt.at) : max), "");
    return {
      id: member.student.id,
      name: labels.get(member.student.id),
      attempts: attempts.length,
      mastery: topics.length ? overallMastery(topics).mastery : null,
      lastAt: last,
      late,
      plans: plans.length,
      idleDays: last ? Math.max(0, Math.floor((now - new Date(last).getTime()) / 86400000)) : null
    };
  }).sort((a, b) => (a.mastery ?? 101) - (b.mastery ?? 101));
}

/**
 * The Study plans table: for every member, each of their plans with progress and the next deadline (and who set it).
 * @returns {Array<{ id: string, name: string, plans: Array<{ documentId: string, name: string, colour: string, done: number, total: number, ratio: number, late: number, deadline: object | null, imposed: boolean, setBy: string, days: number | null, examDateId: string }> }>}
 */
export function memberPlanRows(members) {
  const labels = memberLabels(members);
  return members.map((member) => {
    const documents = documentsOf(member);
    const attempts = joinAttempts(documents);
    const plans = documents.map((document) => parsePlan(document)).filter(Boolean).map((plan) => {
      const progress = planProgress(plan, attempts);
      const deadline = nextDeadline(plan);
      return {
        documentId: plan.documentId,
        name: plan.name,
        colour: plan.colour,
        done: progress.done,
        total: progress.total,
        ratio: progress.ratio,
        late: progress.late.length,
        deadline,
        imposed: Boolean(deadline) && isImposed(deadline),
        setBy: deadline && isImposed(deadline) ? text(deadline.setBy?.name) : "",
        days: deadline ? daysUntil(deadline.date) : null,
        examDateId: text(deadline?.examDateId)
      };
    });
    return { id: member.student.id, name: labels.get(member.student.id), plans };
  });
}

/**
 * Does this student have a plan for the exam date, and how far along is it? (read-only, from the redacted tree the
 * link-authorised route returns).
 * @returns {{ planned: boolean, plans: Array<{ name: string, ratio: number, done: number, total: number, late: number }>, ratio: number }}
 */
export function examPlanStatus(member, examDateId) {
  const documents = documentsOf(member);
  const attempts = joinAttempts(documents);
  const plans = documents.map((document) => parsePlan(document)).filter(Boolean)
    .filter((plan) => (plan.deadlines || []).some((deadline) => text(deadline.examDateId) === text(examDateId)))
    .map((plan) => {
      const progress = planProgress(plan, attempts);
      return { name: plan.name, ratio: progress.ratio, done: progress.done, total: progress.total, late: progress.late.length };
    });
  const total = plans.reduce((sum, plan) => sum + plan.total, 0);
  const done = plans.reduce((sum, plan) => sum + plan.done, 0);
  return { planned: plans.length > 0, plans, ratio: total ? done / total : 0 };
}
