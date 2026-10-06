/**
 * Grading written answers.
 *
 * A multiple-choice answer is right or wrong; a written answer is not. "The powerhouse of the
 * cell" and "mitochondria produce the cell's energy" are the same answer, "mitocondria" is a
 * spelling slip, "48" for 54 is a different thing from "54 cm" for 54 m. This file is the local,
 * model-free half of that judgement — the part that is cheap, instant and good enough to decide the
 * clear cases and to fall back on when no model is reachable:
 *
 *  - exact match after normalising (case, spacing, punctuation, accents of no consequence);
 *  - numbers compared as numbers, within a tolerance, with sign / unit / rounding slips called "close";
 *  - words compared by the key terms of the expected answer (token overlap), with negation checked.
 *
 * Everything unclear is left to the model (`gradeBatch.js`, route `/api/activities/grade`), which
 * judges meaning. Both halves return the same shape, so the player and the performance engine do not
 * care which one graded:
 *
 *   { verdict: "correct" | "close" | "incorrect", score: 0..1, makesSense, feedback, blank?, graded }
 *
 * `close` is "essentially right but not exact": worth partial credit, and in the error taxonomy it is
 * always an ACCURACY mistake — never knowledge or analytical (see `performance/errors.js`).
 */
import { isNumericAnswer, numbersIn, wordsIn } from "./quantitative.js";

export const VERDICTS = ["correct", "close", "incorrect"];
/** What a "close" answer is worth when nothing more precise is known. */
export const CLOSE_CREDIT = 0.5;

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

/** Case, accents, punctuation and spacing do not make an answer different. */
export function normaliseAnswer(value) {
  return clean(value)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[−–]/g, "-")
    // "U.S.A." and "don't" lose their marks; everything else that punctuates becomes a space.
    .replace(/(?<=[a-z])\.(?=[a-z]|\s|$)|['`´’‘]/g, "")
    .replace(/[.,;:!?"“”()[\]{}¿¡]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = new Set((
  "the a an of and or is are was were be been to in on at for with that this it its as by from which what who whom whose there their them they he she his her we you your i do does did " +
  "el la los las un una unos unas de del y o es son era fue ser en con por para que se su sus lo al a como " +
  "has have had can could will would should may might also very more most into than then so such"
).split(" "));
const NEGATIONS = new Set(["not", "no", "never", "none", "neither", "nor", "cannot", "without", "nunca", "ni", "sin", "tampoco", "jamas"]);

/** The meaningful words of an answer, lightly stemmed so "multiplies" and "multiply" meet. */
export function keyTerms(value) {
  const words = normaliseAnswer(value).split(" ").filter(Boolean);
  const out = [];
  for (const raw of words) {
    if (/^-?\d/.test(raw)) { out.push(raw); continue; }
    if (STOP.has(raw) || raw.length < 2) continue;
    let word = raw;
    if (word.length > 5) word = word.replace(/(?:ations|ation|ings|ing|ies|ied|es|ed|s)$/, "");
    else if (word.length > 3) word = word.replace(/(?:s)$/, "");
    out.push(word);
  }
  return out;
}

const hasNegation = (value) => normaliseAnswer(value).split(" ").some((word) => NEGATIONS.has(word) || /n't$/.test(word)) || /n['’]t\b/i.test(String(value));

function editRatio(a, b) {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length);
}

/** Looks like language rather than keyboard noise or a lone symbol. */
export function looksLikeAnswer(value) {
  const text = clean(value);
  if (!text) return false;
  if (!/[a-zA-Z0-9À-ɏ]/.test(text)) return false;
  const letters = text.replace(/[^a-zA-ZÀ-ɏ]/g, "");
  if (letters.length >= 5 && !/[aeiouyáéíóúü]/i.test(letters)) return false;
  if (/(.)\1{4,}/.test(text)) return false;
  return true;
}

const spanish = (language) => /^(es|spa|span|castell)/i.test(String(language || "").trim());
const SAYS = {
  en: {
    correct: "That matches the expected answer.",
    closeNumber: "Very close to the expected value, but not exact.",
    closeSign: "The size is right but check the sign.",
    closeUnit: "The number is right but check the unit.",
    closeWords: "Almost there: it covers most of the expected answer but not all of it.",
    closeSpelling: "Right idea, but check the spelling.",
    incorrect: "That does not match the expected answer.",
    blank: "No answer was written."
  },
  es: {
    correct: "Coincide con la respuesta esperada.",
    closeNumber: "Muy cerca del valor esperado, pero no es exacto.",
    closeSign: "El valor es correcto, pero revisa el signo.",
    closeUnit: "El número es correcto, pero revisa la unidad.",
    closeWords: "Casi: recoge gran parte de la respuesta esperada, pero no toda.",
    closeSpelling: "La idea es correcta, pero revisa la ortografía.",
    incorrect: "No coincide con la respuesta esperada.",
    blank: "No escribiste ninguna respuesta."
  }
};
const say = (language, key) => (spanish(language) ? SAYS.es : SAYS.en)[key];

const result = (verdict, score, feedback, extra = {}) => ({ verdict, score, makesSense: true, feedback, graded: "local", ...extra });

/** Numbers against numbers: equal, rounded, wrong sign, wrong unit, or simply different. */
function gradeNumbers(given, expected, language) {
  const g = numbersIn(given);
  const e = numbersIn(expected);
  if (!g.length || !e.length) return null;
  const close = (a, b, tolerance) => Math.abs(a - b) <= tolerance * Math.max(Math.abs(b), 1e-9) + 1e-12;
  const matched = (a, b) => close(a, b, 1e-3);
  const near = (a, b) => close(a, b, 0.03);
  const flipped = (a, b) => a !== 0 && matched(-a, b);

  const unitsGiven = wordsIn(given).filter((word) => word.length > 0);
  const unitsExpected = wordsIn(expected).filter((word) => word.length > 0);
  const unitSlip = unitsExpected.length > 0 && unitsGiven.length > 0 && normaliseAnswer(unitsExpected.join(" ")) !== normaliseAnswer(unitsGiven.join(" "));

  let pairs = null;
  if (g.length === e.length) pairs = e.map((value, index) => [g[index], value]);
  else if (g.length > e.length && e.every((value) => g.some((other) => matched(other, value)))) {
    return result("close", CLOSE_CREDIT, say(language, "closeWords"), { decisive: false });
  }
  if (!pairs) return result("incorrect", 0, say(language, "incorrect"), { decisive: true });

  if (pairs.every(([a, b]) => matched(a, b))) {
    return unitSlip
      ? result("close", CLOSE_CREDIT, say(language, "closeUnit"), { decisive: true })
      : result("correct", 1, say(language, "correct"), { decisive: true });
  }
  // Same numbers in another order ((2, 3) for (3, 2)) is a slip, not a different answer.
  const sorted = (list) => [...list].sort((a, b) => a - b);
  if (g.length > 1 && sorted(g).every((value, index) => matched(value, sorted(e)[index]))) return result("close", CLOSE_CREDIT, say(language, "closeWords"), { decisive: true });
  if (pairs.every(([a, b]) => matched(a, b) || flipped(a, b) || near(a, b)) && pairs.some(([a, b]) => flipped(a, b))) return result("close", CLOSE_CREDIT, say(language, "closeSign"), { decisive: true });
  if (pairs.every(([a, b]) => matched(a, b) || near(a, b))) return result("close", CLOSE_CREDIT, say(language, "closeNumber"), { decisive: true });
  return result("incorrect", 0, say(language, "incorrect"), { decisive: true });
}

/**
 * Grades one written answer without a model.
 * `decisive` says whether the answer is clear enough that a model would not change the verdict
 * (blank, identical, a number against a number); the rest is a best guess from the words alone.
 * @param {{ given?: unknown, expected?: unknown, language?: string }} [input]
 * @returns {{ verdict: "correct" | "close" | "incorrect", score: number, makesSense: boolean, feedback: string, graded: "local", blank?: boolean, decisive?: boolean }}
 */
export function gradeLocally({ given, expected, language = "" } = {}) {
  const g = clean(given);
  const e = clean(expected);
  if (!g) return result("incorrect", 0, say(language, "blank"), { blank: true, makesSense: false, decisive: true });
  if (!e) return result("incorrect", 0, say(language, "incorrect"), { makesSense: looksLikeAnswer(g), decisive: false });
  const ng = normaliseAnswer(g);
  const ne = normaliseAnswer(e);
  if (ng === ne) return result("correct", 1, say(language, "correct"), { decisive: true });

  if (isNumericAnswer(e) && isNumericAnswer(g)) {
    const graded = gradeNumbers(g, e, language);
    if (graded) return graded;
  }
  const sensible = looksLikeAnswer(g);
  if (!sensible) return result("incorrect", 0, say(language, "incorrect"), { makesSense: false, decisive: true });

  const expectedTerms = [...new Set(keyTerms(e))];
  const givenTerms = new Set(keyTerms(g));
  if (!expectedTerms.length) return result("incorrect", 0, say(language, "incorrect"), { decisive: false });
  const hits = expectedTerms.filter((term) => givenTerms.has(term)).length;
  const recall = hits / expectedTerms.length;
  const precision = givenTerms.size ? hits / givenTerms.size : 0;
  const negationClash = hasNegation(g) !== hasNegation(e);

  // A short answer that is the right word with a typo.
  if (expectedTerms.length <= 3 && editRatio(ng, ne) >= 0.85) return result("close", CLOSE_CREDIT, say(language, "closeSpelling"), { decisive: false });
  if (negationClash) return result("incorrect", 0, say(language, "incorrect"), { decisive: false });
  if (recall >= 0.9 && precision >= 0.6) return result("correct", 1, say(language, "correct"), { decisive: false });
  if (recall >= 0.6 && precision >= 0.35) return result("close", CLOSE_CREDIT, say(language, "closeWords"), { decisive: false });
  return result("incorrect", 0, say(language, "incorrect"), { decisive: false });
}

/**
 * Does this answer need a model's judgement? Blank, identical and number-for-number answers do not:
 * they are settled locally for free. Only written answers can need it.
 */
export function needsModel({ kind = "text", given, expected } = {}) {
  if (kind !== "text") return false;
  if (!clean(given)) return false;
  if (normaliseAnswer(given) === normaliseAnswer(expected)) return false;
  if (isNumericAnswer(expected) && isNumericAnswer(given)) return false;
  return true;
}

/**
 * The error cause of a graded written answer, by the one rule the whole product uses:
 * close → accuracy; wrong and the question needs maths → analytical; wrong and it does not → knowledge.
 * (A blank answer has no cause here: it depends on how the learner did on the rest of the topic.)
 */
export function causeFor({ verdict, quantitative, blank = false }) {
  if (verdict === "correct" || blank) return null;
  if (verdict === "close") return "accuracy";
  return quantitative ? "analytical" : "knowledge";
}

/** The credit a result counts for: its score when graded, else all or nothing. */
export function creditOf(row) {
  if (!row) return 0;
  if (row.correct === true && row.verdict !== "close") return 1;
  if (row.verdict === "close") return clamp(Number.isFinite(Number(row.score)) && row.score !== null && row.score !== undefined && row.score !== "" ? Number(row.score) : CLOSE_CREDIT, 0.1, 0.9);
  return 0;
}

/** Sum of credits over the questions that were answered (flashcards left blank are not counted). */
export function scoreOf(results = []) {
  const graded = results.filter((row) => row.correct !== null && row.correct !== undefined);
  return { score: Math.round(graded.reduce((sum, row) => sum + (row.score ?? (row.correct ? 1 : 0)), 0) * 100) / 100, total: graded.length };
}

/**
 * Merges the grades the model (or the local fallback) produced into an attempt: each graded result
 * gets `verdict`, `score`, `feedback`, `errorCause`, `makesSense`, `graded`; "close" is not correct
 * but earns partial credit; the attempt's score is the sum of the credits.
 */
export function applyGrades(attempt, grades = {}) {
  const results = (attempt.results || []).map((row) => {
    const grade = grades[row.id];
    if (!grade) return row;
    const verdict = VERDICTS.includes(grade.verdict) ? grade.verdict : row.verdict;
    const score = verdict === "correct" ? 1 : verdict === "close" ? clamp(Number(grade.score) || CLOSE_CREDIT, 0.1, 0.9) : 0;
    return {
      ...row,
      correct: verdict === "correct",
      verdict,
      score,
      feedback: String(grade.feedback || "").slice(0, 400),
      errorCause: verdict === "correct" ? null : grade.errorCause || null,
      makesSense: grade.makesSense !== false,
      quantitative: typeof grade.quantitative === "boolean" ? grade.quantitative : row.quantitative,
      graded: grade.graded || "local"
    };
  });
  return { ...attempt, results, ...scoreOf(results) };
}
