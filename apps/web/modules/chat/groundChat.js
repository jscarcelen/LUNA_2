import { judgeSupport, ungroundedNumbers } from "../ai-tools/pipeline/grounding.js";
import { splitSentencesAndLines } from "../../lib/regexCompat.js";

/**
 * After a chat answer: does the material really say what the answer says? (docs: pipeline/grounding.js)
 *  - a citation [P#] that points at no passage of this chat is invalid;
 *  - every cited sentence goes to a second, small model next to the passage it cites (supported / partly / unsupported);
 *  - a figure in a cited sentence that is not in the cited passage is flagged;
 *  - an answer that searched the material yet cites nothing is labelled as not taken from it.
 * Returns null when there is nothing to say (no search was made).
 */
export function citedSentences(text) {
  return splitSentencesAndLines(String(text || ""))
    .map((sentence) => sentence.trim())
    .filter((sentence) => /\[P\d+\]/.test(sentence))
    .map((sentence) => ({ text: sentence.replace(/\[P\d+\]/g, "").replace(/\s+/g, " ").trim(), cites: [...sentence.matchAll(/\[P(\d+)\]/g)].map((match) => `P${match[1]}`) }))
    .filter((entry) => entry.text.length >= 12);
}

export async function groundChatAnswer({ text, passages, judge = judgeSupport }) {
  if (!passages.length) return null;
  const known = new Map(passages.map((passage) => [passage.n, passage]));
  const sentences = citedSentences(text);
  const invalid = [...new Set([...String(text || "").matchAll(/\[P(\d+)\]/g)].map((match) => `P${match[1]}`).filter((id) => !known.has(id)))];
  if (!sentences.length) return { checked: 0, supported: 0, partly: 0, unsupported: 0, flagged: [], invalidCitations: invalid, uncited: true };
  const entries = sentences.slice(0, 30).map((sentence) => ({ claim: sentence.text, passage: sentence.cites.map((id) => known.get(id)?.content || "").filter(Boolean).join("\n---\n") }));
  const result = await judge(entries);
  const flagged = [];
  let supported = 0;
  let partly = 0;
  let unsupported = 0;
  entries.forEach((entry, index) => {
    const verdict = result.verdicts?.get(index);
    const numbers = ungroundedNumbers(entry.claim, entry.passage);
    if (!entry.passage) { unsupported += 1; flagged.push({ text: entry.claim, reason: "It cites a passage that was not found." }); return; }
    if (verdict?.verdict === "unsupported") { unsupported += 1; flagged.push({ text: entry.claim, reason: verdict.reason || "The cited passage does not support it." }); }
    else if (verdict?.verdict === "partly" || (numbers.length && verdict?.verdict !== "supported")) {
      partly += 1;
      flagged.push({ text: entry.claim, reason: verdict?.reason || `The figure ${numbers.slice(0, 3).join(", ")} is not in the cited passage.` });
    } else supported += 1;
  });
  return { checked: entries.length, supported, partly, unsupported, flagged: flagged.slice(0, 5), invalidCitations: invalid, uncited: false, judged: !result.skipped };
}
