/**
 * Pure rules of the AI credits and storage meters (no I/O, so tests can cover them).
 *
 * AI credits: 1 credit = 1,000 model tokens. Every account gets a monthly allowance that starts again on the 1st
 * (UTC). The defaults keep a full month of every account inside a predictable bill on Luna 3 Pro (gpt-4o, about
 * $3.5 per million tokens with Luna's mostly-input mix): students and parents 1,000 credits (~$3.5 at most),
 * teachers 3,000 (they make material for whole classes). `LUNA_AI_MONTHLY_CREDITS` (students and parents) and
 * `LUNA_AI_MONTHLY_CREDITS_TEACHER` override them.
 *
 * Storage: what an account's files take in the database. Default 100 MB each (`LUNA_STORAGE_LIMIT_MB`).
 */

export const TOKENS_PER_CREDIT = 1000;
export const DEFAULT_MONTHLY_CREDITS = { student: 1000, parent: 1000, teacher: 3000 };
export const DEFAULT_STORAGE_LIMIT_MB = 100;
/** A Mathpix formula read has no tokens; it is counted like a small model call. */
export const OCR_CALL_TOKENS = 500;

/** Activities the breakdown names, in display order. */
export const AI_ACTIVITIES = ["creating", "studyPlans", "askLuna", "grading", "readingFiles", "coach", "concepts", "templates", "other"];
/**
 * Work that keeps going when the month's credits are used up (still counted): a student can always finish and get
 * marked homework, and an uploaded file is always read.
 */
export const NEVER_BLOCKED = new Set(["grading", "readingFiles"]);

const MODEL_HOSTS = new Set(["api.openai.com", "api.anthropic.com"]);

/** Is this URL a model provider whose answer carries a token count? ("ocr" for the formula OCR endpoint.) */
export function providerOf(url, env = process.env) {
  let host = "";
  try {
    host = new URL(String(url)).host;
  } catch {
    return "";
  }
  if (MODEL_HOSTS.has(host)) return "model";
  const ocr = String(env.MATH_OCR_ENDPOINT || "").trim();
  if (ocr) {
    try {
      if (new URL(ocr).host === host) return "ocr";
    } catch { /* not a URL */ }
  }
  return "";
}

/**
 * Tokens a provider answer reports. Works on a plain JSON body and on a streamed (SSE) one: OpenAI puts
 * `total_tokens` in its usage object (the last one of a stream is the total); Anthropic reports `input_tokens`
 * at the start of a stream and `output_tokens` at the end, so the largest of each is taken.
 */
export function tokensFromBody(text) {
  const body = String(text || "");
  const totals = [...body.matchAll(/"total_tokens"\s*:\s*(\d+)/g)].map((m) => Number(m[1]));
  if (totals.length) return totals[totals.length - 1];
  const largest = (key) => Math.max(0, ...[...body.matchAll(new RegExp(`"${key}"\\s*:\\s*(\\d+)`, "g"))].map((m) => Number(m[1])));
  return largest("input_tokens") + largest("output_tokens") + largest("cache_read_input_tokens") + largest("cache_creation_input_tokens");
}

const positiveInt = (value) => {
  const n = Math.round(Number(String(value ?? "").trim()));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function monthlyCreditsFor(role, env = process.env) {
  if (role === "teacher") return positiveInt(env.LUNA_AI_MONTHLY_CREDITS_TEACHER) || DEFAULT_MONTHLY_CREDITS.teacher;
  return positiveInt(env.LUNA_AI_MONTHLY_CREDITS) || DEFAULT_MONTHLY_CREDITS[role] || DEFAULT_MONTHLY_CREDITS.student;
}

export function storageLimitBytes(env = process.env) {
  return (positiveInt(env.LUNA_STORAGE_LIMIT_MB) || DEFAULT_STORAGE_LIMIT_MB) * 1024 * 1024;
}

/** The current allowance window: from the 1st of this month (UTC) to the 1st of the next. */
export function monthWindow(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const resetsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start: start.toISOString(), resetsAt: resetsAt.toISOString() };
}

export const creditsOf = (tokens) => Math.ceil((Number(tokens) || 0) / TOKENS_PER_CREDIT);

/** Rows `{ activity, tokens, calls, created_at }` → the AI meter. */
export function summariseAiUsage(rows, { limitCredits, resetsAt }) {
  const byActivity = new Map();
  let tokens = 0;
  for (const row of rows || []) {
    const activity = AI_ACTIVITIES.includes(row.activity) ? row.activity : "other";
    const entry = byActivity.get(activity) || { activity, tokens: 0, uses: 0 };
    entry.tokens += Number(row.tokens) || 0;
    entry.uses += 1;
    byActivity.set(activity, entry);
    tokens += Number(row.tokens) || 0;
  }
  const usedCredits = creditsOf(tokens);
  return {
    usedCredits,
    limitCredits,
    leftCredits: Math.max(0, limitCredits - usedCredits),
    percentUsed: limitCredits ? Math.min(100, Math.round((usedCredits / limitCredits) * 100)) : 0,
    resetsAt,
    byActivity: [...byActivity.values()].map((entry) => ({ activity: entry.activity, credits: creditsOf(entry.tokens), uses: entry.uses })).sort((a, b) => b.credits - a.credits)
  };
}

/** Rows from `account_storage_by_document` → the storage meter (by kind, and the biggest files). */
export function summariseStorage(rows, { limitBytes }) {
  const kinds = { uploaded: 0, generated: 0, index: 0, downloads: 0 };
  const files = [];
  for (const row of rows || []) {
    const doc = Number(row.document_bytes) || 0;
    const index = Number(row.index_bytes) || 0;
    const exportsBytes = Number(row.export_bytes) || 0;
    kinds[row.source_type === "generated" ? "generated" : "uploaded"] += doc;
    kinds.index += index;
    kinds.downloads += exportsBytes;
    files.push({ id: row.document_id, name: row.name, subject: row.subject_name || "", kind: row.source_type === "generated" ? "generated" : "uploaded", bytes: doc + index + exportsBytes });
  }
  const usedBytes = kinds.uploaded + kinds.generated + kinds.index + kinds.downloads;
  return {
    usedBytes,
    limitBytes,
    percentUsed: limitBytes ? Math.min(100, Math.round((usedBytes / limitBytes) * 100)) : 0,
    files: files.length,
    byKind: Object.entries(kinds).map(([kind, bytes]) => ({ kind, bytes })).filter((entry) => entry.bytes > 0).sort((a, b) => b.bytes - a.bytes),
    biggest: files.sort((a, b) => b.bytes - a.bytes).slice(0, 5)
  };
}
