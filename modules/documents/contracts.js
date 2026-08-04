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