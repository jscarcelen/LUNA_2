import { normaliseSkillIds, skillById, skillLabel, toSkillId, skillsForQuestion } from "../skills/taxonomy.js";
import { tEn } from "../../lib/i18n/index.js";

/**
 * Topic or skill?
 *
 * A wrong answer in microeconomics is either "I do not know the idea" (a TOPIC gap) or "I know the
 * idea but cannot differentiate" (a SKILL gap). They call for different work, so this reads every
 * answered question as a point in a topic × skill grid and compares like with like:
 *
 *  - a skill is WEAK when the questions that need it are answered clearly worse than the ones that
 *    do not, across topics;
 *  - a weak topic is a SKILL problem when most of its mistakes sit on weak skills and the questions
 *    without them go fine, a TOPIC problem when its mistakes are spread over whatever skills the
 *    question needs, BOTH when the questions that avoid the weak skills fail too;
 *  - with too few answers it says so ("unclear") instead of guessing.
 *
 * Pure functions over attempt results (`attempt.results[]`, each with topic, skills, correct).
 */

export const THRESHOLDS = { weak: 0.65, minSkill: 4, minTopic: 4, minClean: 3, gap: 0.12 };

const ratio = (right, total) => (total ? right / total : null);

/** The graded answers of a set of attempts as flat rows: { topic, skills[], correct, prompt, at }. */
export function diagnosisRows(attempts = [], t = tEn) {
  const rows = [];
  for (const attempt of attempts) {
    for (const result of attempt.results || []) {
      if (result.correct !== true && result.correct !== false) continue;
      let skills = normaliseSkillIds(result.skills);
      // Older attempts: the old flat tag, then what the question's own words say.
      if (!skills.length && result.skill) { const legacy = toSkillId(result.skill); if (legacy) skills = [legacy]; }
      if (!skills.length) skills = skillsForQuestion({ prompt: result.prompt, answer: result.expected });
      // When the grader read the learner's working and named the skill that failed, the mistake belongs to that skill alone.
      const failed = result.correct === false ? toSkillId(result.failedSkill) : null;
      const blame = failed ? [failed] : [];
      if (failed && !skills.includes(failed)) skills = [...skills, failed];
      rows.push({ topic: String(result.topic || result.group || t("progress.diag.other")), skills, blame, correct: result.correct === true, prompt: String(result.prompt || ""), at: attempt.at || "" });
    }
  }
  return rows;
}

function accuracyOf(rows) {
  return ratio(rows.filter((row) => row.correct).length, rows.length);
}

/** Skill → how it fares: asked, wrong, accuracy with and without it, whether it is weak, where. */
export function skillStats(rows, thresholds = THRESHOLDS) {
  const ids = [...new Set(rows.flatMap((row) => row.skills))];
  return ids.map((id) => {
    const withSkill = rows.filter((row) => row.skills.includes(id));
    const without = rows.filter((row) => !row.skills.includes(id));
    // A wrong answer counts against a skill unless the grader blamed a different one.
    const wrong = withSkill.filter((row) => !row.correct && (!row.blame?.length || row.blame.includes(id)));
    const acc = withSkill.length ? 1 - wrong.length / withSkill.length : null;
    const accWithout = without.length >= thresholds.minClean ? accuracyOf(without) : null;
    const weak = withSkill.length >= thresholds.minSkill && acc < thresholds.weak && (accWithout === null || acc <= accWithout - thresholds.gap);
    const skill = skillById(id);
    return {
      id, label: skillLabel(id), family: skill?.family || "", asked: withSkill.length, wrong: wrong.length, acc, accWithout, weak,
      topics: [...new Set(withSkill.map((row) => row.topic))],
      wrongTopics: [...new Set(wrong.map((row) => row.topic))]
    };
  }).sort((a, b) => b.wrong - a.wrong || b.asked - a.asked);
}

/**
 * The verdict for every topic: "ok", "skill", "topic", "both" or "unclear", with the weak skills
 * involved and one plain sentence saying why.
 */
export function diagnoseTopics(rows, skills = skillStats(rows), thresholds = THRESHOLDS, t = tEn) {
  const weakIds = new Set(skills.filter((skill) => skill.weak).map((skill) => skill.id));
  const topics = [...new Set(rows.map((row) => row.topic))];
  return topics.map((topic) => {
    const own = rows.filter((row) => row.topic === topic);
    const acc = accuracyOf(own);
    const wrong = own.filter((row) => !row.correct);
    const base = { topic, asked: own.length, wrong: wrong.length, acc, verdict: "ok", skills: [], skillShare: 0, cleanAcc: null, reason: "" };
    if (own.length < thresholds.minTopic) return { ...base, verdict: wrong.length ? "unclear" : "ok", reason: wrong.length ? t.plural("progress.diag.few", own.length) : "" };
    if (acc >= thresholds.weak) return base;
    const onWeak = wrong.filter((row) => (row.blame?.length ? row.blame : row.skills).some((id) => weakIds.has(id)));
    const skillShare = wrong.length ? onWeak.length / wrong.length : 0;
    const involved = [...weakIds].map((id) => ({ id, n: wrong.filter((row) => (row.blame?.length ? row.blame : row.skills).includes(id)).length })).filter((entry) => entry.n > 0).sort((a, b) => b.n - a.n).map((entry) => entry.id);
    const clean = own.filter((row) => !row.skills.some((id) => weakIds.has(id)));
    const cleanAcc = clean.length >= thresholds.minClean ? accuracyOf(clean) : null;
    const lead = skillLabel(involved[0] || "").toLowerCase();
    let verdict; let reason;
    if (!involved.length || skillShare < 0.4) {
      verdict = "topic"; reason = t("progress.diag.spread");
    } else if (skillShare >= 0.6 && (cleanAcc === null || cleanAcc >= 0.7)) {
      verdict = "skill"; reason = cleanAcc !== null ? t("progress.diag.skillClean", { onWeak: onWeak.length, wrong: wrong.length, lead, pct: Math.round(cleanAcc * 100) }) : t("progress.diag.skill", { onWeak: onWeak.length, wrong: wrong.length, lead });
    } else if (cleanAcc !== null && cleanAcc < thresholds.weak) {
      verdict = "both"; reason = t("progress.diag.both", { onWeak: onWeak.length, wrong: wrong.length, lead, pct: Math.round(cleanAcc * 100) });
    } else if (skillShare >= 0.5) {
      verdict = "skill"; reason = t("progress.diag.skill", { onWeak: onWeak.length, wrong: wrong.length, lead });
    } else {
      verdict = "unclear"; reason = t("progress.diag.unclear");
    }
    return { ...base, verdict, skills: involved, skillShare, cleanAcc, reason };
  }).sort((a, b) => (a.acc ?? 1) - (b.acc ?? 1));
}

/** The topic × skill grid for the heatmap: every cell with how many were asked and how many right. */
export function skillMatrix(rows, { maxTopics = 8, maxSkills = 8 } = {}) {
  const topicCounts = new Map();
  const skillCounts = new Map();
  for (const row of rows) {
    topicCounts.set(row.topic, (topicCounts.get(row.topic) || 0) + 1);
    for (const id of row.skills) skillCounts.set(id, (skillCounts.get(id) || 0) + 1);
  }
  const topics = [...topicCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxTopics).map(([topic]) => topic);
  const skills = [...skillCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxSkills).map(([id]) => id);
  const cells = {};
  for (const topic of topics) for (const id of skills) {
    const hit = rows.filter((row) => row.topic === topic && row.skills.includes(id));
    if (hit.length) cells[`${topic}|${id}`] = { asked: hit.length, wrong: hit.filter((row) => !row.correct).length, acc: accuracyOf(hit) };
  }
  return { topics, skills, cells };
}

/** Everything the screen and the coach need, from the attempts. */
export function diagnoseSkills(attempts = [], thresholds = THRESHOLDS, t = tEn) {
  const rows = diagnosisRows(attempts, t);
  const skills = skillStats(rows, thresholds);
  const topics = diagnoseTopics(rows, skills, thresholds, t);
  const weakSkills = skills.filter((skill) => skill.weak).map((skill) => ({
    ...skill,
    // The topics this skill is the main cause of: fixing it lifts all of them at once.
    lifts: topics.filter((topic) => (topic.verdict === "skill" || topic.verdict === "both") && topic.skills.includes(skill.id)).map((topic) => topic.topic)
  }));
  return { rows: rows.length, skills, weakSkills, topics, matrix: skillMatrix(rows), headline: headlineOf(weakSkills, topics, t) };
}

/** One plain sentence: the single most useful thing the grid says. */
export function headlineOf(weakSkills, topics, t = tEn) {
  const lead = weakSkills.find((skill) => skill.lifts.length) || weakSkills[0];
  if (lead && lead.lifts.length) return lead.lifts.length === 1 ? t("progress.diag.h.holdOne", { label: lead.label, topic: lead.lifts[0] }) : t("progress.diag.h.holdMany", { label: lead.label, count: lead.lifts.length });
  if (lead) return t("progress.diag.h.weakest", { label: lead.label, pct: Math.round(lead.acc * 100) });
  const weakTopic = topics.find((topic) => topic.verdict === "topic");
  if (weakTopic) return t("progress.diag.h.topicGap", { topic: weakTopic.topic });
  return topics.some((topic) => topic.verdict === "unclear") ? t("progress.diag.h.fewMore") : t("progress.diag.h.none");
}

/**
 * The next steps the diagnosis implies, most useful first. A skill gap gets a refresher on the skill
 * (then the topic), a topic gap gets re-teaching, "both" gets the skill first.
 */
export function diagnosisActions(diagnosis, max = 4, t = tEn) {
  const actions = [];
  for (const skill of diagnosis.weakSkills || []) {
    actions.push({ kind: "skill-primer", skill: skill.id, skillLabel: skill.label, topics: skill.lifts.length ? skill.lifts : skill.wrongTopics.slice(0, 3), weight: skill.wrong, why: skill.accWithout !== null ? t("progress.diag.why.vs", { pct: Math.round(skill.acc * 100), skill: skill.label.toLowerCase(), without: Math.round(skill.accWithout * 100) }) : t("progress.diag.why", { pct: Math.round(skill.acc * 100), skill: skill.label.toLowerCase() }) });
  }
  for (const topic of diagnosis.topics || []) {
    if (topic.verdict === "topic" || topic.verdict === "both") actions.push({ kind: "reteach", topic: topic.topic, topics: [topic.topic], weight: topic.wrong, why: topic.reason });
  }
  return actions.sort((a, b) => b.weight - a.weight).slice(0, max);
}
