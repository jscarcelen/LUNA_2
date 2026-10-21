/**
 * Search by name that forgives typos: "fotosintesis" finds "Photosynthesis notes.pdf", "biolgy" finds "Biology",
 * "inv lect" finds "Investments_Lecture 3". Pure, so the workspace search and its tests share it.
 *
 * Every word typed must match a word of the name: as a substring, or as the start of a word with a small number
 * of typos (1 for words of 4–6 letters, 2 from 7). A name scores higher the closer and earlier its matches are.
 */

/** Lower case, accents off, file extension off, every run of punctuation or underscores becomes a space. */
export function normaliseName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\.[a-z0-9]{1,5}$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Edit distance (insert, delete, change, swap two neighbours), stopping early once it passes `limit`. */
function distance(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let before = null;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + cost);
      if (before && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, before[j - 2] + 1);
      row.push(value);
      best = Math.min(best, value);
    }
    if (best > limit) return limit + 1;
    before = previous;
    previous = row;
  }
  return previous[b.length];
}

const typosAllowed = (word) => (word.length >= 7 ? 2 : word.length >= 4 ? 1 : 0);

/** How well one typed word matches one word of the name: 0 = no match, higher is better. */
function wordScore(typed, word) {
  if (word === typed) return 10;
  if (word.startsWith(typed)) return 8;
  if (word.includes(typed)) return 6;
  const limit = typosAllowed(typed);
  if (!limit) return 0;
  // Compare with the start of the word, so a few letters typed still find a long word.
  const head = word.slice(0, typed.length + limit);
  let best = limit + 1;
  for (let size = Math.max(1, typed.length - limit); size <= head.length; size += 1) best = Math.min(best, distance(typed, head.slice(0, size), limit));
  return best <= limit ? 4 - best : 0;
}

/**
 * Spellings that sound the same in English and Spanish ("foto" / "photo", "sintesis" / "synthesis", "vio" / "bio"):
 * tried when the plain spelling finds nothing, and scored a little lower.
 */
export function soundAlike(value) {
  return String(value || "")
    .replace(/ph/g, "f").replace(/th/g, "t").replace(/ch/g, "c").replace(/qu/g, "c").replace(/k/g, "c")
    .replace(/y/g, "i").replace(/z/g, "s").replace(/v/g, "b").replace(/h/g, "")
    .replace(/([a-z])\1+/g, "$1");
}

/** 0 when `name` does not match `query`; otherwise a score (higher = better). An empty query matches everything. */
export function nameMatchScore(query, name) {
  const plain = spellingScore(normaliseName(query), normaliseName(name));
  if (plain) return plain;
  const typed = normaliseName(query);
  const folded = spellingScore(typed.split(" ").map(soundAlike).join(" "), normaliseName(name).split(" ").map(soundAlike).join(" "));
  return folded ? Math.max(1, folded - 2) : 0;
}

function spellingScore(query, full) {
  const typed = query.split(" ").filter(Boolean);
  if (!typed.length) return 1;
  if (!full) return 0;
  const words = full.split(" ");
  const joined = typed.join(" ");
  let score = full.includes(joined) ? 20 + (full.startsWith(joined) ? 5 : 0) : 0;
  for (const part of typed) {
    let best = 0;
    for (const word of words) best = Math.max(best, wordScore(part, word));
    // A typed word can also match across words that were glued together ("lecture3" for "Lecture 3").
    if (!best && full.replace(/ /g, "").includes(part)) best = 5;
    if (!best) return 0;
    score += best;
  }
  return score;
}

/** The items whose name (read with `nameOf`) matches, best first; ties keep their order. */
export function searchByName(query, items, nameOf = (item) => item.name) {
  return items
    .map((item, index) => ({ item, index, score: nameMatchScore(query, nameOf(item)) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
}
