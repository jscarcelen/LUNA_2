import { NextResponse } from "next/server";
import { runQuizGeneration } from "../../../../modules/ai-tools/pipeline/quizGenerator.js";
import { renderQuizExports } from "../../../../modules/ai-tools/render/exporters.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeConfig(input = {}) {
  return {
    title: String(input.title || "").trim(),
    topicPrompt: String(input.topicPrompt || "").trim(),
    difficulty: String(input.difficulty || "medium").trim(),
    questionCount: Math.max(1, Number(input.questionCount || 6)),
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
    }
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const config = normalizeConfig(body?.config || {});
    const result = await runQuizGeneration(config);
    const rendered = await renderQuizExports(result.quizJson);

    return NextResponse.json({
      quizJson: result.quizJson,
      htmlPreview: rendered.html,
      downloads: rendered.files,
      studentHtmlPreview: rendered.studentHtml,
      studentDownloads: rendered.studentFiles,
      scopeSummary: result.scopeSummary,
      retrieval: {
        selectedChunkCount: result.rankedChunks.length,
        selectedDocumentCount: result.selectedDocuments.length,
        chunkDocuments: Array.from(new Set(result.rankedChunks.map((chunk) => chunk.documentName)))
      }
    });
  } catch (error) {
    const message = String(error.message || error);
    if (message.startsWith("Review required before quiz generation")) {
      return NextResponse.json({ error: message }, { status: 422 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
