import { beforeEach, describe, expect, it } from "vitest";
import { authorizeWorkspaceAction, guardWorkspaceAction } from "../../lib/workspaceGuard.js";
import { createFakeDb } from "./fakeDb.js";
import { G, O, T, X, grant, world } from "./grantsFixture.js";

/** G is the logged-in account; what O shared with G is described by `grants`. */
const run = (action, payload, { grants = [], connections = new Set([O]), actor = G } = {}) => {
  const facts = world({ grants, connections });
  return authorizeWorkspaceAction({ action, payload, ownerUserId: actor, facts });
};
const view = (kind, id) => [grant(kind, id, "view")];
const edit = (kind, id) => [grant(kind, id, "edit")];

describe("reading a shared item", () => {
  it("view is enough to read and download, and the request is pointed at the owner's real topic", () => {
    const verdict = run("downloadGeneratedDocument", { workspaceId: "wG", subjectId: "sSW", documentId: "d1", format: "pdf" }, { grants: view("document", "d1") });
    expect(verdict.ok).toBe(true);
    expect(verdict.payload).toMatchObject({ subjectId: "sMaths", workspaceId: "wO", documentId: "d1" });
    expect(verdict.shared).toMatchObject({ ownerId: O, subjectId: "sMaths", workspaceId: "wO", permission: "view" });
    expect(run("downloadUploadedDocument", { documentId: "d1" }, { grants: view("folder", "fUnit") }).ok).toBe(true);
  });
  it("an item that was never shared is simply not found, like one that does not exist", () => {
    for (const documentId of ["d2", "d5", "dLoose", "ghost"]) {
      const verdict = run("downloadUploadedDocument", { documentId }, { grants: view("document", "d1") });
      expect(verdict).toMatchObject({ ok: false, status: 404 });
    }
  });
  it("private notes, agents and attempts of the owner are never reachable, even under a topic grant", () => {
    for (const documentId of ["dNotes", "dAgent"]) {
      expect(run("downloadGeneratedDocument", { documentId }, { grants: edit("subject", "sMaths") })).toMatchObject({ ok: false, status: 404 });
      expect(run("updateGeneratedDocument", { documentId, subjectId: "sMaths", file: { content: "x" } }, { grants: edit("subject", "sMaths") })).toMatchObject({ ok: false, status: 404 });
    }
  });
});

describe("view is strictly read-only", () => {
  const grants = view("folder", "fUnit");
  it("refuses every way of changing the original", () => {
    for (const [action, payload] of [
      ["updateDocumentContent", { subjectId: "sSW", documentId: "d1", correctedContent: "x" }],
      ["updateGeneratedDocument", { subjectId: "sSW", documentId: "d1", file: { name: "Lesson 1", content: "x" } }],
      ["renameDocument", { subjectId: "sSW", documentId: "d1", nextName: "Mine" }],
      ["reviewDocumentExtraction", { subjectId: "sSW", documentId: "d1", decision: "approved" }],
      ["reprocessDocument", { subjectId: "sSW", documentId: "d1" }],
      ["renameFolder", { subjectId: "sSW", folderId: "fChapter", nextName: "x" }],
      ["createFolder", { subjectId: "sSW", parentFolderId: "fChapter", name: "x" }],
      ["uploadDocuments", { subjectId: "sSW", folderIds: ["fChapter"], files: [] }],
      ["saveGeneratedQuizDocument", { subjectId: "sSW", folderIds: ["fChapter"], file: {} }]
    ]) {
      const verdict = run(action, payload, { grants });
      expect(verdict, action).toMatchObject({ ok: false, status: 403 });
      expect(verdict.error, action).toMatch(/only view/);
    }
  });
});

describe("edit changes the owner's original", () => {
  const grants = edit("folder", "fUnit");
  it("lets the content, name and plan steps be edited, pointing the write at the owner's topic", () => {
    for (const [action, payload] of [
      ["updateDocumentContent", { workspaceId: "wG", subjectId: "sSW", documentId: "d1", correctedContent: "x" }],
      ["updateGeneratedDocument", { workspaceId: "wG", subjectId: "sSW", documentId: "d1", file: { name: "Lesson 1b", content: "{}" } }],
      ["renameDocument", { workspaceId: "wG", subjectId: "sSW", documentId: "d1", nextName: "Lesson one" }],
      ["reviewDocumentExtraction", { workspaceId: "wG", subjectId: "sSW", documentId: "d1", decision: "approved" }],
      ["renameFolder", { workspaceId: "wG", subjectId: "sSW", folderId: "fChapter", nextName: "Chapter 1" }]
    ]) {
      const verdict = run(action, payload, { grants });
      expect(verdict.ok, action).toBe(true);
      expect(verdict.payload, action).toMatchObject({ subjectId: "sMaths", workspaceId: "wO" });
      expect(verdict.shared.permission).toBe("edit");
    }
  });
  it("lets files and folders be added inside a shared folder (they land in the owner's workspace)", () => {
    const upload = run("uploadDocuments", { workspaceId: "wG", subjectId: "sSW", folderIds: ["fChapter"], tags: ["shared-by:x", "doc-notes", "chapter"], files: [] }, { grants });
    expect(upload.ok).toBe(true);
    expect(upload.payload).toMatchObject({ subjectId: "sMaths", workspaceId: "wO", folderIds: ["fChapter"] });
    expect(upload.payload.tags).toEqual(["chapter"]); // no forged sender, no private-layer tag inside someone's original
    const folderCreated = run("createFolder", { workspaceId: "wG", subjectId: "sSW", parentFolderId: "fNotes", name: "More" }, { grants });
    expect(folderCreated.ok).toBe(true);
    expect(folderCreated.payload).toMatchObject({ subjectId: "sMaths", parentFolderId: "fNotes" });
    expect(run("saveGeneratedQuizDocument", { workspaceId: "wG", subjectId: "sSW", folderIds: ["fChapter"], file: {} }, { grants }).ok).toBe(true);
  });
  it("cannot reach outside what was shared", () => {
    expect(run("renameFolder", { subjectId: "sSW", folderId: "fOther", nextName: "x" }, { grants })).toMatchObject({ ok: false, status: 404 });
    expect(run("updateDocumentContent", { subjectId: "sSW", documentId: "d2", correctedContent: "x" }, { grants })).toMatchObject({ ok: false, status: 404 });
    expect(run("createFolder", { subjectId: "sSW", parentFolderId: "fOther", name: "x" }, { grants })).toMatchObject({ ok: false, status: 404 });
    expect(run("uploadDocuments", { subjectId: "sSW", folderIds: ["fOther"], files: [] }, { grants })).toMatchObject({ ok: false, status: 404 });
  });
});

describe("edit cannot delete, move, re-tag, re-share or restructure: only the owner can", () => {
  const grants = edit("subject", "sMaths");
  it("refuses every owner-only action on a shared item", () => {
    for (const [action, payload] of [
      ["removeDocument", { documentId: "d1" }],
      ["removeFolder", { subjectId: "sSW", folderId: "fChapter" }],
      ["moveFolder", { folderId: "fChapter", newParentFolderId: "" }],
      ["updateDocumentMeta", { subjectId: "sSW", documentId: "d1", folderIds: [], tags: ["favourite"] }],
      ["removeSubject", { workspaceId: "wG", subjectId: "sMaths" }],
      ["renameSubject", { workspaceId: "wG", subjectId: "sMaths", nextName: "Mine" }],
      ["addTopicTag", { subjectId: "sMaths", tag: "x" }],
      ["setSubjectColor", { subjectId: "sMaths", color: "#fff" }],
      ["somethingAddedLater", { documentId: "d1" }]
    ]) {
      const verdict = run(action, payload, { grants });
      expect(verdict.ok, action).toBe(false);
      expect([403, 404], action).toContain(verdict.status);
    }
    expect(run("removeDocument", { documentId: "d1" }, { grants })).toMatchObject({ status: 403 });
    expect(run("moveFolder", { folderId: "fChapter", newParentFolderId: "" }, { grants })).toMatchObject({ status: 403 });
    expect(run("updateDocumentMeta", { subjectId: "sSW", documentId: "d1", folderIds: [], tags: [] }, { grants }).error).toMatch(/Only the owner/);
  });
  it("cannot move a shared folder out of the share, nor pull a shared document into its own files", () => {
    expect(run("moveFolder", { folderId: "fChapter", newParentFolderId: "fOwn" }, { grants })).toMatchObject({ ok: false });
    expect(run("updateDocumentMeta", { subjectId: "sSW", documentId: "d1", folderIds: ["fOwn"], tags: [] }, { grants })).toMatchObject({ ok: false });
  });
  it("cannot push its own folder or document into the owner's folders", () => {
    expect(run("moveFolder", { folderId: "fOwn", newParentFolderId: "fChapter" }, { grants })).toMatchObject({ ok: false });
    expect(run("updateDocumentMeta", { subjectId: "sOwn", documentId: "dOwn", folderIds: ["fChapter"], tags: [] }, { grants })).toMatchObject({ ok: false });
    expect(run("uploadDocuments", { subjectId: "sOwn", folderIds: ["fOwn", "fChapter"], files: [] }, { grants })).toMatchObject({ ok: false, status: 403 });
  });
});

describe("mixing shares and own files, or two shares", () => {
  it("refuses a request that names a shared item together with the account's own files", () => {
    const grants = edit("folder", "fUnit");
    expect(run("updateDocumentContent", { subjectId: "sSW", documentId: "d1", folderIds: ["fOwn"] }, { grants })).toMatchObject({ ok: false, status: 403 });
  });
  it("refuses a request that spans two owners or two topics", () => {
    const grants = [...edit("folder", "fUnit"), ...edit("document", "d5"), grant("folder", "fT", "edit", { ownerId: T })];
    expect(run("updateDocumentContent", { subjectId: "sSW", documentId: "d1", folderIds: ["fChapter"] }, { grants, connections: new Set([O, T]) }).ok).toBe(true);
    expect(run("uploadDocuments", { subjectId: "sSW", folderIds: ["fChapter", "fT"], files: [] }, { grants, connections: new Set([O, T]) })).toMatchObject({ ok: false, status: 403 });
    expect(run("updateDocumentContent", { subjectId: "sSW", documentId: "d5", folderIds: ["fChapter"] }, { grants })).toMatchObject({ ok: false, status: 403 });
  });
  it("a made-up foreign topic id is not accepted unless a shared file lives in it", () => {
    expect(run("createFolder", { subjectId: "sMaths", name: "x" }, { grants: edit("folder", "fUnit") })).toMatchObject({ ok: false, status: 404 });
    expect(run("renameFolder", { subjectId: "sMaths", folderId: "fChapter", nextName: "x" }, { grants: edit("folder", "fUnit") }).ok).toBe(true);
    expect(run("removeWorkspace", { workspaceId: "wO" }, { grants: edit("subject", "sMaths") })).toMatchObject({ ok: false, status: 404 });
    expect(run("createSubject", { workspaceId: "wO", name: "x" }, { grants: edit("subject", "sMaths") })).toMatchObject({ ok: false, status: 404 });
  });
});

describe("a shared topic appears as a stand-in folder", () => {
  const grants = edit("subject", "sMaths");
  it("translates subj~<topic> into the real topic when adding files or folders", () => {
    const folderCreated = run("createFolder", { workspaceId: "wG", subjectId: "sSW", parentFolderId: "subj~sMaths", name: "New unit" }, { grants });
    expect(folderCreated.ok).toBe(true);
    expect(folderCreated.payload).toMatchObject({ subjectId: "sMaths", workspaceId: "wO", parentFolderId: "" });
    const upload = run("uploadDocuments", { workspaceId: "wG", subjectId: "sSW", folderIds: ["subj~sMaths"], files: [] }, { grants });
    expect(upload.ok).toBe(true);
    expect(upload.payload).toMatchObject({ subjectId: "sMaths", folderIds: [] });
  });
  it("needs a grant on the topic itself (a folder grant is not enough), and view is not enough to add", () => {
    expect(run("createFolder", { subjectId: "sSW", parentFolderId: "subj~sMaths", name: "x" }, { grants: edit("folder", "fUnit") })).toMatchObject({ ok: false, status: 404 });
    expect(run("createFolder", { subjectId: "sSW", parentFolderId: "subj~sMaths", name: "x" }, { grants: view("subject", "sMaths") })).toMatchObject({ ok: false, status: 403 });
  });
  it("the stand-in folder itself cannot be renamed, moved or removed", () => {
    for (const [action, payload] of [["renameFolder", { folderId: "subj~sMaths", nextName: "x" }], ["removeFolder", { folderId: "subj~sMaths" }], ["moveFolder", { folderId: "fOwn", newParentFolderId: "subj~sMaths" }]]) {
      expect(run(action, payload, { grants }).ok, action).toBe(false);
    }
  });
});

describe("revoking, leaving and ending the connection take effect at once", () => {
  it("a revoked grant is no longer enough for anything", () => {
    const revoked = [grant("folder", "fUnit", "edit", { revokedAt: "2026-10-05T09:00:00Z" })];
    for (const [action, payload] of [["downloadUploadedDocument", { documentId: "d1" }], ["updateDocumentContent", { subjectId: "sSW", documentId: "d1" }], ["renameFolder", { subjectId: "sSW", folderId: "fChapter", nextName: "x" }]]) {
      expect(run(action, payload, { grants: revoked })).toMatchObject({ ok: false, status: 404 });
    }
  });
  it("a grant without a live connection to the owner is not enough", () => {
    expect(run("downloadUploadedDocument", { documentId: "d1" }, { grants: edit("folder", "fUnit"), connections: new Set() })).toMatchObject({ ok: false, status: 404 });
  });
  it("someone it was not shared with gets the same answer as for a document that does not exist", () => {
    const grants = edit("folder", "fUnit");
    expect(run("downloadUploadedDocument", { documentId: "d1" }, { grants, actor: X })).toMatchObject({ ok: false, status: 404 });
    expect(run("downloadUploadedDocument", { documentId: "d1" }, { grants, actor: T })).toMatchObject({ ok: false, status: 404 });
  });
});

describe("the account's own layer on a share stays its own", () => {
  const grants = view("folder", "fUnit");
  it("saves notes and attempts into the account's own topic, never into the owner's", () => {
    const notes = run("saveGeneratedQuizDocument", { workspaceId: "wG", subjectId: "sSW", folderIds: [], tags: ["doc-notes"], file: { name: "Lesson 1 · notes.json" } }, { grants });
    expect(notes.ok).toBe(true);
    expect(notes.payload.subjectId).toBe("sSW");
    expect(notes.shared).toBeUndefined();
    const attempt = run("saveGeneratedQuizDocument", { workspaceId: "wG", subjectId: "sSW", folderIds: [], tags: ["activity-attempt"], file: {} }, { grants });
    expect(attempt.ok).toBe(true);
    expect(attempt.payload.subjectId).toBe("sSW");
    // updating the notes document it already has (an own document in the own topic)
    expect(run("updateGeneratedDocument", { workspaceId: "wG", subjectId: "sSW", documentId: "dOwn", file: { name: "My notes", content: "x" } }, { grants }).ok).toBe(true);
  });
  it("the Shared with me topic and its owner folders cannot be restructured by the account", () => {
    for (const [action, payload] of [
      ["renameSubject", { workspaceId: "wG", subjectId: "sSW", nextName: "x" }],
      ["removeSubject", { workspaceId: "wG", subjectId: "sSW" }],
      ["createFolder", { subjectId: "sSW", name: "x" }],
      ["renameFolder", { subjectId: "sSW", folderId: "fSW", nextName: "x" }],
      ["removeFolder", { subjectId: "sSW", folderId: "fSW" }],
      ["uploadDocuments", { subjectId: "sSW", folderIds: ["fSW"], files: [] }]
    ]) expect(run(action, payload, { grants }), action).toMatchObject({ ok: false, status: 403 });
  });
  it("the owner is not affected by the grants it has made", () => {
    const grantsByOwner = edit("folder", "fUnit");
    expect(run("removeDocument", { documentId: "d1" }, { grants: grantsByOwner, actor: O, connections: new Set([G]) }).ok).toBe(true);
    expect(run("moveFolder", { folderId: "fChapter", newParentFolderId: "" }, { grants: grantsByOwner, actor: O, connections: new Set([G]) }).ok).toBe(true);
    expect(run("renameFolder", { subjectId: "sMaths", folderId: "fUnit", nextName: "x" }, { actor: O }).ok).toBe(true);
  });
});

describe("end to end against the database, including folders above the one named", () => {
  const db = createFakeDb();
  let ids;
  beforeEach(() => {
    db.reset();
    const owner = db.add("workspaces", { owner_user_id: O });
    const mine = db.add("workspaces", { owner_user_id: G });
    const maths = db.add("subjects", { workspace_id: owner.id, name: "Maths" });
    const shared = db.add("subjects", { workspace_id: mine.id, name: "Shared with me" });
    const unit = db.add("folders", { subject_id: maths.id, name: "Unit 1", parent_folder_id: null });
    const chapter = db.add("folders", { subject_id: maths.id, name: "Chapter", parent_folder_id: unit.id });
    const notes = db.add("folders", { subject_id: maths.id, name: "Notes", parent_folder_id: chapter.id });
    const lesson = db.add("documents", { subject_id: maths.id, folder_id: notes.id, name: "Lesson", content: "x" });
    db.add("document_folders", { document_id: lesson.id, folder_id: notes.id });
    const exam = db.add("documents", { subject_id: maths.id, folder_id: null, name: "Exam", content: "x" });
    ids = { owner: owner.id, mine: mine.id, maths: maths.id, shared: shared.id, unit: unit.id, chapter: chapter.id, notes: notes.id, lesson: lesson.id, exam: exam.id };
  });
  const context = (grants, connections = [O]) => async () => ({ grants, connections: new Set(connections) });

  it("finds a grant on a parent folder two levels up and lets an edit through, rewriting the target", async () => {
    const grants = [grant("folder", "placeholder", "edit")];
    grants[0].itemId = ids.unit;
    const verdict = await guardWorkspaceAction({ client: db.client, action: "updateDocumentContent", payload: { workspaceId: ids.mine, subjectId: ids.shared, documentId: ids.lesson, correctedContent: "y" }, ownerUserId: G, loadGrantContext: context(grants) });
    expect(verdict.ok).toBe(true);
    expect(verdict.payload).toMatchObject({ subjectId: ids.maths, workspaceId: ids.owner, documentId: ids.lesson });
  });
  it("refuses a sibling document the folder grant does not cover, and everything once the connection is gone", async () => {
    const grants = [{ ...grant("folder", ids.unit, "edit") }];
    const no = await guardWorkspaceAction({ client: db.client, action: "updateDocumentContent", payload: { subjectId: ids.shared, documentId: ids.exam }, ownerUserId: G, loadGrantContext: context(grants) });
    expect(no).toMatchObject({ ok: false, status: 404 });
    const ended = await guardWorkspaceAction({ client: db.client, action: "updateDocumentContent", payload: { subjectId: ids.shared, documentId: ids.lesson }, ownerUserId: G, loadGrantContext: context(grants, []) });
    expect(ended).toMatchObject({ ok: false, status: 404 });
  });
  it("does not even look up grants for a request that only names the account's own things", async () => {
    let asked = 0;
    const verdict = await guardWorkspaceAction({ client: db.client, action: "createFolder", payload: { workspaceId: ids.mine, subjectId: ids.shared, name: "x" }, ownerUserId: G, loadGrantContext: async () => { asked += 1; return { grants: [], connections: new Set() }; } });
    expect(verdict.status).toBe(403); // the Shared with me topic cannot be restructured
    expect(asked).toBe(0);
  });
  it("without a grant loader (old call sites, tests) another account's id is simply not found", async () => {
    const verdict = await guardWorkspaceAction({ client: db.client, action: "downloadUploadedDocument", payload: { documentId: ids.lesson }, ownerUserId: G });
    expect(verdict).toMatchObject({ ok: false, status: 404 });
  });
  it("lets a topic grant add a folder through the stand-in id, end to end", async () => {
    const grants = [grant("subject", ids.maths, "edit")];
    const verdict = await guardWorkspaceAction({ client: db.client, action: "createFolder", payload: { workspaceId: ids.mine, subjectId: ids.shared, parentFolderId: `subj~${ids.maths}`, name: "More" }, ownerUserId: G, loadGrantContext: context(grants) });
    expect(verdict.ok).toBe(true);
    expect(verdict.payload).toMatchObject({ subjectId: ids.maths, workspaceId: ids.owner, parentFolderId: "" });
  });
});
