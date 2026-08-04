import { NextResponse } from "next/server";
import { runQuizGeneration } from "../../../../modules/ai-tools/pipeline/quizGenerator.js";
import { renderQuizExports, renderQuizTextDocument } from "../../../../modules/ai-tools/render/exporters.js";
import { saveGeneratedQuizDocument } from "../../../../lib/workspacesRepository.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeConfig(input = {}) {
  return {
    title: String(input.title || "").trim(),
    topicPrompt: String(input.topicPrompt || "").trim(),
    difficulty: String(input.difficulty || "medium").trim(),
    questionCount: Math.max(1, Math.min(20, Number(input.questionCount || 6))),
    questionTypes: Array.isArray(input.questionTypes) ? input.questionTypes : ["multiple-choice"],
    chunking: {
      chunkWords: Math.max(150, Math.min(900, Number(input.chunking?.chunkWords || 500))),
      overlapWords: Math.max(50, Math.min(300, Number(input.chunking?.overlapWords || 150)))
    },
    scope: {
      workspaceId: String(input.scope?.workspaceId || ""),
      subjectId: String(input.scope?.subjectId || ""),
      folderIds: Array.isArray(input.scope?.folderIds) ? input.scope.folderIds : [],
      documentIds: Array.isArray(input.scope?.documentIds) ? input.scope.documentIds : [],
      tagNames: Array.isArray(input.scope?.tagNames) ? input.scope.tagNames : []
    },
    saveOutput: {
      enabled: Boolean(input.saveOutput?.enabled),
      folderIds: Array.isArray(input.saveOutput?.folderIds) ? input.saveOutput.folderIds : [],
      tagNames: Array.isArray(input.saveOutput?.tagNames) ? input.saveOutput.tagNames : []
    }
  };
}

function buildGeneratedQuizFilename(quizJson) {
  const title = String(quizJson?.quiz?.title || "Generated Quiz").trim() || "Generated Quiz";
  const safeTitle = title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return `${safeTitle}.txt`;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const config = normalizeConfig(body?.config || {});
    const result = await runQuizGeneration(config);
    const rendered = await renderQuizExports(result.quizJson);
    let savedDocument = null;

    if (config.saveOutput.enabled) {
      if (!config.scope.subjectId) {
        throw new Error("Saving generated quiz output requires a subject selection.");
      }

      const textContent = renderQuizTextDocument(result.quizJson);
      savedDocument = await saveGeneratedQuizDocument(config.scope.subjectId, {
        name: buildGeneratedQuizFilename(result.quizJson),
        content: textContent,
        sizeBytes: Buffer.byteLength(textContent, "utf8")
      }, {
        folderIds: config.saveOutput.folderIds,
        tags: config.saveOutput.tagNames.length ? config.saveOutput.tagNames : config.scope.tagNames
      });
    }

    return NextResponse.json({
      quizJson: result.quizJson,
      htmlPreview: rendered.html,
      downloads: rendered.files,
      savedDocument,
      scopeSummary: result.scopeSummary,
      retrieval: {
        selectedChunkCount: result.rankedChunks.length,
        selectedDocumentCount: result.selectedDocuments.length,
        chunkDocuments: Array.from(new Set(result.rankedChunks.map((chunk) => chunk.documentName)))
      }
    });
  } catch (error) {
    return NextResponse.json({ error: String(error.message || error) }, { status: 500 });
  }
}
