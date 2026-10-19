/**
 * Browser-side cache for GET /api/workspaces-supabase (the whole folder tree, 3-7 s on a cold server).
 *  - stale-while-revalidate: `peekWorkspaces(key)` answers instantly from memory, `loadWorkspaces` refreshes behind it;
 *  - concurrent callers share ONE request (dedupe);
 *  - a result that is younger than `freshMs` is returned without asking again (a tab change does not reload the tree);
 *  - any mutation either stores the tree its answer carries (`storeWorkspaces`) or calls `invalidateWorkspaces`.
 * Memory only, keyed by account id (or "demo"), so two people on one shared Mac never see each other's tree.
 */
const FRESH_MS = 20000;
const entries = new Map(); // key -> { workspaces, at }
const inflight = new Map(); // key -> Promise

export const WORKSPACES_ENDPOINT = "/api/workspaces-supabase";
export const cacheKeyFor = (account) => (account && account.id ? `account:${account.id}` : "demo");

export function peekWorkspaces(key) {
  return entries.get(key)?.workspaces || null;
}

export function storeWorkspaces(key, workspaces) {
  if (Array.isArray(workspaces)) entries.set(key, { workspaces, at: Date.now() });
}

/** After a change the cached tree is stale: keep it for display, but the next load must go to the server. */
export function invalidateWorkspaces(key) {
  const hit = entries.get(key);
  if (hit) hit.at = -Infinity;
}

export function clearWorkspacesCache() {
  entries.clear();
  inflight.clear();
}

/**
 * Resolves with the workspace list. `force` skips the freshness window (still deduped with a request already in flight).
 * Rejects with an Error carrying the server message.
 */
export function loadWorkspaces(key, { force = false, fetcher = fetch, now = Date.now } = {}) {
  const hit = entries.get(key);
  if (!force && hit && now() - hit.at < FRESH_MS) return Promise.resolve(hit.workspaces);
  if (inflight.has(key)) return inflight.get(key);
  const request = (async () => {
    const response = await fetcher(WORKSPACES_ENDPOINT, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to load workspace data");
    const workspaces = data.workspaces || [];
    entries.set(key, { workspaces, at: now() });
    return workspaces;
  })().finally(() => { inflight.delete(key); });
  inflight.set(key, request);
  return request;
}
