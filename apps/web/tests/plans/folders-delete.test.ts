import { describe, expect, it, vi } from "vitest";
import { deletePlanEverything as deleteEverything, planDeletionScope as deletionScope } from "../../modules/plans/folders.js";

const deletePlanEverything: any = deleteEverything;
const planDeletionScope: any = deletionScope;

const folders: any[] = [
  { id: "root", name: "Study plans", parentFolderId: "" },
  { id: "p1", name: "Term 1", parentFolderId: "root" },
  { id: "p1m", name: "Reference material", parentFolderId: "p1" },
  { id: "p1g", name: "Generated resources", parentFolderId: "p1" },
  { id: "raw", name: "Raw", parentFolderId: "" }
];
const planDoc: any = { id: "plan", tags: ["study-plan"], folderIds: ["p1"] };
const plan = { name: "Term 1", materialIds: ["notes"] };
const documents: any[] = [
  planDoc,
  { id: "notes", tags: [], sourceType: "uploaded", folderIds: ["raw", "p1m"] },
  { id: "quiz", tags: ["activity"], sourceType: "generated", folderIds: ["p1g"] },
  { id: "other-quiz", tags: ["activity"], sourceType: "generated", folderIds: ["raw"] },
  { id: "attempt", tags: ["activity-attempt"], sourceType: "generated", folderIds: ["p1g"] }
];

describe("deleting a study plan", () => {
  it("scopes the plan folder tree, its generated resources and the linked material", () => {
    const scope = planDeletionScope(planDoc, plan, { folders, documents });
    expect(scope.folderId).toBe("p1");
    expect(scope.treeIds.sort()).toEqual(["p1", "p1g", "p1m"]);
    expect(scope.generatedIds).toEqual(["quiz"]);
    expect(scope.linkedIds.sort()).toEqual(["attempt", "notes"]);
  });

  it("deletes the plan, folder and generated material but only unlinks uploads", async () => {
    const scope = planDeletionScope(planDoc, plan, { folders, documents });
    const onRemoveDocument = vi.fn();
    const onUpdateDocumentMeta = vi.fn();
    const onRemoveFolder = vi.fn();
    await deletePlanEverything(scope, { planDocumentId: "plan", documents, folders, onRemoveDocument, onUpdateDocumentMeta, onRemoveFolder });
    expect(onRemoveDocument.mock.calls.map((c) => c[0]).sort()).toEqual(["plan", "quiz"]);
    expect(onUpdateDocumentMeta).toHaveBeenCalledWith("notes", { folderIds: ["raw"], tags: [] });
    expect(onRemoveFolder.mock.calls.map((c) => c[0])).toEqual(["p1", "root"]);
  });

  it("keeps the Study plans folder while another plan still lives in it", async () => {
    const more: any[] = [...folders, { id: "p2", name: "Term 2", parentFolderId: "root" }];
    const scope = planDeletionScope(planDoc, plan, { folders: more, documents });
    const onRemoveFolder = vi.fn();
    await deletePlanEverything(scope, { planDocumentId: "plan", documents, folders: more, onRemoveDocument: vi.fn(), onUpdateDocumentMeta: vi.fn(), onRemoveFolder });
    expect(onRemoveFolder.mock.calls.map((c) => c[0])).toEqual(["p1"]);
  });
});
