/**
 * What the prompt improver of "Iterate" gets to read: the current result as a NUMBERED outline, so
 * "change question 3", "the last section" or "more detail in the answers" can be tied to a real part
 * of it, plus the names of the output fields so "the answers" can be tied to a real field.
 */

const clip = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const show = (value, max) => clip(Array.isArray(value) ? value.map((entry) => (entry && typeof entry === "object" ? Object.values(entry).join(" / ") : entry)).join(" | ") : value && typeof value === "object" ? JSON.stringify(value) : value, max);
const isEmpty = (value) => value === null || value === undefined || value === "" || (Array.isArray(value) && !value.length);

/** @param {{ blocks?: any, items?: any, maxChars?: number }} [input] */
export function describeResult({ blocks = null, items = null, maxChars = 9000 } = {}) {
  const rows = Array.isArray(blocks) && blocks.length ? blocks : Array.isArray(items) ? items : [];
  const fromBlocks = rows === blocks;
  const per = Math.max(140, Math.floor(maxChars / Math.max(1, rows.length)));
  const fieldNames = [];
  let questionNumber = 0;
  const lines = rows.map((row, index) => {
    const entries = Object.entries(row || {}).filter(([key, value]) => key !== "type" && !key.startsWith("_") && !isEmpty(value));
    for (const [key] of entries) if (!fieldNames.includes(key)) fieldNames.push(key);
    const each = Math.max(40, Math.floor(per / Math.max(1, entries.length)));
    const body = entries.map(([key, value]) => `${key}: ${show(value, each)}`).join("; ");
    if (!fromBlocks) return `[${index + 1}] Item ${index + 1} — ${body}`;
    const isQuestion = /^question_/.test(String(row.type || ""));
    if (isQuestion) questionNumber += 1;
    return `[${index + 1}] ${isQuestion ? `Question ${questionNumber}` : String(row.type || "block")} (${row.type}) — ${body}`;
  });
  return { outline: lines.join("\n").slice(0, maxChars + 400), fieldNames, count: rows.length };
}

/** The brief, the scope and the targets, as the text the writer receives. */
/** @param {string} request @param {any} improved */
export function composeRefinementPrompt(request, improved) {
  const lines = (title, list) => (list?.length ? `${title}:\n${list.map((entry) => `- ${entry}`).join("\n")}` : "");
  const targets = (improved.targets || []).map((target) => `${target.ref}: ${target.change}`);
  const scopeText = {
    whole_result: "the whole result — apply the change across every part it concerns",
    specific_items: "ONLY the targets listed below — every other part must stay exactly as it is (same wording, same order)",
    one_field_everywhere: `the field(s) ${improved.fields?.length ? improved.fields.join(", ") : "named in the brief"} in EVERY item — change nothing else`,
    add_content: "new content to ADD — keep what exists and add the new parts where the brief says",
    other: "as the brief says"
  }[improved.scope] || "as the brief says";
  return [
    `REQUEST: ${request}`,
    `SCOPE: ${scopeText}`,
    `BRIEF: ${improved.brief}`,
    lines("TARGETS (change exactly these)", targets),
    lines("CHECKLIST (all must be true in the new result)", improved.checklist),
    lines("ORIGINAL LIMITS THIS REQUEST OVERRIDES", improved.relax),
    lines("KEEP", improved.keep)
  ].filter(Boolean).join("\n\n");
}
