/**
 * Sessions are stateless signed tokens, so "log out everywhere" needs one fact from the database: when did
 * this account last change its password? A session issued before that moment is dead.
 *
 * Feature-detected: while the verification migration is not applied the column does not exist and no
 * session is ever revoked (the previous behaviour). The answer is cached for a few seconds per server
 * instance, so the check costs about one tiny query per account per 15 s.
 */
import { createSupabaseAdminClient } from "./supabaseClient.js";
import { isMissingColumnError } from "./accountsCore.js";

const TTL_MS = 15000;
const cache = new Map(); // accountId -> { at, changedAt }

export function clearRevocationCache() {
  cache.clear();
}

/** Called right after a password change on this instance, so it takes effect here immediately. */
export function rememberPasswordChange(accountId, isoTime) {
  cache.set(accountId, { at: Date.now(), changedAt: isoTime || "" });
}

/** @returns {Promise<string>} ISO time of the last password change, or "" (never changed / column not there yet). */
export async function passwordChangedAtOf(accountId) {
  const hit = cache.get(accountId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.changedAt;
  const { data, error } = await createSupabaseAdminClient().from("accounts").select("password_changed_at").eq("id", accountId).maybeSingle();
  let changedAt = "";
  if (error) {
    if (!isMissingColumnError(error)) throw error;
  } else {
    changedAt = data?.password_changed_at || "";
  }
  cache.set(accountId, { at: Date.now(), changedAt });
  if (cache.size > 2000) for (const key of [...cache.keys()].slice(0, 500)) cache.delete(key);
  return changedAt;
}

/** True when the password was changed after this session was issued (whole seconds, like the token's `iat`). */
export function isSessionRevoked(session, changedAt) {
  if (!session || !changedAt) return false;
  const changed = Math.floor(new Date(changedAt).getTime() / 1000);
  return Number.isFinite(changed) && Number(session.issuedAt || 0) < changed;
}

export async function sessionIsCurrent(session) {
  if (!session) return false;
  return !isSessionRevoked(session, await passwordChangedAtOf(session.accountId));
}
