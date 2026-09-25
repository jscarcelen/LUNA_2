"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { FolderTree } from "../../ui/FolderTree";
import { DocumentBrowser } from "../../ui/DocumentBrowser";
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
const chip = "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold";

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
  const [view, setView] = useState("list");
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [status, setStatus] = useState("");
  const [openId, setOpenId] = useState("");
  const [playing, setPlaying] = useState(null);
  const [planningRow, setPlanningRow] = useState(null);
  const [preview, setPreview] = useState(null);
  const [formatFor, setFormatFor] = useState("");
  const fileRef = useRef(null);
  const folderRef = useRef(null);

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
    const term = query.trim().toLowerCase();
    if (term && !`${document.name} ${(document.tags || []).join(" ")}`.toLowerCase().includes(term)) return false;
    return true;
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
    if (!currentSubjectId) { setStatus("Create a top-level folder first."); return; }
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
            const folder = await onCreateFolder?.(part, parentId, currentSubjectId);
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
        await onUpload(group, { folderIds: folderId ? [folderId] : [], subjectId: currentSubjectId });
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

  const actions = (document) => {
    const row = rowsByDocumentId.get(document.id);
    return (
      <span className="flex shrink-0 flex-wrap items-center gap-1" onClick={(event) => event.stopPropagation()}>
        {reviewing && onReviewDocument ? <button type="button" className={ghostBtn} title="Accept the extracted text" onClick={() => onReviewDocument(document.id, { decision: "approved", subjectId: document.subjectId }).then(() => setStatus(`“${document.name}” approved.`))}>✓ Approve</button> : null}
        {reviewing && onReprocessDocument ? <button type="button" className={ghostBtn} title="Read the file again" onClick={() => { setStatus(`Re-reading “${document.name}”…`); onReprocessDocument(document.id, { subjectId: document.subjectId }).then(() => setStatus("Re-read finished.")); }}>↻ Re-read</button> : null}
        <button type="button" className={ghostBtn} onClick={() => (row ? setOpenId(document.id) : setPreview(document))}>{row ? "Open" : "Preview"}</button>
        {row ? <button type="button" className={ghostBtn} title="Schedule it in a study plan" onClick={() => setPlanningRow(row)}>＋ Plan</button> : null}
        {row && onRegenerateResource ? <button type="button" className={ghostBtn} onClick={() => onRegenerateResource(document.id)}>Regenerate</button> : null}
        <span className="relative">
          <button type="button" className={ghostBtn} title="Download in any format" onClick={() => setFormatFor(formatFor === document.id ? "" : document.id)}>⤓</button>
          {formatFor === document.id ? (
            <span className="absolute right-0 top-full z-30 mt-1 grid w-44 gap-0.5 rounded-xl border border-ink/12 bg-white p-1 shadow-[0_12px_32px_rgba(0,0,0,0.16)]" onMouseLeave={() => setFormatFor("")}>
              {(document.sourceType === "generated" ? FORMATS.generated : FORMATS.uploaded).map(([value, label]) => (
                <button key={value} type="button" className="rounded-lg px-2 py-1 text-left text-xs text-ink hover:bg-[var(--surface-soft)]" onClick={() => downloadOne(document, value)}>{label}</button>
              ))}
            </span>
          ) : null}
        </span>
        <button type="button" className={ghostBtn} title={isFavourite(document) ? "Remove from favourites" : "Mark as favourite"} onClick={() => toggleFavourite(document)}>{isFavourite(document) ? "★" : "☆"}</button>
        <button type="button" className={ghostBtn} title="Tags" onClick={() => editTags(document)}>🏷</button>
        <button type="button" className={ghostBtn} title="Rename" onClick={() => { const name = window.prompt("New name", document.name); if (name?.trim()) onRenameDocument?.(document.id, name.trim(), document.subjectId); }}>✎</button>
        <button type="button" className={`${ghostBtn} text-[var(--color-danger)]`} title="Delete" onClick={() => { if (window.confirm(`Delete “${document.name}”?`)) removeDocuments([document.id]); }}>🗑</button>
      </span>
    );
  };

  return (
    <section className="tw-scope grid items-start gap-3 lg:grid-cols-[250px_minmax(0,1fr)]">
      <aside className={`${card} grid gap-3 p-4 lg:sticky lg:top-4`}>
        <div>
          <p className={kicker}>Folders</p>
          <p className="m-0 mt-0.5 text-[11px] text-soft-ink">{allDocuments.length} document{allDocuments.length === 1 ? "" : "s"} in {workspace.name}</p>
        </div>
        <FolderTree
          folders={folders}
          documents={allDocuments}
          selectedId={nodeId}
          countLabel="document"
          onSelect={setNodeId}
          onCreateFolder={createFolder}
          onRenameFolder={renameFolder}
          onRemoveFolder={removeFolder}
          onDropDocuments={move}
        />
        {allTags.length ? (
          <div>
            <p className={kicker}>Tags</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {allTags.map((entry) => <button key={entry} type="button" onClick={() => setTag(tag === entry ? "" : entry)} className={`${chip} ${tag === entry ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-soft)] text-soft-ink"}`}>{entry}</button>)}
            </div>
          </div>
        ) : null}
        {/* The review centre is just another folder: the documents Luna could not read confidently. */}
        <button
          type="button"
          onClick={() => setNodeId(reviewing ? "" : "__review")}
          className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition ${reviewing ? "bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "hover:bg-[var(--surface-soft)]"}`}
        >
          <span aria-hidden>🛡</span><span className="font-medium">Review centre</span><span className="ml-auto text-[11px] text-soft-ink">{needsReview.length || ""}</span>
        </button>
        <div className="grid gap-1.5">
          <button type="button" className={ghostBtn} disabled={isWorking} onClick={() => fileRef.current?.click()}>⇪ Upload files</button>
          <button type="button" className={ghostBtn} disabled={isWorking} onClick={() => folderRef.current?.click()}>⇪ Upload a folder</button>
          <label className="grid gap-1 text-[11px] font-semibold text-soft-ink">Download this folder as
            <select className={field} value="" disabled={!visible.length} onChange={(event) => { if (event.target.value) downloadMany(visible, pathOf(folders, nodeId) || workspace.name, event.target.value); event.target.value = ""; }}>
              <option value="">Choose a format…</option>
              {[["original", "Original files"], ["html", "HTML"], ["pdf", "PDF (generated only)"], ["markdown", "Markdown"], ["json", "JSON"], ["txt", "Plain text"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <input ref={fileRef} type="file" multiple className="hidden" onChange={(event) => { upload(event.target.files); event.target.value = ""; }} />
          <input ref={folderRef} type="file" multiple webkitdirectory="" directory="" className="hidden" onChange={(event) => { upload(event.target.files); event.target.value = ""; }} />
          {onOpenClassicTools ? <button type="button" className="justify-self-start px-1 text-[11px] text-soft-ink hover:underline" onClick={onOpenClassicTools}>Extraction repair & tag colours…</button> : null}
        </div>
      </aside>

      <div className={`${card} grid gap-3 p-4`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="m-0 truncate text-sm font-bold text-ink">{reviewing ? "Review centre" : nodeId ? pathOf(folders, nodeId) : "All folders"}</p>
            <p className="m-0 text-[11px] text-soft-ink">{visible.length} item{visible.length === 1 ? "" : "s"}{reviewing ? " Luna could not read with confidence" : ""}</p>
          </div>
          <input className={`${field} min-w-40 flex-1`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search…" />
          <div className="flex gap-1 rounded-xl bg-[var(--surface-soft)] p-1">
            {KINDS.map((entry) => <button key={entry.id} type="button" onClick={() => setKind(entry.id)} className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${kind === entry.id ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink"}`}>{entry.label}</button>)}
          </div>
          <div className="flex gap-1 rounded-xl bg-[var(--surface-soft)] p-1">
            {[["list", "List"], ["grid", "Grid"]].map(([value, label]) => <button key={value} type="button" onClick={() => setView(value)} className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${view === value ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink"}`}>{label}</button>)}
          </div>
        </div>
        {status ? <p className="m-0 text-xs text-[var(--accent-ink)]">{status}{isWorking ? " …" : ""}</p> : null}
        <DocumentBrowser
          documents={visible}
          folders={folders.map((folder) => ({ id: folder.id, name: pathOf(folders, folder.id) }))}
          view={view}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onOpen={(document) => (rowsByDocumentId.has(document.id) ? setOpenId(document.id) : setPreview(document))}
          onMove={move}
          onCopy={copyHere}
          onDelete={removeDocuments}
          onDownload={(ids) => downloadMany(visible.filter((document) => ids.includes(document.id)), "luna-selection")}
          marquee
          renderMeta={meta}
          renderActions={actions}
          emptyText={query ? "Nothing matches your search." : "This folder is empty — upload files, or drag documents here."}
        />
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
