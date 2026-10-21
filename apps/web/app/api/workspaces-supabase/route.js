import {
  addTopicTag,
  createFolder,
  createSubject,
  createWorkspace,
  getGeneratedDocumentDownload,
  getUploadedDocumentDownload,
  listDocumentBlockTemplates,
  listWorkspaceTree,
  moveDocument,
  moveFolder,
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
import { createSupabaseAdminClient, getDemoOwnerUserId, isSupabaseConfigured } from "../../../lib/supabaseClient";
import { accountIdForFresh, hasRevokedSession, ownerUserIdForFresh } from "../../../lib/session.js";
import { guardDemoAction, guardWorkspaceAction } from "../../../lib/workspaceGuard.js";
import { denyAnonymousAi } from "../../../lib/aiAccess.js";
import { denyOverStorage, meteredAi, setAiActivity } from "../../../lib/aiUsage.js";
import { loadGrantContext, purgeGrantsFor } from "../../../lib/grantsRepository.js";
import { loadExamDatesMap, syncPlanLinks } from "../../../lib/examDatesRepository.js";
import { listTreeWithShared } from "../../../lib/sharedTree.js";
import { extractAndSaveConcepts } from "../../../lib/conceptsRepository.js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // a long PDF is converted in page batches

function cfgError() {
  return NextResponse.json({
    error: "Supabase not configured",
    hint: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
  }, { status: 500 });
}

async function loadTree(ownerUserId) {
  // A real account also sees what was shared with it ("Shared with me / <owner>"); the demo owner never does.
  return ownerUserId !== getDemoOwnerUserId() ? listTreeWithShared(ownerUserId) : listWorkspaceTree(ownerUserId);
}

async function ok(ownerUserId, extra = {}) {
  return NextResponse.json({ workspaces: await loadTree(ownerUserId), ...extra });
}

export async function GET(request) {
  if (!isSupabaseConfigured()) return cfgError();

  try {
    if (await hasRevokedSession(request)) return NextResponse.json({ error: "Your session ended (the password was changed). Please log in again." }, { status: 401 });
    // A logged-in account sees its own workspaces (and always has at least one); anyone else gets the demo owner.
    const ownerUserId = await ownerUserIdForFresh(request);
    // One load (the tree used to be read twice: once to see whether it is empty, once to answer).
    let workspaces = await loadTree(ownerUserId);
    if (!workspaces.length && await accountIdForFresh(request)) {
      await createWorkspace("My workspace", ownerUserId);
      workspaces = await loadTree(ownerUserId);
    }
    return NextResponse.json({ workspaces });
  } catch (error) {
    return NextResponse.json({ error: String(error.message || error) }, { status: 500 });
  }
}

export const POST = meteredAi("readingFiles", async function POST(request) {
  if (!isSupabaseConfigured()) return cfgError();

  try {
    if (await hasRevokedSession(request)) return NextResponse.json({ error: "Your session ended (the password was changed). Please log in again." }, { status: 401 });
    const ownerUserId = await ownerUserIdForFresh(request);
    const body = await request.json();
    const action = body?.action;
    // Reading an upload is "reading files"; any other AI this route does (topics of a saved resource) is "concepts".
    if (action !== "uploadDocuments" && action !== "reprocessDocument") setAiActivity("concepts");
    let payload = body?.payload || {};
    // The owner whose data an action writes to: the account itself, or (for edits through a live share) the owner of the original.
    let dataOwnerId = ownerUserId;

    // Real accounts: every id in the request must be theirs or shared with them, and what they only
    // view (or received as a copy) stays read-only. (The public demo has one shared owner and no accounts,
    // so it is not checked.)
    const isAccount = Boolean(await accountIdForFresh(request));
    if (isAccount) {
      const verdict = await guardWorkspaceAction({ client: createSupabaseAdminClient(), action, payload, ownerUserId, loadGrantContext, loadExamDates: loadExamDatesMap });
      if (!verdict.ok) return NextResponse.json({ error: verdict.error }, { status: verdict.status });
      payload = verdict.payload;
      if (verdict.shared?.ownerId) dataOwnerId = verdict.shared.ownerId;
    } else {
      // Reading an upload uses the AI providers (PDF vision, formula OCR, concepts): an account is needed for that in production.
      if (action === "uploadDocuments" || action === "reprocessDocument") {
        const blocked = await denyAnonymousAi(request);
        if (blocked) return blocked;
      }
      // The public demo has no grants, but every id it names must still be the demo owner's own.
      const verdict = await guardDemoAction({ client: createSupabaseAdminClient(), payload, ownerUserId });
      if (!verdict.ok) return NextResponse.json({ error: verdict.error }, { status: verdict.status });
    }

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
      await purgeGrantsFor("subject", [payload.subjectId]).catch(() => {});
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

    if (action === "moveFolder") {
      // newParentFolderId "" = the root of targetSubjectId (or of the folder's own topic); any topic of the same workspace.
      const moved = await moveFolder(payload.folderId, payload.newParentFolderId || "", {
        targetSubjectId: payload.targetSubjectId || "",
        nextName: typeof payload.nextName === "string" ? payload.nextName : ""
      });
      return await ok(ownerUserId, { moved });
    }

    if (action === "moveDocument") {
      // documentId or documentIds (a multi-selection moves in one request); no target folder = the root of the topic.
      const documentIds = Array.isArray(payload.documentIds) && payload.documentIds.length ? payload.documentIds : [payload.documentId];
      const moved = await moveDocument(documentIds, {
        targetSubjectId: payload.targetSubjectId || "",
        targetFolderId: payload.targetFolderId || "",
        targetFolderIds: Array.isArray(payload.targetFolderIds) ? payload.targetFolderIds : []
      });
      return await ok(ownerUserId, { moved });
    }

    if (action === "removeFolder") {
      await removeFolder(payload.folderId);
      await purgeGrantsFor("folder", [payload.folderId]).catch(() => {});
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
      // A full account (its own files, or the owner's when uploading into a shared folder) cannot add more.
      if (isAccount) {
        const full = await denyOverStorage(dataOwnerId, request);
        if (full) return full;
      }
      const files = Array.isArray(payload.files) ? payload.files : [];
      const uploadResult = await uploadTxtDocuments(payload.subjectId, files, {
        folderIds: Array.isArray(payload.folderIds) ? payload.folderIds : [],
        tags: payload.tags || [],
        quality: payload.quality || {}
      });

      // Async concept extraction for uploaded reference documents — non-blocking
      const uploaded = Array.isArray(uploadResult?.uploaded) ? uploadResult.uploaded : [];
      const workspaceId = payload.workspaceId || "";
      if (workspaceId && uploaded.length > 0) {
        Promise.allSettled(
          uploaded.map((doc) => {
            if (!doc?.id) return Promise.resolve();
            const text = doc.extractedText || doc.content || "";
            if (!text || String(text).length < 100) return Promise.resolve();
            return extractAndSaveConcepts(doc.id, workspaceId, dataOwnerId, String(text));
          })
        ).catch(() => {}); // swallow — never let this break the upload response
      }

      return await ok(ownerUserId, {
        uploadReport: uploadResult?.extractionReport || [],
        uploadedCount: uploaded.length,
        uploadedDocuments: uploaded,
        reviewWorkflowAvailable: uploadResult?.reviewWorkflowAvailable !== false
      });
    }

    if (action === "saveGeneratedQuizDocument") {
      const savedDocument = await saveGeneratedQuizBundle(payload.subjectId, payload.file || {}, payload.downloads || {}, {
        folderIds: Array.isArray(payload.folderIds) ? payload.folderIds : [],
        tags: payload.tags || []
      });
      // A new plan that follows a teacher's exam date is linked to it, so the date's changes reach the plan.
      if (isAccount && savedDocument?.id) await syncPlanLinks(ownerUserId, savedDocument.id, payload.file?.content);
      return await ok(ownerUserId, { savedDocument });
    }

    if (action === "updateGeneratedDocument") {
      const savedDocument = await updateGeneratedDocumentContent(payload.subjectId, payload.documentId, payload.file || {});
      if (isAccount && dataOwnerId === ownerUserId) await syncPlanLinks(ownerUserId, payload.documentId, payload.file?.content);
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
      await purgeGrantsFor("document", [payload.documentId]).catch(() => {}); // the original is gone: so are the shares of it
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
    // A refused move (wrong workspace, a folder into itself...) is the person's to fix, not a server fault.
    const refused = error?.name === "MoveError" && Number(error.status) >= 400 && Number(error.status) < 500;
    return NextResponse.json({ error: String(error.message || error) }, { status: refused ? Number(error.status) : 500 });
  }
});
