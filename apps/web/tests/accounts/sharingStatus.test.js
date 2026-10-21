import { describe, expect, it } from "vitest";
import { coverageOf, overviewCounts, sharingOverview } from "../../modules/accounts/sharingStatus.js";

const workspaces = [{
  id: "w",
  subjects: [
    {
      id: "bio", name: "Biology",
      folders: [{ id: "f1", name: "Unit 1", parentFolderId: "" }, { id: "f2", name: "Cells", parentFolderId: "f1" }],
      documents: [
        { id: "d1", name: "Notes", folderIds: ["f2"], tags: ["resource"] },
        { id: "quiz", name: "Quiz", folderIds: [], tags: ["resource", "activity"] },
        { id: "mine", name: "My notes", folderIds: [], tags: ["doc-notes"] },
        { id: "got", name: "Received", folderIds: [], tags: ["shared-by:x"] }
      ]
    },
    { id: "sh", name: "Shared with me", folders: [], documents: [] }
  ]
}];

describe("sharing overview", () => {
  it("a folder share covers its subtree; copies cover their file; private and received files are left out", () => {
    const topics = sharingOverview({
      workspaces,
      grants: [{ id: "g1", itemKind: "folder", itemId: "f1", permission: "view", grantee: { id: "a" } }, { id: "g2", itemKind: "folder", itemId: "f1", permission: "view", grantee: { id: "zz" } }],
      sent: [{ id: "c1", mode: "assign", sourceDocumentId: "quiz", dueDate: "2026-11-01", recipient: { id: "a" } }],
      audienceIds: ["a", "b"]
    });
    expect(topics.map((topic) => topic.name)).toEqual(["Biology"]);
    const rows = Object.fromEntries(topics[0].rows.map((row) => [row.id, row]));
    expect(Object.keys(rows).sort()).toEqual(["d1", "f1", "f2", "quiz"]);
    expect(rows.f1.access).toMatchObject({ count: 1, total: 2, best: "view" });
    expect(rows.f1.access.direct).toHaveLength(1);
    expect(rows.d1.access.inherited[0]).toMatchObject({ personId: "a", fromName: "Unit 1" });
    expect(coverageOf(rows.d1.access)).toBe("partial");
    expect(rows.quiz.access.copies).toEqual([{ personId: "a", mode: "assign", dueDate: "2026-11-01", sentId: "c1" }]);
    expect(coverageOf(topics[0].access)).toBe("none");
    expect(overviewCounts(topics)).toEqual({ shared: 4, none: 1 });
  });

  it("a topic share reaches everything, the strongest permission wins", () => {
    const [topic] = sharingOverview({
      workspaces,
      grants: [{ id: "t", itemKind: "subject", itemId: "bio", permission: "view", grantee: { id: "a" } }, { id: "e", itemKind: "document", itemId: "d1", permission: "edit", grantee: { id: "a" } }],
      audienceIds: ["a"]
    });
    const d1 = topic.rows.find((row) => row.id === "d1");
    expect(coverageOf(d1.access)).toBe("shared");
    expect(d1.access.best).toBe("edit");
    expect(topic.rows.every((row) => coverageOf(row.access) === "shared")).toBe(true);
  });
});
