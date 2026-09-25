"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { RowMenu } from "../../ui/RowMenu";
import { ResourceDetail } from "../../resources/ResourceDetail";
import { ActivityPlayer } from "../../activities/ActivityPlayer";
import { AddToPlanDialog } from "../../plans/AddToPlanDialog";
import { isFavourite, parseResource, resourceDifficulty, resourceStats, resourceTags } from "../../resources/resource";
import { renderPlainOutputHtml, wrapPreviewDocument } from "../../ai-tools/tools/agent-builder/previewHtml";
import { branchOf, documentsOf, foldersOf, parseNode, pathOf, subjectNode } from "./folderModel";

const card = "rounded-[18px] border border-ink/8 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)]";
const kicker = "m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink";
const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-[var(--surface-soft)] disabled:opacity-50";
const field = "rounded-xl border border-ink/12 bg-white px-3 py-1.5 text-sm text-ink";
const chip = "inline-flex max-w-[11rem] items-center truncate whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold";

/** What a processed document can be exported as — the point of having parsed it in the first place. */
const FORMATS = {
  uploaded: [["original", "Original file"], ["html", "HTML"], ["editable-html", "HTML (editable)"], ["markdown", "Markdown"], ["blocks-json", "JSON (structure)"], ["txt", "Plain text"]],
  // A generated resource is data, so JSON, HTML and text are produced here from what it holds;
  // PDF, Word and PowerPoint come from its template, in the resource's own Downloads tab.
  generated: [["json", "JSON (the data)"], ["html", "HTML"], ["txt", "Plain text"], ["template", "PDF / Word / slides…"]]
};

const KINDS = [
  { id: "all", label: "Everything" },
  { id: "uploaded", label: "Material" },
  { id: "generated", label: "Generated" },
  { id: "favourite", label: "★ Favourites" }
];

/** Documents Luna files by itself; they belong to other screens, not to the folder browser. */
const SYSTEM_TAGS = ["activity-attempt", "study-plan", "study-goal", "ai-agent"];

function download(name, base64, mimeType) {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType || "application/octet-stream" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * The workspace: one folder tree and everything that is in it.
 *
 * Material you uploaded and everything the agents generated live side by side in the same folders,
 * with the same actions — preview, rename, download, delete, tag, favourite — plus, for a generated
 * resource, everything the library used to offer: do it on Luna, see what it teaches, export any
 * view of its template, regenerate it, or schedule it in a study plan.
 */
export function WorkspaceBrowser({
  workspace,
  templates = [],
  isWorking = false,
  onCreateSubject,
  onRenameSubject,
  onRemoveSubject,
  onCreateFolder,
  onMoveFolder,
  onRenameFolder,
  onRemoveFolder,
  onUpdateDocumentMeta,
  onRenameDocument,
  onRemoveDocument,
  onUpload,
  onDownloadDocument,
  onUpdateGeneratedDocument,
  onSaveGeneratedQuizDocument,
  onRegenerateResource,
  onReviewDocument,
  onReprocessDocument,
  onOpenClassicTools,
  focusDocumentId = "",
  onSelectFolder
}) {
  const [nodeId, setNodeId] = useState("");
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [topicFilter, setTopicFilter] = useState("");
  const [dateSort, setDateSort] = useState("newest");
  const [planFilter, setPlanFilter] = useState("");
  const [openNodes, setOpenNodes] = useState(new Set());
  const [selectedIds, setSelectedIds] = useState([]);
  const [status, setStatus] = useState("");
  const [openId, setOpenId] = useState("");
  const [playing, setPlaying] = useState(null);
  const [planningRow, setPlanningRow] = useState(null);
  const [preview, setPreview] = useState(null);
  const [formatFor, setFormatFor] = useState("");
  const fileRef = useRef(null);
  const folderRef = useRef(null);
  // dragRef tracks { type: "file"|"folder", id: string } for the current drag.
  const dragRef = useRef(null);
  function toggleNode(id) { setOpenNodes((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; }); }

  const folders = useMemo(() => foldersOf(workspace), [workspace]);
  const allDocuments = useMemo(() => documentsOf(workspace).filter((document) => !(document.tags || []).some((entry) => SYSTEM_TAGS.includes(entry))), [workspace]);
  const rowsByDocumentId = useMemo(() => {
    const map = new Map();
    for (const document of allDocuments) { const resource = parseResource(document); if (resource) map.set(document.id, { document, resource }); }
    return map;
  }, [allDocuments]);
  const templateById = useMemo(() => Object.fromEntries(templates.map((template) => [template.id, template])), [templates]);
  const rawDocuments = useMemo(() => (workspace?.subjects || []).flatMap((subject) => subject.documents || []), [workspace]);
  const allTags = useMemo(() => [...new Set(allDocuments.flatMap((document) => resourceTags(document)))], [allDocuments]);
  const allTopics = useMemo(() => [...new Set(allDocuments.flatMap((document) => (document.tags || []).filter((t) => String(t).startsWith("topic:")).map((t) => String(t).slice(6))))], [allDocuments]);
  const studyPlans = useMemo(() => rawDocuments.filter((d) => (d.tags || []).includes("study-plan")).map((d) => { try { const plan = JSON.parse(d.content || "{}"); return plan?.name ? { id: d.id, name: plan.name, items: plan.items || [] } : null; } catch { return null; } }).filter(Boolean), [rawDocuments]);
  const docIdsInPlan = useMemo(() => { if (!planFilter) return null; const plan = studyPlans.find((p) => p.id === planFilter); if (!plan) return null; return new Set(plan.items.map((item) => item.resourceId).filter(Boolean)); }, [planFilter, studyPlans]);

  useEffect(() => { onSelectFolder?.(nodeId && nodeId !== "__review" ? parseNode(nodeId) : null); }, [nodeId, onSelectFolder]);

  /**
   * Arriving with a document in mind (from a study plan step): show the folder it is filed in and
   * open it straight away, so "Open" on a step lands on the thing itself.
   */
  const focusedRef = useRef("");
  useEffect(() => {
    if (!focusDocumentId || focusedRef.current === focusDocumentId) return;
    const document = allDocuments.find((item) => item.id === focusDocumentId);
    if (!document) return;
    focusedRef.current = focusDocumentId;
    setNodeId((document.folderIds || [])[0] || "");
    setSelectedIds([focusDocumentId]);
    if (rowsByDocumentId.has(focusDocumentId)) setOpenId(focusDocumentId);
    else setPreview(document);
  }, [focusDocumentId, allDocuments, rowsByDocumentId]);

  const needsReview = useMemo(() => allDocuments.filter((document) => document.requiresReview || String(document.reviewStatus || "approved") !== "approved"), [allDocuments]);
  const reviewing = nodeId === "__review";
  const branch = useMemo(() => (nodeId && !reviewing ? branchOf(folders, nodeId) : null), [folders, nodeId, reviewing]);
  const visible = (reviewing ? needsReview : allDocuments).filter((document) => {
    if (kind === "uploaded" && document.sourceType === "generated") return false;
    if (kind === "generated" && document.sourceType !== "generated") return false;
    if (kind === "favourite" && !isFavourite(document)) return false;
    if (branch && !(document.folderIds || []).some((id) => branch.has(id))) return false;
    if (tag && !resourceTags(document).includes(tag)) return false;
    if (topicFilter && !(document.tags || []).includes(`topic:${topicFilter}`)) return false;
    if (docIdsInPlan && !docIdsInPlan.has(document.id)) return false;
    const term = query.trim().toLowerCase();
    if (term && !`${document.name} ${(document.tags || []).join(" ")}`.toLowerCase().includes(term)) return false;
    return true;
  }).sort((a, b) => {
    const da = new Date(a.uploadedAt || a.createdAt || 0).getTime();
    const db = new Date(b.uploadedAt || b.createdAt || 0).getTime();
    return dateSort === "oldest" ? da - db : db - da;
  });

  const current = nodeId && !reviewing ? parseNode(nodeId) : null;
  const currentSubjectId = current?.subjectId || workspace?.subjects?.[0]?.id || "";

  /* ---------------------------------------------------------------- folders */
  function createFolder(name, parentNodeId) {
    if (!parentNodeId) return onCreateSubject?.(name); // a top-level folder
    const parent = parseNode(parentNodeId);
    return onCreateFolder?.(name, parent.kind === "folder" ? parent.folderId : "", parent.subjectId);
  }
  function renameFolder(id, name) {
    const node = parseNode(id);
    if (node.kind === "subject") return onRenameSubject?.(node.subjectId, name);
    return onRenameFolder?.(node.folderId, name, node.subjectId);
  }
  function removeFolder(id) {
    const node = parseNode(id);
    if (node.kind === "subject") return onRemoveSubject?.(node.subjectId);
    return onRemoveFolder?.(node.folderId, node.subjectId);
  }

  /* ---------------------------------------------------------------- documents */
  function move(ids, targetNodeId) {
    const target = targetNodeId ? parseNode(targetNodeId) : null;
    let moved = 0;
    let blocked = 0;
    for (const id of ids) {
      const document = allDocuments.find((item) => item.id === id);
      if (!document) continue;
      if (target && target.subjectId && target.subjectId !== document.subjectId) { blocked += 1; continue; }
      const folderIds = target && target.kind === "folder" ? [target.folderId] : [];
      onUpdateDocumentMeta?.(id, { folderIds, tags: document.tags || [] }, document.subjectId);
      moved += 1;
    }
    setSelectedIds([]);
    setStatus(`${moved} item${moved === 1 ? "" : "s"} moved${blocked ? ` · ${blocked} left where they were (they belong to another top-level folder)` : ""}.`);
  }

  /**
   * Move a folder (node id) into a target folder (node id).
   * Subjects cannot be moved into subfolders — they are always top-level.
   * A folder cannot be dropped into itself or one of its own descendants.
   */
  function moveFolder(draggedNodeId, targetNodeId) {
    const dragged = parseNode(draggedNodeId);
    const target = parseNode(targetNodeId);
    if (dragged.kind === "subject") { setStatus("Top-level folders cannot be nested inside another folder."); return; }
    if (draggedNodeId === targetNodeId) return; // same folder
    // Prevent dropping into a descendant (would create a cycle).
    const branch = branchOf(folders, draggedNodeId);
    if (branch.has(targetNodeId)) { setStatus("A folder cannot be moved inside one of its own subfolders."); return; }
    // Determine the raw parent folder id the API expects.
    // If target is the subject root, clear parentFolderId; otherwise use its folderId.
    const newParentFolderId = target.kind === "folder" ? target.folderId : "";
    onMoveFolder?.(dragged.folderId, newParentFolderId);
    setStatus("Folder moved.");
  }

  function copyHere(ids) {
    if (!current || current.kind !== "folder") { setStatus("Open a subfolder first — that is where the copies go."); return; }
    for (const id of ids) {
      const document = allDocuments.find((item) => item.id === id);
      if (!document || document.subjectId !== current.subjectId) continue;
      const raw = rawDocuments.find((item) => item.id === id);
      const folderIds = [...new Set([...((raw?.folderIds) || []), current.folderId])];
      onUpdateDocumentMeta?.(id, { folderIds, tags: document.tags || [] }, document.subjectId);
    }
    setStatus(`${ids.length} item${ids.length === 1 ? "" : "s"} also filed here.`);
  }

  function removeDocuments(ids) {
    for (const id of ids) {
      const document = allDocuments.find((item) => item.id === id);
      onRemoveDocument?.(id, document?.subjectId);
    }
    setSelectedIds([]);
    setStatus(`Deleted ${ids.length} item${ids.length === 1 ? "" : "s"}.`);
  }

  function toggleFavourite(document) {
    const tags = document.tags || [];
    const next = tags.includes("favourite") ? tags.filter((entry) => entry !== "favourite") : [...tags, "favourite"];
    const raw = rawDocuments.find((item) => item.id === document.id);
    onUpdateDocumentMeta?.(document.id, { folderIds: raw?.folderIds || [], tags: next }, document.subjectId);
  }

  function editTags(document) {
    const keep = (document.tags || []).filter((entry) => entry === "resource" || entry === "favourite" || entry === "activity" || String(entry).includes(":"));
    const value = window.prompt("Tags, separated by commas", resourceTags(document).join(", "));
    if (value === null) return;
    const raw = rawDocuments.find((item) => item.id === document.id);
    onUpdateDocumentMeta?.(document.id, { folderIds: raw?.folderIds || [], tags: [...keep, ...value.split(",").map((entry) => entry.trim()).filter(Boolean)] }, document.subjectId);
  }

  async function downloadOne(document, format = "") {
    setFormatFor("");
    const row = rowsByDocumentId.get(document.id);
    // Anything a resource already holds is written here; only the original files need the server.
    if (row && format === "template") { setOpenId(document.id); setStatus("Pick the view and the format in Downloads."); return; }
    if (row && (format === "json" || format === "html" || format === "txt")) {
      const raw = rawDocuments.find((item) => item.id === document.id);
      const fields = Object.keys(row.resource.data?.items?.[0] || {}).map((name) => ({ name, label: name }));
      const body = format === "json"
        ? JSON.stringify(row.resource, null, 2)
        : format === "html"
          ? wrapPreviewDocument(renderPlainOutputHtml(row.resource.data?.items || [], fields, {}, { title: row.resource.name }, {}, []), { title: row.resource.name })
          : String(raw?.content || JSON.stringify(row.resource, null, 2));
      const base64 = typeof window === "undefined" ? "" : window.btoa(unescape(encodeURIComponent(body)));
      download(`${row.resource.name}.${format === "json" ? "json" : format === "html" ? "html" : "txt"}`, base64, format === "json" ? "application/json" : format === "html" ? "text/html" : "text/plain");
      setStatus("");
      return;
    }
    if (!onDownloadDocument) return;
    setStatus(`Preparing “${document.name}”${format && format !== "original" ? ` as ${format.toUpperCase()}` : ""}…`);
    const file = await onDownloadDocument(document, format);
    if (!file) { setStatus("Nothing to download for this item."); return; }
    download(file.fileName || document.name, file.contentBase64, file.mimeType);
    setStatus("");
  }

  /** Several files (or a whole folder) come down as one zip that keeps the folder structure. */
  async function downloadMany(documents, zipName, zipFormat = "") {
    if (!onDownloadDocument || !documents.length) return;
    setStatus(`Preparing ${documents.length} file${documents.length === 1 ? "" : "s"}…`);
    const zip = new JSZip();
    let added = 0;
    for (const document of documents) {
      try {
        const file = await onDownloadDocument(document, zipFormat);
        if (!file?.contentBase64) continue;
        const folder = (document.folderIds || []).map((id) => pathOf(folders, id)).find(Boolean) || "";
        zip.file(`${folder ? `${folder}/` : ""}${file.fileName || document.name}`, file.contentBase64, { base64: true });
        added += 1;
      } catch { /* skip what cannot be fetched */ }
    }
    if (!added) { setStatus("None of the selected items could be downloaded."); return; }
    const blob = await zip.generateAsync({ type: "base64" });
    download(`${zipName || "luna-files"}.zip`, blob, "application/zip");
    setStatus(`${added} file${added === 1 ? "" : "s"} downloaded.`);
  }

  /** Uploading a folder recreates its subfolders, so a tree comes in as a tree. */
  async function upload(fileList) {
    const files = [...fileList];
    if (!files.length || !onUpload) return;
    let uploadSubjectId = currentSubjectId;
    if (!uploadSubjectId) {
      // No subjects exist yet — ask for one so the upload has a home.
      const name = window.prompt("Name the folder these files will go into:");
      if (!name?.trim()) { setStatus("Upload cancelled — create a folder first."); return; }
      const created = await onCreateSubject?.(name.trim());
      uploadSubjectId = created?.id || workspace?.subjects?.[0]?.id || "";
      if (!uploadSubjectId) { setStatus("Could not create folder — try again."); return; }
    }
    setStatus(`Uploading ${files.length} file${files.length === 1 ? "" : "s"}…`);
    try {
      const base = current?.kind === "folder" ? current.folderId : "";
      const created = new Map();
      const withFolders = [];
      for (const file of files) {
        const relative = String(file.webkitRelativePath || "");
        const parts = relative.split("/").slice(0, -1);
        let parentId = base;
        for (const part of parts) {
          const key = `${parentId}/${part}`;
          if (!created.has(key)) {
            const folder = await onCreateFolder?.(part, parentId, uploadSubjectId);
            created.set(key, folder?.id || parentId);
          }
          parentId = created.get(key);
        }
        withFolders.push({ file, folderId: parentId });
      }
      const byFolder = new Map();
      for (const entry of withFolders) {
        if (!byFolder.has(entry.folderId)) byFolder.set(entry.folderId, []);
        byFolder.get(entry.folderId).push(entry.file);
      }
      for (const [folderId, group] of byFolder) {
        await onUpload(group, { folderIds: folderId ? [folderId] : [], subjectId: uploadSubjectId });
      }
      setStatus(`${files.length} file${files.length === 1 ? "" : "s"} uploaded.`);
    } catch (error) {
      setStatus(String(error.message || error));
    }
  }

  /* ---------------------------------------------------------------- resources */
  const openRow = openId ? rowsByDocumentId.get(openId) : null;
  const openStats = openRow ? resourceStats(openRow.document.id, openRow.resource.activity?.id, rawDocuments) : null;

  function updateResource(row, updater) {
    const next = updater(row.resource);
    const content = JSON.stringify(next, null, 2);
    return onUpdateGeneratedDocument?.(row.document.id, { file: { name: row.document.name, content, preview: row.document.preview, sizeBytes: content.length } }, row.document.subjectId);
  }

  function classify(row, questionId, patch) {
    return updateResource(row, (resource) => ({
      ...resource,
      activity: resource.activity ? { ...resource.activity, questions: resource.activity.questions.map((question) => (question.id === questionId ? { ...question, ...patch } : question)) } : resource.activity
    }));
  }

  function bulkClassify(row, patch) {
    return updateResource(row, (resource) => ({
      ...resource,
      activity: resource.activity ? { ...resource.activity, questions: resource.activity.questions.map((question) => ({ ...question, ...patch })) } : resource.activity
    }));
  }

  async function saveAttempt(attempt, documentId) {
    const row = rowsByDocumentId.get(documentId);
    const content = JSON.stringify({ kind: "attempt", activityDocumentId: documentId, activityId: row?.resource.activity?.id || "", attempt }, null, 2);
    setPlaying(null);
    try {
      await onSaveGeneratedQuizDocument?.({ folderIds: [], tags: ["activity-attempt"], file: { name: `${attempt.activityTitle || "Activity"} · attempt.json`, content, preview: `${attempt.score}/${attempt.total}`, sizeBytes: content.length } }, row?.document.subjectId);
      setStatus(`Saved: ${attempt.score}/${attempt.total}.`);
    } catch { /* the attempt still shows locally */ }
  }

  if (!workspace) return null;

  const meta = (document) => {
    const row = rowsByDocumentId.get(document.id);
    const stats = row ? resourceStats(document.id, row.resource.activity?.id, rawDocuments) : null;
    return (
      <span className="flex flex-wrap items-center gap-1 text-[11px] text-soft-ink">
        <span className={`${chip} ${document.sourceType === "generated" ? "bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "bg-[var(--surface-soft)] text-soft-ink"}`}>{document.sourceType === "generated" ? "generated" : "material"}</span>
        {isFavourite(document) ? <span className={`${chip} bg-[#fff3cd] text-[#8a5a00]`}>★</span> : null}
        {row?.resource.meta?.questionCount ? <span className={`${chip} bg-[var(--surface-soft)] text-soft-ink`}>{row.resource.meta.questionCount} questions</span> : null}
        {resourceDifficulty(document) ? <span className={`${chip} bg-[var(--surface-soft)] text-soft-ink`}>{resourceDifficulty(document)}</span> : null}
        {stats?.times ? <span className={`${chip} bg-[var(--surface-soft)] text-soft-ink`}>done {stats.times}×</span> : null}
        {document.sizeLabel && !row ? <span>{document.sizeLabel}</span> : null}
        {resourceTags(document).slice(0, 3).map((entry) => <span key={entry} className={`${chip} border border-ink/10 text-soft-ink`}>{entry}</span>)}
      </span>
    );
  };

  /**
   * A row shows what people reach for — open, favourite, download — and keeps the rest in a menu.
   * Eleven buttons in a row pushed the file name out of its box on any narrow window; two buttons
   * and a menu fit at phone width and still reach everything.
   */
  const actions = (document) => {
    const row = rowsByDocumentId.get(document.id);
    return (
      <span className="flex shrink-0 items-center gap-1" onClick={(event) => event.stopPropagation()}>
        <button type="button" className={ghostBtn} onClick={() => (row ? setOpenId(document.id) : setPreview(document))}>{row ? "Open" : "Preview"}</button>
        <button type="button" className={ghostBtn} title={isFavourite(document) ? "Remove from favourites" : "Mark as favourite"} aria-label="Favourite" onClick={() => toggleFavourite(document)}>{isFavourite(document) ? "★" : "☆"}</button>
        <span className="relative">
          <button type="button" className={ghostBtn} title="Download in any format" aria-label="Download" onClick={() => setFormatFor(formatFor === document.id ? "" : document.id)}>⤓</button>
          {formatFor === document.id ? (
            <span className="absolute right-0 top-full z-30 mt-1 grid w-44 gap-0.5 rounded-xl border border-ink/12 bg-white p-1 shadow-[0_12px_32px_rgba(0,0,0,0.16)]" onMouseLeave={() => setFormatFor("")}>
              {(document.sourceType === "generated" ? FORMATS.generated : FORMATS.uploaded).map(([value, label]) => (
                <button key={value} type="button" className="rounded-lg px-2 py-1 text-left text-xs text-ink hover:bg-[var(--surface-soft)]" onClick={() => downloadOne(document, value)}>{label}</button>
              ))}
            </span>
          ) : null}
        </span>
        <RowMenu
          items={[
            reviewing && onReviewDocument ? { label: "Approve the text", icon: "✓", onSelect: () => onReviewDocument(document.id, { decision: "approved", subjectId: document.subjectId }).then(() => setStatus(`“${document.name}” approved.`)) } : null,
            reviewing && onReprocessDocument ? { label: "Read the file again", icon: "↻", onSelect: () => { setStatus(`Re-reading “${document.name}”…`); onReprocessDocument(document.id, { subjectId: document.subjectId }).then(() => setStatus("Re-read finished.")); } } : null,
            row ? { label: "Add to a study plan", icon: "◷", onSelect: () => setPlanningRow(row) } : null,
            row && onRegenerateResource ? { label: "Regenerate", icon: "✨", onSelect: () => onRegenerateResource(document.id) } : null,
            { label: "Tags", icon: "🏷", onSelect: () => editTags(document) },
            { label: "Rename", icon: "✎", onSelect: () => { const name = window.prompt("New name", document.name); if (name?.trim()) onRenameDocument?.(document.id, name.trim(), document.subjectId); } },
            { label: "Delete", icon: "🗑", danger: true, onSelect: () => { if (window.confirm(`Delete “${document.name}”?`)) removeDocuments([document.id]); } }
          ]}
        />
      </span>
    );
  };

  return (
    <section className="tw-scope grid items-start gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className={`${card} grid min-w-0 content-start gap-3 p-4 lg:sticky lg:top-4`}>
        <div>
          <p className={kicker}>{workspace.name}</p>
          <p className="m-0 mt-0.5 text-[11px] text-soft-ink">{allDocuments.length} item{allDocuments.length === 1 ? "" : "s"}</p>
        </div>

        <input className={`${field} w-full`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" aria-label="Search workspace" />

        <div>
          <p className={`${kicker} mb-1.5`}>Show</p>
          <div className="flex flex-wrap gap-1">
            {KINDS.map((entry) => <button key={entry.id} type="button" onClick={() => setKind(entry.id)} className={`${chip} transition ${kind === entry.id ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-soft)] text-soft-ink hover:bg-ink/8"}`}>{entry.label}</button>)}
          </div>
        </div>

        <div>
          <p className={`${kicker} mb-1`}>Date</p>
          <select className={`${field} w-full text-xs`} value={dateSort} onChange={(e) => setDateSort(e.target.value)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>

        {studyPlans.length ? (
          <div>
            <p className={`${kicker} mb-1`}>Study plan</p>
            <select className={`${field} w-full text-xs`} value={planFilter} onChange={(e) => setPlanFilter(e.target.value)}>
              <option value="">All plans</option>
              {studyPlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
            </select>
          </div>
        ) : null}

        {allTopics.length ? (
          <div>
            <p className={`${kicker} mb-1.5`}>Topic</p>
            <div className="flex flex-wrap gap-1">
              {allTopics.map((topic) => <button key={topic} type="button" onClick={() => setTopicFilter(topicFilter === topic ? "" : topic)} className={`${chip} transition ${topicFilter === topic ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-soft)] text-soft-ink hover:bg-ink/8"}`}>{topic}</button>)}
            </div>
          </div>
        ) : null}

        {allTags.length ? (
          <div>
            <p className={`${kicker} mb-1.5`}>Tags</p>
            <div className="flex flex-wrap gap-1">
              {allTags.map((entry) => <button key={entry} type="button" onClick={() => setTag(tag === entry ? "" : entry)} className={`${chip} transition ${tag === entry ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-soft)] text-soft-ink hover:bg-ink/8"}`}>{entry}</button>)}
            </div>
          </div>
        ) : null}

        <div className="grid gap-1.5 border-t border-ink/8 pt-3">
          {/* Create top-level folder */}
          {onCreateSubject ? (
            <button type="button" className={ghostBtn} onClick={() => { const name = window.prompt("Folder name"); if (name?.trim()) onCreateSubject(name.trim()); }}>
              ＋ New folder
            </button>
          ) : null}
          <button type="button" className={ghostBtn} disabled={isWorking} onClick={() => fileRef.current?.click()}>⇪ Upload files</button>
          <button type="button" className={ghostBtn} disabled={isWorking} onClick={() => folderRef.current?.click()}>⇪ Upload a folder</button>
          <button type="button" onClick={() => setNodeId(reviewing ? "" : "__review")}
            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition ${reviewing ? "bg-[var(--accent-soft)] font-semibold text-[var(--accent-ink)]" : "hover:bg-[var(--surface-soft)]"}`}>
            <span aria-hidden>🛡</span><span>Review centre</span>
            {needsReview.length ? <span className="ml-auto rounded-full bg-[rgba(255,149,0,0.18)] px-1.5 text-[10px] font-bold text-[#b25e00]">{needsReview.length}</span> : null}
          </button>
          <label className="grid gap-1 text-[11px] font-semibold text-soft-ink">Download visible as
            <select className={field} value="" disabled={!visible.length} onChange={(e) => { if (e.target.value) downloadMany(visible, workspace.name, e.target.value); e.target.value = ""; }}>
              <option value="">Choose a format…</option>
              {[["original", "Original files"], ["html", "HTML"], ["markdown", "Markdown"], ["json", "JSON"], ["txt", "Plain text"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
          <input ref={folderRef} type="file" multiple webkitdirectory="" directory="" className="hidden" onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
          {onOpenClassicTools ? <button type="button" className="justify-self-start px-1 text-[11px] text-soft-ink hover:underline" onClick={onOpenClassicTools}>Extraction repair & tag colours…</button> : null}
        </div>
      </aside>

      {/* ── Finder tree ─────────────────────────────────────────────────── */}
      <div className={`${card} min-w-0 p-4`}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="m-0 text-sm font-bold text-ink">{reviewing ? "Review centre — needs attention" : "All folders"}</p>
            <p className="m-0 text-[11px] text-soft-ink">{visible.length} item{visible.length === 1 ? "" : "s"}</p>
          </div>
          {!reviewing && folders.length ? (
            <button type="button" className={ghostBtn}
              onClick={() => setOpenNodes((prev) => prev.size ? new Set() : new Set(folders.map((f) => f.id)))}>
              {openNodes.size ? "Collapse all" : "Expand all"}
            </button>
          ) : null}
        </div>

        {status ? <p className="mb-3 text-xs text-[var(--accent-ink)]">{status}{isWorking ? " …" : ""}</p> : null}

        {reviewing ? (
          <div className="grid gap-1">
            {needsReview.length ? needsReview.map((document) => (
              <div key={document.id} className="flex items-center gap-2 rounded-xl border border-[rgba(255,149,0,0.25)] bg-[rgba(255,149,0,0.04)] px-3 py-2">
                <span className="shrink-0 text-sm" aria-hidden>📄</span>
                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => (rowsByDocumentId.has(document.id) ? setOpenId(document.id) : setPreview(document))}>
                  <p className="m-0 truncate text-sm font-medium text-ink">{document.name}</p>
                  {meta(document)}
                </div>
                {actions(document)}
              </div>
            )) : <p className="py-4 text-center text-sm text-soft-ink">No documents need attention.</p>}
          </div>
        ) : (
          <div className="grid gap-0.5">
            {(() => {
              /* ── Finder tree builder ── */
              const docsByNode = new Map();
              for (const document of visible) {
                const primaryNode = (document.folderIds || [])[0] || "";
                if (!docsByNode.has(primaryNode)) docsByNode.set(primaryNode, []);
                docsByNode.get(primaryNode).push(document);
              }
              const childrenOf = new Map();
              for (const folder of folders) {
                const key = folder.parentFolderId || "";
                if (!childrenOf.has(key)) childrenOf.set(key, []);
                childrenOf.get(key).push(folder);
              }

              function countVisible(folderId) {
                let n = (docsByNode.get(folderId) || []).length;
                for (const child of childrenOf.get(folderId) || []) n += countVisible(child.id);
                return n;
              }

              function renderFolderRow(folder, depth) {
                const isOpen = openNodes.has(folder.id);
                const docs = docsByNode.get(folder.id) || [];
                const children = childrenOf.get(folder.id) || [];
                const total = countVisible(folder.id);
                const paddingLeft = 8 + depth * 20;

                return (
                  <div key={folder.id}
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.dataset.over = "1"; e.currentTarget.style.background = "var(--accent-soft)"; }}
                    onDragLeave={(e) => { delete e.currentTarget.dataset.over; e.currentTarget.style.background = ""; }}
                    onDrop={(e) => {
                      e.stopPropagation();
                      e.currentTarget.style.background = "";
                      const drag = dragRef.current;
                      if (!drag) return;
                      dragRef.current = null;
                      if (drag.type === "file") { move([drag.id], folder.id); }
                      else if (drag.type === "folder") { moveFolder(drag.id, folder.id); }
                    }}>
                    {/* Folder header — draggable so folders can be nested */}
                    <div
                      draggable
                      onDragStart={(e) => { e.stopPropagation(); dragRef.current = { type: "folder", id: folder.id }; }}
                      onDragEnd={() => { dragRef.current = null; }}
                      className="group flex cursor-pointer items-center gap-1.5 rounded-xl px-2 py-1.5 transition hover:bg-[var(--surface-soft)]" style={{ paddingLeft }}>
                      <button type="button" className="w-4 shrink-0 text-center text-[10px] text-soft-ink" onClick={() => toggleNode(folder.id)}>{isOpen ? "▾" : "▸"}</button>
                      <span className="shrink-0 text-sm" aria-hidden>{folder.isSubject ? "🗂" : "📁"}</span>
                      <span className="flex-1 min-w-0 truncate text-sm font-semibold text-ink" onClick={() => toggleNode(folder.id)}>{folder.name}</span>
                      {total ? <span className="shrink-0 text-[11px] text-soft-ink">{total}</span> : null}
                      <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                        {(onCreateFolder || onCreateSubject) ? <button type="button" title="New subfolder" className="rounded-lg px-1.5 py-0.5 text-[11px] text-soft-ink hover:bg-ink/8" onClick={() => { const name = window.prompt("Folder name"); if (name?.trim()) createFolder(name.trim(), folder.id); }}>＋</button> : null}
                        <button type="button" title="Rename" className="rounded-lg px-1.5 py-0.5 text-[11px] text-soft-ink hover:bg-ink/8" onClick={() => { const name = window.prompt("New name", folder.name); if (name?.trim()) renameFolder(folder.id, name.trim()); }}>✎</button>
                        <button type="button" title="Delete" className="rounded-lg px-1.5 py-0.5 text-[11px] text-soft-ink hover:bg-[rgba(255,59,48,0.1)] hover:text-[var(--color-danger)]" onClick={() => { if (window.confirm(`Delete "${folder.name}" and its files?`)) removeFolder(folder.id); }}>🗑</button>
                      </span>
                    </div>

                    {isOpen && (
                      <div>
                        {docs.map((document) => (
                          <div key={document.id}
                            draggable
                            onDragStart={(e) => { e.stopPropagation(); dragRef.current = { type: "file", id: document.id }; }}
                            onDragEnd={() => { dragRef.current = null; }}
                            className={`group flex items-center gap-2 rounded-xl px-2 py-1.5 transition hover:bg-[var(--surface-soft)] ${selectedIds.includes(document.id) ? "bg-[var(--accent-soft)]/40" : ""}`}
                            style={{ paddingLeft: paddingLeft + 20 }}>
                            <span className="shrink-0 text-sm" aria-hidden>{document.sourceType === "generated" ? "✨" : "📄"}</span>
                            <div className="min-w-0 flex-1 cursor-pointer" onClick={() => (rowsByDocumentId.has(document.id) ? setOpenId(document.id) : setPreview(document))}>
                              <p className="m-0 truncate text-sm leading-tight text-ink">{document.name}</p>
                              {meta(document)}
                            </div>
                            {actions(document)}
                          </div>
                        ))}
                        {children.map((child) => renderFolderRow(child, depth + 1))}
                      </div>
                    )}
                  </div>
                );
              }

              const roots = childrenOf.get("") || [];
              if (!roots.length && !visible.length) {
                return <p key="empty" className="py-8 text-center text-sm text-soft-ink">Upload files or create a folder to get started.</p>;
              }
              if (!roots.length && visible.length) {
                // Documents with no folder structure — flat list
                return visible.map((document) => (
                  <div key={document.id} draggable
                    onDragStart={() => { dragRef.current = { type: "file", id: document.id }; }}
                    onDragEnd={() => { dragRef.current = null; }}
                    className="flex items-center gap-2 rounded-xl px-2 py-1.5 transition hover:bg-[var(--surface-soft)]">
                    <span className="shrink-0 text-sm" aria-hidden>{document.sourceType === "generated" ? "✨" : "📄"}</span>
                    <div className="min-w-0 flex-1 cursor-pointer" onClick={() => (rowsByDocumentId.has(document.id) ? setOpenId(document.id) : setPreview(document))}>
                      <p className="m-0 truncate text-sm leading-tight text-ink">{document.name}</p>
                      {meta(document)}
                    </div>
                    {actions(document)}
                  </div>
                ));
              }
              return roots.map((folder) => renderFolderRow(folder, 0));
            })()}
          </div>
        )}
      </div>

      {openRow ? (
        <ResourceDetail
          row={openRow}
          stats={openStats}
          template={templateById[openRow.resource.meta.templateId]}
          onClose={() => setOpenId("")}
          onPlay={(row) => { setOpenId(""); setPlaying(row); }}
          onRegenerate={onRegenerateResource ? (row) => onRegenerateResource(row.document.id) : undefined}
          onDelete={(row) => removeDocuments([row.document.id])}
          onClassify={classify}
          onBulkClassify={bulkClassify}
          onSaveConcepts={(row, { concepts, context }) => updateResource(row, (resource) => ({ ...resource, concepts, context }))}
          onStatus={setStatus}
        />
      ) : null}

      {planningRow ? (
        <AddToPlanDialog
          documents={rawDocuments}
          resourceId={planningRow.document.id}
          resourceName={planningRow.resource.name}
          isActivity={Boolean(planningRow.resource.activity?.questions?.length)}
          concepts={planningRow.resource.concepts || []}
          onCancel={() => setPlanningRow(null)}
          onDone={(message) => { setPlanningRow(null); setStatus(message); }}
          onSaveGeneratedQuizDocument={onSaveGeneratedQuizDocument}
          onUpdateGeneratedDocument={onUpdateGeneratedDocument}
        />
      ) : null}

      {playing ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[var(--bg)]/95 p-4 sm:p-8">
          <ActivityPlayer activity={playing.resource.activity} onSubmit={(attempt) => saveAttempt(attempt, playing.document.id)} onClose={() => setPlaying(null)} />
        </div>
      ) : null}

      {preview ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[var(--bg)]/95 p-4 sm:p-8" onClick={() => setPreview(null)}>
          <div className={`${card} mx-auto max-w-3xl p-5`} onClick={(event) => event.stopPropagation()}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0"><h3 className="m-0 truncate text-xl font-bold text-ink">{preview.name}</h3><p className="m-0 mt-1 text-xs text-soft-ink">{preview.sizeLabel || ""}{preview.uploadedAt ? ` · ${new Date(preview.uploadedAt).toLocaleDateString()}` : ""}</p></div>
              <div className="flex gap-2">
                <button type="button" className={ghostBtn} onClick={() => downloadOne(preview)}>⤓ Download</button>
                <button type="button" className={ghostBtn} onClick={() => setPreview(null)}>Close</button>
              </div>
            </div>
            {preview.sourceRenderHtml
              ? <iframe title="Preview" sandbox="" srcDoc={preview.sourceRenderHtml} className="mt-3 h-[70vh] w-full rounded-xl border border-ink/10 bg-white" />
              : <pre className="mt-3 max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-xl bg-[var(--surface-soft)] p-4 text-xs text-ink">{preview.content || preview.preview || "No preview available."}</pre>}
          </div>
        </div>
      ) : null}
    </section>
  );
}
