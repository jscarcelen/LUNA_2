/**
 * What "shared" means, in one place that both the browser and the server import (it is pure).
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

const lower = (value) => String(value || "").trim().toLowerCase();

/** Tags only the server may add or remove; a client request can never change them. */
export function isProtectedTag(tag) {
  const value = lower(tag);
  return value.startsWith(SHARED_BY_PREFIX) || value.startsWith(ASSIGNED_BY_PREFIX);
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
    if (Array.isArray(copy.items)) {
      copy.items = copy.items.map((item) => {
        if (!item || typeof item !== "object") return item;
        const next = { ...item };
        delete next.doneAt;
        return next;
      });
    }
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
