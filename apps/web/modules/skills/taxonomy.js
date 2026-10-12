/**
 * The skills taxonomy.
 *
 * A TOPIC is content ("price elasticity"). A SKILL is a transferable ability a question needs
 * whatever the topic ("derivatives", "reading a question carefully"). A wrong answer in
 * microeconomics can be a topic gap or a skill gap, and the two call for different next steps:
 * re-teach the idea, or refresh the skill underneath it. To tell them apart, every question is
 * tagged with the skills it REQUIRES (at generation time, `requires_skills`), and every answer
 * carries them to the performance engine.
 *
 * Two levels: a family (Quantitative…) and its sub-skills (derivatives, integration…). The list is
 * small and curated on purpose: a controlled vocabulary is what makes patterns countable. Ids are
 * stable (they are stored in attempts); labels can change.
 *
 * `match` are the cues `inferSkills` looks for in a question when the model gave no tags (older
 * resources, block agents, hand-written quizzes). Inference is deliberately conservative: a tag we
 * are not sure of is worse than no tag, because it would blame the wrong skill.
 */

export const SKILL_FAMILIES = [
  { id: "quant", label: "Quantitative", blurb: "Numbers, algebra and calculus used to answer a question." },
  { id: "reasoning", label: "Reasoning", blurb: "Combining ideas and steps to reach an answer." },
  { id: "language", label: "Language", blurb: "Reading carefully and using the right words." },
  { id: "detail", label: "Attention to detail", blurb: "Slips: units, signs, rounding, misreading, incomplete answers." },
  { id: "langlearn", label: "Language learning", blurb: "The building blocks of a language: words, sentences, negatives, questions, tenses." },
  { id: "humanities", label: "Humanities", blurb: "Placing events in time, causes and consequences, weighing sources." }
];

/** @type {{ id: string; label: string; family: string; focus: string; match?: RegExp[]; prereq?: string[] }[]} */
export const SKILLS = [
  { id: "arithmetic", label: "Arithmetic and fractions", family: "quant", focus: "adding, subtracting, multiplying and dividing numbers and fractions without a calculator slip", match: [/\b\d+(\.\d+)?\s*[×x*÷/]\s*\d+/i, /\b(sum|product|quotient|total|average)\b/i] },
  { id: "percentages", label: "Percentages and ratios", family: "quant", focus: "percentages, percentage change, ratios and proportions", match: [/%/, /\bpercent(age)?s?\b/i, /\b(ratio|proportion|growth rate|discount|markup|margin)\b/i], prereq: ["arithmetic"] },
  { id: "algebra", label: "Algebra and rearranging", family: "quant", focus: "solving equations, rearranging formulas, simplifying and factorising expressions", match: [/\b(solve for|rearrange|simplify|factori[sz]e|expand|equation|inequalit)/i, /\b[a-z]\s*=\s*[^=]*\b[a-z]\b/i], prereq: ["arithmetic"] },
  { id: "functions", label: "Functions and graphs", family: "quant", focus: "reading and sketching graphs, slopes, intercepts and shifts of functions", match: [/\b(graph|slope|intercept|curve|axis|plot|shift of)\b/i, /\bf\(\s*x\s*\)/i], prereq: ["algebra"] },
  { id: "exponents-logs", label: "Exponents and logarithms", family: "quant", focus: "powers, exponential growth, compounding, logarithms and natural logs", match: [/\\(log|ln)(?![a-z])|\b(log|ln)\s*\(/i, /\b(logarithm|exponent(ial)?|compound(ed|ing)?|e\^)/i], prereq: ["algebra"] },
  { id: "derivatives", label: "Derivatives", family: "quant", focus: "differentiation rules (power, product, quotient, chain), partial derivatives and marginal analysis", match: [/\b(derivative|differentiat|marginal|rate of change)/i, /d\s*[a-z]\s*\/\s*d\s*[a-z]|\\frac\{\s*(d|\\partial)|f'\s*\(|\\partial/i], prereq: ["algebra", "functions"] },
  { id: "integration", label: "Integration", family: "quant", focus: "antiderivatives, definite integrals and the area under a curve", match: [/\\int(?![a-z])|∫|\b(integral|integrat(e|ion)|antiderivative|area under)/i], prereq: ["derivatives"] },
  { id: "limits", label: "Limits", family: "quant", focus: "limits, continuity and behaviour as a variable grows or approaches a value", match: [/\\lim(?![a-z])|\blim\b|\b(limit of|tends to|approaches|as .{1,12} → ?∞|converge)/i], prereq: ["functions"] },
  { id: "optimisation", label: "Optimisation", family: "quant", focus: "maximising or minimising with first-order conditions and constraints (Lagrange)", match: [/\b(maximi[sz]e|minimi[sz]e|optimi[sz]|first-order condition|lagrang|constraint)/i], prereq: ["derivatives"] },
  { id: "matrices", label: "Matrices", family: "quant", focus: "matrix operations, determinants, inverses and systems of equations in matrix form", match: [/\b(matri(x|ces)|determinant|eigen|inverse of|identity matrix)/i], prereq: ["algebra"] },
  { id: "vectors", label: "Vectors", family: "quant", focus: "vector addition, dot and cross products, length and direction", match: [/\b(vector|dot product|cross product|magnitude of)\b/i], prereq: ["algebra"] },
  { id: "probability", label: "Probability", family: "quant", focus: "probability rules, conditional probability, expected value and distributions", match: [/\b(probabilit|expected value|random variable|conditional|bayes|distribution)/i], prereq: ["percentages"] },
  { id: "statistics", label: "Statistics", family: "quant", focus: "mean, median, variance, standard deviation, regression and hypothesis tests", match: [/\b(mean|median|mode|variance|standard deviation|regression|correlation|hypothesis|confidence interval|p-value|sample)\b/i], prereq: ["arithmetic", "percentages"] },
  { id: "geometry", label: "Geometry and trigonometry", family: "quant", focus: "areas, volumes, angles, Pythagoras, sine, cosine and tangent", match: [/\b(triangle|circle|angle|area of|volume of|pythag|sine|cosine|tangent|radius|hypotenuse)\b/i, /\\(sin|cos|tan)(?![a-z])/i], prereq: ["algebra"] },
  { id: "units-rounding", label: "Units and rounding", family: "detail", focus: "carrying units through a calculation, converting them and rounding as asked", match: [/\b(round(ed|ing)?|decimal places?|significant figures?|convert|per (year|month|day|hour|unit))\b/i] },

  { id: "multi-step", label: "Multi-step problems", family: "reasoning", focus: "breaking a problem into steps and keeping track of what each step gives", match: [/\b(then|after that|finally|first .{1,40} then)\b/i] },
  { id: "applying", label: "Applying a concept to a case", family: "reasoning", focus: "choosing the right idea or formula for a new situation", match: [/\b(a (firm|company|student|consumer|country|patient)|suppose|given that|in the case of|scenario)\b/i] },
  { id: "data-interpretation", label: "Interpreting data and results", family: "reasoning", focus: "reading tables, charts and calculated results and saying what they mean", match: [/\b(table|chart|interpret|the data|the results? show|according to the figure)\b/i] },
  { id: "logic", label: "Logic and argument", family: "reasoning", focus: "valid arguments, cause and effect, necessary and sufficient conditions, proofs", match: [/\b(if and only if|implies|necessary|sufficient|prove|contradiction|valid argument|which .{1,20} is NOT)\b/i] },

  { id: "reading", label: "Reading comprehension", family: "language", focus: "understanding what a passage or question really asks", match: [/\b(passage|according to the (text|author)|the author|main idea|infer)\b/i] },
  { id: "terminology", label: "Terminology and vocabulary", family: "language", focus: "knowing and using the subject's key terms precisely", match: [/\b(define|definition|what does .{1,30} mean|term for|vocabulary)\b/i] },
  { id: "writing", label: "Written expression", family: "language", focus: "stating an answer completely and clearly in a sentence or two", match: [/\b(in one sentence|in your own words|briefly explain|write a)\b/i] },

  { id: "vocabulary", label: "Vocabulary", family: "langlearn", focus: "knowing words and phrases and what they mean in the other language", match: [/\b(vocabulary|translate|how do you say|what does .{1,30} mean in|word for)\b/i] },
  { id: "grammar-forms", label: "Grammar forms", family: "langlearn", focus: "agreement, articles, prepositions, gender and plurals", match: [/\b(article|preposition|gender|plural|agreement|pronoun|singular)\b/i] },
  { id: "sentence-building", label: "Building sentences", family: "langlearn", focus: "word order and putting words together into a complete, correct sentence", match: [/\b(word order|put the words|form a sentence|complete the sentence|build a sentence|rearrange the words)\b/i], prereq: ["vocabulary", "grammar-forms"] },
  { id: "negatives", label: "Negatives", family: "langlearn", focus: "turning a sentence into its negative and using negative words correctly", match: [/\b(negative|negation|negate|make .{1,30} negative)\b/i], prereq: ["sentence-building"] },
  { id: "question-forms", label: "Forming questions", family: "langlearn", focus: "asking questions: question words, inversion and auxiliary verbs", match: [/\b(form(ing)? a question|make .{1,30} a question|question word|interrogative|ask a question|turn .{1,30} into a question)\b/i], prereq: ["sentence-building"] },
  { id: "verb-tenses", label: "Verbs and tenses", family: "langlearn", focus: "conjugating verbs and choosing the right tense", match: [/\b(tense|conjugat|past simple|present perfect|present simple|future|irregular verb|verb form|imperfect|subjunctive)\b/i], prereq: ["grammar-forms"] },
  { id: "spelling", label: "Spelling and punctuation", family: "langlearn", focus: "spelling, accents, capital letters and punctuation", match: [/\b(spell|spelling|accent|punctuation|capital letter|apostrophe)\b/i] },

  { id: "chronology", label: "Chronology", family: "humanities", focus: "placing events, people and periods in order and in their century", match: [/\b(chronolog|timeline|which came first|in what year|in which year|century|decade|era)\b/i] },
  { id: "cause-effect", label: "Causes and consequences", family: "humanities", focus: "explaining why something happened and what followed from it", match: [/\b(causes?|consequences?|led to|resulted in|why did|reasons? for)\b/i], prereq: ["chronology"] },
  { id: "sources", label: "Sources and evidence", family: "humanities", focus: "reading a source, judging its reliability and using it as evidence", match: [/\b(primary source|secondary source|historian|bias(ed)?|reliab|evidence|source A|source B)\b/i] },
  { id: "comparison", label: "Comparing and contrasting", family: "humanities", focus: "setting two cases side by side and naming what they share and where they differ", match: [/\b(compare|contrast|similarit|differences? between|in common)\b/i] },

  { id: "attention", label: "Attention to detail", family: "detail", focus: "reading the whole question, checking signs and units, and answering every part", match: [] },
  { id: "time-pressure", label: "Working under time pressure", family: "detail", focus: "pacing and keeping accuracy when the clock is short", match: [] }
];

const BY_ID = new Map(SKILLS.map((skill) => [skill.id, skill]));
const FAMILY_BY_ID = new Map(SKILL_FAMILIES.map((family) => [family.id, family]));

/**
 * The old flat tags (`ActivityQuestion.skill`): what they map to now. Content-knowledge tags
 * (concept, definition, recall) are TOPIC knowledge, not a transferable skill, so they map to nothing.
 */
export const LEGACY_SKILL_MAP = {
  calculation: "arithmetic", "problem solving": "multi-step", application: "applying", analysis: "data-interpretation",
  comprehension: "reading", vocabulary: "vocabulary", concept: null, definition: null, recall: null
};

export const skillById = (id) => BY_ID.get(String(id || "")) || null;
export const skillLabel = (id) => BY_ID.get(String(id || ""))?.label || String(id || "");
export const familyOf = (id) => FAMILY_BY_ID.get(BY_ID.get(String(id || ""))?.family || "") || null;
export const familyLabel = (familyId) => FAMILY_BY_ID.get(String(familyId || ""))?.label || String(familyId || "");
export const skillsOfFamily = (familyId) => SKILLS.filter((skill) => skill.family === familyId);

const clean = (value) => String(value ?? "").trim().toLowerCase().replace(/[_\s]+/g, "-").replace(/[^a-z0-9-]/g, "");

/** A tag the model or an old resource wrote → a taxonomy id, or null when it matches nothing we know. */
export function toSkillId(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (BY_ID.has(raw)) return raw;
  const lowered = raw.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(LEGACY_SKILL_MAP, lowered)) return LEGACY_SKILL_MAP[lowered];
  const slug = clean(raw);
  if (BY_ID.has(slug)) return slug;
  const byLabel = SKILLS.find((skill) => clean(skill.label) === slug);
  if (byLabel) return byLabel.id;
  // Natural names the model tends to use ("derivative", "integrals", "logarithms and exponentials").
  const aliases = [
    [/arithmetic|fraction/, "arithmetic"], [/percent|ratio|proportion/, "percentages"], [/algebra|rearrang|equation/, "algebra"],
    [/graph|function/, "functions"], [/logarithm|exponent|\blogs?\b/, "exponents-logs"], [/derivativ|differentiat|calculus/, "derivatives"],
    [/integra/, "integration"], [/limit/, "limits"], [/optimi|lagrang/, "optimisation"], [/matri/, "matrices"], [/vector/, "vectors"],
    [/probab/, "probability"], [/statistic/, "statistics"], [/geometr|trigon/, "geometry"], [/unit|rounding/, "units-rounding"],
    [/multi.?step|problem.?solving/, "multi-step"], [/appl(y|ication)/, "applying"], [/interpret|data/, "data-interpretation"],
    [/logic|argument|proof/, "logic"], [/read|comprehension/, "reading"], [/terminolog/, "terminology"], [/vocab/, "vocabulary"], [/grammar|agreement|article|preposition/, "grammar-forms"], [/sentence/, "sentence-building"], [/negativ/, "negatives"], [/question.?form|forming questions/, "question-forms"], [/tense|conjugat|verb/, "verb-tenses"], [/spell|punctuat/, "spelling"], [/chronolog|timeline/, "chronology"], [/cause|consequence/, "cause-effect"], [/source|evidence/, "sources"], [/compar|contrast/, "comparison"], [/writ|express/, "writing"],
    [/attention|detail|careless/, "attention"], [/time/, "time-pressure"]
  ];
  for (const [pattern, id] of aliases) if (pattern.test(lowered)) return id;
  return null;
}

/** A list (or "a; b, c" string) of tags → unique taxonomy ids, at most `max`. */
export function normaliseSkillIds(input, max = 4) {
  const parts = Array.isArray(input) ? input : String(input ?? "").split(/[;,|\n]/);
  const out = [];
  for (const part of parts) {
    const id = toSkillId(part);
    if (id && !out.includes(id)) out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Skills a question needs, read from its words. Only the most specific cues count: the Quantitative
 * sub-skills first (derivatives before algebra), then the rest, at most three. A plain definition
 * question gets none, because it needs topic knowledge, not a transferable skill.
 */
export function inferSkills({ prompt = "", answer = "", explanation = "", steps = "" } = {}, max = 3) {
  const text = [prompt, answer, explanation, Array.isArray(steps) ? steps.join(" ") : steps].join(" ");
  if (!text.trim()) return [];
  const hits = SKILLS.filter((skill) => (skill.match || []).some((pattern) => pattern.test(text))).map((skill) => skill.id);
  // A broad cue does not outrank a specific one that came from the same words.
  const broad = new Set(["arithmetic", "algebra", "percentages", "applying", "multi-step"]);
  const specific = hits.filter((id) => !broad.has(id));
  const ordered = [...specific, ...hits.filter((id) => broad.has(id))];
  // Algebra is implied by calculus, probability, etc.: do not list it as a separate failure point.
  const impliedByAnother = specific.length > 0;
  return ordered.filter((id) => !(impliedByAnother && (id === "algebra" || id === "arithmetic" || id === "multi-step"))).slice(0, max);
}

/** Declared tags if there are any, else inferred ones. Always taxonomy ids. */
export function skillsForQuestion(question = {}, max = 3) {
  const declared = normaliseSkillIds(question.skills ?? question.requires_skills ?? question.requiresSkills, max);
  if (declared.length) return declared;
  return inferSkills({ prompt: question.prompt || question.question, answer: question.answer || question.expected, explanation: question.explanation, steps: question.steps }, max);
}

/** The list a prompt shows the model: "id — what it is", grouped by family. */
export function skillPromptList() {
  return SKILL_FAMILIES.map((family) => `${family.label}: ${skillsOfFamily(family.id).map((skill) => `${skill.id} (${skill.label.toLowerCase()})`).join("; ")}`).join("\n");
}

/** Everything a refresher needs to know about a skill, with its prerequisites in teaching order. */
export function refresherFor(id) {
  const skill = skillById(id);
  if (!skill) return null;
  const chain = [];
  const visit = (key) => { const item = skillById(key); if (!item || chain.includes(item.id)) return; (item.prereq || []).forEach(visit); chain.push(item.id); };
  visit(skill.id);
  return { id: skill.id, label: skill.label, focus: skill.focus, family: skill.family, prerequisites: chain.slice(0, -1).map(skillLabel) };
}

/** The part of a generation prompt that asks the model to tag each question with the skills it needs. */
export function skillTaggingRule() {
  return `<skill_tags>
For every question fill "requires_skills" with 0 to 3 ids from the list below (family: id (name)). The ids are how Luna later tells a weak skill apart from a weak topic, so they must be exact.
${skillPromptList()}
Rules:
- List the transferable skills a learner needs in order to ANSWER this question correctly, beyond knowing the topic. A price-elasticity problem that needs a derivative and a percentage change is ["derivatives", "percentages"].
- Pick the most specific id: "derivatives" rather than "algebra" when the question needs differentiation, because the specific skill is what a refresher should target.
- Use [] when the question only asks to recall a fact, a definition or a classification, because recall is topic knowledge and not a skill.
- Use only ids from the list, because an invented id cannot be counted.
</skill_tags>`;
}
