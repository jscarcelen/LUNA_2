import { getDocumentFolderIds } from "../documents";

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