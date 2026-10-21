"use client";

import { sourceHref } from "../../ai-tools/pipeline/sourceLinks.js";
import { useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { RowMenu } from "../../ui/RowMenu";
import { ResourceDetail } from "../../resources/ResourceDetail";
import { AddToPlanDialog } from "../../plans/AddToPlanDialog";
import { UpdateDialog } from "../../resources/UpdateDialog";
import { canUpdateResource, restoreVersion, staleSources } from "../../resources/update";
import { isFavourite, parseResource, resourceDifficulty, resourceStats, resourceTags } from "../../resources/resource";
import { renderPlainOutputHtml, wrapPreviewDocument } from "../../ai-tools/tools/agent-builder/previewHtml";
import { branchOf, documentsOf, folderNode, foldersOf, parseNode, pathOf, subjectNode } from "./folderModel";
import { blockedTargets, destinationFolderId, documentMoveMessage, folderMoveMessage, undoGroups } from "../moveModel";
import { MoveDialog } from "./MoveDialog";
import { UploadProgress } from "./UploadProgress";
import { EmptyState } from "../../../components/EmptyState";
import { askLuna } from "../../chat/GlobalAskLuna";
import { planUploadBatches, tooLargeMessage } from "../uploadPlan";
import { ReaderView } from "../../reader/ReaderView";
import { DocumentReader } from "../../reader/DocumentReader";
import { masterOriginals, originalDownloader } from "../../reader/downloadOriginal";
import { UPLOADED_FOLDER, isReferenceShortcut, subjectStructure } from "../../plans/folders";
import { dueDateOf, dueInfoOf, isAssignedDocument, isReservedSubjectName, isSharedDocument, senderNameOf, sharedInfoOf } from "../../accounts/shared";
import { SharedNotice } from "../../accounts/SharedNotice";
import { requestLeaveShare } from "../../accounts/shareEvents";
import { displayName, nameToSave } from "../../ui/displayName";
import { useT } from "../../../lib/i18n/LocaleProvider.js";
import { DEFAULT_SUBJECT_COLOR } from "../../core/contracts.js";

const card = "rounded-[18px] border border-ink/8 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)]";
const kicker = "m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink";
const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-[var(--surface-soft)] disabled:opacity-50";
const field = "rounded-xl border border-ink/12 bg-white px-3 py-1.5 text-sm text-ink";
const chip = "inline-flex max-w-[11rem] items-center truncate whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold";

/**
 * Wrap raw CDM HTML in a minimal full document with KaTeX CSS so the preview
 * iframe renders math and has basic readable styling.
 * `sandbox="allow-same-origin"` (no allow-scripts) lets CSS load but blocks JS.
 */
// KaTeX CSS and fonts are served from our own origin (public/katex): no third-party request carries the reader's IP.
const KATEX_CSS = () => `${typeof window !== "undefined" ? window.location.origin : ""}/katex/katex.min.css`;
function wrapPreviewHtml(html = "") {
  const body = String(html || "").trim();
  if (!body) return "<html><body><p style='color:#999;padding:24px'>No preview available.</p></body></html>";
  // Already a full document — inject KaTeX CSS into <head> if not present
  if (/<html[\s>]/i.test(body)) {
    if (!body.includes("katex")) {
      return body.replace(/<head[^>]*>/i, (m) => `${m}<link rel="stylesheet" href="${KATEX_CSS()}">`);
    }
    return body;
  }
  // Raw CDM fragment — wrap it
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="${KATEX_CSS()}">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.65; margin: 0; padding: 24px 28px; color: #1d1d1f; background: #fff; font-size: 15px; }
  h1,h2,h3,h4,h5,h6 { color: #1d1d1f; margin: 1.2em 0 0.4em; font-weight: 700; }
  p { margin: 0 0 0.9em; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  td, th { border: 1px solid #d2d2d7; padding: 8px 12px; vertical-align: top; }
  th { background: #f5f5f7; font-weight: 600; }
  ul, ol { padding-left: 1.5em; margin: 0.5em 0 0.9em; }
  li { margin: 0.3em 0; }
  figure { margin: 1.2em 0; }
  figcaption { font-size: 0.85em; color: #6e6e73; margin-top: 4px; }
  .cdm-alt-text { font-style: italic; color: #6e6e73; font-size: 0.9em; }
  pre { background: #f5f5f7; border-radius: 8px; padding: 12px 16px; overflow-x: auto; font-size: 13px; }
  code { font-family: "SF Mono", "Fira Code", monospace; }
  .math-display.nicer-latex, .math-inline.nicer-latex { background: #f5f5f7; border-radius: 6px; padding: 2px 6px; }
  .math-display.nicer-latex { display: block; padding: 10px 14px; margin: 1em 0; overflow-x: auto; }
  .katex-display { margin: 0.5em 0; overflow-x: auto; }
</style>
</head>
<body>${body}</body>
</html>`;
}

/** What a processed document can be exported as — the point of having parsed it in the first place. */
const FORMATS = {
  uploaded: ["original", "html", "editable-html", "markdown", "blocks-json", "txt"],
  // A generated resource is data, so JSON, HTML and text are produced here from what it holds;
  // PDF, Word and PowerPoint come from its template, in the resource's own Downloads tab.
  generated: ["json", "html", "txt", "template"]
};

const KINDS = [
  { id: "all", labelKey: "courses.wb.kind.all" },
  { id: "uploaded", labelKey: "courses.wb.kind.uploaded" },
  { id: "generated", labelKey: "courses.wb.kind.generated" },
  { id: "favourite", labelKey: "courses.wb.kind.favourite" }
];

const VIEW_KEY = "luna.workspace.view";

/** Tile colours for top-level folders that still have the default colour, so the gallery is easy to scan. */
const GALLERY_COLOURS = ["#0071e3", "#34a853", "#ff9500", "#af52de", "#ff3b30", "#00a6a6", "#5856d6", "#c9821b"];
function galleryColour(folder) {
  if (folder.colour && folder.colour !== DEFAULT_SUBJECT_COLOR) return folder.colour;
  let hash = 0;
  for (const char of String(folder.id)) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return GALLERY_COLOURS[Math.abs(hash) % GALLERY_COLOURS.length];
}

/** Documents Luna files by itself; they belong to other screens, not to the folder browser. */
const SYSTEM_TAGS = ["activity-attempt", "study-plan", "study-goal", "ai-agent", "doc-notes"];

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
  onMoveDocuments,
  onRenameFolder,
  onRemoveFolder,
  onUpdateDocumentMeta,
  onRenameDocument,
  onRemoveDocument,
  onUpload,
  onDownloadDocument,
  onUpdateDocumentContent,
  onUpdateGeneratedDocument,
  onSaveGeneratedQuizDocument,
  onRegenerateResource,
  onReviewDocument,
  onReprocessDocument,
  onShareDocument,
  onMakeFrom,
  onPlanFrom,
  // (classic tools button removed – feedback 85848751)
  focusDocumentId = "",
  onSelectFolder
}) {
  const t = useT();
  const [nodeId, setNodeId] = useState("");
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [tag, setTag] = useState("");
  const [topicFilter, setTopicFilter] = useState("");
  const [dateSort, setDateSort] = useState("newest");
  const [planFilter, setPlanFilter] = useState("");
  const [openNodes, setOpenNodes] = useState(new Set());
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectedFolderIds, setSelectedFolderIds] = useState([]); // folder node ids chosen with the checkbox next to a folder
  const [status, setStatus] = useState("");
  const [openId, setOpenId] = useState("");
  const [playing, setPlaying] = useState(null);
  const [planningRow, setPlanningRow] = useState(null);
  const [updatingRow, setUpdatingRow] = useState(null); // { document, resource }: the "Update…" dialog
  const [preview, setPreview] = useState(null);
  // Opened from a source tag in a generated document: where in the original to start reading.
  const [previewScroll, setPreviewScroll] = useState(null);
  const [uploadPicker, setUploadPicker] = useState(null); // { files }: choosing where an upload goes
  const [uploadProgress, setUploadProgress] = useState(null);
  const [movePicker, setMovePicker] = useState(null); // { documentIds } or { folderNodeId }: the "Move to…" dialog
  const [undo, setUndo] = useState(null); // { text, run }: offered while `text` is still what the status line says
  // "list" is the folder tree; "gallery" is big folder tiles you open one level at a time (remembered per browser).
  const [view, setView] = useState("list");
  const [galleryId, setGalleryId] = useState(""); // the folder the gallery is showing ("" = every top-level folder)
  useEffect(() => { try { if (window.localStorage.getItem(VIEW_KEY) === "gallery") setView("gallery"); } catch { /* storage blocked: stay on the list */ } }, []);
  function chooseView(next) { setView(next); try { window.localStorage.setItem(VIEW_KEY, next); } catch { /* not remembered */ } }
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
  useEffect(() => { if (view === "gallery" && galleryId) onSelectFolder?.(parseNode(galleryId)); }, [view, galleryId, onSelectFolder]);

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
  /**
   * Rename through the browser's own box: it can be cleared and retyped freely; an empty name is refused
   * with a reason (and the box opens again) instead of being ignored. Cancel leaves the name as it was.
   */
  function askName(current) {
    let typed = window.prompt(t("courses.wb.newName"), current);
    while (typed !== null) {
      const checked = nameToSave(typed);
      if (checked.ok) return checked.name;
      typed = window.prompt(`${t("courses.sr.nameNeeded")} ${t("courses.wb.newName")}`, "");
    }
    return null;
  }
  function renameDocument(document) {
    const name = askName(displayName(document.name));
    if (name !== null) onRenameDocument?.(document.id, nameToSave(name, document.name).name, document.subjectId);
  }
  function promptRenameFolder(folder) {
    const name = askName(folder.name);
    if (name !== null) renameFolder(folder.id, name);
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
  /*
   * Moving, by drag and drop or from the "Move to…" menu. Documents and folders go to any topic or folder of
   * the workspace; the server keeps ids stable, carries notes, attempts and chunks along and refuses what is not allowed.
   */
  const subjectsList = workspace?.subjects || [];
  const sharedTopic = (subjectId) => isReservedSubjectName(subjectsList.find((entry) => entry.id === subjectId)?.name);
  const dragFile = (document) => ({ type: "file", id: document.id, ids: selectedIds.includes(document.id) ? selectedIds : [document.id] });
  const toggleFolderSelected = (id) => setSelectedFolderIds((list) => (list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id]));
  const clearSelection = () => { setSelectedIds([]); setSelectedFolderIds([]); };
  /** The chosen folders without any that sit inside another chosen folder (that one carries them along). */
  const topSelectedFolders = () => selectedFolderIds.filter((id) => !selectedFolderIds.some((other) => other !== id && branchOf(folders, other).includes(id)));
  async function moveSelected(targetNodeId) {
    const docIds = selectedIds;
    const folderIds = topSelectedFolders();
    setSelectedFolderIds([]);
    if (docIds.length) await move(docIds, targetNodeId);
    for (const folderNodeId of folderIds) await moveFolder(folderNodeId, targetNodeId);
  }
  async function deleteSelected() {
    const folderIds = topSelectedFolders();
    const docs = selectedIds.map((id) => allDocuments.find((item) => item.id === id)).filter(Boolean).filter((document) => !isSharedDocument(document) && !sharedInfoOf(document));
    const parts = [docs.length ? t.plural("courses.wb.nFiles", docs.length) : "", folderIds.length ? t.plural("courses.wb.nFoldersInside", folderIds.length) : ""].filter(Boolean);
    if (!parts.length) { setStatus(t("courses.wb.cannotDelete")); return; }
    if (!window.confirm(t("courses.wb.confirmDeleteMany", { parts: parts.join(t("courses.wb.and")) }))) return;
    if (docs.length) removeDocuments(docs.map((document) => document.id));
    for (const folderNodeId of folderIds) await removeFolder(folderNodeId);
    clearSelection();
    setStatus(t("courses.wb.deletedMany", { parts: parts.join(t("courses.wb.and")) }));
  }
  const toggleSelected = (id) => setSelectedIds((list) => (list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id]));
  const openAt = (...nodeIds) => setOpenNodes((prev) => new Set([...prev, ...nodeIds.filter(Boolean)]));
  function offerUndo(text, run) { setStatus(text); setUndo({ text, run }); }
  async function runUndo() {
    const entry = undo;
    setUndo(null);
    if (entry) await entry.run();
  }

  async function move(ids, targetNodeId) {
    const target = parseNode(targetNodeId);
    if (!onMoveDocuments || !target.subjectId) return;
    if (sharedTopic(target.subjectId)) { setStatus(t("courses.wb.sharedNoMove")); return; }
    const documents = [...new Set(ids)].map((id) => allDocuments.find((item) => item.id === id)).filter(Boolean);
    const movable = documents.filter((document) => !isSharedDocument(document));
    const readOnly = documents.length - movable.length;
    setSelectedIds([]);
    if (!movable.length) { setStatus(readOnly ? t("courses.wb.cannotMove") : ""); return; }

    // One request per destination: dropped on another topic's top level, uploaded and generated material go to different folders of it.
    const groups = new Map();
    for (const document of movable) {
      const folderId = destinationFolderId({ document, targetNodeId, subjects: subjectsList });
      groups.set(folderId, [...(groups.get(folderId) || []), document.id]);
    }
    let moved = 0;
    let failure = "";
    const notes = [];
    const previous = [];
    for (const [folderId, groupIds] of groups) {
      const result = await onMoveDocuments(groupIds, { targetSubjectId: target.subjectId, targetFolderId: folderId });
      if (!result || result.error) { failure = result?.error || t("courses.wb.moveFailed"); break; }
      moved += result.documents || 0;
      notes.push(...(result.notes || []));
      previous.push(...(result.previous || []));
    }
    const paths = [...new Set([...groups.keys()].map((folderId) => pathOf(folders, folderId ? folderNode(target.subjectId, folderId) : targetNodeId)))];
    openAt(targetNodeId, ...[...groups.keys()].filter(Boolean).map((folderId) => folderNode(target.subjectId, folderId)));
    if (failure) { setStatus(`${failure}${moved ? ` ${t.plural("courses.wb.alreadyMoved", moved)}` : ""}`); return; }
    const text = documentMoveMessage({ moved, readOnly, path: paths.join(t("courses.wb.and")), notes: [...new Set(notes)] }, t);
    if (!moved || !previous.length) { setStatus(text); return; }
    offerUndo(text, async () => {
      setStatus(t("courses.wb.movingBack"));
      for (const group of undoGroups(previous)) {
        const back = await onMoveDocuments(group.ids, { targetSubjectId: group.targetSubjectId, targetFolderIds: group.targetFolderIds });
        if (!back || back.error) { setStatus(back?.error || t("courses.wb.moveBackFailed")); return; }
      }
      setStatus(t.plural("courses.wb.movedBack", moved));
    });
  }

  /**
   * Move a folder (node id) under another folder, or to the top of any topic (node id), with everything in it.
   * A topic is always top-level. A folder cannot be dropped into itself or one of its own descendants.
   */
  async function moveFolder(draggedNodeId, targetNodeId) {
    const dragged = parseNode(draggedNodeId);
    const target = parseNode(targetNodeId);
    if (!onMoveFolder || !target.subjectId) return;
    if (dragged.kind === "subject") { setStatus(t("courses.wb.topicTop")); return; }
    if (draggedNodeId === targetNodeId) return; // same folder
    // Prevent dropping into a descendant (would create a cycle).
    if (branchOf(folders, draggedNodeId).has(targetNodeId)) { setStatus(t("courses.wb.noCycle")); return; }
    if (sharedTopic(target.subjectId)) { setStatus(t("courses.wb.sharedNoMove")); return; }
    const result = await onMoveFolder(dragged.folderId, target.kind === "folder" ? target.folderId : "", { targetSubjectId: target.subjectId });
    if (!result || result.error) { setStatus(result?.error || t("courses.wb.folderMoveFailed")); return; }
    // A study plan's folder keeps its place under "Study plans", wherever it was dropped.
    const redirected = Boolean(result.parentFolderId) && result.parentFolderId !== target.folderId;
    const path = redirected ? `${result.subjectName} / ${t("courses.wb.generatedPath")}` : pathOf(folders, targetNodeId);
    const movedNode = folderNode(result.subjectId, result.folderId);
    openAt(targetNodeId, movedNode);
    if (nodeId === draggedNodeId) setNodeId(movedNode);
    if (result.unchanged) { setStatus(folderMoveMessage({ result, path }, t)); return; }
    offerUndo(folderMoveMessage({ result, path }, t), async () => {
      setStatus(t("courses.wb.movingBack"));
      const back = await onMoveFolder(result.folderId, result.previous.parentFolderId, { targetSubjectId: result.previous.subjectId, nextName: result.previous.name });
      setStatus(!back || back.error ? back?.error || t("courses.wb.folderBackFailed") : t("courses.wb.folderMovedBack", { name: result.previous.name }));
    });
  }

  function copyHere(ids) {
    if (!current || current.kind !== "folder") { setStatus(t("courses.wb.openSubfolder")); return; }
    for (const id of ids) {
      const document = allDocuments.find((item) => item.id === id);
      if (!document || document.subjectId !== current.subjectId) continue;
      const raw = rawDocuments.find((item) => item.id === id);
      const folderIds = [...new Set([...((raw?.folderIds) || []), current.folderId])];
      onUpdateDocumentMeta?.(id, { folderIds, tags: document.tags || [] }, document.subjectId);
    }
    setStatus(t.plural("courses.wb.alsoFiled", ids.length));
  }

  function removeDocuments(ids) {
    for (const id of ids) {
      const document = allDocuments.find((item) => item.id === id);
      onRemoveDocument?.(id, document?.subjectId);
    }
    setSelectedIds([]);
    setStatus(t.plural("courses.wb.deletedItems", ids.length));
  }

  function toggleFavourite(document) {
    const tags = document.tags || [];
    const next = tags.includes("favourite") ? tags.filter((entry) => entry !== "favourite") : [...tags, "favourite"];
    const raw = rawDocuments.find((item) => item.id === document.id);
    onUpdateDocumentMeta?.(document.id, { folderIds: raw?.folderIds || [], tags: next }, document.subjectId);
  }

  function editTags(document) {
    const keep = (document.tags || []).filter((entry) => entry === "resource" || entry === "favourite" || entry === "activity" || String(entry).includes(":"));
    const value = window.prompt(t("courses.wb.tagsPrompt"), resourceTags(document).join(", "));
    if (value === null) return;
    const raw = rawDocuments.find((item) => item.id === document.id);
    onUpdateDocumentMeta?.(document.id, { folderIds: raw?.folderIds || [], tags: [...keep, ...value.split(",").map((entry) => entry.trim()).filter(Boolean)] }, document.subjectId);
  }

  async function downloadOne(document, format = "") {
    const row = rowsByDocumentId.get(document.id);
    // Anything a resource already holds is written here; only the original files need the server.
    if (row && format === "template") { setOpenId(document.id); setStatus(t("courses.wb.pickFormat")); return; }
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
    setStatus(format && format !== "original" ? t("courses.wb.preparingAs", { name: displayName(document.name), format: format.toUpperCase() }) : t("courses.wb.preparing", { name: displayName(document.name) }));
    const file = await onDownloadDocument(document, format);
    if (!file) { setStatus(t("courses.wb.nothingDownload")); return; }
    download(file.fileName || document.name, file.contentBase64, file.mimeType);
    setStatus("");
  }

  /** Several files (or a whole folder) come down as one zip that keeps the folder structure. */
  async function downloadMany(documents, zipName, zipFormat = "") {
    if (!onDownloadDocument || !documents.length) return;
    setStatus(t.plural("courses.wb.preparingMany", documents.length));
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
    if (!added) { setStatus(t("courses.wb.noneDownloaded")); return; }
    const blob = await zip.generateAsync({ type: "base64" });
    download(`${zipName || "luna-files"}.zip`, blob, "application/zip");
    setStatus(t.plural("courses.wb.downloadedN", added));
  }

  /**
   * Choosing files or a folder first asks where they go (the folder selected in the workspace is pre-chosen and
   * shown in grey); a topic with no folders yet gets one named on the spot.
   */
  async function upload(fileList) {
    const files = [...fileList];
    if (!files.length || !onUpload) return;
    if (!currentSubjectId) {
      // No subjects exist yet — ask for one so the upload has a home.
      const name = window.prompt(t("courses.wb.namePrompt"));
      if (!name?.trim()) { setStatus(t("courses.wb.uploadCancelled")); return; }
      const created = await onCreateSubject?.(name.trim());
      const subjectId = created?.id || workspace?.subjects?.[0]?.id || "";
      if (!subjectId) { setStatus(t("courses.wb.createFailed")); return; }
      await runUpload(files, subjectNode(subjectId));
      return;
    }
    setUploadPicker({ files });
  }

  /** Uploading a folder recreates its subfolders under the destination, so a tree comes in as a tree. Sent in batches, with a progress panel. */
  async function runUpload(files, targetNodeId) {
    const target = parseNode(targetNodeId);
    const uploadSubjectId = target.subjectId || currentSubjectId;
    if (sharedTopic(uploadSubjectId)) { setStatus(t("courses.wb.sharedNoUpload")); return; }
    const uploadedHome = subjectStructure((workspace?.subjects || []).find((entry) => entry.id === uploadSubjectId)?.folders || []).uploadedId;
    const base = target.kind === "folder" ? target.folderId : (uploadedHome || "");
    const destination = pathOf(folders, target.kind === "folder" ? targetNodeId : (uploadedHome ? folderNode(uploadSubjectId, uploadedHome) : targetNodeId));
    const { batches: planned, tooLarge } = planUploadBatches(files);
    const totalBytes = files.reduce((sum, file) => sum + Number(file.size || 0), 0);
    const progress = { total: files.length, done: 0, doneBytes: 0, totalBytes, startedAt: Date.now(), now: Date.now(), current: "", destination, failures: tooLarge.map((file) => ({ name: file.name, reason: tooLargeMessage(file) })), finished: false };
    const publish = () => setUploadProgress({ ...progress, failures: [...progress.failures], now: Date.now() });
    publish();
    const tick = setInterval(publish, 1000);
    try {
      const created = new Map();
      const folderFor = async (file) => {
        const parts = String(file.webkitRelativePath || "").split("/").slice(0, -1);
        let parentId = base;
        for (const part of parts) {
          const key = `${parentId}/${part}`;
          if (!created.has(key)) {
            const folder = await onCreateFolder?.(part, parentId, uploadSubjectId);
            created.set(key, folder?.id || parentId);
          }
          parentId = created.get(key);
        }
        return parentId;
      };
      const folderOfFile = new Map();
      for (const file of planned.flat()) folderOfFile.set(file, await folderFor(file));
      // One request per destination folder, packed into size-limited batches.
      const byFolder = new Map();
      for (const file of planned.flat()) byFolder.set(folderOfFile.get(file), [...(byFolder.get(folderOfFile.get(file)) || []), file]);
      const send = async (group, folderId) => {
        progress.current = group.length === 1 ? group[0].name : t("courses.wb.andMore", { name: group[0].name, count: group.length - 1 });
        publish();
        await onUpload(group, { folderIds: folderId ? [folderId] : [], subjectId: uploadSubjectId });
        progress.done += group.length;
        progress.doneBytes += group.reduce((sum, file) => sum + Number(file.size || 0), 0);
      };
      for (const [folderId, group] of byFolder) {
        for (const batch of planUploadBatches(group).batches) {
          try {
            await send(batch, folderId);
          } catch (error) {
            // One bad file should not sink its batch: retry the files one by one to find it.
            if (batch.length === 1) progress.failures.push({ name: batch[0].name, reason: String(error?.message || error) });
            else for (const file of batch) {
              try { await send([file], folderId); } catch (single) { progress.failures.push({ name: file.name, reason: String(single?.message || single) }); }
            }
          }
          publish();
        }
      }
      setStatus(progress.failures.length ? t("courses.wb.uploadPartial", { done: progress.done, total: files.length, failed: progress.failures.length }) : t.plural("courses.wb.uploadedN", files.length));
    } catch (error) {
      progress.failures.push({ name: t("courses.wb.uploadLabel"), reason: String(error?.message || error) });
      setStatus(String(error?.message || error));
    } finally {
      clearInterval(tick);
      progress.finished = true;
      progress.current = "";
      publish();
      if (!progress.failures.length) setTimeout(() => setUploadProgress((value) => (value && value.finished && !value.failures.length ? null : value)), 4000);
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
    // The window stays open after checking: that is when the answers are read.
    try {
      await onSaveGeneratedQuizDocument?.({ folderIds: [], tags: ["activity-attempt"], file: { name: `${attempt.activityTitle || "Activity"} · attempt.json`, content, preview: `${attempt.score}/${attempt.total}`, sizeBytes: content.length } }, row?.document.subjectId);
      setStatus(t("courses.wb.saved", { score: attempt.score, total: attempt.total }));
    } catch { /* the attempt still shows locally */ }
  }

  if (!workspace) return null;

  const meta = (document) => {
    const row = rowsByDocumentId.get(document.id);
    const stats = row ? resourceStats(document.id, row.resource.activity?.id, rawDocuments) : null;
    return (
      <span className="flex flex-wrap items-center gap-1 text-[11px] text-soft-ink">
        <span className={`${chip} ${document.sourceType === "generated" ? "bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "bg-[var(--surface-soft)] text-soft-ink"}`}>{document.sourceType === "generated" ? t("courses.wb.chipGenerated") : t("courses.wb.chipMaterial")}</span>
        {sharedInfoOf(document) ? <span className={`${chip} bg-[#e8f2ff] text-[#0058b0]`} title={sharedInfoOf(document).permission === "edit" ? t("courses.wb.sharedEditTip") : t("courses.wb.sharedViewTip")}>{t("courses.wb.sharedBy", { name: sharedInfoOf(document).ownerName || t("courses.wb.anotherAccount") })} · {sharedInfoOf(document).permission === "edit" ? t("courses.wb.canEdit") : t("courses.wb.canView")}</span> : isSharedDocument(document) ? <span className={`${chip} bg-[#e8f2ff] text-[#0058b0]`} title={t("courses.wb.readOnlyTip")}>{t(isAssignedDocument(document) ? "courses.wb.assignedBy" : "courses.wb.sharedBy", { name: senderNameOf(document, folders) || t("courses.wb.anotherAccount") })}{dueDateOf(document) ? ` · ${t("courses.wb.due", { date: dueDateOf(document) })}${dueInfoOf(document).imposed ? `, ${t("courses.wb.setBy", { name: senderNameOf(document, folders) || t("courses.wb.theSender") })}` : ""}` : ""}</span> : null}
        {isFavourite(document) ? <span className={`${chip} bg-[#fff3cd] text-[#8a5a00]`}>★</span> : null}
        {row?.resource.meta?.questionCount ? <span className={`${chip} bg-[var(--surface-soft)] text-soft-ink`}>{t("courses.wb.nQuestions", { count: row.resource.meta.questionCount })}</span> : null}
        {resourceDifficulty(document) ? <span className={`${chip} bg-[var(--surface-soft)] text-soft-ink`}>{resourceDifficulty(document)}</span> : null}
        {stats?.times ? <span className={`${chip} bg-[var(--surface-soft)] text-soft-ink`}>{t("courses.wb.doneTimes", { count: stats.times })}</span> : null}
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
    // A document someone sent you is read-only: no rename, delete, retag or regenerate (the server refuses them too).
    const sharedWithMe = sharedInfoOf(document);
    const locked = isSharedDocument(document) || Boolean(sharedWithMe);
    return (
      <span className="flex shrink-0 items-center gap-1" onClick={(event) => event.stopPropagation()}>
        {/* On a phone (max-sm: beats the inline-flex inside ghostBtn, which a plain "hidden" does not) Open, favourite and download live in the ⋯ menu so a row is only its name and one button. */}
        <button type="button" className={`${ghostBtn} max-sm:hidden`} onClick={() => (row ? setOpenId(document.id) : setPreview(document))}>{row ? t("common.open") : t("courses.wb.preview")}</button>
        <RowMenu
          items={[
            { label: row ? t("common.open") : t("courses.wb.preview"), icon: "👁", className: "sm:hidden", onSelect: () => (row ? setOpenId(document.id) : setPreview(document)) },
            { label: isFavourite(document) ? t("courses.wb.unfav") : t("courses.wb.fav"), icon: isFavourite(document) ? "★" : "☆", onSelect: () => toggleFavourite(document) },
            ...(document.sourceType === "generated" ? FORMATS.generated : FORMATS.uploaded).map((value) => ({ label: t("courses.wb.downloadAs", { format: t(`courses.wb.fmt.${value}`) }), icon: "⤓", onSelect: () => downloadOne(document, value) })),
            reviewing && onReviewDocument ? { label: t("courses.wb.approve"), icon: "✓", onSelect: () => onReviewDocument(document.id, { decision: "approved", subjectId: document.subjectId }).then(() => setStatus(t("courses.wb.approved", { name: displayName(document.name) }))) } : null,
            reviewing && onReprocessDocument ? { label: t("courses.wb.reread"), icon: "↻", onSelect: () => { setStatus(t("courses.wb.rereading", { name: displayName(document.name) })); onReprocessDocument(document.id, { subjectId: document.subjectId }).then(() => setStatus(t("courses.wb.rereadDone"))); } } : null,
            !row && onMakeFrom ? { label: t("courses.wb.makeQuiz"), icon: "✎", onSelect: () => onMakeFrom("quiz-generator", [document.id]) } : null,
            !row && onMakeFrom ? { label: t("courses.wb.makeLevel"), icon: "◎", onSelect: () => onMakeFrom("level-test", [document.id]) } : null,
            !row && onMakeFrom ? { label: t("courses.wb.makeProblems"), icon: "∑", onSelect: () => onMakeFrom("math-problem-set", [document.id]) } : null,
            !row && onMakeFrom ? { label: t("courses.wb.makeFlash"), icon: "▭", onSelect: () => onMakeFrom("concept-flashcards", [document.id]) } : null,
            !row && onMakeFrom ? { label: t("courses.wb.summarise"), icon: "☰", onSelect: () => onMakeFrom("document-summarizer", [document.id]) } : null,
            row ? { label: t("courses.wb.addToPlan"), icon: "◷", onSelect: () => setPlanningRow(row) } : { label: t("courses.wb.addToPlan"), icon: "◷", onSelect: () => setPlanningRow({ document, resource: { name: document.name } }) },
            { label: t("courses.wb.askLuna"), icon: "💬", onSelect: () => askLuna({ documentIds: [document.id], text: t("courses.wb.helpStudy", { name: displayName(document.name) }) }) },
            row && canUpdateResource(row.resource) ? { label: t("courses.wb.update"), icon: "✦", onSelect: () => setUpdatingRow(row) } : null,
            ...(locked ? [] : [
            onShareDocument ? { label: t("courses.wb.shareWith"), icon: "↗", onSelect: () => onShareDocument(document) } : null,
            row && onRegenerateResource ? { label: t("courses.wb.regenerate"), icon: "✨", onSelect: () => onRegenerateResource(document.id) } : null,
            onMoveDocuments ? { label: selectedIds.length > 1 && selectedIds.includes(document.id) ? t("courses.wb.moveSelected", { count: selectedIds.length }) : t("courses.wb.moveTo"), icon: "⇄", onSelect: () => setMovePicker({ documentIds: selectedIds.length > 1 && selectedIds.includes(document.id) ? selectedIds : [document.id] }) } : null,
            { label: t("courses.wb.tags"), icon: "🏷", onSelect: () => editTags(document) },
            { label: t("common.rename"), icon: "✎", onSelect: () => renameDocument(document) },
            { label: t("common.delete"), icon: "🗑", danger: true, onSelect: () => { if (window.confirm(t("courses.wb.confirmDeleteOne", { name: displayName(document.name) }))) removeDocuments([document.id]); } }
            ]),
            sharedWithMe?.permission === "edit" ? { label: t("common.rename"), icon: "✎", onSelect: () => renameDocument(document) } : null,
            sharedWithMe?.root ? { label: t("courses.wb.leaveShare"), icon: "↩", onSelect: () => requestLeaveShare(sharedWithMe.grantId) } : null,
            locked && sharedWithMe ? { label: sharedWithMe.permission === "edit" ? t("courses.wb.lockEdit") : t("courses.wb.lockView"), icon: "🔒", onSelect: () => setStatus(sharedWithMe.permission === "edit" ? t("courses.wb.lockEditMsg", { name: sharedWithMe.ownerName }) : t("courses.wb.lockViewMsg", { name: sharedWithMe.ownerName })) } : locked ? { label: t("courses.wb.lockSent"), icon: "🔒", onSelect: () => setStatus(t("courses.wb.lockSentMsg")) } : null
          ]}
        />
      </span>
    );
  };

  /* Where each visible document sits and which folders are inside which: the tree and the gallery read both. */
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

  /** Drop target props for a folder (tree row or gallery tile): documents and folders dragged onto it move there. */
  const dropOn = (folderId) => ({
    onDragOver: (e) => { e.preventDefault(); e.currentTarget.style.background = "var(--accent-soft)"; },
    onDragLeave: (e) => { e.currentTarget.style.background = ""; },
    onDrop: (e) => {
      e.stopPropagation();
      e.currentTarget.style.background = "";
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      if (drag.type === "file") move(drag.ids || [drag.id], folderId);
      else if (drag.type === "folder" && drag.id !== folderId) moveFolder(drag.id, folderId);
    }
  });

  /**
   * The gallery: like a course dashboard, every top-level folder is a big coloured tile; opening one
   * shows its folders as tiles and its documents as cards, one level at a time, with a path to go back.
   * Same data, menus, selection and drag and drop as the tree — only the layout differs.
   */
  function renderGallery() {
    const here = galleryId ? folders.find((folder) => folder.id === galleryId) : null;
    const at = here ? here.id : "";
    const trail = [];
    for (let node = here; node; node = node.parentFolderId ? folders.find((folder) => folder.id === node.parentFolderId) : null) trail.unshift(node);
    const subfolders = childrenOf.get(at) || [];
    const docs = at ? docsByNode.get(at) || [] : visible.filter((document) => !(document.folderIds || []).some((id) => folders.some((folder) => folder.id === id)));
    const shortcut = here && isReferenceShortcut(here, folders);
    const uploadedTarget = shortcut ? folders.find((entry) => entry.subjectId === here.subjectId && entry.name === UPLOADED_FOLDER && entry.parentFolderId === subjectNode(entry.subjectId)) : null;
    const open = (folder) => {
      const linked = isReferenceShortcut(folder, folders) ? folders.find((entry) => entry.subjectId === folder.subjectId && entry.name === UPLOADED_FOLDER && entry.parentFolderId === subjectNode(entry.subjectId)) : null;
      setGalleryId((linked || folder).id);
    };
    const top = !at;
    if (top && !subfolders.length && !docs.length) {
      return <EmptyState title={t("courses.wb.emptyTitle")} text={t("courses.wb.emptyText")} action={t("courses.wb.uploadFiles")} onAction={() => fileRef.current?.click()} secondary={t("courses.wb.uploadFolder")} onSecondary={() => folderRef.current?.click()} />;
    }
    return (
      <div className="grid gap-4">
        <nav aria-label={t("courses.wb.galleryPath")} className="flex flex-wrap items-center gap-1 text-sm">
          <button type="button" className={`rounded-lg px-1.5 py-0.5 font-semibold transition hover:bg-[var(--surface-soft)] ${top ? "text-ink" : "text-[var(--accent-ink)]"}`} onClick={() => setGalleryId("")}>{t("courses.wb.allFolders")}</button>
          {trail.map((node, index) => (
            <span key={node.id} className="flex min-w-0 items-center gap-1">
              <span className="text-soft-ink" aria-hidden>›</span>
              <button type="button" className={`max-w-[14rem] truncate rounded-lg px-1.5 py-0.5 font-semibold transition hover:bg-[var(--surface-soft)] ${index === trail.length - 1 ? "text-ink" : "text-[var(--accent-ink)]"}`} aria-current={index === trail.length - 1 ? "page" : undefined} onClick={() => setGalleryId(node.id)} {...dropOn(node.id)}>{node.name}</button>
            </span>
          ))}
          {here ? <span className="ml-auto">{folderMenu(here)}</span> : null}
        </nav>

        {shortcut ? (
          <p className="m-0 text-sm">
            <span aria-hidden>↪ </span>
            {uploadedTarget ? <button type="button" className="font-semibold text-[var(--accent-ink)] hover:underline" onClick={() => setGalleryId(uploadedTarget.id)}>{t.plural("courses.wb.linked", countVisible(uploadedTarget.id), { name: UPLOADED_FOLDER })}</button> : <span className="text-soft-ink">{t("courses.wb.linkedTopic")}</span>}
          </p>
        ) : null}

        {subfolders.length ? (
          <div className={`grid gap-3 ${top ? "grid-cols-[repeat(auto-fill,minmax(min(100%,230px),1fr))]" : "grid-cols-[repeat(auto-fill,minmax(min(100%,180px),1fr))]"}`}>
            {subfolders.map((folder) => {
              const colour = top ? galleryColour(folder) : "";
              const inside = childrenOf.get(folder.id) || [];
              const total = countVisible(folder.id);
              const linked = isReferenceShortcut(folder, folders);
              return (
                <div key={folder.id} {...dropOn(folder.id)}
                  draggable={!folder.isSubject}
                  onDragStart={(e) => { e.stopPropagation(); dragRef.current = { type: "folder", id: folder.id }; }}
                  onDragEnd={() => { dragRef.current = null; }}
                  className={`group relative flex min-w-0 flex-col overflow-hidden rounded-[18px] border border-ink/8 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)] transition hover:shadow-[0_2px_4px_rgba(0,0,0,0.05),0_14px_32px_rgba(0,0,0,0.09)] ${selectedFolderIds.includes(folder.id) ? "ring-2 ring-[var(--accent)]" : ""}`}>
                  <button type="button" className="flex min-w-0 flex-1 flex-col text-left" onClick={() => open(folder)} aria-label={t("courses.wb.openFolder", { name: folder.name })}>
                    {top ? (
                      <span className="grid h-24 place-items-center" style={{ background: colour }} aria-hidden>
                        <svg viewBox="0 0 24 24" className="size-10 fill-white/90"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.6c.66 0 1.3.26 1.77.73L12.4 6.3h6.1A2.5 2.5 0 0 1 21 8.8v8.7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" /></svg>
                      </span>
                    ) : (
                      <span className="grid h-16 place-items-center bg-[var(--surface-soft)] text-3xl" aria-hidden>{linked ? "🔗" : "📁"}</span>
                    )}
                    <span className="grid min-w-0 gap-0.5 px-3.5 py-3">
                      <span className="truncate text-[15px] font-bold text-ink" style={top ? { color: colour } : undefined}>{folder.name}</span>
                      <span className="text-[11px] text-soft-ink">
                        {[inside.length ? t.plural("courses.wb.nFolders", inside.length) : "", t.plural("courses.wb.items", total)].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </button>
                  {folder.shared ? <span className={`${chip} absolute left-2.5 top-2.5 bg-white/95 text-[#0058b0]`} title={folder.shared.permission === "edit" ? t("courses.wb.sharedEditTip") : t("courses.wb.sharedViewTip")}>{folder.shared.permission === "edit" ? t("courses.wb.canEdit") : t("courses.wb.canView")}</span> : null}
                  <span className="absolute right-2 top-2">{folderMenu(folder)}</span>
                </div>
              );
            })}
          </div>
        ) : null}

        {docs.length ? (
          <div className="grid gap-2">
            {subfolders.length ? <p className={kicker}>{t("courses.wb.galleryFiles")}</p> : null}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,200px),1fr))] gap-3">
              {docs.map((document) => (
                <div key={document.id} draggable
                  onDragStart={(e) => { e.stopPropagation(); dragRef.current = dragFile(document); }}
                  onDragEnd={() => { dragRef.current = null; }}
                  className={`group relative flex min-w-0 flex-col rounded-[16px] border bg-white p-3 transition hover:shadow-[0_8px_24px_rgba(0,0,0,0.07)] ${selectedIds.includes(document.id) ? "border-[var(--accent)] bg-[var(--accent-soft)]/30" : "border-ink/8"}`}>
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <span className={`grid size-10 shrink-0 place-items-center rounded-xl text-xl ${document.sourceType === "generated" ? "bg-[var(--accent-soft)]" : "bg-[var(--surface-soft)]"}`} aria-hidden>{document.sourceType === "generated" ? "✨" : "📄"}</span>
                    {onMoveDocuments && !isSharedDocument(document) ? (
                      <input type="checkbox" aria-label={t("courses.wb.selectDoc", { name: displayName(document.name) })} className={`mt-1 size-4 shrink-0 cursor-pointer accent-[var(--accent)] transition focus:opacity-100 ${selectedIds.length ? "" : "opacity-0 group-hover:opacity-100 max-[760px]:opacity-100"}`} checked={selectedIds.includes(document.id)} onChange={() => toggleSelected(document.id)} />
                    ) : null}
                  </div>
                  <button type="button" className="mb-1 min-w-0 text-left" onClick={() => (rowsByDocumentId.has(document.id) ? setOpenId(document.id) : setPreview(document))}>
                    <span className="line-clamp-2 text-sm font-semibold leading-snug text-ink">{displayName(document.name)}</span>
                  </button>
                  <div className="mt-auto grid gap-2">
                    {meta(document)}
                    <div className="flex justify-end">{actions(document)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {!top && !subfolders.length && !docs.length && !shortcut ? <p className="py-6 text-center text-sm text-soft-ink">{t("courses.wb.galleryEmpty")}</p> : null}
      </div>
    );
  }

  /** The ⋯ menu of one of your own folders (the tree and the gallery share it); none on what was shared with you. */
  const folderMenu = (folder) => (!folder.shared && !isReservedSubjectName((workspace.subjects || []).find((entry) => entry.id === folder.subjectId)?.name) ? (
    <span onClick={(e) => e.stopPropagation()}>
      <RowMenu
        label={t("courses.wb.actionsFor", { name: folder.name })}
        items={[
          (onCreateFolder || onCreateSubject) ? { label: t("courses.tree.newSub"), icon: "＋", onSelect: () => { const name = window.prompt(t("courses.tree.folderName")); if (name?.trim()) createFolder(name.trim(), folder.id); } } : null,
          { label: t("common.rename"), icon: "✎", onSelect: () => promptRenameFolder(folder) },
          onShareDocument ? { label: t("courses.wb.share"), icon: "↗", onSelect: () => onShareDocument({ kind: folder.isSubject ? "subject" : "folder", id: folder.isSubject ? folder.subjectId : folder.folderId, name: folder.name }) } : null,
          onMoveFolder && !folder.isSubject ? { label: t("courses.wb.moveTo"), icon: "⇄", onSelect: () => setMovePicker({ folderNodeId: folder.id }) } : null,
          { label: t("common.delete"), icon: "🗑", danger: true, onSelect: () => { if (window.confirm(t("courses.wb.confirmDeleteFolder", { name: folder.name }))) removeFolder(folder.id); } }
        ]}
      />
    </span>
  ) : null);

  return (
    <section className="tw-scope grid items-start gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className={`${card} relative grid min-w-0 content-start gap-3 p-4 lg:sticky lg:top-4`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={kicker}>{workspace.name}</p>
            <p className="m-0 mt-0.5 text-[11px] text-soft-ink">{t.plural("courses.wb.items", allDocuments.length)}</p>
          </div>
          {/* Phone: the filters, uploads and downloads fold into this menu so the folders are what you see. */}
          <button type="button" className="grid size-10 shrink-0 place-items-center rounded-full border border-ink/15 bg-white text-xl leading-none text-ink lg:hidden" aria-label={toolsOpen ? t("courses.wb.closeMenu") : t("courses.wb.openMenu")} aria-expanded={toolsOpen} onClick={() => setToolsOpen((value) => !value)}>{toolsOpen ? "✕" : "＋"}</button>
        </div>

        <input className={`${field} w-full`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("courses.wb.searchPh")} aria-label={t("courses.wb.searchAria")} />

        {toolsOpen ? <button type="button" aria-label={t("courses.wb.closeMenu")} className="fixed inset-0 z-40 cursor-default bg-black/30 lg:hidden" onClick={() => setToolsOpen(false)} /> : null}
        <div className={`${toolsOpen ? "grid" : "hidden"} fixed inset-x-3 bottom-24 top-20 z-50 content-start gap-3 overflow-y-auto rounded-2xl border border-ink/10 bg-white p-4 shadow-[0_16px_48px_rgba(0,0,0,0.25)] lg:static lg:inset-auto lg:z-auto lg:grid lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none`}>
        <div className="sticky top-0 z-10 -mx-4 -mt-4 flex items-center justify-between bg-white px-4 py-3 lg:hidden">
          <p className="m-0 text-sm font-bold text-ink">{t("courses.wb.filters")}</p>
          <button type="button" className="rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-white" onClick={() => setToolsOpen(false)}>{t("common.close")}</button>
        </div>
        <div>
          <p className={`${kicker} mb-1.5`}>{t("courses.wb.show")}</p>
          <div className="flex flex-wrap gap-1">
            {KINDS.map((entry) => <button key={entry.id} type="button" onClick={() => setKind(entry.id)} className={`${chip} transition ${kind === entry.id ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-soft)] text-soft-ink hover:bg-ink/8"}`}>{t(entry.labelKey)}</button>)}
          </div>
        </div>

        <div>
          <p className={`${kicker} mb-1`}>{t("courses.wb.date")}</p>
          <select className={`${field} w-full text-xs`} value={dateSort} onChange={(e) => setDateSort(e.target.value)}>
            <option value="newest">{t("courses.wb.newest")}</option>
            <option value="oldest">{t("courses.wb.oldest")}</option>
          </select>
        </div>

        {studyPlans.length ? (
          <div>
            <p className={`${kicker} mb-1`}>{t("courses.wb.studyPlan")}</p>
            <select className={`${field} w-full text-xs`} value={planFilter} onChange={(e) => setPlanFilter(e.target.value)}>
              <option value="">{t("courses.wb.allPlans")}</option>
              {studyPlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
            </select>
          </div>
        ) : null}

        {allTopics.length ? (
          <div>
            <p className={`${kicker} mb-1.5`}>{t("courses.wb.topic")}</p>
            <div className="flex flex-wrap gap-1">
              {allTopics.map((topic) => <button key={topic} type="button" onClick={() => setTopicFilter(topicFilter === topic ? "" : topic)} className={`${chip} transition ${topicFilter === topic ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-soft)] text-soft-ink hover:bg-ink/8"}`}>{topic}</button>)}
            </div>
          </div>
        ) : null}

        {allTags.length ? (
          <div>
            <p className={`${kicker} mb-1.5`}>{t("courses.wb.tags")}</p>
            <div className="flex flex-wrap gap-1">
              {allTags.map((entry) => <button key={entry} type="button" onClick={() => setTag(tag === entry ? "" : entry)} className={`${chip} transition ${tag === entry ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-soft)] text-soft-ink hover:bg-ink/8"}`}>{entry}</button>)}
            </div>
          </div>
        ) : null}

        <div className="grid gap-1.5 border-t border-ink/8 pt-3">
          {/* One main action; the rest is under "More". */}
          <button type="button" className="inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0077ed] disabled:opacity-50" disabled={isWorking} onClick={() => fileRef.current?.click()}>⇪ {t("courses.wb.uploadFiles")}</button>
          {needsReview.length ? (
            <button type="button" onClick={() => setNodeId(reviewing ? "" : "__review")}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition ${reviewing ? "bg-[var(--accent-soft)] font-semibold text-[var(--accent-ink)]" : "hover:bg-[var(--surface-soft)]"}`}>
              <span aria-hidden>🛡</span><span>{t("courses.wb.needsLook")}</span>
              <span className="ml-auto rounded-full bg-[rgba(255,149,0,0.18)] px-1.5 text-[10px] font-bold text-[#b25e00]">{needsReview.length}</span>
            </button>
          ) : null}
          <details className="group">
            <summary className="cursor-pointer list-none px-1 text-xs font-semibold text-soft-ink hover:text-ink [&::-webkit-details-marker]:hidden"><span className="mr-1 inline-block transition group-open:rotate-90" aria-hidden>▸</span>{t("common.more")}</summary>
            <div className="mt-1.5 grid gap-1.5">
              {onCreateSubject ? (
                <button type="button" className={ghostBtn} onClick={() => { const name = window.prompt(t("courses.tree.folderName")); if (name?.trim()) onCreateSubject(name.trim()); }}>＋ {t("courses.tree.newFolder")}</button>
              ) : null}
              <button type="button" className={ghostBtn} disabled={isWorking} onClick={() => folderRef.current?.click()}>⇪ {t("courses.wb.uploadFolder")}</button>
              {!needsReview.length ? (
                <button type="button" onClick={() => setNodeId(reviewing ? "" : "__review")}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition ${reviewing ? "bg-[var(--accent-soft)] font-semibold text-[var(--accent-ink)]" : "hover:bg-[var(--surface-soft)]"}`}>
                  <span aria-hidden>🛡</span><span>{t("courses.wb.checkText")}</span>
                </button>
              ) : null}
              <label className="grid gap-1 text-[11px] font-semibold text-soft-ink">{t("courses.wb.downloadVisible")}
                <select className={field} value="" disabled={!visible.length} onChange={(e) => { if (e.target.value) downloadMany(visible, workspace.name, e.target.value); e.target.value = ""; }}>
                  <option value="">{t("courses.wb.chooseFormat")}</option>
                  {[["original", t("courses.wb.dlOriginal")], ["html", "HTML"], ["markdown", "Markdown"], ["json", "JSON"], ["txt", t("courses.wb.fmt.txt")]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            </div>
          </details>
          <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
          <input ref={folderRef} type="file" multiple webkitdirectory="" directory="" className="hidden" onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
        </div>
        </div>
      </aside>

      {/* ── Finder tree ─────────────────────────────────────────────────── */}
      <div className={`${card} min-w-0 p-4`}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="m-0 text-sm font-bold text-ink">{reviewing ? t("courses.wb.reviewTitle") : view === "gallery" ? t("courses.wb.galleryTitle") : t("courses.wb.allFolders")}</p>
            <p className="m-0 text-[11px] text-soft-ink">{t.plural("courses.wb.items", visible.length)}</p>
          </div>
          {!reviewing ? (
            <div className="flex shrink-0 items-center gap-2">
              {view === "list" && folders.length ? (
                <button type="button" className={`${ghostBtn} max-sm:hidden`}
                  onClick={() => setOpenNodes((prev) => prev.size ? new Set() : new Set(folders.map((f) => f.id)))}>
                  {openNodes.size ? t("courses.wb.collapseAll") : t("courses.wb.expandAll")}
                </button>
              ) : null}
              <div role="group" aria-label={t("courses.wb.viewAs")} className="inline-flex rounded-full bg-[var(--surface-soft)] p-0.5">
                {[["list", "☰", t("courses.wb.viewList")], ["gallery", "▦", t("courses.wb.viewGallery")]].map(([id, icon, label]) => (
                  <button key={id} type="button" aria-pressed={view === id} onClick={() => chooseView(id)}
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition ${view === id ? "bg-white text-ink shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-soft-ink hover:text-ink"}`}>
                    <span aria-hidden>{icon}</span>{label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {status ? (
          <p className="mb-3 text-xs text-[var(--accent-ink)]" role="status">
            {status}{isWorking ? " …" : ""}
            {undo && undo.text === status && !isWorking ? <button type="button" className="ml-2 font-semibold underline" onClick={runUndo}>{t("courses.wb.undo")}</button> : null}
          </p>
        ) : null}

        {selectedIds.length || selectedFolderIds.length ? (() => {
          // What can be done with the chosen material, right where it is: no need to find the right tool first.
          const picked = selectedIds.map((id) => rawDocuments.find((document) => document.id === id)).filter(Boolean);
          const material = picked.filter((document) => document.sourceType !== "generated");
          const materialIds = material.map((document) => document.id);
          const single = picked.length === 1 ? picked[0] : null;
          const singleRow = single ? rowsByDocumentId.get(single.id) : null;
          return (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-[var(--accent-soft)]/40 px-3 py-2 text-xs text-ink">
              <span className="font-semibold">{t("courses.browser.selected", { count: selectedIds.length + selectedFolderIds.length })}{selectedFolderIds.length ? ` (${t.plural("courses.wb.nFolders", selectedFolderIds.length)})` : ""}</span>
              {materialIds.length && onMakeFrom ? (
                <>
                  <button type="button" className="inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#0077ed]" onClick={() => onMakeFrom("quiz-generator", materialIds)}>{t("courses.wb.makeQuiz")}</button>
                  <button type="button" className={ghostBtn} onClick={() => onMakeFrom("concept-flashcards", materialIds)}>{t("courses.wb.flashcards")}</button>
                  <button type="button" className={ghostBtn} onClick={() => onMakeFrom("level-test", materialIds)}>{t("courses.wb.levelTest")}</button>
                  <button type="button" className={ghostBtn} onClick={() => onMakeFrom("math-problem-set", materialIds)}>{t("courses.wb.problemSet")}</button>
                  <button type="button" className={ghostBtn} onClick={() => onMakeFrom("document-summarizer", materialIds)}>{t("courses.wb.summarise")}</button>
                </>
              ) : null}
              {materialIds.length && onPlanFrom ? <button type="button" className={ghostBtn} onClick={() => onPlanFrom(materialIds)}>{t("courses.wb.planIt")}</button> : null}
              {single && !materialIds.length ? <button type="button" className={ghostBtn} onClick={() => setPlanningRow(singleRow || { document: single, resource: { name: single.name } })}>{t("courses.wb.addToAPlan")}</button> : null}
              {single && materialIds.length && !onPlanFrom ? <button type="button" className={ghostBtn} onClick={() => setPlanningRow(singleRow || { document: single, resource: { name: single.name } })}>{t("courses.wb.addToAPlan")}</button> : null}
              {picked.length ? <button type="button" className={ghostBtn} onClick={() => askLuna({ documentIds: picked.map((document) => document.id), text: picked.length === 1 ? t("courses.wb.helpStudy", { name: picked[0].name }) : t("courses.wb.helpStudyMany") })}>{t("courses.wb.askLuna")}</button> : null}
              {onMoveDocuments || onMoveFolder ? <button type="button" className={ghostBtn} disabled={isWorking} onClick={() => setMovePicker({ documentIds: selectedIds, folderNodeIds: topSelectedFolders() })}>{t("courses.wb.moveTo")}</button> : null}
              <button type="button" className={`${ghostBtn} text-[var(--color-danger)]`} disabled={isWorking} onClick={deleteSelected}>{t("common.delete")}</button>
              <button type="button" className={ghostBtn} onClick={clearSelection}>{t("courses.browser.clear")}</button>
            </div>
          );
        })() : null}

        {reviewing ? (
          <div className="grid gap-1">
            {needsReview.length ? needsReview.map((document) => (
              <div key={document.id} className="flex items-center gap-2 rounded-xl border border-[rgba(255,149,0,0.25)] bg-[rgba(255,149,0,0.04)] px-3 py-2">
                <span className="shrink-0 text-sm" aria-hidden>📄</span>
                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => (rowsByDocumentId.has(document.id) ? setOpenId(document.id) : setPreview(document))}>
                  <p className="m-0 truncate text-sm font-medium text-ink">{displayName(document.name)}</p>
                  {meta(document)}
                </div>
                {actions(document)}
              </div>
            )) : <p className="py-4 text-center text-sm text-soft-ink">{t("courses.wb.noAttention")}</p>}
          </div>
        ) : view === "gallery" ? renderGallery() : (
          <div className="grid gap-0.5">
            {(() => {
              /* ── Finder tree builder ── */
              function renderFolderRow(folder, depth) {
                const isOpen = openNodes.has(folder.id);
                const docs = docsByNode.get(folder.id) || [];
                const children = childrenOf.get(folder.id) || [];
                const total = countVisible(folder.id);
                const paddingLeft = 8 + depth * 20;
                const shortcut = isReferenceShortcut(folder, folders);
                const uploadedTarget = shortcut ? folders.find((entry) => entry.subjectId === folder.subjectId && entry.name === UPLOADED_FOLDER && entry.parentFolderId === subjectNode(entry.subjectId)) : null;

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
                      if (drag.type === "file") { move(drag.ids || [drag.id], folder.id); }
                      else if (drag.type === "folder") { moveFolder(drag.id, folder.id); }
                    }}>
                    {/* Folder header — draggable so folders can be nested */}
                    <div
                      draggable
                      onDragStart={(e) => { e.stopPropagation(); dragRef.current = { type: "folder", id: folder.id }; }}
                      onDragEnd={() => { dragRef.current = null; }}
                      className="group flex cursor-pointer items-center gap-1.5 rounded-xl px-2 py-1.5 transition hover:bg-[var(--surface-soft)]" style={{ paddingLeft }}>
                      <button type="button" className="w-4 shrink-0 text-center text-[10px] text-soft-ink" onClick={() => toggleNode(folder.id)}>{isOpen ? "▾" : "▸"}</button>
                      {!folder.isSubject && !folder.shared && !isReservedSubjectName((workspace.subjects || []).find((entry) => entry.id === folder.subjectId)?.name) ? (
                        <input type="checkbox" aria-label={t("courses.wb.selectFolder", { name: folder.name })} className={`size-3.5 shrink-0 cursor-pointer accent-[var(--accent)] transition focus:opacity-100 ${selectedIds.length || selectedFolderIds.length ? "" : "opacity-0 group-hover:opacity-100 max-[760px]:opacity-100"}`} checked={selectedFolderIds.includes(folder.id)} onChange={() => toggleFolderSelected(folder.id)} onClick={(event) => event.stopPropagation()} />
                      ) : null}
                      <span className="shrink-0 text-sm" aria-hidden>{folder.isSubject ? "🗂" : shortcut ? "🔗" : "📁"}</span>
                      <span className="flex-1 min-w-0 truncate text-sm font-semibold text-ink" onClick={() => toggleNode(folder.id)}>{folder.name}</span>
                      {total ? <span className="shrink-0 text-[11px] text-soft-ink">{total}</span> : null}
                      {folder.shared ? <span className={`${chip} shrink-0 bg-[#e8f2ff] text-[#0058b0]`} title={folder.shared.permission === "edit" ? t("courses.wb.sharedEditTip") : t("courses.wb.sharedViewTip")}>{folder.shared.permission === "edit" ? t("courses.wb.canEdit") : t("courses.wb.canView")}</span> : null}
                      {folder.shared ? (
                        <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                          {folder.shared.permission === "edit" && onCreateFolder ? <button type="button" title={t("courses.tree.newSub")} className="rounded-lg px-1.5 py-0.5 text-[11px] text-soft-ink hover:bg-ink/8" onClick={() => { const name = window.prompt(t("courses.tree.folderName")); if (name?.trim()) createFolder(name.trim(), folder.id); }}>＋</button> : null}
                          {folder.shared.permission === "edit" && folder.folderId && !String(folder.folderId).startsWith("subj~") ? <button type="button" title={t("common.rename")} className="rounded-lg px-1.5 py-0.5 text-[11px] text-soft-ink hover:bg-ink/8" onClick={() => promptRenameFolder(folder)}>✎</button> : null}
                          {folder.shared.root ? <button type="button" title={t("courses.wb.leaveShare")} className="rounded-lg px-1.5 py-0.5 text-[11px] text-soft-ink hover:bg-ink/8" onClick={() => requestLeaveShare(folder.shared.grantId)}>↩</button> : null}
                        </span>
                      ) : null}
                      {/* On a phone there is no hover: the same actions, and "Move to…", live in the ⋯ menu. */}
                      {folderMenu(folder)}
                    </div>

                    {isOpen && (
                      <div>
                        {/* A plan's "Reference materials" is a link to the uploaded material, never a second copy of it. */}
                        {shortcut ? (
                          <div className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm" style={{ paddingLeft: paddingLeft + 20 }}>
                            <span aria-hidden>↪</span>
                            {uploadedTarget ? (
                              <button type="button" className="min-w-0 truncate text-left font-semibold text-[var(--accent-ink)] hover:underline" onClick={() => { setNodeId(uploadedTarget.id); setOpenNodes((current) => new Set([...current, uploadedTarget.id])); }}>
                                {t.plural("courses.wb.linked", countVisible(uploadedTarget.id), { name: UPLOADED_FOLDER })}
                              </button>
                            ) : <span className="text-soft-ink">{t("courses.wb.linkedTopic")}</span>}
                          </div>
                        ) : null}
                        {docs.map((document) => (
                          <div key={document.id}
                            draggable
                            onDragStart={(e) => { e.stopPropagation(); dragRef.current = dragFile(document); }}
                            onDragEnd={() => { dragRef.current = null; }}
                            className={`group flex items-center gap-2 rounded-xl px-2 py-1.5 transition hover:bg-[var(--surface-soft)] ${selectedIds.includes(document.id) ? "bg-[var(--accent-soft)]/40" : ""}`}
                            style={{ paddingLeft: paddingLeft + 20 }}>
                            {onMoveDocuments && !isSharedDocument(document) ? (
                              <input type="checkbox" aria-label={t("courses.wb.selectDoc", { name: displayName(document.name) })} className={`size-3.5 shrink-0 cursor-pointer accent-[var(--accent)] transition focus:opacity-100 ${selectedIds.length ? "" : "opacity-0 group-hover:opacity-100 max-[760px]:opacity-100"}`} checked={selectedIds.includes(document.id)} onChange={() => toggleSelected(document.id)} onClick={(event) => event.stopPropagation()} />
                            ) : null}
                            <span className="shrink-0 text-sm max-sm:hidden" aria-hidden>{document.sourceType === "generated" ? "✨" : "📄"}</span>
                            <div className="min-w-0 flex-1 cursor-pointer" onClick={() => (rowsByDocumentId.has(document.id) ? setOpenId(document.id) : setPreview(document))}>
                              <p className="m-0 truncate text-sm leading-tight text-ink">{displayName(document.name)}</p>
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
                return <EmptyState key="empty" title={t("courses.wb.emptyTitle")} text={t("courses.wb.emptyText")} action={t("courses.wb.uploadFiles")} onAction={() => fileRef.current?.click()} secondary={t("courses.wb.uploadFolder")} onSecondary={() => folderRef.current?.click()} />;
              }
              if (!roots.length && visible.length) {
                // Documents with no folder structure — flat list
                return visible.map((document) => (
                  <div key={document.id} draggable
                    onDragStart={() => { dragRef.current = dragFile(document); }}
                    onDragEnd={() => { dragRef.current = null; }}
                    className="flex items-center gap-2 rounded-xl px-2 py-1.5 transition hover:bg-[var(--surface-soft)]">
                    <span className="shrink-0 text-sm" aria-hidden>{document.sourceType === "generated" ? "✨" : "📄"}</span>
                    <div className="min-w-0 flex-1 cursor-pointer" onClick={() => (rowsByDocumentId.has(document.id) ? setOpenId(document.id) : setPreview(document))}>
                      <p className="m-0 truncate text-sm leading-tight text-ink">{displayName(document.name)}</p>
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
          onUpdate={canUpdateResource(openRow.resource) ? setUpdatingRow : undefined}
          onRestoreVersion={(row, versionId) => updateResource(row, (resource) => restoreVersion(resource, versionId))}
          notices={staleSources(openRow.resource, rawDocuments).map((source) => t("courses.wb.olderVersion", { name: source.name, date: new Date(source.updatedAt).toLocaleDateString(t.locale) }))}
          onDelete={(row) => removeDocuments([row.document.id])}
          onClassify={classify}
          onBulkClassify={bulkClassify}
          onSaveConcepts={(row, { concepts, context }) => updateResource(row, (resource) => ({ ...resource, concepts, context }))}
          onSaveHighlights={(row, list) => updateResource(row, (resource) => ({ ...resource, highlights: list }))}
          onSubmitAttempt={(attempt, documentId) => saveAttempt(attempt, documentId)}
          onSaveStyles={(row, outputStyles) => updateResource(row, (resource) => ({ ...resource, request: { ...(resource.request || {}), outputStyles } }))}
          onStatus={setStatus}
        />
      ) : null}

      {uploadPicker ? (() => {
        const hidden = new Set(subjectsList.filter((entry) => isReservedSubjectName(entry.name)).map((entry) => entry.id));
        const count = uploadPicker.files.length;
        const firstFolder = String(uploadPicker.files[0]?.webkitRelativePath || "").split("/")[0];
        return (
          <MoveDialog
            title={firstFolder && count > 1 ? t("courses.wb.uploadFolderTitle", { name: firstFolder, count }) : t.plural("courses.wb.uploadTitle", count)}
            subtitle={t("courses.wb.uploadSubtitle")}
            folders={folders.filter((entry) => !hidden.has(entry.subjectId))}
            initialId={view === "gallery" && !reviewing ? galleryId : nodeId && !reviewing ? nodeId : ""}
            confirmLabel={t("courses.wb.uploadHere")}
            pathLabel={t("courses.wb.uploadTo")}
            onCancel={() => setUploadPicker(null)}
            onPick={(targetNodeId) => { const { files } = uploadPicker; setUploadPicker(null); runUpload(files, targetNodeId); }}
          />
        );
      })() : null}
      <UploadProgress progress={uploadProgress} onClose={() => setUploadProgress(null)} />

      {movePicker ? (() => {
        const movingIds = movePicker.folderNodeIds || (movePicker.folderNodeId ? [movePicker.folderNodeId] : []);
        const moving = movingIds.length === 1 && !(movePicker.documentIds || []).length ? folders.find((entry) => entry.id === movingIds[0]) : null;
        const count = (movePicker.documentIds || []).length + (moving ? 0 : movingIds.length);
        const hidden = new Set(subjectsList.filter((entry) => isReservedSubjectName(entry.name)).map((entry) => entry.id));
        return (
          <MoveDialog
            title={moving ? t("courses.wb.moveOne", { name: moving.name }) : count === 1 ? t("courses.wb.moveOne", { name: allDocuments.find((entry) => entry.id === movePicker.documentIds[0])?.name || t("courses.wb.thisItem") }) : t("courses.wb.moveMany", { count })}
            subtitle={moving ? t("courses.wb.moveSubFolder") : t("courses.wb.moveSubDocs")}
            folders={folders.filter((entry) => !hidden.has(entry.subjectId))}
            disabledIds={movingIds.flatMap((id) => blockedTargets(folders, id))}
            onCancel={() => setMovePicker(null)}
            onPick={(targetNodeId) => {
              const picked = movePicker;
              setMovePicker(null);
              if (picked.folderNodeIds) moveSelected(targetNodeId);
              else if (picked.folderNodeId) moveFolder(picked.folderNodeId, targetNodeId);
              else move(picked.documentIds, targetNodeId);
            }}
          />
        );
      })() : null}

      {updatingRow ? (
        <UpdateDialog
          document={updatingRow.document}
          resource={updatingRow.resource}
          workspace={workspace}
          fallbackSubjectId={subjectsList.find((entry) => !isReservedSubjectName(entry.name))?.id || ""}
          onClose={() => setUpdatingRow(null)}
          onSaveGeneratedQuizDocument={onSaveGeneratedQuizDocument}
          onUpdateGeneratedDocument={onUpdateGeneratedDocument}
          onDone={(message) => { setStatus(message); setPlaying(null); }}
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
        <ReaderView
          resource={playing.resource}
          onOpenSource={(target) => {
            const original = rawDocuments.find((entry) => entry.id === target.documentId);
            if (original) { setPreviewScroll({ page: target.page, section: target.section }); setPreview(original); } else window.open(sourceHref(target), "_blank", "noopener");
          }}
          chat={{ documentId: playing.document.id }}
          originals={masterOriginals(playing.resource, t)}
          onDownloadOriginalById={originalDownloader(rawDocuments, onDownloadDocument, t)}
          highlights={playing.resource.highlights || []}
          onSaveHighlights={(list) => updateResource(playing, (resource) => ({ ...resource, highlights: list }))}
          onSubmit={(attempt) => saveAttempt(attempt, playing.document.id)}
          onUpdate={canUpdateResource(playing.resource) ? () => setUpdatingRow(playing) : undefined}
          onClose={() => setPlaying(null)}
        />
      ) : null}

      {preview ? (
        <DocumentReader
          document={preview}
          documents={rawDocuments}
          scrollTo={previewScroll}
          workspaceId={workspace?.id || ""}
          onOpenActivity={(documentId) => { const row = rowsByDocumentId.get(documentId); if (row) { setPreview(null); setPreviewScroll(null); setPlaying(row); } }}
          onClose={() => { setPreview(null); setPreviewScroll(null); }}
          onSaveGeneratedQuizDocument={onSaveGeneratedQuizDocument}
          onUpdateGeneratedDocument={onUpdateGeneratedDocument}
          onDownloadDocument={onDownloadDocument}
          onUpdateDocumentContent={isSharedDocument(preview) ? undefined : onUpdateDocumentContent}
        />
      ) : null}

      {/* A document someone sent you: say whose it is while it is open (it is read-only; notes and highlights still save). */}
      {[preview, openRow?.document, playing?.document].filter((entry) => entry && (isSharedDocument(entry) || sharedInfoOf(entry))).slice(0, 1).map((entry) => (
        <SharedNotice key={entry.id} by={sharedInfoOf(entry)?.ownerName || senderNameOf(entry, folders)} assigned={isAssignedDocument(entry)} due={dueDateOf(entry)} canEdit={sharedInfoOf(entry)?.permission === "edit"} live={Boolean(sharedInfoOf(entry))} />
      ))}
    </section>
  );
}
