import { chunkDocuments, DEFAULT_CHUNK_WORDS, DEFAULT_OVERLAP_WORDS } from "./chunking.js";
import { generateQuizJsonLocal } from "./provider-local.js";
import { selectTopChunks } from "./retrieval.js";
import { loadWorkspaceTreeForAi } from "./workspaceSource.js";
import { listDocumentChunks } from "../../../lib/workspacesRepository.js";

function collectWorkspaceDocs(workspaces, scope) {
  const workspaceFilter = String(scope.workspaceId || "").trim();
  const subjectFilter = String(scope.subjectId || "").trim();
  const folderIds = new Set((scope.folderIds || []).filter(Boolean));
  const documentIds = new Set((scope.documentIds || []).filter(Boolean));
  const tagNames = new Set((scope.tagNames || []).map((tag) => String(tag).trim().toLowerCase()).filter(Boolean));

  const matches = [];

  for (const workspace of workspaces) {
    if (workspaceFilter && workspace.id !== workspaceFilter) continue;
    for (const subject of workspace.subjects || []) {
      if (subjectFilter && subject.id !== subjectFilter) continue;
      for (const document of subject.documents || []) {
        const folderMatch = !folderIds.size || document.folderIds?.some((folderId) => folderIds.has(folderId));
        const docMatch = !documentIds.size || documentIds.has(document.id);
        const tagMatch = !tagNames.size || document.tags?.some((tag) => tagNames.has(tag));
        if (!folderMatch || !docMatch || !tagMatch) continue;

        matches.push({
          ...document,
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          subjectId: subject.id,
          subjectName: subject.name
        });
      }
    }
  }

  return matches;
}

function buildScopeSummary(documents) {
  return {
    selectedDocumentCount: documents.length,
    workspaceName: documents[0]?.workspaceName || "",
    subjectName: documents[0]?.subjectName || "",
    documentNames: documents.map((doc) => doc.name)
  };
}

async function loadChunksForScope(selectedDocuments, chunking) {
  const usesDefaultChunking =
    Number(chunking.chunkWords) === DEFAULT_CHUNK_WORDS &&
    Number(chunking.overlapWords) === DEFAULT_OVERLAP_WORDS;

  if (!usesDefaultChunking) {
    return chunkDocuments(selectedDocuments, chunking);
  }

  const persistedChunks = await listDocumentChunks(
    selectedDocuments.map((document) => document.id),
    chunking
  );

  if (!persistedChunks.length) {
    return chunkDocuments(selectedDocuments, chunking);
  }

  const byDocumentId = new Map(selectedDocuments.map((document) => [document.id, document]));
  const expectedDocumentIds = new Set(selectedDocuments.filter((document) => String(document.content || "").trim()).map((document) => document.id));
  const persistedDocumentIds = new Set(persistedChunks.map((chunk) => chunk.documentId));

  if (persistedDocumentIds.size < expectedDocumentIds.size) {
    return chunkDocuments(selectedDocuments, chunking);
  }

  return persistedChunks.map((chunk) => {
    const document = byDocumentId.get(chunk.documentId);
    return {
      id: `${chunk.documentId}-chunk-${chunk.chunkIndex + 1}`,
      documentId: chunk.documentId,
      documentName: document?.name || "Untitled document",
      subjectId: chunk.subjectId || document?.subjectId || "",
      folderIds: Array.isArray(document?.folderIds) ? document.folderIds : [],
      tags: Array.isArray(document?.tags) ? document.tags : [],
      chunkIndex: chunk.chunkIndex,
      wordCount: chunk.wordCount,
      startWord: chunk.startWord,
      endWord: chunk.endWord,
      content: chunk.content,
      keywords: chunk.keywords,
      semanticScore: chunk.semanticScore
    };
  });
}

export async function runQuizGeneration(config) {
  const workspaces = await loadWorkspaceTreeForAi();
  const selectedDocuments = collectWorkspaceDocs(workspaces, config.scope || {});

  if (!selectedDocuments.length) {
    throw new Error("No documents match the selected quiz scope.");
  }

  const chunking = {
    chunkWords: Number(config.chunking?.chunkWords || DEFAULT_CHUNK_WORDS),
    overlapWords: Number(config.chunking?.overlapWords || DEFAULT_OVERLAP_WORDS)
  };

  const chunks = await loadChunksForScope(selectedDocuments, chunking);
  if (!chunks.length) {
    throw new Error("Selected documents do not contain enough text to build quiz chunks.");
  }

  const rankedChunks = selectTopChunks(chunks, config);
  const scopeSummary = buildScopeSummary(selectedDocuments);
  const quizJson = generateQuizJsonLocal({
    config: {
      ...config,
      chunking
    },
    chunks: rankedChunks,
    scopeSummary
  });

  return {
    quizJson,
    scopeSummary,
    selectedDocuments,
    rankedChunks
  };
}
