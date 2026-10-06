import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./fakeDb.js";

const trees = vi.hoisted(() => ({ byOwner: new Map() }));

vi.mock("../../lib/supabaseClient.js", async () => {
  const { db: fake } = await import("./fakeDb.js");
  return { createSupabaseAdminClient: () => fake.client, isSupabaseConfigured: () => true, getDemoOwnerUserId: () => "demo" };
});
vi.mock("../../lib/workspacesRepository.js", async () => {
  const { db: fake } = await import("./fakeDb.js");
  // A tiny listWorkspaceTree over the fake tables for the account's own rows, plus a canned tree for each owner.
  const own = (accountId) => fake.table("workspaces").filter((row) => row.owner_user_id === accountId).map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    subjects: fake.table("subjects").filter((subject) => subject.workspace_id === workspace.id).map((subject) => ({
      id: subject.id,
      name: subject.name,
      folders: fake.table("folders").filter((folder) => folder.subject_id === subject.id).map((folder) => ({ id: folder.id, name: folder.name, parentFolderId: folder.parent_folder_id || "", tags: [] })),
      documents: fake.table("documents").filter((document) => document.subject_id === subject.id).map((document) => ({ id: document.id, name: document.name, tags: [], folderIds: document.folder_id ? [document.folder_id] : [] }))
    }))
  }));
  return {
    createWorkspace: async (name, owner) => fake.add("workspaces", { name, owner_user_id: owner }),
    createSubject: async (workspaceId, name) => fake.add("subjects", { workspace_id: workspaceId, name }),
    createFolder: async (subjectId, name, parent) => fake.add("folders", { subject_id: subjectId, name, parent_folder_id: parent || null }),
    listWorkspaceTree: async (accountId) => (trees.byOwner.has(accountId) ? trees.byOwner.get(accountId) : own(accountId))
  };
});

const { buildSharedNodes, listTreeWithShared } = await import("../../lib/sharedTree.js");
const repo = await import("../../lib/accountsRepository.js");
const { subjectNodeId } = await import("../../lib/grants.js");
const { O, T, grant } = await import("./grantsFixture.js");

const OWNER = { id: O, displayName: "Prof. Rivera" };
const PLACE = "owner-folder";

const doc = (id, name, folderIds = [], tags = [], extra = {}) => ({ id, name, content: `content of ${name}`, folderIds, folderId: folderIds[0] || "", tags, sourceType: "uploaded", ...extra });
const ownerTree = () => [{
  id: "wO",
  name: "My workspace",
  subjects: [
    {
      id: "sMaths", name: "Maths", color: "#fff", topicTags: [],
      folders: [
        { id: "fUnit", name: "Unit 1", parentFolderId: "", tags: [] },
        { id: "fChapter", name: "Chapter", parentFolderId: "fUnit", tags: [] },
        { id: "fOther", name: "Other", parentFolderId: "", tags: [] }
      ],
      documents: [
        doc("d1", "Lesson 1", ["fChapter"]),
        doc("d2", "Exam", ["fOther"]),
        doc("dLoose", "Loose"),
        doc("dNotes", "Lesson 1 · notes.json", ["fChapter"], ["doc-notes"]),
        doc("dBoth", "Both", ["fOther", "fChapter"], ["resource"])
      ]
    },
    { id: "sPhysics", name: "Physics", folders: [], topicTags: [], documents: [doc("d5", "Optics")] }
  ]
}];
const build = (grants) => buildSharedNodes({ ownerTree: ownerTree(), grants, owner: OWNER, ownerFolderId: PLACE });
const byId = (list) => Object.fromEntries(list.map((entry) => [entry.id, entry]));

describe("laying a share into the grantee's tree", () => {
  it("a folder share brings the folder, its subfolders and the documents in them, with the owner's real ids", () => {
    const nodes = build([grant("folder", "fUnit", "edit", { id: "g1" })]);
    const folders = byId(nodes.folders);
    const documents = byId(nodes.documents);
    expect(Object.keys(folders).sort()).toEqual(["fChapter", "fUnit"]);
    expect(folders.fUnit).toMatchObject({ name: "Unit 1", parentFolderId: PLACE, shared: { grantId: "g1", ownerId: O, ownerName: "Prof. Rivera", permission: "edit", root: true } });
    expect(folders.fChapter).toMatchObject({ parentFolderId: "fUnit", shared: { permission: "edit", root: false } });
    expect(Object.keys(documents).sort()).toEqual(["d1", "dBoth"]);
    expect(documents.d1).toMatchObject({ name: "Lesson 1", content: "content of Lesson 1", folderIds: ["fChapter"], folderId: "fChapter", shared: { permission: "edit", ownerName: "Prof. Rivera", root: false } });
    // a document filed in a shared and an unshared folder only shows the shared place
    expect(documents.dBoth.folderIds).toEqual(["fChapter"]);
  });

  it("never brings the owner's private notes, agents or anything outside the share", () => {
    const nodes = build([grant("subject", "sMaths", "edit")]);
    expect(nodes.documents.map((entry) => entry.id).sort()).toEqual(["d1", "d2", "dBoth", "dLoose"]);
    expect(nodes.documents.some((entry) => entry.id === "d5")).toBe(false);
    const only = build([grant("document", "dNotes", "view")]);
    expect(only.documents).toEqual([]);
  });

  it("a view share marks documents read-only for the interface (synthetic shared-by tag), an edit share does not", () => {
    const view = build([grant("folder", "fUnit", "view")]);
    expect(view.documents.find((entry) => entry.id === "d1").tags).toEqual([`shared-by:${O}`]);
    expect(view.documents.find((entry) => entry.id === "dBoth").tags).toEqual(["resource", `shared-by:${O}`]);
    const edit = build([grant("folder", "fUnit", "edit")]);
    expect(edit.documents.find((entry) => entry.id === "d1").tags).toEqual([]);
  });

  it("a single document share lands straight in the owner's folder", () => {
    const nodes = build([grant("document", "d2", "view", { id: "g2" })]);
    expect(nodes.folders).toEqual([]);
    expect(nodes.documents).toMatchObject([{ id: "d2", folderIds: [PLACE], shared: { grantId: "g2", root: true, permission: "view" } }]);
  });

  it("a topic share appears as a stand-in folder named after the topic, holding the topic's folders and loose documents", () => {
    const nodes = build([grant("subject", "sMaths", "view", { id: "g3" })]);
    const folders = byId(nodes.folders);
    const stand = folders[subjectNodeId("sMaths")];
    expect(stand).toMatchObject({ name: "Maths", parentFolderId: PLACE, shared: { grantId: "g3", root: true } });
    expect(folders.fUnit.parentFolderId).toBe(subjectNodeId("sMaths"));
    expect(folders.fOther.parentFolderId).toBe(subjectNodeId("sMaths"));
    expect(folders.fChapter.parentFolderId).toBe("fUnit");
    expect(byId(nodes.documents).dLoose.folderIds).toEqual([subjectNodeId("sMaths")]);
  });

  it("the strongest permission wins where two shares overlap, and the share that was made directly is the root", () => {
    const nodes = build([grant("folder", "fUnit", "view", { id: "gv" }), grant("document", "d1", "edit", { id: "ge" })]);
    const documents = byId(nodes.documents);
    expect(documents.d1.shared).toMatchObject({ permission: "edit", grantId: "ge", root: true });
    expect(documents.dBoth.shared).toMatchObject({ permission: "view", grantId: "gv", root: false });
    expect(documents.d1.tags).toEqual([]); // editable, so not marked read-only
  });

  it("ignores grants made by someone else and items that no longer exist", () => {
    expect(build([grant("folder", "fUnit", "edit", { ownerId: T })])).toEqual({ folders: [], documents: [] });
    expect(build([grant("folder", "gone", "edit"), grant("document", "gone", "edit"), grant("subject", "gone", "edit")])).toEqual({ folders: [], documents: [] });
  });
});

describe("the tree of an account with shares", () => {
  let owner;
  let grantee;
  beforeEach(() => {
    db.reset();
    repo.resetSharingCache();
    trees.byOwner.clear();
    owner = db.add("accounts", { email: "rivera@school.edu", display_name: "Prof. Rivera", role: "teacher", password_hash: "x" });
    grantee = db.add("accounts", { email: "maria@home.com", display_name: "Maria", role: "student", password_hash: "x" });
    db.add("account_links", { kind: "teacher_student", requester_id: owner.id, requester_email: owner.email, target_id: grantee.id, target_email: grantee.email, status: "accepted", pair_key: "k" });
    db.add("workspaces", { owner_user_id: grantee.id, name: "My workspace" });
    trees.byOwner.set(owner.id, ownerTree().map((workspace) => ({ ...workspace })));
  });
  const share = (kind, itemId, permission = "view", over = {}) => db.add("share_grants", { owner_id: owner.id, grantee_id: grantee.id, item_kind: kind, item_id: itemId, permission, revoked_at: null, ...over });
  const sharedSubject = (tree) => tree[0].subjects.find((subject) => subject.name === "Shared with me");

  it("is the plain tree when nothing is shared", async () => {
    const tree = await listTreeWithShared(grantee.id);
    expect(tree).toHaveLength(1);
    expect(tree[0].subjects).toEqual([]);
    expect(db.table("subjects")).toHaveLength(0);
  });

  it("builds Shared with me / <owner name> in the first workspace and puts the shared nodes in it", async () => {
    share("folder", "fUnit", "edit");
    const tree = await listTreeWithShared(grantee.id);
    const subject = sharedSubject(tree);
    const ownerFolder = subject.folders.find((folder) => folder.name === "Prof. Rivera");
    expect(ownerFolder).toMatchObject({ parentFolderId: "" });
    expect(subject.folders.find((folder) => folder.id === "fUnit")).toMatchObject({ parentFolderId: ownerFolder.id, shared: { ownerName: "Prof. Rivera", permission: "edit" } });
    expect(subject.documents.map((entry) => entry.id).sort()).toEqual(["d1", "dBoth"]);
    // the stand-in structure is real and reused on the next call
    await listTreeWithShared(grantee.id);
    expect(db.table("subjects").filter((row) => row.name === "Shared with me")).toHaveLength(1);
    expect(db.table("folders").filter((row) => row.name === "Prof. Rivera")).toHaveLength(1);
    // nothing of the owner's was copied
    expect(db.table("documents")).toHaveLength(0);
  });

  it("revoking removes it from the tree at once; so does ending the connection", async () => {
    const row = share("folder", "fUnit");
    expect(sharedSubject(await listTreeWithShared(grantee.id)).documents.length).toBeGreaterThan(0);
    row.revoked_at = new Date().toISOString();
    const after = await listTreeWithShared(grantee.id);
    expect(sharedSubject(after)?.documents || []).toEqual([]);
    row.revoked_at = null;
    db.table("account_links")[0].status = "revoked";
    expect(sharedSubject(await listTreeWithShared(grantee.id))?.documents || []).toEqual([]);
  });

  it("picks up what the owner adds to a shared folder later, without a new share", async () => {
    share("folder", "fUnit");
    await listTreeWithShared(grantee.id);
    trees.byOwner.get(owner.id)[0].subjects[0].documents.push(doc("dNew", "Added later", ["fChapter"]));
    const subject = sharedSubject(await listTreeWithShared(grantee.id));
    expect(subject.documents.map((entry) => entry.id)).toContain("dNew");
  });

  it("keeps the grantee's own notes and attempts (their own documents) in the same topic, untouched", async () => {
    share("folder", "fUnit");
    await listTreeWithShared(grantee.id);
    const topic = db.table("subjects").find((row) => row.name === "Shared with me");
    db.add("documents", { subject_id: topic.id, folder_id: null, name: "Lesson 1 · notes.json" });
    const subject = sharedSubject(await listTreeWithShared(grantee.id));
    expect(subject.documents.map((entry) => entry.name)).toContain("Lesson 1 · notes.json");
    expect(subject.documents.filter((entry) => entry.shared).every((entry) => entry.shared.ownerId === owner.id)).toBe(true);
  });

  it("works for two owners at once, each under their own folder", async () => {
    const other = db.add("accounts", { email: "ana@school.edu", display_name: "Ana", role: "teacher", password_hash: "x" });
    db.add("account_links", { kind: "peer", requester_id: other.id, requester_email: other.email, target_id: grantee.id, target_email: grantee.email, status: "accepted", pair_key: "k2" });
    trees.byOwner.set(other.id, [{ id: "wA", name: "w", subjects: [{ id: "sA", name: "Art", folders: [], topicTags: [], documents: [doc("dArt", "Painting")] }] }]);
    share("document", "d2");
    db.add("share_grants", { owner_id: other.id, grantee_id: grantee.id, item_kind: "document", item_id: "dArt", permission: "edit", revoked_at: null });
    const subject = sharedSubject(await listTreeWithShared(grantee.id));
    expect(subject.folders.map((folder) => folder.name).sort()).toEqual(["Ana", "Prof. Rivera"]);
    expect(subject.documents.map((entry) => `${entry.id}:${entry.shared.ownerName}`).sort()).toEqual(["d2:Prof. Rivera", "dArt:Ana"]);
  });

  it("without the sharing migration the tree is just the account's own", async () => {
    share("folder", "fUnit");
    db.drop("share_grants");
    repo.resetSharingCache();
    const tree = await listTreeWithShared(grantee.id);
    expect(tree[0].subjects).toEqual([]);
  });
});
