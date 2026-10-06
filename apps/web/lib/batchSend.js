/**
 * Sending to many people at once (a group, or several people): the shared plumbing of "Share…", "Assign" and
 * "Send an exam date" for a batch.
 *
 *  - who: groups + individuals become one de-duplicated list (modules/accounts/groups.js `resolveRecipients`); the
 *    members of a group are only those still connected (lib/groupsRepository.js);
 *  - one lookup for everybody: the people and the sender's accepted links are read once (`loadRecipientContexts`),
 *    not once per person;
 *  - a brake: a sender can reach `batchDeliveriesBySender.limit` people an hour (`reserveDeliveries`);
 *  - a time budget: people are processed a few at a time and, when the request's budget runs out, the rest come back
 *    as `deferred` so the page can send again to finish (`runPool`);
 *  - a per-person answer: `{ recipientId, ok, alreadyHadIt?, reason?, status?, error?, via }` and a summary
 *    `{ delivered, skipped: { not_connected, already_has_it, failed }, deferred }`.
 */
import { LinkError } from "./accountsCore.js";
import { limits } from "./accountLimits.js";
import { findAccountsByIds, listAcceptedLinkMap } from "./accountsRepository.js";
import { resolveBatchRecipients } from "./groupsRepository.js";
import { MAX_BATCH_RECIPIENTS, runPool, summarizeResults } from "../modules/accounts/groups.js";

/** How long a request works before it hands back what is left (the routes allow 60 s). */
export const BATCH_BUDGET_MS = 45000;
export const BATCH_CONCURRENCY = 4;

/** Refuses a batch bigger than the cap or than what the sender may still reach this hour. */
export function reserveDeliveries(senderId, count) {
  if (count > MAX_BATCH_RECIPIENTS) throw new LinkError("too_many", `You can send to at most ${MAX_BATCH_RECIPIENTS} people at once.`, 400);
  const remaining = limits.batchDeliveriesBySender.remaining(senderId);
  if (count > remaining) throw new LinkError("rate_limited", `You have sent to a lot of people in the last hour. You can reach about ${remaining} more now; please try again later.`, 429);
}

/** Counts the people actually reached (called once the sends are done, so a refused request costs nothing). */
export function recordDeliveries(senderId, count) {
  for (let index = 0; index < count; index += 1) limits.batchDeliveriesBySender.fail(senderId);
}

/** People and links for the recipients, read once. Missing people are simply absent from the map. */
export async function loadRecipientContexts(sender, recipientIds) {
  const [people, links] = await Promise.all([findAccountsByIds(recipientIds), listAcceptedLinkMap(sender.id)]);
  const byId = new Map(people.map((row) => [row.id, row]));
  return new Map(recipientIds.map((id) => [id, { recipient: byId.get(id) || null, link: links.get(id) || null }]));
}

/**
 * Resolves who a batch goes to and checks the size / rate limit.
 * @returns {Promise<{ recipients: Array<{ id: string, via: string[], individual: boolean }>, groupsUsed: object[], contexts: Map<string, { recipient: object | null, link: object | null }> }>}
 */
export async function prepareBatch(sender, { groupIds = [], recipientIds = [] }) {
  const resolved = await resolveBatchRecipients(sender, { groupIds, individualIds: recipientIds });
  if (resolved.unknownGroups.length && !resolved.recipients.length) throw new LinkError("not_found", "That group was not found.", 404);
  if (!resolved.recipients.length) throw new LinkError("bad_request", "Choose at least one person or group.");
  reserveDeliveries(sender.id, resolved.recipients.length);
  const contexts = await loadRecipientContexts(sender, resolved.recipients.map((entry) => entry.id));
  return { recipients: resolved.recipients, groupsUsed: resolved.groupsUsed, contexts };
}

/**
 * Runs `deliver(recipientId, context)` for everybody and shapes the per-person results and the summary.
 * `deliver` returns `{ ok: true, ...details, alreadyHadIt? }` or throws a LinkError (which becomes a skipped result).
 * @param {{ recipients: Array<{ id: string, via: string[] }>, contexts: Map<string, object> }} batch
 * @param {(recipientId: string, context: object) => Promise<object>} deliver
 */
export async function runBatch(sender, batch, deliver, { budgetMs = BATCH_BUDGET_MS, concurrency = BATCH_CONCURRENCY, now = () => Date.now() } = {}) {
  const deadline = now() + budgetMs;
  const raw = await runPool(batch.recipients, async (entry) => {
    const context = batch.contexts.get(entry.id) || { recipient: null, link: null };
    try {
      const done = await deliver(entry.id, context);
      return { recipientId: entry.id, via: entry.via, ok: true, ...done };
    } catch (error) {
      if (!(error instanceof LinkError)) throw error;
      return { recipientId: entry.id, via: entry.via, ok: false, error: error.message, status: error.status };
    }
  }, { concurrency, deadline, now });
  const results = raw.map((result, index) => (result.deferred ? { recipientId: batch.recipients[index].id, via: batch.recipients[index].via, ok: false, deferred: true } : result.recipientId ? result : { recipientId: batch.recipients[index].id, via: batch.recipients[index].via, ok: false, reason: result.reason || "failed", error: result.error || "" }));
  const summary = summarizeResults(results);
  recordDeliveries(sender.id, summary.delivered);
  return { results, summary };
}
