import { newItem } from "./plan.js";

const isoDay = (date) => date.toISOString().slice(0, 10);
const shift = (day, days) => { const date = new Date(`${day}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return isoDay(date); };

/**
 * Puts a refresher into a study plan BEFORE the step it prepares for: a skill refresher (derivatives)
 * comes before the topic step (price elasticity) it unblocks, never after. The step it prepares for is
 * the first unfinished one whose title mentions the topic, else the first unfinished one with the earliest date.
 * The new step is due the day before that one (never in the past) and sits just ahead of it in the list.
 *
 * Pure: returns the new plan and where it landed. `today` is injectable for tests.
 */
export function insertPrerequisite(plan, { resourceId = "", title, topic = "", minutes = 30, skillLabel = "" } = {}, { today = isoDay(new Date()) } = {}) {
  const items = Array.isArray(plan?.items) ? plan.items : [];
  const open = items.filter((item) => !item.doneAt);
  const wanted = String(topic || "").trim().toLowerCase();
  const byDate = (a, b) => String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999"));
  const target = (wanted && open.find((item) => String(item.title || "").toLowerCase().includes(wanted))) || [...open].sort(byDate)[0] || null;

  const dueDate = target?.dueDate ? (shift(target.dueDate, -1) < today ? today : shift(target.dueDate, -1)) : today;
  const step = { ...newItem({ resourceId, title, kind: "activity", dueDate, minutes }), note: target ? `Prerequisite${skillLabel ? `: ${skillLabel}` : ""}. Do it before “${target.title}”.` : `Refresher${skillLabel ? `: ${skillLabel}` : ""}.` };
  const at = target ? items.indexOf(target) : items.length;
  const next = [...items.slice(0, at), step, ...items.slice(at)];
  return { plan: { ...plan, items: next, updatedAt: new Date().toISOString() }, step, before: target ? target.title : "" };
}
