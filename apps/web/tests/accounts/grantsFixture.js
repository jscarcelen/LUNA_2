/**
 * A small world for the sharing tests: one owner (O) with two topics, a folder tree and documents; a grantee (G)
 * with an own topic; a stranger (X); and a third account (T). Plain data, no database.
 *
 *   wO / sMaths "Maths":   fUnit "Unit 1"            (root)
 *                            fChapter "Chapter"      (in fUnit)
 *                              fNotes "Notes"        (in fChapter)
 *                          fOther "Other"            (root)
 *                          d1 "Lesson 1"   in fChapter          dLoose "Loose"  no folder
 *                          d2 "Exam"       in fOther            d4 "Both"       in fOther AND fNotes
 *                          dNotes (doc-notes, private) in fChapter     dAgent (ai-agent, private) in fUnit
 *   wO / sPhysics "Physics": d5 "Optics" (no folder)
 *   wG / sOwn "Maths" (G's own) with fOwn and dOwn;   sSW "Shared with me" with fSW "O" (G's own system folder)
 */
export const O = "acc-owner";
export const G = "acc-grantee";
export const X = "acc-stranger";
export const T = "acc-third";

export function world(over = {}) {
  const facts = {
    workspaceOwner: new Map([["wO", O], ["wG", G], ["wX", X], ["wT", T]]),
    subjects: new Map([
      ["sMaths", { workspaceId: "wO", name: "Maths" }],
      ["sPhysics", { workspaceId: "wO", name: "Physics" }],
      ["sOwn", { workspaceId: "wG", name: "Maths" }],
      ["sSW", { workspaceId: "wG", name: "Shared with me" }],
      ["sT", { workspaceId: "wT", name: "History" }]
    ]),
    folders: new Map([
      ["fUnit", { subjectId: "sMaths", parentFolderId: "" }],
      ["fChapter", { subjectId: "sMaths", parentFolderId: "fUnit" }],
      ["fNotes", { subjectId: "sMaths", parentFolderId: "fChapter" }],
      ["fOther", { subjectId: "sMaths", parentFolderId: "" }],
      ["fOwn", { subjectId: "sOwn", parentFolderId: "" }],
      ["fSW", { subjectId: "sSW", parentFolderId: "" }],
      ["fT", { subjectId: "sT", parentFolderId: "" }]
    ]),
    documents: new Map([
      ["d1", { subjectId: "sMaths", name: "Lesson 1", tags: [], folderIds: ["fChapter"], content: "" }],
      ["d2", { subjectId: "sMaths", name: "Exam", tags: [], folderIds: ["fOther"], content: "" }],
      ["d4", { subjectId: "sMaths", name: "Both", tags: [], folderIds: ["fOther", "fNotes"], content: "" }],
      ["dLoose", { subjectId: "sMaths", name: "Loose", tags: [], folderIds: [], content: "" }],
      ["dNotes", { subjectId: "sMaths", name: "Lesson 1 · notes.json", tags: ["doc-notes"], folderIds: ["fChapter"], content: "" }],
      ["dAgent", { subjectId: "sMaths", name: "Tutor.agent.json", tags: ["ai-agent"], folderIds: ["fUnit"], content: "" }],
      ["d5", { subjectId: "sPhysics", name: "Optics", tags: [], folderIds: [], content: "" }],
      ["dOwn", { subjectId: "sOwn", name: "My notes", tags: [], folderIds: ["fOwn"], content: "" }],
      ["dT", { subjectId: "sT", name: "Third's file", tags: [], folderIds: ["fT"], content: "" }]
    ]),
    grants: [],
    connections: new Set([O, T])
  };
  return Object.assign(facts, over);
}

let counter = 0;
/** A live grant from `ownerId` to `granteeId`. */
export function grant(itemKind, itemId, permission = "view", over = {}) {
  counter += 1;
  return { id: `g${counter}`, ownerId: O, granteeId: G, itemKind, itemId, permission, revokedAt: null, ...over };
}
