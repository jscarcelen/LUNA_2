import { describe, expect, it } from "vitest";
import { decideLinkedStudentRead } from "../../lib/linkedStudentRead.js";

const teacher = { id: "t1", role: "teacher" };
const parent = { id: "p1", role: "parent" };
const student = { id: "s1", role: "student" };
const link = (kind, status = "accepted") => ({ kind, status });

describe("decideLinkedStudentRead", () => {
  it("lets a linked teacher or parent read the student's own workspace", () => {
    expect(decideLinkedStudentRead({ viewer: teacher, student, link: link("teacher_student"), workspaceOwnerId: "s1" })).toEqual({ ok: true, ownerUserId: "s1" });
    expect(decideLinkedStudentRead({ viewer: parent, student, link: link("parent_student"), workspaceOwnerId: "s1" })).toEqual({ ok: true, ownerUserId: "s1" });
  });

  it("refuses everything else with the same 404", () => {
    const cases = [
      { viewer: teacher, student, link: null, workspaceOwnerId: "s1" },
      { viewer: teacher, student, link: link("teacher_student", "pending"), workspaceOwnerId: "s1" },
      { viewer: teacher, student, link: link("peer"), workspaceOwnerId: "s1" },
      { viewer: teacher, student, link: link("parent_student"), workspaceOwnerId: "s1" },
      { viewer: teacher, student, link: link("teacher_student"), workspaceOwnerId: "someone-else" },
      { viewer: teacher, student, link: link("teacher_student"), workspaceOwnerId: null },
      { viewer: student, student, link: link("teacher_student"), workspaceOwnerId: "s1" },
      { viewer: teacher, student: { id: "t2", role: "teacher" }, link: link("teacher_student"), workspaceOwnerId: "t2" },
      { viewer: null, student, link: null, workspaceOwnerId: "s1" },
      { viewer: teacher, student: null, link: null, workspaceOwnerId: null }
    ];
    for (const facts of cases) {
      const verdict = decideLinkedStudentRead(facts);
      expect(verdict.ok).toBe(false);
      expect(verdict.status).toBe(404);
    }
  });
});
