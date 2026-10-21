/**
 * Groups of students (a teacher or parent clusters the students they are connected to), the database side.
 * The rules live in modules/accounts/groups.js (pure). Everything is decided from the logged-in account:
 *
 *  - only the owner sees or changes a group (any other account gets the same 404 as for a group that does not exist);
 *  - a member must be a student the owner is connected to as their teacher / parent, accepted, AT ALL TIMES:
 *    membership is checked against the live links on every read (`currentMembers`), not only when it is written, so a
 *    student whose link ended is in no group view and receives nothing sent to the group;
 *  - a group holds at most 200 students, an owner has at most 50 groups.
 *
 * Needs supabase/migrations/202610070001_groups_exam_dates.sql; without it every function throws a GroupsSetupError
 * (a 503 `setupNeeded` naming the file).
 */
import { createSupabaseAdminClient } from "./supabaseClient.js";
import { GROUPS_MIGRATION, LinkError, SUBGROUPS_MIGRATION, isSetupNeededError, setupNeededBody } from "./accountsCore.js";
import { limits } from "./accountLimits.js";
import { findAccountsByIds, listGuardianStudents } from "./accountsRepository.js";
import {
  MAX_GROUPS_PER_OWNER,
  MAX_GROUP_MEMBERS,
  activeMembership,
  canOwnGroups,
  consistentGroupChoice,
  groupsOfMember,
  normalizeColour,
  normalizeGroupName,
  resolveRecipients,
  subgroupShortName,
  subgroupStoredName
} from "../modules/accounts/groups.js";

/* ------------------------------------------------------------------ is the migration applied? */

const RECHECK_MISSING_MS = 15000;
let capability = { ok: null, checkedAt: 0 };

export function resetGroupsCache() {
  capability = { ok: null, checkedAt: 0 };
}

/** Has 202610070001 been applied? A "yes" is remembered, a "no" for 15 s (so applying it takes effect without a redeploy). */
export async function supportsGroups() {
  if (capability.ok === true) return true;
  if (capability.ok === false && Date.now() - capability.checkedAt < RECHECK_MISSING_MS) return false;
  const { error } = await createSupabaseAdminClient().from("account_groups").select("id").limit(1);
  if (!error) {
    capability = { ok: true, checkedAt: Date.now() };
    return true;
  }
  if (isSetupNeededError(error)) {
    capability = { ok: false, checkedAt: Date.now() };
    return false;
  }
  throw error;
}

export class GroupsSetupError extends LinkError {
  constructor(what = "Groups and exam dates") {
    super("setup_needed", `${what} need one database step: apply ${GROUPS_MIGRATION} (Supabase SQL editor or MCP apply_migration), then reload.`, 503);
    this.setup = setupNeededBody(GROUPS_MIGRATION);
  }
}

export async function assertGroupsReady(what) {
  if (!(await supportsGroups())) throw new GroupsSetupError(what);
}

/* Groups inside a class need 202610210002 (the parent_group_id column); everything else works without it. */
let subgroupCapability = { ok: null, checkedAt: 0 };

export function resetSubgroupsCache() {
  subgroupCapability = { ok: null, checkedAt: 0 };
}

const missingColumn = (error) => /42703|PGRST204/.test(String(error?.code || "")) || /parent_group_id/.test(String(error?.message || ""));

export async function supportsSubgroups() {
  if (subgroupCapability.ok === true) return true;
  if (subgroupCapability.ok === false && Date.now() - subgroupCapability.checkedAt < RECHECK_MISSING_MS) return false;
  const { error } = await createSupabaseAdminClient().from("account_groups").select("parent_group_id").limit(1);
  if (!error) {
    subgroupCapability = { ok: true, checkedAt: Date.now() };
    return true;
  }
  if (missingColumn(error) || isSetupNeededError(error)) {
    subgroupCapability = { ok: false, checkedAt: Date.now() };
    return false;
  }
  throw error;
}

async function assertSubgroupsReady() {
  if (await supportsSubgroups()) return;
  const error = new LinkError("setup_needed", `Groups inside a class need one database step: apply ${SUBGROUPS_MIGRATION} (Supabase SQL editor or MCP apply_migration), then reload.`, 503);
  error.setup = setupNeededBody(SUBGROUPS_MIGRATION);
  throw error;
}

/* ------------------------------------------------------------------ reading */

const groupFromRow = (row) => ({ id: row.id, ownerId: row.owner_id, name: row.name, colour: row.colour || "", parentId: row.parent_group_id || "", createdAt: row.created_at || "" });

function assertOwner(owner) {
  if (!owner?.id || !canOwnGroups(owner.role)) throw new LinkError("not_allowed", "Only a teacher or a parent can group students.", 403);
}

async function selectGroupRows(client, ownerId) {
  const { data, error } = await client.from("account_groups").select("*").eq("owner_id", ownerId).order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function selectMemberships(client, groupIds) {
  if (!groupIds.length) return [];
  const { data, error } = await client.from("account_group_members").select("*").in("group_id", groupIds);
  if (error) throw error;
  return (data || []).map((row) => ({ groupId: row.group_id, memberId: row.member_id, addedAt: row.added_at || "" }));
}

/**
 * The owner's groups with their CURRENT members (stored memberships cut down to students still connected) and
 * the students themselves. This is what the page draws and what a send resolves through.
 * @returns {Promise<{ groups: Array<{ id, name, colour, memberIds: string[], memberCount: number }>, students: object[] }>}
 */
export async function listGroups(owner) {
  assertOwner(owner);
  await assertGroupsReady();
  const client = createSupabaseAdminClient();
  const [rows, students] = await Promise.all([selectGroupRows(client, owner.id), listGuardianStudents(owner)]);
  const memberships = await selectMemberships(client, rows.map((row) => row.id));
  const linked = new Set(students.map((student) => student.id));
  const active = activeMembership(memberships, linked);
  return {
    groups: rows.map((row) => ({ ...groupFromRow(row), memberIds: active.get(row.id) || [], memberCount: (active.get(row.id) || []).length })),
    students
  };
}

/** One of the owner's groups, or a 404 (the same for a group that is someone else's and one that does not exist). */
async function ownedGroup(client, owner, groupId) {
  const id = String(groupId || "").trim();
  if (!id) throw new LinkError("bad_request", "Choose a group.");
  const { data, error } = await client.from("account_groups").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data || data.owner_id !== owner.id) throw new LinkError("not_found", "That group was not found.", 404);
  return data;
}

/** group id -> { name, colour, memberIds } for the owner's groups (current members only): what `resolveRecipients` takes. */
export async function groupsMapFor(owner) {
  if (!canOwnGroups(owner?.role) || !(await supportsGroups())) return new Map();
  const { groups } = await listGroups(owner);
  return new Map(groups.map((group) => [group.id, { name: group.name, colour: group.colour, memberIds: group.memberIds }]));
}

/**
 * "These groups + these individuals" -> one list of people (see modules/accounts/groups.js). A group id that is not
 * the owner's is reported in `unknownGroups` and contributes nobody.
 */
export async function resolveBatchRecipients(owner, { groupIds = [], individualIds = [] }) {
  const wantsGroups = (groupIds || []).length > 0;
  const groups = wantsGroups ? await groupsMapFor(owner) : new Map();
  return resolveRecipients({ groupIds, individualIds, groups });
}

/* ------------------------------------------------------------------ writing */

async function assertLinkedStudents(owner, memberIds) {
  const students = await listGuardianStudents(owner);
  const linked = new Set(students.map((student) => student.id));
  const wanted = [...new Set((memberIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  const refused = wanted.filter((id) => !linked.has(id));
  if (refused.length) throw new LinkError("not_connected", "You can only group students you are connected to as their teacher or parent.", 403);
  return wanted;
}

function throttle(owner) {
  if (limits.groupWritesBySender.isBlocked(owner.id)) throw new LinkError("rate_limited", "You are changing groups very quickly. Try again in a few minutes.", 429);
  limits.groupWritesBySender.fail(owner.id);
}

/** The class a group inside a class belongs to: one of the owner's top-level groups, or a 404. */
async function parentClass(client, owner, parentId) {
  const parent = await ownedGroup(client, owner, parentId);
  if (parent.parent_group_id) throw new LinkError("bad_request", "A group inside a class cannot hold groups of its own.", 400);
  return parent;
}

/** The class's current members (only they can be in a group inside it). */
async function currentMemberIds(client, owner, groupId) {
  const students = await listGuardianStudents(owner);
  const memberships = await selectMemberships(client, [groupId]);
  return new Set(activeMembership(memberships, new Set(students.map((student) => student.id))).get(groupId) || []);
}

function assertInClass(memberIds, classMembers) {
  if ((memberIds || []).some((id) => !classMembers.has(id))) throw new LinkError("not_in_class", "Only students in this class can be in its groups.", 400);
}

export async function createGroup(owner, { name, colour, memberIds = [], parentId = "" }) {
  assertOwner(owner);
  await assertGroupsReady();
  throttle(owner);
  const client = createSupabaseAdminClient();
  const parent = String(parentId || "").trim() ? (await assertSubgroupsReady(), await parentClass(client, owner, parentId)) : null;
  const clean = parent ? subgroupStoredName(parent.name, name) : normalizeGroupName(name);
  if (!clean) throw new LinkError("bad_request", "Give the group a name.");
  const existing = await selectGroupRows(client, owner.id);
  if (existing.length >= MAX_GROUPS_PER_OWNER) throw new LinkError("too_many", `You can have up to ${MAX_GROUPS_PER_OWNER} groups.`, 400);
  if (existing.some((row) => normalizeGroupName(row.name).toLowerCase() === clean.toLowerCase())) throw new LinkError("name_taken", "You already have a group with that name.", 409);
  const members = await assertLinkedStudents(owner, memberIds);
  if (members.length > MAX_GROUP_MEMBERS) throw new LinkError("too_many", `A group holds at most ${MAX_GROUP_MEMBERS} students.`, 400);
  if (parent) assertInClass(members, await currentMemberIds(client, owner, parent.id));
  const { data, error } = await client.from("account_groups").insert({ owner_id: owner.id, name: clean, colour: normalizeColour(colour), ...(parent ? { parent_group_id: parent.id } : {}) }).select("*").single();
  if (error) {
    if (error.code === "23505") throw new LinkError("name_taken", "You already have a group with that name.", 409);
    throw error;
  }
  if (members.length) {
    const { error: memberError } = await client.from("account_group_members").insert(members.map((memberId) => ({ group_id: data.id, member_id: memberId })));
    if (memberError) throw memberError;
  }
  return { ...groupFromRow(data), memberIds: members, memberCount: members.length };
}

export async function updateGroup(owner, groupId, { name, colour }) {
  assertOwner(owner);
  await assertGroupsReady();
  const client = createSupabaseAdminClient();
  const group = await ownedGroup(client, owner, groupId);
  const patch = { updated_at: new Date().toISOString() };
  const rows = await selectGroupRows(client, owner.id);
  const parent = group.parent_group_id ? rows.find((row) => row.id === group.parent_group_id) : null;
  // A class renamed from "3B" to "3C" keeps its groups' names in step ("3B · Readers" -> "3C · Readers").
  const children = rows.filter((row) => row.parent_group_id === group.id);
  const renamedChildren = [];
  if (name !== undefined) {
    const clean = parent ? subgroupStoredName(parent.name, name) : normalizeGroupName(name);
    if (!clean) throw new LinkError("bad_request", "Give the group a name.");
    for (const child of children) renamedChildren.push({ id: child.id, name: subgroupStoredName(clean, subgroupShortName(child.name, group.name)) });
    const taken = new Set(rows.filter((row) => row.id !== group.id && !children.some((child) => child.id === row.id)).map((row) => normalizeGroupName(row.name).toLowerCase()));
    if ([clean, ...renamedChildren.map((child) => child.name)].some((value) => taken.has(value.toLowerCase()))) throw new LinkError("name_taken", "You already have a group with that name.", 409);
    patch.name = clean;
  }
  if (colour !== undefined) patch.colour = normalizeColour(colour);
  const { error } = await client.from("account_groups").update(patch).eq("id", group.id);
  if (error) {
    if (error.code === "23505") throw new LinkError("name_taken", "You already have a group with that name.", 409);
    throw error;
  }
  for (const child of renamedChildren) {
    if (child.name === children.find((row) => row.id === child.id)?.name) continue;
    const { error: childError } = await client.from("account_groups").update({ name: child.name, updated_at: patch.updated_at }).eq("id", child.id);
    if (childError) throw childError;
  }
  return { ...groupFromRow({ ...group, ...patch }) };
}

/** Deleting a group never deletes (or disconnects) a student: only the grouping goes. */
export async function deleteGroup(owner, groupId) {
  assertOwner(owner);
  await assertGroupsReady();
  const client = createSupabaseAdminClient();
  const group = await ownedGroup(client, owner, groupId);
  // The groups inside a class go with it (the database cascades too; this keeps it explicit and works without it).
  const ids = [group.id, ...(await selectGroupRows(client, owner.id)).filter((row) => row.parent_group_id === group.id).map((row) => row.id)];
  const { error: memberError } = await client.from("account_group_members").delete().in("group_id", ids);
  if (memberError) throw memberError;
  const { error } = await client.from("account_groups").delete().in("id", ids);
  if (error) throw error;
  return { id: group.id };
}

export async function addMembers(owner, groupId, memberIds) {
  assertOwner(owner);
  await assertGroupsReady();
  const client = createSupabaseAdminClient();
  const group = await ownedGroup(client, owner, groupId);
  const wanted = await assertLinkedStudents(owner, memberIds);
  if (group.parent_group_id) assertInClass(wanted, await currentMemberIds(client, owner, group.parent_group_id));
  const stored = await selectMemberships(client, [group.id]);
  const students = await listGuardianStudents(owner);
  const linked = new Set(students.map((student) => student.id));
  const current = new Set((activeMembership(stored, linked).get(group.id) || []));
  const fresh = wanted.filter((id) => !current.has(id));
  if (current.size + fresh.length > MAX_GROUP_MEMBERS) throw new LinkError("too_many", `A group holds at most ${MAX_GROUP_MEMBERS} students.`, 400);
  // A stored row of a student whose link ended earlier and came back is simply re-used.
  const storedIds = new Set(stored.map((row) => row.memberId));
  const toInsert = fresh.filter((id) => !storedIds.has(id));
  if (toInsert.length) {
    const { error } = await client.from("account_group_members").insert(toInsert.map((memberId) => ({ group_id: group.id, member_id: memberId })));
    if (error) throw error;
  }
  return { added: fresh.length };
}

export async function removeMembers(owner, groupId, memberIds) {
  assertOwner(owner);
  await assertGroupsReady();
  const client = createSupabaseAdminClient();
  const group = await ownedGroup(client, owner, groupId);
  const ids = [...new Set((memberIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  if (!ids.length) return { removed: 0 };
  // Leaving a class also means leaving the groups inside it.
  const groupIds = [group.id, ...(await selectGroupRows(client, owner.id)).filter((row) => row.parent_group_id === group.id).map((row) => row.id)];
  const { error } = await client.from("account_group_members").delete().in("group_id", groupIds).in("member_id", ids);
  if (error) throw error;
  return { removed: ids.length };
}

/**
 * The per-student "Groups…" choice: the student ends up in exactly these of the owner's groups (and no other).
 * @returns {Promise<{ groupIds: string[] }>}
 */
export async function setMemberGroups(owner, memberId, groupIds) {
  assertOwner(owner);
  await assertGroupsReady();
  const [student] = await assertLinkedStudents(owner, [memberId]);
  if (!student) throw new LinkError("bad_request", "Choose a student.");
  const client = createSupabaseAdminClient();
  const rows = await selectGroupRows(client, owner.id);
  const mine = new Set(rows.map((row) => row.id));
  const picked = [...new Set((groupIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  if (picked.some((id) => !mine.has(id))) throw new LinkError("not_found", "That group was not found.", 404);
  // Ticking a group inside a class also puts the student in the class.
  const wanted = consistentGroupChoice(picked, rows.map((row) => ({ id: row.id, parentId: row.parent_group_id || "" })));
  const memberships = await selectMemberships(client, rows.map((row) => row.id));
  const has = new Set(memberships.filter((row) => row.memberId === student).map((row) => row.groupId));
  const students = await listGuardianStudents(owner);
  const linked = new Set(students.map((entry) => entry.id));
  const active = activeMembership(memberships, linked);
  for (const groupId of wanted.filter((id) => !has.has(id))) {
    if ((active.get(groupId) || []).length >= MAX_GROUP_MEMBERS) throw new LinkError("too_many", `A group holds at most ${MAX_GROUP_MEMBERS} students.`, 400);
    const { error } = await client.from("account_group_members").insert({ group_id: groupId, member_id: student });
    if (error) throw error;
  }
  const drop = [...has].filter((id) => !wanted.includes(id));
  if (drop.length) {
    const { error } = await client.from("account_group_members").delete().eq("member_id", student).in("group_id", drop);
    if (error) throw error;
  }
  return { groupIds: wanted };
}

/** The groups a student is in, among the owner's (current link required). */
export async function groupIdsOfStudent(owner, memberId) {
  assertOwner(owner);
  await assertGroupsReady();
  const client = createSupabaseAdminClient();
  const rows = await selectGroupRows(client, owner.id);
  const memberships = await selectMemberships(client, rows.map((row) => row.id));
  const students = await listGuardianStudents(owner);
  return groupsOfMember(memberships, new Set(students.map((student) => student.id)), memberId);
}

/**
 * A connection ended: the two stop being in each other's groups. (Reads already ignore such members; this keeps the
 * table tidy and means a re-connection does not silently bring the student back.) Best effort without the migration.
 */
export async function dropMembershipsBetween(accountA, accountB) {
  if (!accountA || !accountB || !(await supportsGroups())) return 0;
  const client = createSupabaseAdminClient();
  let removed = 0;
  for (const [owner, member] of [[accountA, accountB], [accountB, accountA]]) {
    const { data: groups, error } = await client.from("account_groups").select("id").eq("owner_id", owner);
    if (error) throw error;
    const ids = (groups || []).map((row) => row.id);
    if (!ids.length) continue;
    const { error: deleteError } = await client.from("account_group_members").delete().eq("member_id", member).in("group_id", ids);
    if (deleteError) throw deleteError;
    removed += ids.length;
  }
  return removed;
}

/* ------------------------------------------------------------------ the members' evidence, a page at a time */

const byName = (a, b) => String(a.displayName || a.email || "").localeCompare(String(b.displayName || b.email || ""));

/**
 * The members of a group (or an explicit list of students) with their workspaces, ONE PAGE at a time: a student's
 * tree is heavy, so a group is read in pages of `limit` students (the caller keeps asking while `hasMore`). Each
 * student is authorised on their own accepted guardian link (`linkedStudentWorkspaces`, the same privacy rules as
 * the single-student route: uploaded material and private notes reduced to names); one who is not connected is
 * counted in `skipped`, never returned. Pass `loadStudent` (the single-student reader) so this file stays free of
 * the workspace code.
 * @returns {Promise<{ members: Array<{ student: object, workspaces: object[] }>, total: number, offset: number, nextOffset: number, hasMore: boolean, skipped: number, group?: object }>}
 */
export async function groupMemberEvidence(owner, { groupId = "", studentIds = [], offset = 0, limit = 10 }, loadStudent) {
  assertOwner(owner);
  await assertGroupsReady();
  const client = createSupabaseAdminClient();
  const students = await listGuardianStudents(owner);
  const linked = new Map(students.map((student) => [student.id, student]));
  let ids;
  let group = null;
  if (groupId) {
    group = await ownedGroup(client, owner, groupId);
    const memberships = await selectMemberships(client, [group.id]);
    ids = (activeMembership(memberships, new Set(linked.keys())).get(group.id) || []);
  } else {
    ids = [...new Set((studentIds || []).map((id) => String(id || "").trim()).filter(Boolean))].slice(0, MAX_GROUP_MEMBERS);
  }
  const ordered = ids.map((id) => linked.get(id)).filter(Boolean).sort(byName);
  const skipped = ids.length - ordered.length;
  const start = Math.max(0, Number(offset) || 0);
  const size = Math.max(1, Math.min(Number(limit) || 10, 25));
  const slice = ordered.slice(start, start + size);
  const loaded = await Promise.all(slice.map(async (student) => {
    const result = await loadStudent(owner, student.id);
    return result || null;
  }));
  const members = loaded.filter(Boolean);
  const nextOffset = start + slice.length;
  return {
    members,
    total: ordered.length,
    offset: start,
    nextOffset,
    hasMore: nextOffset < ordered.length,
    skipped: skipped + (loaded.length - members.length),
    ...(group ? { group: { ...groupFromRow(group), memberCount: ordered.length } } : {})
  };
}

/** Public details for a list of ids (used by the sent lists). */
export async function peopleByIds(ids) {
  const rows = await findAccountsByIds(ids);
  return new Map(rows.map((row) => [row.id, { id: row.id, displayName: row.display_name || "", email: row.email || "", role: row.role || "" }]));
}
