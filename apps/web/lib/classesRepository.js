/**
 * Classes with a join code, the database side. A class is an `account_groups` row (lib/groupsRepository.js) plus a
 * `class_codes` row holding its 6-letter code, an on/off switch and the teacher's school-consent confirmation.
 * Rules (pure) live in lib/classCodes.js. Authorisation:
 *  - only a teacher creates, lists, regenerates or switches off a class, and only their own (anything else is the same
 *    404 as for a class that does not exist);
 *  - only a student account joins with a code. Joining creates the teacher<->student link already accepted (the code
 *    is the teacher's standing invitation) and puts the student in the class group;
 *  - every wrong code counts against the address and the account (lib/accountLimits.js), so codes cannot be brute-forced;
 *  - an invalid code and a switched-off code give the same answer.
 * Needs supabase/migrations/202610140001_class_codes.sql (and the groups migration); without it every function throws a
 * ClassCodesSetupError (a 503 `setupNeeded` naming the file).
 */
import { randomInt } from "node:crypto";
import { CLASS_CODES_MIGRATION, LinkError, assertEmailVerified, isSetupNeededError, pairKey, setupNeededBody } from "./accountsCore.js";
import { limits } from "./accountLimits.js";
import { findAccountById } from "./accountsRepository.js";
import { MAX_GROUP_MEMBERS } from "../modules/accounts/groups.js";
import { createGroup, listGroups, supportsGroups } from "./groupsRepository.js";
import { CLASS_JOIN_MESSAGES, MAX_CODE_ATTEMPTS, decideClassJoin, generateClassCode, hasSchoolConsent, normalizeClassCode, studentAgeOf, validateClassCreation } from "./classCodes.js";
import { createSupabaseAdminClient } from "./supabaseClient.js";

const RECHECK_MISSING_MS = 15000;
let capability = { ok: null, checkedAt: 0 };

export function resetClassCodesCache() {
  capability = { ok: null, checkedAt: 0 };
}

/** Has 202610140001 been applied (and the groups migration it builds on)? A "yes" is remembered, a "no" for 15 s. */
export async function supportsClassCodes() {
  if (capability.ok === true) return true;
  if (capability.ok === false && Date.now() - capability.checkedAt < RECHECK_MISSING_MS) return false;
  const { error } = await createSupabaseAdminClient().from("class_codes").select("group_id").limit(1);
  if (!error) {
    const groups = await supportsGroups();
    capability = { ok: groups, checkedAt: Date.now() };
    return groups;
  }
  if (isSetupNeededError(error)) {
    capability = { ok: false, checkedAt: Date.now() };
    return false;
  }
  throw error;
}

export class ClassCodesSetupError extends LinkError {
  constructor(what = "Class codes") {
    super("setup_needed", `${what} need one database step: apply ${CLASS_CODES_MIGRATION} (Supabase SQL editor or MCP apply_migration), then reload.`, 503);
    this.setup = setupNeededBody(CLASS_CODES_MIGRATION);
  }
}

export async function assertClassCodesReady(what) {
  if (!(await supportsClassCodes())) throw new ClassCodesSetupError(what);
}

const classFromRows = (group, row, members = []) => ({
  id: group.id,
  name: group.name,
  code: row.code,
  enabled: row.enabled !== false,
  schoolConsent: Boolean(row.school_consent_at && row.school_consent_by),
  schoolConsentAt: row.school_consent_at || "",
  members
});

function assertTeacher(owner) {
  if (!owner?.id || owner.role !== "teacher") throw new LinkError("not_allowed", "Only a teacher can manage a class code.", 403);
}

function throttleWrite(owner) {
  if (limits.classWritesBySender.isBlocked(owner.id)) throw new LinkError("rate_limited", "You are changing classes very quickly. Try again in a few minutes.", 429);
  limits.classWritesBySender.fail(owner.id);
}

/** Inserts a fresh unique code for a class (new row or replacement), retrying on the rare collision. */
async function withUniqueCode(write) {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const code = generateClassCode((max) => randomInt(max));
    const { error } = await write(code);
    if (!error) return code;
    if (error.code !== "23505") throw error;
  }
  throw new LinkError("code_busy", "Could not find a free code. Try again.", 503);
}

/** The teacher's classes (groups that have a code) with their CURRENT members. */
export async function listClasses(owner) {
  assertTeacher(owner);
  await assertClassCodesReady();
  const client = createSupabaseAdminClient();
  const { groups, students } = await listGroups(owner);
  if (!groups.length) return { classes: [] };
  const { data, error } = await client.from("class_codes").select("*").eq("owner_id", owner.id);
  if (error) throw error;
  const codes = new Map((data || []).map((row) => [row.group_id, row]));
  const byId = new Map(students.map((student) => [student.id, student]));
  const classes = groups
    .filter((group) => codes.has(group.id))
    .map((group) => classFromRows(group, codes.get(group.id), group.memberIds.map((id) => byId.get(id)).filter(Boolean).map((student) => ({ id: student.id, displayName: student.displayName || "", email: student.email || "" }))));
  return { classes };
}

/** Creates the class group and its code. `schoolConsent` is stored only when it is literally true, with the teacher and the time. */
export async function createClass(owner, input) {
  assertTeacher(owner);
  assertEmailVerified(owner, "create a class");
  await assertClassCodesReady();
  const checked = validateClassCreation(input);
  if (!checked.ok) throw new LinkError("bad_request", checked.error);
  throttleWrite(owner);
  const group = await createGroup(owner, { name: checked.name });
  const client = createSupabaseAdminClient();
  const now = new Date().toISOString();
  try {
    await withUniqueCode((code) => client.from("class_codes").insert({
      group_id: group.id,
      owner_id: owner.id,
      code,
      enabled: true,
      school_consent_at: checked.schoolConsent ? now : null,
      school_consent_by: checked.schoolConsent ? owner.id : null
    }));
  } catch (error) {
    await client.from("account_groups").delete().eq("id", group.id); // no class without a code
    throw error;
  }
  return listClasses(owner);
}

async function ownedClass(client, owner, groupId) {
  const id = String(groupId || "").trim();
  if (!id) throw new LinkError("bad_request", "Choose a class.");
  const { data, error } = await client.from("class_codes").select("*").eq("group_id", id).maybeSingle();
  if (error) throw error;
  if (!data || data.owner_id !== owner.id) throw new LinkError("not_found", "That class was not found.", 404);
  return data;
}

/** A new code for the class; the old one stops working at once. */
export async function regenerateClassCode(owner, groupId) {
  assertTeacher(owner);
  await assertClassCodesReady();
  throttleWrite(owner);
  const client = createSupabaseAdminClient();
  const row = await ownedClass(client, owner, groupId);
  await withUniqueCode((code) => client.from("class_codes").update({ code, updated_at: new Date().toISOString() }).eq("group_id", row.group_id));
  return listClasses(owner);
}

/** Switch joining on or off without changing the code or removing anyone. */
export async function setClassEnabled(owner, groupId, enabled) {
  assertTeacher(owner);
  await assertClassCodesReady();
  throttleWrite(owner);
  const client = createSupabaseAdminClient();
  const row = await ownedClass(client, owner, groupId);
  const { error } = await client.from("class_codes").update({ enabled: enabled === true, updated_at: new Date().toISOString() }).eq("group_id", row.group_id);
  if (error) throw error;
  return listClasses(owner);
}

/* ------------------------------------------------------------------ students entering a code */

function guardGuesses(keys) {
  if (keys.some((key) => key.limiter.isBlocked(key.id))) throw new LinkError("rate_limited", CLASS_JOIN_MESSAGES.rate_limited, 429);
}

/** The class a code opens (with its teacher), or null. Records a wrong guess against the address and the account. */
async function findClassByCode(rawCode, { address, accountId }) {
  const keys = [{ limiter: limits.classCodeGuessesByAddress, id: address || "unknown" }];
  if (accountId) keys.push({ limiter: limits.classCodeGuessesByAccount, id: accountId });
  guardGuesses(keys);
  const code = normalizeClassCode(rawCode);
  let row = null;
  if (code) {
    const { data, error } = await createSupabaseAdminClient().from("class_codes").select("*").eq("code", code).maybeSingle();
    if (error) throw error;
    row = data;
  }
  if (!row || row.enabled === false) for (const key of keys) key.limiter.fail(key.id);
  return row;
}

const rowForDecision = (row) => (row ? { enabled: row.enabled !== false, schoolConsentAt: row.school_consent_at, schoolConsentBy: row.school_consent_by } : null);

/**
 * Sign-up pre-check (no account yet): is the code valid, and does its class carry the school's consent? Answers only
 * what the sign-up screen needs: never the class name or the teacher.
 * @returns {Promise<{ valid: boolean, schoolConsent: boolean }>}
 */
export async function checkClassCode(rawCode, { address }) {
  await assertClassCodesReady();
  const row = await findClassByCode(rawCode, { address });
  return { valid: Boolean(row && row.enabled !== false), schoolConsent: Boolean(row && row.enabled !== false && hasSchoolConsent({ schoolConsentAt: row.school_consent_at, schoolConsentBy: row.school_consent_by })) };
}

/**
 * Validates a code for a student about to sign up (called BEFORE the account is created so a wrong code never leaves
 * a half-made account). `age` is the student's age from the birth date.
 * @returns {Promise<{ row: object, approval: "none" | "school" }>} throws LinkError otherwise
 */
export async function assertCanJoinOnSignup(rawCode, { age, address }) {
  await assertClassCodesReady();
  const row = await findClassByCode(rawCode, { address });
  const decision = decideClassJoin({ age, classRow: rowForDecision(row) });
  if (!decision.ok) {
    const error = new LinkError(decision.code, CLASS_JOIN_MESSAGES[decision.code], decision.code === "needs_guardian" ? 403 : 404);
    error.needsGuardian = Boolean(decision.needsGuardian);
    throw error;
  }
  return { row, approval: decision.approval };
}

/** Teacher<->student link, already accepted (the code is the teacher's invitation). Re-uses a pending / declined / revoked row. */
async function ensureAcceptedLink(client, teacher, student) {
  const key = pairKey("teacher_student", teacher.email, student.email);
  const now = new Date().toISOString();
  const { data: existing, error: readError } = await client.from("account_links").select("id, status").eq("pair_key", key).maybeSingle();
  if (readError) throw readError;
  if (existing?.status === "accepted") return;
  const fields = { requester_id: teacher.id, requester_email: teacher.email, target_id: student.id, target_email: student.email, status: "accepted", responded_at: now };
  if (existing) {
    const { error } = await client.from("account_links").update(fields).eq("id", existing.id);
    if (error) throw error;
    return;
  }
  const { error } = await client.from("account_links").insert({ kind: "teacher_student", pair_key: key, ...fields });
  if (error && error.code !== "23505") throw error;
}

/**
 * Connects the student to the class's teacher and adds them to the class group. `row` is the class_codes row found by
 * `assertCanJoinOnSignup` / `findClassByCode`. Idempotent.
 * @returns {Promise<{ className: string, teacherName: string, approval: string }>}
 */
export async function joinClassWithRow(student, row, approval) {
  if (student?.role !== "student") throw new LinkError("teacher_only", CLASS_JOIN_MESSAGES.teacher_only, 403);
  const client = createSupabaseAdminClient();
  const teacher = await findAccountById(row.owner_id);
  if (!teacher || teacher.role !== "teacher") throw new LinkError("invalid_code", CLASS_JOIN_MESSAGES.invalid_code, 404);
  const { data: group, error: groupError } = await client.from("account_groups").select("id, name").eq("id", row.group_id).maybeSingle();
  if (groupError) throw groupError;
  if (!group) throw new LinkError("invalid_code", CLASS_JOIN_MESSAGES.invalid_code, 404);
  const { data: members, error: membersError } = await client.from("account_group_members").select("member_id").eq("group_id", group.id);
  if (membersError) throw membersError;
  const already = (members || []).some((member) => member.member_id === student.id);
  if (!already && (members || []).length >= MAX_GROUP_MEMBERS) throw new LinkError("class_full", `This class is full (${MAX_GROUP_MEMBERS} students). Ask your teacher.`, 409);
  await ensureAcceptedLink(client, teacher, student);
  if (!already) {
    const { error } = await client.from("account_group_members").insert({ group_id: group.id, member_id: student.id });
    if (error && error.code !== "23505") throw error;
  }
  const { error: joinError } = await client.from("class_joins").upsert({ group_id: group.id, student_id: student.id, school_consent: approval === "school" }, { onConflict: "group_id,student_id" });
  if (joinError) throw joinError;
  return { className: group.name, teacherName: teacher.display_name || "", approval };
}

/** A logged-in student types a code in People. */
export async function joinClassByCode(student, rawCode, { address, now = new Date() } = {}) {
  if (student?.role !== "student") throw new LinkError("teacher_only", CLASS_JOIN_MESSAGES.teacher_only, 403);
  await assertClassCodesReady();
  const row = await findClassByCode(rawCode, { address, accountId: student.id });
  const decision = decideClassJoin({ age: studentAgeOf(student, now), classRow: rowForDecision(row) });
  if (!decision.ok) throw new LinkError(decision.code, CLASS_JOIN_MESSAGES[decision.code], decision.code === "needs_guardian" ? 403 : 404);
  return joinClassWithRow(student, row, decision.approval);
}
