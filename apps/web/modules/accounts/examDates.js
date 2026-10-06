/**
 * Exam dates a teacher or parent sends to students (pure: browser and server; tests in tests/accounts/examDates.test.js).
 *
 * One `exam_dates` row per recipient; the rows of one send share a `batchId`, which is the item the sender sees,
 * edits and cancels. The recipient can plan for it: a study plan then carries a deadline that follows the date
 * (`deadline.setBy` = the sender, `deadline.examDateId`, see modules/plans/deadlines.js).
 */
import { isIsoDate } from "./shared.js";

export const MAX_TITLE = 120;
export const MAX_SUBJECT_HINT = 80;
export const MAX_NOTES = 500;

const text = (value) => String(value || "").replace(/\s+/g, " ").trim();

/**
 * Validates what a sender typed. Past dates are refused when sending (`allowPast` for edits of an exam that has
 * already happened).
 * @returns {{ ok: true, value: { title: string, date: string, subjectHint: string, notes: string } } | { ok: false, error: string }}
 */
export function normalizeExamInput(input, { today = new Date().toISOString().slice(0, 10), allowPast = false } = {}) {
  const title = text(input?.title).slice(0, MAX_TITLE);
  if (!title) return { ok: false, error: "Give the exam a title." };
  const date = String(input?.date || "").trim();
  if (!isIsoDate(date)) return { ok: false, error: "Choose the date of the exam." };
  if (!allowPast && date < today) return { ok: false, error: "That date is in the past." };
  return {
    ok: true,
    value: {
      title,
      date,
      subjectHint: text(input?.subjectHint).slice(0, MAX_SUBJECT_HINT),
      notes: String(input?.notes || "").trim().slice(0, MAX_NOTES)
    }
  };
}

/** An exam date row as the browser gets it (the recipient's view). */
export function shapeForRecipient(row, sender) {
  return {
    id: row.id,
    batchId: row.batch_id || "",
    title: row.title,
    date: String(row.exam_date || "").slice(0, 10),
    subjectHint: row.subject_hint || "",
    notes: row.notes || "",
    senderId: row.sender_id,
    senderName: sender?.displayName || sender?.display_name || "",
    sharedDocumentId: row.shared_document_id || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || row.created_at || "",
    acceptedAt: row.accepted_at || "",
    dismissedAt: row.dismissed_at || ""
  };
}

/** Soonest first; past dates last. */
export function sortExamDates(list, today = new Date().toISOString().slice(0, 10)) {
  return [...(list || [])].sort((a, b) => {
    const aPast = a.date < today;
    const bPast = b.date < today;
    if (aPast !== bPast) return aPast ? 1 : -1;
    return a.date.localeCompare(b.date) || String(a.title).localeCompare(String(b.title));
  });
}

/** "Maths midterm · 24 Oct · Prof. Rivera" for dropdowns. */
export function examOptionLabel(examDate, shortDate) {
  return [examDate.title, shortDate(examDate.date), examDate.senderName].filter(Boolean).join(" · ");
}

/** The upcoming exam dates a plan can still be tied to (not hidden, not in the past). */
export const planableExamDates = (list, today = new Date().toISOString().slice(0, 10)) => sortExamDates((list || []).filter((entry) => !entry.dismissedAt && entry.date >= today), today);
