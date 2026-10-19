/**
 * Pure view-models for the Home of a TEACHER ("Your classes") and a PARENT ("Your child this week"). Tested in
 * tests/dashboard/role-home.test.js. They read what a connection already lets the viewer read: the redacted
 * workspace tree of each connected student (`{ student: { id, displayName, email }, workspaces }`), as returned by
 * /api/accounts/linked/members and /api/accounts/linked/workspaces. No AI call, nothing is written.
 */
import { joinAttempts } from "../performance/metrics.js";
import { buildEvidence, nextActions, overallMastery, topicMastery } from "../performance/mastery.js";
import { onTrackStatus } from "../performance/headline.js";
import { parsePlan, planProgress, upcoming } from "../plans/plan.js";
import { firstName } from "./home.js";

const text = (value) => String(value || "").trim();
const DAY = 86400000;
/** Someone with no activity for this many days, while they have work to do, is "behind". */
export const IDLE_DAYS_BEHIND = 7;
/** Overall mastery under this is "behind" even without a late step. */
export const LOW_MASTERY = 50;

const nameOf = (member) => text(member?.student?.displayName) || text(member?.student?.email) || "Student";
const documentsOf = (member) => (member?.workspaces || []).flatMap((workspace) => (workspace.subjects || []).flatMap((subject) => subject.documents || []));
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The plan summary `onTrackStatus` reads, for the plan that matters most (the nearest deadline with work left). */
function planSummaryOf(plans, attempts) {
  const rows = plans.map((plan) => ({ plan, progress: planProgress(plan, attempts) })).filter((row) => row.progress.total > 0);
  const open = rows.filter((row) => row.progress.done < row.progress.total);
  const pool = open.length ? open : rows;
  pool.sort((a, b) => String(a.progress.deadline?.date || "9999").localeCompare(String(b.progress.deadline?.date || "9999")));
  const pick = pool[0];
  if (!pick) return null;
  return { name: pick.plan.name, deadline: pick.progress.deadline?.date || "", done: pick.progress.done, total: pick.progress.total, late: pick.progress.late.length };
}

/**
 * How one connected student stands: on track, behind (with the reasons, in words) or new (nothing to read yet).
 * @returns {{ id: string, name: string, status: "on-track"|"behind"|"new", reasons: string[], late: number, idleDays: number|null, mastery: number|null, attempts: number, plans: number, planStatus: object, weak: object[], dueThisWeek: object[] }}
 */
export function standingOf(member, { now = Date.now() } = {}) {
  const documents = documentsOf(member);
  const attempts = joinAttempts(documents);
  const evidence = buildEvidence(attempts, { subjectOf: () => "", conceptsOf: () => [] });
  const topics = topicMastery(evidence);
  const plans = documents.map((document) => ({ document, plan: parsePlan(document) })).filter((row) => row.plan);
  const summary = planSummaryOf(plans.map((row) => row.plan), attempts);
  const planStatus = onTrackStatus(summary, new Date(now));
  const late = plans.reduce((sum, row) => sum + planProgress(row.plan, attempts).late.length, 0);
  const last = attempts.reduce((max, attempt) => (text(attempt.at) > max ? text(attempt.at) : max), "");
  const idleDays = last ? Math.max(0, Math.floor((now - new Date(last).getTime()) / DAY)) : null;
  const mastery = topics.length ? overallMastery(topics).mastery : null;
  const workLeft = Boolean(summary) && summary.done < summary.total;
  const reasons = [];
  if (late > 0) reasons.push(`${plural(late, "late step")}`);
  if (planStatus.label === "Behind" && !late) reasons.push("plan date passed with steps left");
  if (idleDays !== null && idleDays >= IDLE_DAYS_BEHIND && workLeft) reasons.push(`no activity for ${idleDays} days`);
  if (mastery !== null && mastery < LOW_MASTERY) reasons.push(`mastery ${mastery}%`);
  const isNew = !attempts.length && !plans.length;
  const status = reasons.length ? "behind" : isNew ? "new" : "on-track";
  const dueThisWeek = upcoming(plans, attempts, 7).filter((entry) => entry.days >= 0);
  return { id: member?.student?.id || "", name: nameOf(member), status, reasons, late, idleDays, mastery, attempts: attempts.length, plans: plans.length, planStatus, weak: nextActions(topics, new Map(), 3), dueThisWeek };
}

/**
 * One card of "Your classes": a group (or the set of everyone connected) with who is behind, what is due this week
 * and the size. `members` are the group's members' trees.
 * @returns {{ key: string, name: string, size: number, behind: Array<{ id: string, name: string, reasons: string[] }>, due: Array<{ key: string, title: string, planName: string, days: number, date: string, students: number }>, headline: string }}
 */
export function classCardOf({ key = "", name = "Class", members = [], now = Date.now() } = {}) {
  const standings = members.map((member) => standingOf(member, { now }));
  const behind = standings.filter((entry) => entry.status === "behind").sort((a, b) => b.late - a.late || (b.idleDays ?? 0) - (a.idleDays ?? 0)).map((entry) => ({ id: entry.id, name: entry.name, reasons: entry.reasons }));
  const dueMap = new Map();
  for (const entry of standings) {
    const seen = new Set();
    for (const item of entry.dueThisWeek) {
      const id = `${text(item.title)}|${item.dueDate}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const current = dueMap.get(id) || { key: id, title: text(item.title), planName: text(item.planName), days: item.days, date: item.dueDate, students: 0 };
      current.students += 1;
      dueMap.set(id, current);
    }
  }
  const due = [...dueMap.values()].sort((a, b) => a.days - b.days || b.students - a.students).slice(0, 4);
  const size = members.length;
  const headline = !size ? "No students yet" : behind.length ? `${behind.length} of ${size} ${behind.length === 1 ? "is" : "are"} behind` : standings.every((entry) => entry.status === "new") ? "Nothing to read yet" : "Everyone is on track";
  return { key, name, size, behind, due, headline };
}

/** "Maths: 2 late steps" style line for a behind student, shortened for a card. */
export const behindLine = (entry) => `${entry.name} · ${entry.reasons.slice(0, 2).join(", ")}`;

/** The plain-language help panel for one weak topic. Built from the topic data (reason id, mastery), no AI call. */
export function howToHelp(action = {}, childName = "your child") {
  const who = childName || "your child";
  const topic = text(action.topic) || "this topic";
  const byReason = {
    coverage: ["Ask " + who + " to do a short set on it this week; so far there is too little to tell how well it is known.", "Sit with them for the first five minutes, so starting is easy."],
    knowledge: ["Ask " + who + " to explain the idea to you in their own words. Where they get stuck is what to revisit.", "Have them go back to the notes or the explanation before doing more questions."],
    analytical: ["Ask " + who + " to work one example out loud, writing every step.", "Check the steps, not just the answer: a wrong step is usually in the same place each time."],
    accuracy: ["Ask " + who + " to underline what the question asks and re-read before handing in.", "Praise slow, careful answers: these are slips, not gaps."],
    accuracy_default: ["Ask " + who + " to redo the questions they got wrong and say why each answer is right."]
  };
  const key = action.reasonId && byReason[action.reasonId] ? action.reasonId : "accuracy_default";
  const level = Number(action.mastery);
  const how = Number.isFinite(level) ? (level < 50 ? "is finding" : "is still unsure about") : "needs support with";
  return {
    title: `How to help with ${topic}`,
    intro: `${who} ${how} ${topic}${Number.isFinite(level) ? ` (${level}% mastery)` : ""}. ${text(action.reason) ? `Main issue: ${text(action.reason).toLowerCase()}. ` : ""}You do not need to know the subject.`,
    steps: [...byReason[key], `Keep it short: ${Number(action.questions) || 6} questions a day is enough. Their teacher can also send practice on ${topic}.`]
  };
}

/**
 * "Your child this week" for one child: on track or not, where they struggle, ONE way to help.
 * @returns {{ id: string, name: string, firstName: string, status: "on-track"|"behind"|"new", headline: string, detail: string, struggles: Array<{ topic: string, mastery: number, reason: string }>, help: ReturnType<typeof howToHelp> | null, dueThisWeek: number }}
 */
export function weeklySummaryOf(member, { now = Date.now() } = {}) {
  const standing = standingOf(member, { now });
  const first = firstName(standing.name) || standing.name;
  const struggles = standing.weak.map((action) => ({ topic: action.topic, mastery: action.mastery, reason: action.reason }));
  let headline;
  let detail;
  if (standing.status === "new") {
    headline = `${first} has not started yet`;
    detail = "Once they do a first activity or have a study plan, this shows how the week is going.";
  } else if (standing.status === "behind") {
    headline = `${first} needs a little help this week`;
    detail = `${standing.reasons.slice(0, 2).join(" · ")}.`;
  } else {
    headline = `${first} is on track`;
    detail = standing.planStatus.detail && standing.planStatus.tone !== "none" ? standing.planStatus.detail : standing.mastery !== null ? `Overall mastery ${standing.mastery}%.` : "Keep it up.";
  }
  const help = standing.weak.length ? howToHelp(standing.weak[0], first) : null;
  return { id: standing.id, name: standing.name, firstName: first, status: standing.status, headline, detail, struggles, help, dueThisWeek: standing.dueThisWeek.length };
}
