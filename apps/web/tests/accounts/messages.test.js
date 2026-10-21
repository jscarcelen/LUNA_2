import { describe, expect, it } from "vitest";
import { isLiveForRecipient, messageRecipients, normalizeMessageInput, summarizeSent } from "../../modules/accounts/messages.js";

describe("messages: input", () => {
  it("needs a subject, a message and someone to send to", () => {
    expect(normalizeMessageInput({ subject: " ", body: "x" }).ok).toBe(false);
    expect(normalizeMessageInput({ subject: "Trip", body: "  " }).ok).toBe(false);
    expect(normalizeMessageInput({ subject: "Trip", body: "Bring lunch", toStudents: false, toParents: false }).ok).toBe(false);
    const ok = normalizeMessageInput({ subject: "  Trip   on Friday ", body: "Bring lunch\r\n\r\nThanks" });
    expect(ok).toEqual({ ok: true, value: { subject: "Trip on Friday", body: "Bring lunch\n\nThanks", toStudents: true, toParents: false } });
  });
});

describe("messages: recipients", () => {
  const parents = new Map([["s1", ["p1"]], ["s2", ["p1", "p2"]]]);
  it("reaches each person once, parents about their first chosen child", () => {
    expect(messageRecipients(["s1", "s2"], parents, { toStudents: true, toParents: true })).toEqual([
      { recipientId: "s1", audience: "student", aboutStudentId: "s1" },
      { recipientId: "s2", audience: "student", aboutStudentId: "s2" },
      { recipientId: "p1", audience: "parent", aboutStudentId: "s1" },
      { recipientId: "p2", audience: "parent", aboutStudentId: "s2" }
    ]);
  });
  it("parents only, never the sender", () => {
    expect(messageRecipients(["s2"], parents, { toStudents: false, toParents: true, senderId: "p2" })).toEqual([{ recipientId: "p1", audience: "parent", aboutStudentId: "s2" }]);
  });
});

describe("messages: who still sees a row", () => {
  const pairs = new Set(["t|s1", "s1|t", "p1|s1", "s1|p1"]);
  const row = { sender_id: "t", recipient_id: "s1", about_student_id: "s1", audience: "student" };
  it("needs the teacher still connected, and the parent still connected to the child", () => {
    expect(isLiveForRecipient(row, { connectedPairs: pairs })).toBe(true);
    expect(isLiveForRecipient({ ...row, revoked_at: "x" }, { connectedPairs: pairs })).toBe(false);
    expect(isLiveForRecipient(row, { connectedPairs: new Set() })).toBe(false);
    expect(isLiveForRecipient({ ...row, recipient_id: "p1", audience: "parent" }, { connectedPairs: pairs })).toBe(true);
    expect(isLiveForRecipient({ ...row, recipient_id: "p9", audience: "parent" }, { connectedPairs: pairs })).toBe(false);
  });
});

describe("messages: the sender's list", () => {
  it("one entry per send, parents counted not named", () => {
    const rows = [
      { batch_id: "b1", subject: "Trip", body: "x", created_at: "2026-10-20T10:00:00Z", recipient_id: "s1", about_student_id: "s1", audience: "student", read_at: "y", group_id: "g" },
      { batch_id: "b1", subject: "Trip", body: "x", created_at: "2026-10-20T10:00:00Z", recipient_id: "p1", about_student_id: "s1", audience: "parent", read_at: null, group_id: "g" },
      { batch_id: "b2", subject: "Old", body: "x", created_at: "2026-10-19T10:00:00Z", recipient_id: "s1", about_student_id: "s1", audience: "student", revoked_at: "z" }
    ];
    const list = summarizeSent(rows, new Map([["s1", { displayName: "Ana" }]]), new Map([["g", "3B"]]));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ batchId: "b1", parents: 1, parentsSeen: 0, studentsSeen: 1, aboutStudentIds: ["s1"], groups: [{ id: "g", name: "3B" }], students: [{ id: "s1", displayName: "Ana", seen: true }] });
  });
});
