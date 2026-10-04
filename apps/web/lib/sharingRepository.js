/**
 * Sending work to a connected account: share (a read-only copy) or assign (a copy with a due date).
 *
 * Everything is decided on the server from the sender's session: the link must be accepted by both
 * sides (accountsCore.authorizeDelivery), the document must belong to the sender, and the copy is made
 * here — the browser never says whose workspace to write to. The copy lands in the receiver's
 * "Shared documents" topic, in a folder named after the sender, tagged `shared-by:<sender id>`.
 *
 * Sending the same document to the same person again refreshes the copy (keeping the receiver's
 * highlights and ticked plan steps) instead of piling up duplicates.
 */
import { createSupabaseAdminClient } from "./supabaseClient.js";
import { LinkError, authorizeDelivery, classifyDeliverable } from "./accountsCore.js";
import { findAccountById, getAcceptedLink } from "./accountsRepository.js";
import { createFolder, createSubject, createWorkspace, updateDocumentMeta } from "./workspacesRepository.js";
import { ASSIGNED_BY_PREFIX, SHARED_BY_PREFIX, SHARED_SUBJECT_NAME, isIsoDate, isProtectedTag } from "../modules/accounts/shared.js";

const COPY_COLUMNS = [
  "name", "content", "preview", "size_bytes", "source_type", "source_mime_type", "source_content_base64", "source_render_html",
  "review_status", "extraction_confidence", "extraction_method", "extraction_issues", "extraction_requires_review", "reviewed_at",
  "source_preview", "extraction_risk_markers", "content_template_id", "content_blocks_json", "content_blocks_schema_version"
];

/** Tags that describe the sender's own use of a document and must not travel with the copy. */
const dropTag = (tag) => isProtectedTag(tag) || tag === "favourite" || String(tag).startsWith("due:");

/* ------------------------------------------------------------------ reading the sender's document */

/** The sender's document with its tags, or null if it is not theirs (never reveals whether it exists). */
export async function loadOwnedDocument(client, documentId, ownerId) {
  const { data: row, error } = await client.from("documents").select("*").eq("id", documentId).maybeSingle();
  if (error) throw error;
  if (!row) return null;
  const { data: subject, error: subjectError } = await client.from("subjects").select("id, workspace_id").eq("id", row.subject_id).maybeSingle();
  if (subjectError) throw subjectError;
  if (!subject) return null;
  const { data: workspace, error: workspaceError } = await client.from("workspaces").select("id, owner_user_id").eq("id", subject.workspace_id).maybeSingle();
  if (workspaceError) throw workspaceError;
  if (!workspace || workspace.owner_user_id !== ownerId) return null;
  const { data: tagRows, error: tagError } = await client.from("document_tags").select("topic_tags(tag)").eq("document_id", documentId);
  if (tagError) throw tagError;
  return { row, tags: (tagRows || []).map((entry) => entry.topic_tags?.tag).filter(Boolean) };
}

/* ------------------------------------------------------------------ where the copy goes */

/** <receiver's first workspace> / Shared documents / <sender's name>; created on first use. */
export async function ensureSharedFolder(client, recipient, sender) {
  const { data: workspaces, error } = await client.from("workspaces").select("id").eq("owner_user_id", recipient.id).order("created_at", { ascending: true }).limit(1);
  if (error) throw error;
  const workspaceId = workspaces?.[0]?.id || (await createWorkspace("My workspace", recipient.id)).id;

  const { data: subjects, error: subjectError } = await client.from("subjects").select("id").eq("workspace_id", workspaceId).eq("name", SHARED_SUBJECT_NAME).order("created_at", { ascending: true }).limit(1);
  if (subjectError) throw subjectError;
  const subjectId = subjects?.[0]?.id || (await createSubject(workspaceId, SHARED_SUBJECT_NAME)).id;

  const senderName = String(sender.display_name || sender.email).trim();
  const { data: folders, error: folderError } = await client.from("folders").select("id").eq("subject_id", subjectId).eq("name", senderName).is("parent_folder_id", null).limit(1);
  if (folderError) throw folderError;
  const folderId = folders?.[0]?.id || (await createFolder(subjectId, senderName, "")).id;
  return { workspaceId, subjectId, folderId };
}

/* ------------------------------------------------------------------ copying */

function parseJson(text) {
  try {
    const parsed = JSON.parse(String(text || ""));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/** When a copy is refreshed, what the receiver added (highlights, ticked steps) is kept. */
export function carryReceiverLayer(oldContent, newContent) {
  const before = parseJson(oldContent);
  const after = parseJson(newContent);
  if (!before || !after || Array.isArray(before) || Array.isArray(after)) return newContent;
  if (Array.isArray(before.highlights) && before.highlights.length) after.highlights = before.highlights;
  if (Array.isArray(before.items) && Array.isArray(after.items)) {
    const done = new Map(before.items.filter((item) => item?.id && item.doneAt).map((item) => [item.id, item.doneAt]));
    after.items = after.items.map((item) => (item?.id && done.has(item.id) ? { ...item, doneAt: done.get(item.id) } : item));
  }
  return JSON.stringify(after, null, 2);
}

/**
 * Points a plan at the receiver's copies of its resources. References to anything that was not copied are
 * cleared (a step then reads as plain text), sub-plan and agent links are dropped, and a due date given when
 * assigning becomes one more deadline.
 */
export function remapPlanForRecipient(plan, idMap, { recipientName = "", senderName = "", dueDate = "" } = {}) {
  const mapId = (id) => idMap.get(id) || "";
  const next = { ...plan, learner: recipientName || plan.learner || "", parentPlanId: "", agentScope: null };
  next.items = (plan.items || []).map((item) => {
    const resourceId = item?.resourceId ? mapId(item.resourceId) : "";
    return { ...item, resourceId, generate: resourceId ? item.generate : false };
  });
  next.goals = (plan.goals || []).map((goal) => ({ ...goal, resourceIds: (goal.resourceIds || []).map(mapId).filter(Boolean) }));
  next.materialIds = (plan.materialIds || []).map(mapId).filter(Boolean);
  if (dueDate) {
    next.deadlines = [...(plan.deadlines || []), { id: `dl_assigned_${Date.now().toString(36)}`, title: `Due (set by ${senderName || "your teacher"})`, date: dueDate, kind: "hand_in" }];
  }
  return next;
}

/** The ids of every resource a plan points at. */
export function planResourceIds(plan) {
  return [...new Set([
    ...(plan.items || []).map((item) => item?.resourceId),
    ...(plan.goals || []).flatMap((goal) => goal?.resourceIds || []),
    ...(plan.materialIds || [])
  ].filter(Boolean))];
}

async function copyExports(client, fromId, toId) {
  try {
    const { data } = await client.from("generated_document_exports").select("format, mime_type, file_name, content_base64").eq("document_id", fromId);
    await client.from("generated_document_exports").delete().eq("document_id", toId);
    if (data?.length) await client.from("generated_document_exports").insert(data.map((row) => ({ ...row, document_id: toId })));
  } catch { /* exports are an optional table; the copy works without them */ }
}

/**
 * Creates (or refreshes) one copy. `overrides.content` replaces the content (used for a rewritten plan).
 * @returns {Promise<{ copyId: string, created: boolean }>}
 */
async function placeCopy(client, { sender, recipient, place, source, mode, itemType, dueDate, note, overrides = {}, extraTags = [] }) {
  const baseTags = source.tags.filter((tag) => !dropTag(tag));
  const tags = [...new Set([...baseTags, `${SHARED_BY_PREFIX}${sender.id}`, ...(mode === "assign" ? [`${ASSIGNED_BY_PREFIX}${sender.id}`] : []), ...(dueDate ? [`due:${dueDate}`] : []), ...extraTags])];

  const { data: existingItem, error: itemError } = await client
    .from("shared_items")
    .select("id, copy_document_id")
    .eq("sender_id", sender.id).eq("recipient_id", recipient.id).eq("source_document_id", source.row.id)
    .maybeSingle();
  if (itemError) throw itemError;

  const columns = {};
  for (const column of COPY_COLUMNS) if (column in source.row) columns[column] = source.row[column];
  if (overrides.content !== undefined) {
    columns.content = overrides.content;
    columns.preview = overrides.preview ?? columns.preview;
    columns.size_bytes = Buffer.byteLength(String(overrides.content), "utf8");
  }

  let copyId = "";
  let created = false;
  if (existingItem?.copy_document_id) {
    const { data: current } = await client.from("documents").select("id, content").eq("id", existingItem.copy_document_id).maybeSingle();
    if (current) {
      copyId = current.id;
      if (typeof columns.content === "string") columns.content = carryReceiverLayer(current.content, columns.content);
      const { error } = await client.from("documents").update({ ...columns, subject_id: place.subjectId, updated_at: new Date().toISOString() }).eq("id", copyId);
      if (error) throw error;
    }
  }
  if (!copyId) {
    const { data, error } = await client.from("documents").insert({ ...columns, subject_id: place.subjectId, folder_id: place.folderId }).select("id").single();
    if (error) throw error;
    copyId = data.id;
    created = true;
  }
  await copyExports(client, source.row.id, copyId);
  await updateDocumentMeta(place.subjectId, copyId, { folderIds: [place.folderId], tags });

  const record = {
    mode,
    item_type: itemType,
    title: source.row.name,
    sender_id: sender.id,
    recipient_id: recipient.id,
    link_id: place.linkId || null,
    source_document_id: source.row.id,
    copy_document_id: copyId,
    due_date: dueDate || null,
    note: note || null,
    updated_at: new Date().toISOString()
  };
  const { error: recordError } = existingItem
    ? await client.from("shared_items").update(record).eq("id", existingItem.id)
    : await client.from("shared_items").insert(record);
  if (recordError) throw recordError;
  return { copyId, created };
}

/**
 * Share or assign one of the sender's documents with one connected account.
 * @param {object} args
 * @param {object} args.sender the logged-in account row (from the session, never from the request)
 * @param {string} args.recipientId
 * @param {string} args.documentId one of the sender's documents
 * @param {"share"|"assign"} args.mode
 * @param {string} [args.dueDate] YYYY-MM-DD, assignments only
 * @param {string} [args.note]
 */
export async function deliverDocument({ sender, recipientId, documentId, mode, dueDate = "", note = "" }) {
  const recipient = await findAccountById(recipientId);
  const link = recipient ? await getAcceptedLink(sender.id, recipient.id) : null;
  const allowed = authorizeDelivery({
    mode,
    sender: { id: sender.id, role: sender.role },
    recipient: recipient ? { id: recipient.id, role: recipient.role } : null,
    link
  });
  if (!allowed.ok) throw new LinkError("not_allowed", allowed.error, allowed.status);
  if (dueDate && !isIsoDate(dueDate)) throw new LinkError("bad_date", "Use a valid due date.");
  const due = mode === "assign" ? dueDate : "";
  const cleanNote = String(note || "").trim().slice(0, 500);

  const client = createSupabaseAdminClient();
  const source = await loadOwnedDocument(client, documentId, sender.id);
  if (!source) throw new LinkError("not_found", "That document was not found in your workspace.", 404);
  const kind = classifyDeliverable({ tags: source.tags }, mode);
  if (!kind.ok) throw new LinkError("not_deliverable", kind.error, 400);

  const place = { ...(await ensureSharedFolder(client, recipient, sender)), linkId: link.id };
  const common = { sender, recipient, place, mode, note: cleanNote };

  if (kind.itemType === "plan") {
    const plan = parseJson(source.row.content);
    if (!plan || plan.kind !== "study-plan") throw new LinkError("not_deliverable", "This plan could not be read.", 400);
    // The plan travels with the resources it points at, so the receiver can follow it on their own.
    const idMap = new Map();
    for (const resourceId of planResourceIds(plan)) {
      const resource = await loadOwnedDocument(client, resourceId, sender.id);
      if (!resource || !classifyDeliverable({ tags: resource.tags }, "share").ok) continue;
      const itemDue = (plan.items || []).find((item) => item?.resourceId === resourceId && item.dueDate)?.dueDate || "";
      const placed = await placeCopy(client, { ...common, source: resource, mode: "share", itemType: resource.tags.includes("activity") ? "activity" : "resource", dueDate: resource.tags.includes("activity") ? itemDue : "", extraTags: mode === "assign" ? [`${ASSIGNED_BY_PREFIX}${sender.id}`] : [] });
      idMap.set(resourceId, placed.copyId);
    }
    const rewritten = remapPlanForRecipient(plan, idMap, { recipientName: recipient.display_name, senderName: sender.display_name, dueDate: due });
    const content = JSON.stringify(rewritten, null, 2);
    const placed = await placeCopy(client, { ...common, source, itemType: "plan", dueDate: due, overrides: { content, preview: source.row.preview } });
    return { copyDocumentId: placed.copyId, itemType: "plan", copiedResources: idMap.size, refreshed: !placed.created };
  }

  const placed = await placeCopy(client, { ...common, source, itemType: kind.itemType, dueDate: due });
  return { copyDocumentId: placed.copyId, itemType: kind.itemType, copiedResources: 0, refreshed: !placed.created };
}
