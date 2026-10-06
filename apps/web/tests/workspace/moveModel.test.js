import { describe, expect, it } from "vitest";
import { foldersOf } from "../../modules/workspace/ui/folderModel.js";
import { blockedTargets, destinationFolderId, documentMoveMessage, folderMoveMessage, targetPath, undoGroups } from "../../modules/workspace/moveModel.js";

const workspace = {
  subjects: [
    { id: "acc", name: "Accounting", folders: [{ id: "a-up", name: "Uploaded material", parentFolderId: "" }, { id: "a-led", name: "Ledgers", parentFolderId: "a-up" }] },
    {
      id: "sta",
      name: "Statistics",
      folders: [
        { id: "s-up", name: "Uploaded material", parentFolderId: "" },
        { id: "s-gen", name: "Generated material", parentFolderId: "" },
        { id: "s-loose", name: "Resources not in study plans", parentFolderId: "s-gen" }
      ]
    },
    { id: "bare", name: "Bare topic", folders: [] }
  ]
};
const folders = foldersOf(workspace);
const subjects = workspace.subjects;

describe("where a dropped document lands", () => {
  it("goes into the folder it is dropped on", () => {
    expect(destinationFolderId({ document: { subjectId: "acc", sourceType: "upload" }, targetNodeId: "f:sta:s-up", subjects })).toBe("s-up");
  });

  it("goes to the topic's own place when dropped on another topic's root", () => {
    expect(destinationFolderId({ document: { subjectId: "acc", sourceType: "upload" }, targetNodeId: "s:sta", subjects })).toBe("s-up");
    expect(destinationFolderId({ document: { subjectId: "acc", sourceType: "generated" }, targetNodeId: "s:sta", subjects })).toBe("s-loose");
  });

  it("stays at the root when that topic has no such folder, or when it is its own topic", () => {
    expect(destinationFolderId({ document: { subjectId: "acc", sourceType: "upload" }, targetNodeId: "s:bare", subjects })).toBe("");
    expect(destinationFolderId({ document: { subjectId: "acc", sourceType: "upload" }, targetNodeId: "s:acc", subjects })).toBe("");
  });
});

describe("the picker and the status line", () => {
  it("lists topics as roots and blocks a folder's own branch", () => {
    expect(folders.filter((folder) => folder.isSubject).map((folder) => folder.id)).toEqual(["s:acc", "s:sta", "s:bare"]);
    expect(blockedTargets(folders, "f:acc:a-up").sort()).toEqual(["f:acc:a-led", "f:acc:a-up"]);
  });

  it("names the destination as a path", () => {
    expect(targetPath(folders, "f:sta:s-up")).toBe("Statistics / Uploaded material");
    expect(targetPath(folders, "s:bare")).toBe("Bare topic");
  });

  it("says what moved", () => {
    expect(documentMoveMessage({ moved: 3, path: "Statistics / Uploaded material" })).toBe("3 items moved to Statistics / Uploaded material.");
    expect(documentMoveMessage({ moved: 1, readOnly: 2, path: "Statistics", notes: ["A plan still uses it."] })).toBe("1 item moved to Statistics · 2 read-only items stayed where they were. A plan still uses it.");
    expect(documentMoveMessage({ moved: 0, path: "Statistics" })).toBe("Nothing to move — already there.");
    expect(folderMoveMessage({ result: { name: "Ledgers (2)", folders: 3, documents: 5, notes: [] }, path: "Statistics" })).toBe("“Ledgers (2)” moved to Statistics with 2 subfolders and 5 documents.");
    expect(folderMoveMessage({ result: { name: "Ledgers", folders: 1, documents: 0, notes: [] }, path: "Statistics" })).toBe("“Ledgers” moved to Statistics.");
  });

  it("puts documents back where each one was, grouped by place", () => {
    const groups = undoGroups([
      { id: "a", subjectId: "acc", folderIds: ["x", "y"] },
      { id: "b", subjectId: "acc", folderIds: ["y", "x"] },
      { id: "c", subjectId: "acc", folderIds: [] }
    ]);
    expect(groups).toEqual([
      { ids: ["a", "b"], targetSubjectId: "acc", targetFolderIds: ["x", "y"] },
      { ids: ["c"], targetSubjectId: "acc", targetFolderIds: [] }
    ]);
  });
});
