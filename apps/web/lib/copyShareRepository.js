/**
 * Agents, templates and components are shared as COPIES (their definitions are small JSON): the recipient gets
 * their own item, labelled "Shared by <name>", that they can use and change. There is no live sync.
 *
 *   agent      a document tagged `ai-agent` in the recipient's workspace (+ `shared-from:<id>`)
 *   template   a row in the recipient's template library (the existing document block template save path)
 *   component  a `shared_items` row (kind "component") with the block definition; the app imports it into the
 *              recipient's local library (localStorage `luna.templateBlocks.v1`) on its next load
 *
 * Only connections can receive (an accepted link, checked here from the sender's session). Nothing of the
 * sender's workspace travels: an agent loses its saved last output, marketplace purchases cannot be shared
 * (they are licensed to the buyer), and a component is validated and size-capped.
 */
import { createSupabaseAdminClient } from "./supabaseClient.js";
import { LinkError, assertEmailVerified, authorizeDelivery } from "./accountsCore.js";
import { assertSharingReady, findAccountById, findAccountsByIds, getAcceptedLink } from "./accountsRepository.js";
import { createSubject, createWorkspace, listDocumentBlockTemplates, saveDocumentBlockTemplate, updateDocumentMeta } from "./workspacesRepository.js";
import { loadOwnedDocument } from "./sharingRepository.js";
import { SHARED_FROM_PREFIX, isReservedSubjectName } from "../modules/accounts/shared.js";

export const COPY_KINDS = ["agent", "template", "component"];
export const MAX_COMPONENT_BYTES = 200 * 1024;
const MAX_RECIPIENTS = 50;

const parseJson = (text) => {
  try {
    const parsed = JSON.parse(String(text || ""));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const clean = (value, max = 120) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);

/* ------------------------------------------------------------------ pure shaping (tested) */

/** An agent's definition as it goes to someone else: no saved output, no marketplace licence, labelled with its origin. */
export function agentCopyFor(content, sender, now = new Date()) {
  const agent = parseJson(content);
  if (!agent) throw new LinkError("not_shareable", "This agent could not be read.", 400);
  if (agent.installedFrom?.listingId) throw new LinkError("not_shareable", "Agents bought in the Marketplace are licensed to you and cannot be shared. Share one you created.", 400);
  const { savedOutput: _savedOutput, installedFrom: _installedFrom, ...rest } = agent;
  return { ...rest, sharedFrom: { accountId: sender.id, name: sender.display_name || sender.email, at: now.toISOString() } };
}

/** A component (custom block) validated and re-labelled for the recipient, or a LinkError. */
export function componentCopyFor(block, sender) {
  if (!block || typeof block !== "object" || Array.isArray(block)) throw new LinkError("bad_request", "Choose a component to share.");
  let json = "";
  try {
    json = JSON.stringify(block);
  } catch {
    throw new LinkError("bad_request", "This component could not be read.");
  }
  if (json.length > MAX_COMPONENT_BYTES) throw new LinkError("too_large", "This component is too large to share.", 413);
  const id = clean(block.id, 100);
  const name = clean(block.name, 80);
  if (!id || !name || !Array.isArray(block.fields) || !Array.isArray(block.elements)) throw new LinkError("bad_request", "This is not a valid component.");
  if (block.builtIn) throw new LinkError("bad_request", "Built-in components are already available to everyone.");
  const copy = JSON.parse(json);
  return {
    ...copy,
    id: `shared-${String(sender.id).slice(0, 8)}-${id}`,
    name,
    builtIn: false,
    author: clean(sender.display_name || sender.email, 80),
    sharedFrom: { accountId: sender.id, name: clean(sender.display_name || sender.email, 80) }
  };
}

/** A template as it goes to someone else. */
export function templateCopyFor(template, sender) {
  const senderName = clean(sender.display_name || sender.email, 80);
  const { id: _id, ownerUserId: _ownerUserId, createdAt: _createdAt, updatedAt: _updatedAt, sourceDocumentId: _sourceDocumentId, ...rest } = template;
  return {
    ...rest,
    id: "",
    name: `${clean(template.name, 90) || "Template"} (shared by ${senderName})`,
    description: `Shared by ${senderName}. ${clean(template.description, 300)}`.trim(),
    sourceDocumentId: ""
  };
}

/* ------------------------------------------------------------------ where an agent copy lands */

/** The recipient's first topic that is not a system one (that is where the app starts), created when there is none. */
async function agentHome(client, recipient) {
  const { data: workspaces, error } = await client.from("workspaces").select("id").eq("owner_user_id", recipient.id).order("created_at", { ascending: true }).limit(1);
  if (error) throw error;
  const workspaceId = workspaces?.[0]?.id || (await createWorkspace("My workspace", recipient.id)).id;
  const { data: subjects, error: subjectError } = await client.from("subjects").select("id, name").eq("workspace_id", workspaceId).order("created_at", { ascending: true });
  if (subjectError) throw subjectError;
  const own = (subjects || []).find((subject) => !isReservedSubjectName(subject.name));
  return own?.id || (await createSubject(workspaceId, "General")).id;
}

async function placeAgentCopy(client, { sender, recipient, agentDoc, content }) {
  const subjectId = await agentHome(client, recipient);
  const tag = `${SHARED_FROM_PREFIX}${sender.id}`;
  // Sharing the same agent again refreshes the recipient's copy (their edits to it are replaced, said in the dialog).
  const { data: previous, error } = await client.from("shared_items").select("id, copy_document_id").eq("sender_id", sender.id).eq("recipient_id", recipient.id).eq("source_document_id", agentDoc.row.id).maybeSingle();
  if (error) throw error;
  const name = `${clean(agentDoc.row.name.replace(/\.agent\.json$/i, ""), 90)}.agent.json`;
  const columns = { name, content, preview: clean(parseJson(content)?.description || name, 180), size_bytes: Buffer.byteLength(content, "utf8"), source_type: "generated" };
  let copyId = "";
  if (previous?.copy_document_id) {
    const { data: current } = await client.from("documents").select("id").eq("id", previous.copy_document_id).maybeSingle();
    if (current) {
      copyId = current.id;
      const { error: updateError } = await client.from("documents").update({ ...columns, updated_at: new Date().toISOString() }).eq("id", copyId);
      if (updateError) throw updateError;
    }
  }
  if (!copyId) {
    const { data, error: insertError } = await client.from("documents").insert({ ...columns, subject_id: subjectId, folder_id: null }).select("id").single();
    if (insertError) throw insertError;
    copyId = data.id;
  }
  await updateDocumentMeta(subjectId, copyId, { folderIds: [], tags: ["ai-agent", tag] });
  return { copyId, previousId: previous?.id || "" };
}

/* ------------------------------------------------------------------ sending */

async function recipientFor(sender, recipientId) {
  const recipient = await findAccountById(recipientId);
  const link = recipient ? await getAcceptedLink(sender.id, recipient.id) : null;
  const allowed = authorizeDelivery({ mode: "share", sender: { id: sender.id, role: sender.role }, recipient: recipient ? { id: recipient.id, role: recipient.role } : null, link });
  if (!allowed.ok) throw new LinkError("not_allowed", allowed.error, allowed.status);
  return { recipient, link };
}

async function record(client, { kind, title, sender, recipient, link, sourceDocumentId = null, copyDocumentId = null, payload = null, previousId = "" }) {
  const row = {
    mode: "share",
    item_type: kind,
    title,
    sender_id: sender.id,
    recipient_id: recipient.id,
    link_id: link?.id || null,
    source_document_id: sourceDocumentId,
    copy_document_id: copyDocumentId,
    payload,
    imported_at: null,
    updated_at: new Date().toISOString()
  };
  const { error } = previousId ? await client.from("shared_items").update(row).eq("id", previousId) : await client.from("shared_items").insert(row);
  if (error) throw error;
}

/**
 * Share a copy of an agent, template or component with connections.
 * @param {object} args
 * @param {object} args.sender the logged-in account row
 * @param {"agent" | "template" | "component"} args.kind
 * @param {string[]} args.recipientIds
 * @param {string} [args.id] the agent's document id or the template's id (the sender's own)
 * @param {object} [args.component] the component definition (components live in the browser)
 * @returns {Promise<{ title: string, results: Array<{ recipientId: string, ok: boolean, error?: string, status?: number }> }>}
 */
export async function shareCopy({ sender, kind, recipientIds, id = "", component = null }) {
  assertEmailVerified(sender, "share work");
  await assertSharingReady("Sharing agents, templates and components");
  if (!COPY_KINDS.includes(kind)) throw new LinkError("bad_request", "Choose what to share.");
  const ids = [...new Set((recipientIds || []).map((value) => String(value || "")).filter(Boolean))].slice(0, MAX_RECIPIENTS);
  if (!ids.length) throw new LinkError("bad_request", "Choose at least one person.");
  const client = createSupabaseAdminClient();

  // Everything about the thing being shared is read ONCE, from the sender's own data.
  let title = "";
  let agentDoc = null;
  let agentContent = "";
  let template = null;
  let componentCopy = null;
  if (kind === "agent") {
    agentDoc = await loadOwnedDocument(client, String(id || ""), sender.id);
    if (!agentDoc || !agentDoc.tags.includes("ai-agent")) throw new LinkError("not_found", "That agent was not found in your workspace.", 404);
    agentContent = JSON.stringify(agentCopyFor(agentDoc.row.content, sender), null, 2);
    title = clean(parseJson(agentDoc.row.content)?.name || agentDoc.row.name.replace(/\.agent\.json$/i, ""), 120);
  } else if (kind === "template") {
    const templates = await listDocumentBlockTemplates(sender.id);
    template = templates.find((entry) => entry.id === String(id || ""));
    if (!template) throw new LinkError("not_found", "That template was not found in your library.", 404);
    title = clean(template.name, 120);
  } else {
    componentCopy = componentCopyFor(component, sender);
    title = componentCopy.name;
  }

  const results = [];
  for (const recipientId of ids) {
    try {
      const { recipient, link } = await recipientFor(sender, recipientId);
      if (kind === "agent") {
        const placed = await placeAgentCopy(client, { sender, recipient, agentDoc, content: agentContent });
        await record(client, { kind, title, sender, recipient, link, sourceDocumentId: agentDoc.row.id, copyDocumentId: placed.copyId, previousId: placed.previousId });
      } else if (kind === "template") {
        await saveDocumentBlockTemplate(recipient.id, templateCopyFor(template, sender));
        await record(client, { kind, title, sender, recipient, link });
      } else {
        await record(client, { kind, title, sender, recipient, link, payload: componentCopy });
      }
      results.push({ recipientId, ok: true });
    } catch (error) {
      if (!(error instanceof LinkError)) throw error;
      results.push({ recipientId, ok: false, error: error.message, status: error.status });
    }
  }
  return { title, results };
}

/* ------------------------------------------------------------------ the recipient's inbox of components */

/** Components shared with this account that its app has not imported yet. */
export async function listPendingComponents(accountId) {
  try {
    await assertSharingReady();
  } catch {
    return [];
  }
  const { data, error } = await createSupabaseAdminClient().from("shared_items").select("id, title, sender_id, payload, created_at").eq("recipient_id", accountId).eq("item_type", "component").is("imported_at", null).order("created_at", { ascending: true }).limit(50);
  if (error) throw error;
  const senders = await findAccountsByIds((data || []).map((row) => row.sender_id));
  const byId = new Map(senders.map((row) => [row.id, row]));
  return (data || []).filter((row) => row.payload && typeof row.payload === "object").map((row) => ({ id: row.id, title: row.title, block: row.payload, sender: { id: row.sender_id, displayName: byId.get(row.sender_id)?.display_name || "" }, sharedAt: row.created_at }));
}

/** The app imported them: do not hand them out again. */
export async function markComponentsImported(accountId, ids) {
  const list = [...new Set((ids || []).map((value) => String(value || "")).filter(Boolean))].slice(0, 100);
  if (!list.length) return 0;
  const { data, error } = await createSupabaseAdminClient().from("shared_items").update({ imported_at: new Date().toISOString() }).eq("recipient_id", accountId).eq("item_type", "component").in("id", list).select("id");
  if (error) throw error;
  return (data || []).length;
}
