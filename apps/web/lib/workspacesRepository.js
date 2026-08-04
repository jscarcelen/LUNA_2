import { createSupabaseAdminClient, getDemoOwnerUserId, isSupabaseConfigured } from "./supabaseClient.js";
import {
  DEFAULT_DOCUMENT_SOURCE_TYPE,
  DEFAULT_SUBJECT_COLOR,
  DEFAULT_WORKSPACE_COLOR,
  normalizeSubjectColor,
  normalizeSubjectName,
  normalizeWorkspaceColor,
  normalizeWorkspaceName,
  DEFAULT_TOPIC_TAG_COLOR,
  dedupeTagNames,
  normalizeTagName,
  normalizeTopicTagColor,
  normalizeDocumentMeta,
  normalizeDocumentName,
  normalizeDocumentSourceType,
  normalizeFolderIds
} from "../modules/core/contracts.js";
import {
  chunkDocument,
  DEFAULT_CHUNK_WORDS,
  DEFAULT_OVERLAP_WORDS
} from "../modules/ai-tools/pipeline/chunking.js";
import {
  embedQuery,
  embedTexts,
  isEmbeddingProviderConfigured,
  toVectorLiteral
} from "../modules/ai-tools/pipeline/embeddings.js";

let folderHierarchySupported;
let documentFoldersSupported;
let documentChunksSupported;
let documentChunkEmbeddingsSupported;
let documentSourceTypeSupported;
let generatedDocumentExportsSupported;
let topicTagColorSupported;
let workspaceColorSupported;
let subjectColorSupported;

const GENERATED_QUIZ_NAME_PREFIX = "Generated Quiz - ";
const GENERATED_DOCUMENT_BUNDLE_VERSION = "generated-document-bundle-v1";

async function ensureTopicTags(client, subjectId, tags) {
  const hasTopicTagColor = await supportsTopicTagColor(client);
  const normalized = dedupeTagNames(tags);
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
    .select(hasTopicTagColor ? "id, tag, color" : "id, tag")
    .eq("subject_id", subjectId)
    .in("tag", normalized);

  if (allTagsError) throw allTagsError;
  return allTags || [];
}

async function supportsFolderHierarchy(client) {
  if (typeof folderHierarchySupported === "boolean") {
    return folderHierarchySupported;
  }

  const { error } = await client
    .from("folders")
    .select("parent_folder_id")
    .limit(1);

  folderHierarchySupported = !error;
  return folderHierarchySupported;
}

async function supportsDocumentFolders(client) {
  if (typeof documentFoldersSupported === "boolean") {
    return documentFoldersSupported;
  }

  const { error } = await client
    .from("document_folders")
    .select("document_id")
    .limit(1);

  documentFoldersSupported = !error;
  return documentFoldersSupported;
}

async function supportsDocumentChunks(client) {
  if (typeof documentChunksSupported === "boolean") {
    return documentChunksSupported;
  }

  const { error } = await client
    .from("document_chunks")
    .select("document_id")
    .limit(1);

  documentChunksSupported = !error;
  return documentChunksSupported;
}

async function supportsDocumentChunkEmbeddings(client) {
  if (typeof documentChunkEmbeddingsSupported === "boolean") {
    return documentChunkEmbeddingsSupported;
  }

  const { error } = await client
    .from("document_chunks")
    .select("embedding")
    .limit(1);

  documentChunkEmbeddingsSupported = !error;
  return documentChunkEmbeddingsSupported;
}

async function supportsDocumentSourceType(client) {
  if (typeof documentSourceTypeSupported === "boolean") {
    return documentSourceTypeSupported;
  }

  const { error } = await client
    .from("documents")
    .select("source_type")
    .limit(1);

  documentSourceTypeSupported = !error;
  return documentSourceTypeSupported;
}

async function supportsGeneratedDocumentExports(client) {
  if (typeof generatedDocumentExportsSupported === "boolean") {
    return generatedDocumentExportsSupported;
  }

  const { error } = await client
    .from("generated_document_exports")
    .select("document_id")
    .limit(1);

  generatedDocumentExportsSupported = !error;
  return generatedDocumentExportsSupported;
}

function getGeneratedExportSpec(format) {
  const normalized = String(format || "").trim().toLowerCase();
  if (normalized === "html") {
    return { format: "html", extension: "html", mimeType: "text/html" };
  }
  if (normalized === "json") {
    return { format: "json", extension: "json", mimeType: "application/json" };
  }
  if (normalized === "docx") {
    return { format: "docx", extension: "docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  }
  if (normalized === "pdf") {
    return { format: "pdf", extension: "pdf", mimeType: "application/pdf" };
  }
  return { format: "txt", extension: "txt", mimeType: "text/plain" };
}

function withFileExtension(name, extension) {
  const baseName = String(name || "Generated Quiz").trim().replace(/\.[^.]+$/, "") || "Generated Quiz";
  return `${baseName}.${extension}`;
}

function getExtensionFromName(name, fallback = "txt") {
  const match = String(name || "").trim().toLowerCase().match(/\.([a-z0-9]+)$/i);
  return match?.[1] || fallback;
}

function getMimeTypeForExtension(extension) {
  const normalized = String(extension || "").trim().toLowerCase();
  if (normalized === "html" || normalized === "htm") return "text/html";
  if (normalized === "json") return "application/json";
  if (normalized === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (normalized === "pdf") return "application/pdf";
  if (normalized === "md") return "text/markdown";
  if (normalized === "csv") return "text/csv";
  return "text/plain";
}

function buildGeneratedDocumentBundle({ plainText, downloads }) {
  return JSON.stringify({
    version: GENERATED_DOCUMENT_BUNDLE_VERSION,
    plainText: String(plainText || ""),
    downloads: Object.fromEntries(
      Object.entries(downloads || {}).map(([format, contentBase64]) => {
        const spec = getGeneratedExportSpec(format);
        return [spec.format, {
          mimeType: spec.mimeType,
          extension: spec.extension,
          contentBase64: String(contentBase64 || "")
        }];
      }).filter(([, entry]) => entry.contentBase64)
    )
  });
}

function parseGeneratedDocumentBundle(content) {
  const text = String(content || "").trim();
  if (!text.startsWith("{")) return null;

  try {
    const parsed = JSON.parse(text);
    if (parsed?.version !== GENERATED_DOCUMENT_BUNDLE_VERSION || typeof parsed?.plainText !== "string" || typeof parsed?.downloads !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function inferDocumentSourceType(row) {
  const explicit = normalizeDocumentSourceType(row?.source_type || row?.sourceType || DEFAULT_DOCUMENT_SOURCE_TYPE);
  if (row?.source_type || row?.sourceType) return explicit;

  const name = String(row?.name || "").trim();
  return name.startsWith(GENERATED_QUIZ_NAME_PREFIX) ? "generated" : DEFAULT_DOCUMENT_SOURCE_TYPE;
}

async function supportsTopicTagColor(client) {
  if (typeof topicTagColorSupported === "boolean") {
    return topicTagColorSupported;
  }

  const { error } = await client
    .from("topic_tags")
    .select("color")
    .limit(1);

  topicTagColorSupported = !error;
  return topicTagColorSupported;
}

async function supportsWorkspaceColor(client) {
  if (typeof workspaceColorSupported === "boolean") {
    return workspaceColorSupported;
  }

  const { error } = await client
    .from("workspaces")
    .select("color")
    .limit(1);

  workspaceColorSupported = !error;
  return workspaceColorSupported;
}

async function supportsSubjectColor(client) {
  if (typeof subjectColorSupported === "boolean") {
    return subjectColorSupported;
  }

  const { error } = await client
    .from("subjects")
    .select("color")
    .limit(1);

  subjectColorSupported = !error;
  return subjectColorSupported;
}

export async function listWorkspaceTree(ownerUserId = getDemoOwnerUserId()) {
  const client = createSupabaseAdminClient();
  const hasFolderHierarchy = await supportsFolderHierarchy(client);
  const hasDocumentFolders = await supportsDocumentFolders(client);
  const hasDocumentSourceType = await supportsDocumentSourceType(client);
  const hasGeneratedDocumentExports = await supportsGeneratedDocumentExports(client);
  const hasTopicTagColor = await supportsTopicTagColor(client);
  const hasWorkspaceColor = await supportsWorkspaceColor(client);
  const hasSubjectColor = await supportsSubjectColor(client);

  const { data: workspaces, error: wsError } = await client
    .from("workspaces")
    .select(hasWorkspaceColor ? "id, name, color, owner_user_id" : "id, name, owner_user_id")
    .eq("owner_user_id", ownerUserId)
    .order("created_at", { ascending: true });

  if (wsError) throw wsError;
  if (!workspaces?.length) return [];

  const workspaceIds = workspaces.map((row) => row.id);

  const { data: subjects, error: subError } = await client
    .from("subjects")
    .select(hasSubjectColor ? "id, workspace_id, name, color" : "id, workspace_id, name")
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
      ? client.from("topic_tags").select(hasTopicTagColor ? "id, subject_id, tag, color" : "id, subject_id, tag").in("subject_id", subjectIds).order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    subjectIds.length
      ? client.from("documents").select(hasDocumentSourceType ? "id, subject_id, folder_id, name, content, preview, size_bytes, source_type" : "id, subject_id, folder_id, name, content, preview, size_bytes").in("subject_id", subjectIds).order("created_at", { ascending: false })
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

  const docFoldersRes = docIds.length && hasDocumentFolders
    ? await client
      .from("document_folders")
      .select("document_id, folder_id")
      .in("document_id", docIds)
    : { data: [], error: null };

  if (docTagsRes.error) throw docTagsRes.error;
  if (docFoldersRes.error) throw docFoldersRes.error;

  const generatedExportRes = docIds.length && hasGeneratedDocumentExports
    ? await client
      .from("generated_document_exports")
      .select("document_id, format")
      .in("document_id", docIds)
    : { data: [], error: null };

  if (generatedExportRes.error) throw generatedExportRes.error;

  const foldersBySubject = new Map();
  for (const folder of foldersRes.data || []) {
    const list = foldersBySubject.get(folder.subject_id) || [];
    list.push({ id: folder.id, name: folder.name, parentFolderId: folder.parent_folder_id || "", tags: [] });
    foldersBySubject.set(folder.subject_id, list);
  }

  const topicTagsBySubject = new Map();
  for (const tag of tagsRes.data || []) {
    const list = topicTagsBySubject.get(tag.subject_id) || [];
    list.push({
      name: tag.tag,
      color: tag.color || DEFAULT_TOPIC_TAG_COLOR
    });
    topicTagsBySubject.set(tag.subject_id, list);
  }

  const tagsByDocId = new Map();
  for (const row of docTagsRes.data || []) {
    const list = tagsByDocId.get(row.document_id) || [];
    const tag = row.topic_tags?.tag;
    if (tag) list.push(tag);
    tagsByDocId.set(row.document_id, list);
  }

  const folderIdsByDocId = new Map();
  for (const row of docFoldersRes.data || []) {
    const list = folderIdsByDocId.get(row.document_id) || [];
    if (row.folder_id) list.push(row.folder_id);
    folderIdsByDocId.set(row.document_id, list);
  }

  const exportFormatsByDocId = new Map();
  for (const row of generatedExportRes.data || []) {
    const list = exportFormatsByDocId.get(row.document_id) || [];
    list.push(String(row.format || "").trim().toLowerCase());
    exportFormatsByDocId.set(row.document_id, list);
  }

  const docsBySubject = new Map();
  for (const doc of docs) {
    const list = docsBySubject.get(doc.subject_id) || [];
    const mappedFolderIds = hasDocumentFolders ? normalizeFolderIds(folderIdsByDocId.get(doc.id) || []) : [];
    const folderIds = mappedFolderIds.length ? mappedFolderIds : normalizeFolderIds([doc.folder_id || ""]);
    const sourceType = inferDocumentSourceType(doc);
    const bundle = sourceType === "generated" ? parseGeneratedDocumentBundle(doc.content) : null;
    const availableFormats = sourceType === "generated"
      ? Array.from(new Set([...(bundle ? Object.keys(bundle.downloads || {}) : []), ...(exportFormatsByDocId.get(doc.id) || []), "txt"]))
      : [getExtensionFromName(doc.name, "txt")];
    const displayContent = bundle?.plainText || doc.content;
    list.push({
      id: doc.id,
      name: doc.name,
      content: displayContent,
      preview: doc.preview,
      folderId: folderIds[0] || "",
      folderIds,
      sizeLabel: `${(Number(doc.size_bytes || 0) / 1024).toFixed(1)} KB`,
      sourceType,
      availableFormats,
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
      color: subject.color || DEFAULT_SUBJECT_COLOR,
      folders: foldersBySubject.get(subject.id) || [],
      topicTags: topicTagsBySubject.get(subject.id) || [],
      documents: docsBySubject.get(subject.id) || []
    });
    subjectsByWorkspace.set(subject.workspace_id, list);
  }

  return workspaces.map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    color: workspace.color || DEFAULT_WORKSPACE_COLOR,
    subjects: subjectsByWorkspace.get(workspace.id) || []
  }));
}

export async function createWorkspace(name, ownerUserId = getDemoOwnerUserId()) {
  const client = createSupabaseAdminClient();
  const hasWorkspaceColor = await supportsWorkspaceColor(client);
  const normalizedName = normalizeWorkspaceName(name);
  const { data, error } = await client
    .from("workspaces")
    .insert(hasWorkspaceColor
      ? { name: normalizedName, owner_user_id: ownerUserId, color: DEFAULT_WORKSPACE_COLOR }
      : { name: normalizedName, owner_user_id: ownerUserId })
    .select(hasWorkspaceColor ? "id, name, color" : "id, name")
    .single();
  if (error) throw error;
  return data;
}

export async function renameWorkspace(workspaceId, nextName) {
  const client = createSupabaseAdminClient();
  const { error } = await client
    .from("workspaces")
    .update({ name: normalizeWorkspaceName(nextName), updated_at: new Date().toISOString() })
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
  const hasSubjectColor = await supportsSubjectColor(client);
  const normalizedName = normalizeSubjectName(name);
  const { data, error } = await client
    .from("subjects")
    .insert(hasSubjectColor
      ? { workspace_id: workspaceId, name: normalizedName, color: DEFAULT_SUBJECT_COLOR }
      : { workspace_id: workspaceId, name: normalizedName })
    .select(hasSubjectColor ? "id, name, color" : "id, name")
    .single();
  if (error) throw error;
  return data;
}

export async function setWorkspaceColor(workspaceId, color) {
  const client = createSupabaseAdminClient();
  const hasWorkspaceColor = await supportsWorkspaceColor(client);
  if (!hasWorkspaceColor) {
    throw new Error("Workspace colors require migration 202608040005_add_workspace_subject_color.sql to be applied.");
  }

  const nextColor = normalizeWorkspaceColor(color);
  const { error } = await client
    .from("workspaces")
    .update({ color: nextColor, updated_at: new Date().toISOString() })
    .eq("id", workspaceId);
  if (error) throw error;
}

export async function setSubjectColor(subjectId, color) {
  const client = createSupabaseAdminClient();
  const hasSubjectColor = await supportsSubjectColor(client);
  if (!hasSubjectColor) {
    throw new Error("Subject colors require migration 202608040005_add_workspace_subject_color.sql to be applied.");
  }

  const nextColor = normalizeSubjectColor(color);
  const { error } = await client
    .from("subjects")
    .update({ color: nextColor, updated_at: new Date().toISOString() })
    .eq("id", subjectId);
  if (error) throw error;
}

export async function renameSubject(subjectId, nextName) {
  const client = createSupabaseAdminClient();
  const { error } = await client
    .from("subjects")
    .update({ name: normalizeSubjectName(nextName), updated_at: new Date().toISOString() })
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
          name: normalizeSubjectName(name),
          parent_folder_id: parentFolderId ? String(parentFolderId) : null
        }
        : {
          subject_id: subjectId,
          name: normalizeSubjectName(name)
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
    .update({ name: normalizeSubjectName(nextName), updated_at: new Date().toISOString() })
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
  const normalized = normalizeTagName(tag);
  const { error } = await client
    .from("topic_tags")
    .insert({ subject_id: subjectId, tag: normalized });

  if (error && error.code !== "23505") throw error;
}

export async function renameTopicTag(subjectId, prevTag, nextTag) {
  const client = createSupabaseAdminClient();
  const previous = normalizeTagName(prevTag);
  const next = normalizeTagName(nextTag);

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
  const normalized = normalizeTagName(tag);
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

export async function setTopicTagColor(subjectId, tag, color) {
  const client = createSupabaseAdminClient();
  const hasTopicTagColor = await supportsTopicTagColor(client);
  if (!hasTopicTagColor) {
    throw new Error("Tag colors require migration 202608040004_add_topic_tag_color.sql to be applied.");
  }

  const normalizedTag = normalizeTagName(tag);
  const nextColor = normalizeTopicTagColor(color);

  const { error } = await client
    .from("topic_tags")
    .update({ color: nextColor, updated_at: new Date().toISOString() })
    .eq("subject_id", subjectId)
    .eq("tag", normalizedTag);

  if (error) throw error;
}

async function persistTextDocuments(subjectId, files, options = {}) {
  const client = createSupabaseAdminClient();
  const hasDocumentFolders = await supportsDocumentFolders(client);
  const hasDocumentChunks = await supportsDocumentChunks(client);
  const hasDocumentChunkEmbeddings = hasDocumentChunks ? await supportsDocumentChunkEmbeddings(client) : false;
  const hasDocumentSourceType = await supportsDocumentSourceType(client);
  const meta = normalizeDocumentMeta(options);
  const sourceType = normalizeDocumentSourceType(options.sourceType || DEFAULT_DOCUMENT_SOURCE_TYPE);
  const persistChunks = options.persistChunks !== false && sourceType === DEFAULT_DOCUMENT_SOURCE_TYPE;
  const folderIds = normalizeFolderIds(meta.folderIds || []);
  if (folderIds.length > 1 && !hasDocumentFolders) {
    throw new Error("Multi-folder assignment requires migration 202608040003_add_document_folder_map.sql to be applied.");
  }
  const primaryFolderId = folderIds[0] || null;
  const nowIso = new Date().toISOString();

  const toInsert = files.map((file) => {
    const normalizedName = normalizeDocumentName(file.name || "");
    const fallbackName = sourceType === "generated" ? `${GENERATED_QUIZ_NAME_PREFIX}untitled.txt` : "untitled.txt";
    const baseName = normalizedName || fallbackName;
    const name = sourceType === "generated" && !hasDocumentSourceType && !baseName.startsWith(GENERATED_QUIZ_NAME_PREFIX)
      ? `${GENERATED_QUIZ_NAME_PREFIX}${baseName}`
      : baseName;
    const content = String(file.content || "");
    const preview = String(file.preview || content).trim().slice(0, 180) || "(empty file)";
    const sizeBytes = Number(file.sizeBytes || Buffer.byteLength(content, "utf8") || 0);

    const row = {
      subject_id: subjectId,
      folder_id: primaryFolderId,
      name,
      content,
      preview,
      size_bytes: sizeBytes,
      updated_at: nowIso
    };

    if (hasDocumentSourceType) {
      row.source_type = sourceType;
    }

    return row;
  });

  const { data: docs, error: docsError } = await client
    .from("documents")
    .insert(toInsert)
    .select(hasDocumentSourceType ? "id, subject_id, name, content, source_type" : "id, subject_id, name, content");
  if (docsError) throw docsError;

  if (persistChunks && hasDocumentChunks && docs?.length) {
    const chunkRows = docs.flatMap((doc) => {
      const baseDocument = {
        id: doc.id,
        subjectId: doc.subject_id || subjectId,
        name: doc.name,
        content: doc.content,
        folderIds,
        tags: dedupeTagNames(meta.tags || [])
      };

      return chunkDocument(baseDocument, {
        chunkWords: DEFAULT_CHUNK_WORDS,
        overlapWords: DEFAULT_OVERLAP_WORDS
      }).map((chunk) => ({
        document_id: doc.id,
        subject_id: doc.subject_id || subjectId,
        chunk_index: chunk.chunkIndex,
        chunk_words: DEFAULT_CHUNK_WORDS,
        overlap_words: DEFAULT_OVERLAP_WORDS,
        start_word: chunk.startWord,
        end_word: chunk.endWord,
        word_count: chunk.wordCount,
        semantic_score: chunk.semanticScore,
        keywords: chunk.keywords,
        content: chunk.content
      }));
    });

    if (chunkRows.length) {
      if (hasDocumentChunkEmbeddings && isEmbeddingProviderConfigured()) {
        const embeddings = await embedTexts(chunkRows.map((row) => row.content));
        for (let index = 0; index < chunkRows.length; index += 1) {
          const embedding = embeddings[index];
          if (embedding) {
            chunkRows[index].embedding = toVectorLiteral(embedding);
          }
        }
      }

      const { error: chunkInsertError } = await client
        .from("document_chunks")
        .insert(chunkRows);
      if (chunkInsertError) throw chunkInsertError;
    }
  }

  if (hasDocumentFolders && folderIds.length && docs?.length) {
    const docFolderRows = [];
    for (const doc of docs) {
      for (const folderId of folderIds) {
        docFolderRows.push({
          document_id: doc.id,
          folder_id: folderId
        });
      }
    }

    const { error: docFoldersError } = await client
      .from("document_folders")
      .insert(docFolderRows);
    if (docFoldersError) throw docFoldersError;
  }

  const tags = dedupeTagNames(meta.tags || []);
  if (!tags.length || !docs?.length) {
    return (docs || []).map((doc) => ({
      id: doc.id,
      subjectId: doc.subject_id || subjectId,
      name: doc.name,
      sourceType: inferDocumentSourceType(doc)
    }));
  }

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

  return (docs || []).map((doc) => ({
    id: doc.id,
    subjectId: doc.subject_id || subjectId,
    name: doc.name,
    sourceType: inferDocumentSourceType(doc)
  }));
}

export async function uploadTxtDocuments(subjectId, files, options = {}) {
  return persistTextDocuments(subjectId, files, {
    ...options,
    sourceType: "uploaded",
    persistChunks: true
  });
}

export async function saveGeneratedQuizDocument(subjectId, file, options = {}) {
  const saved = await persistTextDocuments(subjectId, [file], {
    ...options,
    sourceType: "generated",
    persistChunks: false
  });

  return saved[0] || null;
}

export async function saveGeneratedQuizBundle(subjectId, file, downloads, options = {}) {
  const plainText = String(file.content || "");
  const bundledFile = {
    ...file,
    content: buildGeneratedDocumentBundle({ plainText, downloads }),
    preview: plainText,
    sizeBytes: Buffer.byteLength(plainText, "utf8")
  };

  const client = createSupabaseAdminClient();
  const hasGeneratedDocumentExports = await supportsGeneratedDocumentExports(client);
  const saved = await saveGeneratedQuizDocument(subjectId, bundledFile, options);

  if (!saved) return null;
  if (!hasGeneratedDocumentExports) {
    return {
      ...saved,
      availableFormats: Array.from(new Set(Object.keys(downloads || {}).concat("txt")))
    };
  }

  const rows = Object.entries(downloads || {}).map(([format, contentBase64]) => {
    const spec = getGeneratedExportSpec(format);
    return {
      document_id: saved.id,
      format: spec.format,
      mime_type: spec.mimeType,
      file_name: withFileExtension(file.name, spec.extension),
      content_base64: String(contentBase64 || "")
    };
  }).filter((row) => row.content_base64);

  if (rows.length) {
    const { error } = await client
      .from("generated_document_exports")
      .insert(rows);
    if (error) throw error;
  }

  return {
    ...saved,
    availableFormats: Array.from(new Set(rows.map((row) => row.format).concat("txt")))
  };
}

export async function getGeneratedDocumentDownload(documentId, format) {
  const client = createSupabaseAdminClient();
  const hasGeneratedDocumentExports = await supportsGeneratedDocumentExports(client);
  const requested = getGeneratedExportSpec(format);

  const { data: document, error: documentError } = await client
    .from("documents")
    .select("id, name, content")
    .eq("id", documentId)
    .maybeSingle();
  if (documentError) throw documentError;
  if (!document) {
    throw new Error("Document not found.");
  }

  const bundle = parseGeneratedDocumentBundle(document.content);

  if (bundle) {
    if (requested.format === "txt") {
      return {
        format: requested.format,
        fileName: withFileExtension(document.name, requested.extension),
        mimeType: requested.mimeType,
        contentBase64: Buffer.from(bundle.plainText, "utf8").toString("base64")
      };
    }

    const bundledExport = bundle.downloads?.[requested.format];
    if (bundledExport?.contentBase64) {
      return {
        format: requested.format,
        fileName: withFileExtension(document.name, bundledExport.extension || requested.extension),
        mimeType: bundledExport.mimeType || requested.mimeType,
        contentBase64: bundledExport.contentBase64
      };
    }
  }

  if (requested.format === "txt") {
    const content = String(document.content || "");
    return {
      format: requested.format,
      fileName: withFileExtension(document.name, requested.extension),
      mimeType: requested.mimeType,
      contentBase64: Buffer.from(content, "utf8").toString("base64")
    };
  }

  if (!hasGeneratedDocumentExports) {
    throw new Error("Saved generated downloads require migration 202608040009_add_generated_document_exports.sql to be applied.");
  }

  const { data: exportRow, error: exportError } = await client
    .from("generated_document_exports")
    .select("format, mime_type, file_name, content_base64")
    .eq("document_id", documentId)
    .eq("format", requested.format)
    .maybeSingle();
  if (exportError) throw exportError;
  if (!exportRow?.content_base64) {
    throw new Error(`No saved ${requested.format.toUpperCase()} download is available for this document.`);
  }

  return {
    format: exportRow.format,
    fileName: exportRow.file_name || withFileExtension(document.name, requested.extension),
    mimeType: exportRow.mime_type || requested.mimeType,
    contentBase64: exportRow.content_base64
  };
}

export async function getUploadedDocumentDownload(documentId) {
  const client = createSupabaseAdminClient();
  const { data: document, error } = await client
    .from("documents")
    .select("id, name, content")
    .eq("id", documentId)
    .maybeSingle();

  if (error) throw error;
  if (!document) {
    throw new Error("Document not found.");
  }

  const extension = getExtensionFromName(document.name, "txt");
  const bundle = parseGeneratedDocumentBundle(document.content);
  const content = bundle?.plainText || String(document.content || "");

  return {
    format: extension,
    fileName: document.name || `document.${extension}`,
    mimeType: getMimeTypeForExtension(extension),
    contentBase64: Buffer.from(content, "utf8").toString("base64")
  };
}

export async function renameDocument(documentId, nextName) {
  const client = createSupabaseAdminClient();
  const { error } = await client
    .from("documents")
    .update({ name: normalizeDocumentName(nextName), updated_at: new Date().toISOString() })
    .eq("id", documentId);
  if (error) throw error;
}

export async function removeDocument(documentId) {
  const client = createSupabaseAdminClient();
  const { error } = await client.from("documents").delete().eq("id", documentId);
  if (error) throw error;
}

export async function updateDocumentMeta(subjectId, documentId, options = {}) {
  const client = createSupabaseAdminClient();
  const hasDocumentFolders = await supportsDocumentFolders(client);
  const meta = normalizeDocumentMeta(options);
  const folderIds = normalizeFolderIds(meta.folderIds || []);
  const tags = dedupeTagNames(meta.tags || []);

  if (folderIds.length > 1 && !hasDocumentFolders) {
    throw new Error("Multi-folder assignment requires migration 202608040003_add_document_folder_map.sql to be applied.");
  }

  const primaryFolderId = folderIds[0] || null;
  const { error: docUpdateError } = await client
    .from("documents")
    .update({ folder_id: primaryFolderId, updated_at: new Date().toISOString() })
    .eq("id", documentId)
    .eq("subject_id", subjectId);
  if (docUpdateError) throw docUpdateError;

  if (hasDocumentFolders) {
    const { error: clearFolderLinksError } = await client
      .from("document_folders")
      .delete()
      .eq("document_id", documentId);
    if (clearFolderLinksError) throw clearFolderLinksError;

    if (folderIds.length) {
      const { error: insertFolderLinksError } = await client
        .from("document_folders")
        .insert(folderIds.map((folderId) => ({ document_id: documentId, folder_id: folderId })));
      if (insertFolderLinksError) throw insertFolderLinksError;
    }
  }

  const { error: clearTagsError } = await client
    .from("document_tags")
    .delete()
    .eq("document_id", documentId);
  if (clearTagsError) throw clearTagsError;

  if (!tags.length) return;
  const topicRows = await ensureTopicTags(client, subjectId, tags);
  const bridgeRows = topicRows.map((row) => ({ document_id: documentId, topic_tag_id: row.id }));

  const { error: insertTagsError } = await client
    .from("document_tags")
    .insert(bridgeRows);
  if (insertTagsError) throw insertTagsError;
}

export async function listDocumentChunks(documentIds, options = {}) {
  const ids = Array.isArray(documentIds) ? documentIds.map((id) => String(id || "").trim()).filter(Boolean) : [];
  if (!ids.length) return [];
  if (!isSupabaseConfigured()) return [];

  const client = createSupabaseAdminClient();
  const hasDocumentChunks = await supportsDocumentChunks(client);
  if (!hasDocumentChunks) return [];

  const chunkWords = Number(options.chunkWords || DEFAULT_CHUNK_WORDS);
  const overlapWords = Number(options.overlapWords || DEFAULT_OVERLAP_WORDS);

  const { data, error } = await client
    .from("document_chunks")
    .select("document_id, subject_id, chunk_index, chunk_words, overlap_words, start_word, end_word, word_count, semantic_score, keywords, content")
    .in("document_id", ids)
    .eq("chunk_words", chunkWords)
    .eq("overlap_words", overlapWords)
    .order("document_id", { ascending: true })
    .order("chunk_index", { ascending: true });

  if (error) throw error;

  return (data || []).map((row) => ({
    documentId: row.document_id,
    subjectId: row.subject_id,
    chunkIndex: row.chunk_index,
    chunkWords: row.chunk_words,
    overlapWords: row.overlap_words,
    startWord: row.start_word,
    endWord: row.end_word,
    wordCount: row.word_count,
    semanticScore: row.semantic_score,
    keywords: Array.isArray(row.keywords) ? row.keywords : [],
    content: row.content || ""
  }));
}

export async function matchDocumentChunksByEmbedding(documentIds, queryText, options = {}) {
  const ids = Array.isArray(documentIds) ? documentIds.map((id) => String(id || "").trim()).filter(Boolean) : [];
  const normalizedQuery = String(queryText || "").trim();
  if (!ids.length || !normalizedQuery) return [];
  if (!isSupabaseConfigured() || !isEmbeddingProviderConfigured()) return [];

  const client = createSupabaseAdminClient();
  const hasDocumentChunks = await supportsDocumentChunks(client);
  const hasDocumentChunkEmbeddings = hasDocumentChunks ? await supportsDocumentChunkEmbeddings(client) : false;
  if (!hasDocumentChunks || !hasDocumentChunkEmbeddings) return [];

  const embedding = await embedQuery(normalizedQuery);
  if (!embedding) return [];

  const chunkWords = Number(options.chunkWords || DEFAULT_CHUNK_WORDS);
  const overlapWords = Number(options.overlapWords || DEFAULT_OVERLAP_WORDS);
  const matchCount = Math.max(1, Number(options.matchCount || 12));

  const { data, error } = await client.rpc("match_document_chunks", {
    query_embedding: toVectorLiteral(embedding),
    match_count: matchCount,
    filter_document_ids: ids,
    filter_chunk_words: chunkWords,
    filter_overlap_words: overlapWords
  });

  if (error) throw error;

  return (data || []).map((row) => ({
    documentId: row.document_id,
    subjectId: row.subject_id,
    chunkIndex: row.chunk_index,
    chunkWords: row.chunk_words,
    overlapWords: row.overlap_words,
    startWord: row.start_word,
    endWord: row.end_word,
    wordCount: row.word_count,
    semanticScore: row.semantic_score,
    keywords: Array.isArray(row.keywords) ? row.keywords : [],
    content: row.content || "",
    vectorSimilarity: Number(row.similarity || 0)
  }));
}
