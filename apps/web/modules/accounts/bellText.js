import { dueSentence, shortDate } from "../plans/deadlines.js";

/** Words for the notification bell. Pure, so they are unit tested (tests/accounts/notifications.test.js). */

/** "just now", "5 min ago", "3 h ago", "2 d ago" */
export function timeAgo(value, now = Date.now()) {
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "";
  const minutes = Math.max(0, Math.round((now - then) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`;
  return `${Math.round(minutes / (60 * 24))} d ago`;
}

const nameOf = (person) => person?.displayName || person?.email || "Someone";

/** One line of the list, as a sentence. Pure so it can be tested. */
export function describeEvent(event) {
  const who = nameOf(event.person);
  if (event.type === "link_request") return `${who} wants to connect with you`;
  if (event.type === "link_accepted") return `${who} accepted your connection request`;
  if (event.type === "link_declined") return `${who} declined your connection request`;
  // A date on assigned work is always the sender's: "due 24 Oct, set by Prof. Rivera".
  if (event.type === "assigned") return `${who} assigned you “${event.title}”${event.dueDate ? ` (${dueSentence(event.dueDate, event.dueSetBy || who)})` : ""}`;
  if (event.type === "exam_date") return `${who} sent you an exam date: “${event.title}”${event.subjectHint ? ` (${event.subjectHint})` : ""}, ${shortDate(event.examDate)}`;
  if (event.type === "exam_date_changed") return `${who} changed “${event.title}” to ${shortDate(event.examDate)}; plans that follow it moved too`;
  if (event.type === "exam_date_cancelled") return `${who} cancelled the exam date “${event.title}”; your plan keeps the date as your own deadline`;
  if (event.type === "grant") return `${who} shared “${event.title}” with you (${event.permission === "edit" ? "can edit" : "can view"})`;
  if (event.type === "shared" && ["agent", "template", "component"].includes(event.itemType)) return `${who} shared the ${event.itemType} “${event.title}” with you`;
  if (event.type === "shared") return `${who} shared “${event.title}” with you`;
  return who;
}

