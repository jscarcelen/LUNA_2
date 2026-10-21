/**
 * "What can they see?" for a teacher (or parent): for one student or a group, which of MY topics, folders and files
 * they can open, how (a live share with view / edit, or a copy I sent or assigned, with its due date), and what is not
 * shared with them. Pure: browser and server (tests in tests/accounts/sharingStatus.test.js).
 *
 * Coverage follows the live-share rules of lib/grants.js: a grant on a topic covers everything in it, a grant on a
 * folder covers its whole subtree, a grant on a file covers that file; the strongest permission wins. A copy (Share as
 * copy / Assign) covers only the file it was made from.
 */
import { isPrivateDocument } from "../../lib/grants.js";
import { isReservedSubjectName, isSharedDocument } from "./shared.js";

const RANK = { view: 1, edit: 2 };

/** What kind of thing a file is, in the words the page uses. */
export function itemTypeOf(document) {
  const tags = (document?.tags || []).map((tag) => String(tag).trim().toLowerCase());
  if (tags.includes("study-plan")) return "plan";
  if (tags.includes("activity")) return "activity";
  return "file";
}

/**
 * @param {object} args
 * @param {object[]} args.workspaces my own workspace tree (workspaces[].subjects[].folders/documents)
 * @param {object[]} args.grants live grants I gave: [{ id, itemKind, itemId, permission, grantee: { id } }]
 * @param {object[]} args.sent copies I sent: [{ id, mode, sourceDocumentId, dueDate, recipient: { id } }]
 * @param {string[]} args.audienceIds the student, or the members of the group
 * @returns {Array<{ id, workspaceId, name, access, rows: Array<{ kind: "folder" | "document", id, name, depth, itemType?, document?, access }> }>}
 *   `access` = { count, total, direct: [{ personId, grantId, permission }], inherited: [{ personId, permission, fromName }], copies: [{ personId, mode, dueDate, sentId }], best: "edit" | "view" | "" }
 */
export function sharingOverview({ workspaces = [], grants = [], sent = [], audienceIds = [] }) {
  const audience = new Set(audienceIds);
  const total = audience.size;
  const grantsOn = new Map();
  for (const grant of grants) {
    const personId = grant?.grantee?.id;
    if (!audience.has(personId)) continue;
    const key = `${grant.itemKind}:${grant.itemId}`;
    grantsOn.set(key, [...(grantsOn.get(key) || []), { personId, grantId: grant.id, permission: grant.permission }]);
  }
  const copiesOf = new Map();
  for (const item of sent) {
    const personId = item?.recipient?.id;
    if (!audience.has(personId) || !item.sourceDocumentId) continue;
    copiesOf.set(item.sourceDocumentId, [...(copiesOf.get(item.sourceDocumentId) || []), { personId, mode: item.mode, dueDate: item.dueDate || "", sentId: item.id }]);
  }

  const build = (key, inheritedFrom, copies = []) => {
    const direct = grantsOn.get(key) || [];
    const inherited = inheritedFrom.filter((entry) => !direct.some((own) => own.personId === entry.personId && RANK[own.permission] >= RANK[entry.permission]));
    const people = new Map();
    for (const entry of [...inherited, ...direct]) {
      const current = people.get(entry.personId);
      if (!current || RANK[entry.permission] > RANK[current]) people.set(entry.personId, entry.permission);
    }
    const reached = new Set([...people.keys(), ...copies.map((copy) => copy.personId)]);
    const best = [...people.values()].reduce((top, permission) => ((RANK[permission] || 0) > (RANK[top] || 0) ? permission : top), "");
    return { count: reached.size, total, direct, inherited, copies, best, live: people };
  };
  // Who reaches the children of a node through a share on the node (or above it).
  const passDown = (access, fromName) => [...access.live.entries()].map(([personId, permission]) => {
    const own = access.direct.find((entry) => entry.personId === personId);
    const above = access.inherited.find((entry) => entry.personId === personId);
    return { personId, permission, fromName: own ? fromName : above?.fromName || fromName };
  });

  const topics = [];
  for (const workspace of workspaces) {
    for (const subject of workspace.subjects || []) {
      if (isReservedSubjectName(subject.name)) continue;
      const topicAccess = build(`subject:${subject.id}`, []);
      const folders = subject.folders || [];
      const ids = new Set(folders.map((folder) => folder.id));
      const children = new Map();
      for (const folder of folders) {
        const parent = folder.parentFolderId && ids.has(folder.parentFolderId) ? folder.parentFolderId : "";
        children.set(parent, [...(children.get(parent) || []), folder]);
      }
      const documents = (subject.documents || []).filter((document) => !isPrivateDocument(document) && !isSharedDocument(document));
      const docsIn = new Map();
      for (const document of documents) {
        const folderId = (document.folderIds || []).find((id) => ids.has(id)) || (ids.has(document.folderId) ? document.folderId : "");
        docsIn.set(folderId, [...(docsIn.get(folderId) || []), document]);
      }
      const rows = [];
      const addDocs = (folderId, inherited, depth) => {
        for (const document of (docsIn.get(folderId) || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
          rows.push({ kind: "document", id: document.id, name: document.name, depth, itemType: itemTypeOf(document), document, access: build(`document:${document.id}`, inherited, copiesOf.get(document.id) || []) });
        }
      };
      const walk = (parentId, inherited, depth, seen) => {
        for (const folder of (children.get(parentId) || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
          if (seen.has(folder.id)) continue;
          seen.add(folder.id);
          const access = build(`folder:${folder.id}`, inherited);
          rows.push({ kind: "folder", id: folder.id, name: folder.name, depth, access });
          const below = passDown(access, folder.name);
          addDocs(folder.id, below, depth + 1);
          walk(folder.id, below, depth + 1, seen);
        }
      };
      const fromTopic = passDown(topicAccess, subject.name);
      addDocs("", fromTopic, 0);
      walk("", fromTopic, 0, new Set());
      topics.push({ id: subject.id, workspaceId: workspace.id, name: subject.name, access: topicAccess, rows });
    }
  }
  return topics;
}

/** "shared" when everyone in the audience reaches it, "partial" when some do, "none" otherwise. */
export const coverageOf = (access) => (!access.total || !access.count ? "none" : access.count >= access.total ? "shared" : "partial");

/** Counts for the filter chips. */
export function overviewCounts(topics) {
  let shared = 0;
  let none = 0;
  for (const topic of topics) {
    for (const row of [{ access: topic.access }, ...topic.rows]) {
      if (coverageOf(row.access) === "none") none += 1;
      else shared += 1;
    }
  }
  return { shared, none };
}
