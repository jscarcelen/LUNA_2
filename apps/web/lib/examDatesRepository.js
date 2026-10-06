/**
 * Exam dates sent to students (table `exam_dates`, plans linked to them in `exam_date_plans`), the database side.
 *
 * A teacher or parent sends a date (title, date, subject/topic name, notes) to students or groups they are connected
 * to as their teacher / parent. The recipient can plan for it: a study plan then carries a deadline that follows the
 * date and is locked (`deadline.setBy` = the sender, `deadline.examDateId`, modules/plans/deadlines.js). When the
 * sender changes the date the linked plans move with it; when the sender cancels it the plans keep the date as the
 * student's own deadline.
 *
 * Authorisation: the sender is the session; each recipient must be a student with an accepted teacher_student /
 * parent_student link to the sender RIGHT NOW (checked per recipient, per send); the recipient only ever reads rows
 * addressed to them and only from senders they are still connected to; ids in a request body are never trusted.
 *
 * Needs supabase/migrations/202610070001_groups_exam_dates.sql (a 503 `setupNeeded` naming it until then).
 */
import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "./supabaseClient.js";
import { LinkError, assertEmailVerified } from "./accountsCore.js";
import { limits } from "./accountLimits.js";
import { findAccountsByIds, listConnectedIds, listGuardianStudents } from "./accountsRepository.js";
import { assertGroupsReady, resolveBatchRecipients, supportsGroups } from "./groupsRepository.js";
import { displayContentOf } from "./workspaceGuard.js";
import { MAX_BATCH_RECIPIENTS, canOwnGroups, summarizeResults } from "../modules/accounts/groups.js";
import { normalizeExamInput, shapeForRecipient } from "../modules/accounts/examDates.js";
import { applyExamDateCancel, applyExamDateChange, examLinksIn, linkPlanToExamDate } from "../modules/plans/deadlines.js";

const parseJson = (text) => {
  try {
    const parsed = JSON.parse(String(text || ""));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const dayOf = (value) => String(value || "").slice(0, 10);

/** Does this database have the exam date tables (the same migration as groups)? */
export const supportsExamDates = supportsGroups;
export const assertExamDatesReady = () => assertGroupsReady("Exam dates");

/* ------------------------------------------------------------------ sending */

/**
 * Sends an exam date to students and groups.
 * @param {object} args
 * @param {object} args.sender the logged-in account row
 * @param {{ title: string, date: string, subjectHint?: string, notes?: string }} args.input
 * @param {string[]} [args.groupIds] the sender's groups (their CURRENT members receive it)
 * @param {string[]} [args.recipientIds] individual students
 * @param {string} [args.sharedDocumentId] a plan / material the sender shares live at the same time (already checked to be theirs)
 * @param {number} [args.now]
 * @returns {Promise<{ batchId: string, results: object[], summary: object, rows: object[] }>}
 *   per-person `results`: `{ recipientId, ok, alreadyHadIt?, reason?, status?, error?, examDateId? }`
 */
export async function sendExamDate({ sender, input, groupIds = [], recipientIds = [], sharedDocumentId = "", now = Date.now() }) {
  assertEmailVerified(sender, "send an exam date");
  if (!canOwnGroups(sender.role)) throw new LinkError("not_allowed", "Only a teacher or a parent can send an exam date.", 403);
  await assertExamDatesReady();
  const checked = normalizeExamInput(input, { today: new Date(now).toISOString().slice(0, 10) });
  if (!checked.ok) throw new LinkError("bad_request", checked.error);

  const resolved = await resolveBatchRecipients(sender, { groupIds, individualIds: recipientIds });
  if (resolved.unknownGroups.length && !resolved.recipients.length) throw new LinkError("not_found", "That group was not found.", 404);
  if (!resolved.recipients.length) throw new LinkError("bad_request", "Choose at least one student or group.");
  if (resolved.recipients.length > MAX_BATCH_RECIPIENTS) throw new LinkError("too_many", `You can send to at most ${MAX_BATCH_RECIPIENTS} people at once.`, 400);
  if (limits.batchDeliveriesBySender.remaining(sender.id) < resolved.recipients.length) {
    throw new LinkError("rate_limited", `You have sent a lot in the last hour. You can reach about ${limits.batchDeliveriesBySender.remaining(sender.id)} more people now; try again later.`, 429);
  }

  const client = createSupabaseAdminClient();
  const students = await listGuardianStudents(sender);
  const linked = new Set(students.map((student) => student.id));
  const groupIdByName = new Map((resolved.groupsUsed || []).map((group) => [group.name, group.id]));

  // Rows already sent (same sender, student, title and date, not cancelled): not sent twice.
  const { data: existingRows, error: existingError } = await client.from("exam_dates").select("*").eq("sender_id", sender.id);
  if (existingError) throw existingError;
  const already = new Set((existingRows || []).filter((row) => !row.revoked_at && String(row.title).toLowerCase() === checked.value.title.toLowerCase() && dayOf(row.exam_date) === checked.value.date).map((row) => row.recipient_id));

  const batchId = randomUUID();
  const results = [];
  const toInsert = [];
  for (const entry of resolved.recipients) {
    if (!linked.has(entry.id)) { results.push({ recipientId: entry.id, ok: false, reason: "not_connected", status: 403, error: "You can only send exam dates to students you are connected to as their teacher or parent." }); continue; }
    if (already.has(entry.id)) { results.push({ recipientId: entry.id, ok: true, alreadyHadIt: true }); continue; }
    toInsert.push({
      batch_id: batchId,
      sender_id: sender.id,
      recipient_id: entry.id,
      group_id: groupIdByName.get(entry.via[0]) || null,
      title: checked.value.title,
      exam_date: checked.value.date,
      subject_hint: checked.value.subjectHint || null,
      notes: checked.value.notes || null,
      shared_document_id: sharedDocumentId || null
    });
  }
  let rows = [];
  if (toInsert.length) {
    const { data, error } = await client.from("exam_dates").insert(toInsert).select("*");
    if (error) throw error;
    rows = Array.isArray(data) ? data : [data];
    for (const row of rows) results.push({ recipientId: row.recipient_id, ok: true, examDateId: row.id });
    for (let index = 0; index < rows.length; index += 1) limits.batchDeliveriesBySender.fail(sender.id);
  }
  return { batchId, results, summary: summarizeResults(results), rows, groupsUsed: resolved.groupsUsed };
}

/* ------------------------------------------------------------------ what the recipient sees */

/** Exam dates addressed to this account that are still live (not cancelled) and come from someone they are still connected to. */
export async function listForRecipient(account) {
  if (!(await supportsExamDates())) return { supported: false, examDates: [] };
  const client = createSupabaseAdminClient();
  const { data, error } = await client.from("exam_dates").select("*").eq("recipient_id", account.id).order("exam_date", { ascending: true });
  if (error) throw error;
  const live = (data || []).filter((row) => !row.revoked_at);
  const connected = await listConnectedIds(account.id);
  const visible = live.filter((row) => connected.has(row.sender_id));
  const senders = await findAccountsByIds(visible.map((row) => row.sender_id));
  const byId = new Map(senders.map((row) => [row.id, row]));
  const links = visible.length ? await selectPlanLinks(client, visible.map((row) => row.id)) : [];
  return {
    supported: true,
    examDates: visible.map((row) => ({ ...shapeForRecipient(row, { displayName: byId.get(row.sender_id)?.display_name }), linkedPlanIds: links.filter((link) => link.exam_date_id === row.id).map((link) => link.plan_document_id) }))
  };
}

/**
 * The live exam dates addressed to an account, by id, in the shape the workspace guard checks plan deadlines
 * against. (Cancelled ones are not included, so a plan cannot start following a cancelled date.)
 */
export async function loadExamDatesMap(accountId) {
  const map = new Map();
  if (!accountId || !(await supportsExamDates())) return map;
  const { data, error } = await createSupabaseAdminClient().from("exam_dates").select("*").eq("recipient_id", accountId);
  if (error) throw error;
  for (const row of data || []) if (!row.revoked_at) map.set(row.id, { senderId: row.sender_id, recipientId: row.recipient_id, date: dayOf(row.exam_date), revoked: false });
  return map;
}

async function selectPlanLinks(client, examDateIds) {
  if (!examDateIds.length) return [];
  const { data, error } = await client.from("exam_date_plans").select("*").in("exam_date_id", examDateIds);
  if (error) throw error;
  return data || [];
}

/** Hide an exam date from the card ("dismiss") or bring it back. */
export async function setDismissed(account, examDateId, dismissed) {
  await assertExamDatesReady();
  const client = createSupabaseAdminClient();
  const row = await ownRow(client, account, examDateId);
  const { error } = await client.from("exam_dates").update({ dismissed_at: dismissed ? new Date().toISOString() : null }).eq("id", row.id);
  if (error) throw error;
  return { id: row.id, dismissed: Boolean(dismissed) };
}

async function ownRow(client, account, examDateId) {
  const id = String(examDateId || "").trim();
  if (!id) throw new LinkError("bad_request", "Choose an exam date.");
  const { data, error } = await client.from("exam_dates").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data || data.recipient_id !== account.id || data.revoked_at) throw new LinkError("not_found", "That exam date was not found.", 404);
  const connected = await listConnectedIds(account.id);
  if (!connected.has(data.sender_id)) throw new LinkError("not_found", "That exam date was not found.", 404);
  return data;
}

/* ------------------------------------------------------------------ plans follow the date */

/** The student's own study-plan document (any topic of any of their workspaces), or null. */
async function ownedPlanDocument(client, accountId, documentId) {
  const { data: row, error } = await client.from("documents").select("*").eq("id", documentId).maybeSingle();
  if (error) throw error;
  if (!row) return null;
  const { data: subject, error: subjectError } = await client.from("subjects").select("id, workspace_id").eq("id", row.subject_id).maybeSingle();
  if (subjectError) throw subjectError;
  if (!subject) return null;
  const { data: workspace, error: workspaceError } = await client.from("workspaces").select("id, owner_user_id").eq("id", subject.workspace_id).maybeSingle();
  if (workspaceError) throw workspaceError;
  if (!workspace || workspace.owner_user_id !== accountId) return null;
  const plan = parseJson(displayContentOf(row.content));
  return plan?.kind === "study-plan" ? { row, plan } : null;
}

async function writePlan(client, row, plan) {
  const content = JSON.stringify({ ...plan, updatedAt: new Date().toISOString() }, null, 2);
  const next = (plan.deadlines || []).map((deadline) => deadline.date).filter(Boolean).sort()[0];
  const { error } = await client.from("documents").update({ content, preview: `${(plan.items || []).length} steps${next ? ` · ${next}` : ""}`, size_bytes: Buffer.byteLength(content, "utf8"), updated_at: new Date().toISOString() }).eq("id", row.id);
  if (error) throw error;
}

/**
 * Ties one of the student's plans to an exam date after the fact ("Use a teacher's exam date" on an existing plan):
 * the plan gets the locked deadline of that date. Done here, on the server, so the lock is real.
 */
export async function linkPlanToExam(account, examDateId, planDocumentId) {
  await assertExamDatesReady();
  const client = createSupabaseAdminClient();
  const row = await ownRow(client, account, examDateId);
  const owned = await ownedPlanDocument(client, account.id, String(planDocumentId || ""));
  if (!owned) throw new LinkError("not_found", "That study plan was not found in your workspace.", 404);
  const [sender] = await findAccountsByIds([row.sender_id]);
  const examDate = { id: row.id, title: row.title, date: dayOf(row.exam_date), senderId: row.sender_id, senderName: sender?.display_name || "" };
  await writePlan(client, owned.row, linkPlanToExamDate(owned.plan, examDate));
  await recordLinks(client, account.id, owned.row.id, [row.id]);
  return { examDateId: row.id, planDocumentId: owned.row.id };
}

async function recordLinks(client, accountId, planDocumentId, examDateIds) {
  const wanted = new Set(examDateIds);
  const { data: existing, error } = await client.from("exam_date_plans").select("*").eq("plan_document_id", planDocumentId);
  if (error) throw error;
  const have = new Set((existing || []).map((link) => link.exam_date_id));
  const stale = [...have].filter((id) => !wanted.has(id));
  if (stale.length) {
    const { error: deleteError } = await client.from("exam_date_plans").delete().eq("plan_document_id", planDocumentId).in("exam_date_id", stale);
    if (deleteError) throw deleteError;
  }
  const fresh = [...wanted].filter((id) => !have.has(id));
  if (fresh.length) {
    const { error: insertError } = await client.from("exam_date_plans").insert(fresh.map((id) => ({ exam_date_id: id, plan_document_id: planDocumentId })));
    if (insertError) throw insertError;
    const { error: acceptError } = await client.from("exam_dates").update({ accepted_at: new Date().toISOString() }).in("id", fresh).eq("recipient_id", accountId);
    if (acceptError) throw acceptError;
  }
}

/**
 * After a plan was saved (the workspace route calls this): keeps the links between the plan and the exam dates its
 * deadlines follow in step with what the plan now says. Best effort; never throws into the save.
 */
export async function syncPlanLinks(accountId, planDocumentId, content) {
  try {
    if (!accountId || !planDocumentId || !String(content || "").includes("examDateId")) return 0;
    if (!(await supportsExamDates())) return 0;
    const plan = parseJson(displayContentOf(content));
    if (!plan || plan.kind !== "study-plan") return 0;
    const client = createSupabaseAdminClient();
    const owned = await ownedPlanDocument(client, accountId, planDocumentId);
    if (!owned) return 0;
    const live = await loadExamDatesMap(accountId);
    const ids = examLinksIn(plan).filter((id) => live.has(id));
    await recordLinks(client, accountId, planDocumentId, ids);
    return ids.length;
  } catch (error) {
    console.warn("[exam-dates] could not link the plan:", error?.message || error);
    return 0;
  }
}

/**
 * The sender changed (`change`) or cancelled (`cancel`) the date: every plan linked to it follows. Returns how many
 * plans were rewritten. A plan that cannot be read any more is skipped, never an error for the sender.
 */
async function propagate(client, rows, mode, senderName) {
  let updated = 0;
  for (const row of rows) {
    const links = await selectPlanLinks(client, [row.id]);
    for (const link of links) {
      try {
        const { data: doc, error } = await client.from("documents").select("*").eq("id", link.plan_document_id).maybeSingle();
        if (error) throw error;
        const plan = doc ? parseJson(displayContentOf(doc.content)) : null;
        if (!plan || plan.kind !== "study-plan") continue;
        const examDate = { id: row.id, title: row.title, date: dayOf(row.exam_date), senderId: row.sender_id, senderName };
        const result = mode === "cancel" ? applyExamDateCancel(plan, examDate) : applyExamDateChange(plan, examDate);
        if (!result.changed) continue;
        await writePlan(client, doc, result.plan);
        updated += 1;
      } catch (problem) {
        console.warn("[exam-dates] could not update a linked plan:", problem?.message || problem);
      }
    }
    if (mode === "cancel" && links.length) {
      const { error } = await client.from("exam_date_plans").delete().eq("exam_date_id", row.id);
      if (error) throw error;
    }
  }
  return updated;
}

/* ------------------------------------------------------------------ what the sender sees and edits */

async function senderRows(client, sender, batchId) {
  const id = String(batchId || "").trim();
  if (!id) throw new LinkError("bad_request", "Choose an exam date.");
  const { data, error } = await client.from("exam_dates").select("*").eq("sender_id", sender.id).eq("batch_id", id);
  if (error) throw error;
  if (!data?.length) throw new LinkError("not_found", "That exam date was not found.", 404);
  return data;
}

/**
 * The sender's exam dates, one item per send, with who got it and whether each student has a plan for it (read from
 * the plan links; the completion percentage is read through the link-authorised performance routes by the page).
 */
export async function listSent(sender) {
  if (!canOwnGroups(sender?.role)) return { supported: true, items: [] };
  if (!(await supportsExamDates())) return { supported: false, items: [] };
  const client = createSupabaseAdminClient();
  const { data, error } = await client.from("exam_dates").select("*").eq("sender_id", sender.id).order("created_at", { ascending: false });
  if (error) throw error;
  const rows = data || [];
  const students = await listGuardianStudents(sender);
  const linked = new Map(students.map((student) => [student.id, student]));
  const links = rows.length ? await selectPlanLinks(client, rows.map((row) => row.id)) : [];
  const { data: groupRows } = await client.from("account_groups").select("id, name").eq("owner_id", sender.id);
  const groupName = new Map((groupRows || []).map((row) => [row.id, row.name]));
  const people = await findAccountsByIds(rows.map((row) => row.recipient_id));
  const personById = new Map(people.map((row) => [row.id, row]));
  const batches = new Map();
  for (const row of rows) {
    const batch = batches.get(row.batch_id) || { batchId: row.batch_id, title: row.title, date: dayOf(row.exam_date), subjectHint: row.subject_hint || "", notes: row.notes || "", sharedDocumentId: row.shared_document_id || "", createdAt: row.created_at, updatedAt: row.updated_at || row.created_at, cancelled: Boolean(row.revoked_at), groups: new Set(), recipients: [] };
    if (row.group_id && groupName.get(row.group_id)) batch.groups.add(groupName.get(row.group_id));
    const person = personById.get(row.recipient_id);
    const planIds = links.filter((link) => link.exam_date_id === row.id).map((link) => link.plan_document_id);
    batch.recipients.push({
      examDateId: row.id,
      id: row.recipient_id,
      displayName: person?.display_name || "",
      email: person?.email || "",
      connected: linked.has(row.recipient_id),
      planned: planIds.length > 0,
      planDocumentIds: planIds,
      dismissed: Boolean(row.dismissed_at)
    });
    batches.set(row.batch_id, batch);
  }
  const items = [...batches.values()].map((batch) => ({ ...batch, groups: [...batch.groups] })).sort((a, b) => (a.cancelled !== b.cancelled ? (a.cancelled ? 1 : -1) : a.date.localeCompare(b.date)));
  return { supported: true, items };
}

/**
 * The sender edits an exam date (title, date, subject, notes): every recipient's row changes and the plans linked
 * to it follow.
 * @returns {Promise<{ batchId: string, updatedRows: object[], plansUpdated: number, changedDate: boolean }>}
 */
export async function updateBatch(sender, batchId, patch) {
  if (!canOwnGroups(sender?.role)) throw new LinkError("not_allowed", "Only a teacher or a parent can change an exam date.", 403);
  await assertExamDatesReady();
  const client = createSupabaseAdminClient();
  const rows = (await senderRows(client, sender, batchId)).filter((row) => !row.revoked_at);
  if (!rows.length) throw new LinkError("gone", "That exam date was cancelled.", 409);
  const first = rows[0];
  const checked = normalizeExamInput({ title: patch?.title ?? first.title, date: patch?.date ?? dayOf(first.exam_date), subjectHint: patch?.subjectHint ?? first.subject_hint, notes: patch?.notes ?? first.notes }, { allowPast: true });
  if (!checked.ok) throw new LinkError("bad_request", checked.error);
  // What it was before (read first: the update below must not change what we compare against).
  const wasDate = dayOf(first.exam_date);
  const wasTitle = first.title;
  const changes = { title: checked.value.title, exam_date: checked.value.date, subject_hint: checked.value.subjectHint || null, notes: checked.value.notes || null, updated_at: new Date().toISOString() };
  const { error } = await client.from("exam_dates").update(changes).eq("sender_id", sender.id).eq("batch_id", first.batch_id);
  if (error) throw error;
  const updatedRows = rows.map((row) => ({ ...row, ...changes }));
  const moved = checked.value.date !== wasDate || checked.value.title !== wasTitle;
  const plansUpdated = moved ? await propagate(client, updatedRows, "change", sender.display_name || "") : 0;
  return { batchId: first.batch_id, updatedRows, plansUpdated, changedDate: checked.value.date !== wasDate };
}

/** The sender cancels an exam date: it disappears for the students, their plans keep the date as their own deadline. */
export async function cancelBatch(sender, batchId) {
  if (!canOwnGroups(sender?.role)) throw new LinkError("not_allowed", "Only a teacher or a parent can cancel an exam date.", 403);
  await assertExamDatesReady();
  const client = createSupabaseAdminClient();
  const rows = await senderRows(client, sender, batchId);
  const live = rows.filter((row) => !row.revoked_at);
  if (!live.length) return { batchId, cancelled: 0, plansUpdated: 0, rows: [] };
  const now = new Date().toISOString();
  const { error } = await client.from("exam_dates").update({ revoked_at: now, updated_at: now }).eq("sender_id", sender.id).eq("batch_id", rows[0].batch_id);
  if (error) throw error;
  const plansUpdated = await propagate(client, live.map((row) => ({ ...row, revoked_at: now })), "cancel", sender.display_name || "");
  return { batchId: rows[0].batch_id, cancelled: live.length, plansUpdated, rows: live };
}

/** Tidy-up: a connection ended, so the exam dates between the two stop being live (the plans keep their own deadline). */
export async function revokeExamDatesBetween(accountA, accountB) {
  if (!accountA || !accountB || !(await supportsExamDates())) return 0;
  const client = createSupabaseAdminClient();
  let count = 0;
  for (const [sender, recipient] of [[accountA, accountB], [accountB, accountA]]) {
    const { data, error } = await client.from("exam_dates").select("*").eq("sender_id", sender).eq("recipient_id", recipient);
    if (error) throw error;
    const live = (data || []).filter((row) => !row.revoked_at);
    if (!live.length) continue;
    const now = new Date().toISOString();
    const { error: updateError } = await client.from("exam_dates").update({ revoked_at: now, updated_at: now }).eq("sender_id", sender).eq("recipient_id", recipient).is("revoked_at", null);
    if (updateError) throw updateError;
    await propagate(client, live.map((row) => ({ ...row, revoked_at: now })), "cancel", "");
    count += live.length;
  }
  return count;
}
