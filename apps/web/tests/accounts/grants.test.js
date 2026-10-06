import { describe, expect, it } from "vitest";
import {
  PERMISSIONS,
  SHARED_ACTION_NEEDS,
  atLeast,
  canShareItem,
  coveringNodes,
  folderChain,
  isPrivateDocument,
  isSubjectNodeId,
  neededAccessFor,
  normalizeGrant,
  ownerOfItem,
  rankOf,
  refusalFor,
  resolveAccess,
  subjectIdOfNode,
  subjectNodeId
} from "../../lib/grants.js";
import { G, O, T, X, grant, world } from "./grantsFixture.js";

const doc = (id) => ({ kind: "document", id });
const folder = (id) => ({ kind: "folder", id });
const subject = (id) => ({ kind: "subject", id });
const access = (account, item, over = {}) => {
  const facts = over.facts || world();
  return resolveAccess({ accountId: account, item, facts, grants: over.grants ?? facts.grants, connections: over.connections ?? facts.connections });
};

describe("owners keep ownership", () => {
  it("the owner of a workspace is the owner of everything in it, with or without grants", () => {
    for (const item of [doc("d1"), doc("dNotes"), folder("fNotes"), subject("sMaths"), doc("dAgent")]) expect(access(O, item)).toBe("owner");
    expect(access(G, doc("dOwn"))).toBe("owner");
    expect(access(G, folder("fSW"))).toBe("owner");
  });
  it("a grantee never becomes the owner, whatever the permission", () => {
    const grants = [grant("subject", "sMaths", "edit")];
    expect(access(G, doc("d1"), { grants })).toBe("edit");
    expect(access(G, subject("sMaths"), { grants })).toBe("edit");
    expect(canShareItem({ accountId: G, item: doc("d1"), facts: world() })).toBe(false);
    expect(canShareItem({ accountId: O, item: doc("d1"), facts: world() })).toBe(true);
    expect(canShareItem({ accountId: O, item: doc("nope"), facts: world() })).toBe(false);
  });
});

describe("no grant, no access", () => {
  it("another account sees nothing of the owner's items", () => {
    for (const item of [doc("d1"), folder("fUnit"), subject("sMaths"), doc("d5")]) expect(access(G, item)).toBeNull();
  });
  it("unknown items, unknown kinds and missing accounts resolve to nothing", () => {
    const grants = [grant("subject", "sMaths", "edit")];
    expect(access(G, doc("ghost"), { grants })).toBeNull();
    expect(access(G, { kind: "workspace", id: "wO" }, { grants })).toBeNull();
    expect(access(G, { kind: "document" }, { grants })).toBeNull();
    expect(access("", doc("d1"), { grants })).toBeNull();
    expect(resolveAccess({ accountId: G, item: doc("d1"), facts: null, grants })).toBeNull();
  });
});

describe("a document grant", () => {
  const grants = [grant("document", "d1", "view")];
  it("covers that document only", () => {
    expect(access(G, doc("d1"), { grants })).toBe("view");
    for (const item of [doc("d2"), doc("dLoose"), doc("d4"), folder("fChapter"), folder("fUnit"), subject("sMaths")]) expect(access(G, item, { grants })).toBeNull();
  });
  it("is 'edit' when edit was granted", () => {
    expect(access(G, doc("d1"), { grants: [grant("document", "d1", "edit")] })).toBe("edit");
  });
});

describe("a folder grant covers the whole subtree, also what is added later", () => {
  it("covers the folder, its subfolders and every document filed in them", () => {
    const grants = [grant("folder", "fUnit", "edit")];
    for (const item of [folder("fUnit"), folder("fChapter"), folder("fNotes"), doc("d1"), doc("d4")]) expect(access(G, item, { grants })).toBe("edit");
  });
  it("does not cover the parent, the siblings or the topic", () => {
    const grants = [grant("folder", "fChapter", "view")];
    expect(access(G, folder("fUnit"), { grants })).toBeNull();
    expect(access(G, folder("fOther"), { grants })).toBeNull();
    expect(access(G, doc("d2"), { grants })).toBeNull();
    expect(access(G, doc("dLoose"), { grants })).toBeNull();
    expect(access(G, subject("sMaths"), { grants })).toBeNull();
    expect(access(G, folder("fNotes"), { grants })).toBe("view");
  });
  it("a document filed in two folders is covered through either of them", () => {
    expect(access(G, doc("d4"), { grants: [grant("folder", "fOther", "view")] })).toBe("view");
    expect(access(G, doc("d4"), { grants: [grant("folder", "fNotes", "edit")] })).toBe("edit");
    expect(access(G, doc("d2"), { grants: [grant("folder", "fNotes", "edit")] })).toBeNull();
  });
  it("sees what the owner adds later without a new grant", () => {
    const facts = world();
    const grants = [grant("folder", "fUnit", "view")];
    expect(access(G, doc("new"), { facts, grants })).toBeNull();
    facts.documents.set("new", { subjectId: "sMaths", name: "Added later", tags: [], folderIds: ["fNotes"], content: "" });
    facts.folders.set("fNew", { subjectId: "sMaths", parentFolderId: "fNotes" });
    expect(access(G, doc("new"), { facts, grants })).toBe("view");
    expect(access(G, folder("fNew"), { facts, grants })).toBe("view");
  });
  it("survives a corrupt parent chain (a loop) instead of hanging", () => {
    const facts = world();
    facts.folders.set("fUnit", { subjectId: "sMaths", parentFolderId: "fNotes" }); // loop: fUnit -> fNotes -> fChapter -> fUnit
    expect(folderChain("fNotes", facts)).toEqual(["fNotes", "fChapter", "fUnit"]);
    expect(access(G, doc("d1"), { facts, grants: [grant("folder", "fUnit", "view")] })).toBe("view");
    expect(access(G, doc("d2"), { facts, grants: [grant("folder", "fUnit", "view")] })).toBeNull();
  });
});

describe("a subject (topic) grant", () => {
  const grants = [grant("subject", "sMaths", "view")];
  it("covers every folder and document of that topic and nothing of the others", () => {
    for (const item of [subject("sMaths"), folder("fUnit"), folder("fNotes"), folder("fOther"), doc("d1"), doc("d2"), doc("dLoose"), doc("d4")]) expect(access(G, item, { grants })).toBe("view");
    for (const item of [subject("sPhysics"), doc("d5")]) expect(access(G, item, { grants })).toBeNull();
  });
});

describe("the strongest covering grant wins", () => {
  it("edit on one document inside a view-only folder", () => {
    const grants = [grant("folder", "fUnit", "view"), grant("document", "d1", "edit")];
    expect(access(G, doc("d1"), { grants })).toBe("edit");
    expect(access(G, doc("d4"), { grants })).toBe("view");
  });
  it("view on a document does not weaken an edit folder grant", () => {
    const grants = [grant("document", "d1", "view"), grant("folder", "fChapter", "edit")];
    expect(access(G, doc("d1"), { grants })).toBe("edit");
  });
});

describe("private bookkeeping documents never resolve for anyone but their owner", () => {
  it("notes, agents, attempts and goals stay out of any grant, even a whole-topic edit grant", () => {
    const grants = [grant("subject", "sMaths", "edit"), grant("folder", "fUnit", "edit"), grant("document", "dNotes", "edit"), grant("document", "dAgent", "edit")];
    expect(access(G, doc("dNotes"), { grants })).toBeNull();
    expect(access(G, doc("dAgent"), { grants })).toBeNull();
    expect(access(O, doc("dNotes"))).toBe("owner");
    const facts = world();
    for (const tag of ["activity-attempt", "study-goal"]) {
      facts.documents.set(`p-${tag}`, { subjectId: "sMaths", name: tag, tags: [tag], folderIds: ["fUnit"], content: "" });
      expect(access(G, doc(`p-${tag}`), { facts, grants })).toBeNull();
    }
    expect(isPrivateDocument({ tags: ["Doc-Notes"] })).toBe(true);
    expect(isPrivateDocument({ tags: ["resource"] })).toBe(false);
  });
});

describe("revocation and connections", () => {
  it("a revoked grant gives nothing, immediately", () => {
    expect(access(G, doc("d1"), { grants: [grant("document", "d1", "edit", { revokedAt: "2026-10-05T10:00:00Z" })] })).toBeNull();
    expect(access(G, doc("d1"), { grants: [grant("document", "d1", "edit", { revokedAt: "2026-10-05T10:00:00Z" }), grant("folder", "fChapter", "view")] })).toBe("view");
  });
  it("a grant needs an accepted connection to the owner: without one it is worth nothing", () => {
    const grants = [grant("subject", "sMaths", "edit")];
    expect(access(G, doc("d1"), { grants, connections: new Set() })).toBeNull();
    expect(access(G, doc("d1"), { grants, connections: [T] })).toBeNull();
    expect(access(G, doc("d1"), { grants, connections: [O] })).toBe("edit");
    expect(access(G, doc("d1"), { grants, connections: undefined, facts: { ...world(), connections: undefined } })).toBeNull();
  });
  it("a stranger holding no grant has nothing, and someone else's grant is not theirs", () => {
    const grants = [grant("subject", "sMaths", "edit")];
    expect(access(X, doc("d1"), { grants, connections: [O] })).toBeNull();
    expect(access(T, doc("d1"), { grants, connections: [O] })).toBeNull();
  });
});

describe("privilege escalation attempts", () => {
  it("re-sharing someone else's share creates nothing that resolves: only a grant made by the real owner counts", () => {
    // G (edit) "shares" O's folder onward to T; the row would name G as owner. It must not resolve for T.
    const forged = [grant("folder", "fUnit", "edit", { ownerId: G, granteeId: T })];
    expect(access(T, doc("d1"), { grants: forged, connections: [O, G] })).toBeNull();
    // ...nor does naming O as owner for a grant that O never made (a forged row is still O's item and O's grant list is the truth)
    const grants = [grant("folder", "fUnit", "edit", { granteeId: T })];
    expect(access(G, doc("d1"), { grants })).toBeNull();
    expect(access(T, doc("d1"), { grants, connections: [O] })).toBe("edit");
  });
  it("a grant from a former owner does not follow the item to a new owner", () => {
    const facts = world();
    facts.workspaceOwner.set("wO", T); // the workspace changed hands
    expect(access(G, doc("d1"), { facts, grants: [grant("document", "d1", "edit")], connections: [O, T] })).toBeNull();
  });
  it("an unknown permission value grants nothing", () => {
    expect(access(G, doc("d1"), { grants: [grant("document", "d1", "owner")] })).toBeNull();
    expect(access(G, doc("d1"), { grants: [grant("document", "d1", "admin")] })).toBeNull();
    expect(access(G, doc("d1"), { grants: [grant("document", "d1", null)] })).toBeNull();
  });
  it("an unknown grant kind covers nothing", () => {
    expect(access(G, doc("d1"), { grants: [grant("workspace", "wO", "edit")] })).toBeNull();
    expect(access(G, doc("d1"), { grants: [grant("document", "d2", "edit")] })).toBeNull();
  });
  it("database rows work as well as shaped grants", () => {
    const row = { id: "r1", owner_id: O, grantee_id: G, item_kind: "folder", item_id: "fUnit", permission: "edit", revoked_at: null };
    expect(access(G, doc("d1"), { grants: [row] })).toBe("edit");
    expect(normalizeGrant(row)).toMatchObject({ ownerId: O, granteeId: G, itemKind: "folder", itemId: "fUnit", permission: "edit", revokedAt: null });
    expect(normalizeGrant(null)).toBeNull();
  });
});

describe("what each permission allows", () => {
  it("ranks view < edit < owner", () => {
    expect([rankOf("view"), rankOf("edit"), rankOf("owner"), rankOf(null), rankOf("x")]).toEqual([1, 2, 3, 0, 0]);
    expect(atLeast("edit", "view")).toBe(true);
    expect(atLeast("view", "edit")).toBe(false);
    expect(atLeast("edit", "owner")).toBe(false);
    expect(atLeast("owner", "owner")).toBe(true);
    expect(atLeast(null, "view")).toBe(false);
    expect(PERMISSIONS).toEqual(["view", "edit"]);
  });
  it("reading needs view, changing the original needs edit", () => {
    for (const action of ["downloadGeneratedDocument", "downloadUploadedDocument"]) expect(neededAccessFor(action)).toBe("view");
    for (const action of ["updateDocumentContent", "updateGeneratedDocument", "renameDocument", "renameFolder", "createFolder", "uploadDocuments", "saveGeneratedQuizDocument", "reviewDocumentExtraction", "reprocessDocument"]) expect(neededAccessFor(action)).toBe("edit");
  });
  it("deleting, moving, re-tagging and restructuring are the owner's alone, and anything new is closed by default", () => {
    for (const action of ["removeDocument", "removeFolder", "moveFolder", "updateDocumentMeta", "removeSubject", "renameSubject", "removeWorkspace", "setSubjectColor", "addTopicTag", "someFutureAction"]) expect(neededAccessFor(action)).toBe("owner");
    expect(Object.values(SHARED_ACTION_NEEDS).every((need) => need === "view" || need === "edit")).toBe(true);
  });
  it("explains a refusal in words", () => {
    expect(refusalFor("view", "edit")).toMatch(/only view/);
    expect(refusalFor("edit", "owner")).toMatch(/Only the owner/);
  });
});

describe("helpers", () => {
  it("knows who owns what and which nodes cover an item", () => {
    const facts = world();
    expect(ownerOfItem(doc("d1"), facts)).toBe(O);
    expect(ownerOfItem(folder("fOwn"), facts)).toBe(G);
    expect(ownerOfItem(subject("sT"), facts)).toBe(T);
    expect(ownerOfItem(doc("ghost"), facts)).toBeUndefined();
    expect(coveringNodes(doc("d1"), facts).map((node) => `${node.kind}:${node.id}`)).toEqual(["document:d1", "folder:fChapter", "folder:fUnit", "subject:sMaths"]);
    expect(coveringNodes(subject("sMaths"), facts)).toEqual([{ kind: "subject", id: "sMaths" }]);
    expect(coveringNodes(doc("ghost"), facts)).toBeNull();
  });
  it("names the stand-in folder of a shared topic", () => {
    expect(subjectNodeId("sMaths")).toBe("subj~sMaths");
    expect(isSubjectNodeId("subj~sMaths")).toBe(true);
    expect(isSubjectNodeId("fUnit")).toBe(false);
    expect(subjectIdOfNode("subj~sMaths")).toBe("sMaths");
  });
});
