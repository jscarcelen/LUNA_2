import { tEn } from "../../lib/i18n/index.js";

/**
 * Groups of students (pure: imported by the browser and the server; tests in tests/accounts/groups.test.js).
 *
 * A teacher or parent clusters the students they are connected to (teacher_student / parent_student, accepted) into
 * named groups; a student can be in many of them. A group is only a list of people: what the owner may see or send
 * is still decided by the accepted link with each student, every time (a student whose link ended is in no group
 * view and receives nothing, whatever the stored membership says).
 */

export const MAX_GROUP_MEMBERS = 200;
export const MAX_GROUPS_PER_OWNER = 50;
export const MAX_GROUP_NAME = 60;
/** What the members endpoint returns per page: a student's workspace is heavy, so a group is read in pages. */
export const MEMBERS_PAGE_SIZE = 10;
export const MAX_MEMBERS_PAGE_SIZE = 25;
/** A teacher / parent can send to at most this many people in one request (a group of 200 fits). */
export const MAX_BATCH_RECIPIENTS = 200;

export const GROUP_COLOURS = ["#0071e3", "#2f9e5b", "#b25e00", "#8e44ad", "#d7003a", "#0aa2c0", "#5c5c66"];
export const DEFAULT_GROUP_COLOUR = GROUP_COLOURS[0];

const text = (value) => String(value || "").trim();

export const normalizeGroupName = (name) => text(name).replace(/\s+/g, " ").slice(0, MAX_GROUP_NAME);

/** A colour from the palette (anything else becomes the default: the value ends up in a style attribute). */
export const normalizeColour = (colour) => (GROUP_COLOURS.includes(text(colour).toLowerCase()) ? text(colour).toLowerCase() : DEFAULT_GROUP_COLOUR);

/** Only teachers and parents have students to cluster. */
export const canOwnGroups = (role) => role === "teacher" || role === "parent";

/**
 * Who is a (current) member of each group: the stored memberships, cut down to the students the owner is still
 * connected to. This is the one place the "membership ends with the link" rule lives, so every view and every send
 * goes through it.
 * @param {Array<{ groupId: string, memberId: string }>} memberships stored rows
 * @param {Set<string>} linkedStudentIds students with an accepted teacher_student / parent_student link to the owner
 * @returns {Map<string, string[]>} group id -> member ids (stable order, no duplicates)
 */
export function activeMembership(memberships, linkedStudentIds) {
  const out = new Map();
  for (const row of memberships || []) {
    if (!linkedStudentIds?.has(row.memberId)) continue;
    const list = out.get(row.groupId) || [];
    if (!list.includes(row.memberId)) list.push(row.memberId);
    out.set(row.groupId, list);
  }
  return out;
}

/** The groups of one student (ids), from the same memberships. */
export function groupsOfMember(memberships, linkedStudentIds, memberId) {
  if (!linkedStudentIds?.has(memberId)) return [];
  return [...new Set((memberships || []).filter((row) => row.memberId === memberId).map((row) => row.groupId))];
}

/**
 * Turns "these groups + these individuals" into one list of people, each once (a student in two chosen groups, or
 * chosen as a group member and as an individual, is one recipient), and says why each is on it.
 * @param {object} args
 * @param {string[]} [args.groupIds]
 * @param {string[]} [args.individualIds]
 * @param {Map<string, { name: string, memberIds: string[] }>} args.groups the owner's groups with their CURRENT members
 * @param {Set<string>} [args.allowedIds] when given, anybody outside it is dropped and reported as `rejected` (not connected)
 * @returns {{ recipients: Array<{ id: string, via: string[], individual: boolean }>, rejected: string[], groupsUsed: Array<{ id: string, name: string, count: number }>, unknownGroups: string[] }}
 */
export function resolveRecipients({ groupIds = [], individualIds = [], groups, allowedIds = null }) {
  const byId = new Map();
  const rejected = [];
  const unknownGroups = [];
  const groupsUsed = [];
  const add = (id, via) => {
    if (!id) return;
    if (allowedIds && !allowedIds.has(id)) { if (!rejected.includes(id)) rejected.push(id); return; }
    const entry = byId.get(id) || { id, via: [], individual: false };
    if (via) { if (!entry.via.includes(via)) entry.via.push(via); } else entry.individual = true;
    byId.set(id, entry);
  };
  for (const groupId of [...new Set((groupIds || []).map(text).filter(Boolean))]) {
    const group = groups?.get?.(groupId);
    if (!group) { unknownGroups.push(groupId); continue; }
    groupsUsed.push({ id: groupId, name: group.name, count: group.memberIds.length });
    for (const memberId of group.memberIds) add(memberId, group.name);
  }
  for (const id of [...new Set((individualIds || []).map(text).filter(Boolean))]) add(id, "");
  return { recipients: [...byId.values()], rejected, groupsUsed, unknownGroups };
}

/** "Group A (12) + 2 individuals" — what the dialog says it is about to do. `individuals` counts people not already covered by a group. */
export function describeSelection({ groupsUsed = [], individuals = 0 }, t = tEn) {
  const parts = groupsUsed.map((group) => `${group.name} (${group.count})`);
  if (individuals > 0) parts.push(t.plural("people.sum.individuals", individuals));
  return parts.join(" + ");
}

/** How many distinct people a selection reaches, and how many chosen individually are already in a chosen group. */
export function selectionStats({ groupIds = [], individualIds = [], groups }, t = tEn) {
  const { recipients, groupsUsed } = resolveRecipients({ groupIds, individualIds, groups });
  const onlyIndividual = recipients.filter((entry) => entry.individual && !entry.via.length).length;
  return { people: recipients.length, individuals: onlyIndividual, groupsUsed, line: describeSelection({ groupsUsed, individuals: onlyIndividual }, t) };
}

/* ------------------------------------------------------------------ results of a batch */

export const SKIP_REASONS = ["not_connected", "already_has_it", "failed"];

/** The way a per-person failure is reported: 403/404 mean the connection is not (or no longer) there. */
export function skipReasonOf(result) {
  if (result?.reason && SKIP_REASONS.includes(result.reason)) return result.reason;
  const status = Number(result?.status) || 0;
  return status === 403 || status === 404 ? "not_connected" : "failed";
}

/**
 * The summary of a batch: `{ delivered, skipped: { not_connected, already_has_it, failed }, deferred, total }`.
 * A result is `{ recipientId, ok, ... }`; `ok` with `alreadyHadIt` counts as skipped (nothing new was sent);
 * `deferred: true` (the time budget ran out before it was reached) is neither.
 */
export function summarizeResults(results) {
  const summary = { delivered: 0, skipped: { not_connected: 0, already_has_it: 0, failed: 0 }, deferred: 0, total: (results || []).length };
  for (const result of results || []) {
    if (result.deferred) summary.deferred += 1;
    else if (result.ok && result.alreadyHadIt) summary.skipped.already_has_it += 1;
    else if (result.ok) summary.delivered += 1;
    else summary.skipped[skipReasonOf(result)] += 1;
  }
  return summary;
}

/** One line for the dialog: "Delivered to 11 · skipped: 1 not connected any more, 1 already had it". */
export function summaryLine(summary, t = tEn) {
  const skipped = [
    summary.skipped.not_connected ? t("people.sum.notConnected", { count: summary.skipped.not_connected }) : "",
    summary.skipped.already_has_it ? t("people.sum.alreadyHad", { count: summary.skipped.already_has_it }) : "",
    summary.skipped.failed ? t("people.sum.failed", { count: summary.skipped.failed }) : ""
  ].filter(Boolean);
  const head = t.plural("people.sum.delivered", summary.delivered);
  return `${head}${skipped.length ? ` · ${t("people.sum.skipped", { list: skipped.join(", ") })}` : ""}${summary.deferred ? ` · ${t("people.sum.deferred", { count: summary.deferred })}` : ""}`;
}

/**
 * Runs `worker(item)` for every item with at most `concurrency` at a time, and stops starting new ones once
 * `now() >= deadline`: the rest come back as `{ deferred: true }` so a request can answer in time and the caller
 * can send the remainder again. Results keep the input order. `worker` should not throw (a throw becomes a failure).
 */
export async function runPool(items, worker, { concurrency = 4, deadline = Infinity, now = () => Date.now() } = {}) {
  const results = new Array(items.length);
  let next = 0;
  async function lane() {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      if (now() >= deadline) { results[index] = { item: items[index], deferred: true }; continue; }
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        results[index] = { item: items[index], ok: false, reason: "failed", error: String(error?.message || error) };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length || 1)) }, lane));
  return results;
}

/* ------------------------------------------------------------------ groups inside a class */

/**
 * A teacher's class is a top-level group; inside it they can make smaller groups ("Readers", "Table 2"): a group with
 * `parentId`, whose members are always some of the class's members. Names stay unique per owner, so a group inside a
 * class is stored as "3B · Readers" (what the send dialogs and the Groups bar show) and drawn as "Readers" on the class
 * card. One level only: a group inside a class cannot hold groups of its own.
 */
export const SUBGROUP_SEPARATOR = " · ";
export const MAX_SUBGROUP_NAME = 30;

/** "3B" + "Readers" -> "3B · Readers", cut so the whole fits MAX_GROUP_NAME (the class part gives way first). */
export function subgroupStoredName(parentName, name) {
  const short = normalizeGroupName(name).slice(0, MAX_SUBGROUP_NAME).trim();
  if (!short) return "";
  const room = MAX_GROUP_NAME - short.length - SUBGROUP_SEPARATOR.length;
  const parent = normalizeGroupName(parentName).slice(0, Math.max(0, room)).trim();
  return parent ? `${parent}${SUBGROUP_SEPARATOR}${short}` : short;
}

/** The name drawn inside the class card: the stored name without "3B · ". */
export function subgroupShortName(storedName, parentName = "") {
  const stored = text(storedName);
  const parent = normalizeGroupName(parentName);
  if (parent && stored.startsWith(`${parent}${SUBGROUP_SEPARATOR}`)) return stored.slice(parent.length + SUBGROUP_SEPARATOR.length);
  const at = stored.indexOf(SUBGROUP_SEPARATOR);
  return at >= 0 ? stored.slice(at + SUBGROUP_SEPARATOR.length) : stored;
}

/**
 * The owner's groups as classes, each with the groups inside it (`subgroups`, each with `shortName`). A group whose
 * class is gone is shown as a class of its own (it never disappears).
 */
export function classesWithSubgroups(groups = []) {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const isChild = (group) => Boolean(group.parentId && byId.has(group.parentId));
  return groups.filter((group) => !isChild(group)).map((group) => ({
    ...group,
    subgroups: groups.filter((child) => isChild(child) && child.parentId === group.id).map((child) => ({ ...child, shortName: subgroupShortName(child.name, group.name) }))
  }));
}

/**
 * The per-student "Groups…" choice, kept consistent with classes: choosing a group inside a class also puts the student
 * in the class, and leaving a class takes them out of its groups.
 * @param {string[]} wanted the group ids ticked
 * @param {Array<{ id: string, parentId?: string }>} groups the owner's groups
 */
export function consistentGroupChoice(wanted, groups = []) {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const chosen = new Set(wanted || []);
  for (const id of [...chosen]) {
    const parent = byId.get(id)?.parentId;
    if (parent && byId.has(parent)) chosen.add(parent);
  }
  return [...chosen];
}
