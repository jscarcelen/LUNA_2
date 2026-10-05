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
  if (event.type === "assigned") return `${who} assigned you “${event.title}”${event.dueDate ? ` (due ${event.dueDate})` : ""}`;
  if (event.type === "shared") return `${who} shared “${event.title}” with you`;
  return who;
}

