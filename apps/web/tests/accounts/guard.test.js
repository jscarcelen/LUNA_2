import { beforeEach, describe, expect, it } from "vitest";
import { authorizeWorkspaceAction, displayContentOf, guardWorkspaceAction, referencesIn } from "../../lib/workspaceGuard.js";
import { SHARED_SUBJECT_NAME, isProtectedTag, redactTreeForGuardian, sharedEditAllowed } from "../../modules/accounts/shared.js";
import { createFakeDb } from "./fakeDb.js";

const ME = "acc-me";
const OTHER = "acc-other";

/** facts for: my workspace w1 (subjects s1 "Maths", s2 "Shared documents" with folder f2), someone else's w9/s9/d9. */
function facts(over = {}) {
  return {
    workspaceOwner: new Map([["w1", ME], ["w9", OTHER]]),
    subjects: new Map([["s1", { workspaceId: "w1", name: "Maths" }], ["s2", { workspaceId: "w1", name: SHARED_SUBJECT_NAME }], ["s9", { workspaceId: "w9", name: "Maths" }]]),
    folders: new Map([["f1", { subjectId: "s1" }], ["f2", { subjectId: "s2" }], ["f9", { subjectId: "s9" }]]),
    documents: new Map([
      ["d1", { subjectId: "s1", name: "My notes", tags: ["resource"], folderIds: ["f1"], content: "" }],
      ["dShared", { subjectId: "s2", name: "Quiz", tags: ["resource", "activity", "shared-by:t1", "assigned-by:t1", "due:2026-11-01"], folderIds: ["f2"], content: JSON.stringify({ kind: "resource", name: "Quiz", activity: { questions: [{ id: "q1" }] } }) }],
      ["d9", { subjectId: "s9", name: "Theirs", tags: [], folderIds: [], content: "" }]
    ]),
    ...over
  };
}
const run = (action, payload) => authorizeWorkspaceAction({ action, payload, ownerUserId: ME, facts: facts() });

describe("ownership: never trust a client-supplied id", () => {
  it("lets an account use its own ids", () => {
    expect(run("renameDocument", { documentId: "d1", nextName: "x" }).ok).toBe(true);
    expect(run("createFolder", { workspaceId: "w1", subjectId: "s1", name: "Unit 1", parentFolderId: "f1" }).ok).toBe(true);
    expect(run("createWorkspace", { name: "New" }).ok).toBe(true);
  });
  it("refuses another account's workspace, topic, folder or document, whatever the action", () => {
    for (const [action, payload] of [
      ["renameWorkspace", { workspaceId: "w9", nextName: "x" }],
      ["removeWorkspace", { workspaceId: "w9", force: true }],
      ["createSubject", { workspaceId: "w9", name: "x" }],
      ["removeSubject", { subjectId: "s9" }],
      ["createFolder", { subjectId: "s9", name: "x" }],
      ["removeFolder", { folderId: "f9" }],
      ["downloadUploadedDocument", { documentId: "d9" }],
      ["removeDocument", { documentId: "d9" }],
      ["updateGeneratedDocument", { subjectId: "s9", documentId: "d9", file: { content: "x" } }]
    ]) {
      const verdict = run(action, payload);
      expect(verdict.ok, action).toBe(false);
      expect(verdict.status, action).toBe(404);
    }
  });
  it("refuses a mix of mine and theirs (my topic with their folder, my document into their folder)", () => {
    expect(run("createFolder", { subjectId: "s1", name: "x", parentFolderId: "f9" }).ok).toBe(false);
    expect(run("updateDocumentMeta", { subjectId: "s1", documentId: "d1", folderIds: ["f9"], tags: [] }).ok).toBe(false);
    expect(run("moveFolder", { folderId: "f1", newParentFolderId: "f9" }).ok).toBe(false);
  });
  it("refuses ids that do not exist", () => {
    expect(run("renameDocument", { documentId: "nope", nextName: "x" }).status).toBe(404);
    expect(run("removeFolder", { folderId: "nope" }).status).toBe(404);
  });
  it("collects every kind of reference a payload can carry", () => {
    expect(referencesIn({ workspaceId: "w", subjectId: "s", folderId: "f", parentFolderId: "p", newParentFolderId: "n", folderIds: ["a", "b", "a"], documentId: "d" })).toEqual({
      workspaceIds: ["w"], subjectIds: ["s"], folderIds: ["f", "p", "n", "a", "b"], documentIds: ["d"]
    });
  });
});

describe("shared documents are read-only", () => {
  it("cannot be renamed, deleted, re-read or have their content replaced", () => {
    for (const action of ["renameDocument", "removeDocument", "updateDocumentContent", "reviewDocumentExtraction", "reprocessDocument"]) {
      const verdict = run(action, { documentId: "dShared", subjectId: "s2", nextName: "x" });
      expect(verdict.ok, action).toBe(false);
      expect(verdict.status, action).toBe(403);
      expect(verdict.error).toMatch(/read-only/);
    }
  });
  it("can still be downloaded", () => {
    expect(run("downloadGeneratedDocument", { documentId: "dShared" }).ok).toBe(true);
  });
  it("accepts highlights, but not an edit of what the sender wrote", () => {
    const original = JSON.parse(facts().documents.get("dShared").content);
    const withHighlights = JSON.stringify({ ...original, highlights: [{ id: "h1", text: "x" }] });
    const edited = JSON.stringify({ ...original, activity: { questions: [{ id: "q1" }, { id: "q2" }] } });
    expect(run("updateGeneratedDocument", { subjectId: "s2", documentId: "dShared", file: { name: "Quiz", content: withHighlights } }).ok).toBe(true);
    expect(run("updateGeneratedDocument", { subjectId: "s2", documentId: "dShared", file: { name: "Quiz", content: edited } }).status).toBe(403);
    expect(run("updateGeneratedDocument", { subjectId: "s2", documentId: "dShared", file: { name: "Renamed", content: withHighlights } }).status).toBe(403);
  });
  it("keeps who sent it and where it is filed when tags are updated (favourites still work)", () => {
    const verdict = run("updateDocumentMeta", { subjectId: "s2", documentId: "dShared", folderIds: [], tags: ["resource", "activity", "favourite"] });
    expect(verdict.ok).toBe(true);
    expect(verdict.payload.tags).toEqual(expect.arrayContaining(["favourite", "shared-by:t1", "assigned-by:t1"]));
    expect(verdict.payload.folderIds).toEqual(["f2"]);
  });
  it("cannot forge a sender on a document of your own", () => {
    const verdict = run("updateDocumentMeta", { subjectId: "s1", documentId: "d1", folderIds: [], tags: ["resource", "shared-by:t1", "assigned-by:t1"] });
    expect(verdict.ok).toBe(true);
    expect(verdict.payload.tags).toEqual(["resource"]);
    const saved = run("saveGeneratedQuizDocument", { subjectId: "s1", tags: ["resource", "shared-by:t1"], file: {} });
    expect(saved.payload.tags).toEqual(["resource"]);
  });
});

describe("the Shared documents topic", () => {
  it("cannot be restructured", () => {
    for (const [action, payload] of [
      ["renameSubject", { workspaceId: "w1", subjectId: "s2", nextName: "x" }],
      ["removeSubject", { workspaceId: "w1", subjectId: "s2", force: true }],
      ["createFolder", { subjectId: "s2", name: "x" }],
      ["renameFolder", { subjectId: "s2", folderId: "f2", nextName: "x" }],
      ["removeFolder", { subjectId: "s2", folderId: "f2" }],
      ["moveFolder", { folderId: "f1", newParentFolderId: "f2" }],
      ["uploadDocuments", { subjectId: "s2", folderIds: ["f2"], files: [] }]
    ]) expect(run(action, payload).status, action).toBe(403);
  });
  it("still takes the receiver's own notes and answers, and can be recoloured", () => {
    expect(run("saveGeneratedQuizDocument", { subjectId: "s2", folderIds: [], tags: ["doc-notes"], file: {} }).ok).toBe(true);
    expect(run("saveGeneratedQuizDocument", { subjectId: "s2", folderIds: [], tags: ["activity-attempt"], file: {} }).ok).toBe(true);
    expect(run("setSubjectColor", { subjectId: "s2", color: "#ff0000" }).ok).toBe(true);
  });
  it("is just another topic everywhere else", () => {
    expect(run("renameSubject", { workspaceId: "w1", subjectId: "s1", nextName: "Algebra" }).ok).toBe(true);
    expect(run("moveFolder", { folderId: "f1", newParentFolderId: "" }).ok).toBe(true);
  });
  it("cannot be used to move your own documents in", () => {
    expect(run("updateDocumentMeta", { subjectId: "s1", documentId: "d1", folderIds: ["f2"], tags: [] }).status).toBe(403);
  });
});

describe("loading the facts from the database", () => {
  const db = createFakeDb();
  beforeEach(() => {
    db.reset();
    const mine = db.add("workspaces", { owner_user_id: ME });
    const theirs = db.add("workspaces", { owner_user_id: OTHER });
    const maths = db.add("subjects", { workspace_id: mine.id, name: "Maths" });
    const shared = db.add("subjects", { workspace_id: mine.id, name: SHARED_SUBJECT_NAME });
    const theirSubject = db.add("subjects", { workspace_id: theirs.id, name: "Maths" });
    const folder = db.add("folders", { subject_id: shared.id, name: "Prof. Rivera" });
    const quiz = db.add("documents", { subject_id: shared.id, folder_id: folder.id, name: "Quiz", content: JSON.stringify({ kind: "resource" }) });
    const tag = db.add("topic_tags", { subject_id: shared.id, tag: "shared-by:t1" });
    db.add("document_tags", { document_id: quiz.id, topic_tag_id: tag.id });
    db.add("document_folders", { document_id: quiz.id, folder_id: folder.id });
    db.add("documents", { subject_id: maths.id, folder_id: null, name: "Notes", content: "" });
    db.add("documents", { subject_id: theirSubject.id, folder_id: null, name: "Theirs", content: "" });
    db.ids = { mine: mine.id, theirs: theirs.id, maths: maths.id, shared: shared.id, folder: folder.id, quiz: quiz.id, theirDoc: db.table("documents").find((d) => d.name === "Theirs").id };
  });

  it("guards a rename of a shared copy end to end", async () => {
    const verdict = await guardWorkspaceAction({ client: db.client, action: "renameDocument", payload: { documentId: db.ids.quiz, nextName: "x" }, ownerUserId: ME });
    expect(verdict.ok).toBe(false);
    expect(verdict.status).toBe(403);
  });
  it("refuses someone else's document end to end, and lets its owner through", async () => {
    expect((await guardWorkspaceAction({ client: db.client, action: "removeDocument", payload: { documentId: db.ids.theirDoc }, ownerUserId: ME })).status).toBe(404);
    expect((await guardWorkspaceAction({ client: db.client, action: "removeDocument", payload: { documentId: db.ids.theirDoc }, ownerUserId: OTHER })).ok).toBe(true);
  });
  it("knows the topic by its name", async () => {
    expect((await guardWorkspaceAction({ client: db.client, action: "createFolder", payload: { subjectId: db.ids.shared, name: "x" }, ownerUserId: ME })).status).toBe(403);
    expect((await guardWorkspaceAction({ client: db.client, action: "createFolder", payload: { subjectId: db.ids.maths, name: "x" }, ownerUserId: ME })).ok).toBe(true);
  });
});

describe("shared helpers", () => {
  it("marks only the server's tags as protected", () => {
    expect(isProtectedTag("shared-by:abc")).toBe(true);
    expect(isProtectedTag(" Assigned-By:abc ")).toBe(true);
    expect(isProtectedTag("due:2026-10-10")).toBe(false);
    expect(isProtectedTag("favourite")).toBe(false);
  });
  it("lets the receiver tick plan steps and add highlights, nothing else", () => {
    const plan = { kind: "study-plan", name: "Exam", items: [{ id: "i1", title: "Read", doneAt: "" }, { id: "i2", title: "Quiz", doneAt: "" }] };
    const ticked = { ...plan, updatedAt: "now", items: [{ ...plan.items[0], doneAt: "2026-10-05" }, plan.items[1]] };
    const rewritten = { ...plan, items: [{ ...plan.items[0], title: "Skip it" }, plan.items[1]] };
    const reordered = { ...plan, items: [plan.items[1], plan.items[0]] };
    expect(sharedEditAllowed(JSON.stringify(plan), JSON.stringify(ticked))).toBe(true);
    expect(sharedEditAllowed(JSON.stringify(plan), JSON.stringify({ ...plan, highlights: [{ a: 1 }] }))).toBe(true);
    expect(sharedEditAllowed(JSON.stringify(plan), JSON.stringify(rewritten))).toBe(false);
    expect(sharedEditAllowed(JSON.stringify(plan), JSON.stringify(reordered))).toBe(false);
    expect(sharedEditAllowed(JSON.stringify(plan), JSON.stringify({ ...plan, name: "Mine now" }))).toBe(false);
  });
  it("does not let non-JSON content change at all", () => {
    expect(sharedEditAllowed("plain text", "plain text")).toBe(true);
    expect(sharedEditAllowed("plain text", "plain text!")).toBe(false);
    expect(sharedEditAllowed("{}", "not json")).toBe(false);
  });
  it("reads the plain text out of a generated bundle", () => {
    expect(displayContentOf(JSON.stringify({ version: "generated-document-bundle-v1", plainText: "hello", downloads: {} }))).toBe("hello");
    expect(displayContentOf("raw")).toBe("raw");
  });
  it("shows a guardian the generated work but only the names of uploaded material, and no private notes", () => {
    const tree = [{ id: "w", subjects: [{ id: "s", documents: [
      { id: "up", name: "Notes.pdf", sourceType: "uploaded", content: "SECRET", preview: "SECRET", sourceContentBase64: "AAAA", tags: [] },
      { id: "gen", name: "Quiz", sourceType: "generated", content: "{\"kind\":\"resource\"}", preview: "p", sourceContentBase64: "BBBB", tags: ["resource"] },
      { id: "n", name: "notes", sourceType: "generated", content: "private", tags: ["doc-notes"] }
    ] }] }];
    const [workspace] = redactTreeForGuardian(tree);
    const docs = workspace.subjects[0].documents;
    expect(docs.map((d) => d.id)).toEqual(["up", "gen"]);
    expect(docs[0]).toMatchObject({ name: "Notes.pdf", content: "", preview: "", sourceContentBase64: "" });
    expect(docs[1]).toMatchObject({ content: "{\"kind\":\"resource\"}", sourceContentBase64: "" });
    expect(JSON.stringify(tree)).toContain("SECRET");
  });
});
