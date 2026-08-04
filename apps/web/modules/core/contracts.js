export const AI_DOMAIN_VERSION = "1";

const REQUIRED_TOOL_FIELDS = ["id", "name", "description", "runLabel", "component"];

export function validateAiToolManifest(tool) {
  const issues = [];

  if (!tool || typeof tool !== "object") {
    return { ok: false, issues: ["tool manifest must be an object"] };
  }

  for (const field of REQUIRED_TOOL_FIELDS) {
    if (!tool[field]) {
      issues.push(`missing required field: ${field}`);
    }
  }

  if (tool.id && typeof tool.id !== "string") {
    issues.push("field id must be a string");
  }

  if (tool.pipelineConfig && typeof tool.pipelineConfig !== "object") {
    issues.push("field pipelineConfig must be an object when provided");
  }

  return { ok: issues.length === 0, issues };
}

export const WORKSPACES_DOMAIN_VERSION = "1";
export const DEFAULT_WORKSPACE_COLOR = "#2f6db2";
export const DEFAULT_SUBJECT_COLOR = "#2a5f9e";

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function normalizeWorkspaceName(name) {
  return String(name || "").trim();
}

export function normalizeSubjectName(name) {
  return String(name || "").trim();
}

export function normalizeWorkspaceColor(color) {
  const nextColor = String(color || "").trim();
  if (!HEX_COLOR_PATTERN.test(nextColor)) {
    return DEFAULT_WORKSPACE_COLOR;
  }
  return nextColor.toLowerCase();
}

export function normalizeSubjectColor(color) {
  const nextColor = String(color || "").trim();
  if (!HEX_COLOR_PATTERN.test(nextColor)) {
    return DEFAULT_SUBJECT_COLOR;
  }
  return nextColor.toLowerCase();
}

export const TAGGING_DOMAIN_VERSION = "1";
export const DEFAULT_TOPIC_TAG_COLOR = "#ffd66b";

export function normalizeTagName(tag) {
  return String(tag || "").trim().toLowerCase();
}

export function dedupeTagNames(tags) {
  const normalized = (tags || []).map((tag) => normalizeTagName(tag)).filter(Boolean);
  return Array.from(new Set(normalized));
}

export function normalizeTopicTagColor(color) {
  const nextColor = String(color || "").trim();
  if (!HEX_COLOR_PATTERN.test(nextColor)) {
    return DEFAULT_TOPIC_TAG_COLOR;
  }
  return nextColor.toLowerCase();
}

export const DOCUMENTS_DOMAIN_VERSION = "1";

function normalizeId(value) {
  return String(value || "").trim();
}

function normalizeTag(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeDocumentName(name) {
  return String(name || "").trim();
}

export function normalizeFolderIds(folderIds) {
  if (!Array.isArray(folderIds)) return [];
  return Array.from(new Set(folderIds.map((id) => normalizeId(id)).filter(Boolean)));
}

export function getDocumentFolderIds(document) {
  if (Array.isArray(document?.folderIds) && document.folderIds.length) {
    return normalizeFolderIds(document.folderIds);
  }
  return normalizeFolderIds([document?.folderId || ""]);
}

export function normalizeDocumentMeta(input = {}) {
  const folderIds = normalizeFolderIds(input.folderIds || []);
  const tags = Array.from(new Set((input.tags || []).map((tag) => normalizeTag(tag)).filter(Boolean)));

  return { folderIds, tags };
}

export function buildFolderChildrenMap(folderList = []) {
  const childrenByParent = new Map();
  for (const folder of folderList) {
    const key = folder.parentFolderId || "";
    const list = childrenByParent.get(key) || [];
    list.push(folder);
    childrenByParent.set(key, list);
  }
  return childrenByParent;
}

export function flattenFolders(folderList = []) {
  const childrenByParent = buildFolderChildrenMap(folderList);
  const out = [];

  const visit = (parentId, depth) => {
    const children = childrenByParent.get(parentId) || [];
    for (const child of children) {
      out.push({ ...child, depth });
      visit(child.id, depth + 1);
    }
  };

  visit("", 0);
  return out;
}

export function buildFolderPathMap(folderList = []) {
  const byId = new Map(folderList.map((folder) => [folder.id, folder]));
  const cache = new Map();

  const labelFor = (id) => {
    if (!id) return "-";
    if (cache.has(id)) return cache.get(id);

    const folder = byId.get(id);
    if (!folder) return "-";

    const parent = folder.parentFolderId ? labelFor(folder.parentFolderId) : "";
    const label = parent && parent !== "-" ? `${parent} / ${folder.name}` : folder.name;
    cache.set(id, label);
    return label;
  };

  const labels = new Map();
  for (const folder of folderList) {
    labels.set(folder.id, labelFor(folder.id));
  }
  return labels;
}

export function filterDocuments(documents = [], options = {}) {
  const folderId = String(options.folderId || "").trim();
  const tag = String(options.tag || "").trim();
  const text = String(options.text || "").trim().toLowerCase();

  return documents.filter((doc) => {
    const docFolderIds = getDocumentFolderIds(doc);
    const byFolder = !folderId || docFolderIds.includes(folderId);
    const byTag = !tag || (doc.tags || []).includes(tag);
    const byText =
      !text ||
      String(doc.name || "").toLowerCase().includes(text) ||
      String(doc.content || "").toLowerCase().includes(text);

    return byFolder && byTag && byText;
  });
}

export function splitDocumentsByFolder(documents = []) {
  const documentsByFolder = new Map();
  const unfiledDocuments = [];

  for (const doc of documents) {
    const docFolderIds = getDocumentFolderIds(doc);
    if (!docFolderIds.length) {
      unfiledDocuments.push(doc);
      continue;
    }

    for (const folderId of docFolderIds) {
      const list = documentsByFolder.get(folderId) || [];
      list.push(doc);
      documentsByFolder.set(folderId, list);
    }
  }

  return {
    documentsByFolder,
    unfiledDocuments
  };
}