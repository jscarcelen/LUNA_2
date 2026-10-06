/**
 * What "shared" means, in one place that both the browser and the server import (it is pure).
 *
 * Two mechanisms exist. LIVE shares (view/edit on the owner's original, `share_grants`, see lib/grants.js) are
 * marked on tree nodes with `shared: { … }` (`sharedInfoOf`). COPIES (Assign, and older shares) are described below.
 *
 * A document that arrives from another account is a read-only COPY in the receiver's own workspace:
 *
 *   <first workspace> / Shared documents / <sender's name> / <the copy>
 *
 * The copy carries `shared-by:<sender account id>` (and `assigned-by:<id>` when it was assigned).
 * Those tags are what the interface and the server treat as "not editable": the receiver cannot
 * rename, delete, retag or rewrite it, but may read it, highlight it, take notes in their own sidecar
 * document, answer it, and tick plan steps off.
 */

export const SHARED_SUBJECT_NAME = "Shared documents";
export const SHARED_BY_PREFIX = "shared-by:";
export const ASSIGNED_BY_PREFIX = "assigned-by:";
/**
 * `due-by:<sender id>` says that the `due:YYYY-MM-DD` tag of this copy was set by that sender: it is IMPOSED, the
 * receiver cannot change or remove it (server-enforced). The receiver's own date for the same item is
 * `due-own:YYYY-MM-DD`, an ordinary tag they edit freely.
 */
export const DUE_BY_PREFIX = "due-by:";
export const DUE_OWN_PREFIX = "due-own:";

const lower = (value) => String(value || "").trim().toLowerCase();

/** Tags only the server may add or remove; a client request can never change them. */
export function isProtectedTag(tag) {
  const value = lower(tag);
  return value.startsWith(SHARED_BY_PREFIX) || value.startsWith(ASSIGNED_BY_PREFIX) || value.startsWith(DUE_BY_PREFIX);
}

const tagValue = (document, prefix) => {
  const found = (document?.tags || []).map(lower).find((tag) => tag.startsWith(prefix));
  return found ? found.slice(prefix.length) : "";
};

export const isSharedDocument = (document) => Boolean(tagValue(document, SHARED_BY_PREFIX));
export const sharedById = (document) => tagValue(document, SHARED_BY_PREFIX);
export const isAssignedDocument = (document) => Boolean(tagValue(document, ASSIGNED_BY_PREFIX));
export const assignedById = (document) => tagValue(document, ASSIGNED_BY_PREFIX);

/** "Prof. Rivera" — the copy is filed in a folder named after the sender. */
export function senderNameOf(document, folders = []) {
  for (const id of document?.folderIds || []) {
    const folder = folders.find((entry) => entry.id === id);
    if (folder?.name) return folder.name;
  }
  return "";
}

/** The `due:YYYY-MM-DD` tag, if the document has one. */
export function dueDateOf(document) {
  const found = (document?.tags || []).find((tag) => /^due:\d{4}-\d{2}-\d{2}$/.test(String(tag)));
  return found ? String(found).slice(4) : "";
}

/**
 * The deadlines of an activity or other document, with their origin.
 *   imposed: the sender's date (`due:` + `due-by:<id>`, or a legacy assigned copy's `due:`), locked for the receiver
 *   own:     the receiver's own date (`due-own:` next to an imposed one, otherwise the plain `due:` tag)
 *   date:    the earlier of the two (what sorts and what is "late")
 * `byId` is the sender; the name is the folder the copy sits in (`senderNameOf`).
 * @returns {{ imposed: { date: string, byId: string } | null, own: { date: string } | null, date: string }}
 */
export function dueInfoOf(document) {
  const tags = (document?.tags || []).map((tag) => String(tag).trim());
  const lowered = tags.map((tag) => tag.toLowerCase());
  const due = dueDateOf(document);
  const byTag = lowered.find((tag) => tag.startsWith(DUE_BY_PREFIX));
  const assignedTag = lowered.find((tag) => tag.startsWith(ASSIGNED_BY_PREFIX));
  const ownTag = tags.find((tag) => /^due-own:\d{4}-\d{2}-\d{2}$/i.test(tag));
  const byId = byTag ? byTag.slice(DUE_BY_PREFIX.length) : assignedTag ? assignedTag.slice(ASSIGNED_BY_PREFIX.length) : "";
  const imposed = due && byId ? { date: due, byId } : null;
  const ownDate = ownTag ? ownTag.slice(DUE_OWN_PREFIX.length) : imposed ? "" : due;
  const own = ownDate ? { date: ownDate } : null;
  const dates = [imposed?.date, own?.date].filter(Boolean).sort();
  return { imposed, own, date: dates[0] || "" };
}

/** The tag prefix a receiver's own date is stored under: `due-own:` next to an imposed date, the plain `due:` otherwise. */
export const ownDueTagPrefix = (document) => (dueInfoOf(document).imposed ? DUE_OWN_PREFIX : "due:");

export const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

const SIDECAR_TAGS = ["doc-notes", "activity-attempt", "ai-agent", "study-goal"];

/**
 * What kind of thing is this document, and may it be sent? Received copies cannot be forwarded and
 * Luna's own bookkeeping documents (notes, attempts, agents, goals) are never sent.
 * @returns {{ ok: true, itemType: "plan" | "activity" | "resource" | "document" } | { ok: false, error: string }}
 */
export function classifyDeliverable(document, mode) {
  const tags = (document?.tags || []).map((tag) => String(tag).trim().toLowerCase());
  if (tags.some((tag) => tag.startsWith("shared-by:"))) return { ok: false, error: "This was shared with you, so only the original sender can send it on." };
  if (tags.some((tag) => SIDECAR_TAGS.includes(tag))) return { ok: false, error: "That kind of item cannot be shared." };
  const itemType = tags.includes("study-plan") ? "plan" : tags.includes("resource") && tags.includes("activity") ? "activity" : tags.includes("resource") ? "resource" : "document";
  if (mode === "assign" && itemType !== "plan" && itemType !== "activity") return { ok: false, error: "Only activities (quizzes, flashcards, worksheets…) and study plans can be assigned. Use Share for other documents." };
  return { ok: true, itemType };
}

const stable = (value) => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};

function parseObject(text) {
  try {
    const parsed = JSON.parse(String(text || ""));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * May a receiver save this new content over a shared copy? Only the receiver's own layer is allowed
 * to change: highlights and notes, an "updated at" stamp, and the ticks on a plan's steps.
 * Everything the sender wrote stays exactly as sent. Content that is not JSON cannot be edited at all.
 */
export function sharedEditAllowed(oldContent, newContent) {
  const before = parseObject(oldContent);
  const after = parseObject(newContent);
  if (!before || !after) return String(oldContent || "") === String(newContent || "");
  const clean = (object) => {
    const copy = { ...object };
    delete copy.highlights;
    delete copy.updatedAt;
    // Screen-only fields the plan page adds when it opens a plan and writes it back.
    delete copy.documentId;
    delete copy.receivedFrom;
    if (Array.isArray(copy.items)) {
      copy.items = copy.items.map((item) => {
        if (!item || typeof item !== "object") return item;
        const next = { ...item };
        delete next.doneAt;
        // The receiver may add their own (earlier) date to a step they were given.
        delete next.ownDueDate;
        return next;
      });
    }
    // The receiver's own deadlines are theirs to add, change and remove; what the sender set stays exactly as sent.
    if (Array.isArray(copy.deadlines)) copy.deadlines = copy.deadlines.filter((deadline) => deadline?.setBy?.kind !== "self");
    return copy;
  };
  return stable(clean(before)) === stable(clean(after));
}

/**
 * What a parent or teacher may see of a linked student's workspace: the generated work that performance
 * is made of (resources, attempts, plans, goals) in full, but uploaded material and private notes only
 * by name. Drops the heavy payloads too.
 */
export function redactTreeForGuardian(workspaces = []) {
  return (workspaces || []).map((workspace) => ({
    ...workspace,
    subjects: (workspace.subjects || []).map((subject) => ({
      ...subject,
      documents: (subject.documents || [])
        .filter((document) => !(document.tags || []).includes("doc-notes"))
        .map((document) => {
          const generated = document.sourceType === "generated";
          return {
            ...document,
            content: generated ? document.content : "",
            preview: generated ? document.preview : "",
            sourceContentBase64: "",
            sourceRenderHtml: "",
            sourcePreview: ""
          };
        })
    }))
  }));
}

/* ------------------------------------------------------------------ live shares (share_grants), see lib/grants.js */

/** The topic where everything shared with you lives: "Shared with me / <owner's name> / …". */
export const SHARED_WITH_ME_SUBJECT = "Shared with me";
/** Marks an agent or template copy that came from another account (not protected: the copy is the recipient's own). */
export const SHARED_FROM_PREFIX = "shared-from:";

const sameName = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

/** The two topics Luna fills by itself; the account cannot restructure them (their contents come from other people). */
export const isReservedSubjectName = (name) => sameName(name, SHARED_SUBJECT_NAME) || sameName(name, SHARED_WITH_ME_SUBJECT);

/**
 * What a document or folder in the tree says about being shared WITH you: `{ grantId, ownerId, ownerName,
 * permission, root }` or null for your own items. `root` is true on the item that was actually shared (you can
 * leave that one); everything inside a shared folder inherits the permission.
 */
export const sharedInfoOf = (entry) => (entry?.shared && typeof entry.shared === "object" ? entry.shared : null);
export const canEditShared = (entry) => sharedInfoOf(entry)?.permission === "edit";

/** "Your student", "Your teacher", "Your child", "Your parent" - or a plain description for a peer connection. */
export function relationLabel(kind, myRole, otherRole) {
  if (kind === "teacher_student") return myRole === "teacher" ? "Your student" : "Your teacher";
  if (kind === "parent_student") return myRole === "parent" ? "Your child" : "Your parent";
  return otherRole === "teacher" ? "Teacher in your network" : otherRole === "parent" ? "Parent in your network" : otherRole === "student" ? "Student in your network" : "In your network";
}

/** Can this kind of connection see performance? Only teacher/parent <-> student; a peer never. */
export const kindExposesPerformance = (kind) => kind === "teacher_student" || kind === "parent_student";
