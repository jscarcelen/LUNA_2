import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./fakeDb.js";

vi.mock("../../lib/supabaseClient.js", async () => {
  const { db: fake } = await import("./fakeDb.js");
  return { createSupabaseAdminClient: () => fake.client, isSupabaseConfigured: () => true, getDemoOwnerUserId: () => "demo" };
});
vi.mock("../../lib/workspacesRepository.js", async () => {
  const { db: fake } = await import("./fakeDb.js");
  return {
    createWorkspace: async (name, owner) => fake.add("workspaces", { name, owner_user_id: owner }),
    createSubject: async (workspaceId, name) => fake.add("subjects", { workspace_id: workspaceId, name }),
    createFolder: async (subjectId, name, parent) => fake.add("folders", { subject_id: subjectId, name, parent_folder_id: parent || null }),
    listWorkspaceTree: async () => [],
    // The real one rewrites a document's folders and tags; this does the same against the fake tables.
    updateDocumentMeta: async (subjectId, documentId, { folderIds = [], tags = [] }) => {
      const doc = fake.table("documents").find((row) => row.id === documentId);
      doc.folder_id = folderIds[0] || null;
      fake.client.from("document_tags").delete().eq("document_id", documentId).then(() => {});
      for (const tag of tags) {
        let topic = fake.table("topic_tags").find((row) => row.subject_id === subjectId && row.tag === tag);
        if (!topic) topic = fake.add("topic_tags", { subject_id: subjectId, tag });
        fake.add("document_tags", { document_id: documentId, topic_tag_id: topic.id });
      }
    }
  };
});

const { deliverDocument, carryReceiverLayer, planResourceIds, remapPlanForRecipient } = await import("../../lib/sharingRepository.js");
const { LinkError } = await import("../../lib/accountsCore.js");

const account = (over) => db.add("accounts", { password_hash: "x", under_13: false, ...over });
const link = (requester, target, over = {}) => db.add("account_links", { kind: "teacher_student", requester_id: requester.id, requester_email: requester.email, target_id: target.id, target_email: target.email, status: "accepted", pair_key: `${requester.email}|${target.email}`, ...over });

let teacher;
let student;
let stranger;
let parent;
let maths;
let quiz;
let notes;
let plan;

/** The tags a document in the fake database carries. */
const tagsOf = (documentId) => db.table("document_tags").filter((row) => row.document_id === documentId).map((row) => db.table("topic_tags").find((tag) => tag.id === row.topic_tag_id).tag).sort();
const docs = () => db.table("documents");
const copyOf = (sourceId) => docs().find((row) => row.id === db.table("shared_items").find((item) => item.source_document_id === sourceId)?.copy_document_id);

function addDocument(owner, name, tags, content, over = {}) {
  const workspace = db.table("workspaces").find((row) => row.owner_user_id === owner.id) || db.add("workspaces", { owner_user_id: owner.id, name: "My workspace" });
  const subject = db.table("subjects").find((row) => row.workspace_id === workspace.id && row.name === "Maths") || db.add("subjects", { workspace_id: workspace.id, name: "Maths" });
  const doc = db.add("documents", { subject_id: subject.id, folder_id: null, name, content, preview: name, size_bytes: content.length, source_type: tags.includes("resource") || tags.includes("study-plan") ? "generated" : "uploaded", ...over });
  for (const tag of tags) {
    let topic = db.table("topic_tags").find((row) => row.subject_id === subject.id && row.tag === tag);
    if (!topic) topic = db.add("topic_tags", { subject_id: subject.id, tag });
    db.add("document_tags", { document_id: doc.id, topic_tag_id: topic.id });
  }
  return doc;
}

beforeEach(() => {
  db.reset();
  teacher = account({ email: "rivera@school.edu", display_name: "Prof. Rivera", role: "teacher" });
  student = account({ email: "maria@home.com", display_name: "Maria", role: "student" });
  stranger = account({ email: "tom@home.com", display_name: "Tom", role: "student" });
  parent = account({ email: "elena@home.com", display_name: "Elena", role: "parent" });
  link(teacher, student);
  link(parent, student, { kind: "parent_student", pair_key: "parent|student" });
  quiz = addDocument(teacher, "Integration quiz", ["resource", "activity", "difficulty:easy", "favourite", "due:2020-01-01"], JSON.stringify({ kind: "resource", name: "Integration quiz", activity: { questions: [{ id: "q1" }] } }));
  notes = addDocument(teacher, "Lecture notes.docx", [], "Some notes", { source_content_base64: "QUJD", source_mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  plan = addDocument(teacher, "Exam plan", ["study-plan"], JSON.stringify({
    kind: "study-plan", name: "Exam plan", learner: "", parentPlanId: "some-parent", agentScope: { agents: ["x"] }, materialIds: [notes.id, "someone-elses-doc"],
    deadlines: [{ id: "d1", title: "Exam", date: "2026-12-01", kind: "exam" }],
    goals: [{ id: "g1", title: "Integrals", resourceIds: [quiz.id, "someone-elses-doc"] }],
    items: [{ id: "i1", title: "Do the quiz", resourceId: quiz.id, dueDate: "2026-11-10", kind: "activity", doneAt: "" }, { id: "i2", title: "Build a summary", resourceId: "someone-elses-doc", generate: true, dueDate: "", kind: "read" }]
  }));
});

describe("sharing a document", () => {
  it("puts a read-only copy in Shared documents / <sender>, tagged with who sent it", async () => {
    const result = await deliverDocument({ sender: teacher, recipientId: student.id, documentId: notes.id, mode: "share" });
    expect(result).toMatchObject({ itemType: "document", refreshed: false });

    const workspace = db.table("workspaces").find((row) => row.owner_user_id === student.id);
    const subject = db.table("subjects").find((row) => row.workspace_id === workspace.id);
    expect(subject.name).toBe("Shared documents");
    const folder = db.table("folders").find((row) => row.subject_id === subject.id);
    expect(folder.name).toBe("Prof. Rivera");

    const copy = docs().find((row) => row.id === result.copyDocumentId);
    expect(copy).toMatchObject({ subject_id: subject.id, name: "Lecture notes.docx", content: "Some notes", source_content_base64: "QUJD", source_type: "uploaded" });
    expect(copy.id).not.toBe(notes.id);
    expect(copy.folder_id).toBe(folder.id);
    expect(tagsOf(copy.id)).toEqual([`shared-by:${teacher.id}`]);
    // the sender's document is untouched
    expect(docs().find((row) => row.id === notes.id).content).toBe("Some notes");
  });

  it("records what was sent, and sending it again refreshes the copy instead of duplicating it", async () => {
    const first = await deliverDocument({ sender: teacher, recipientId: student.id, documentId: notes.id, mode: "share" });
    docs().find((row) => row.id === notes.id).content = "Updated notes";
    const second = await deliverDocument({ sender: teacher, recipientId: student.id, documentId: notes.id, mode: "share" });
    expect(second.copyDocumentId).toBe(first.copyDocumentId);
    expect(second.refreshed).toBe(true);
    expect(docs().filter((row) => row.name === "Lecture notes.docx")).toHaveLength(2); // the original and one copy
    expect(docs().find((row) => row.id === first.copyDocumentId).content).toBe("Updated notes");
    expect(db.table("shared_items")).toHaveLength(1);
    expect(db.table("shared_items")[0]).toMatchObject({ sender_id: teacher.id, recipient_id: student.id, mode: "share", item_type: "document" });
    expect(db.table("folders")).toHaveLength(1);
    expect(db.table("subjects").filter((row) => row.name === "Shared documents")).toHaveLength(1);
  });

  it("files senders in their own folders", async () => {
    await deliverDocument({ sender: teacher, recipientId: student.id, documentId: notes.id, mode: "share" });
    const homework = addDocument(parent, "Reading list", [], "Books");
    await deliverDocument({ sender: parent, recipientId: student.id, documentId: homework.id, mode: "share" });
    expect(db.table("folders").map((row) => row.name).sort()).toEqual(["Elena", "Prof. Rivera"]);
  });

  it("works in the other direction: a student shares with a teacher and with a parent", async () => {
    const essay = addDocument(student, "Essay", [], "Words");
    await deliverDocument({ sender: student, recipientId: teacher.id, documentId: essay.id, mode: "share" });
    await deliverDocument({ sender: student, recipientId: parent.id, documentId: essay.id, mode: "share" });
    expect(db.table("shared_items").map((row) => row.recipient_id).sort()).toEqual([parent.id, teacher.id].sort());
  });

  it("creates the receiver's workspace if they somehow have none", async () => {
    expect(db.table("workspaces").some((row) => row.owner_user_id === student.id)).toBe(false);
    await deliverDocument({ sender: teacher, recipientId: student.id, documentId: notes.id, mode: "share" });
    expect(db.table("workspaces").some((row) => row.owner_user_id === student.id)).toBe(true);
  });
});

describe("assigning work", () => {
  it("delivers an activity with a due date and an 'assigned by' mark, minus the sender's private tags", async () => {
    const result = await deliverDocument({ sender: teacher, recipientId: student.id, documentId: quiz.id, mode: "assign", dueDate: "2026-11-01", note: "  Before Friday  " });
    expect(result.itemType).toBe("activity");
    expect(tagsOf(result.copyDocumentId)).toEqual(["activity", "assigned-by:" + teacher.id, "difficulty:easy", "due:2026-11-01", "resource", "shared-by:" + teacher.id].sort());
    expect(db.table("shared_items")[0]).toMatchObject({ mode: "assign", due_date: "2026-11-01", note: "Before Friday" });
  });

  it("sends a study plan together with the activities it uses, and points the plan at the receiver's copies", async () => {
    const result = await deliverDocument({ sender: teacher, recipientId: student.id, documentId: plan.id, mode: "assign", dueDate: "2026-12-05" });
    expect(result).toMatchObject({ itemType: "plan", copiedResources: 2 });

    const planCopy = docs().find((row) => row.id === result.copyDocumentId);
    const quizCopy = copyOf(quiz.id);
    const notesCopy = copyOf(notes.id);
    expect(quizCopy).toBeTruthy();
    expect(notesCopy).toBeTruthy();

    const body = JSON.parse(planCopy.content);
    expect(body.learner).toBe("Maria");
    expect(body.parentPlanId).toBe("");
    expect(body.agentScope).toBeNull();
    expect(body.items[0]).toMatchObject({ resourceId: quizCopy.id, title: "Do the quiz" });
    // a step pointing at something that was not the sender's (or could not be copied) loses the pointer and stops asking to be generated
    expect(body.items[1]).toMatchObject({ resourceId: "", generate: false });
    expect(body.goals[0].resourceIds).toEqual([quizCopy.id]);
    expect(body.materialIds).toEqual([notesCopy.id]);
    expect(body.deadlines.map((deadline) => deadline.date)).toEqual(["2026-12-01", "2026-12-05"]);

    expect(tagsOf(planCopy.id)).toEqual(["assigned-by:" + teacher.id, "due:2026-12-05", "shared-by:" + teacher.id, "study-plan"].sort());
    // the activity inside the plan carries the step's own due date
    expect(tagsOf(quizCopy.id)).toContain("due:2026-11-10");
    expect(tagsOf(quizCopy.id)).toContain("assigned-by:" + teacher.id);
    // the originals still point at the sender's own documents
    expect(JSON.parse(docs().find((row) => row.id === plan.id).content).items[0].resourceId).toBe(quiz.id);
  });

  it("keeps the receiver's progress when the same plan is assigned again", async () => {
    const first = await deliverDocument({ sender: teacher, recipientId: student.id, documentId: plan.id, mode: "assign" });
    const copy = docs().find((row) => row.id === first.copyDocumentId);
    const ticked = JSON.parse(copy.content);
    ticked.items[0].doneAt = "2026-10-20";
    copy.content = JSON.stringify(ticked);
    const again = await deliverDocument({ sender: teacher, recipientId: student.id, documentId: plan.id, mode: "assign", dueDate: "2026-12-09" });
    expect(again.copyDocumentId).toBe(first.copyDocumentId);
    expect(JSON.parse(docs().find((row) => row.id === first.copyDocumentId).content).items[0].doneAt).toBe("2026-10-20");
  });

  it("rejects things that are not activities or plans, and bad dates", async () => {
    await expect(deliverDocument({ sender: teacher, recipientId: student.id, documentId: notes.id, mode: "assign" })).rejects.toThrow(/Only activities/);
    await expect(deliverDocument({ sender: teacher, recipientId: student.id, documentId: quiz.id, mode: "assign", dueDate: "31/12/2026" })).rejects.toThrow(/valid due date/);
    expect(db.table("shared_items")).toHaveLength(0);
  });
});

describe("authorisation: the server decides, from the session and the link", () => {
  const rejection = async (args) => deliverDocument(args).then(() => null, (error) => error);

  it("refuses accounts you are not connected to", async () => {
    const error = await rejection({ sender: teacher, recipientId: stranger.id, documentId: notes.id, mode: "share" });
    expect(error).toBeInstanceOf(LinkError);
    expect(error.status).toBe(403);
    expect(db.table("shared_items")).toHaveLength(0);
    expect(db.table("documents").filter((row) => row.subject_id && db.table("subjects").find((s) => s.id === row.subject_id)?.name === "Shared documents")).toHaveLength(0);
  });

  it("refuses links that are still pending, declined or ended", async () => {
    for (const status of ["pending", "declined", "revoked"]) {
      db.table("account_links").find((row) => row.requester_id === teacher.id).status = status;
      const error = await rejection({ sender: teacher, recipientId: student.id, documentId: notes.id, mode: "share" });
      expect(error?.status, status).toBe(403);
    }
  });

  it("refuses a recipient that does not exist", async () => {
    const error = await rejection({ sender: teacher, recipientId: "00000000-0000-4000-8000-999999999999", documentId: notes.id, mode: "share" });
    expect(error?.status).toBe(404);
  });

  it("refuses a document that is not the sender's — even to a connected account — and does not say whether it exists", async () => {
    const theirs = addDocument(student, "Maria's diary", [], "private");
    const error = await rejection({ sender: teacher, recipientId: student.id, documentId: theirs.id, mode: "share" });
    expect(error?.status).toBe(404);
    expect((await rejection({ sender: teacher, recipientId: student.id, documentId: "00000000-0000-4000-8000-888888888888", mode: "share" }))?.status).toBe(404);
    expect(db.table("shared_items")).toHaveLength(0);
  });

  it("lets only a teacher or parent assign, and only to a student", async () => {
    const essay = addDocument(student, "Practice quiz", ["resource", "activity"], JSON.stringify({ kind: "resource" }));
    expect((await rejection({ sender: student, recipientId: teacher.id, documentId: essay.id, mode: "assign" }))?.status).toBe(403);
  });

  it("does not let a received copy be forwarded, and never sends notes, attempts or agents", async () => {
    const result = await deliverDocument({ sender: teacher, recipientId: student.id, documentId: notes.id, mode: "share" });
    const forwarded = await rejection({ sender: student, recipientId: parent.id, documentId: result.copyDocumentId, mode: "share" });
    expect(forwarded?.message).toMatch(/shared with you/);
    for (const tag of ["doc-notes", "activity-attempt", "ai-agent"]) {
      const sidecar = addDocument(teacher, `Hidden ${tag}`, [tag], "{}");
      expect((await rejection({ sender: teacher, recipientId: student.id, documentId: sidecar.id, mode: "share" }))?.status, tag).toBe(400);
    }
  });

  it("a parent's link does not give a teacher a way in to that student's other parent", async () => {
    const error = await rejection({ sender: teacher, recipientId: parent.id, documentId: notes.id, mode: "share" });
    expect(error?.status).toBe(403);
  });
});

describe("the pure helpers", () => {
  it("lists every resource a plan points at, once", () => {
    expect(planResourceIds({ items: [{ resourceId: "a" }, { resourceId: "a" }, {}], goals: [{ resourceIds: ["b"] }], materialIds: ["c", "a"] }).sort()).toEqual(["a", "b", "c"]);
  });
  it("keeps highlights and ticked steps when a copy is refreshed", () => {
    const old = JSON.stringify({ highlights: [{ id: "h" }], items: [{ id: "1", doneAt: "d" }] });
    const fresh = JSON.stringify({ title: "new", items: [{ id: "1", doneAt: "" }, { id: "2", doneAt: "" }] });
    const merged = JSON.parse(carryReceiverLayer(old, fresh));
    expect(merged.title).toBe("new");
    expect(merged.highlights).toEqual([{ id: "h" }]);
    expect(merged.items.map((item) => item.doneAt)).toEqual(["d", ""]);
    expect(carryReceiverLayer("not json", "plain")).toBe("plain");
  });
  it("remaps a plan without mutating the original", () => {
    const original = { items: [{ id: "1", resourceId: "x", generate: true }], goals: [], materialIds: ["x"], deadlines: [] };
    const remapped = remapPlanForRecipient(original, new Map([["x", "y"]]), { recipientName: "Maria", dueDate: "2026-01-01" });
    expect(remapped.items[0].resourceId).toBe("y");
    expect(remapped.deadlines).toHaveLength(1);
    expect(original.items[0].resourceId).toBe("x");
    expect(original.deadlines).toHaveLength(0);
  });
});
