/**
 * What the dashboard is tracking.
 *
 * Luna deliberately has no second taxonomy of subjects and topics to maintain: the targets are the
 * study plans the user already made. A plan is the subject ("Biology mid-term"), its goals are the
 * topics ("Cell division", "Genetics"), and an activity counts towards a goal when its resource is
 * one of that goal's resources or when a step of the plan links the two. Two fallbacks keep the
 * screen useful before any plan exists: the folder a resource is filed in, or the topic tags the
 * questions carry.
 */

export const TRACK_BY = [
  { id: "plan", label: "Study plans", blurb: "Plans are the subjects, their goals are the topics. What you set out to achieve is what gets measured." },
  { id: "folder", label: "Folders", blurb: "The top-level folder a resource is filed in stands for the subject." },
  { id: "tag", label: "Question topics", blurb: "Whatever topic each question was tagged with." }
];

/**
 * Builds the `subjectOf` / `conceptsOf` pair that `buildEvidence` needs, for one way of tracking.
 *
 * `plans` are `{ document, plan }` rows, `folderSubjectOf` maps an attempt to its top-level folder
 * name, and `conceptsOfResource` gives the concepts a resource says it teaches.
 */
export function targetsFor(trackBy, { plans = [], folderSubjectOf, conceptsOfResource, fallbackSubject = "" } = {}) {
  if (trackBy === "plan") {
    /** resourceId → { subject: plan name, topics: [goal titles] }, so one lookup answers both. */
    const index = new Map();
    for (const row of plans) {
      const plan = row.plan || row;
      const name = plan.name || "Plan";
      const add = (resourceId, topic) => {
        if (!resourceId) return;
        const entry = index.get(resourceId) || { subject: name, topics: [] };
        if (topic && !entry.topics.includes(topic)) entry.topics.push(topic);
        index.set(resourceId, entry);
      };
      for (const goal of plan.goals || []) {
        for (const resourceId of goal.resourceIds || []) add(resourceId, goal.title);
        // A goal's concepts are topics in their own right when nothing finer is known.
        for (const item of plan.items || []) if (item.goalId === goal.id) add(item.resourceId, goal.title);
      }
      for (const item of plan.items || []) if (!item.goalId) add(item.resourceId, plan.name);
      for (const materialId of plan.materialIds || []) add(materialId, "");
    }
    return {
      subjectOf: (attempt) => index.get(attempt.resourceId)?.subject || "Outside any plan",
      conceptsOf: (attempt) => {
        const entry = index.get(attempt.resourceId);
        if (entry?.topics?.length) return entry.topics;
        return conceptsOfResource?.(attempt) || [];
      }
    };
  }
  if (trackBy === "folder") {
    return {
      subjectOf: (attempt) => folderSubjectOf?.(attempt) || fallbackSubject,
      conceptsOf: (attempt) => conceptsOfResource?.(attempt) || []
    };
  }
  return { subjectOf: (attempt) => folderSubjectOf?.(attempt) || fallbackSubject, conceptsOf: () => [] };
}

/** How much of the evidence a way of tracking actually accounts for — shown so the choice is informed. */
export function coverageOf(attempts = [], subjectOf) {
  if (!attempts.length) return { covered: 0, total: 0, share: 0 };
  const covered = attempts.filter((attempt) => {
    const subject = subjectOf(attempt);
    return subject && subject !== "Outside any plan";
  }).length;
  return { covered, total: attempts.length, share: covered / attempts.length };
}
