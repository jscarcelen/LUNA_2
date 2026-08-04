import { createSupabaseAdminClient, getDemoOwnerUserId } from "./supabaseClient.js";

let folderHierarchySupported;

function dedupeTags(tags) {
  return Array.from(new Set((tags || []).map((tag) => String(tag).trim().toLowerCase()).filter(Boolean)));
}

async function ensureTopicTags(client, subjectId, tags) {
  const normalized = dedupeTags(tags);
  if (!normalized.length) return [];

  const { data: existing, error: existingError } = await client
    .from("topic_tags")
    .select("id, tag")
    .eq("subject_id", subjectId)
    .in("tag", normalized);

  if (existingError) throw existingError;

  const existingByTag = new Map((existing || []).map((row) => [row.tag, row.id]));
  const missing = normalized.filter((tag) => !existingByTag.has(tag));

  if (missing.length) {
    const { error: insertError } = await client
      .from("topic_tags")
      .insert(missing.map((tag) => ({ subject_id: subjectId, tag })));

    if (insertError) throw insertError;
  }

  const { data: allTags, error: allTagsError } = await client
    .from("topic_tags")
    .select("id, tag")
    .eq("subject_id", subjectId)
    .in("tag", normalized);

  if (allTagsError) throw allTagsError;
  return allTags || [];
}

async function supportsFolderHierarchy(client) {
  if (typeof folderHierarchySupported === "boolean") {
    return folderHierarchySupported;
  }

  const { data, error } = await client
    .from("information_schema.columns")
    .select("column_name")
    .eq("table_schema", "public")
    .eq("table_name", "folders")
    .eq("column_name", "parent_folder_id")
    .limit(1);

  if (error) {
    folderHierarchySupported = false;
    return folderHierarchySupported;
  }

  folderHierarchySupported = Boolean(data && data.length);
  return folderHierarchySupported;
}

export async function listWorkspaceTree(ownerUserId = getDemoOwnerUserId()) {
  const client = createSupabaseAdminClient();
  const hasFolderHierarchy = await supportsFolderHierarchy(client);

  const { data: workspaces, error: wsError } = await client
    .from("workspaces")
    .select("id, name, owner_user_id")
    .eq("owner_user_id", ownerUserId)
    .order("created_at", { ascending: true });

  if (wsError) throw wsError;
  if (!workspaces?.length) return [];

  const workspaceIds = workspaces.map((row) => row.id);

  const { data: subjects, error: subError } = await client
    .from("subjects")
    .select("id, workspace_id, name")
    .in("workspace_id", workspaceIds)
    .order("created_at", { ascending: true });
  if (subError) throw subError;

  const subjectIds = (subjects || []).map((row) => row.id);

  const [foldersRes, tagsRes, docsRes] = await Promise.all([
    subjectIds.length
      ? client
        .from("folders")
        .select(hasFolderHierarchy ? "id, subject_id, name, parent_folder_id" : "id, subject_id, name")
        .in("subject_id", subjectIds)
        .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    subjectIds.length
      ? client.from("topic_tags").select("id, subject_id, tag").in("subject_id", subjectIds).order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    subjectIds.length
      ? client.from("documents").select("id, subject_id, folder_id, name, content, preview, size_bytes").in("subject_id", subjectIds).order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null })
  ]);

  if (foldersRes.error) throw foldersRes.error;
  if (tagsRes.error) throw tagsRes.error;
  if (docsRes.error) throw docsRes.error;

  const docs = docsRes.data || [];
  const docIds = docs.map((row) => row.id);

  const docTagsRes = docIds.length
    ? await client
      .from("document_tags")
      .select("document_id, topic_tag_id, topic_tags(id, tag)")
      .in("document_id", docIds)
    : { data: [], error: null };

  if (docTagsRes.error) throw docTagsRes.error;

  const foldersBySubject = new Map();
  for (const folder of foldersRes.data || []) {
    const list = foldersBySubject.get(folder.subject_id) || [];
    list.push({ id: folder.id, name: folder.name, parentFolderId: folder.parent_folder_id || "", tags: [] });
    foldersBySubject.set(folder.subject_id, list);
  }

  const topicTagsBySubject = new Map();
  for (const tag of tagsRes.data || []) {
    const list = topicTagsBySubject.get(tag.subject_id) || [];
    list.push(tag.tag);
    topicTagsBySubject.set(tag.subject_id, list);
  }

  const tagsByDocId = new Map();
  for (const row of docTagsRes.data || []) {
    const list = tagsByDocId.get(row.document_id) || [];
    const tag = row.topic_tags?.tag;
    if (tag) list.push(tag);
    tagsByDocId.set(row.document_id, list);
  }

  const docsBySubject = new Map();
  for (const doc of docs) {
    const list = docsBySubject.get(doc.subject_id) || [];
    list.push({
      id: doc.id,
      name: doc.name,
      content: doc.content,
      preview: doc.preview,
      folderId: doc.folder_id || "",
      sizeLabel: `${(Number(doc.size_bytes || 0) / 1024).toFixed(1)} KB`,
      tags: tagsByDocId.get(doc.id) || []
    });
    docsBySubject.set(doc.subject_id, list);
  }

  const subjectsByWorkspace = new Map();
  for (const subject of subjects || []) {
    const list = subjectsByWorkspace.get(subject.workspace_id) || [];
    list.push({
      id: subject.id,
      name: subject.name,
      folders: foldersBySubject.get(subject.id) || [],
      topicTags: topicTagsBySubject.get(subject.id) || [],
      documents: docsBySubject.get(subject.id) || []
    });
    subjectsByWorkspace.set(subject.workspace_id, list);
  }

  return workspaces.map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    subjects: subjectsByWorkspace.get(workspace.id) || []
  }));
}

export async function createWorkspace(name, ownerUserId = getDemoOwnerUserId()) {
  const client = createSupabaseAdminClient();
  const { data, error } = await client
    .from("workspaces")
    .insert({ name: String(name).trim(), owner_user_id: ownerUserId })
    .select("id, name")
    .single();
  if (error) throw error;
  return data;
}

export async function renameWorkspace(workspaceId, nextName) {
  const client = createSupabaseAdminClient();
  const { error } = await client
    .from("workspaces")
    .update({ name: String(nextName).trim(), updated_at: new Date().toISOString() })
    .eq("id", workspaceId);
  if (error) throw error;
}

export async function removeWorkspace(workspaceId, force = false) {
  const client = createSupabaseAdminClient();

  const { data: subjects, error: subError } = await client
    .from("subjects")
    .select("id")
    .eq("workspace_id", workspaceId);
  if (subError) throw subError;

  const subjectIds = (subjects || []).map((row) => row.id);

  const [foldersRes, tagsRes, docsRes] = await Promise.all([
    subjectIds.length ? client.from("folders").select("id", { count: "exact", head: true }).in("subject_id", subjectIds) : Promise.resolve({ count: 0, error: null }),
    subjectIds.length ? client.from("topic_tags").select("id", { count: "exact", head: true }).in("subject_id", subjectIds) : Promise.resolve({ count: 0, error: null }),
    subjectIds.length ? client.from("documents").select("id", { count: "exact", head: true }).in("subject_id", subjectIds) : Promise.resolve({ count: 0, error: null })
  ]);

  if (foldersRes.error) throw foldersRes.error;
  if (tagsRes.error) throw tagsRes.error;
  if (docsRes.error) throw docsRes.error;

  const cascade = {
    subjects: subjectIds.length,
    folders: foldersRes.count || 0,
    topicTags: tagsRes.count || 0,
    documents: docsRes.count || 0
  };

  const hasCascadeData = cascade.subjects > 0 || cascade.folders > 0 || cascade.topicTags > 0 || cascade.documents > 0;
  if (hasCascadeData && !force) {
    return { requiresForce: true, cascade };
  }

  const { error } = await client.from("workspaces").delete().eq("id", workspaceId);
  if (error) throw error;
  return { requiresForce: false, cascade };
}

export async function createSubject(workspaceId, name) {
  const client = createSupabaseAdminClient();
  const { data, error } = await client
    .from("subjects")
    .insert({ workspace_id: workspaceId, name: String(name).trim() })
    .select("id, name")
    .single();
  if (error) throw error;
  return data;
}

export async function renameSubject(subjectId, nextName) {
  const client = createSupabaseAdminClient();
  const { error } = await client
    .from("subjects")
    .update({ name: String(nextName).trim(), updated_at: new Date().toISOString() })
    .eq("id", subjectId);
  if (error) throw error;
}

export async function removeSubject(subjectId, force = false) {
  const client = createSupabaseAdminClient();

  const [foldersRes, tagsRes, docsRes] = await Promise.all([
    client.from("folders").select("id", { count: "exact", head: true }).eq("subject_id", subjectId),
    client.from("topic_tags").select("id", { count: "exact", head: true }).eq("subject_id", subjectId),
    client.from("documents").select("id", { count: "exact", head: true }).eq("subject_id", subjectId)
  ]);

  if (foldersRes.error) throw foldersRes.error;
  if (tagsRes.error) throw tagsRes.error;
  if (docsRes.error) throw docsRes.error;

  const cascade = {
    folders: foldersRes.count || 0,
    topicTags: tagsRes.count || 0,
    documents: docsRes.count || 0
  };

  const hasCascadeData = cascade.folders > 0 || cascade.topicTags > 0 || cascade.documents > 0;
  if (hasCascadeData && !force) {
    return { requiresForce: true, cascade };
  }

  const { error } = await client.from("subjects").delete().eq("id", subjectId);
  if (error) throw error;
  return { requiresForce: false, cascade };
}

export async function createFolder(subjectId, name, parentFolderId = "") {
  const client = createSupabaseAdminClient();
  const hasFolderHierarchy = await supportsFolderHierarchy(client);

  if (parentFolderId && !hasFolderHierarchy) {
    throw new Error("Subfolders require migration 202608040002_add_folder_hierarchy.sql to be applied.");
  }

  const { data, error } = await client
    .from("folders")
    .insert(
      hasFolderHierarchy
        ? {
          subject_id: subjectId,
          name: String(name).trim(),
          parent_folder_id: parentFolderId ? String(parentFolderId) : null
        }
        : {
          subject_id: subjectId,
          name: String(name).trim()
        }
    )
    .select(hasFolderHierarchy ? "id, name, parent_folder_id" : "id, name")
    .single();
  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    parentFolderId: data.parent_folder_id || ""
  };
}

export async function renameFolder(folderId, nextName) {
  const client = createSupabaseAdminClient();
  const { error } = await client
    .from("folders")
    .update({ name: String(nextName).trim(), updated_at: new Date().toISOString() })
    .eq("id", folderId);
  if (error) throw error;
}

export async function removeFolder(folderId) {
  const client = createSupabaseAdminClient();
  // `documents.folder_id` uses ON DELETE SET NULL and child folders use ON DELETE CASCADE.
  const { error } = await client.from("folders").delete().eq("id", folderId);
  if (error) throw error;
}

export async function addTopicTag(subjectId, tag) {
  const client = createSupabaseAdminClient();
  const normalized = String(tag).trim().toLowerCase();
  const { error } = await client
    .from("topic_tags")
    .insert({ subject_id: subjectId, tag: normalized });

  if (error && error.code !== "23505") throw error;
}

export async function renameTopicTag(subjectId, prevTag, nextTag) {
  const client = createSupabaseAdminClient();
  const previous = String(prevTag).trim().toLowerCase();
  const next = String(nextTag).trim().toLowerCase();

  const { data: prevRow, error: findError } = await client
    .from("topic_tags")
    .select("id")
    .eq("subject_id", subjectId)
    .eq("tag", previous)
    .maybeSingle();
  if (findError) throw findError;
  if (!prevRow) return;

  const { error } = await client
    .from("topic_tags")
    .update({ tag: next, updated_at: new Date().toISOString() })
    .eq("id", prevRow.id);
  if (error && error.code !== "23505") throw error;
}

export async function removeTopicTag(subjectId, tag) {
  const client = createSupabaseAdminClient();
  const normalized = String(tag).trim().toLowerCase();
  const { data: row, error: findError } = await client
    .from("topic_tags")
    .select("id")
    .eq("subject_id", subjectId)
    .eq("tag", normalized)
    .maybeSingle();
  if (findError) throw findError;
  if (!row) return;

  const { error } = await client
    .from("topic_tags")
    .delete()
    .eq("id", row.id);
  if (error) throw error;
}

export async function uploadTxtDocuments(subjectId, files, options = {}) {
  const client = createSupabaseAdminClient();
  const folderId = options.folderId || null;
  const nowIso = new Date().toISOString();

  const toInsert = files.map((file) => {
    const name = String(file.name || "untitled.txt");
    const content = String(file.content || "");
    const preview = content.trim().slice(0, 180) || "(empty file)";
    const sizeBytes = Number(file.sizeBytes || Buffer.byteLength(content, "utf8") || 0);

    return {
      subject_id: subjectId,
      folder_id: folderId,
      name,
      content,
      preview,
      size_bytes: sizeBytes,
      updated_at: nowIso
    };
  });

  const { data: docs, error: docsError } = await client
    .from("documents")
    .insert(toInsert)
    .select("id");
  if (docsError) throw docsError;

  const tags = dedupeTags(options.tags || []);
  if (!tags.length || !docs?.length) return;

  const topicRows = await ensureTopicTags(client, subjectId, tags);
  const tagIds = topicRows.map((row) => row.id);

  const bridgeRows = [];
  for (const doc of docs) {
    for (const tagId of tagIds) {
      bridgeRows.push({ document_id: doc.id, topic_tag_id: tagId });
    }
  }

  const { error: tagsError } = await client.from("document_tags").insert(bridgeRows);
  if (tagsError) throw tagsError;
}

export async function renameDocument(documentId, nextName) {
  const client = createSupabaseAdminClient();
  const { error } = await client
    .from("documents")
    .update({ name: String(nextName).trim(), updated_at: new Date().toISOString() })
    .eq("id", documentId);
  if (error) throw error;
}

export async function removeDocument(documentId) {
  const client = createSupabaseAdminClient();
  const { error } = await client.from("documents").delete().eq("id", documentId);
  if (error) throw error;
}
