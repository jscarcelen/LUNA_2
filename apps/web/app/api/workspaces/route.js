import { NextResponse } from "next/server";
import { readWorkspaces, uid, writeWorkspaces } from "../../../lib/mockStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function updateSubject(workspaces, workspaceId, subjectId, updater) {
  return workspaces.map((workspace) => {
    if (workspace.id !== workspaceId) return workspace;
    return {
      ...workspace,
      subjects: workspace.subjects.map((subject) => {
        if (subject.id !== subjectId) return subject;
        return updater(subject);
      })
    };
  });
}

function getSubjectCascadeCounts(subject) {
  return {
    folders: subject.folders?.length || 0,
    topicTags: subject.topicTags?.length || 0,
    documents: subject.documents?.length || 0
  };
}

function getWorkspaceCascadeCounts(workspace) {
  const subjects = workspace.subjects || [];
  return subjects.reduce((acc, subject) => {
    const counts = getSubjectCascadeCounts(subject);
    return {
      subjects: acc.subjects + 1,
      folders: acc.folders + counts.folders,
      topicTags: acc.topicTags + counts.topicTags,
      documents: acc.documents + counts.documents
    };
  }, { subjects: 0, folders: 0, topicTags: 0, documents: 0 });
}

export async function GET() {
  try {
    const workspaces = await readWorkspaces();
    return NextResponse.json({ workspaces });
  } catch (error) {
    return NextResponse.json({ error: "Failed to read workspaces", detail: String(error) }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const action = body?.action;
    const payload = body?.payload || {};
    let workspaces = await readWorkspaces();

    if (action === "createWorkspace") {
      const name = String(payload.name || "").trim();
      if (!name) return NextResponse.json({ error: "Workspace name is required" }, { status: 400 });
      const created = { id: uid("ws"), name, subjects: [] };
      workspaces = [...workspaces, created];
      await writeWorkspaces(workspaces);
      return NextResponse.json({ workspaces, created });
    }

    if (action === "renameWorkspace") {
      const workspaceId = String(payload.workspaceId || "");
      const nextName = String(payload.nextName || "").trim();
      if (!workspaceId || !nextName) {
        return NextResponse.json({ error: "workspaceId and nextName are required" }, { status: 400 });
      }
      workspaces = workspaces.map((workspace) => {
        if (workspace.id !== workspaceId) return workspace;
        return { ...workspace, name: nextName };
      });
      await writeWorkspaces(workspaces);
      return NextResponse.json({ workspaces });
    }

    if (action === "removeWorkspace") {
      const workspaceId = String(payload.workspaceId || "");
      const force = Boolean(payload.force);
      if (!workspaceId) {
        return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
      }
      const target = workspaces.find((workspace) => workspace.id === workspaceId);
      if (!target) {
        return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
      }

      const cascade = getWorkspaceCascadeCounts(target);
      const hasCascadeData = cascade.subjects > 0 || cascade.folders > 0 || cascade.topicTags > 0 || cascade.documents > 0;
      if (hasCascadeData && !force) {
        return NextResponse.json({
          error: "Workspace contains related data. Confirmation required.",
          requiresForce: true,
          cascade
        }, { status: 409 });
      }

      workspaces = workspaces.filter((workspace) => workspace.id !== workspaceId);
      await writeWorkspaces(workspaces);
      return NextResponse.json({ workspaces });
    }

    if (action === "createSubject") {
      const workspaceId = String(payload.workspaceId || "");
      const name = String(payload.name || "").trim();
      if (!workspaceId || !name) {
        return NextResponse.json({ error: "workspaceId and subject name are required" }, { status: 400 });
      }
      const subject = { id: uid("sub"), name, topicTags: [], folders: [], documents: [] };
      workspaces = workspaces.map((workspace) => {
        if (workspace.id !== workspaceId) return workspace;
        return { ...workspace, subjects: [...workspace.subjects, subject] };
      });
      await writeWorkspaces(workspaces);
      return NextResponse.json({ workspaces, created: subject });
    }

    if (action === "renameSubject") {
      const workspaceId = String(payload.workspaceId || "");
      const subjectId = String(payload.subjectId || "");
      const nextName = String(payload.nextName || "").trim();
      if (!workspaceId || !subjectId || !nextName) {
        return NextResponse.json({ error: "workspaceId, subjectId and nextName are required" }, { status: 400 });
      }

      workspaces = updateSubject(workspaces, workspaceId, subjectId, (subject) => ({
        ...subject,
        name: nextName
      }));
      await writeWorkspaces(workspaces);
      return NextResponse.json({ workspaces });
    }

    if (action === "removeSubject") {
      const workspaceId = String(payload.workspaceId || "");
      const subjectId = String(payload.subjectId || "");
      const force = Boolean(payload.force);
      if (!workspaceId || !subjectId) {
        return NextResponse.json({ error: "workspaceId and subjectId are required" }, { status: 400 });
      }

      const workspace = workspaces.find((item) => item.id === workspaceId);
      const subject = workspace?.subjects?.find((item) => item.id === subjectId);
      if (!workspace || !subject) {
        return NextResponse.json({ error: "Subject not found" }, { status: 404 });
      }

      const cascade = getSubjectCascadeCounts(subject);
      const hasCascadeData = cascade.folders > 0 || cascade.topicTags > 0 || cascade.documents > 0;
      if (hasCascadeData && !force) {
        return NextResponse.json({
          error: "Subject contains related data. Confirmation required.",
          requiresForce: true,
          cascade
        }, { status: 409 });
      }

      workspaces = workspaces.map((item) => {
        if (item.id !== workspaceId) return item;
        return {
          ...item,
          subjects: item.subjects.filter((subj) => subj.id !== subjectId)
        };
      });
      await writeWorkspaces(workspaces);
      return NextResponse.json({ workspaces });
    }

    if (action === "createFolder") {
      const workspaceId = String(payload.workspaceId || "");
      const subjectId = String(payload.subjectId || "");
      const name = String(payload.name || "").trim();
      if (!workspaceId || !subjectId || !name) {
        return NextResponse.json({ error: "workspaceId, subjectId and folder name are required" }, { status: 400 });
      }
      const folder = { id: uid("fld"), name, tags: [] };
      workspaces = updateSubject(workspaces, workspaceId, subjectId, (subject) => ({
        ...subject,
        folders: [...subject.folders, folder]
      }));
      await writeWorkspaces(workspaces);
      return NextResponse.json({ workspaces, created: folder });
    }

    if (action === "renameFolder") {
      const workspaceId = String(payload.workspaceId || "");
      const subjectId = String(payload.subjectId || "");
      const folderId = String(payload.folderId || "");
      const nextName = String(payload.nextName || "").trim();
      if (!workspaceId || !subjectId || !folderId || !nextName) {
        return NextResponse.json({ error: "workspaceId, subjectId, folderId and nextName are required" }, { status: 400 });
      }

      workspaces = updateSubject(workspaces, workspaceId, subjectId, (subject) => ({
        ...subject,
        folders: subject.folders.map((folder) => {
          if (folder.id !== folderId) return folder;
          return { ...folder, name: nextName };
        })
      }));
      await writeWorkspaces(workspaces);
      return NextResponse.json({ workspaces });
    }

    if (action === "removeFolder") {
      const workspaceId = String(payload.workspaceId || "");
      const subjectId = String(payload.subjectId || "");
      const folderId = String(payload.folderId || "");
      if (!workspaceId || !subjectId || !folderId) {
        return NextResponse.json({ error: "workspaceId, subjectId and folderId are required" }, { status: 400 });
      }

      workspaces = updateSubject(workspaces, workspaceId, subjectId, (subject) => ({
        ...subject,
        folders: subject.folders.filter((folder) => folder.id !== folderId),
        documents: subject.documents.map((document) => {
          if (document.folderId !== folderId) return document;
          return { ...document, folderId: "" };
        })
      }));
      await writeWorkspaces(workspaces);
      return NextResponse.json({ workspaces });
    }

    if (action === "addTopicTag") {
      const workspaceId = String(payload.workspaceId || "");
      const subjectId = String(payload.subjectId || "");
      const tag = String(payload.tag || "").trim().toLowerCase();
      if (!workspaceId || !subjectId || !tag) {
        return NextResponse.json({ error: "workspaceId, subjectId and tag are required" }, { status: 400 });
      }
      workspaces = updateSubject(workspaces, workspaceId, subjectId, (subject) => ({
        ...subject,
        topicTags: subject.topicTags.includes(tag) ? subject.topicTags : [...subject.topicTags, tag]
      }));
      await writeWorkspaces(workspaces);
      return NextResponse.json({ workspaces });
    }

    if (action === "renameTopicTag") {
      const workspaceId = String(payload.workspaceId || "");
      const subjectId = String(payload.subjectId || "");
      const prevTag = String(payload.prevTag || "").trim().toLowerCase();
      const nextTag = String(payload.nextTag || "").trim().toLowerCase();
      if (!workspaceId || !subjectId || !prevTag || !nextTag) {
        return NextResponse.json({ error: "workspaceId, subjectId, prevTag and nextTag are required" }, { status: 400 });
      }

      workspaces = updateSubject(workspaces, workspaceId, subjectId, (subject) => ({
        ...subject,
        topicTags: subject.topicTags.map((tag) => (tag === prevTag ? nextTag : tag)).filter((tag, index, arr) => arr.indexOf(tag) === index),
        documents: subject.documents.map((document) => {
          const nextTags = (document.tags || []).map((tag) => (tag === prevTag ? nextTag : tag));
          return { ...document, tags: nextTags.filter((tag, index, arr) => arr.indexOf(tag) === index) };
        })
      }));
      await writeWorkspaces(workspaces);
      return NextResponse.json({ workspaces });
    }

    if (action === "removeTopicTag") {
      const workspaceId = String(payload.workspaceId || "");
      const subjectId = String(payload.subjectId || "");
      const tag = String(payload.tag || "").trim().toLowerCase();
      if (!workspaceId || !subjectId || !tag) {
        return NextResponse.json({ error: "workspaceId, subjectId and tag are required" }, { status: 400 });
      }

      workspaces = updateSubject(workspaces, workspaceId, subjectId, (subject) => ({
        ...subject,
        topicTags: subject.topicTags.filter((item) => item !== tag),
        documents: subject.documents.map((document) => ({
          ...document,
          tags: (document.tags || []).filter((item) => item !== tag)
        }))
      }));
      await writeWorkspaces(workspaces);
      return NextResponse.json({ workspaces });
    }

    if (action === "uploadDocuments") {
      const workspaceId = String(payload.workspaceId || "");
      const subjectId = String(payload.subjectId || "");
      const folderId = String(payload.folderId || "");
      const tags = Array.isArray(payload.tags) ? payload.tags.map((item) => String(item).trim().toLowerCase()).filter(Boolean) : [];
      const files = Array.isArray(payload.files) ? payload.files : [];
      if (!workspaceId || !subjectId || !files.length) {
        return NextResponse.json({ error: "workspaceId, subjectId and files are required" }, { status: 400 });
      }

      const documents = files.map((file) => {
        const name = String(file.name || "untitled.txt");
        const content = String(file.content || "");
        const preview = content.trim().slice(0, 180) || "(empty file)";
        const sizeLabel = String(file.sizeLabel || "0.0 KB");
        return {
          id: uid("doc"),
          name,
          sizeLabel,
          preview,
          content,
          folderId,
          tags
        };
      });

      workspaces = updateSubject(workspaces, workspaceId, subjectId, (subject) => ({
        ...subject,
        documents: [...documents, ...subject.documents]
      }));
      await writeWorkspaces(workspaces);
      return NextResponse.json({ workspaces, created: documents });
    }

    if (action === "renameDocument") {
      const workspaceId = String(payload.workspaceId || "");
      const subjectId = String(payload.subjectId || "");
      const documentId = String(payload.documentId || "");
      const nextName = String(payload.nextName || "").trim();
      if (!workspaceId || !subjectId || !documentId || !nextName) {
        return NextResponse.json({ error: "workspaceId, subjectId, documentId and nextName are required" }, { status: 400 });
      }

      workspaces = updateSubject(workspaces, workspaceId, subjectId, (subject) => ({
        ...subject,
        documents: subject.documents.map((document) => {
          if (document.id !== documentId) return document;
          return { ...document, name: nextName };
        })
      }));
      await writeWorkspaces(workspaces);
      return NextResponse.json({ workspaces });
    }

    if (action === "removeDocument") {
      const workspaceId = String(payload.workspaceId || "");
      const subjectId = String(payload.subjectId || "");
      const documentId = String(payload.documentId || "");
      if (!workspaceId || !subjectId || !documentId) {
        return NextResponse.json({ error: "workspaceId, subjectId and documentId are required" }, { status: 400 });
      }

      workspaces = updateSubject(workspaces, workspaceId, subjectId, (subject) => ({
        ...subject,
        documents: subject.documents.filter((document) => document.id !== documentId)
      }));
      await writeWorkspaces(workspaces);
      return NextResponse.json({ workspaces });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to process action", detail: String(error) }, { status: 500 });
  }
}
