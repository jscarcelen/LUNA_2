import {
  addTopicTag,
  createFolder,
  createSubject,
  createWorkspace,
  getGeneratedDocumentDownload,
  getUploadedDocumentDownload,
  listWorkspaceTree,
  removeDocument,
  removeFolder,
  removeSubject,
  removeTopicTag,
  removeWorkspace,
  renameDocument,
  renameFolder,
  renameSubject,
  renameTopicTag,
  renameWorkspace,
  saveGeneratedQuizBundle,
  setSubjectColor,
  setTopicTagColor,
  setWorkspaceColor,
  updateDocumentMeta,
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
      await uploadTxtDocuments(payload.subjectId, files, {
        folderIds: Array.isArray(payload.folderIds) ? payload.folderIds : [],
        tags: payload.tags || []
      });
      return await ok(ownerUserId);
    }

    if (action === "saveGeneratedQuizDocument") {
      const savedDocument = await saveGeneratedQuizBundle(payload.subjectId, payload.file || {}, payload.downloads || {}, {
        folderIds: Array.isArray(payload.folderIds) ? payload.folderIds : [],
        tags: payload.tags || []
      });
      return await ok(ownerUserId, { savedDocument });
    }

    if (action === "downloadGeneratedDocument") {
      const download = await getGeneratedDocumentDownload(payload.documentId, payload.format);
      return NextResponse.json({ download });
    }

    if (action === "downloadUploadedDocument") {
      const download = await getUploadedDocumentDownload(payload.documentId);
      return NextResponse.json({ download });
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

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: String(error.message || error) }, { status: 500 });
  }
}
