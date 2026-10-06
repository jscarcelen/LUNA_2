import { describe, expect, it } from "vitest";
import {
  createJournal,
  findCompanions,
  isPlanFolder,
  isStructuralFolder,
  moveDocumentsTo,
  moveFolderTree,
  planReferences,
  subtreeFolderIds,
  uniqueFolderName,
  wouldCreateCycle
} from "../../lib/workspaceMove.js";
import { createFakeClient, seedWorkspace } from "./fakeClient.js";

const TABLES = ["folders", "documents", "document_folders", "document_tags", "document_chunks", "attempts"];
// Row order and updated_at are not part of "the same data" (an undo re-inserts rows at the end).
const clean = ({ updated_at, ...row }) => row; // eslint-disable-line no-unused-vars
const snapshot = (client) => Object.fromEntries(TABLES.map((table) => [table, client.rows(table).map(clean).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))]));
const byId = (rows, id) => rows.find((row) => row.id === id);

describe("pure helpers", () => {
  const folders = seedWorkspace().folders;

  it("computes a subtree, root first", () => {
    expect(subtreeFolderIds(folders, "a-up")).toEqual(["a-up", "a-led", "a-sub"]);
    expect(subtreeFolderIds(folders, "a-sub")).toEqual(["a-sub"]);
  });

  it("does not hang on a corrupt loop", () => {
    const loop = [{ id: "x", parent_folder_id: "y" }, { id: "y", parent_folder_id: "x" }];
    expect(subtreeFolderIds(loop, "x")).toEqual(["x", "y"]);
  });

  it("refuses to file a folder inside itself or its own subfolders", () => {
    expect(wouldCreateCycle(folders, "a-led", "a-led")).toBe(true);
    expect(wouldCreateCycle(folders, "a-led", "a-sub")).toBe(true);
    expect(wouldCreateCycle(folders, "a-led", "a-up")).toBe(false);
    expect(wouldCreateCycle(folders, "a-led", "s-up")).toBe(false);
    expect(wouldCreateCycle(folders, "a-led", "")).toBe(false);
  });

  it("suffixes a taken name with (2), (3)...", () => {
    expect(uniqueFolderName("Notes", [])).toEqual({ name: "Notes", renamed: false });
    expect(uniqueFolderName("Notes", ["notes"])).toEqual({ name: "Notes (2)", renamed: true });
    expect(uniqueFolderName("Notes", ["Notes", "Notes (2)"])).toEqual({ name: "Notes (3)", renamed: true });
  });

  it("knows the topic skeleton and a plan's folder", () => {
    expect(isStructuralFolder(byId(folders, "a-up"), folders)).toBe(true);
    expect(isStructuralFolder(byId(folders, "a-plans"), folders)).toBe(true);
    expect(isStructuralFolder(byId(folders, "a-loose"), folders)).toBe(true);
    expect(isStructuralFolder(byId(folders, "a-led"), folders)).toBe(false);
    expect(isPlanFolder(byId(folders, "a-exam"), folders)).toBe(true);
    expect(isPlanFolder(byId(folders, "a-led"), folders)).toBe(false);
  });

  it("reads what a plan uses", () => {
    const content = JSON.stringify({ materialIds: ["a"], items: [{ resourceId: "b" }], goals: [{ resourceIds: ["c"] }] });
    expect(planReferences(content, ["a", "b", "c", "d"])).toEqual(["a", "b", "c"]);
    expect(planReferences("not json", ["a"])).toEqual([]);
  });
});

describe("journal", () => {
  it("undoes in reverse order and keeps going when one undo fails", async () => {
    const calls = [];
    const journal = createJournal();
    await journal.step("one", async () => calls.push("do 1"), async () => calls.push("undo 1"));
    await journal.step("two", async () => calls.push("do 2"), async () => { throw new Error("boom"); });
    await journal.step("three", async () => calls.push("do 3"), async () => calls.push("undo 3"));
    const { failed } = await journal.rollback();
    expect(calls).toEqual(["do 1", "do 2", "do 3", "undo 3", "undo 1"]);
    expect(failed).toEqual(["two"]);
  });

  it("registers the undo before the change runs, so a half-done change is still undone", async () => {
    const journal = createJournal();
    let undone = false;
    await expect(journal.step("half", async () => { throw new Error("fails midway"); }, async () => { undone = true; })).rejects.toThrow("fails midway");
    await journal.rollback();
    expect(undone).toBe(true);
  });
});

describe("moving a folder to another topic", () => {
  it("moves the whole subtree and every document filed in it, keeping ids", async () => {
    const client = createFakeClient(seedWorkspace());
    const result = await moveFolderTree(client, { folderId: "a-led", targetSubjectId: "sta", targetFolderId: "s-up" });

    const folders = client.rows("folders");
    expect(byId(folders, "a-led")).toMatchObject({ subject_id: "sta", parent_folder_id: "s-up" });
    expect(byId(folders, "a-sub")).toMatchObject({ subject_id: "sta", parent_folder_id: "a-led" });
    expect(byId(folders, "a-up").subject_id).toBe("acc");

    const documents = client.rows("documents");
    expect(byId(documents, "doc-1").subject_id).toBe("sta");
    expect(byId(documents, "doc-2").subject_id).toBe("sta");
    expect(byId(documents, "doc-3").subject_id).toBe("acc");
    expect(client.rows("document_chunks").every((chunk) => chunk.subject_id === "sta")).toBe(true);

    expect(result).toMatchObject({ folders: 2, documents: 2, subjectId: "sta", renamed: true, name: "Ledgers (2)" });
    expect(result.notes.join(" ")).toContain("Ledgers (2)");
    expect(byId(folders, "a-led").name).toBe("Ledgers (2)");
  });

  it("drops filing in folders that stay behind, and carries notes and tags with the document", async () => {
    const client = createFakeClient(seedWorkspace());
    await moveFolderTree(client, { folderId: "a-led", targetSubjectId: "sta", targetFolderId: "s-up" });

    // doc-1 was also filed in "Uploaded material" of Accounting: that link must not point across topics.
    expect(client.rows("document_folders").filter((row) => row.document_id === "doc-1").map((row) => row.folder_id)).toEqual(["a-led"]);
    expect(byId(client.rows("documents"), "doc-1").folder_id).toBe("a-led");

    // its notes file travels with it (same id), tags are re-created in Statistics
    expect(byId(client.rows("documents"), "notes-1").subject_id).toBe("sta");
    const topicTags = client.rows("topic_tags");
    const tagsOf = (id) => client.rows("document_tags").filter((row) => row.document_id === id).map((row) => topicTags.find((tag) => tag.id === row.topic_tag_id));
    expect(tagsOf("doc-1").map((tag) => [tag.tag, tag.subject_id])).toEqual([["favourite", "sta"]]);
    expect(tagsOf("notes-1").map((tag) => [tag.tag, tag.subject_id])).toEqual([["doc-notes", "sta"]]);
    // a tag that already existed in the target is reused, not duplicated
    expect(topicTags.filter((tag) => tag.subject_id === "sta" && tag.tag === "favourite")).toHaveLength(1);
  });

  it("moves to the topic root", async () => {
    const client = createFakeClient(seedWorkspace());
    const result = await moveFolderTree(client, { folderId: "a-led", targetSubjectId: "sta" });
    expect(byId(client.rows("folders"), "a-led")).toMatchObject({ subject_id: "sta", parent_folder_id: null, name: "Ledgers" });
    expect(result.renamed).toBe(false);
  });

  it("keeps a study plan together: its folder goes under the target's Study plans, with plan, quiz and attempts", async () => {
    const client = createFakeClient(seedWorkspace());
    const result = await moveFolderTree(client, { folderId: "a-exam", targetSubjectId: "sta", targetFolderId: "s-led" });

    const folders = client.rows("folders");
    const plansRoot = folders.find((folder) => folder.subject_id === "sta" && folder.name === "Study plans");
    expect(plansRoot).toMatchObject({ parent_folder_id: "s-gen" });
    expect(byId(folders, "a-exam")).toMatchObject({ subject_id: "sta", parent_folder_id: plansRoot.id });

    const documents = client.rows("documents");
    for (const id of ["plan-doc", "quiz-1", "attempt-1"]) expect(byId(documents, id).subject_id).toBe("sta");
    expect(byId(client.rows("attempts"), "at1").subject_id).toBe("sta");
    // its reference material (doc-3) is only linked, so it stays; the user is told
    expect(byId(documents, "doc-3").subject_id).toBe("acc");
    expect(result.notes.join(" ")).toMatch(/Study plans/);
    expect(result.notes.join(" ")).toMatch(/stayed in Accounting/);
  });

  it("refuses the topic skeleton, cycles, other workspaces and the shared topic, changing nothing", async () => {
    const client = createFakeClient(seedWorkspace());
    const before = snapshot(client);
    await expect(moveFolderTree(client, { folderId: "a-up", targetSubjectId: "sta" })).rejects.toThrow(/stays where it is/);
    await expect(moveFolderTree(client, { folderId: "a-led", targetFolderId: "a-sub" })).rejects.toThrow(/own subfolders/);
    await expect(moveFolderTree(client, { folderId: "a-led", targetFolderId: "a-led" })).rejects.toThrow(/own subfolders/);
    await expect(moveFolderTree(client, { folderId: "a-led", targetSubjectId: "oth", targetFolderId: "o-up" })).rejects.toThrow(/same workspace/);
    await expect(moveFolderTree(client, { folderId: "a-led", targetSubjectId: "shr" })).rejects.toThrow(/Shared documents/);
    await expect(moveFolderTree(client, { folderId: "a-led", targetSubjectId: "sta", targetFolderId: "a-up" })).rejects.toThrow(/not in the chosen topic/);
    expect(snapshot(client)).toEqual(before);
  });

  it("refuses a tree that holds a document sent by another account", async () => {
    const seed = seedWorkspace();
    seed.documents.find((document) => document.id === "shared-1").folder_id = "a-sub";
    const second = createFakeClient(seed); // the copy sent by a teacher is filed inside the folder
    const secondBefore = snapshot(second);
    await expect(moveFolderTree(second, { folderId: "a-led", targetSubjectId: "sta" })).rejects.toThrow(/read-only/);
    expect(snapshot(second)).toEqual(secondBefore);
  });

  it("is a no-op when the folder is already there", async () => {
    const client = createFakeClient(seedWorkspace());
    const result = await moveFolderTree(client, { folderId: "a-sub", targetFolderId: "a-led" });
    expect(result).toMatchObject({ unchanged: true, moved: 0 });
  });

  it("moves inside one topic with a single update and suffixes a name clash", async () => {
    const seed = seedWorkspace();
    seed.folders.push({ id: "a-led2", subject_id: "acc", name: "Old years", parent_folder_id: "a-up" });
    const client = createFakeClient(seed);
    const result = await moveFolderTree(client, { folderId: "a-sub", targetFolderId: "a-up" });
    expect(byId(client.rows("folders"), "a-sub")).toMatchObject({ parent_folder_id: "a-up", name: "Old years (2)", subject_id: "acc" });
    expect(result.renamed).toBe(true);
    expect(client.log.filter((entry) => entry.op === "update")).toHaveLength(1);
  });

  describe("rollback", () => {
    for (const [label, test] of [
      ["the chunk update fails", ({ table, op }) => table === "document_chunks" && op === "update"],
      ["the document update fails", ({ table, op, payload }) => table === "documents" && op === "update" && payload?.subject_id === "sta"],
      ["adding the new tag links fails", ({ table, op }) => table === "document_tags" && op === "insert"],
      ["dropping the old tag links fails", ({ table, op }) => table === "document_tags" && op === "delete"],
      ["the attempts update fails", ({ table, op }) => table === "attempts" && op === "update"]
    ]) {
      it(`restores everything when ${label}`, async () => {
        const client = createFakeClient(seedWorkspace());
        const before = snapshot(client);
        const topicTagsBefore = client.rows("topic_tags").length;
        let armed = true;
        client.failWhen((call) => {
          if (!armed || !test(call)) return false;
          armed = false; // fail once; the undo steps must be able to run
          return true;
        });
        await expect(moveFolderTree(client, { folderId: "a-led", targetSubjectId: "sta", targetFolderId: "s-up" })).rejects.toThrow(/nothing was changed/);
        expect(snapshot(client)).toEqual(before);
        // re-created tags in the target topic are harmless leftovers (a topic's own tag list)
        expect(client.rows("topic_tags").length).toBeGreaterThanOrEqual(topicTagsBefore);
      });
    }

    it("removes the Study plans folders it created when a plan move fails", async () => {
      const client = createFakeClient(seedWorkspace());
      const before = snapshot(client);
      client.failWhen(({ table, op, payload }) => table === "documents" && op === "update" && payload?.subject_id === "sta");
      await expect(moveFolderTree(client, { folderId: "a-exam", targetSubjectId: "sta" })).rejects.toThrow();
      client.clearFailure();
      expect(snapshot(client)).toEqual(before);
      expect(client.rows("folders").some((folder) => folder.name === "Study plans" && folder.subject_id === "sta")).toBe(false);
    });

    it("says so when an undo step itself fails", async () => {
      const client = createFakeClient(seedWorkspace());
      client.failWhen(({ table, op }) => table === "document_chunks" && op === "update");
      await expect(moveFolderTree(client, { folderId: "a-led", targetSubjectId: "sta" })).rejects.toThrow(/could not be fully undone/);
    });
  });

  it("works on a database without chunks, attempts or the many-folders table", async () => {
    const client = createFakeClient(seedWorkspace(), { missingTables: ["document_chunks", "attempts", "study_plans", "document_folders"] });
    await moveFolderTree(client, { folderId: "a-led", targetSubjectId: "sta" });
    expect(byId(client.rows("documents"), "doc-1").subject_id).toBe("sta");
  });
});

describe("moving documents", () => {
  it("moves a document to a folder of another topic, keeping its id and carrying notes, chunks and tags", async () => {
    const client = createFakeClient(seedWorkspace());
    const result = await moveDocumentsTo(client, { documentIds: ["doc-1"], targetSubjectId: "sta", targetFolderId: "s-led" });
    const doc = byId(client.rows("documents"), "doc-1");
    expect(doc).toMatchObject({ subject_id: "sta", folder_id: "s-led" });
    expect(client.rows("document_folders").filter((row) => row.document_id === "doc-1").map((row) => row.folder_id)).toEqual(["s-led"]);
    expect(byId(client.rows("document_chunks"), "c1").subject_id).toBe("sta");
    expect(byId(client.rows("documents"), "notes-1").subject_id).toBe("sta");
    expect(result).toMatchObject({ documents: 1, companions: 1, subjectId: "sta" });
    expect(result.previous).toEqual([{ id: "doc-1", subjectId: "acc", folderIds: expect.arrayContaining(["a-led", "a-up"]) }]);
  });

  it("moves several documents at once, to the topic root", async () => {
    const client = createFakeClient(seedWorkspace());
    const result = await moveDocumentsTo(client, { documentIds: ["doc-2", "doc-3"], targetSubjectId: "sta" });
    expect(result.documents).toBe(2);
    for (const id of ["doc-2", "doc-3"]) expect(byId(client.rows("documents"), id)).toMatchObject({ subject_id: "sta", folder_id: null });
  });

  it("moves inside a topic by refiling only", async () => {
    const client = createFakeClient(seedWorkspace());
    await moveDocumentsTo(client, { documentIds: ["doc-3"], targetSubjectId: "acc", targetFolderId: "a-led" });
    expect(byId(client.rows("documents"), "doc-3")).toMatchObject({ subject_id: "acc", folder_id: "a-led" });
    expect(client.rows("document_folders").filter((row) => row.document_id === "doc-3").map((row) => row.folder_id)).toEqual(["a-led"]);
  });

  it("is a no-op when nothing would change", async () => {
    const client = createFakeClient(seedWorkspace());
    const result = await moveDocumentsTo(client, { documentIds: ["doc-2"], targetSubjectId: "acc", targetFolderId: "a-sub" });
    expect(result).toMatchObject({ unchanged: true, documents: 0 });
  });

  it("a study plan document travels with its plan folder", async () => {
    const client = createFakeClient(seedWorkspace());
    const result = await moveDocumentsTo(client, { documentIds: ["plan-doc"], targetSubjectId: "sta", targetFolderId: "s-led" });
    expect(byId(client.rows("folders"), "a-exam").subject_id).toBe("sta");
    expect(byId(client.rows("documents"), "quiz-1").subject_id).toBe("sta");
    expect(byId(client.rows("documents"), "plan-doc").subject_id).toBe("sta");
    expect(result.documents).toBeGreaterThanOrEqual(2);
  });

  it("refuses documents sent by another account, other workspaces and the shared topic", async () => {
    const client = createFakeClient(seedWorkspace());
    const before = snapshot(client);
    await expect(moveDocumentsTo(client, { documentIds: ["shared-1"], targetSubjectId: "sta" })).rejects.toThrow(/read-only/);
    await expect(moveDocumentsTo(client, { documentIds: ["doc-1"], targetSubjectId: "oth", targetFolderId: "o-up" })).rejects.toThrow(/same workspace/);
    await expect(moveDocumentsTo(client, { documentIds: ["doc-1"], targetSubjectId: "shr" })).rejects.toThrow(/Shared documents/);
    await expect(moveDocumentsTo(client, { documentIds: ["nope"], targetSubjectId: "sta" })).rejects.toThrow(/not found/);
    expect(snapshot(client)).toEqual(before);
  });

  it("warns when a plan that stays behind uses a moved document", async () => {
    const client = createFakeClient(seedWorkspace());
    const result = await moveDocumentsTo(client, { documentIds: ["doc-3"], targetSubjectId: "sta" });
    expect(result.notes.join(" ")).toMatch(/Exam plan.*still in Accounting/);
  });

  it("rolls back a failed cross-topic move", async () => {
    const client = createFakeClient(seedWorkspace());
    const before = snapshot(client);
    client.failWhen(({ table, op }) => table === "document_tags" && op === "insert");
    await expect(moveDocumentsTo(client, { documentIds: ["doc-1"], targetSubjectId: "sta", targetFolderId: "s-led" })).rejects.toThrow(/nothing was changed/);
    client.clearFailure();
    expect(snapshot(client)).toEqual(before);
  });

  it("moving back restores where a document was (undo)", async () => {
    const client = createFakeClient(seedWorkspace());
    const before = snapshot(client);
    const moved = await moveDocumentsTo(client, { documentIds: ["doc-1"], targetSubjectId: "sta", targetFolderId: "s-led" });
    const [origin] = moved.previous;
    await moveDocumentsTo(client, { documentIds: ["doc-1"], targetSubjectId: origin.subjectId, targetFolderIds: origin.folderIds });
    const after = snapshot(client);
    expect(byId(after.documents, "doc-1")).toMatchObject({ subject_id: "acc" });
    expect(after.document_folders.filter((row) => row.document_id === "doc-1").map((row) => row.folder_id).sort()).toEqual(["a-led", "a-up"]);
    expect(byId(after.documents, "notes-1").subject_id).toBe("acc");
    expect(after.document_chunks).toEqual(before.document_chunks);
  });
});

describe("companions", () => {
  it("finds the notes and attempt records that name a document", async () => {
    const client = createFakeClient(seedWorkspace());
    expect(await findCompanions(client, "acc", ["doc-1"])).toEqual(["notes-1"]);
    expect(await findCompanions(client, "acc", ["quiz-1"])).toEqual(["attempt-1"]);
    expect(await findCompanions(client, "acc", ["doc-2"])).toEqual([]);
  });
});
