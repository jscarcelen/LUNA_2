/**
 * One-time tokens for "confirm your email" and "reset your password".
 *
 * The token is 32 random bytes (base64url, 43 characters) that only ever exists in the email link. The
 * database keeps just its SHA-256 hash, so a leaked table cannot be turned back into working links.
 * A token works once (`used_at`), expires (48 h to verify, 1 h to reset), and asking for a new one of the
 * same kind removes the older ones.
 */
import { createHash, randomBytes } from "node:crypto";
import { createSupabaseAdminClient } from "./supabaseClient.js";
import { TOKEN_KINDS, TOKEN_TTL_MS } from "./accountsCore.js";

const SHAPE = /^[A-Za-z0-9_-]{43}$/;

export const hashToken = (token) => createHash("sha256").update(String(token)).digest("hex");

/** @returns {{ token: string, hash: string }} */
export function generateToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

const assertKind = (kind) => {
  if (!TOKEN_KINDS.includes(kind)) throw new Error(`Unknown token kind: ${kind}`);
};

/**
 * Creates a token for an account and invalidates every older one of the same kind.
 * @returns {Promise<{ token: string, expiresAt: string }>} `token` is the only copy; put it in the email and nowhere else.
 */
export async function issueToken(accountId, kind, { now = Date.now() } = {}) {
  assertKind(kind);
  const client = createSupabaseAdminClient();
  const { error: cleanupError } = await client.from("account_tokens").delete().eq("account_id", accountId).eq("kind", kind);
  if (cleanupError) throw cleanupError;
  const { token, hash } = generateToken();
  const expiresAt = new Date(now + TOKEN_TTL_MS[kind]).toISOString();
  const { error } = await client.from("account_tokens").insert({ account_id: accountId, kind, token_hash: hash, expires_at: expiresAt, used_at: null });
  if (error) throw error;
  return { token, expiresAt };
}

async function findLive(raw, kind, now) {
  assertKind(kind);
  const value = String(raw || "").trim();
  if (!SHAPE.test(value)) return null;
  const { data, error } = await createSupabaseAdminClient().from("account_tokens").select("id, account_id, kind, expires_at, used_at").eq("token_hash", hashToken(value)).maybeSingle();
  if (error) throw error;
  if (!data || data.kind !== kind || data.used_at || new Date(data.expires_at).getTime() <= now) return null;
  return data;
}

/** Is this token valid right now? Does not use it up (for showing a page before the person confirms). */
export async function peekToken(raw, kind, { now = Date.now() } = {}) {
  const row = await findLive(raw, kind, now);
  return row ? { ok: true, accountId: row.account_id } : { ok: false };
}

/**
 * Uses the token up. Exactly one caller wins: the update only matches a row that is still unused, so two
 * simultaneous requests cannot both succeed.
 * @returns {Promise<{ ok: true, accountId: string } | { ok: false }>}
 */
export async function consumeToken(raw, kind, { now = Date.now() } = {}) {
  const row = await findLive(raw, kind, now);
  if (!row) return { ok: false };
  const { data, error } = await createSupabaseAdminClient()
    .from("account_tokens")
    .update({ used_at: new Date(now).toISOString() })
    .eq("id", row.id)
    .is("used_at", null)
    .select("id");
  if (error) throw error;
  return data?.length ? { ok: true, accountId: row.account_id } : { ok: false };
}

/** Removes every token of this kind for an account (after a successful reset, for instance). */
export async function invalidateTokens(accountId, kind) {
  assertKind(kind);
  const { error } = await createSupabaseAdminClient().from("account_tokens").delete().eq("account_id", accountId).eq("kind", kind);
  if (error) throw error;
}
