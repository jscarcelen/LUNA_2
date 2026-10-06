/**
 * Accounts, links and the record of what was sent — the database side (service role only).
 * The rules themselves live in accountsCore.js; this file just applies them to rows.
 * A missing table surfaces as the raw Supabase error; routes turn it into `setupNeeded` (see
 * accountsCore.isSetupNeededError).
 */
import { createSupabaseAdminClient } from "./supabaseClient.js";
import {
  LinkError,
  SHARING_MIGRATION,
  assertEmailVerified,
  decideLinkRequest,
  hasGuardianPowers,
  isEmailVerified,
  isMissingColumnError,
  isSetupNeededError,
  isValidEmail,
  kindForRequest,
  kindForRoles,
  normalizeEmail,
  pairKey,
  publicAccount,
  relationsFor,
  setupNeededBody,
  transitionLink
} from "./accountsCore.js";
import { createWorkspace, listWorkspaceTree } from "./workspacesRepository.js";
import { redactTreeForGuardian } from "../modules/accounts/shared.js";
import { rememberPasswordChange } from "./sessionRevocation.js";

const BASE_COLUMNS = "id, email, display_name, role, under_13, created_at";
/** Added by supabase/migrations/202610050001_account_verification_phone_tokens.sql. */
const V2_COLUMNS = "email_verified_at, phone, phone_verified_at, password_changed_at, notifications_seen_at, pending_invites";
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

export class EmailTakenError extends Error {}
export class PhoneTakenError extends Error {}

/* ------------------------------------------------------------------ which schema are we on? */

const RECHECK_MISSING_MS = 15000;
let capability = { v2: null, checkedAt: 0 };

export function resetSchemaCache() {
  capability = { v2: null, checkedAt: 0 };
}

/** Called when a query proves the new columns are not there (the migration has not been applied yet). */
function markLegacy() {
  capability = { v2: false, checkedAt: Date.now() };
}

/**
 * Has the verification migration been applied? Probed with one tiny query and remembered (a "yes" for good,
 * a "no" for 15 s, so applying the migration takes effect without a redeploy). While the answer is "no",
 * everything keeps working the way it did before: no verification, no phone, no reset, no notification email.
 */
export async function supportsVerification() {
  if (capability.v2 === true) return true;
  if (capability.v2 === false && Date.now() - capability.checkedAt < RECHECK_MISSING_MS) return false;
  const { error } = await createSupabaseAdminClient().from("accounts").select("email_verified_at").limit(1);
  if (!error) {
    capability = { v2: true, checkedAt: Date.now() };
    return true;
  }
  if (isMissingColumnError(error)) {
    markLegacy();
    return false;
  }
  throw error;
}

/* ------------------------------------------------------------------ is the sharing v2 migration applied? */

let sharingCapability = { ok: null, checkedAt: 0 };

export function resetSharingCache() {
  sharingCapability = { ok: null, checkedAt: 0 };
}

/**
 * Has supabase/migrations/202610060001_network_sharing_grants.sql been applied (the `share_grants` table, the
 * `peer` connection kind, shared components)? Probed with one tiny query: a "yes" is remembered, a "no" for 15 s.
 * Until it is, connections stay teacher/parent <-> student only and every sharing v2 route answers a clear
 * `setupNeeded` 503 naming the migration.
 */
export async function supportsSharing() {
  if (sharingCapability.ok === true) return true;
  if (sharingCapability.ok === false && Date.now() - sharingCapability.checkedAt < RECHECK_MISSING_MS) return false;
  const { error } = await createSupabaseAdminClient().from("share_grants").select("id").limit(1);
  if (!error) {
    sharingCapability = { ok: true, checkedAt: Date.now() };
    return true;
  }
  if (isSetupNeededError(error)) {
    sharingCapability = { ok: false, checkedAt: Date.now() };
    return false;
  }
  throw error;
}

/** A 503 `setupNeeded` for the sharing migration, as an error a route turns into a response. */
export class SharingSetupError extends LinkError {
  constructor(what = "Sharing with permissions") {
    super("setup_needed", `${what} needs one database step: apply ${SHARING_MIGRATION} (Supabase SQL editor or MCP apply_migration), then reload.`, 503);
    this.setup = setupNeededBody(SHARING_MIGRATION);
  }
}

export async function assertSharingReady(what) {
  if (!(await supportsSharing())) throw new SharingSetupError(what);
}

async function accountColumns() {
  return (await supportsVerification()) ? `${BASE_COLUMNS}, ${V2_COLUMNS}` : BASE_COLUMNS;
}

/* ------------------------------------------------------------------ accounts */

export async function findAccountByEmail(email) {
  const { data, error } = await createSupabaseAdminClient()
    .from("accounts")
    .select(`${await accountColumns()}, password_hash, failed_logins, locked_until`)
    .eq("email", normalizeEmail(email))
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function findAccountById(id) {
  if (!id) return null;
  const { data, error } = await createSupabaseAdminClient().from("accounts").select(await accountColumns()).eq("id", id).maybeSingle();
  if (error) throw error;
  return data || null;
}

/** Other people's accounts: only the public columns, never a phone number. */
export async function findAccountsByIds(ids) {
  const list = [...new Set((ids || []).filter(Boolean))];
  if (!list.length) return [];
  const { data, error } = await createSupabaseAdminClient().from("accounts").select(BASE_COLUMNS).in("id", list);
  if (error) throw error;
  return data || [];
}

export async function findAccountIdByPhone(phone) {
  if (!phone || !(await supportsVerification())) return "";
  const { data, error } = await createSupabaseAdminClient().from("accounts").select("id").eq("phone", phone).maybeSingle();
  if (error) throw error;
  return data?.id || "";
}

/**
 * @param {object} fields
 * @param {string} [fields.phone] normalised E.164; stored only once the migration is applied (kept `null` otherwise)
 * @param {Array} [fields.pendingInvites] link requests typed at sign-up, sent only after the email is confirmed
 */
export async function insertAccount({ email, passwordHash, displayName, role, under13 = false, phone = "", pendingInvites = [] }) {
  const client = createSupabaseAdminClient();
  const base = { email: normalizeEmail(email), password_hash: passwordHash, display_name: displayName, role, under_13: Boolean(under13) };
  const v2 = await supportsVerification();
  const row = v2 ? { ...base, phone: phone || null, pending_invites: pendingInvites.length ? pendingInvites : null } : base;
  const { data, error } = await client.from("accounts").insert(row).select(v2 ? `${BASE_COLUMNS}, ${V2_COLUMNS}` : BASE_COLUMNS).single();
  if (error) {
    if (error.code === "23505") {
      if (/phone/i.test(`${error.message} ${error.details}`)) throw new PhoneTakenError("That phone number is already linked to another account.");
      throw new EmailTakenError("An account with this email already exists.");
    }
    throw error;
  }
  return data;
}

/** Sets or clears the phone (E.164). Verification stays null: nothing proves the number yet. */
export async function updateAccountPhone(accountId, phone) {
  const { error } = await createSupabaseAdminClient().from("accounts").update({ phone: phone || null, phone_verified_at: null }).eq("id", accountId);
  if (error) {
    if (error.code === "23505") throw new PhoneTakenError("That phone number is already linked to another account.");
    throw error;
  }
}

/** New password: also records when, which is what ends every older session (see sessionRevocation.js). */
export async function setAccountPassword(accountId, passwordHash, { now = new Date() } = {}) {
  const changedAt = now.toISOString();
  const { error } = await createSupabaseAdminClient().from("accounts").update({ password_hash: passwordHash, password_changed_at: changedAt, failed_logins: 0, locked_until: null }).eq("id", accountId);
  if (error) throw error;
  rememberPasswordChange(accountId, changedAt);
  return changedAt;
}

/** Marks the email as confirmed (once; the first time stays). Returns the fresh account row. */
export async function markEmailVerified(accountId) {
  const account = await findAccountById(accountId);
  if (!account) return null;
  if (account.email_verified_at) return account;
  const { error } = await createSupabaseAdminClient().from("accounts").update({ email_verified_at: new Date().toISOString() }).eq("id", accountId);
  if (error) throw error;
  return findAccountById(accountId);
}

export async function clearPendingInvites(accountId) {
  const { error } = await createSupabaseAdminClient().from("accounts").update({ pending_invites: null }).eq("id", accountId);
  if (error) throw error;
}

export async function markNotificationsSeen(accountId, now = new Date()) {
  if (!(await supportsVerification())) return false;
  const { error } = await createSupabaseAdminClient().from("accounts").update({ notifications_seen_at: now.toISOString() }).eq("id", accountId);
  if (error) throw error;
  return true;
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

/** The ids of every account this account has an accepted connection with. */
export async function listConnectedIds(accountId) {
  if (!accountId) return new Set();
  const rows = await selectLinks((query) => query.or(`requester_id.eq.${accountId},target_id.eq.${accountId}`).eq("status", "accepted"));
  return new Set(rows.map((row) => (row.requesterId === accountId ? row.targetId : row.requesterId)).filter(Boolean));
}

/** One link by id (any status), or null. */
export async function getLinkById(linkId) {
  if (!linkId) return null;
  const [link] = await selectLinks((query) => query.eq("id", linkId));
  return link || null;
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
 * Attaches the "what changed" event to a result WITHOUT making it enumerable: serialising or comparing the
 * result shows the same thing for an unknown email, a wrong-role email and a real one.
 */
function withEvent(result, event) {
  Object.defineProperty(result, "event", { value: event, enumerable: false });
  return result;
}

/**
 * Ask another account to link. `relation` is the role you expect them to have. Whatever the outcome,
 * the answer to the person asking is the same for "no such account" and "that account has another
 * role", so the form cannot be used to find out who has an account.
 *
 * Needs a confirmed email on the requester's side (otherwise anyone could sign up as someone else and
 * ask in their name). The person asked only gets the request attached to their account once THEIR email
 * is confirmed too, so an unconfirmed sign-up with a stranger's address never sees requests meant for them.
 * @returns {Promise<{ status: "pending" | "accepted", message: string }>}
 *   The result also carries a hidden (non-enumerable) `event` = { type: "created" | "reopened" | "accepted", linkId,
 *   targetEmail, targetKnown } for the caller that sends the notification email (nothing changed -> no event).
 */
export async function requestLink(requester, { email, relation = "" }) {
  assertEmailVerified(requester, "connect with other people");
  const targetEmail = normalizeEmail(email);
  if (!isValidEmail(targetEmail)) throw new LinkError("bad_email", "Enter a valid email address.");
  if (targetEmail === requester.email) throw new LinkError("self", "That is your own email.");
  const hinted = String(relation || "").trim();
  if (hinted && !relationsFor(requester.role).includes(hinted)) throw new LinkError("bad_relation", "Choose whether they are a student, a teacher or a parent (or leave it empty).");
  const sent = { status: "pending", message: "Request sent. The connection becomes active once they accept it." };

  const found = await findAccountByEmail(targetEmail);
  // An account that has not confirmed its email is treated as "nobody yet": the request waits for the confirmation.
  const target = found && isEmailVerified(found) ? found : null;
  // The open network: anyone can connect with anyone. The kind comes from the two roles (teacher+student and
  // parent+student keep their role powers; every other pair is a peer); for an address with no account yet it
  // follows the role the requester hinted at and is settled from the real roles when the person signs up.
  const kind = target ? kindForRoles(requester.role, target.role) : kindForRequest(requester.role, hinted);
  if (kind === "peer") await assertSharingReady("Connecting with people outside teacher, parent and student pairs");

  const key = pairKey(kind, requester.email, targetEmail);
  const [existing] = await selectLinks((query) => query.eq("pair_key", key));
  const decision = decideLinkRequest(existing, requester.id);
  const client = createSupabaseAdminClient();
  const event = (type, linkId) => ({ type, linkId, targetEmail, targetKnown: Boolean(target) });

  if (decision.type === "create") {
    const { data, error } = await client.from("account_links").insert({
      kind,
      requester_id: requester.id,
      requester_email: requester.email,
      target_id: target?.id || null,
      target_email: targetEmail,
      status: "pending",
      pair_key: key
    }).select("id");
    if (error && error.code !== "23505") throw error;
    const created = Array.isArray(data) ? data[0] : data;
    return error || !created?.id ? sent : withEvent({ ...sent }, event("created", created.id));
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
    return withEvent({ ...sent }, event("reopened", existing.id));
  }
  if (decision.type === "accept_existing") {
    // They had already asked you: your asking back is the second "yes".
    const { error } = await client.from("account_links").update({ status: "accepted", target_id: requester.id, responded_at: new Date().toISOString() }).eq("id", existing.id);
    if (error) throw error;
    return withEvent({ status: "accepted", message: "You are now connected." }, event("accepted", existing.id));
  }
  if (decision.type === "already_linked") return { status: "accepted", message: "You are already connected." };
  return sent; // already pending, or a recent decline: nothing new to say
}

/** accept | decline | cancel | remove — the state machine decides if the actor may. */
export async function changeLink(account, linkId, action) {
  const [link] = await selectLinks((query) => query.eq("id", linkId));
  if (!link) throw new LinkError("not_found", "That connection was not found.", 404);
  // Saying yes needs a confirmed email (declining, cancelling and removing never do).
  if (action === "accept") assertEmailVerified(account, "accept connections");
  // A by-email request that has not attached yet can be answered by the account whose email it names
  // (only once that email is confirmed: an unconfirmed address proves nothing).
  const claimable = !link.targetId && link.targetEmail === account.email && isEmailVerified(account);
  const next = transitionLink(claimable ? { ...link, targetId: account.id } : link, account.id, action);
  const patch = { status: next, responded_at: new Date().toISOString() };
  if (claimable) patch.target_id = account.id;
  const { error } = await createSupabaseAdminClient().from("account_links").update(patch).eq("id", link.id);
  if (error) throw error;
  return next;
}

/**
 * A new account picks up the requests other people made to its email before it existed. The kind of each
 * request is settled from the two real roles (a teacher who hinted "student" for an address that turned out to
 * be a parent becomes a peer connection, with no student powers). If the pair already has a link of that kind,
 * the duplicate is revoked instead of shown.
 */
export async function attachPendingLinks(account) {
  // Only an account that proved it owns this email may pick up what was sent to it.
  if (!isEmailVerified(account)) return 0;
  const client = createSupabaseAdminClient();
  const rows = await selectLinks((query) => query.eq("target_email", account.email).is("target_id", null));
  const requesters = await findAccountsByIds(rows.map((row) => row.requesterId));
  const byId = new Map(requesters.map((row) => [row.id, row]));
  const sharing = rows.length ? await supportsSharing() : true;
  for (const row of rows) {
    const requester = byId.get(row.requesterId);
    const kind = requester ? kindForRoles(requester.role, account.role) : null;
    // Without the sharing migration a peer connection cannot be stored: such a request is dropped, as before.
    const usable = Boolean(kind) && (kind !== "peer" || sharing);
    if (!usable) {
      const { error } = await client.from("account_links").update({ status: "revoked", responded_at: new Date().toISOString() }).eq("id", row.id);
      if (error) throw error;
      continue;
    }
    const patch = { target_id: account.id };
    if (kind !== row.kind) {
      patch.kind = kind;
      patch.pair_key = pairKey(kind, row.requesterEmail, row.targetEmail);
    }
    const { error } = await client.from("account_links").update(patch).eq("id", row.id);
    if (error) {
      if (error.code !== "23505") throw error;
      // The pair already has a link of that kind: this duplicate is not needed.
      const revoke = await client.from("account_links").update({ status: "revoked", responded_at: new Date().toISOString() }).eq("id", row.id);
      if (revoke.error) throw revoke.error;
    }
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
  // Only a teacher_student / parent_student link opens a student's performance: a peer connection never does.
  if (!hasGuardianPowers(link, viewer.role, student.role)) return null;
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

/* ------------------------------------------------------------------ notifications (derived, nothing extra is stored) */

export const NOTIFICATION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_NOTIFICATIONS = 20;

/**
 * What the bell shows: requests waiting for this account, answers to the requests it made, and work that
 * was shared or assigned to it. All of it is read from `account_links` and `shared_items`; the only thing
 * stored is `accounts.notifications_seen_at` ("last time the list was opened") to know what is new.
 * The badge counts requests still waiting plus anything else newer than that timestamp.
 */
export async function listNotifications(account, { now = Date.now() } = {}) {
  const since = now - NOTIFICATION_WINDOW_MS;
  const seenSupported = await supportsVerification();
  const seenAt = account.notifications_seen_at ? new Date(account.notifications_seen_at).getTime() : 0;
  const client = createSupabaseAdminClient();

  const links = await selectLinks((query) => query.or(`requester_id.eq.${account.id},target_id.eq.${account.id}`).order("created_at", { ascending: false }).limit(100));
  const { data: items, error } = await client
    .from("shared_items")
    .select("id, mode, item_type, title, sender_id, due_date, created_at, updated_at")
    .eq("recipient_id", account.id)
    .order("updated_at", { ascending: false })
    .limit(30);
  if (error) throw error;

  // Live shares made to this account (the sharing migration may not be applied yet: then there are none).
  let grants = [];
  if (await supportsSharing()) {
    const { data: grantRows, error: grantError } = await client
      .from("share_grants")
      .select("id, owner_id, item_kind, item_name, permission, created_at, updated_at")
      .eq("grantee_id", account.id)
      .is("revoked_at", null)
      .order("updated_at", { ascending: false })
      .limit(30);
    if (grantError) throw grantError;
    grants = grantRows || [];
  }

  const people = await findAccountsByIds([
    ...links.map((row) => (row.requesterId === account.id ? row.targetId : row.requesterId)),
    ...(items || []).map((row) => row.sender_id),
    ...grants.map((row) => row.owner_id)
  ]);
  const byId = new Map(people.map((row) => [row.id, row]));
  const person = (id, fallbackEmail = "") => ({ id: id || "", displayName: byId.get(id)?.display_name || "", role: byId.get(id)?.role || "", email: byId.get(id)?.email || fallbackEmail });
  const time = (value) => (value ? new Date(value).getTime() : 0);

  const pendingRequests = links
    .filter((row) => row.status === "pending" && row.targetId === account.id)
    .map((row) => ({ id: `req:${row.id}`, type: "link_request", linkId: row.id, at: row.createdAt, person: person(row.requesterId, row.requesterEmail), actionable: true }));

  const answers = links
    .filter((row) => row.requesterId === account.id && (row.status === "accepted" || row.status === "declined") && time(row.respondedAt) >= since)
    .map((row) => ({ id: `${row.status}:${row.id}`, type: row.status === "accepted" ? "link_accepted" : "link_declined", linkId: row.id, at: row.respondedAt, person: person(row.targetId, row.targetEmail) }));

  const received = (items || [])
    .filter((row) => time(row.updated_at || row.created_at) >= since)
    .map((row) => ({ id: `item:${row.id}:${row.updated_at}`, type: row.mode === "assign" ? "assigned" : "shared", at: row.updated_at || row.created_at, person: person(row.sender_id), title: row.title, itemType: row.item_type, dueDate: row.due_date || "" }));

  const granted = grants
    .filter((row) => time(row.updated_at || row.created_at) >= since)
    .map((row) => ({ id: `grant:${row.id}:${row.updated_at}`, type: "grant", at: row.updated_at || row.created_at, person: person(row.owner_id), title: row.item_name || "an item", itemKind: row.item_kind, permission: row.permission }));

  const events = [...answers, ...received, ...granted]
    .sort((a, b) => time(b.at) - time(a.at))
    .slice(0, MAX_NOTIFICATIONS)
    .map((event) => ({ ...event, unread: seenSupported && time(event.at) > seenAt }));

  const requests = pendingRequests.sort((a, b) => time(b.at) - time(a.at)).slice(0, MAX_NOTIFICATIONS);
  return {
    pendingRequests: requests,
    pendingCount: pendingRequests.length,
    events,
    unreadCount: pendingRequests.length + events.filter((event) => event.unread).length,
    seenSupported
  };
}
