/**
 * Lead with progress, not with failure.
 *
 * The Practice list and the student's Home used to open with a wall of red "7 days late" badges. These
 * pure helpers turn the same real data into a calm order of things: what you finished this week first,
 * then ONE catch-up message instead of a badge per row, with the individual chips softened after the first.
 */

import { tEn } from "../../lib/i18n/index.js";

const DAY = 86400000;
const iso = (value) => new Date(value).toISOString().slice(0, 10);

/** Today as YYYY-MM-DD (UTC, the same clock `daysUntil` uses). */
export function todayIso(now = Date.now()) {
  return iso(now);
}

/** The attempts made in the last 7 days (today included). `attempts` are `{ at }` or `{ attempt: { at } }`. */
export function doneThisWeek(attempts = [], now = Date.now()) {
  const since = new Date(`${iso(now)}T00:00:00Z`).getTime() - 6 * DAY;
  return attempts.filter((entry) => {
    const at = Date.parse(entry?.attempt?.at || entry?.at || "");
    return Number.isFinite(at) && at >= since && at <= now + DAY;
  }).length;
}

/** "2 quizzes done this week"; empty when nothing was done (no negative framing, just no line). */
export function weekHeadline(count, t = tEn) {
  const n = Math.max(0, Number(count) || 0);
  if (!n) return "";
  return t.plural("practice.weekHeadline", n);
}

/** How many things are waiting and how many of them are past their date. A row is `{ done, due }`. */
export function summariseCatchUp(rows = [], { attempts = [], now = Date.now() } = {}, t = tEn) {
  const today = iso(now);
  const open = rows.filter((row) => !row.done);
  const late = open.filter((row) => row.due && row.due < today);
  const waiting = open.length;
  const finished = doneThisWeek(attempts, now);
  const catchUp = late.length >= 2
    ? t("practice.catchUp.multi", { count: late.length })
    : late.length === 1 ? t("practice.catchUp.single") : "";
  return { doneThisWeek: finished, headline: weekHeadline(finished, t), waiting, late: late.length, catchUp };
}

/**
 * The colour of a "late" chip: the first (most urgent) one keeps the red, the others are amber so a long
 * backlog does not read as a wall of alarms. `index` is the position among the late rows.
 */
export function lateTone(index) {
  return index <= 0 ? "red" : "amber";
}

/** Tailwind classes for the late chip of the given tone. */
export const LATE_CHIP = {
  red: "bg-[rgba(255,59,48,0.12)] text-[var(--color-danger)]",
  amber: "bg-[rgba(255,159,10,0.16)] text-[#8a4a00]"
};
