/**
 * Count-based agents (quiz, flashcards, problem sets…): getting the number of items the runner asked for.
 *
 * Why runs came back short ("8 items, 20 requested"): one model call wrote the whole set inside a fixed
 * output budget (6,000 tokens, 3,000 on the retry) while every item also carries its source, an exact
 * supporting quote and a support level; models also stop early on long lists; and the grounding check
 * then drops items whose quote is not in the material. So after the first call the runner asks for the
 * missing items in follow-up calls that list what already exists (so nothing is repeated), and stops
 * when a call brings nothing new: then the material really has no more distinct ideas, and fewer is fine.
 *
 * Pure functions: agentBuilder.js runs them, the tests check them.
 */

/** Follow-up calls after the first one, at most. */
export const MAX_TOP_UP_ROUNDS = 3;
/** Output budget of one call, in tokens (gpt-4o and gpt-4.1 write at most 16,384). */
export const MIN_OUTPUT_TOKENS = 6000;
export const MAX_OUTPUT_TOKENS = 16000;

const asNumber = (value) => {
  const n = Number(String(Array.isArray(value) ? value[0] : value ?? "").trim());
  return Number.isFinite(n) && n > 0 && n < 500 ? Math.round(n) : 0;
};

/**
 * How many items the runner asked for: the input a `count_matches_input` rule points at, else an answer to
 * a "how many / number of" question. 0 when the agent has no count.
 */
export function requestedCount(config = {}) {
  const rules = Array.isArray(config.spec?.validationRules) ? config.spec.validationRules : Array.isArray(config.validationRules) ? config.validationRules : [];
  const rule = rules.find((entry) => entry?.type === "count_matches_input");
  if (rule) {
    const fromInput = asNumber(config.inputValues?.[rule.inputId]);
    if (fromInput) return fromInput;
    const input = (config.spec?.inputs || []).find((entry) => entry.id === rule.inputId);
    const answered = input ? (config.questionAnswers || []).find((entry) => entry.question === input.name)?.answer : undefined;
    if (asNumber(answered)) return asNumber(answered);
    if (asNumber(input?.default)) return asNumber(input.default);
  }
  for (const entry of config.questionAnswers || []) {
    if (/how many|number of|cu[aá]nt[oa]s|n[uú]mero de/i.test(String(entry?.question || "")) && asNumber(entry.answer)) return asNumber(entry.answer);
  }
  return 0;
}

/** The output budget for a call that writes `expectedTokens`: room to spare, never below the old 6,000. */
export function outputTokenBudget(expectedTokens) {
  const wanted = Math.round((Number(expectedTokens) || 0) * 1.6) + 1500;
  return Math.min(MAX_OUTPUT_TOKENS, Math.max(MIN_OUTPUT_TOKENS, wanted));
}

const norm = (value) => String(value ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** What makes an item itself: its first content field (the question, the front of a card…). */
export function itemKey(item, keyField = "") {
  if (!item || typeof item !== "object") return "";
  if (keyField && item[keyField] !== undefined) return norm(item[keyField]);
  const field = ["question", "front", "prompt", "problem", "statement", "term", "word", "title", "point"].find((name) => item[name] !== undefined && item[name] !== null && item[name] !== "");
  if (field) return norm(item[field]);
  const first = Object.entries(item).find(([name, value]) => !name.startsWith("_") && typeof value === "string" && value.trim());
  return first ? norm(first[1]) : "";
}

/** The new items that are not already in the set (nor repeated among themselves). */
export function freshItems(existing = [], incoming = [], keyField = "") {
  const seen = new Set(existing.map((item) => itemKey(item, keyField)).filter(Boolean));
  const out = [];
  for (const item of incoming) {
    const key = itemKey(item, keyField);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** The note added to a follow-up call: how many more, and what already exists, so the model writes only new items. */
export function topUpInstruction(missing, existing = [], keyField = "") {
  const list = existing.map((item) => {
    const field = keyField || ["question", "front", "prompt", "problem", "statement", "term", "word", "title", "point"].find((name) => item?.[name]);
    return String(field ? item[field] : "").replace(/\s+/g, " ").trim().slice(0, 160);
  }).filter(Boolean);
  return `\n\nTOP-UP: the set already has these ${list.length} items (listed by their first field):\n${list.map((entry) => `- ${entry}`).join("\n")}\nWrite ${missing} NEW item${missing === 1 ? "" : "s"} for the same set: each one about a concept, fact or skill of the reference material that none of the items above covers, because a repeated item teaches nothing new. Follow every rule above. If the material has fewer than ${missing} further distinct ideas, write only as many as it really supports (it is fine to write fewer), because filler items mislead the learner.`;
}

/**
 * What to tell the runner about the count. `exhausted` = the last follow-up call brought nothing new.
 * kind: "exact" (made what was asked) | "short" (fewer; `exhausted` says whether the material ran out) | "none" (no count asked).
 */
export function countOutcome({ requested = 0, made = 0, exhausted = false, rounds = 0 } = {}) {
  if (!requested) return { kind: "none", requested: 0, made, missing: 0, exhausted: false, rounds };
  if (made >= requested) return { kind: "exact", requested, made, missing: 0, exhausted: false, rounds };
  return { kind: "short", requested, made, missing: requested - made, exhausted: Boolean(exhausted), rounds };
}

/**
 * Splits the agent's checks: a count shortfall is information, not an error (the result is usable), so it is
 * shown calmly; anything else that failed (a missing field, duplicates, an answer not among its options) is
 * a real problem with the output.
 */
export function splitChecks(checks = []) {
  const failed = (Array.isArray(checks) ? checks : []).filter((check) => check && !check.ok);
  return { count: failed.filter((check) => check.rule === "count_matches_input"), problems: failed.filter((check) => check.rule !== "count_matches_input") };
}

/** The runner's answers with the count replaced by `n`, so a follow-up call asks for the missing items only. */
export function withCount(config = {}, n) {
  const rules = Array.isArray(config.spec?.validationRules) ? config.spec.validationRules : [];
  const rule = rules.find((entry) => entry?.type === "count_matches_input");
  const inputName = rule ? (config.spec?.inputs || []).find((entry) => entry.id === rule.inputId)?.name : "";
  return (config.questionAnswers || []).map((entry) => {
    const question = String(entry?.question || "");
    const isCount = (inputName && question === inputName) || /how many|number of|cu[aá]nt[oa]s|n[uú]mero de/i.test(question);
    return isCount && asNumber(entry.answer) ? { ...entry, answer: String(n) } : entry;
  });
}

/** The word for what an agent makes, for the count note: "cards", "questions" or "items". */
export function countNoun(agentName = "") {
  const name = String(agentName || "").toLowerCase();
  if (/flash ?card|\bcards?\b|vocab/.test(name)) return "cards";
  if (/quiz|question|exam|test|problem/.test(name)) return "questions";
  return "items";
}

/**
 * The count note of a result, or null when there is nothing to say: { made, requested, missing, exhausted }.
 * Uses the run's own `countOutcome`; a result without one (older, or saved) falls back to its count check.
 */
export function shortfallOf(output, config = {}) {
  if (!output || output.isBlockOutput) return null;
  const outcome = output.countOutcome;
  if (outcome) return outcome.kind === "short" ? { made: outcome.made, requested: outcome.requested, missing: outcome.missing, exhausted: Boolean(outcome.exhausted) } : null;
  const { count } = splitChecks(output.checks);
  if (!count.length) return null;
  const made = Array.isArray(output.items) ? output.items.length : 0;
  const requested = requestedCount(config);
  return requested > made ? { made, requested, missing: requested - made, exhausted: false } : null;
}
