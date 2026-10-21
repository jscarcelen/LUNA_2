/**
 * Messages from a teacher (or parent) to their students and to those students' parents. Pure: browser and server
 * (tests in tests/accounts/messages.test.js). The database side is lib/messagesRepository.js.
 *
 * One `class_messages` row per recipient; the rows of one send share a `batchId`, which is the item the sender sees and
 * can delete. A row is for a student (`audience: "student"`) or for a parent of `aboutStudentId` (`audience: "parent"`).
 * Messages are one way: the email carries the sender's address, so a reply goes to their own inbox.
 */
export const MAX_MESSAGE_SUBJECT = 120;
export const MAX_MESSAGE_BODY = 4000;

const line = (value) => String(value || "").replace(/\s+/g, " ").trim();

/**
 * Validates what a sender typed and who it goes to.
 * @returns {{ ok: true, value: { subject: string, body: string, toStudents: boolean, toParents: boolean } } | { ok: false, error: string }}
 */
export function normalizeMessageInput(input) {
  const subject = line(input?.subject).slice(0, MAX_MESSAGE_SUBJECT);
  const body = String(input?.body || "").replace(/\r\n/g, "\n").trim().slice(0, MAX_MESSAGE_BODY);
  const toStudents = input?.toStudents !== false;
  const toParents = Boolean(input?.toParents);
  if (!subject) return { ok: false, error: "Give the message a subject." };
  if (!body) return { ok: false, error: "Write the message." };
  if (!toStudents && !toParents) return { ok: false, error: "Choose students, parents or both." };
  return { ok: true, value: { subject, body, toStudents, toParents } };
}

/**
 * Who gets a copy: each chosen student (when `toStudents`) and each parent of a chosen student (when `toParents`),
 * every person once. A parent of two chosen children gets ONE row, about the first of them.
 * @param {string[]} studentIds the chosen students, already checked to be the sender's
 * @param {Map<string, string[]>} parentsByStudent student id -> the ids of their (connected) parents
 * @returns {Array<{ recipientId: string, audience: "student" | "parent", aboutStudentId: string }>}
 */
export function messageRecipients(studentIds, parentsByStudent, { toStudents = true, toParents = false, senderId = "" } = {}) {
  const seen = new Set(senderId ? [senderId] : []);
  const out = [];
  if (toStudents) {
    for (const id of studentIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ recipientId: id, audience: "student", aboutStudentId: id });
    }
  }
  if (toParents) {
    for (const studentId of studentIds) {
      for (const parentId of parentsByStudent.get(studentId) || []) {
        if (seen.has(parentId)) continue;
        seen.add(parentId);
        out.push({ recipientId: parentId, audience: "parent", aboutStudentId: studentId });
      }
    }
  }
  return out;
}

/**
 * The sender's list: one entry per send, newest first, with who it reached and how many have seen it. Parents are
 * counted, never named (the sender is not necessarily connected to them).
 * @param {object[]} rows class_messages rows of one sender
 * @param {Map<string, { displayName?: string, email?: string }>} studentsById names of the sender's students
 * @param {Map<string, string>} groupNames group id -> name
 */
export function summarizeSent(rows, studentsById = new Map(), groupNames = new Map()) {
  const batches = new Map();
  for (const row of rows || []) {
    if (row.revoked_at) continue;
    const entry = batches.get(row.batch_id) || { batchId: row.batch_id, subject: row.subject, body: row.body, sentAt: row.created_at, groupIds: new Set(), students: [], parents: 0, parentsSeen: 0, studentsSeen: 0 };
    if (row.group_id) entry.groupIds.add(row.group_id);
    if (row.audience === "parent") {
      entry.parents += 1;
      if (row.read_at) entry.parentsSeen += 1;
    } else {
      const who = studentsById.get(row.recipient_id);
      entry.students.push({ id: row.recipient_id, displayName: who?.displayName || who?.email || "", seen: Boolean(row.read_at) });
      if (row.read_at) entry.studentsSeen += 1;
    }
    if (String(row.created_at) < String(entry.sentAt)) entry.sentAt = row.created_at;
    batches.set(row.batch_id, entry);
  }
  return [...batches.values()]
    .map(({ groupIds, ...entry }) => ({ ...entry, aboutStudentIds: [...new Set((rows || []).filter((row) => row.batch_id === entry.batchId && !row.revoked_at).map((row) => row.about_student_id))], groups: [...groupIds].map((id) => ({ id, name: groupNames.get(id) || "" })).filter((group) => group.name) }))
    .sort((a, b) => String(b.sentAt).localeCompare(String(a.sentAt)));
}

/** A message as its recipient gets it. */
export function shapeReceived(row, { sender, aboutStudent } = {}) {
  return {
    id: row.id,
    subject: row.subject,
    body: row.body,
    sentAt: row.created_at,
    read: Boolean(row.read_at),
    audience: row.audience,
    sender: { id: row.sender_id, displayName: sender?.display_name || sender?.displayName || "", role: sender?.role || "", email: sender?.email || "" },
    aboutStudent: row.audience === "parent" ? { id: row.about_student_id, displayName: aboutStudent?.display_name || aboutStudent?.displayName || "" } : null
  };
}

/** Is this row still for its recipient? The sender must still teach the student, and a parent must still be that student's parent. */
export function isLiveForRecipient(row, { connectedPairs }) {
  if (!row || row.revoked_at || row.hidden_at) return false;
  if (!connectedPairs.has(`${row.sender_id}|${row.about_student_id}`)) return false;
  if (row.audience === "parent" && !connectedPairs.has(`${row.recipient_id}|${row.about_student_id}`)) return false;
  return true;
}
