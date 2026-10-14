/**
 * Grounding: how Luna checks that what an agent wrote is really in the learner's material.
 *
 * Citing a source says where an answer came from; it does not prove the answer matches it. Four checks close that gap:
 *  1. QUOTE-AND-VERIFY. The model must return, for every item, the exact words of the material that support it (`_quote`)
 *     and the passage they come from (`_source`). Code then looks for those words in that passage. A quote that is not there
 *     is a fabrication caught, not a judgement call.
 *  2. SUPPORT LABEL. The model says whether the item is `stated` in the material or `inferred` from it (`_support`). The reader
 *     sees which one, so a reasoned step is never presented as a quotation.
 *  3. NUMBERS. Every figure in the output (two digits or a decimal) must appear in the material; one that does not is flagged.
 *  4. SECOND PASS. A separate, cheap model call reads each item next to its passage and answers supported / partly / unsupported.
 * The result on each item is `_grounding: { level, quote, reasons }` with level `verified` | `inferred` | `unverified`.
 * Items that fail are dropped when the run is strict and enough remain, otherwise they are kept and flagged.
 * Pure functions except `judgeSupport`, which calls the model (off with LUNA_GROUNDING_JUDGE=off).
 */

export const GROUNDING_MODEL = () => process.env.LUNA_GROUNDING_MODEL || "gpt-4o-mini";
export const judgeEnabled = () => String(process.env.LUNA_GROUNDING_JUDGE || "on").toLowerCase() !== "off";

/** What the model is told, added to the agent's request. */
export const GROUNDING_INSTRUCTION = `GROUNDING (mandatory): use ONLY the referenceMaterial, because the learner is examined on it and anything else may contradict their course. For every item set _source to the sourceId of the passage it comes from, _quote to the exact words of that passage that support it (copied character for character, at most 300 characters, no paraphrase), and _support to "stated" when the passage says it directly or "inferred" when it follows from the passage by reasoning. If the material does not contain enough to write an item, write fewer items: never fill the gap from your own knowledge and never invent a quote, a figure or a formula.`;

export const QUOTE_FIELD = { type: "string", description: "The exact words of the cited passage that support this item, copied character for character (max 300 characters). Empty only when _support is inferred and no single sentence supports it." };
export const SUPPORT_FIELD = { type: "string", enum: ["stated", "inferred"], description: "stated = the cited passage says it directly; inferred = it follows from the passage by reasoning." };

/** Lower-case words only, so quote marks, hyphens, line breaks and LaTeX spacing never hide a match. */
export const norm = (value) => String(value ?? "").toLowerCase().replace(/\\[a-z]+/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

const grams = (words, size) => { const out = new Set(); for (let i = 0; i + size <= words.length; i += 1) out.add(words.slice(i, i + size).join(" ")); return out; };

/**
 * Is `quote` in the text? exact = the words appear in order; close = at least 80 % of its word triples do (a dropped word or
 * a changed symbol); none otherwise. Quotes of fewer than 4 words cannot be told from coincidence and count as none.
 */
export function matchQuote(quote, text) {
  const q = norm(quote);
  const t = norm(text);
  const words = q.split(" ").filter(Boolean);
  if (words.length < 4 || !t) return { status: "none", score: 0 };
  if (t.includes(q)) return { status: "exact", score: 1 };
  const quoteGrams = grams(words, 3);
  if (!quoteGrams.size) return { status: "none", score: 0 };
  const textGrams = grams(t.split(" "), 3);
  let hit = 0;
  for (const gram of quoteGrams) if (textGrams.has(gram)) hit += 1;
  const score = hit / quoteGrams.size;
  return { status: score >= 0.8 ? "close" : "none", score };
}

/** The readable claim of an item: its content fields, never its bookkeeping (_source, _quote…). */
export function claimText(item, max = 900, { skip = [] } = {}) {
  const parts = [];
  const walk = (value) => {
    if (value === null || value === undefined) return;
    if (typeof value === "string") { if (value.trim()) parts.push(value.trim()); return; }
    if (typeof value === "number") { parts.push(String(value)); return; }
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (typeof value === "object") for (const [key, entry] of Object.entries(value)) if (!key.startsWith("_") && !skip.includes(key.toLowerCase())) walk(entry);
  };
  walk(item);
  return parts.join(" | ").slice(0, max);
}

const NUMBER = /\d+(?:[.,]\d+)?/g;
/** Figures (two digits or a decimal) in `text` that the material never mentions. */
export function ungroundedNumbers(text, materialText) {
  const material = String(materialText || "").replace(/(\d),(\d{3})/g, "$1$2");
  const have = new Set((material.match(NUMBER) || []).map((n) => n.replace(",", ".")));
  const out = [];
  for (const raw of String(text || "").replace(/(\d),(\d{3})/g, "$1$2").match(NUMBER) || []) {
    const n = raw.replace(",", ".");
    if (n.length < 2 && !n.includes(".")) continue;
    if (!have.has(n) && !out.includes(raw)) out.push(raw);
  }
  return out;
}

/** The passage an item cites ("S3") among the chunks, in the order the model was shown them. */
export function citedChunk(item, chunks) {
  const position = Number(String(item?._source || "").replace(/^S/i, "")) - 1;
  return Number.isInteger(position) && position >= 0 ? chunks[position] || null : null;
}

/**
 * Checks 1–3 for one item. Returns the grounding the item carries.
 * @returns {{ level: "verified"|"inferred"|"unverified", quote: string, quoteMatch: string, support: string, reasons: string[], numbers: string[] }}
 */
export function groundItem(item, chunks) {
  const reasons = [];
  const support = item?._support === "inferred" ? "inferred" : "stated";
  const quote = String(item?._quote || "").trim();
  const cited = citedChunk(item, chunks);
  const materialText = chunks.map((chunk) => chunk.content).join("\n");
  let quoteMatch = "none";
  if (quote) {
    const inCited = cited ? matchQuote(quote, cited.content) : { status: "none" };
    if (inCited.status !== "none") quoteMatch = inCited.status;
    else {
      // Cited the wrong passage number but the words exist elsewhere in the material: the quote is real, the pointer is not.
      const elsewhere = chunks.map((chunk) => matchQuote(quote, chunk.content)).find((hit) => hit.status !== "none");
      if (elsewhere) { quoteMatch = elsewhere.status; reasons.push("The quote is in the material, but not in the passage cited."); }
    }
  }
  // Wrong options of a multiple-choice question are made up on purpose, and a worked answer computes new figures: for items an unmatched
  // figure is a reason shown with the item and a prompt for the second pass, not a failure by itself.
  const numbers = ungroundedNumbers(claimText(item, 900, { skip: ["options", "choices", "distractors", "worked_solution", "workedsolution", "solution", "steps"] }), materialText).filter((n) => !quote || !String(quote).includes(n));
  let level;
  if (support === "stated") {
    if (quoteMatch === "none") { level = "unverified"; reasons.push(quote ? "The supporting quote was not found in your material." : "No supporting quote was given."); }
    else level = "verified";
  } else {
    // A reasoned step is allowed, but it must still rest on a real passage.
    level = cited || quoteMatch !== "none" ? "inferred" : "unverified";
    if (level === "unverified") reasons.push("It cites no passage of your material.");
  }
  if (numbers.length) reasons.push(`The figure${numbers.length > 1 ? "s" : ""} ${numbers.slice(0, 4).join(", ")} ${numbers.length > 1 ? "do" : "does"} not appear in your material.`);
  return { level, quote: quoteMatch === "none" ? "" : quote, quoteMatch, support, reasons, numbers };
}

/**
 * Check 4: a second, independent look. Each item goes to a small model next to the passage it cites; the model answers whether the
 * passage supports the item. Items it calls unsupported are marked unverified; "partly" keeps the item and adds a reason.
 * Fails open: if the call cannot be made, the items keep the result of checks 1–3.
 */
export async function judgeSupport(entries, { apiKey = process.env.OPENAI_API_KEY, model = GROUNDING_MODEL(), fetchImpl = globalThis.fetch } = {}) {
  if (!apiKey || !entries.length || !judgeEnabled()) return { verdicts: new Map(), usage: null, skipped: true };
  const payload = entries.slice(0, 40).map((entry, index) => ({ id: index, claim: entry.claim, passage: String(entry.passage || "").slice(0, 1800) }));
  const schema = {
    type: "object", additionalProperties: false,
    properties: { verdicts: { type: "array", items: { type: "object", additionalProperties: false, properties: { id: { type: "integer" }, verdict: { type: "string", enum: ["supported", "partly", "unsupported"] }, reason: { type: "string" } }, required: ["id", "verdict", "reason"] } } },
    required: ["verdicts"]
  };
  try {
    const response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        store: false,
        model,
        temperature: 0,
        max_tokens: 2500,
        response_format: { type: "json_schema", json_schema: { name: "support_check", strict: true, schema } },
        messages: [
          { role: "system", content: `You check whether study material supports a claim. For each entry you get a claim written by an AI and the passage of the learner's material it was written from.
Answer "supported" only if the passage states the claim, or the claim follows from it by a step that is plain from the passage alone (a restatement, a calculation with the passage's own numbers). Answer "partly" if some of the claim is in the passage but part of it (a detail, a number, a condition) is not. Answer "unsupported" if the passage does not support it, contradicts it, or is empty. Do not use outside knowledge, even if the claim is true in general: only the passage counts. Give a reason of at most 15 words naming what is missing or wrong, or "" when supported. Return one verdict per entry id.` },
          { role: "user", content: JSON.stringify({ entries: payload }) }
        ]
      })
    });
    if (!response.ok) return { verdicts: new Map(), usage: null, skipped: true };
    const body = await response.json();
    const parsed = JSON.parse(body?.choices?.[0]?.message?.content || "{}");
    const verdicts = new Map((parsed.verdicts || []).map((entry) => [entry.id, { verdict: entry.verdict, reason: String(entry.reason || "") }]));
    return { verdicts, usage: body.usage || null, skipped: false };
  } catch {
    return { verdicts: new Map(), usage: null, skipped: true };
  }
}

/**
 * All four checks over a run's items. Mutates nothing; returns the items with `_grounding`, how many were dropped, and a summary.
 * @param {object[]} items
 * @param {{ content: string }[]} chunks  the passages the model read, in the order it was shown them (S1 = chunks[0])
 * @param {{ strict?: boolean, judge?: Function, minKeep?: number }} options
 */
export async function groundItems(items, chunks, { strict = true, judge = judgeSupport, minKeep = 1 } = {}) {
  const grounded = items.map((item) => ({ ...item, _grounding: groundItem(item, chunks) }));
  // Second pass, only where the first checks did not already settle it as unverified.
  const toJudge = [];
  grounded.forEach((item, index) => {
    if (item._grounding.level === "unverified") return;
    const cited = citedChunk(item, chunks);
    toJudge.push({ index, claim: claimText(item), passage: item._grounding.quote && !cited ? item._grounding.quote : cited?.content || chunks.map((chunk) => chunk.content).join("\n").slice(0, 1800) });
  });
  const result = await judge(toJudge);
  toJudge.forEach((entry, position) => {
    const verdict = result.verdicts?.get(position);
    if (!verdict) return;
    const g = grounded[entry.index]._grounding;
    if (verdict.verdict === "unsupported") { g.level = "unverified"; g.reasons.push(verdict.reason || "A second check found the passage does not support it."); }
    else if (verdict.verdict === "partly") g.reasons.push(verdict.reason || "Only part of it is in the passage.");
    g.judged = verdict.verdict;
  });
  const failed = grounded.filter((item) => item._grounding.level === "unverified");
  const keepAll = !strict || grounded.length - failed.length < minKeep;
  const kept = keepAll ? grounded : grounded.filter((item) => item._grounding.level !== "unverified");
  const summary = {
    total: items.length,
    verified: grounded.filter((item) => item._grounding.level === "verified").length,
    inferred: grounded.filter((item) => item._grounding.level === "inferred").length,
    unverified: failed.length,
    dropped: keepAll ? 0 : failed.length,
    judged: !result.skipped,
    judgeUsage: result.usage || null
  };
  return { items: kept, summary };
}

/* ---------------------------------------------------------------- written documents (block output) */

const blockText = (block) => {
  if (!block || typeof block !== "object") return "";
  if (Array.isArray(block.items)) return block.items.map(String).join(" ");
  return String(block.text || block.title || "");
};
const CHECKED = new Set(["paragraph", "bullet_list", "callout"]);

/**
 * Written output (summaries, formula sheets, reading parts) is checked paragraph by paragraph:
 *  - each paragraph, bullet list and callout names its passage (`_source`) and quotes the supporting words (`_quote`); the quote
 *    must be in that passage (an invented one marks the paragraph unverified);
 *  - every figure must be in the material;
 *  - a second pass compares the paragraph with its passage (or, without a citation, the best-matching passages).
 * Each checked block carries `_grounding: { level, quote, reasons, judged }`; the reader marks the unverified ones and shows the
 * supporting quote of the others. Blocks without a quote still get the figure check and the second pass.
 */
export async function groundBlocks(blocks, chunks, { judge = judgeSupport } = {}) {
  const materialText = chunks.map((chunk) => chunk.content).join("\n");
  const checked = [];
  blocks.forEach((block, index) => {
    const type = String(block?.type || "");
    const text = blockText(block);
    if (!CHECKED.has(type) || text.trim().length < 30) return;
    const reasons = [];
    const quote = String(block._quote || "").trim();
    const cited = citedChunk(block, chunks);
    let quoteMatch = "none";
    if (quote) {
      const inCited = cited ? matchQuote(quote, cited.content) : { status: "none" };
      if (inCited.status !== "none") quoteMatch = inCited.status;
      else {
        const elsewhere = chunks.map((chunk) => matchQuote(quote, chunk.content)).find((hit) => hit.status !== "none");
        if (elsewhere) { quoteMatch = elsewhere.status; reasons.push("The quote is in the material, but not in the passage cited."); }
        else reasons.push("The supporting quote was not found in your material.");
      }
    }
    const quoteFailed = Boolean(quote) && quoteMatch === "none";
    const numbers = ungroundedNumbers(text, materialText);
    const numberReason = numbers.length ? `The figure${numbers.length > 1 ? "s" : ""} ${numbers.slice(0, 4).join(", ")} ${numbers.length > 1 ? "do" : "does"} not appear in your material.` : "";
    checked.push({ index, text, reasons, quoteFailed, quoteMatch, quote: quoteMatch === "none" ? "" : quote, numberReason, cited });
  });

  const entries = checked.slice(0, 40).map((entry) => {
    let passage = entry.cited?.content || "";
    if (!passage) {
      const words = new Set(norm(entry.text).split(" ").filter((word) => word.length > 3));
      passage = chunks.map((chunk) => ({ chunk, score: [...words].filter((word) => norm(chunk.content).includes(word)).length })).sort((a, b) => b.score - a.score).slice(0, 2).map((row) => row.chunk.content).join("\n---\n");
    }
    return { claim: entry.text.slice(0, 900), passage };
  });
  const result = await judge(entries);

  const final = blocks.map((block) => block);
  let flagged = 0;
  let quoted = 0;
  checked.forEach((entry, position) => {
    const verdict = result.verdicts?.get(position);
    const reasons = [...entry.reasons];
    if (entry.numberReason) reasons.push(entry.numberReason);
    // A figure missing from the material only fails a paragraph when the second pass does not vouch for it; an invented quote always does.
    let level = entry.quoteFailed || (entry.numberReason && verdict?.verdict !== "supported") ? "unverified" : "verified";
    if (verdict?.verdict === "unsupported") { level = "unverified"; reasons.push(verdict.reason || "A second check found no support for it in your material."); }
    else if (verdict?.verdict === "partly") reasons.push(verdict.reason || "Only part of it is in your material.");
    if (level === "unverified") flagged += 1;
    if (entry.quote) quoted += 1;
    final[entry.index] = { ...final[entry.index], _grounding: { level, quote: entry.quote, quoteMatch: entry.quoteMatch, reasons, judged: verdict?.verdict || "" } };
  });
  return { blocks: final, summary: { total: checked.length, quoted, unverified: flagged, judged: !result.skipped, judgeUsage: result.usage || null } };
}
