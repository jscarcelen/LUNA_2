/**
 * The three numbers at the top of Progress. Accuracy and retention come from mastery.js; this adds the third: am I on
 * track for the exam? It is read from the study plan that matters most (its late steps and its deadline), not guessed.
 */
import { tEn } from "../../lib/i18n/index.js";

/**
 * @param {{ name?: string, deadline?: string, done?: number, total?: number, late?: number }|null} plan  the plan summary (see PerformancePage)
 * @param {Date} [now]
 * @returns {{ label: string, tone: "good"|"warn"|"bad"|"none", detail: string }}
 */
export function onTrackStatus(plan, now = new Date(), t = tEn) {
  if (!plan || !plan.total) return { label: t("progress.track.none.label"), tone: "none", detail: t("progress.track.none.detail") };
  const done = Number(plan.done) || 0;
  const total = Number(plan.total) || 0;
  const late = Number(plan.late) || 0;
  const left = total - done;
  const deadline = plan.deadline ? new Date(`${String(plan.deadline).slice(0, 10)}T23:59:59`) : null;
  const days = deadline && !Number.isNaN(deadline.getTime()) ? Math.ceil((deadline.getTime() - now.getTime()) / 86400000) : null;
  const name = plan.name || t("progress.track.yourPlan");
  const progress = t("progress.track.progress", { done, total });
  if (!left) return { label: t("progress.track.onTrack"), tone: "good", detail: t("progress.track.allDone", { name }) };
  if (days !== null && days < 0) return { label: t("progress.track.behind"), tone: "bad", detail: t.plural("progress.track.passed", left, { name, left }) };
  if (late > 0) return { label: t("progress.track.behind"), tone: late > 2 ? "bad" : "warn", detail: t.plural("progress.track.late", late, { name, late, progress }) };
  return { label: t("progress.track.onTrack"), tone: "good", detail: days !== null ? t.plural("progress.track.goingDays", days, { name, progress, days }) : t("progress.track.going", { name, progress }) };
}
