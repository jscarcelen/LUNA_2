/**
 * Does solving this question need maths?
 *
 * The whole error classification hangs on this one question. A wrong answer to a question that
 * needs calculation, a formula, a derivation or reading numbers is an ANALYTICAL mistake (the
 * process went wrong). A wrong answer to a question that needs no maths (a definition, "which is
 * NOT…", a difference, a classification, a fact) can only be a TOPIC-KNOWLEDGE mistake — it must
 * never be called analytical.
 *
 * The decision is deliberately a short, readable list of rules, in this order:
 *   1. the question says so itself (`quantitative: true|false`, set by the grader or the agent);
 *   2. the agent marked the skill as maths / calculation / arithmetic / statistics → yes;
 *   3. it is a numeric-entry question, or the prompt asks to calculate / solve / evaluate… → yes;
 *   4. the agent marked the skill as recall / definition / concept / vocabulary… → no;
 *   5. the expected answer is a year or a date → no;
 *   6. the expected answer is a number (with a unit) or a formula → yes;
 *   7. the skill is "analysis" / "problem solving" / "application" and numbers are involved → yes;
 *   8. otherwise → no.
 * Works for a question (`answer`) and for a stored result (`expected`) alike.
 */

const STRONG_SKILL = /(math|calc|comput|arithmetic|algebra|geometr|trigonom|statistic|probabilit|quantitativ|numeric|c[aá]lculo|matem[aá]t|aritm[eé]t|[aá]lgebra|geometr[ií]a|estad[ií]st|probabilidad|cuantitativ|num[eé]ric)/i;
const WEAK_SKILL = /(analysis|analytic|an[aá]lisis|problem[ -]?solving|resoluci[oó]n|application|aplicaci[oó]n|data)/i;
const FACT_SKILL = /(concept|definition|vocab|recall|comprehension|knowledge|fact|terminolog|memor|reading|theory|history|literature|language|concepto|definici[oó]n|vocabulario|comprensi[oó]n|recuerdo|conocimiento|teor[ií]a|historia)/i;

const CALC_VERBS = /\b(calculate|calculat\w*|compute|solve|evaluate|simplify|work out|find the (?:value|area|perimeter|volume|derivative|integral|sum|product|mean|average|median|probability|percentage|length|angle|roots?|solution|gradient|slope|total|difference)|how much is|what is \d|differentiate|integrate|factori[sz]e|expand the|percentage of|probability of|standard deviation|derivative|integral of|polynomial|quadratic|logarithm|calcula|calcule|resuelve|resolver|halla|simplifica|deriva la|integra|factoriza|cu[aá]nto es|cu[aá]nto vale|cu[aá]nto suman)\b/i;
const EXPRESSION = /\d\s*(?:[+*×÷^=/]|x(?=\s*\d)|[-−–](?=\s)|(?<=\s)[-−–])\s*\d/i;
const DATE_RANGE = /\b(?:1\d|20)\d\d\s*[-–]\s*(?:1\d|20)\d\d\b/;
const LATEX_OR_SYMBOL = /\\(?:frac|sqrt|sum|int|cdot|times|pi|log|sin|cos|tan)\b|√|∑|∫|\b[a-z]\s*\^\s*[\d{]/i;

const FORMULA = /(?:^|[\s(])[a-zA-Zα-ωΔ][a-zA-Z0-9_′']*(?:\([^)]*\))?\s*=\s*[^\s=]|\\frac|\\sqrt|√|∫|∑|\^|[²³]/;

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

/** Numbers in a text, as numbers: "1,5" and "1.5" are 1.5, "3/4" is 0.75, "−2" is -2. */
export function numbersIn(value) {
  const text = clean(value).replace(/[−–]/g, "-");
  const out = [];
  const fraction = /(?<![\w.,/])(-?\d+)\s*\/\s*(\d+)(?![\w.,/])/g;
  const rest = text.replace(fraction, (_, a, b) => { if (Number(b) !== 0) out.push(Number(a) / Number(b)); return " "; });
  for (const match of rest.matchAll(/(?<![\w.,])-?\d+(?:[.,]\d+)*/g)) {
    let raw = match[0];
    const dots = (raw.match(/\./g) || []).length;
    const commas = (raw.match(/,/g) || []).length;
    if (dots && commas) {
      // The last separator is the decimal one: 1,234.5 and 1.234,5.
      const decimal = raw.lastIndexOf(".") > raw.lastIndexOf(",") ? "." : ",";
      raw = raw.split(decimal === "." ? "," : ".").join("");
      if (decimal === ",") raw = raw.replace(",", ".");
    } else if (commas > 1) raw = raw.replace(/,/g, "");
    else if (dots > 1) raw = raw.replace(/\./g, "");
    else if (commas === 1) raw = raw.replace(",", ".");
    const number = Number(raw);
    if (Number.isFinite(number)) out.push(number);
  }
  return out;
}

/** The words of an answer that are not numbers: the unit, or the explanation. */
export function wordsIn(value) {
  return clean(value).toLowerCase().replace(/[−–]/g, "-").replace(/-?\d+(?:[.,]\d+)*(?:\s*\/\s*\d+)?/g, " ").split(/[^a-zA-Zµμ°ºΩáéíóúüñ]+/).filter((word) => word.length > 0);
}

/** An answer that is a number (maybe with a unit) or a handful of them: "42", "3.5 m/s", "x = 4, y = 2". */
export function isNumericAnswer(value) {
  const text = clean(value);
  if (!text) return false;
  const numbers = numbersIn(text);
  if (!numbers.length || numbers.length > 4) return false;
  return wordsIn(text).filter((word) => word.length > 3).length <= 1;
}

const MONTHS = /\b(?:january|february|march|april|may|june|july|august|september|october|november|december|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/i;
/** A year ("1789", "44 BC", "3 May 1990") is a fact to recall, not a result to work out. */
const isYearLike = (value) => {
  const text = clean(value);
  return /^(?:1[0-9]|20)\d\d$/.test(text) || /^\d{1,4}\s*(?:bc|bce|ad|ce|a\.?c\.?|d\.?c\.?)$/i.test(text) || (MONTHS.test(text) && numbersIn(text).length <= 2);
};

/** True when the prompt itself asks for a calculation. */
function promptAsksToCalculate(prompt) {
  const text = clean(prompt);
  if (!text) return false;
  if (CALC_VERBS.test(text) || LATEX_OR_SYMBOL.test(text)) return true;
  return EXPRESSION.test(text.replace(DATE_RANGE, " "));
}

/**
 * What the question itself (or its agent) declares: a maths / calculation skill, a numeric-entry
 * question, a prompt that asks to calculate. These are the signals nobody should override.
 */
export function declaredQuantitative(item = {}) {
  if (typeof item.quantitative === "boolean") return item.quantitative;
  const skill = clean(item.skill);
  if (skill && STRONG_SKILL.test(skill)) return true;
  if (item.kind === "number") return true;
  return promptAsksToCalculate(item.prompt || item.question);
}

/** Does solving this question need maths or quantitative analysis? See the rules at the top of the file. */
export function isQuantitative(item = {}) {
  if (typeof item.quantitative === "boolean") return item.quantitative;
  if (declaredQuantitative(item)) return true;
  const skill = clean(item.skill);
  if (skill && FACT_SKILL.test(skill) && !WEAK_SKILL.test(skill)) return false;
  const expected = clean(item.expected ?? item.answer);
  if (!expected) return false;
  if (isYearLike(expected)) return false;
  if (isNumericAnswer(expected) || (FORMULA.test(expected) && expected.length <= 80 && /[\d=^²³√∫∑]/.test(expected))) return true;
  if (skill && WEAK_SKILL.test(skill) && /\d/.test(`${clean(item.prompt || item.question)} ${expected}`)) return true;
  return false;
}
