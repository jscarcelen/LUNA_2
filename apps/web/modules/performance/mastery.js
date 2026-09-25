/**
 * The learning intelligence layer.
 *
 * Every screen — the student's, the parent's, the teacher's three — is a different aggregation of
 * one object: **learner → subject → topic → mastery + the evidence behind it**. This file builds
 * that object from the attempts, and nothing above it re-derives its own numbers.
 *
 * Mastery is deliberately not accuracy. Eight right answers out of ten easy questions asked once,
 * three weeks ago, is not mastery of a topic; the same score on harder questions, asked recently,
 * over several sittings, and still right after a delay, is. Mastery therefore blends recent
 * accuracy with how hard the questions were, how much evidence there is (coverage), whether the
 * knowledge survived a gap (retention), and how fresh the evidence is.
 */

const DIFFICULTY_WEIGHT = { easy: 0.8, medium: 1, hard: 1.25 };

export const STATUSES = [
  { id: "mastered", label: "Mastered", min: 85, colour: "#2f9e5b" },
  { id: "strong", label: "Strong", min: 70, colour: "#34c759" },
  { id: "developing", label: "Developing", min: 55, colour: "#b25e00" },
  { id: "practice", label: "Needs practice", min: 40, colour: "#ff9f0a" },
  { id: "attention", label: "Needs attention", min: 0, colour: "#d7003a" }
];

export const MASTERY_THRESHOLD = 70;

export const statusOf = (mastery) => STATUSES.find((status) => mastery >= status.min) || STATUSES[STATUSES.length - 1];

const day = 86400000;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const mean = (list) => (list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : 0);

/**
 * One row per answered question: the atom every metric is computed from.
 * `subjectOf` and `conceptsOf` let the caller attach the workspace's own structure.
 */
export function buildEvidence(attempts = [], { subjectOf = () => "", conceptsOf = () => [] } = {}) {
  const rows = [];
  for (const attempt of attempts) {
    const at = attempt.at || "";
    const subject = subjectOf(attempt) || "";
    const concepts = conceptsOf(attempt) || [];
    for (const result of attempt.results || []) {
      if (result.correct === null || result.correct === undefined) continue;
      const topic = String(result.topic || result.skill || result.group || concepts[0] || "Unclassified").trim();
      rows.push({
        learner: attempt.learner || "",
        subject,
        topic,
        concepts,
        correct: result.correct === true,
        difficulty: String(result.difficulty || "").toLowerCase() || "medium",
        ms: Number(result.ms) || 0,
        at,
        time: at ? new Date(at).getTime() : 0,
        resourceId: attempt.resourceId || "",
        resourceName: attempt.resourceName || attempt.activityTitle || "",
        prompt: result.prompt || "",
        given: result.given || "",
        expected: result.expected || "",
        id: result.id || ""
      });
    }
  }
  return rows.sort((a, b) => a.time - b.time);
}

/**
 * Mastery of one topic from its evidence.
 *
 * - recent accuracy carries most of the weight (what the learner can do now),
 * - difficulty raises or lowers the ceiling,
 * - coverage caps mastery when there is barely any evidence,
 * - retention rewards getting it right again after a gap of a week or more,
 * - staleness pulls mastery down when nothing has been asked for a long time.
 */
export function masteryOf(rows = []) {
  if (!rows.length) return { mastery: 0, accuracy: 0, recentAccuracy: 0, coverage: 0, retention: null, trend: 0, questions: 0 };
  const ordered = [...rows].sort((a, b) => a.time - b.time);
  const questions = ordered.length;
  const accuracy = mean(ordered.map((row) => (row.correct ? 1 : 0)));
  const recent = ordered.slice(-Math.max(4, Math.ceil(questions * 0.4)));
  const recentAccuracy = mean(recent.map((row) => (row.correct ? 1 : 0)));
  const earlier = ordered.slice(0, Math.max(1, ordered.length - recent.length));
  const trend = earlier.length ? recentAccuracy - mean(earlier.map((row) => (row.correct ? 1 : 0))) : 0;

  const difficulty = mean(ordered.map((row) => DIFFICULTY_WEIGHT[row.difficulty] ?? 1));
  // Coverage: ten answered questions is "enough evidence"; below that, mastery is capped.
  const coverage = clamp(questions / 10);
  // Retention: answers given at least a week after the first sighting of the topic.
  const first = ordered[0].time;
  const delayed = ordered.filter((row) => row.time - first >= 7 * day);
  const retention = delayed.length >= 2 ? mean(delayed.map((row) => (row.correct ? 1 : 0))) : null;
  const lastAt = ordered[ordered.length - 1].at;
  const ageDays = lastAt ? Math.max(0, (Date.now() - new Date(lastAt).getTime()) / day) : 0;
  const freshness = clamp(1 - Math.max(0, ageDays - 21) / 120, 0.75, 1);

  const base = recentAccuracy * 0.65 + accuracy * 0.35;
  const withDifficulty = clamp(base * (0.85 + 0.15 * difficulty));
  const withRetention = retention === null ? withDifficulty : clamp(withDifficulty * 0.85 + retention * 0.15);
  const capped = Math.min(withRetention, 0.45 + 0.55 * coverage + 0.0001);
  const mastery = Math.round(clamp(capped * freshness) * 100);

  return {
    mastery,
    accuracy,
    recentAccuracy,
    coverage,
    retention,
    trend,
    questions,
    difficulty,
    lastAt,
    attempts: new Set(ordered.map((row) => row.resourceId)).size
  };
}

/** Mastery per topic, weakest first, with the evidence kept for drill-down. */
export function topicMastery(evidence = []) {
  const byTopic = new Map();
  for (const row of evidence) {
    if (!byTopic.has(row.topic)) byTopic.set(row.topic, []);
    byTopic.get(row.topic).push(row);
  }
  return [...byTopic.entries()]
    .map(([topic, rows]) => ({ topic, rows, ...masteryOf(rows), status: statusOf(masteryOf(rows).mastery) }))
    .sort((a, b) => a.mastery - b.mastery);
}

/** Overall mastery: topics weighted by how much evidence each one has. */
export function overallMastery(topics = []) {
  // `topicCount`, not `topics`: callers spread this beside the topic list and the names would clash.
  if (!topics.length) return { mastery: 0, mastered: 0, toImprove: 0, strongOrBetter: 0, topicCount: 0, accuracy: 0, questions: 0 };
  const weights = topics.map((topic) => Math.max(1, topic.questions));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const mastery = Math.round(topics.reduce((sum, topic, index) => sum + topic.mastery * weights[index], 0) / total);
  return {
    mastery,
    mastered: topics.filter((topic) => topic.mastery >= MASTERY_THRESHOLD + 15).length,
    strongOrBetter: topics.filter((topic) => topic.mastery >= MASTERY_THRESHOLD).length,
    toImprove: topics.filter((topic) => topic.mastery < MASTERY_THRESHOLD).length,
    topicCount: topics.length,
    accuracy: mean(topics.map((topic) => topic.accuracy)),
    questions: topics.reduce((sum, topic) => sum + topic.questions, 0)
  };
}

/** Mastery over time, one point per week: "am I actually improving?". */
export function masteryOverTime(evidence = [], weeks = 12) {
  if (!evidence.length) return [];
  const now = Date.now();
  const out = [];
  for (let index = weeks - 1; index >= 0; index -= 1) {
    const end = now - index * 7 * day;
    const upTo = evidence.filter((row) => row.time <= end);
    if (!upTo.length) { out.push({ week: new Date(end).toISOString().slice(0, 10), mastery: null, questions: 0 }); continue; }
    const topics = topicMastery(upTo.filter((row) => row.time >= end - 56 * day));
    out.push({
      week: new Date(end).toISOString().slice(0, 10),
      mastery: topics.length ? overallMastery(topics).mastery : null,
      questions: upTo.filter((row) => row.time > end - 7 * day).length
    });
  }
  return out;
}

/** Retention across topics: how well delayed answers hold up. */
export function retentionOf(topics = []) {
  const measured = topics.filter((topic) => topic.retention !== null);
  return measured.length ? { value: mean(measured.map((topic) => topic.retention)), topics: measured.length } : { value: null, topics: 0 };
}

/**
 * What to do next: the weakest topics with enough evidence to be believed, each with the reason it
 * is weak and a concrete amount of practice.
 */
export function nextActions(topics = [], errorsByTopic = new Map(), limit = 3) {
  return topics
    .filter((topic) => topic.questions >= 2 && topic.mastery < MASTERY_THRESHOLD + 10)
    .slice(0, limit)
    .map((topic) => {
      const errors = errorsByTopic.get(topic.topic) || [];
      const main = errors[0] || null;
      return {
        topic: topic.topic,
        mastery: topic.mastery,
        reason: main ? main.label : topic.coverage < 0.4 ? "Barely practised" : "Recent answers still wrong",
        reasonId: main?.id || (topic.coverage < 0.4 ? "coverage" : "accuracy"),
        advice: main?.advice || (topic.coverage < 0.4 ? "Do a short set to get a real reading of this topic." : "Practise it again, then review the mistakes."),
        questions: topic.mastery < 50 ? 10 : 6
      };
    });
}

/* ---------------------------------------------------------------- class-level views */

/** Evidence per learner, so a class can be read as a list of people. */
export function byLearner(evidence = []) {
  const map = new Map();
  for (const row of evidence) {
    const key = row.learner || "Unassigned";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return [...map.entries()].map(([learner, rows]) => {
    const topics = topicMastery(rows);
    return { learner, rows, topics, ...overallMastery(topics) };
  }).sort((a, b) => a.mastery - b.mastery);
}

/** The class × topic grid: who is where on every topic. */
export function classTopicMatrix(evidence = []) {
  const learners = byLearner(evidence);
  const topics = topicMastery(evidence).map((topic) => topic.topic);
  return {
    topics,
    rows: learners.map((entry) => ({
      learner: entry.learner,
      mastery: entry.mastery,
      cells: topics.map((topic) => {
        const found = entry.topics.find((item) => item.topic === topic);
        return { topic, mastery: found ? found.mastery : null, questions: found ? found.questions : 0 };
      })
    }))
  };
}

/** For each topic, how much of the class has reached the mastery threshold. */
export function classTopicCoverage(evidence = []) {
  const learners = byLearner(evidence);
  return topicMastery(evidence).map((topic) => {
    const seen = learners.filter((learner) => learner.topics.some((item) => item.topic === topic.topic));
    const mastered = seen.filter((learner) => (learner.topics.find((item) => item.topic === topic.topic)?.mastery || 0) >= MASTERY_THRESHOLD);
    return {
      topic: topic.topic,
      classMastery: topic.mastery,
      learners: seen.length,
      mastered: mastered.length,
      share: seen.length ? mastered.length / seen.length : 0
    };
  }).sort((a, b) => a.share - b.share);
}

/** The cross-subject matrix: who needs attention, and whether it is only in my subject. */
export function learnerSubjectMatrix(evidence = []) {
  const subjects = [...new Set(evidence.map((row) => row.subject).filter(Boolean))];
  const learners = byLearner(evidence);
  return {
    subjects,
    rows: learners.map((entry) => ({
      learner: entry.learner,
      overall: entry.mastery,
      cells: subjects.map((subject) => {
        const rows = entry.rows.filter((row) => row.subject === subject);
        if (!rows.length) return { subject, mastery: null };
        return { subject, mastery: overallMastery(topicMastery(rows)).mastery, questions: rows.length };
      })
    }))
  };
}

/** Why a learner is on the list: the signals a teacher acts on, not a ranking. */
export function attentionFlags(entry, errorsFor = () => []) {
  const flags = [];
  if (entry.mastery < MASTERY_THRESHOLD) flags.push({ id: "below", label: "Below mastery" });
  const declining = entry.topics.filter((topic) => topic.trend < -0.1);
  if (declining.length >= 2) flags.push({ id: "declining", label: `Declining in ${declining.length} topics` });
  const thin = entry.topics.filter((topic) => topic.coverage < 0.3).length;
  if (thin && thin === entry.topics.length) flags.push({ id: "coverage", label: "Too little evidence" });
  const conceptual = errorsFor(entry).find((error) => error.id === "conceptual");
  if (conceptual && conceptual.share > 0.4) flags.push({ id: "conceptual", label: "Mostly conceptual errors" });
  const retention = retentionOf(entry.topics);
  if (retention.value !== null && retention.value < 0.6) flags.push({ id: "retention", label: "Forgets after a gap" });
  return flags;
}
