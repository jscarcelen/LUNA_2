/**
 * Lunas — the user's AI credit account. 1 luna = 1 model token for now; the monetisation rules
 * (tiers per archetype, overage pricing, marketplace fees, transfers) come later and will replace
 * this local ledger with a server-side one. Stored in localStorage until accounts exist.
 */

export const CREDITS_STORAGE_KEY = "luna.credits.v1";
export const CREDITS_EVENT = "luna:credits";
export const INITIAL_GRANT = 1_000_000;

function emptyLedger() {
  return { balance: INITIAL_GRANT, granted: INITIAL_GRANT, spent: 0, history: [], createdAt: new Date().toISOString() };
}

export function readCredits() {
  if (typeof window === "undefined") return emptyLedger();
  try {
    const raw = window.localStorage.getItem(CREDITS_STORAGE_KEY);
    if (!raw) {
      const fresh = emptyLedger();
      window.localStorage.setItem(CREDITS_STORAGE_KEY, JSON.stringify(fresh));
      return fresh;
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? { ...emptyLedger(), ...parsed } : emptyLedger();
  } catch {
    return emptyLedger();
  }
}

function writeCredits(ledger) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CREDITS_STORAGE_KEY, JSON.stringify(ledger));
    window.dispatchEvent(new CustomEvent(CREDITS_EVENT, { detail: ledger }));
  } catch {
    // storage unavailable — in-memory only
  }
}

/** Charges a run. `usage` is OpenAI's usage object when available; `fallbackTokens` is the pre-run estimate. */
export function chargeRun({ agentName = "", usage = null, fallbackTokens = 0, model = "" } = {}) {
  const tokens = Math.max(0, Math.round(Number(usage?.total_tokens ?? fallbackTokens) || 0));
  if (!tokens) return readCredits();
  const ledger = readCredits();
  const next = {
    ...ledger,
    balance: ledger.balance - tokens,
    spent: ledger.spent + tokens,
    history: [{ at: new Date().toISOString(), agentName, model, tokens, estimated: !usage }, ...ledger.history].slice(0, 50)
  };
  writeCredits(next);
  return next;
}

export function topUp(tokens) {
  const ledger = readCredits();
  const next = { ...ledger, balance: ledger.balance + tokens, granted: ledger.granted + tokens };
  writeCredits(next);
  return next;
}

export function formatLunas(value) {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 1000)}k`;
  return n.toLocaleString("en-US");
}

export function formatUsd(value) {
  const n = Number(value) || 0;
  return n < 0.01 ? `<$0.01` : `$${n.toFixed(2)}`;
}
