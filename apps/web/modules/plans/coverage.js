/**
 * Exhaustive coverage: a study plan is only as good as the concepts it actually makes the learner
 * work on. For every concept in the plan's concept map this checks, and repairs, three things:
 *  - it is STUDIED (a step lists it),
 *  - it is TESTED (a step that produces or contains an activity lists it — a concept that is only
 *    read is not covered),
 *  - the final practice exam (or exam step) lists ALL of them.
 * Pure functions, shared by the planner route, the re-planner and the plan page.
 */

const key = (name) => String(name || "").trim().toLowerCase().replace(/\s+/g, " ");

export const conceptNames = (conceptMap = []) => [...new Set((conceptMap || []).map((concept) => String(concept?.name || concept || "").trim()).filter(Boolean))];

/** A step that puts questions in front of the learner: something Luna generates, or an activity already built. */
export const isTestingStep = (item) => Boolean(item && ((item.generate && item.generate !== "summary") || item.resourceId) && item.kind !== "read" && item.kind !== "review") || item?.kind === "exam";
const isExamStep = (item) => item?.kind === "exam" || item?.generate === "exam";
const isReadStep = (item) => item?.kind === "read";

/** Maps whatever wording the planner used onto the canonical concept names, dropping names that are not in the map. */
export function canonicalConcepts(list = [], names = []) {
  const byKey = new Map(names.map((name) => [key(name), name]));
  return [...new Set((list || []).map((name) => byKey.get(key(name))).filter(Boolean))];
}

export function coverageOf(items = [], names = []) {
  const studied = new Set();
  const tested = new Set();
  for (const item of items) {
    for (const concept of canonicalConcepts(item.concepts, names)) {
      studied.add(concept);
      if (isTestingStep(item)) tested.add(concept);
    }
  }
  const canTest = items.some(isTestingStep);
  return {
    total: names.length,
    studied: names.filter((name) => studied.has(name)),
    tested: names.filter((name) => tested.has(name)),
    missingStudy: names.filter((name) => !studied.has(name)),
    // When the plan has no way to test anything (no agents in scope) testing cannot be required.
    missingTest: canTest ? names.filter((name) => !tested.has(name)) : [],
    canTest
  };
}

/**
 * Adds what is missing: untested concepts go to the testing step that has the fewest concepts so
 * far (spread evenly, in order); unstudied ones to a reading step; the exam gets every concept.
 * Returns the repaired items and what was done, so the learner can be told.
 */
export function ensureCoverage(items = [], names = [], { maxPerStep = 8 } = {}) {
  if (!names.length || !items.length) return { items, repairs: [] };
  const next = items.map((item) => ({ ...item, concepts: canonicalConcepts(item.concepts, names) }));
  const repairs = [];
  const add = (index, concept, as) => {
    if (next[index].concepts.includes(concept)) return;
    next[index] = { ...next[index], concepts: [...next[index].concepts, concept] };
    repairs.push({ concept, step: next[index].title, as });
  };
  const leastLoaded = (predicate) => {
    const candidates = next.map((item, index) => ({ item, index })).filter(({ item }) => predicate(item) && !item.doneAt);
    if (!candidates.length) return -1;
    const open = candidates.filter(({ item }) => item.concepts.length < maxPerStep);
    return (open.length ? open : candidates).sort((a, b) => a.item.concepts.length - b.item.concepts.length || a.index - b.index)[0].index;
  };

  const first = coverageOf(next, names);
  for (const concept of first.missingTest) {
    const index = leastLoaded((item) => isTestingStep(item) && !isExamStep(item));
    const fallback = index >= 0 ? index : leastLoaded(isTestingStep);
    if (fallback >= 0) add(fallback, concept, "test");
  }
  for (const concept of coverageOf(next, names).missingStudy) {
    const index = leastLoaded(isReadStep);
    const fallback = index >= 0 ? index : leastLoaded(() => true);
    if (fallback >= 0) add(fallback, concept, "study");
  }
  // The closing exam is the one place everything is asked again.
  const exam = next.map((item, index) => ({ item, index })).filter(({ item }) => isExamStep(item) && !item.doneAt).pop();
  if (exam) for (const concept of names) add(exam.index, concept, "exam");
  return { items: next, repairs };
}

/** The same numbers for display: how much of the concept map the plan tests. */
export function planCoverage(plan, names = []) {
  const coverage = coverageOf(plan?.items || [], names);
  return { ...coverage, testedCount: coverage.tested.length, complete: !coverage.missingStudy.length && !coverage.missingTest.length };
}
