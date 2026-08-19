import {
  addTopicTag,
  createFolder,
  createSubject,
  createWorkspace,
  getGeneratedDocumentDownload,
  getUploadedDocumentDownload,
  listDocumentBlockTemplates,
  listWorkspaceTree,
  removeDocument,
  deleteDocumentBlockTemplate,
  removeFolder,
  removeSubject,
  removeTopicTag,
  removeWorkspace,
  reprocessStoredDocument,
  renameDocument,
  renameFolder,
  renameSubject,
  renameTopicTag,
  renameWorkspace,
  reviewDocumentExtraction,
  saveGeneratedQuizBundle,
  setSubjectColor,
  setTopicTagColor,
  setWorkspaceColor,
  saveDocumentBlockTemplate,
  updateDocumentMeta,
  updateDocumentContent,
  updateGeneratedDocumentContent,
  uploadTxtDocuments
} from "../../../lib/workspacesRepository";
import { getDemoOwnerUserId, isSupabaseConfigured } from "../../../lib/supabaseClient";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cfgError() {
  return NextResponse.json({
    error: "Supabase not configured",
    hint: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
  }, { status: 500 });
}

async function ok(ownerUserId, extra = {}) {
  const workspaces = await listWorkspaceTree(ownerUserId);
  return NextResponse.json({ workspaces, ...extra });
}

export async function GET() {
  if (!isSupabaseConfigured()) return cfgError();

  try {
    const ownerUserId = getDemoOwnerUserId();
    return await ok(ownerUserId);
  } catch (error) {
    return NextResponse.json({ error: String(error.message || error) }, { status: 500 });
  }
}

export async function POST(request) {
  if (!isSupabaseConfigured()) return cfgError();

  try {
    const ownerUserId = getDemoOwnerUserId();
    const body = await request.json();
    const action = body?.action;
    const payload = body?.payload || {};

    if (action === "createWorkspace") {
      const created = await createWorkspace(payload.name, ownerUserId);
      return await ok(ownerUserId, { created });
    }

    if (action === "renameWorkspace") {
      await renameWorkspace(payload.workspaceId, payload.nextName);
      return await ok(ownerUserId);
    }

    if (action === "setWorkspaceColor") {
      await setWorkspaceColor(payload.workspaceId, payload.color);
      return await ok(ownerUserId);
    }

    if (action === "removeWorkspace") {
      const removed = await removeWorkspace(payload.workspaceId, Boolean(payload.force));
      if (removed.requiresForce) {
        return NextResponse.json({
          error: "Workspace contains related data. Confirmation required.",
          requiresForce: true,
          cascade: removed.cascade
        }, { status: 409 });
      }
      return await ok(ownerUserId);
    }

    if (action === "createSubject") {
      const created = await createSubject(payload.workspaceId, payload.name);
      return await ok(ownerUserId, { created });
    }

    if (action === "renameSubject") {
      await renameSubject(payload.subjectId, payload.nextName);
      return await ok(ownerUserId);
    }

    if (action === "setSubjectColor") {
      await setSubjectColor(payload.subjectId, payload.color);
      return await ok(ownerUserId);
    }

    if (action === "removeSubject") {
      const removed = await removeSubject(payload.subjectId, Boolean(payload.force));
      if (removed.requiresForce) {
        return NextResponse.json({
          error: "Subject contains related data. Confirmation required.",
          requiresForce: true,
          cascade: removed.cascade
        }, { status: 409 });
      }
      return await ok(ownerUserId);
    }

    if (action === "createFolder") {
      const created = await createFolder(payload.subjectId, payload.name, payload.parentFolderId);
      return await ok(ownerUserId, { created });
    }

    if (action === "renameFolder") {
      await renameFolder(payload.folderId, payload.nextName);
      return await ok(ownerUserId);
    }

    if (action === "removeFolder") {
      await removeFolder(payload.folderId);
      return await ok(ownerUserId);
    }

    if (action === "addTopicTag") {
      await addTopicTag(payload.subjectId, payload.tag);
      return await ok(ownerUserId);
    }

    if (action === "renameTopicTag") {
      await renameTopicTag(payload.subjectId, payload.prevTag, payload.nextTag);
      return await ok(ownerUserId);
    }

    if (action === "removeTopicTag") {
      await removeTopicTag(payload.subjectId, payload.tag);
      return await ok(ownerUserId);
    }

    if (action === "setTopicTagColor") {
      await setTopicTagColor(payload.subjectId, payload.tag, payload.color);
      return await ok(ownerUserId);
    }

    if (action === "uploadDocuments") {
      const files = Array.isArray(payload.files) ? payload.files : [];
      const uploadResult = await uploadTxtDocuments(payload.subjectId, files, {
        folderIds: Array.isArray(payload.folderIds) ? payload.folderIds : [],
        tags: payload.tags || [],
        quality: payload.quality || {}
      });
      return await ok(ownerUserId, {
        uploadReport: uploadResult?.extractionReport || [],
        uploadedCount: Array.isArray(uploadResult?.uploaded) ? uploadResult.uploaded.length : 0,
        uploadedDocuments: Array.isArray(uploadResult?.uploaded) ? uploadResult.uploaded : [],
        reviewWorkflowAvailable: uploadResult?.reviewWorkflowAvailable !== false
      });
    }

    if (action === "saveGeneratedQuizDocument") {
      const savedDocument = await saveGeneratedQuizBundle(payload.subjectId, payload.file || {}, payload.downloads || {}, {
        folderIds: Array.isArray(payload.folderIds) ? payload.folderIds : [],
        tags: payload.tags || []
      });
      return await ok(ownerUserId, { savedDocument });
    }

    if (action === "updateGeneratedDocument") {
      const savedDocument = await updateGeneratedDocumentContent(payload.subjectId, payload.documentId, payload.file || {});
      return await ok(ownerUserId, { savedDocument });
    }

    if (action === "downloadGeneratedDocument") {
      const download = await getGeneratedDocumentDownload(payload.documentId, payload.format);
      return NextResponse.json({ download });
    }

    if (action === "downloadUploadedDocument") {
      const download = await getUploadedDocumentDownload(payload.documentId, payload.format);
      return NextResponse.json({ download });
    }

    if (action === "listDocumentBlockTemplates") {
      const templates = await listDocumentBlockTemplates(ownerUserId);
      return NextResponse.json({ templates });
    }

    if (action === "saveDocumentBlockTemplate") {
      const template = await saveDocumentBlockTemplate(ownerUserId, payload.template || {});
      const templates = await listDocumentBlockTemplates(ownerUserId);
      return NextResponse.json({ template, templates });
    }

    if (action === "deleteDocumentBlockTemplate") {
      await deleteDocumentBlockTemplate(ownerUserId, payload.templateId);
      const templates = await listDocumentBlockTemplates(ownerUserId);
      return NextResponse.json({ deleted: true, templates });
    }

    if (action === "renameDocument") {
      await renameDocument(payload.documentId, payload.nextName);
      return await ok(ownerUserId);
    }

    if (action === "removeDocument") {
      await removeDocument(payload.documentId);
      return await ok(ownerUserId);
    }

    if (action === "updateDocumentMeta") {
      await updateDocumentMeta(payload.subjectId, payload.documentId, {
        folderIds: Array.isArray(payload.folderIds) ? payload.folderIds : [],
        tags: payload.tags || []
      });
      return await ok(ownerUserId);
    }

    if (action === "updateDocumentContent") {
      const contentOptions = {
        correctedHtml: typeof payload.correctedHtml === "string" ? payload.correctedHtml : "",
        correctedContent: typeof payload.correctedContent === "string" ? payload.correctedContent : ""
      };

      if (Object.prototype.hasOwnProperty.call(payload || {}, "contentTemplateId")) {
        contentOptions.contentTemplateId = typeof payload.contentTemplateId === "string" ? payload.contentTemplateId : "";
      }
      if (Object.prototype.hasOwnProperty.call(payload || {}, "contentBlocksJson")) {
        contentOptions.contentBlocksJson = payload.contentBlocksJson;
      }
      if (Object.prototype.hasOwnProperty.call(payload || {}, "contentBlocksSchemaVersion")) {
        contentOptions.contentBlocksSchemaVersion = typeof payload.contentBlocksSchemaVersion === "string" ? payload.contentBlocksSchemaVersion : "";
      }

      const updated = await updateDocumentContent(payload.subjectId, payload.documentId, contentOptions);
      return await ok(ownerUserId, { updated });
    }

    if (action === "reviewDocumentExtraction") {
      const reviewed = await reviewDocumentExtraction(payload.subjectId, payload.documentId, {
        decision: payload.decision,
        correctedContent: payload.correctedContent,
        correctedHtml: payload.correctedHtml,
        addressedRiskIds: Array.isArray(payload.addressedRiskIds) ? payload.addressedRiskIds : null,
        autoApproveWhenAllAddressed: Boolean(payload.autoApproveWhenAllAddressed)
      });
      return await ok(ownerUserId, { reviewed });
    }

    if (action === "reprocessDocument") {
      const reprocessed = await reprocessStoredDocument(payload.subjectId, payload.documentId, {
        minConfidence: payload.minConfidence
      });
      return await ok(ownerUserId, { reprocessed });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    const errorMessage = String(error.message || error);
    if (errorMessage.startsWith("QUALITY_GATE_BLOCKED:")) {
      const payload = errorMessage.replace("QUALITY_GATE_BLOCKED:", "");
      let qualityReport = null;
      try {
        qualityReport = JSON.parse(payload);
      } catch {
        qualityReport = { summary: "Low-confidence extraction detected.", files: [] };
      }

      return NextResponse.json({
        error: qualityReport?.summary || "Low-confidence extraction requires manual review.",
        qualityReport
      }, { status: 422 });
    }
    return NextResponse.json({ error: String(error.message || error) }, { status: 500 });
  }
}
