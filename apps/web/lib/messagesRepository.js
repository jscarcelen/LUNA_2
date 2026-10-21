/**
 * Messages from a teacher (or parent) to their students and those students' parents (table `class_messages`), the
 * database side. Pure rules: modules/accounts/messages.js.
 *
 * Authorisation: the sender is the session. Students must be connected to the sender as their teacher / parent RIGHT
 * NOW (`listGuardianStudents`); a parent is reached only through a student the sender teaches, and only while that
 * parent is still connected to that student as their parent. Only a teacher can reach parents (a parent writes to
 * their own children). Parents are never named to the sender. A recipient reads only rows addressed to them and only
 * while those connections still hold. Ids in a request body are never trusted.
 *
 * Needs supabase/migrations/202610210001_class_messages.sql (a 503 `setupNeeded` naming it until then).
 */
import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "./supabaseClient.js";
import { LinkError, MESSAGES_MIGRATION, assertEmailVerified, isSetupNeededError, setupNeededBody } from "./accountsCore.js";
import { findAccountsByIds, listGuardianStudents } from "./accountsRepository.js";
import { resolveBatchRecipients, supportsGroups } from "./groupsRepository.js";
import { reserveDeliveries, recordDeliveries } from "./batchSend.js";
import { canOwnGroups } from "../modules/accounts/groups.js";
import { isLiveForRecipient, messageRecipients, normalizeMessageInput, shapeReceived, summarizeSent } from "../modules/accounts/messages.js";

const RECHECK_MISSING_MS = 15000;
let capability = { ok: null, checkedAt: 0 };

/** Has 202610210001 been applied? A "yes" is remembered, a "no" for 15 s (so applying it takes effect without a redeploy). */
export async function supportsMessages() {
  if (capability.ok === true) return true;
  if (capability.ok === false && Date.now() - capability.checkedAt < RECHECK_MISSING_MS) return false;
  const { error } = await createSupabaseAdminClient().from("class_messages").select("id").limit(1);
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

class MessagesSetupError extends LinkError {
  constructor() {
    super("setup_needed", `Messages need one database step: apply ${MESSAGES_MIGRATION} (Supabase SQL editor or MCP apply_migration), then reload.`, 503);
    this.setup = setupNeededBody(MESSAGES_MIGRATION);
  }
}

async function assertMessagesReady() {
  if (!(await supportsMessages())) throw new MessagesSetupError();
}

/* ------------------------------------------------------------------ who is connected to whom */

/**
 * Accepted teacher_student / parent_student links touching any of these accounts, as "a|b" keys in both directions.
 * One query, whatever the number of people.
 */
async function guardianPairs(client, accountIds) {
  const ids = [...new Set((accountIds || []).filter(Boolean))];
  const pairs = new Set();
  if (!ids.length) return { pairs, rows: [] };
  const list = ids.join(",");
  const { data, error } = await client
    .from("account_links")
    .select("requester_id, target_id, kind, status")
    .eq("status", "accepted")
    .in("kind", ["teacher_student", "parent_student"])
    .or(`requester_id.in.(${list}),target_id.in.(${list})`);
  if (error) throw error;
  for (const row of data || []) {
    if (!row.requester_id || !row.target_id) continue;
    pairs.add(`${row.requester_id}|${row.target_id}`);
    pairs.add(`${row.target_id}|${row.requester_id}`);
  }
  return { pairs, rows: data || [] };
}

/** student id -> the ids of the accounts connected to them as their parent (role checked on the accounts). */
async function parentsOf(client, studentIds) {
  const { rows } = await guardianPairs(client, studentIds);
  const wanted = new Set(studentIds);
  const candidates = rows.filter((row) => row.kind === "parent_student").map((row) => (wanted.has(row.requester_id) ? { student: row.requester_id, parent: row.target_id } : { student: row.target_id, parent: row.requester_id })).filter((entry) => wanted.has(entry.student));
  const people = await findAccountsByIds(candidates.map((entry) => entry.parent));
  const parents = new Set(people.filter((row) => row.role === "parent").map((row) => row.id));
  const map = new Map();
  for (const entry of candidates) {
    if (!parents.has(entry.parent)) continue;
    map.set(entry.student, [...new Set([...(map.get(entry.student) || []), entry.parent])]);
  }
  return map;
}

/* ------------------------------------------------------------------ sending */

/**
 * Sends one message to students and/or their parents.
 * @returns {Promise<{ batchId: string, rows: object[], summary: { students: number, parents: number, skipped: number }, groupsUsed: object[] }>}
 */
export async function sendMessage({ sender, input, groupIds = [], recipientIds = [] }) {
  assertEmailVerified(sender, "send a message");
  if (!canOwnGroups(sender.role)) throw new LinkError("not_allowed", "Only a teacher or a parent can send messages to students.", 403);
  await assertMessagesReady();
  const checked = normalizeMessageInput(input);
  if (!checked.ok) throw new LinkError("bad_request", checked.error);
  // A parent writes to their own children; only a teacher reaches parents.
  const toParents = checked.value.toParents && sender.role === "teacher";
  if (!checked.value.toStudents && !toParents) throw new LinkError("bad_request", "Choose who gets the message.");

  const resolved = groupIds.length && (await supportsGroups())
    ? await resolveBatchRecipients(sender, { groupIds, individualIds: recipientIds })
    : { recipients: recipientIds.map((id) => ({ id, via: [] })), groupsUsed: [], unknownGroups: [] };
  if (resolved.unknownGroups?.length && !resolved.recipients.length) throw new LinkError("not_found", "That group was not found.", 404);
  const linked = new Set((await listGuardianStudents(sender)).map((student) => student.id));
  const studentIds = [...new Set(resolved.recipients.map((entry) => entry.id))].filter((id) => linked.has(id));
  const skipped = resolved.recipients.length - studentIds.length;
  if (!studentIds.length) throw new LinkError("bad_request", skipped ? "You can only write to students you are connected to as their teacher or parent." : "Choose at least one student or group.", skipped ? 403 : 400);

  const client = createSupabaseAdminClient();
  const parents = toParents ? await parentsOf(client, studentIds) : new Map();
  const targets = messageRecipients(studentIds, parents, { toStudents: checked.value.toStudents, toParents, senderId: sender.id });
  if (!targets.length) throw new LinkError("bad_request", "None of these students has a parent connected to Luna yet.");
  reserveDeliveries(sender.id, targets.length);

  const groupIdOf = new Map();
  for (const entry of resolved.recipients) {
    const group = (resolved.groupsUsed || []).find((candidate) => (entry.via || []).includes(candidate.name));
    if (group) groupIdOf.set(entry.id, group.id);
  }
  const batchId = randomUUID();
  const { data, error } = await client.from("class_messages").insert(targets.map((target) => ({
    batch_id: batchId,
    sender_id: sender.id,
    recipient_id: target.recipientId,
    about_student_id: target.aboutStudentId,
    audience: target.audience,
    group_id: groupIdOf.get(target.aboutStudentId) || null,
    subject: checked.value.subject,
    body: checked.value.body
  }))).select("*");
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [data];
  recordDeliveries(sender.id, rows.length);
  return {
    batchId,
    rows,
    groupsUsed: resolved.groupsUsed || [],
    summary: { students: rows.filter((row) => row.audience === "student").length, parents: rows.filter((row) => row.audience === "parent").length, skipped }
  };
}

/** The sender's messages, one entry per send (newest first, the last 100 sends). */
export async function listSentMessages(sender) {
  if (!(await supportsMessages())) return { supported: false, sent: [] };
  const client = createSupabaseAdminClient();
  const { data, error } = await client.from("class_messages").select("*").eq("sender_id", sender.id).is("revoked_at", null).order("created_at", { ascending: false }).limit(2000);
  if (error) throw error;
  const students = await listGuardianStudents(sender);
  const byId = new Map(students.map((student) => [student.id, student]));
  let groupNames = new Map();
  const groupIds = [...new Set((data || []).map((row) => row.group_id).filter(Boolean))];
  if (groupIds.length) {
    const { data: groups } = await client.from("account_groups").select("id, name").in("id", groupIds);
    groupNames = new Map((groups || []).map((group) => [group.id, group.name]));
  }
  return { supported: true, canReachParents: sender.role === "teacher", sent: summarizeSent(data || [], byId, groupNames).slice(0, 100) };
}

/** The sender deletes a send: nobody sees it any more. */
export async function deleteSentMessage(sender, batchId) {
  await assertMessagesReady();
  const id = String(batchId || "").trim();
  if (!id) throw new LinkError("bad_request", "Choose a message.");
  const client = createSupabaseAdminClient();
  const { data, error } = await client.from("class_messages").update({ revoked_at: new Date().toISOString() }).eq("sender_id", sender.id).eq("batch_id", id).is("revoked_at", null).select("id");
  if (error) throw error;
  if (!(data || []).length) throw new LinkError("not_found", "That message was not found.", 404);
  return { batchId: id, deleted: data.length };
}

/* ------------------------------------------------------------------ what the recipient sees */

/** Rows addressed to this account that are still live (not deleted, not hidden, connections still in place). */
export async function liveRowsFor(account, { limit = 100, since = "" } = {}) {
  if (!account?.id || !(await supportsMessages())) return [];
  const client = createSupabaseAdminClient();
  let query = client.from("class_messages").select("*").eq("recipient_id", account.id).is("revoked_at", null).is("hidden_at", null).order("created_at", { ascending: false }).limit(limit);
  if (since) query = query.gte("created_at", since);
  const { data, error } = await query;
  if (error) throw error;
  const rows = data || [];
  if (!rows.length) return [];
  const { pairs } = await guardianPairs(client, [...new Set(rows.map((row) => row.about_student_id))]);
  return rows.filter((row) => isLiveForRecipient(row, { connectedPairs: pairs }));
}

export async function listReceivedMessages(account) {
  if (!(await supportsMessages())) return { supported: false, messages: [] };
  const rows = await liveRowsFor(account);
  const people = await findAccountsByIds(rows.flatMap((row) => [row.sender_id, row.about_student_id]));
  const byId = new Map(people.map((row) => [row.id, row]));
  return { supported: true, messages: rows.map((row) => shapeReceived(row, { sender: byId.get(row.sender_id), aboutStudent: byId.get(row.about_student_id) })) };
}

/** The recipient has seen their messages (opening the bell or the Messages list). */
export async function markMessagesRead(account) {
  if (!account?.id || !(await supportsMessages())) return 0;
  const { data, error } = await createSupabaseAdminClient().from("class_messages").update({ read_at: new Date().toISOString() }).eq("recipient_id", account.id).is("read_at", null).select("id");
  if (error) throw error;
  return (data || []).length;
}

/** The recipient removes one message from their list. */
export async function hideMessage(account, messageId) {
  await assertMessagesReady();
  const id = String(messageId || "").trim();
  if (!id) throw new LinkError("bad_request", "Choose a message.");
  const { data, error } = await createSupabaseAdminClient().from("class_messages").update({ hidden_at: new Date().toISOString(), read_at: new Date().toISOString() }).eq("id", id).eq("recipient_id", account.id).select("id");
  if (error) throw error;
  if (!(data || []).length) throw new LinkError("not_found", "That message was not found.", 404);
  return { id };
}

/** The bell's lines for messages (last 30 days): "Prof. Rivera: Trip on Friday". Unread = not seen yet by this account. */
export async function messageEvents(account, { now = Date.now(), windowMs = 30 * 24 * 60 * 60 * 1000 } = {}) {
  const rows = await liveRowsFor(account, { limit: 20, since: new Date(now - windowMs).toISOString() });
  if (!rows.length) return [];
  const people = await findAccountsByIds(rows.flatMap((row) => [row.sender_id, row.about_student_id]));
  const byId = new Map(people.map((row) => [row.id, row]));
  return rows.map((row) => {
    const sender = byId.get(row.sender_id);
    return {
      id: `msg:${row.id}`,
      type: "message",
      messageId: row.id,
      at: row.created_at,
      person: { id: row.sender_id, displayName: sender?.display_name || "", role: sender?.role || "", email: sender?.email || "" },
      title: row.subject,
      body: String(row.body || "").slice(0, 600),
      aboutName: row.audience === "parent" ? byId.get(row.about_student_id)?.display_name || "" : "",
      unread: !row.read_at
    };
  });
}
