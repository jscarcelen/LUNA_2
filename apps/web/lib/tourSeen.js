/**
 * "Has this person seen the first-run tour?" — decided per ACCOUNT, not per browser (a shared school Mac must not
 * show it again at every login, nor hide it from the next pupil).
 *  - the account's `tour_seen_at` (migration 202610190001_account_tour_seen.sql) is the source of truth when it exists;
 *  - without the migration the flag lives in localStorage under a key that includes the account id;
 *  - the public demo (no account) keeps the old per-browser key.
 * Pure helpers: FirstRunTour, the platform page and the route use them, tests cover them.
 */
export const TOUR_BASE_KEY = "luna.tour.v1";

export const tourStorageKey = (accountId) => (accountId ? `${TOUR_BASE_KEY}.${accountId}` : TOUR_BASE_KEY);

/**
 * @param {{ accountId?: string, serverSeen?: boolean|null, localValue?: string|null }} facts
 *   serverSeen: true/false from the account row, null/undefined when the column does not exist yet.
 */
export function shouldAutoOpenTour({ accountId = "", serverSeen = null, localValue = null } = {}) {
  if (accountId && serverSeen === true) return false;
  return localValue !== "1";
}
