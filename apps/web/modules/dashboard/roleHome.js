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
import { tEn } from "../../lib/i18n/index.js";

const text = (value) => String(value || "").trim();
const DAY = 86400000;
/** Someone with no activity for this many days, while they have work to do, is "behind". */
export const IDLE_DAYS_BEHIND = 7;
/** Overall mastery under this is "behind" even without a late step. */
export const LOW_MASTERY = 50;

const nameOf = (member, t = tEn) => text(member?.student?.displayName) || text(member?.student?.email) || t("people.studentFallback");
const documentsOf = (member) => (member?.workspaces || []).flatMap((workspace) => (workspace.subjects || []).flatMap((subject) => subject.documents || []));

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
export function standingOf(member, { now = Date.now() } = {}, t = tEn) {
  const documents = documentsOf(member);
  const attempts = joinAttempts(documents);
  const evidence = buildEvidence(attempts, { subjectOf: () => "", conceptsOf: () => [] });
  const topics = topicMastery(evidence);
  const plans = documents.map((document) => ({ document, plan: parsePlan(document) })).filter((row) => row.plan);
  const summary = planSummaryOf(plans.map((row) => row.plan), attempts);
  const planStatus = onTrackStatus(summary, new Date(now), t);
  const late = plans.reduce((sum, row) => sum + planProgress(row.plan, attempts).late.length, 0);
  const last = attempts.reduce((max, attempt) => (text(attempt.at) > max ? text(attempt.at) : max), "");
  const idleDays = last ? Math.max(0, Math.floor((now - new Date(last).getTime()) / DAY)) : null;
  const mastery = topics.length ? overallMastery(topics).mastery : null;
  const workLeft = Boolean(summary) && summary.done < summary.total;
  const reasons = [];
  if (late > 0) reasons.push(t.plural("people.reason.late", late));
  if (planStatus.label === "Behind" && !late) reasons.push(t("people.reason.planPassed"));
  if (idleDays !== null && idleDays >= IDLE_DAYS_BEHIND && workLeft) reasons.push(t("people.reason.idle", { days: idleDays }));
  if (mastery !== null && mastery < LOW_MASTERY) reasons.push(t("people.reason.mastery", { mastery }));
  const isNew = !attempts.length && !plans.length;
  const status = reasons.length ? "behind" : isNew ? "new" : "on-track";
  const dueThisWeek = upcoming(plans, attempts, 7).filter((entry) => entry.days >= 0);
  return { id: member?.student?.id || "", name: nameOf(member, t), status, reasons, late, idleDays, mastery, attempts: attempts.length, plans: plans.length, planStatus, weak: nextActions(topics, new Map(), 3), dueThisWeek };
}

/**
 * One card of "Your classes": a group (or the set of everyone connected) with who is behind, what is due this week
 * and the size. `members` are the group's members' trees.
 * @returns {{ key: string, name: string, size: number, behind: Array<{ id: string, name: string, reasons: string[] }>, due: Array<{ key: string, title: string, planName: string, days: number, date: string, students: number }>, headline: string }}
 */
export function classCardOf({ key = "", name = "Class", members = [], now = Date.now() } = {}, t = tEn) {
  const standings = members.map((member) => standingOf(member, { now }, t));
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
  const headline = !size ? t("people.headline.none") : behind.length ? t.plural("people.headline.behind", behind.length, { size }) : standings.every((entry) => entry.status === "new") ? t("people.headline.nothing") : t("people.headline.ok");
  return { key, name, size, behind, due, headline };
}

/** "Maths: 2 late steps" style line for a behind student, shortened for a card. */
export const behindLine = (entry) => `${entry.name} · ${entry.reasons.slice(0, 2).join(", ")}`;

/** The plain-language help panel for one weak topic. Built from the topic data (reason id, mastery), no AI call. */
export function howToHelp(action = {}, childName = "", t = tEn) {
  const who = childName || t("people.help.yourChild");
  const topic = text(action.topic) || t("people.help.thisTopic");
  const byReason = {
    coverage: [t("people.help.coverage.1", { who }), t("people.help.coverage.2")],
    knowledge: [t("people.help.knowledge.1", { who }), t("people.help.knowledge.2")],
    analytical: [t("people.help.analytical.1", { who }), t("people.help.analytical.2")],
    accuracy: [t("people.help.accuracy.1", { who }), t("people.help.accuracy.2")],
    accuracy_default: [t("people.help.accuracyDefault", { who })]
  };
  const key = action.reasonId && byReason[action.reasonId] ? action.reasonId : "accuracy_default";
  const level = Number(action.mastery);
  const lead = Number.isFinite(level) ? (level < 50 ? t("people.help.intro.finding", { who, topic }) : t("people.help.intro.unsure", { who, topic })) : t("people.help.intro.needs", { who, topic });
  return {
    title: t("people.help.title", { topic }),
    intro: `${lead}${Number.isFinite(level) ? ` (${t("people.help.intro.level", { level })})` : ""}. ${text(action.reason) ? `${t("people.help.intro.issue", { reason: text(action.reason).toLowerCase() })} ` : ""}${t("people.help.intro.noNeed")}`,
    steps: [...byReason[key], t("people.help.short", { count: Number(action.questions) || 6, topic })]
  };
}

/**
 * "Your child this week" for one child: on track or not, where they struggle, ONE way to help.
 * @returns {{ id: string, name: string, firstName: string, status: "on-track"|"behind"|"new", headline: string, detail: string, struggles: Array<{ topic: string, mastery: number, reason: string }>, help: ReturnType<typeof howToHelp> | null, dueThisWeek: number }}
 */
export function weeklySummaryOf(member, { now = Date.now() } = {}, t = tEn) {
  const standing = standingOf(member, { now }, t);
  const first = firstName(standing.name) || standing.name;
  const struggles = standing.weak.map((action) => ({ topic: action.topic, mastery: action.mastery, reason: action.reason }));
  let headline;
  let detail;
  if (standing.status === "new") {
    headline = t("people.week.new", { name: first });
    detail = t("people.week.newDetail");
  } else if (standing.status === "behind") {
    headline = t("people.week.behind", { name: first });
    detail = `${standing.reasons.slice(0, 2).join(" · ")}.`;
  } else {
    headline = t("people.week.ok", { name: first });
    detail = standing.planStatus.detail && standing.planStatus.tone !== "none" ? standing.planStatus.detail : standing.mastery !== null ? t("people.week.mastery", { mastery: standing.mastery }) : t("people.week.keepUp");
  }
  const help = standing.weak.length ? howToHelp(standing.weak[0], first, t) : null;
  return { id: standing.id, name: standing.name, firstName: first, status: standing.status, headline, detail, struggles, help, dueThisWeek: standing.dueThisWeek.length };
}
