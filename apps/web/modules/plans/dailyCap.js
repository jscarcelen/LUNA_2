/**
 * The daily time budget of a study plan, enforced in code.
 *
 * The planner model is told how many minutes the learner can study in a day, but a model adds up badly:
 * a day can come back with 3 hours when the learner said 2. So the rule is checked here, on the schedule
 * itself, whatever the model answered: no day carries more than `maxPerDay` minutes, a single step never
 * exceeds it, and what does not fit moves to the nearest day with room (later first, then earlier), always
 * inside today..horizon. Finished steps and practice exams stay where they are.
 *
 * Pure functions: no dates are read from the clock, so they are tested without a browser or a model.
 */

export const DEFAULT_MAX_MINUTES_PER_DAY = 90;
export const MIN_MAX_MINUTES_PER_DAY = 30;
export const MAX_MAX_MINUTES_PER_DAY = 480;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The daily budget from whatever the caller sent: a sane number of minutes. */
export function normaliseMaxPerDay(value, fallback = DEFAULT_MAX_MINUTES_PER_DAY) {
  const minutes = Math.round(Number(value) || 0);
  if (!minutes) return fallback;
  return Math.min(MAX_MAX_MINUTES_PER_DAY, Math.max(MIN_MAX_MINUTES_PER_DAY, minutes));
}

const shift = (date, days) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const minutesOf = (item) => Number(item.minutes) || 30;

/**
 * @param {Array<{ id?: string, dueDate?: string, minutes?: number, kind?: string, doneAt?: string }>} items
 * @param {{ maxPerDay?: number, today: string, horizon: string, fixedIds?: Set<string> }} options
 * @returns {{ items: object[], moved: number, clamped: number, overloadedDays: string[] }} the same items, in the same order, with dates and minutes adjusted
 */
export function capDailyMinutes(items = [], { maxPerDay = DEFAULT_MAX_MINUTES_PER_DAY, today, horizon, fixedIds = new Set() } = {}) {
  const cap = normaliseMaxPerDay(maxPerDay);
  const out = items.map((item) => ({ ...item }));
  let clamped = 0;
  let moved = 0;
  if (!DATE.test(today || "") || !DATE.test(horizon || "") || horizon < today) return { items: out, moved, clamped, overloadedDays: [] };

  const isFixed = (item) => Boolean(item.doneAt) || (item.id && fixedIds.has(item.id)) || item.kind === "exam";
  for (const item of out) {
    if (!isFixed(item) && minutesOf(item) > cap) { item.minutes = cap; clamped += 1; }
  }

  const load = new Map();
  const add = (date, minutes) => load.set(date, (load.get(date) || 0) + minutes);
  for (const item of out) if (DATE.test(item.dueDate || "")) add(item.dueDate, minutesOf(item));

  const dates = [];
  for (let date = today; date <= horizon; date = shift(date, 1)) dates.push(date);

  const roomOn = (date, minutes) => (load.get(date) || 0) + minutes <= cap;
  for (const date of dates) {
    // The last-listed movable step goes first: the schedule is in date order, so it is the least urgent of the day.
    const movable = out.filter((item) => item.dueDate === date && !isFixed(item)).reverse();
    for (const item of movable) {
      if ((load.get(date) || 0) <= cap) break;
      const minutes = minutesOf(item);
      const later = dates.filter((candidate) => candidate > date && roomOn(candidate, minutes));
      const earlier = dates.filter((candidate) => candidate < date && roomOn(candidate, minutes)).reverse();
      const target = later[0] || earlier[0];
      if (!target) continue;
      add(date, -minutes);
      add(target, minutes);
      item.dueDate = target;
      moved += 1;
    }
  }

  const overloadedDays = [...load.entries()].filter(([, minutes]) => minutes > cap).map(([date]) => date).sort();
  return { items: out, moved, clamped, overloadedDays };
}
