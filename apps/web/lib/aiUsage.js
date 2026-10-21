/**
 * Counts the AI each request uses and keeps every account inside its monthly AI credits (see usageCore.js).
 *
 * Every route that calls a model provider wraps its handler:
 *
 *   export const POST = meteredAi("quizzes", async function POST(request) { ... });
 *
 * The wrapper (1) refuses new AI work when a logged-in account has used this month's credits (grading and reading
 * uploads always go on), (2) runs the handler in a scope where every `fetch` to OpenAI / Anthropic / the formula OCR
 * is counted from the provider's own usage numbers (a copy of the answer is read, the caller's answer is untouched,
 * streamed answers included), and (3) after the response has gone out, writes one row per request to
 * `ai_usage_events`. Nothing in the AI pipeline needs to know about it. Before migration 202610210003 is applied
 * nothing is limited or written.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { NextResponse } from "next/server";
import { accountIdFor } from "./session.js";
import { getDemoOwnerUserId, isSupabaseConfigured } from "./supabaseClient.js";
import { afterResponse } from "./afterResponse.js";
import { formatDate, translate } from "./i18n/index.js";
import { localeFromRequest } from "./i18n/server.js";
import { NEVER_BLOCKED, OCR_CALL_TOKENS, providerOf, tokensFromBody } from "./usageCore.js";
import { isUsageSetupMissing, readAiUsage, readStorageUsage, recordAiUsage } from "./usageRepository.js";

const meterScope = new AsyncLocalStorage();
const METER_FLAG = Symbol.for("luna.aiFetchMeter");

/** Wraps the global fetch once. Outside a metered request it only passes the call through. */
export function installFetchMeter() {
  const current = globalThis.fetch;
  if (typeof current !== "function" || current[METER_FLAG]) return;
  const metered = async function meteredFetch(input, init) {
    const store = meterScope.getStore();
    const kind = store ? providerOf(typeof input === "string" ? input : input?.url || String(input || "")) : "";
    if (!kind) return current(input, init);
    store.calls += 1;
    // Registered before the call goes out, so a call still running when the response ends (background work) is waited for.
    let done = () => {};
    store.pending.push(new Promise((resolve) => { done = resolve; }));
    try {
      const response = await current(input, init);
      if (kind === "ocr") {
        store.tokens += OCR_CALL_TOKENS;
        done();
      } else if (response?.body && typeof response.clone === "function") {
        response.clone().text().then((text) => { store.tokens += tokensFromBody(text); }, () => {}).finally(done);
      } else {
        done();
      }
      return response;
    } catch (error) {
      done();
      throw error;
    }
  };
  metered[METER_FLAG] = true;
  globalThis.fetch = metered;
}

/** Re-labels the current request (a route that does several things, e.g. the workspace route reading an upload). */
export function setAiActivity(activity) {
  const store = meterScope.getStore();
  if (store && activity) store.activity = activity;
}

/** Null when the owner may store more files, else the 413 to send back. */
export async function denyOverStorage(ownerUserId, request = null) {
  if (!ownerUserId || !isSupabaseConfigured() || setupMissing()) return null;
  try {
    const storage = await readStorageUsage(ownerUserId);
    if (storage.usedBytes < storage.limitBytes) return null;
    return NextResponse.json({ error: translate(localeFromRequest(request), "usage.storageFull"), storageFull: true }, { status: 413 });
  } catch (error) {
    if (isUsageSetupMissing(error)) noteSetupMissing();
    else console.warn("[storage] check failed:", error?.message || error);
    return null;
  }
}

let setupMissingUntil = 0;
const setupMissing = () => Date.now() < setupMissingUntil;
const noteSetupMissing = () => { setupMissingUntil = Date.now() + 60_000; };

/** Null when the account may use more AI this month, else the 429 to send back. */
export async function denyOverAllowance(accountId, role, request = null) {
  if (!accountId || !isSupabaseConfigured() || setupMissing()) return null;
  try {
    const usage = await readAiUsage(accountId, role);
    if (usage.leftCredits > 0) return null;
    const locale = localeFromRequest(request);
    return NextResponse.json({ error: translate(locale, "usage.usedUp", { date: formatDate(usage.resetsAt, locale, { day: "numeric", month: "long" }) }), aiCreditsUsedUp: true, resetsAt: usage.resetsAt }, { status: 429 });
  } catch (error) {
    if (isUsageSetupMissing(error)) noteSetupMissing();
    else console.warn("[ai-usage] allowance check failed:", error?.message || error);
    return null; // never block on a meter failure
  }
}

async function roleOf(accountId) {
  try {
    const { findAccountById } = await import("./accountsRepository.js");
    return (await findAccountById(accountId))?.role || "student";
  } catch {
    return "student";
  }
}

export function meteredAi(activity, handler) {
  return async function meteredHandler(request, context) {
    installFetchMeter();
    const accountId = accountIdFor(request);
    if (accountId && !NEVER_BLOCKED.has(activity)) {
      const blocked = await denyOverAllowance(accountId, await roleOf(accountId), request);
      if (blocked) return blocked;
    }
    const store = { activity, tokens: 0, calls: 0, pending: [] };
    const response = await meterScope.run(store, () => handler(request, context));
    // After the answer (a streamed one included) has gone out, every provider call has happened: write one row.
    await afterResponse(async () => {
      while (store.pending.length) await Promise.allSettled(store.pending.splice(0));
      if (!store.calls || !isSupabaseConfigured() || setupMissing()) return;
      try {
        await recordAiUsage({ ownerUserId: accountId || getDemoOwnerUserId(), activity: store.activity, tokens: store.tokens, calls: store.calls });
      } catch (error) {
        if (isUsageSetupMissing(error)) noteSetupMissing();
        else throw error;
      }
    });
    return response;
  };
}

/** For tests: run `work` as a metered request without a route. */
export function runMetered(activity, work) {
  installFetchMeter();
  const store = { activity, tokens: 0, calls: 0, pending: [] };
  return meterScope.run(store, async () => {
    const result = await work();
    while (store.pending.length) await Promise.allSettled(store.pending.splice(0));
    return { result, tokens: store.tokens, calls: store.calls, activity: store.activity };
  });
}
