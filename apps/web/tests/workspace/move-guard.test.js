import { describe, expect, it } from "vitest";
import { authorizeWorkspaceAction, referencesIn } from "../../lib/workspaceGuard.js";

const facts = () => ({
  workspaceOwner: new Map([["w1", "me"], ["w2", "someone-else"]]),
  subjects: new Map([
    ["acc", { workspaceId: "w1", name: "Accounting" }],
    ["sta", { workspaceId: "w1", name: "Statistics" }],
    ["shr", { workspaceId: "w1", name: "Shared documents" }],
    ["oth", { workspaceId: "w2", name: "Elsewhere" }]
  ]),
  folders: new Map([
    ["f-acc", { subjectId: "acc" }],
    ["f-sta", { subjectId: "sta" }],
    ["f-shr", { subjectId: "shr" }],
    ["f-oth", { subjectId: "oth" }]
  ]),
  documents: new Map([
    ["mine", { subjectId: "acc", name: "Mine", tags: [], folderIds: ["f-acc"], content: "" }],
    ["sent", { subjectId: "shr", name: "Sent", tags: ["shared-by:abc"], folderIds: ["f-shr"], content: "" }],
    ["theirs", { subjectId: "oth", name: "Theirs", tags: [], folderIds: ["f-oth"], content: "" }]
  ])
});
const run = (action, payload) => authorizeWorkspaceAction({ action, payload, ownerUserId: "me", facts: facts() });

describe("the guard on moves", () => {
  it("reads the target ids and a whole selection of documents", () => {
    expect(referencesIn({ documentIds: ["a", "b"], targetSubjectId: "s", targetFolderId: "f", targetFolderIds: ["g"] })).toEqual({
      workspaceIds: [], subjectIds: ["s"], folderIds: ["f", "g"], documentIds: ["a", "b"]
    });
  });

  it("allows moving your own document and folder across your topics", () => {
    expect(run("moveDocument", { documentIds: ["mine"], targetSubjectId: "sta", targetFolderId: "f-sta" }).ok).toBe(true);
    expect(run("moveFolder", { folderId: "f-acc", newParentFolderId: "f-sta", targetSubjectId: "sta" }).ok).toBe(true);
  });

  it("refuses a target topic, folder or document that is not yours", () => {
    expect(run("moveDocument", { documentIds: ["mine"], targetSubjectId: "oth" })).toMatchObject({ ok: false, status: 404 });
    expect(run("moveDocument", { documentIds: ["mine"], targetFolderId: "f-oth" })).toMatchObject({ ok: false, status: 404 });
    expect(run("moveFolder", { folderId: "f-acc", targetSubjectId: "oth" })).toMatchObject({ ok: false, status: 404 });
    expect(run("moveDocument", { documentIds: ["mine", "theirs"], targetSubjectId: "sta" })).toMatchObject({ ok: false, status: 404 });
  });

  it("keeps received documents read-only and nothing moves into the shared topic", () => {
    expect(run("moveDocument", { documentIds: ["sent"], targetSubjectId: "sta" })).toMatchObject({ ok: false, status: 403 });
    expect(run("moveDocument", { documentIds: ["mine", "sent"], targetSubjectId: "sta" })).toMatchObject({ ok: false, status: 403 });
    expect(run("moveDocument", { documentIds: ["mine"], targetSubjectId: "shr" })).toMatchObject({ ok: false, status: 403 });
    expect(run("moveFolder", { folderId: "f-acc", targetSubjectId: "shr" })).toMatchObject({ ok: false, status: 403 });
    expect(run("moveFolder", { folderId: "f-shr", targetSubjectId: "sta" })).toMatchObject({ ok: false, status: 403 });
  });
});
