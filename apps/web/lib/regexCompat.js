/**
 * Lookbehind-free replacements for the few regexes that used `(?<=...)` / `(?<!...)`.
 * Safari only supports lookbehind from 16.4; a regex literal containing it is a SyntaxError at parse time, which
 * takes the whole script down on older iPads and school Macs. Behaviour is kept identical; the equivalence is
 * checked against the original lookbehind patterns in tests/regex-compat.test.js.
 */

const SENTENCE_END = /[.!?]/;

/**
 * Same as `text.split(/(?<=[.!?])\s+/)` and its variants.
 *  - `after`: global regex for the separator that only counts right after a sentence end (default `\s+`);
 *    it may carry a lookahead, e.g. /\s+(?=[A-Z])/g;
 *  - `always`: optional global regex for a separator that always counts (e.g. /\n+/g);
 *  - `alwaysFirst`: the `always` alternative is written first in the original pattern;
 *  - `behind`: test on the character before the separator (default `[.!?]`).
 */
export function splitAfterSentenceEnd(text, { after = /\s+/g, always = null, alwaysFirst = false, behind = SENTENCE_END } = {}) {
  const input = String(text ?? "");
  const globalise = (re) => (re.global ? new RegExp(re.source, re.flags) : new RegExp(re.source, `${re.flags}g`));
  const found = [];
  for (const match of input.matchAll(globalise(after))) {
    if (match.index > 0 && behind.test(input[match.index - 1])) found.push({ index: match.index, length: match[0].length, order: alwaysFirst ? 1 : 0 });
  }
  if (always) for (const match of input.matchAll(globalise(always))) found.push({ index: match.index, length: match[0].length, order: alwaysFirst ? 0 : 1 });
  found.sort((a, b) => a.index - b.index || a.order - b.order);
  const pieces = [];
  let last = 0;
  for (const hit of found) {
    if (hit.index < last) continue;
    pieces.push(input.slice(last, hit.index));
    last = hit.index + hit.length;
  }
  pieces.push(input.slice(last));
  return pieces;
}

/** `/(?<=[.!?])\s+/` */
export const splitSentences = (text) => splitAfterSentenceEnd(text);
/** `/(?<=[.!?])\s+|\n+/` */
export const splitSentencesAndLines = (text) => splitAfterSentenceEnd(text, { always: /\n+/g });

/** `s.replace(/(?<=[a-z])\.(?=[a-z]|\s|$)|['`´’‘]/g, "")` */
export function stripAbbreviationDotsAndApostrophes(text) {
  return String(text ?? "").replace(/([a-z])\.(?=[a-z]|\s|$)|['`´’‘]/g, (_match, letter) => letter || "");
}

/** `s.replace(/(?<=[A-Za-z0-9)])\^\{([A-Za-z0-9]+)\}/g, "^$1")` */
export function unbraceSimpleSuperscripts(text) {
  return String(text ?? "").replace(/([A-Za-z0-9)])\^\{([A-Za-z0-9]+)\}/g, "$1^$2");
}

/** `/(?<!OUTPUT\s)\bINSTRUCTIONS\b/.exec(text)` — a RegExp-like match (index, [0]) or null. */
export function execInstructionsMarker(text) {
  const input = String(text ?? "");
  for (const match of input.matchAll(/\bINSTRUCTIONS\b/g)) {
    if (!/OUTPUT\s$/.test(input.slice(Math.max(0, match.index - 7), match.index))) return match;
  }
  return null;
}
