import { tEn } from "../../lib/i18n/index.js";
import { kindExposesPerformance, sharedInfoOf } from "./shared.js";
import { isPrivateDocument } from "../../lib/grants.js";

/**
 * "Who can see this?" for a student, in one place (pure; the tags and notes in VisibilityTags.js only render it).
 *
 * Three ways someone else sees a student's things, and nothing else:
 *   1. WATCHERS: a teacher or parent connected to the student (teacher_student / parent_student). They see the
 *      student's plans, quizzes, summaries and every score in full, and only the NAMES of uploaded files
 *      (lib/accountsRepository linkedStudentWorkspaces -> redactTreeForGuardian). Private notes: never.
 *   2. LIVE SHARES the student gave (share_grants: a file, a folder with everything in it, a topic).
 *   3. Things shared WITH the student belong to the person who shared them (they already carry a "Shared by" chip).
 * A peer connection never sees scores or progress.
 */

const nameOf = (person) => String(person?.displayName || person?.email || "").trim();

/** The teachers and parents who can follow this student's work: [{ id, name, role }]. */
export function watchersFrom(accepted = []) {
  const seen = new Set();
  const out = [];
  for (const link of accepted || []) {
    const role = link?.other?.role;
    if (!kindExposesPerformance(link?.kind) || (role !== "teacher" && role !== "parent")) continue;
    const id = link.other.id || link.other.email;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: nameOf(link.other) || role, role });
  }
  return out;
}

/** The live shares this account gave, by item: Map "document:<id>" | "folder:<id>" | "subject:<id>" -> [names]. */
export function grantIndex(given = []) {
  const index = new Map();
  for (const grant of given || []) {
    const key = `${grant?.itemKind}:${grant?.itemId}`;
    const name = nameOf(grant?.grantee);
    if (!grant?.itemKind || !grant?.itemId || !name) continue;
    const list = index.get(key) || [];
    if (!list.includes(name)) list.push(name);
    index.set(key, list);
  }
  return index;
}

/** Where every document and folder lives: { documents: Map id -> { subjectId, folderIds }, parents: Map folderId -> parentId }. */
export function locateAll(workspaces = []) {
  const documents = new Map();
  const parents = new Map();
  for (const workspace of workspaces || []) {
    for (const subject of workspace.subjects || []) {
      for (const folder of subject.folders || []) {
        parents.set(folder.id, folder.parentFolderId || "");
      }
      for (const document of subject.documents || []) documents.set(document.id, { subjectId: subject.id, folderIds: document.folderIds || [] });
    }
  }
  return { documents, parents };
}

/** A folder and every folder above it. */
function folderChain(folderId, parents) {
  const chain = [];
  let current = folderId;
  while (current && !chain.includes(current) && chain.length < 50) {
    chain.push(current);
    current = parents.get(current) || "";
  }
  return chain;
}

/** Everyone a document reaches through a share the student gave (on it, on a folder above it, or on its topic). */
export function sharedWithNames(documentId, { index, places }) {
  if (!index?.size) return [];
  const place = places?.documents?.get(documentId);
  const keys = [`document:${documentId}`];
  for (const folderId of place?.folderIds || []) for (const id of folderChain(folderId, places.parents)) keys.push(`folder:${id}`);
  if (place?.subjectId) keys.push(`subject:${place.subjectId}`);
  return [...new Set(keys.flatMap((key) => index.get(key) || []))];
}

/** Does a teacher/parent see what is inside (generated work, plans, attempts) or only the name (uploaded material)? */
export function watchersSeeContent(document) {
  if (isPrivateDocument(document) && !(document?.tags || []).includes("activity-attempt")) return false;
  const tags = document?.tags || [];
  return document?.sourceType === "generated" || ["study-plan", "resource", "activity", "activity-attempt"].some((tag) => tags.includes(tag));
}

/**
 * Who can see one document: `{ incoming, sharedWith, watchers, watchersSee: "all" | "name" | "none", private }`.
 * `incoming` is a live share from someone else (it is theirs; nothing here applies).
 */
export function audienceOf(document, { watchers = [], index = new Map(), places = null } = {}) {
  if (!document) return null;
  if (sharedInfoOf(document)) return { incoming: true, sharedWith: [], watchers: [], watchersSee: "none", private: false };
  const notes = (document.tags || []).includes("doc-notes");
  const sharedWith = notes ? [] : sharedWithNames(document.id, { index, places });
  const watchersSee = !watchers.length || notes ? "none" : watchersSeeContent(document) ? "all" : "name";
  return { incoming: false, sharedWith, watchers: watchersSee === "none" ? [] : watchers, watchersSee, private: !sharedWith.length && watchersSee !== "all" };
}

/** "Ana", "Ana and Leo", "Ana, Leo +2". */
export function shortNames(names = [], t = tEn) {
  const list = (names || []).filter(Boolean);
  if (list.length <= 1) return list[0] || "";
  if (list.length === 2) return t("people.vis.twoNames", { a: list[0], b: list[1] });
  return t("people.vis.manyNames", { a: list[0], b: list[1], count: list.length - 2 });
}

/** "Ms Rivera (teacher), Dad (parent)". */
export function watcherNames(watchers = [], t = tEn) {
  return (watchers || []).map((person) => t(person.role === "parent" ? "people.vis.asParent" : "people.vis.asTeacher", { name: person.name })).join(", ");
}

/** "teacher" | "parent" | "both" — which word the tag uses. */
export function watcherWord(watchers = []) {
  const roles = new Set((watchers || []).map((person) => person.role));
  return roles.has("teacher") && roles.has("parent") ? "both" : roles.has("parent") ? "parent" : "teacher";
}

/**
 * The tags one document shows, most important first: [{ key, icon, text, title }].
 * Nothing for a live share from someone else (its "Shared by" chip already says whose it is).
 */
export function audienceChips(audience, t = tEn) {
  if (!audience || audience.incoming) return [];
  const chips = [];
  if (audience.watchersSee === "all") chips.push({ key: "watchers", icon: "👀", text: t(`people.vis.chip.${watcherWord(audience.watchers)}`), title: t("people.vis.tip.watchers", { names: watcherNames(audience.watchers, t) }) });
  if (audience.sharedWith.length) chips.push({ key: "shared", icon: "👥", text: t("people.vis.chip.sharedWith", { names: shortNames(audience.sharedWith, t) }), title: t("people.vis.tip.sharedWith", { names: audience.sharedWith.join(", ") }) });
  if (audience.private) chips.push({ key: "private", icon: "🔒", text: t("people.vis.chip.private"), title: audience.watchersSee === "name" ? t("people.vis.tip.privateName", { names: watcherNames(audience.watchers, t) }) : t("people.vis.tip.private") });
  return chips;
}

/** The line under a quiz or flashcard deck (`what` "score") or on the progress page ("progress"): who sees it. */
export function scoreAudience(watchers = [], t = tEn, what = "score") {
  return watchers.length
    ? { icon: "👀", text: t(`people.vis.${what}.seen`, { names: watcherNames(watchers, t) }) }
    : { icon: "🔒", text: t(`people.vis.${what}.private`) };
}

/** The lines at the top of a study plan: who can follow it. [{ icon, text }] */
export function planAudience(audience, t = tEn) {
  if (!audience || audience.incoming) return [];
  const lines = [];
  if (audience.watchersSee === "all") lines.push({ icon: "👀", text: t("people.vis.plan.watchers", { names: watcherNames(audience.watchers, t) }) });
  if (audience.sharedWith.length) lines.push({ icon: "👥", text: t("people.vis.plan.shared", { names: audience.sharedWith.join(", ") }) });
  return lines.length ? lines : [{ icon: "🔒", text: t("people.vis.plan.private") }];
}
