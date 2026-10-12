/**
 * The three numbers at the top of Progress. Accuracy and retention come from mastery.js; this adds the third: am I on
 * track for the exam? It is read from the study plan that matters most (its late steps and its deadline), not guessed.
 */

/**
 * @param {{ name?: string, deadline?: string, done?: number, total?: number, late?: number }|null} plan  the plan summary (see PerformancePage)
 * @param {Date} [now]
 * @returns {{ label: string, tone: "good"|"warn"|"bad"|"none", detail: string }}
 */
export function onTrackStatus(plan, now = new Date()) {
  if (!plan || !plan.total) return { label: "No plan yet", tone: "none", detail: "Make a study plan with an exam date and Luna tells you if you are on track." };
  const done = Number(plan.done) || 0;
  const total = Number(plan.total) || 0;
  const late = Number(plan.late) || 0;
  const left = total - done;
  const deadline = plan.deadline ? new Date(`${String(plan.deadline).slice(0, 10)}T23:59:59`) : null;
  const days = deadline && !Number.isNaN(deadline.getTime()) ? Math.ceil((deadline.getTime() - now.getTime()) / 86400000) : null;
  const progress = `${done} of ${total} steps done`;
  if (!left) return { label: "On track", tone: "good", detail: `${plan.name || "Your plan"}: everything is done.` };
  if (days !== null && days < 0) return { label: "Behind", tone: "bad", detail: `${plan.name || "Your plan"}: the date has passed with ${left} step${left === 1 ? "" : "s"} left.` };
  if (late > 0) return { label: "Behind", tone: late > 2 ? "bad" : "warn", detail: `${plan.name || "Your plan"}: ${late} step${late === 1 ? " is" : "s are"} late. ${progress}.` };
  return { label: "On track", tone: "good", detail: `${plan.name || "Your plan"}: ${progress}${days !== null ? `, ${days} day${days === 1 ? "" : "s"} to go` : ""}.` };
}
