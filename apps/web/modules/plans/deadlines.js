/**
 * Who set a deadline? (pure: imported by the browser and the server)
 *
 * Every deadline of a study plan can say where it came from:
 *
 *   deadline.setBy = { kind: "sender", accountId, name }   a teacher or parent put it there (assigned work, an exam date)
 *   deadline.setBy = { kind: "self" }  (or no `setBy`)     the person who owns the plan put it there
 *   deadline.examDateId                                    the exam date (table `exam_dates`) it follows, if any
 *
 * A deadline set by a sender is IMPOSED: the receiver cannot edit or remove it (the server refuses, see
 * `checkDeadlineEdit` and lib/workspaceGuard.js), but can always add their own deadline next to it. When both
 * exist both are shown, and an imposed deadline ranks above an equal own one (`compareDeadlines`).
 */

export const SETBY_SENDER = "sender";
export const SETBY_SELF = "self";
/** Deadlines that follow a teacher's exam date are of this kind. */
export const EXAM_DEADLINE_KIND = "exam";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const text = (value) => String(value || "").trim();

/** "2026-10-24" -> "24 Oct" (fixed words: the same on the server, in emails and in tests). */
export function shortDate(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text(date));
  if (!match) return "";
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${Number(match[3])} ${month}` : "";
}

/** "due 24 Oct, set by Prof. Rivera" / "due 24 Oct (your deadline)": the words used in notifications and emails. */
export function dueSentence(date, setByName = "") {
  const day = shortDate(date);
  if (!day) return "";
  return setByName ? `due ${day}, set by ${setByName}` : `due ${day}`;
}

export const isImposed = (deadline) => deadline?.setBy?.kind === SETBY_SENDER;

/** The `setBy` of a deadline a sender sets. */
export const senderSetBy = (sender) => ({ kind: SETBY_SENDER, accountId: String(sender?.id || sender?.accountId || ""), name: text(sender?.displayName || sender?.display_name || sender?.name || "") });
export const selfSetBy = () => ({ kind: SETBY_SELF });

/**
 * What the screens show for one deadline.
 * @param {object} deadline
 * @param {{ receivedFrom?: { id?: string, name?: string } | null }} [context] `receivedFrom` is set when the plan itself is a copy
 *   (or live share) from another account: its deadlines that do not say otherwise were set by that person.
 * @returns {{ imposed: boolean, locked: boolean, by: string, byId: string, label: string, tooltip: string }}
 */
export function deadlineOrigin(deadline, context = {}) {
  const received = context?.receivedFrom || null;
  const explicit = deadline?.setBy?.kind;
  const imposed = explicit === SETBY_SENDER || (Boolean(received) && explicit !== SETBY_SELF);
  if (!imposed) return { imposed: false, locked: false, by: "", byId: "", label: "Your deadline", tooltip: "You set this deadline: you can change or remove it." };
  const by = text(deadline?.setBy?.name) || text(received?.name) || "your teacher";
  const byId = text(deadline?.setBy?.accountId) || text(received?.id);
  return { imposed: true, locked: true, by, byId, label: by, tooltip: `Set by ${by}. You cannot change it, but you can add your own earlier deadline next to it.` };
}

/** Earliest first; on the same date the imposed one first (so it is the one a card shows). */
export function compareDeadlines(a, b) {
  const left = text(a?.date) || "9999-12-31";
  const right = text(b?.date) || "9999-12-31";
  if (left !== right) return left < right ? -1 : 1;
  return Number(isImposed(b)) - Number(isImposed(a));
}

/**
 * How much more urgent an imposed deadline is than an own one of the same date (a multiplier for scores, and the
 * tie-break of the lists). Small on purpose: it decides ties, it never lets a far imposed date beat a near own one.
 */
export const IMPOSED_WEIGHT = 1.15;
export const deadlineWeight = (deadline) => (isImposed(deadline) ? IMPOSED_WEIGHT : 1);

/** The earlier of a step's own date and the date it was given (a receiver may add an earlier one of their own). */
export function effectiveDue(item) {
  const given = text(item?.dueDate);
  const own = text(item?.ownDueDate);
  if (given && own) return own < given ? own : given;
  return given || own || "";
}

/* ------------------------------------------------------------------ the rules the server enforces */

const sameDeadline = (a, b) => (
  text(a?.title) === text(b?.title)
  && text(a?.date) === text(b?.date)
  && text(a?.kind) === text(b?.kind)
  && text(a?.examDateId) === text(b?.examDateId)
  && a?.setBy?.kind === b?.setBy?.kind
  && text(a?.setBy?.accountId) === text(b?.setBy?.accountId)
);

/**
 * Compares a plan with the version a receiver wants to save. Every imposed deadline of the old plan must come
 * back unchanged (same id, date, title, kind, sender, exam date); anything else is the receiver's to change.
 * `claims` are deadlines that appear to be imposed but are new: only an exam date addressed to the account
 * can back them (see `unbackedClaims`).
 * @returns {{ ok: true, claims: object[] } | { ok: false, error: string }}
 */
export function checkDeadlineEdit(oldPlan, newPlan) {
  const before = Array.isArray(oldPlan?.deadlines) ? oldPlan.deadlines : [];
  const after = Array.isArray(newPlan?.deadlines) ? newPlan.deadlines : [];
  const afterById = new Map(after.map((deadline) => [deadline?.id, deadline]));
  for (const deadline of before) {
    if (!isImposed(deadline)) continue;
    const kept = afterById.get(deadline.id);
    if (!kept || !sameDeadline(deadline, kept)) {
      const who = text(deadline.setBy?.name) || "your teacher";
      return { ok: false, error: `“${text(deadline.title) || "This deadline"}” was set by ${who}, so it cannot be changed or removed. You can add your own deadline next to it.` };
    }
  }
  const beforeById = new Map(before.map((deadline) => [deadline?.id, deadline]));
  const claims = after.filter((deadline) => isImposed(deadline) && !(beforeById.has(deadline.id) && sameDeadline(beforeById.get(deadline.id), deadline)));
  return { ok: true, claims };
}

/**
 * New "imposed" deadlines on a plan the account owns are only believable when they follow an exam date that was
 * really sent to this account (live, the same sender and date). Anything else is refused: otherwise a plan could
 * claim to be locked by a teacher who never set anything.
 * @param {object[]} claims
 * @param {Map<string, { senderId: string, recipientId: string, date: string, revoked?: boolean }>} examDates by id
 * @param {string} accountId
 */
export function unbackedClaims(claims, examDates, accountId) {
  return (claims || []).filter((deadline) => {
    const row = examDates?.get?.(text(deadline.examDateId));
    return !(row && !row.revoked && row.recipientId === accountId && row.senderId === text(deadline.setBy?.accountId) && text(row.date) === text(deadline.date));
  });
}

/** The ids of the exam dates a plan follows. */
export const examLinksIn = (plan) => [...new Set((plan?.deadlines || []).map((deadline) => text(deadline?.examDateId)).filter(Boolean))];

/** The deadline a plan gets from an exam date. */
export function examDeadline(examDate, existingId = "") {
  return {
    id: existingId || `dl_exam_${text(examDate.id).slice(0, 8) || Math.random().toString(36).slice(2, 8)}`,
    title: text(examDate.title) || "Exam",
    date: text(examDate.date),
    kind: EXAM_DEADLINE_KIND,
    setBy: { kind: SETBY_SENDER, accountId: text(examDate.senderId), name: text(examDate.senderName) },
    examDateId: text(examDate.id)
  };
}

/** Adds (or refreshes) the deadline of an exam date to a plan. */
export function linkPlanToExamDate(plan, examDate) {
  const deadlines = Array.isArray(plan?.deadlines) ? plan.deadlines : [];
  const index = deadlines.findIndex((deadline) => text(deadline?.examDateId) === text(examDate.id));
  const next = examDeadline(examDate, index >= 0 ? deadlines[index].id : "");
  return { ...plan, deadlines: index >= 0 ? deadlines.map((deadline, at) => (at === index ? next : deadline)) : [...deadlines, next] };
}

/**
 * The sender changed an exam date: the plans that follow it move with it (the title and the date, still imposed).
 * @returns {{ plan: object, changed: boolean }}
 */
export function applyExamDateChange(plan, examDate) {
  let changed = false;
  const deadlines = (plan?.deadlines || []).map((deadline) => {
    if (text(deadline?.examDateId) !== text(examDate.id)) return deadline;
    const next = { ...deadline, title: text(examDate.title) || deadline.title, date: text(examDate.date) || deadline.date, setBy: { ...deadline.setBy, kind: SETBY_SENDER, accountId: text(examDate.senderId) || deadline.setBy?.accountId, name: text(examDate.senderName) || deadline.setBy?.name } };
    if (!sameDeadline(deadline, next)) changed = true;
    return next;
  });
  return { plan: changed ? { ...plan, deadlines } : plan, changed };
}

/**
 * The sender cancelled an exam date: the plan keeps the date as the student's OWN deadline (editable, no longer
 * linked), so nothing the student prepared is lost.
 */
export function applyExamDateCancel(plan, examDate) {
  let changed = false;
  const deadlines = (plan?.deadlines || []).map((deadline) => {
    if (text(deadline?.examDateId) !== text(examDate.id)) return deadline;
    changed = true;
    const { examDateId: _examDateId, ...rest } = deadline;
    return { ...rest, setBy: selfSetBy(), cancelledFrom: text(deadline.setBy?.name) || text(examDate.senderName) };
  });
  return { plan: changed ? { ...plan, deadlines } : plan, changed };
}
