import { shortDate } from "../plans/deadlines.js";
import { tEn } from "../../lib/i18n/index.js";

/** Words for the notification bell. Pure, so they are unit tested (tests/accounts/notifications.test.js). */

/** "just now", "5 min ago", "3 h ago", "2 d ago" */
export function timeAgo(value, now = Date.now(), t = tEn) {
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "";
  const minutes = Math.max(0, Math.round((now - then) / 60000));
  if (minutes < 1) return t("dialogs.ago.now");
  if (minutes < 60) return t("dialogs.ago.min", { n: minutes });
  if (minutes < 60 * 24) return t("dialogs.ago.hour", { n: Math.round(minutes / 60) });
  return t("dialogs.ago.day", { n: Math.round(minutes / (60 * 24)) });
}

const nameOf = (person, t = tEn) => person?.displayName || person?.email || t("dialogs.bell.someone");

/** One line of the list, as a sentence. Pure so it can be tested. */
export function describeEvent(event, t = tEn) {
  const who = nameOf(event.person, t);
  const dueSentence = (date, setByName = "") => {
    const day = shortDate(date, t);
    if (!day) return "";
    return setByName ? t("dialogs.bell.dueSetBy", { day, name: setByName }) : t("dialogs.bell.due", { day });
  };
  if (event.type === "link_request") return t("dialogs.bell.linkRequest", { who });
  if (event.type === "link_accepted") return t("dialogs.bell.linkAccepted", { who });
  if (event.type === "link_declined") return t("dialogs.bell.linkDeclined", { who });
  // A date on assigned work is always the sender's: "due 24 Oct, set by Prof. Rivera".
  if (event.type === "assigned") return event.dueDate ? t("dialogs.bell.assignedDue", { who, title: event.title, due: dueSentence(event.dueDate, event.dueSetBy || who) }) : t("dialogs.bell.assigned", { who, title: event.title });
  if (event.type === "exam_date") return event.subjectHint ? t("dialogs.bell.examDateHint", { who, title: event.title, hint: event.subjectHint, date: shortDate(event.examDate, t) }) : t("dialogs.bell.examDate", { who, title: event.title, date: shortDate(event.examDate, t) });
  if (event.type === "exam_date_changed") return t("dialogs.bell.examChanged", { who, title: event.title, date: shortDate(event.examDate, t) });
  if (event.type === "exam_date_cancelled") return t("dialogs.bell.examCancelled", { who, title: event.title });
  if (event.type === "grant") return t(event.permission === "edit" ? "dialogs.bell.grantEdit" : "dialogs.bell.grantView", { who, title: event.title });
  if (event.type === "shared" && ["agent", "template", "component"].includes(event.itemType)) return t(`dialogs.bell.shared.${event.itemType}`, { who, title: event.title });
  if (event.type === "shared") return t("dialogs.bell.shared", { who, title: event.title });
  return who;
}

