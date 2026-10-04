/**
 * Accounts, links and the record of what was sent — the database side (service role only).
 * The rules themselves live in accountsCore.js; this file just applies them to rows.
 * A missing table surfaces as the raw Supabase error; routes turn it into `setupNeeded` (see
 * accountsCore.isSetupNeededError).
 */
import { createSupabaseAdminClient } from "./supabaseClient.js";
import {
  LinkError,
  decideLinkRequest,
  isValidEmail,
  kindForRoles,
  linkFitsAccounts,
  normalizeEmail,
  pairKey,
  publicAccount,
  relationsFor,
  transitionLink
} from "./accountsCore.js";
import { createWorkspace, listWorkspaceTree } from "./workspacesRepository.js";
import { redactTreeForGuardian } from "../modules/accounts/shared.js";

const ACCOUNT_COLUMNS = "id, email, display_name, role, under_13, created_at";
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

export class EmailTakenError extends Error {}

/* ------------------------------------------------------------------ accounts */

export async function findAccountByEmail(email) {
  const { data, error } = await createSupabaseAdminClient()
    .from("accounts")
    .select(`${ACCOUNT_COLUMNS}, password_hash, failed_logins, locked_until`)
    .eq("email", normalizeEmail(email))
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function findAccountById(id) {
  if (!id) return null;
  const { data, error } = await createSupabaseAdminClient().from("accounts").select(ACCOUNT_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function findAccountsByIds(ids) {
  const list = [...new Set((ids || []).filter(Boolean))];
  if (!list.length) return [];
  const { data, error } = await createSupabaseAdminClient().from("accounts").select(ACCOUNT_COLUMNS).in("id", list);
  if (error) throw error;
  return data || [];
}

export async function insertAccount({ email, passwordHash, displayName, role, under13 = false }) {
  const { data, error } = await createSupabaseAdminClient()
    .from("accounts")
    .insert({ email: normalizeEmail(email), password_hash: passwordHash, display_name: displayName, role, under_13: Boolean(under13) })
    .select(ACCOUNT_COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") throw new EmailTakenError("An account with this email already exists.");
    throw error;
  }
  return data;
}

/** Counts a failed log-in and locks the account after too many in a row. */
export async function recordLoginFailure(account, now = Date.now()) {
  const failed = Number(account.failed_logins || 0) + 1;
  const lock = failed >= MAX_FAILED_LOGINS;
  const { error } = await createSupabaseAdminClient()
    .from("accounts")
    .update({ failed_logins: lock ? 0 : failed, locked_until: lock ? new Date(now + LOCK_MINUTES * 60000).toISOString() : account.locked_until || null })
    .eq("id", account.id);
  if (error) throw error;
}

export async function recordLoginSuccess(account) {
  if (!account.failed_logins && !account.locked_until) return;
  const { error } = await createSupabaseAdminClient().from("accounts").update({ failed_logins: 0, locked_until: null }).eq("id", account.id);
  if (error) throw error;
}

export const isLocked = (account, now = Date.now()) => Boolean(account?.locked_until) && new Date(account.locked_until).getTime() > now;

/** Everyone gets a place to start: the first workspace is created with the account. */
export async function ensureFirstWorkspace(accountId) {
  const { data, error } = await createSupabaseAdminClient().from("workspaces").select("id").eq("owner_user_id", accountId).limit(1);
  if (error) throw error;
  if (data?.length) return data[0].id;
  const created = await createWorkspace("My workspace", accountId);
  return created.id;
}

/* ------------------------------------------------------------------ links */

const linkFromRow = (row) => ({
  id: row.id,
  kind: row.kind,
  requesterId: row.requester_id,
  requesterEmail: row.requester_email,
  targetId: row.target_id || "",
  targetEmail: row.target_email,
  status: row.status,
  pairKey: row.pair_key,
  createdAt: row.created_at,
  respondedAt: row.responded_at || ""
});

/** The role of the other end of a link, given mine. */
export function otherRoleFor(kind, myRole) {
  if (kind === "teacher_student") return myRole === "teacher" ? "student" : "teacher";
  if (kind === "parent_student") return myRole === "parent" ? "student" : "parent";
  return "";
}

async function selectLinks(filter) {
  const query = createSupabaseAdminClient().from("account_links").select("*");
  const { data, error } = await filter(query);
  if (error) throw error;
  return (data || []).map(linkFromRow);
}

/** Every connection of an account, grouped for the Connections page. */
export async function listConnections(account) {
  const rows = await selectLinks((query) => query.or(`requester_id.eq.${account.id},target_id.eq.${account.id}`).order("created_at", { ascending: false }));
  const others = await findAccountsByIds(rows.map((row) => (row.requesterId === account.id ? row.targetId : row.requesterId)));
  const byId = new Map(others.map((row) => [row.id, row]));
  const shaped = rows
    .filter((row) => row.status === "pending" || row.status === "accepted")
    .map((row) => {
      const outgoing = row.requesterId === account.id;
      const otherId = outgoing ? row.targetId : row.requesterId;
      const other = byId.get(otherId);
      return {
        id: row.id,
        kind: row.kind,
        status: row.status,
        direction: outgoing ? "outgoing" : "incoming",
        createdAt: row.createdAt,
        respondedAt: row.respondedAt,
        other: {
          id: other?.id || "",
          email: other?.email || (outgoing ? row.targetEmail : row.requesterEmail),
          displayName: other?.display_name || "",
          role: other?.role || otherRoleFor(row.kind, account.role),
          awaitingSignup: !other
        }
      };
    });
  return {
    incoming: shaped.filter((row) => row.status === "pending" && row.direction === "incoming"),
    outgoing: shaped.filter((row) => row.status === "pending" && row.direction === "outgoing"),
    accepted: shaped.filter((row) => row.status === "accepted")
  };
}

/** Accounts connected to `accountId` through an accepted link, optionally only those with a role. */
export async function listLinkedAccounts(accountId, { role = "" } = {}) {
  const rows = (await selectLinks((query) => query.or(`requester_id.eq.${accountId},target_id.eq.${accountId}`).eq("status", "accepted")));
  const others = await findAccountsByIds(rows.map((row) => (row.requesterId === accountId ? row.targetId : row.requesterId)));
  return others.filter((other) => !role || other.role === role).map((other) => ({ ...publicAccount(other), linkId: rows.find((row) => row.requesterId === other.id || row.targetId === other.id)?.id }));
}

/** The accepted link between two accounts, or null. */
export async function getAcceptedLink(accountA, accountB) {
  if (!accountA || !accountB) return null;
  const rows = await selectLinks((query) => query
    .eq("status", "accepted")
    .or(`and(requester_id.eq.${accountA},target_id.eq.${accountB}),and(requester_id.eq.${accountB},target_id.eq.${accountA})`));
  return rows[0] || null;
}

/**
 * Ask another account to link. `relation` is the role you expect them to have. Whatever the outcome,
 * the answer to the person asking is the same for "no such account" and "that account has another
 * role", so the form cannot be used to find out who has an account.
 * @returns {Promise<{ status: "pending" | "accepted", message: string }>}
 */
export async function requestLink(requester, { email, relation }) {
  const targetEmail = normalizeEmail(email);
  if (!isValidEmail(targetEmail)) throw new LinkError("bad_email", "Enter a valid email address.");
  if (targetEmail === requester.email) throw new LinkError("self", "That is your own email.");
  if (!relationsFor(requester.role).includes(relation)) throw new LinkError("bad_relation", `As a ${requester.role} you can connect with ${relationsFor(requester.role).join(" or ")} accounts.`);
  const kind = kindForRoles(requester.role, relation);
  const sent = { status: "pending", message: "Request sent. The connection becomes active once they accept it." };

  const target = await findAccountByEmail(targetEmail);
  if (target && !linkFitsAccounts(kind, requester.role, target.role)) return sent;

  const key = pairKey(kind, requester.email, targetEmail);
  const [existing] = await selectLinks((query) => query.eq("pair_key", key));
  const decision = decideLinkRequest(existing, requester.id);
  const client = createSupabaseAdminClient();

  if (decision.type === "create") {
    const { error } = await client.from("account_links").insert({
      kind,
      requester_id: requester.id,
      requester_email: requester.email,
      target_id: target?.id || null,
      target_email: targetEmail,
      status: "pending",
      pair_key: key
    });
    if (error && error.code !== "23505") throw error;
    return sent;
  }
  if (decision.type === "reopen") {
    const { error } = await client.from("account_links").update({
      requester_id: requester.id,
      requester_email: requester.email,
      target_id: target?.id || null,
      target_email: targetEmail,
      status: "pending",
      responded_at: null
    }).eq("id", existing.id);
    if (error) throw error;
    return sent;
  }
  if (decision.type === "accept_existing") {
    // They had already asked you: your asking back is the second "yes".
    const { error } = await client.from("account_links").update({ status: "accepted", target_id: requester.id, responded_at: new Date().toISOString() }).eq("id", existing.id);
    if (error) throw error;
    return { status: "accepted", message: "You are now connected." };
  }
  if (decision.type === "already_linked") return { status: "accepted", message: "You are already connected." };
  return sent; // already pending, or a recent decline: nothing new to say
}

/** accept | decline | cancel | remove — the state machine decides if the actor may. */
export async function changeLink(account, linkId, action) {
  const [link] = await selectLinks((query) => query.eq("id", linkId));
  if (!link) throw new LinkError("not_found", "That connection was not found.", 404);
  // A by-email request that has not attached yet can be answered by the account whose email it names.
  const claimable = !link.targetId && link.targetEmail === account.email;
  const next = transitionLink(claimable ? { ...link, targetId: account.id } : link, account.id, action);
  const patch = { status: next, responded_at: new Date().toISOString() };
  if (claimable) patch.target_id = account.id;
  const { error } = await createSupabaseAdminClient().from("account_links").update(patch).eq("id", link.id);
  if (error) throw error;
  return next;
}

/**
 * A new account picks up the requests other people made to its email before it existed. A request whose
 * roles do not fit (a teacher asked for a "student" that signed up as a parent) is revoked, not shown.
 */
export async function attachPendingLinks(account) {
  const client = createSupabaseAdminClient();
  const rows = await selectLinks((query) => query.eq("target_email", account.email).is("target_id", null));
  const requesters = await findAccountsByIds(rows.map((row) => row.requesterId));
  const byId = new Map(requesters.map((row) => [row.id, row]));
  for (const row of rows) {
    const fits = linkFitsAccounts(row.kind, byId.get(row.requesterId)?.role, account.role);
    const { error } = await client.from("account_links").update(fits ? { target_id: account.id } : { status: "revoked", responded_at: new Date().toISOString() }).eq("id", row.id);
    if (error) throw error;
  }
  return rows.length;
}

/* ------------------------------------------------------------------ what a parent or teacher may look at */

/** The workspace tree of a linked student, redacted, or null when the viewer is not allowed. */
export async function linkedStudentWorkspaces(viewer, studentId) {
  if (viewer.role !== "teacher" && viewer.role !== "parent") return null;
  const student = await findAccountById(studentId);
  if (!student || student.role !== "student") return null;
  const link = await getAcceptedLink(viewer.id, student.id);
  if (!link || kindForRoles(viewer.role, student.role) !== link.kind) return null;
  const tree = await listWorkspaceTree(student.id);
  return { student: publicAccount(student), workspaces: redactTreeForGuardian(tree) };
}

/* ------------------------------------------------------------------ sent / received log */

export async function listSharedItems(accountId, limit = 100) {
  const client = createSupabaseAdminClient();
  const { data, error } = await client
    .from("shared_items")
    .select("id, mode, item_type, title, sender_id, recipient_id, copy_document_id, due_date, note, created_at, updated_at")
    .or(`sender_id.eq.${accountId},recipient_id.eq.${accountId}`)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const people = await findAccountsByIds((data || []).flatMap((row) => [row.sender_id, row.recipient_id]));
  const byId = new Map(people.map((row) => [row.id, row]));
  const shape = (row) => ({
    id: row.id,
    mode: row.mode,
    itemType: row.item_type,
    title: row.title,
    dueDate: row.due_date || "",
    note: row.note || "",
    copyDocumentId: row.copy_document_id || "",
    sentAt: row.updated_at || row.created_at,
    sender: { id: row.sender_id, displayName: byId.get(row.sender_id)?.display_name || "", role: byId.get(row.sender_id)?.role || "" },
    recipient: { id: row.recipient_id, displayName: byId.get(row.recipient_id)?.display_name || "", role: byId.get(row.recipient_id)?.role || "" }
  });
  const rows = (data || []).map(shape);
  return {
    sent: rows.filter((row) => row.sender.id === accountId).map(({ copyDocumentId, ...rest }) => rest),
    received: rows.filter((row) => row.recipient.id === accountId)
  };
}
