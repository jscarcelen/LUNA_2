import { describe, expect, it } from "vitest";
import { audienceChips, audienceOf, grantIndex, locateAll, planAudience, scoreAudience, sharedWithNames, shortNames, watchersFrom } from "../../modules/accounts/visibility.js";

const accepted = [
  { kind: "teacher_student", other: { id: "t1", displayName: "Ms Rivera", role: "teacher" } },
  { kind: "parent_student", other: { id: "p1", displayName: "Dad", role: "parent" } },
  { kind: "peer", other: { id: "s2", displayName: "Ana", role: "student" } }
];

const workspaces = [{
  id: "w1",
  subjects: [{
    id: "sub1",
    folders: [{ id: "f1", parentFolderId: "" }, { id: "f2", parentFolderId: "f1" }],
    documents: [
      { id: "upload", folderIds: ["f2"], sourceType: "uploaded", tags: [] },
      { id: "quiz", folderIds: [], sourceType: "generated", tags: ["resource", "activity"] },
      { id: "plan", folderIds: [], sourceType: "generated", tags: ["study-plan"] },
      { id: "notes", folderIds: ["f2"], sourceType: "generated", tags: ["doc-notes"] }
    ]
  }, { id: "sub2", folders: [], documents: [{ id: "other", folderIds: [], sourceType: "uploaded", tags: [] }] }]
}];

const docOf = (id) => workspaces[0].subjects.flatMap((subject) => subject.documents).find((document) => document.id === id);

describe("student visibility", () => {
  const watchers = watchersFrom(accepted);
  const places = locateAll(workspaces);

  it("counts only connected teachers and parents as people who follow the student's work (never a peer)", () => {
    expect(watchers.map((person) => person.id)).toEqual(["t1", "p1"]);
    expect(watchersFrom([{ kind: "peer", other: { id: "x", role: "teacher" } }])).toEqual([]);
  });

  it("finds who a document reaches through a share on it, a folder above it, or its topic", () => {
    const index = grantIndex([
      { itemKind: "folder", itemId: "f1", grantee: { displayName: "Ana" } },
      { itemKind: "document", itemId: "upload", grantee: { displayName: "Leo" } },
      { itemKind: "subject", itemId: "sub2", grantee: { displayName: "Mia" } }
    ]);
    expect(sharedWithNames("upload", { index, places })).toEqual(["Leo", "Ana"]);
    expect(sharedWithNames("quiz", { index, places })).toEqual([]);
    expect(sharedWithNames("other", { index, places })).toEqual(["Mia"]);
  });

  it("tells generated work (teacher/parent see it) from uploads (they see only the name)", () => {
    const quiz = audienceOf(docOf("quiz"), { watchers, places });
    expect(quiz.watchersSee).toBe("all");
    expect(quiz.private).toBe(false);
    expect(audienceChips(quiz).map((chip) => chip.text)).toEqual(["Teacher & parent can see"]);

    const upload = audienceOf(docOf("upload"), { watchers, places });
    expect(upload.watchersSee).toBe("name");
    expect(audienceChips(upload).map((chip) => chip.text)).toEqual(["Only you"]);
    expect(audienceChips(upload)[0].title).toContain("Ms Rivera (teacher)");
  });

  it("keeps notes private and says nothing on things shared with the student", () => {
    const notes = audienceOf(docOf("notes"), { watchers, places, index: grantIndex([{ itemKind: "folder", itemId: "f1", grantee: { displayName: "Ana" } }]) });
    expect(notes.sharedWith).toEqual([]);
    expect(notes.watchersSee).toBe("none");
    expect(audienceChips(notes).map((chip) => chip.key)).toEqual(["private"]);
    expect(audienceChips(audienceOf({ id: "x", tags: [], shared: { ownerName: "Ms Rivera", permission: "view" } }, { watchers, places }))).toEqual([]);
  });

  it("with nobody connected, everything is the student's own", () => {
    const plan = audienceOf(docOf("plan"), { watchers: [], places });
    expect(plan.private).toBe(true);
    expect(planAudience(plan).map((line) => line.text)).toEqual(["Only you can see this plan."]);
    expect(scoreAudience([]).text).toBe("Your score is saved. Only you can see it.");
  });

  it("names who sees a score and a plan", () => {
    expect(scoreAudience(watchers).text).toBe("Your score is saved. You and Ms Rivera (teacher), Dad (parent) can see it.");
    const plan = audienceOf(docOf("plan"), { watchers, places, index: grantIndex([{ itemKind: "document", itemId: "plan", grantee: { displayName: "Ana" } }]) });
    expect(planAudience(plan).map((line) => line.icon)).toEqual(["👀", "👥"]);
    expect(audienceChips(plan).map((chip) => chip.text)).toEqual(["Teacher & parent can see", "Shared with Ana"]);
  });

  it("shortens long name lists", () => {
    expect(shortNames(["Ana"])).toBe("Ana");
    expect(shortNames(["Ana", "Leo"])).toBe("Ana and Leo");
    expect(shortNames(["Ana", "Leo", "Mia", "Sam"])).toBe("Ana, Leo +2");
  });
});
