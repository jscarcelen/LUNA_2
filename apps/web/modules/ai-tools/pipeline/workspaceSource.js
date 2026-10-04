import { listWorkspaceTree } from "../../../lib/workspacesRepository.js";
import { readWorkspaces } from "../../../lib/mockStore.js";
import { getDemoOwnerUserId, isSupabaseConfigured } from "../../../lib/supabaseClient.js";
import { isMasterDocument, masterDocumentMarkdown, parseMasterResource } from "./masterDocument.js";

function normalizeTopicTags(topicTags = []) {
  return topicTags.map((tag) => {
    if (typeof tag === "string") {
      return { name: tag, color: "#ffd66b" };
    }
    return {
      name: String(tag?.name || "").trim().toLowerCase(),
      color: tag?.color || "#ffd66b"
    };
  }).filter((tag) => tag.name);
}

/**
 * A master document is stored as a resource (typed blocks) but read as Markdown by retrieval, the
 * source page and the chat: its name is the resource's title and each statement names the original
 * documents it came from.
 */
function readableMaster(doc) {
  if (!isMasterDocument(doc)) return doc;
  const markdown = masterDocumentMarkdown(doc);
  if (!markdown) return doc;
  const resource = parseMasterResource(doc);
  return { ...doc, name: String(resource?.name || doc.name || "Master document").trim(), content: markdown };
}

function normalizeDocuments(documents = []) {
  return documents.map(readableMaster).map((doc) => ({
    ...doc,
    folderIds: Array.isArray(doc.folderIds)
      ? doc.folderIds.filter(Boolean)
      : (doc.folderId ? [doc.folderId] : []),
    tags: (doc.tags || []).map((tag) => String(tag).trim().toLowerCase()).filter(Boolean),
    content: String(doc.content || ""),
    reviewStatus: String(doc.reviewStatus || "approved").trim().toLowerCase() || "approved",
    extractionConfidence: Number(doc.extractionConfidence || 0),
    extractionMethod: String(doc.extractionMethod || ""),
    extractionIssues: Array.isArray(doc.extractionIssues) ? doc.extractionIssues : [],
    requiresReview: Boolean(doc.requiresReview)
  }));
}

function normalizeSubjects(subjects = []) {
  return subjects.map((subject) => ({
    ...subject,
    topicTags: normalizeTopicTags(subject.topicTags || []),
    folders: (subject.folders || []).map((folder) => ({
      ...folder,
      parentFolderId: folder.parentFolderId || ""
    })),
    documents: normalizeDocuments(subject.documents || [])
  }));
}

export async function loadWorkspaceTreeForAi() {
  if (isSupabaseConfigured()) {
    const workspaces = await listWorkspaceTree(getDemoOwnerUserId());
    return workspaces.map((workspace) => ({
      ...workspace,
      subjects: normalizeSubjects(workspace.subjects || [])
    }));
  }

  const workspaces = await readWorkspaces();
  return workspaces.map((workspace) => ({
    ...workspace,
    subjects: normalizeSubjects(workspace.subjects || [])
  }));
}
