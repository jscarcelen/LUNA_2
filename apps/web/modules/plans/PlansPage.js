"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DEADLINE_KINDS, ITEM_KINDS, PLAN_COLOURS, PLAN_TAG, buildPlan, dueLabel, newDeadline, newItem, nextDeadline, parsePlan, planProgress, planWeeks, upcoming, withSubPlans } from "./plan";
import { parseResource } from "../resources/resource";
import { conceptIndex, resourceConcepts } from "../resources/concepts";
import { joinAttempts } from "../performance/metrics";
import { PlanCalendar } from "./PlanCalendar";
import { PlanCard, Ring } from "./PlanCard";
import { GeneratePlanDialog } from "./GeneratePlanDialog";
import { executePlan } from "./execute";
import { RevisePlanDialog } from "./RevisePlanDialog";
import { isGeneratedDocument, splitDocuments } from "./revise";
import { BUILTIN_PLAN_AGENTS, planAgentCatalog } from "./agents";
import { ReaderView } from "../reader/ReaderView";
import { SubjectTabs } from "../ui/SubjectTabs";
import { DocumentReader } from "../reader/DocumentReader";
import { conceptNames, ensureCoverage, planCoverage } from "./coverage";
import { deletePlanEverything, ensurePlanFolders, planDeletionScope } from "./folders";
import { KnowledgeGraph } from "./KnowledgeGraph.js";
import { isAssignedDocument, isSharedDocument, senderNameOf } from "../accounts/shared";
import { buildConceptForest, capConceptTree } from "./conceptTree.js";
import { deadlineOrigin, effectiveDue, examDeadline } from "./deadlines.js";
import { DeadlineOrigin, OriginBadge } from "./DeadlineBadge";
import { ExamDatePicker, ExamDatesCard, PlanExamLink } from "./ExamDates";

const card = "rounded-[18px] border border-ink/8 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)]";
const kicker = "m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink";
const primaryBtn = "inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0077ed] disabled:opacity-50";
const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-[var(--surface-soft)]";
const field = "w-full rounded-xl border border-ink/12 bg-white px-3 py-2 text-sm text-ink";
const chip = "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold";

// ─── Skill-tag helpers ──────────────────────────────────────────────────────

const MATH_KEYWORDS = ["equation","formula","calcul","algebra","geom","statistic","probabilit","arithm","derivative","integral","mean","median","mode","variance","range","function","trigon","logarithm"];

/**
 * Infer human-readable skill-category tags from an item's kind + the resource's
 * concept levels and names. Returns [{label, cls}] where cls is a Tailwind string.
 */
function inferSkillTags(item, resource) {
  const tags = [];
  const concepts = resource?.concepts || [];
  const levels = new Set(concepts.map((c) => c.level).filter(Boolean));
  const names = concepts.map((c) => String(c.name || "").toLowerCase()).join(" ");

  if (item.kind === "read" || item.kind === "review") {
    tags.push({ label: "Reading", cls: "border-[#5856d6]/30 bg-[#5856d6]/10 text-[#5856d6]" });
  }
  if (item.kind === "exam") {
    tags.push({ label: "Assessment", cls: "border-[#ff3b30]/30 bg-[#ff3b30]/10 text-[#ff3b30]" });
  }
  if (levels.has("apply") || levels.has("analyse")) {
    tags.push({ label: "Problem-solving", cls: "border-[#ff9500]/30 bg-[#ff9500]/10 text-[#b86000]" });
  } else if (levels.has("understand") || levels.has("remember")) {
    tags.push({ label: "Conceptual", cls: "border-[#0071e3]/30 bg-[#0071e3]/10 text-[#0071e3]" });
  }
  if (MATH_KEYWORDS.some((kw) => names.includes(kw))) {
    tags.push({ label: "Maths", cls: "border-[#34c759]/30 bg-[#34c759]/10 text-[#1d7a44]" });
  }
  return tags;
}

// ─── Concept name fuzzy-matcher ──────────────────────────────────────────────

/**
 * Tries to find the best match for `oldName` among `newNames`.
 * Returns the matched new name, or null if no suitable match found.
 */
function fuzzyMatchConceptName(oldName, newNames) {
  const oldNorm = String(oldName || "").toLowerCase().trim();
  if (!oldNorm) return null;
  // Exact match
  const exact = newNames.find((n) => String(n || "").toLowerCase().trim() === oldNorm);
  if (exact) return exact;
  // Partial match: one name fully contains the other (min 4 chars to avoid false positives)
  const partial = newNames.find((n) => {
    const nNorm = String(n || "").toLowerCase().trim();
    return nNorm.length > 3 && oldNorm.length > 3 && (nNorm.includes(oldNorm) || oldNorm.includes(nNorm));
  });
  return partial || null;
}

// ─── Material picker modal ──────────────────────────────────────────────────

/** Flat folders array → tree with .children arrays. */
function buildFolderTree(folders = []) {
  const byId = {};
  for (const f of folders) byId[f.id] = { ...f, children: [] };
  const roots = [];
  for (const f of folders) {
    if (f.parentFolderId && byId[f.parentFolderId]) byId[f.parentFolderId].children.push(byId[f.id]);
    else roots.push(byId[f.id]);
  }
  return roots;
}

/** Collapsible folder node with checkboxes (used inside MaterialPickerModal). */
function FolderPickerNode({ node, depth = 0, docs, picked, onToggle, docLabel, badgeOf }) {
  const [expanded, setExpanded] = useState(true);
  const folderDocs = docs.filter((d) => (d.folderIds || (d.folderId ? [d.folderId] : [])).includes(node.id));
  const childDocCount = node.children.reduce((n, c) => n + docs.filter((d) => (d.folderIds || (d.folderId ? [d.folderId] : [])).includes(c.id)).length, 0);
  if (folderDocs.length + childDocCount === 0 && node.children.length === 0) return null;
  return (
    <div style={{ paddingLeft: depth * 12 }}>
      <button type="button" onClick={() => setExpanded((v) => !v)} className="flex w-full items-center gap-1.5 rounded-lg px-1 py-0.5 text-left text-xs font-semibold text-soft-ink transition hover:bg-ink/5">
        <span style={{ fontSize: 10 }}>{expanded ? "▾" : "▸"}</span>
        <span className="truncate">{node.name}</span>
        {(folderDocs.length + childDocCount) > 0 && <span className="ml-auto shrink-0 text-[10px] text-soft-ink/60">{folderDocs.length + childDocCount}</span>}
      </button>
      {expanded && (
        <div>
          {folderDocs.map((doc) => (
            <label key={doc.id} className="flex items-center gap-2 rounded-lg px-1 py-0.5 text-sm text-ink transition hover:bg-ink/5 cursor-pointer" style={{ paddingLeft: 20 }}>
              <input type="checkbox" checked={picked.includes(doc.id)} onChange={() => onToggle(doc.id)} className="shrink-0" />
              <span className="truncate">{docLabel(doc)}</span>
              {badgeOf?.(doc) ? <span className="ml-auto shrink-0 rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-[10px] font-semibold text-soft-ink">{badgeOf(doc)}</span> : null}
            </label>
          ))}
          {node.children.map((child) => <FolderPickerNode key={child.id} node={child} depth={depth + 1} docs={docs} picked={picked} onToggle={onToggle} docLabel={docLabel} badgeOf={badgeOf} />)}
        </div>
      )}
    </div>
  );
}

/**
 * Adds to a plan. Two different things can be added and the picker keeps them apart:
 *  - Uploaded material: documents the learner studies from. They feed the concept map and are what
 *    Luna generates practice from.
 *  - Generated resources: quizzes, summaries, flashcards made by agents. They become steps of the plan.
 * onConfirm({ materialIds, resourceIds }) returns the final selection of each kind.
 */
function MaterialPickerModal({ documents, folders, resources, plan, initialPicked, onClose, onConfirm }) {
  const [tab, setTab] = useState("uploaded");
  const [picked, setPicked] = useState(() => [...new Set(initialPicked)]);
  const { uploaded, generated } = useMemo(() => splitDocuments(documents, resources), [documents, resources]);
  const generatedIds = useMemo(() => new Set(generated.map((d) => d.id)), [generated]);
  const builtByPlan = useMemo(() => new Set((plan.items || []).filter((item) => item.generate && item.resourceId).map((item) => item.resourceId)), [plan]);
  const resourceByDocumentId = useMemo(() => new Map(resources.map((row) => [row.document.id, row.resource])), [resources]);
  const shown = tab === "uploaded" ? uploaded : generated;
  const folderTree = useMemo(() => buildFolderTree(folders), [folders]);
  const allFolderIds = useMemo(() => new Set(folders.map((f) => f.id)), [folders]);
  const unorganised = useMemo(() => shown.filter((d) => {
    const df = d.folderIds || (d.folderId ? [d.folderId] : []);
    return !df.some((fid) => allFolderIds.has(fid));
  }), [shown, allFolderIds]);

  const toggle = (id) => setPicked((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const docLabel = (doc) => (doc && (resourceByDocumentId.get(doc.id)?.name || doc.name || doc.id)) || "";
  const badgeOf = (doc) => (builtByPlan.has(doc.id) ? "built by this plan" : "");
  const label = (id) => docLabel(documents.find((d) => d.id === id) || { id, name: id });
  const pickedUploaded = picked.filter((id) => !generatedIds.has(id));
  const pickedGenerated = picked.filter((id) => generatedIds.has(id));
  const tabs = [
    { id: "uploaded", title: "Uploaded material", count: uploaded.length, picked: pickedUploaded.length, hint: "Documents you uploaded. They feed the concept map and are what Luna generates practice from." },
    { id: "generated", title: "Generated resources", count: generated.length, picked: pickedGenerated.length, hint: "Quizzes, summaries and flashcards made by agents. Each becomes a step of the plan." }
  ];
  const active = tabs.find((entry) => entry.id === tab);

  const tray = (title, ids) => ids.length ? (
    <div>
      <p className="m-0 mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">{title} · {ids.length}</p>
      <div className="flex max-h-16 flex-wrap gap-1.5 overflow-y-auto">
        {ids.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 rounded-full border border-[var(--accent)]/25 bg-[var(--accent)]/5 px-2 py-0.5 text-[11px] font-medium text-ink">
            <span className="max-w-[140px] truncate">{label(id)}</span>
            <button type="button" onClick={() => toggle(id)} className="ml-0.5 shrink-0 text-soft-ink hover:text-[var(--color-danger)]" aria-label={`Remove ${label(id)}`}>×</button>
          </span>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <div className="tw-scope fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-[0_24px_64px_rgba(0,0,0,0.25)]" style={{ maxHeight: "82vh" }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-ink/8 px-5 py-4">
          <div>
            <h4 className="m-0 text-base font-bold text-ink">Add to this plan</h4>
            <p className="m-0 mt-0.5 text-xs text-soft-ink">Adding anything re-plans what is still to do. What you have already done stays as it is.</p>
          </div>
          <button type="button" className="shrink-0 text-soft-ink hover:text-ink" onClick={onClose}>✕</button>
        </div>

        {/* Uploaded vs generated */}
        <div className="px-5 pt-3">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--surface-soft)] p-1">
            {tabs.map((entry) => (
              <button key={entry.id} type="button" onClick={() => setTab(entry.id)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${tab === entry.id ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink hover:text-ink"}`}>
                {entry.title} <span className="font-normal text-soft-ink">({entry.picked}/{entry.count})</span>
              </button>
            ))}
          </div>
          <p className="m-0 mt-2 text-xs text-soft-ink">{active.hint}</p>
        </div>

        {/* Folder tree */}
        <div className="flex-1 overflow-y-auto p-3 grid gap-0.5">
          {!shown.length
            ? <p className="m-0 p-2 text-xs text-soft-ink">{tab === "uploaded" ? "No uploaded documents in this workspace yet." : "No generated resources yet. Make some with the AI agents."}</p>
            : (<>
                {folderTree.map((node) => <FolderPickerNode key={node.id} node={node} docs={shown} picked={picked} onToggle={toggle} docLabel={docLabel} badgeOf={badgeOf} />)}
                {unorganised.map((doc) => (
                  <label key={doc.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-0.5 text-sm text-ink transition hover:bg-ink/5">
                    <input type="checkbox" checked={picked.includes(doc.id)} onChange={() => toggle(doc.id)} className="shrink-0" />
                    <span className="truncate">{docLabel(doc)}</span>
                    {badgeOf(doc) ? <span className="ml-auto shrink-0 rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-[10px] font-semibold text-soft-ink">{badgeOf(doc)}</span> : null}
                  </label>
                ))}
              </>)}
        </div>

        {/* Selected tray, by kind */}
        {picked.length > 0 && (
          <div className="grid gap-2 border-t border-ink/8 px-4 py-3">
            {tray("Uploaded material", pickedUploaded)}
            {tray("Generated resources", pickedGenerated)}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-ink/8 px-5 py-4">
          <button type="button" className={ghostBtn} onClick={onClose}>Cancel</button>
          <button type="button" className={primaryBtn} onClick={() => onConfirm({ materialIds: pickedUploaded, resourceIds: pickedGenerated })}>Confirm selection</button>
        </div>
      </div>
    </div>
  );
}

/** Concept mastery list — hierarchical (mirrors concept map), with mastery bar each. */
function ConceptMasteryList({ concepts = [], prerequisites = [], masteryByConceptId = {} }) {
  if (!concepts.length) return <p className="m-0 text-xs text-soft-ink">No concept data yet. Upload reference material to populate.</p>;

  const color = (m) => m === undefined ? "#9ca3af" : m < 0.4 ? "#ff3b30" : m < 0.7 ? "#ff9500" : "#34c759";

  // Same tree as the concept map: parent = prerequisite edge.
  const { roots, childrenById: children } = buildConceptForest(concepts, prerequisites);

  function ConceptRow({ concept, depth = 0 }) {
    const m = masteryByConceptId[concept.id];
    const pct = m !== undefined ? Math.round(m * 100) : null;
    const kids = children.get(concept.id) || [];
    return (
      <div>
        <div className="grid gap-0.5" style={{ paddingLeft: depth * 14 }}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-ink truncate" title={concept.name} style={{ opacity: depth === 0 ? 1 : 0.85 }}>
              {depth > 0 && <span className="mr-1 text-soft-ink" style={{ fontSize: 9 }}>{'└'}</span>}
              {concept.name}
            </span>
            <span className="text-xs font-semibold shrink-0" style={{ color: color(m) }}>{pct !== null ? `${pct}%` : "—"}</span>
          </div>
          <div className="h-1 rounded-full bg-ink/8 overflow-hidden" style={{ marginLeft: depth > 0 ? 12 : 0 }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct ?? 0}%`, background: color(m) }} />
          </div>
        </div>
        {kids.map((kid) => <ConceptRow key={kid.id} concept={kid} depth={depth + 1} />)}
      </div>
    );
  }

  return (
    <div className="mt-3 grid gap-2.5 max-h-[480px] overflow-y-auto pr-1">
      {roots.map((c) => <ConceptRow key={c.id} concept={c} depth={0} />)}
    </div>
  );
}

/**
 * Study plans: several at once, nested (a final exam made of the topics it covers), each with its
 * deadlines, its goals — expressed as the concepts its resources teach — and its schedule. The
 * calendar puts every plan on the same weeks so a collision is visible before it happens, and the
 * alert panel says what is due now.
 */
// The map only shows concepts from the resource materials linked to the plan.
function conceptsUrl(workspaceId, materialIds) {
  return `/api/concepts?workspaceId=${workspaceId}&documentIds=${encodeURIComponent((materialIds || []).join(","))}`;
}

// Cap the concept map without orphaning nodes (a child is only kept if its parent is kept).
function normalizeConceptGraph(conceptData) {
  const concepts = Array.isArray(conceptData?.concepts) ? conceptData.concepts : [];
  const prerequisites = Array.isArray(conceptData?.prerequisites) ? conceptData.prerequisites : [];
  return capConceptTree(concepts, prerequisites);
}

export function PlansPage({ role = "student", workspaces = [], selectedWorkspaceId, selectedSubjectId, onSaveGeneratedQuizDocument, onUpdateGeneratedDocument, onUpdateDocumentMeta, onCreateFolder, onRemoveFolder, onRemoveDocument, onOpenResource, onDownloadDocument, onUpdateDocumentContent, onSelectSubject, openPlanId = "", startGenerating = false, startExamDateId = "", onShareDocument, examDates = [], onDismissExamDate, onLinkPlanToExamDate }) {
  const [building, setBuilding] = useState("");
  const subject = workspaces.find((w) => w.id === selectedWorkspaceId)?.subjects?.find((s) => s.id === selectedSubjectId) || null;
  const documents = subject?.documents || [];
  // A plan's material can sit in another topic (a document moved after the plan was made): things are looked up across the workspace, while lists and filing stay in this topic.
  const workspaceDocuments = useMemo(() => (workspaces.find((w) => w.id === selectedWorkspaceId)?.subjects || []).flatMap((s) => s.documents || []), [workspaces, selectedWorkspaceId]);
  // Agents anywhere in the workspace (like the AI Tools hub) can be put in a plan's scope.
  const agentDocuments = useMemo(() => (workspaces.find((w) => w.id === selectedWorkspaceId)?.subjects || []).flatMap((s) => s.documents || []).filter((d) => d.sourceType === "generated" && (d.tags || []).includes("ai-agent")), [workspaces, selectedWorkspaceId]);
  const agentCatalog = useMemo(() => planAgentCatalog(agentDocuments), [agentDocuments]);
  const folders = subject?.folders || [];
  const [openId, setOpenId] = useState("");
  useEffect(() => { setOpenId(""); }, [selectedSubjectId]);
  // Home links straight to a plan ("plans?open=<id>"): open it once its subject is the selected one.
  useEffect(() => { if (openPlanId) setOpenId(openPlanId); }, [openPlanId, selectedSubjectId]);
  const [tab, setTab] = useState("plans");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(Boolean(startGenerating));
  const [draft, setDraft] = useState({ name: "", examDate: "", colour: PLAN_COLOURS[0], note: "", parentPlanId: "" });
  const [playing, setPlaying] = useState(null);
  const [readingDoc, setReadingDoc] = useState(null); // an uploaded document opened in the HTML reader
  const [reading, setReading] = useState(null); // { resource, document } — a generated document opened in the HTML reader // { activity, documentId, itemId, planDocumentId }
  const [deletingPlan, setDeletingPlan] = useState(null); // plan row to confirm-delete
  const [planView, setPlanView] = useState("list"); // "list" | "calendar" inside the open plan
  const [replanResult, setReplanResult] = useState(null);
  const [replanning, setReplanning] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [materialPickerOpen, setMaterialPickerOpen] = useState(false);
  const [rebuildConfirmOpen, setRebuildConfirmOpen] = useState(false);
  const [revising, setRevising] = useState(null); // { plan, newUploadedIds } while the re-plan preview is open
  const [rebuildPreview, setRebuildPreview] = useState(null); // { newConcepts, newPrereqs, prevConcepts, prevPrereqs }

  // Knowledge graph + student model state
  const [graphConcepts, setGraphConcepts] = useState([]);
  const [graphPrereqs, setGraphPrereqs] = useState([]);
  const [masteryByConceptId, setMasteryByConceptId] = useState({});

  // `folders` lets a received copy name who sent it (its deadlines were set by them: locked, with their name on the badge).
  const plans = useMemo(() => documents.map((document) => ({ document, plan: parsePlan(document, { folders }) })).filter((row) => row.plan), [documents, folders]);
  const [pickedExam, setPickedExam] = useState(null); // an exam date chosen for "Plan it for me" / "New plan"
  // Home's "Plan for it" arrives as plans?generate=1&exam=<id>: open "Plan it for me" with that date once the dates are loaded.
  useEffect(() => { if (startExamDateId && examDates.length) { const found = examDates.find((entry) => entry.id === startExamDateId); if (found) { setPickedExam(found); setGenerating(true); } } }, [startExamDateId, examDates.length]);
  const resources = useMemo(() => workspaceDocuments.map((document) => ({ document, resource: parseResource(document) })).filter((row) => row.resource), [workspaceDocuments]);
  const attempts = useMemo(() => joinAttempts(workspaceDocuments), [workspaceDocuments]);
  const concepts = useMemo(() => conceptIndex(resources), [resources]);
  const conceptsByResourceId = useMemo(() => {
    const map = new Map();
    for (const { document, resource } of resources) {
      const names = resourceConcepts(resource).map((c) => c.name);
      if (names.length) map.set(document.id, names);
    }
    return map;
  }, [resources]);
  const alerts = useMemo(() => upcoming(plans, attempts, 10), [plans, attempts]);
  const open = plans.find((row) => row.document.id === openId) || null;
  const roots = plans.filter((row) => !row.plan.parentPlanId || !plans.some((other) => other.document.id === row.plan.parentPlanId));

  const [extracting, setExtracting] = useState(false);
  const extractingRef = useRef(false);

  // Fetch concept graph + mastery whenever the open plan or workspace changes.
  // If no concepts exist yet but the plan has linked material, auto-trigger extraction.
  useEffect(() => {
    if (!open || !selectedWorkspaceId) return;
    const learnerId = (typeof window !== "undefined" && window.localStorage.getItem("luna.learnerId")) || "anonymous";
    const ownerUserId = typeof window !== "undefined" ? (window.localStorage.getItem("luna.ownerUserId") || "") : "";

    Promise.all([
      fetch(conceptsUrl(selectedWorkspaceId, open.plan.materialIds)).then((r) => r.json()).catch(() => ({ concepts: [], prerequisites: [] })),
      fetch(`/api/student/mastery?learnerId=${encodeURIComponent(learnerId)}&workspaceId=${selectedWorkspaceId}`).then((r) => r.json()).catch(() => ({ states: [] })),
    ]).then(([conceptData, masteryData]) => {
      const graph = normalizeConceptGraph(conceptData);
      const fetchedConcepts = graph.concepts;
      setGraphConcepts(fetchedConcepts);
      setGraphPrereqs(graph.prerequisites);
      const byId = {};
      for (const s of (masteryData.states || [])) {
        if (s.concept_id) byId[s.concept_id] = s.mastery ?? 0;
      }
      setMasteryByConceptId(byId);

      // Auto-extract for plan-linked documents that haven't been processed yet
      if (fetchedConcepts.length === 0 && open?.plan?.materialIds?.length > 0 && !extractingRef.current) {
        triggerExtraction(open.plan.materialIds, selectedWorkspaceId, ownerUserId);
      }
    });
  }, [open?.document?.id, selectedWorkspaceId, (open?.plan?.materialIds || []).join(",")]);

  async function triggerExtraction(materialIds, workspaceId, ownerUserId) {
    if (!materialIds?.length || !workspaceId) return;
    setExtracting(true);
    extractingRef.current = true;
    try {
      await Promise.allSettled(
        materialIds.map((docId) =>
          fetch("/api/concepts/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ documentId: docId, workspaceId, ownerUserId }),
          }).then((r) => r.json())
        )
      );
      // Reload concepts after extraction
      const conceptData = await fetch(conceptsUrl(workspaceId, materialIds)).then((r) => r.json()).catch(() => ({ concepts: [], prerequisites: [] }));
      const graph = normalizeConceptGraph(conceptData);
      setGraphConcepts(graph.concepts);
      setGraphPrereqs(graph.prerequisites);
    } finally {
      extractingRef.current = false;
      setExtracting(false);
    }
  }

  /**
   * Rebuilds the concept map with a preview step before applying changes.
   * Saves current concepts as "previous" so the user can review the diff.
   */
  async function doRebuildConceptMap(materialIds, workspaceId, ownerUserId) {
    if (!materialIds?.length || !workspaceId) return;
    const prevConcepts = graphConcepts;
    const prevPrereqs = graphPrereqs;
    setExtracting(true);
    extractingRef.current = true;
    try {
      await Promise.allSettled(
        materialIds.map((docId) =>
          fetch("/api/concepts/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ documentId: docId, workspaceId, ownerUserId }),
          }).then((r) => r.json())
        )
      );
      const conceptData = await fetch(conceptsUrl(workspaceId, materialIds)).then((r) => r.json()).catch(() => ({ concepts: [], prerequisites: [] }));
      const { concepts: newConcepts, prerequisites: newPrereqs } = normalizeConceptGraph(conceptData);
      setRebuildPreview({ newConcepts, newPrereqs, prevConcepts, prevPrereqs });
    } finally {
      extractingRef.current = false;
      setExtracting(false);
    }
  }

  /**
   * Accepts the new concept map from a rebuild preview:
   * - Updates the displayed concepts and prerequisites
   * - Prunes mastery entries for concepts that no longer exist
   * - Updates concept name tags on plan items via fuzzy match
   */
  function handleAcceptRebuild() {
    if (!rebuildPreview) return;
    const { newConcepts, newPrereqs } = rebuildPreview;
    setGraphConcepts(newConcepts);
    setGraphPrereqs(newPrereqs);
    // Prune mastery for removed concepts (keep only concept IDs still in the new map)
    const newConceptIds = new Set(newConcepts.map((c) => c.id));
    setMasteryByConceptId((prev) => {
      const updated = {};
      for (const [id, mastery] of Object.entries(prev)) {
        if (newConceptIds.has(id)) updated[id] = mastery;
      }
      return updated;
    });
    // Update plan items' concept tags using fuzzy name matching
    if (open) {
      const newConceptNames = newConcepts.map((c) => c.name);
      const updatedItems = open.plan.items.map((item) => {
        if (!Array.isArray(item.concepts) || !item.concepts.length) return item;
        const updatedConcepts = item.concepts
          .map((oldName) => fuzzyMatchConceptName(oldName, newConceptNames))
          .filter(Boolean);
        return { ...item, concepts: updatedConcepts };
      });
      updateOpen((current) => ({ ...current, items: updatedItems }));
    }
    setRebuildPreview(null);
    setStatus("Concept map rebuilt — student model and activity tags updated.");
  }

  /** Discards the preview and restores the previous concept map in the UI. */
  function handleGoBackRebuild() {
    if (!rebuildPreview) return;
    setGraphConcepts(rebuildPreview.prevConcepts);
    setGraphPrereqs(rebuildPreview.prevPrereqs);
    setRebuildPreview(null);
  }

  /** Highlights made in the reader are kept with the resource they were made on. */
  async function saveHighlights(document, resource, list) {
    if (!document || !resource || typeof onUpdateGeneratedDocument !== "function") return;
    const content = JSON.stringify({ ...resource, highlights: list }, null, 2);
    await onUpdateGeneratedDocument(document.id, { file: { name: document.name, content, preview: document.preview, sizeBytes: content.length } });
  }

  async function save(plan, documentId) {
    // `receivedFrom` and `documentId` only exist while a plan is on screen; they are not part of what is stored.
    const { receivedFrom: _receivedFrom, documentId: _documentId, ...stored } = plan;
    const content = JSON.stringify({ ...stored, updatedAt: new Date().toISOString() }, null, 2);
    const deadline = nextDeadline(plan);
    const file = { name: `${plan.name}.plan.json`, content, preview: `${(plan.items || []).length} steps${deadline ? ` · ${deadline.date}` : ""}`, sizeBytes: content.length };
    setBusy(true);
    try {
      const saved = documentId
        ? await onUpdateGeneratedDocument?.(documentId, { file })
        : await onSaveGeneratedQuizDocument?.({ folderIds: [], tags: [PLAN_TAG], file });
      setStatus(`Saved "${plan.name}".`);
      return saved;
    } catch (error) {
      setStatus(String(error.message || error));
    } finally {
      setBusy(false);
    }
  }

  /** A plan that is not built straight away still gets its place in the folders: Generated material / Study plans / <plan> / Reference materials. */
  async function fileNewPlan(plan, documentId) {
    try {
      const planFolders = await ensurePlanFolders(plan.name, { folders, subjectId: selectedSubjectId, onCreateFolder });
      if (documentId && planFolders.planId) await onUpdateDocumentMeta?.(documentId, { folderIds: [planFolders.planId], tags: [PLAN_TAG] });
    } catch { /* the plan is saved; it is filed the next time it is built */ }
  }

  function updateOpen(updater) {
    if (!open) return;
    save(updater(open.plan), open.document.id);
  }

  async function saveAttempt(attempt, documentId) {
    const content = JSON.stringify({ kind: "activity-attempt", activityDocumentId: documentId, activityId: attempt.activityId || "", learner: "", attempt }, null, 2);
    try {
      await onSaveGeneratedQuizDocument?.({ folderIds: [], tags: ["activity-attempt"], file: { name: `${attempt.activityTitle || "Activity"} · attempt.json`, content, preview: `${attempt.score}/${attempt.total}`, sizeBytes: content.length } });
    } catch { /* attempt still shows locally */ }
  }

  /**
   * Turns the steps that only promised material into real material: runs the agent for each one,
   * files the result in the workspace as a resource (and an activity when it has questions), and
   * points the step at it with its due date kept.
   */
  async function build(row) {
    const pending = (row.plan.items || []).filter((item) => item.generate && !item.resourceId);
    if (!pending.length) { setStatus("Every step of this plan already has its material."); return; }
    setBuilding(row.document.id);
    try {
      // Study plans / <plan> / {Reference material, Generated resources}
      setStatus("Setting up the plan's folders…");
      const planFolders = await ensurePlanFolders(row.plan.name, { folders, subjectId: selectedSubjectId, onCreateFolder });
      if (planFolders.planId) await onUpdateDocumentMeta?.(row.document.id, { folderIds: [planFolders.planId], tags: row.document.tags || [] });
      const result = await executePlan({
        plan: row.plan,
        documents: workspaceDocuments,
        agentDocuments,
        subjectName: subject?.name || "",
        workspaceId: selectedWorkspaceId,
        subjectId: selectedSubjectId,
        folderIds: planFolders.generatedId ? [planFolders.generatedId] : (row.document.folderIds || []).filter(Boolean),
        onSaveGeneratedQuizDocument,
        onUpdateGeneratedDocument,
        onProgress: ({ phase, index, total, title, detail }) => setStatus(phase === "master" ? `Merging your documents into one master document${detail ? ` — ${detail}` : ""}…` : `Building ${index + 1} of ${total}: ${title}…`)
      });
      await save(result.plan, row.document.id);
      setStatus(`${result.masterBuilt ? "Master document built from your documents · " : ""}${result.created} resource${result.created === 1 ? "" : "s"} generated and filed in your workspace${result.failures.length ? ` · ${result.failures.length} could not be built (${result.failures[0].message})` : ""}.`);
    } catch (error) {
      setStatus(String(error.message || error));
    } finally {
      setBuilding("");
    }
  }

  /**
   * Delete a study plan together with its folder and the material generated into it. Uploaded
   * material is only unlinked from the plan's folders. Recorded attempts (performance metrics) go
   * only if asked.
   */
  async function deletePlan(planRow, { metrics }) {
    if (!onRemoveDocument) return;
    setBusy(true);
    try {
      const plan = planRow.plan;
      const scope = planDeletionScope(planRow.document, plan, { folders, documents });
      // Practice the plan built for itself, even if it was filed somewhere else since.
      const built = (plan.items || []).filter((item) => item.generate && item.resourceId).map((item) => item.resourceId);
      const extra = built.filter((id) => documents.some((doc) => doc.id === id));

      if (metrics) {
        // Remove activity-attempt documents for any resource in this plan
        const resourceIds = new Set((plan.items || []).map((item) => item.resourceId).filter(Boolean));
        extra.push(...documents
          .filter((doc) => {
            if (!(doc.tags || []).includes("activity-attempt")) return false;
            try { return resourceIds.has(JSON.parse(doc.content || "{}").activityDocumentId); }
            catch { return false; }
          })
          .map((doc) => doc.id));
      }

      await deletePlanEverything(scope, { planDocumentId: planRow.document.id, extraDocumentIds: [...new Set(extra)], documents, folders, onRemoveDocument, onUpdateDocumentMeta, onRemoveFolder });
      setOpenId("");
      setDeletingPlan(null);
      setStatus(`Plan "${plan.name}" deleted${scope.folderId ? ", with its folder and generated material" : ""}.`);
    } catch (error) {
      setStatus(String(error.message || error));
    } finally {
      setBusy(false);
    }
  }

  /** Checks current performance and suggests plan adjustments. */
  async function triggerReplan() {
    if (!open) return;
    setReplanning(true);
    try {
      const learnerId = (typeof window !== "undefined" && window.localStorage.getItem("luna.learnerId")) || "anonymous";
      const ownerUserId = typeof window !== "undefined" ? (window.localStorage.getItem("luna.ownerUserId") || "") : "";
      const result = await fetch("/api/plans/replan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planDocumentId: open.document.id, learnerId, ownerUserId, workspaceId: selectedWorkspaceId }),
      }).then((r) => r.json());
      setReplanResult(result);
      if (!result.shouldReplan) setStatus("Plan looks good — no changes needed based on your current performance.");
    } catch (err) {
      setStatus(String(err.message || err));
    } finally {
      setReplanning(false);
    }
  }

  /** Dropping an item on a day of the calendar moves its due date, whichever plan it belongs to. */
  function moveItem(planId, itemId, date) {
    const row = plans.find((entry) => entry.document.id === planId);
    if (!row) return;
    save({ ...row.plan, items: row.plan.items.map((item) => (item.id === itemId ? { ...item, dueDate: date } : item)) }, planId);
  }

  if (!subject) return <section className="tw-scope grid gap-3"><SubjectTabs workspaces={workspaces} selectedWorkspaceId={selectedWorkspaceId} selectedSubjectId={selectedSubjectId} onSelectSubject={onSelectSubject} /><p className="m-0 text-sm text-soft-ink">Choose a folder in your workspace first.</p></section>;

  /* ---------------------------------------------------------------- one plan */
  if (open) {
    const plan = open.plan;
    const children = plans.filter((row) => row.plan.parentPlanId === open.document.id);
    const whole = withSubPlans(plan, plans);
    const progress = planProgress(plan, attempts);
    const wholeProgress = planProgress(whole, attempts);
    const weeks = planWeeks(plan);
    const parent = plans.find((row) => row.document.id === plan.parentPlanId) || null;

    // Precompute concept diff for the rebuild-preview modal
    const addedConcepts = rebuildPreview
      ? rebuildPreview.newConcepts.filter((nc) => !rebuildPreview.prevConcepts.some((pc) => pc.name === nc.name))
      : [];
    const removedConcepts = rebuildPreview
      ? rebuildPreview.prevConcepts.filter((pc) => !rebuildPreview.newConcepts.some((nc) => nc.name === pc.name))
      : [];

    return (
      <section className="tw-scope grid gap-4">
        {/* ── Header ── */}
        <div className={`${card} p-5`} style={{ borderTop: `4px solid ${plan.colour}` }}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <button type="button" className="text-xs font-semibold text-soft-ink hover:underline" onClick={() => setOpenId("")}>← All plans</button>
              {parent ? <button type="button" className="ml-2 text-xs font-semibold text-[var(--accent-ink)] hover:underline" onClick={() => setOpenId(parent.document.id)}>part of "{parent.plan.name}"</button> : null}
              <h3 className="m-0 mt-1 text-2xl font-bold tracking-tight text-ink">{plan.name}</h3>
              <p className="m-0 mt-1 text-sm text-soft-ink">
                {progress.deadline ? <><DeadlineOrigin deadline={progress.deadline} plan={plan} className="mr-1.5 align-middle" />{`${progress.deadline.title}: ${dueLabel(progress.deadline.date)}`}</> : "No deadline set"}
                {plan.learner ? ` · ${plan.learner}` : ""}
                {progress.total ? ` · ${progress.done} of ${progress.total} steps done` : ""}
                {children.length ? ` · ${children.length} sub-plan${children.length === 1 ? "" : "s"} (${wholeProgress.done}/${wholeProgress.total} in total)` : ""}
              </p>
              {plan.note ? <p className="m-0 mt-2 max-w-2xl text-sm text-ink">{plan.note}</p> : null}
              {(() => {
                const names = conceptNames(graphConcepts);
                if (!names.length) return null;
                const cov = planCoverage(plan, names);
                if (cov.complete) return <p className="m-0 mt-1.5 text-xs font-semibold text-[#1f7a3a]">✓ Exhaustive: all {cov.total} concepts of the material are studied and tested in this plan.</p>;
                const missing = [...new Set([...cov.missingStudy, ...cov.missingTest])];
                return (
                  <p className="m-0 mt-1.5 text-xs text-[var(--color-warn)]">
                    Coverage: {cov.testedCount} of {cov.total} concepts are tested. Missing: {missing.slice(0, 6).join(", ")}{missing.length > 6 ? ` +${missing.length - 6} more` : ""}.{" "}
                    <button type="button" className="font-semibold text-[var(--accent)] underline" onClick={() => { const fixed = ensureCoverage(plan.items, names); updateOpen((current) => ({ ...current, items: fixed.items })); setStatus(`Added ${fixed.repairs.filter((entry) => entry.as !== "exam").length} concept${fixed.repairs.length === 1 ? "" : "s"} to the plan's steps.`); }}>Add them to the plan</button>
                  </p>
                );
              })()}
              {Array.isArray(plan.agentScope) ? <p className="m-0 mt-1.5 text-xs text-soft-ink">Agents in scope: {plan.agentScope.length ? plan.agentScope.map((agent) => agent.label).join(" · ") : "none — studying the material only"}</p> : null}
            </div>
            <div className="flex flex-wrap items-center gap-4">
              {plan.items.some((item) => item.generate && !item.resourceId) ? (
                <button type="button" className={primaryBtn} disabled={building === open.document.id} onClick={() => build(open)}>
                  {building === open.document.id ? "Building…" : `✦ Build the ${plan.items.filter((item) => item.generate && !item.resourceId).length} missing resources`}
                </button>
              ) : null}
              <Ring ratio={children.length ? wholeProgress.ratio : progress.ratio} colour={plan.colour} size={64} />
              {progress.average ? <div><p className={kicker}>Average</p><p className="m-0 text-xl font-bold text-ink">{Math.round(progress.average * 100)}%</p></div> : null}
              {progress.late.length ? <div><p className={kicker}>Late</p><p className="m-0 text-xl font-bold text-[var(--color-danger)]">{progress.late.length}</p></div> : null}

              {/* ── Gear icon → settings dropdown ── */}
              <div className="relative">
                <button
                  type="button"
                  title="Plan settings"
                  aria-label="Plan settings"
                  onClick={() => setSettingsOpen((v) => !v)}
                  className="grid size-9 place-items-center rounded-full border border-ink/15 bg-white text-base text-soft-ink transition hover:bg-[var(--surface-soft)]"
                >
                  ⚙
                </button>
                {settingsOpen && (
                  <div
                    className="absolute right-0 top-11 z-20 w-72 rounded-2xl border border-ink/8 bg-white p-4 shadow-[0_8px_32px_rgba(0,0,0,0.16)]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p className="m-0 mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink">Plan settings</p>
                    <div className="grid gap-2">
                      <label className="grid gap-1 text-xs font-semibold text-soft-ink">
                        Name
                        <input className={field} value={plan.name} onChange={(e) => updateOpen((c) => ({ ...c, name: e.target.value }))} />
                      </label>
                      <label className="grid gap-1 text-xs font-semibold text-soft-ink">
                        Notes
                        <textarea className={field} rows={2} value={plan.note || ""} onChange={(e) => updateOpen((c) => ({ ...c, note: e.target.value }))} />
                      </label>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {PLAN_COLOURS.map((colour) => (
                          <button key={colour} type="button" aria-label={`Colour ${colour}`} className={`size-6 rounded-full ${plan.colour === colour ? "ring-2 ring-offset-2 ring-ink/40" : ""}`} style={{ background: colour }} onClick={() => updateOpen((c) => ({ ...c, colour }))} />
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2 border-t border-ink/8 pt-2">
                        {plan.parentPlanId ? (
                          <button type="button" className="text-xs font-semibold text-soft-ink hover:underline" onClick={() => { updateOpen((c) => ({ ...c, parentPlanId: "" })); setSettingsOpen(false); }}>
                            Detach from parent plan
                          </button>
                        ) : null}
                        {onRemoveDocument ? (
                          <button type="button" className="text-xs font-semibold text-[var(--color-danger)] hover:underline" onClick={() => { setDeletingPlan(open); setSettingsOpen(false); }}>
                            Delete this plan…
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Deadlines — full width, first ── */}
        <section className={`${card} p-5`}>
          <p className={kicker}>Deadlines</p>
          <div className="mt-2 grid gap-2">
            {[...(plan.deadlines || [])].sort((a, b) => String(a.date || "9999").localeCompare(String(b.date || "9999")) || Number(deadlineOrigin(b, { receivedFrom: plan.receivedFrom }).imposed) - Number(deadlineOrigin(a, { receivedFrom: plan.receivedFrom }).imposed)).map((deadline) => {
              // A deadline a teacher or parent set is locked (the server refuses changes too): dark badge + 🔒. Your own are editable.
              const origin = deadlineOrigin(deadline, { receivedFrom: plan.receivedFrom });
              return (
                <div key={deadline.id} className={`flex flex-wrap items-center gap-1.5 rounded-xl border p-2 ${origin.imposed ? "border-ink/25 bg-[var(--surface-soft)]" : "border-ink/10"}`}>
                  <DeadlineOrigin deadline={deadline} plan={plan} />
                  <input className="min-w-0 flex-1 rounded-lg border border-ink/12 px-2 py-1 text-sm disabled:bg-transparent disabled:text-ink" disabled={origin.locked} title={origin.locked ? origin.tooltip : undefined} value={deadline.title} onChange={(event) => updateOpen((current) => ({ ...current, deadlines: current.deadlines.map((entry) => (entry.id === deadline.id ? { ...entry, title: event.target.value } : entry)) }))} />
                  <select className="rounded-lg border border-ink/12 px-2 py-1 text-xs disabled:bg-transparent" disabled={origin.locked} value={deadline.kind} onChange={(event) => updateOpen((current) => ({ ...current, deadlines: current.deadlines.map((entry) => (entry.id === deadline.id ? { ...entry, kind: event.target.value } : entry)) }))}>
                    {DEADLINE_KINDS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
                  </select>
                  <input type="date" className="rounded-lg border border-ink/12 px-2 py-1 text-xs disabled:bg-transparent disabled:text-ink" disabled={origin.locked} title={origin.locked ? `🔒 Set by ${origin.by}` : undefined} aria-label={origin.locked ? `Date, locked, set by ${origin.by}` : "Date"} value={deadline.date || ""} onChange={(event) => updateOpen((current) => ({ ...current, deadlines: current.deadlines.map((entry) => (entry.id === deadline.id ? { ...entry, date: event.target.value } : entry)) }))} />
                  <span className="text-[11px] font-semibold text-soft-ink">{dueLabel(deadline.date)}</span>
                  {origin.locked ? (
                    <span className="text-xs text-soft-ink" title={origin.tooltip} aria-label={origin.tooltip}>🔒</span>
                  ) : (
                    <button type="button" className="text-xs text-soft-ink hover:text-[var(--color-danger)]" aria-label="Remove this deadline" onClick={() => updateOpen((current) => ({ ...current, deadlines: current.deadlines.filter((entry) => entry.id !== deadline.id) }))}>✕</button>
                  )}
                  {deadline.cancelledFrom ? <span className="basis-full text-[11px] text-soft-ink">{deadline.cancelledFrom} cancelled this exam date. The date stays as your own deadline: change or remove it as you like.</span> : null}
                </div>
              );
            })}
            <button type="button" className={`${ghostBtn} justify-self-start`} onClick={() => { const title = window.prompt(plan.receivedFrom ? "Your own deadline, e.g. Finish before the weekend" : "What is the deadline? e.g. Mock exam"); if (title) updateOpen((current) => ({ ...current, deadlines: [...(current.deadlines || []), newDeadline(title, "", "exam")] })); }}>＋ {(plan.deadlines || []).some((entry) => deadlineOrigin(entry, { receivedFrom: plan.receivedFrom }).imposed) ? "Add your own deadline" : "Add a deadline"}</button>
            <PlanExamLink plan={plan} examDates={examDates} busy={busy} onLink={async (examDateId) => { const result = await onLinkPlanToExamDate?.(examDateId, open.document.id); setStatus(result?.ok ? "Linked: the plan now follows your teacher's exam date." : (result?.error || "Could not link the exam date.")); }} />
          </div>
        </section>

        {/* ── Performance replan alert ── */}
        {replanResult?.shouldReplan ? (
          <section className={`${card} p-5`} style={{ borderLeft: `4px solid var(--accent)` }}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className={kicker}>Performance update — plan adjustment suggested</p>
                <ul className="m-0 mt-2 grid list-none gap-1 p-0">
                  {(replanResult.reasons || []).map((r, i) => <li key={i} className="text-sm text-ink">{r.message}</li>)}
                </ul>
              </div>
              <button type="button" className="text-xs text-soft-ink hover:text-[var(--color-danger)]" onClick={() => setReplanResult(null)}>✕</button>
            </div>
            {replanResult.suggestedItems?.length ? (
              <div className="mt-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="m-0 text-xs font-semibold text-soft-ink">Suggested additions:</p>
                  <button
                    type="button"
                    className={primaryBtn}
                    onClick={() => {
                      // Keep all completed items; replace all incomplete items with suggestions
                      const doneItems = open.plan.items.filter((i) => {
                        const sc = progress.scoreByResource.get(i.resourceId);
                        return Boolean(i.doneAt) || sc !== undefined;
                      });
                      const newItems = (replanResult.suggestedItems || []).map((sugItem) =>
                        newItem({ title: sugItem.title, kind: sugItem.kind || "activity", dueDate: sugItem.dueDate, minutes: sugItem.minutes || 30 })
                      );
                      updateOpen((current) => ({ ...current, items: [...doneItems, ...newItems] }));
                      setReplanResult(null);
                      setStatus("Plan updated — completed activities kept, new steps scheduled.");
                    }}
                  >
                    Apply all suggestions
                  </button>
                </div>
                <div className="mt-2 grid gap-2">
                  {replanResult.suggestedItems.map((sugItem, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="m-0 text-sm font-semibold text-ink">{sugItem.title}</p>
                        <p className="m-0 text-[11px] text-soft-ink">{sugItem.reason} · {sugItem.minutes} min · due {sugItem.dueDate}</p>
                        {sugItem.conceptName ? <span className={`${chip} mt-1 bg-[var(--surface-soft)] text-soft-ink`}>{sugItem.conceptName}</span> : null}
                      </div>
                      <button type="button" className={ghostBtn} onClick={() => { updateOpen((current) => ({ ...current, items: [...current.items, newItem({ title: sugItem.title, kind: sugItem.kind || "activity", dueDate: sugItem.dueDate, minutes: sugItem.minutes || 30 })] })); }}>＋ Add</button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* ── The plan — full width with list / calendar toggle ── */}
        <section className={`${card} p-5`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={kicker}>The plan</p>
            <div className="flex flex-wrap items-center gap-2">
              {/* Single button → opens MaterialPickerModal */}
              <button type="button" className={ghostBtn} onClick={() => setMaterialPickerOpen(true)}>
                ＋ Materials &amp; resources…
              </button>
              {/* Update from performance */}
              <button type="button" className={ghostBtn} disabled={replanning} onClick={triggerReplan}>
                {replanning ? "Checking…" : "↺ Update from performance"}
              </button>
              {/* List / Calendar view toggle */}
              <div className="flex gap-1 rounded-xl bg-[var(--surface-soft)] p-1">
                {[["list", "List"], ["calendar", "Calendar"]].map(([value, label]) => (
                  <button key={value} type="button" onClick={() => setPlanView(value)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${planView === value ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink"}`}>{label}</button>
                ))}
              </div>
            </div>
          </div>

          {planView === "calendar" ? (
            <div className="mt-3">
              <PlanCalendar rows={[open]} attempts={attempts} onOpenPlan={() => {}} onMoveItem={moveItem} />
            </div>
          ) : (
            <>
              {!plan.items.length ? <p className="m-0 mt-3 rounded-xl bg-[var(--surface-soft)] p-4 text-sm text-soft-ink">Nothing scheduled yet. Add a resource here, or use "＋ Plan" on any resource in your folders.</p> : null}
              <div className="mt-3 grid gap-4">
                {weeks.map((week) => (
                  <div key={week.start || "undated"}>
                    <p className="m-0 text-xs font-bold uppercase tracking-[0.1em] text-soft-ink">
                      {week.start ? `Week of ${new Date(`${week.start}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "long" })}` : "No date yet"}
                    </p>
                    <div className="mt-2 grid gap-2">
                      {week.items.map((item) => {
                        const score = progress.scoreByResource.get(item.resourceId);
                        const done = Boolean(item.doneAt) || score !== undefined;
                        const late = !done && dueLabel(item.dueDate).includes("late");
                        const kind = ITEM_KINDS.find((entry) => entry.id === item.kind) || ITEM_KINDS[0];
                        const itemConcepts = item.resourceId ? (conceptsByResourceId.get(item.resourceId) || []) : [];
                        // Resolve resource for skill tags + activity detection
                        const itemResourceDoc = item.resourceId ? workspaceDocuments.find((d) => d.id === item.resourceId) : null;
                        const itemResource = itemResourceDoc ? parseResource(itemResourceDoc) : null;
                        const activity = itemResource?.activity?.questions?.length ? itemResource.activity : null;
                        const skillTags = inferSkillTags(item, itemResource);
                        // The agent that made (or will make) this step's material is named on the step.
                        const agentName = itemResource?.meta?.agentName
                          || (item.generate && !item.resourceId ? ((plan.agentScope || []).find((entry) => (entry.makes || []).includes(item.generate))?.label || BUILTIN_PLAN_AGENTS.find((entry) => entry.makes.includes(item.generate))?.label || "") : "");
                        // What "Open" shows: the generated material, or the document the step asks you to read.
                        const readable = item.sourceDocumentId ? workspaceDocuments.find((entry) => entry.id === item.sourceDocumentId) : null;
                        const linkedDocument = itemResourceDoc && !itemResource ? itemResourceDoc : null;
                        return (
                          <div key={item.id} className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 ${done ? "border-[#2f9e5b]/30 bg-[#2f9e5b]/5" : late ? "border-[var(--color-danger)]/30 bg-[rgba(255,59,48,0.04)]" : "border-ink/10 bg-white"}`}>
                            <button
                              type="button"
                              title={done ? "Mark as not done" : "Mark as done"}
                              className={`grid size-6 shrink-0 place-items-center rounded-full border text-xs ${done ? "border-[#2f9e5b] bg-[#2f9e5b] text-white" : "border-ink/25 text-transparent"}`}
                              onClick={() => updateOpen((current) => ({ ...current, items: current.items.map((entry) => (entry.id === item.id ? { ...entry, doneAt: entry.doneAt ? "" : new Date().toISOString() } : entry)) }))}
                            >
                              ✓
                            </button>
                            <span className="shrink-0 text-sm" aria-hidden>{kind.icon}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-ink">{item.title}</span>
                              <span className="block text-[11px] text-soft-ink">{kind.label}{item.minutes ? ` · ${item.minutes} min` : ""}{score !== undefined ? ` · scored ${Math.round(score * 100)}%` : ""}</span>
                              {/* Concept tags — coloured by mastery */}
                              {itemConcepts.length > 0 && (
                                <p className="m-0 mt-1 flex flex-wrap gap-1">
                                  {itemConcepts.slice(0, 5).map((name) => {
                                    const gc = graphConcepts.find((c) => c.name === name);
                                    const mastery = gc ? masteryByConceptId[gc.id] : undefined;
                                    const color = mastery === undefined ? "#9ca3af" : mastery < 0.4 ? "#ff3b30" : mastery < 0.7 ? "#ff9500" : "#34c759";
                                    return <span key={name} className={`${chip} text-[9px]`} style={{ background: `${color}20`, color }}>{name}</span>;
                                  })}
                                  {itemConcepts.length > 5 && <span className={`${chip} text-[9px] bg-[var(--surface-soft)] text-soft-ink`}>+{itemConcepts.length - 5} more</span>}
                                </p>
                              )}
                              {/* Skill-category tags — fixed palette, square-ish */}
                              {agentName ? (
                                <p className="m-0 mt-1 flex flex-wrap gap-1">
                                  <span className="inline-flex items-center gap-1 rounded-md border border-[#8a4fd6]/30 bg-[#8a4fd6]/10 px-1.5 py-0.5 text-[9px] font-semibold text-[#6f3bb5]" title={itemResource ? "Made with this agent" : "Will be made with this agent"}>✦ {agentName}</span>
                                </p>
                              ) : null}
                              {skillTags.length > 0 && (
                                <p className="m-0 mt-1 flex flex-wrap gap-1">
                                  {skillTags.map((tag) => (
                                    <span key={tag.label} className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-semibold ${tag.cls}`}>{tag.label}</span>
                                  ))}
                                </p>
                              )}
                            </span>
                            {plan.receivedFrom && item.dueDate ? (
                              <span className="flex flex-wrap items-center gap-1.5">
                                {/* A step of a plan somebody sent you: their date is locked; your own (earlier) date goes next to it. */}
                                <span className="inline-flex items-center gap-1 rounded-lg bg-[#1d1d1f] px-2 py-1 text-xs font-semibold text-white" title={`🔒 Set by ${plan.receivedFrom.name || "your teacher"}. You cannot change it; add your own date next to it.`}>
                                  <span aria-hidden="true">🔒</span>{dueLabel(item.dueDate)}<span className="max-w-[7rem] truncate font-normal opacity-80">· {plan.receivedFrom.name || "Your teacher"}</span>
                                </span>
                                <input
                                  type="date"
                                  className="rounded-lg border border-ink/25 px-2 py-1 text-xs"
                                  aria-label="Your own deadline for this step"
                                  title="Your own deadline (optional)"
                                  max={item.dueDate}
                                  value={item.ownDueDate || ""}
                                  onChange={(event) => updateOpen((current) => ({ ...current, items: current.items.map((entry) => (entry.id === item.id ? { ...entry, ownDueDate: event.target.value } : entry)) }))}
                                />
                              </span>
                            ) : (
                              <input
                                type="date"
                                className="rounded-lg border border-ink/12 px-2 py-1 text-xs"
                                value={item.dueDate || ""}
                                onChange={(event) => updateOpen((current) => ({ ...current, items: current.items.map((entry) => (entry.id === item.id ? { ...entry, dueDate: event.target.value } : entry)) }))}
                              />
                            )}
                            {/* Every step can be opened: the quiz or flashcards to do, the summary to read, the document to study. */}
                            {activity ? (
                              <button type="button" className={primaryBtn} onClick={() => setPlaying({ activity, resource: itemResource, resourceDocument: itemResourceDoc, documentId: item.resourceId, itemId: item.id, planDocumentId: open.document.id })}>Do activity</button>
                            ) : itemResource ? (
                              <button type="button" className={primaryBtn} onClick={() => setReading({ resource: itemResource, document: itemResourceDoc })}>Open</button>
                            ) : readable || linkedDocument ? (
                              <button type="button" className={primaryBtn} onClick={() => setReadingDoc({ ...(readable || linkedDocument), focus: item.kind === "read" || item.kind === "review" ? { title: item.title, concepts: item.concepts || [] } : null })}>Open</button>
                            ) : (
                              <button type="button" className={primaryBtn} disabled title={item.generate ? "Not generated yet — build the plan's material first" : "Nothing is attached to this step yet"}>Open</button>
                            )}
                            <button type="button" className="text-xs text-soft-ink hover:text-[var(--color-danger)]" title="Remove from the plan" onClick={() => updateOpen((current) => ({ ...current, items: current.items.filter((entry) => entry.id !== item.id) }))}>✕</button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* ── Student model — full width ── */}
        <section className={`${card} p-5`}>
          <p className={kicker}>Student model</p>
          <p className="m-0 mt-1 text-[11px] text-soft-ink">Mastery per concept, ordered by concept map hierarchy. Updated live after each activity.</p>
          <ConceptMasteryList concepts={graphConcepts} prerequisites={graphPrereqs} masteryByConceptId={masteryByConceptId} />
        </section>

        {/* ── Sub-plans ── */}
        <section className={`${card} p-5`}>
          <p className={kicker}>Sub-plans</p>
          <p className="m-0 mt-1 text-[11px] text-soft-ink">Break a big exam into the topics it is made of; the parent shows their combined progress.</p>
          <div className="mt-2 grid gap-1.5">
            {children.map((row) => {
              const childProgress = planProgress(row.plan, attempts);
              return (
                <button key={row.document.id} type="button" className="flex items-center gap-2 rounded-xl border border-ink/10 px-3 py-2 text-left hover:bg-[var(--surface-soft)]" onClick={() => setOpenId(row.document.id)}>
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: row.plan.colour }} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{row.plan.name}</span><span className="block text-[11px] text-soft-ink">{childProgress.done}/{childProgress.total} steps{childProgress.deadline ? ` · ${dueLabel(childProgress.deadline.date)}` : ""}</span></span>
                  <span className="text-xs font-bold text-soft-ink">{Math.round(childProgress.ratio * 100)}%</span>
                </button>
              );
            })}
            <button type="button" className={`${ghostBtn} justify-self-start`} onClick={() => { setDraft({ name: "", examDate: "", colour: plan.colour, note: "", parentPlanId: open.document.id }); setCreating(true); }}>＋ New sub-plan</button>
            {plans.filter((row) => row.document.id !== open.document.id && !row.plan.parentPlanId).length ? (
              <select className="rounded-lg border border-ink/12 bg-white px-2 py-1 text-xs" value="" onChange={(event) => { const row = plans.find((item) => item.document.id === event.target.value); if (row) save({ ...row.plan, parentPlanId: open.document.id }, row.document.id); }}>
                <option value="">Move an existing plan under this one…</option>
                {plans.filter((row) => row.document.id !== open.document.id && !row.plan.parentPlanId).map((row) => <option key={row.document.id} value={row.document.id}>{row.plan.name}</option>)}
              </select>
            ) : null}
          </div>
        </section>

        {/* ── Concept map — full width, last ── */}
        <section className={`${card} p-5`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className={kicker}>Concept map</p>
              <p className="m-0 mt-1 mb-4 text-sm text-soft-ink">
                All concepts from your reference material — sized by importance, coloured by mastery.
                Arrows show prerequisites. Drag to rearrange, scroll to zoom, click to highlight a concept{"'"}s chain.
              </p>
            </div>
            {open?.plan?.materialIds?.length > 0 && (
              <button
                type="button"
                className={ghostBtn}
                disabled={extracting}
                onClick={() => setRebuildConfirmOpen(true)}
              >
                {extracting ? "Extracting concepts…" : "↺ Rebuild concept map"}
              </button>
            )}
          </div>
          {extracting ? (
            <div className="flex items-center justify-center rounded-2xl bg-[var(--surface-soft)] py-16">
              <p className="m-0 text-sm text-soft-ink">Extracting concepts from your reference material…</p>
            </div>
          ) : (
            <KnowledgeGraph
              concepts={graphConcepts}
              prerequisites={graphPrereqs}
              masteryByConceptId={masteryByConceptId}
              height={520}
            />
          )}
        </section>

        {status ? <p className="m-0 px-1 text-xs text-[var(--accent-ink)]">{status}{busy ? " …" : ""}</p> : null}
        {creating ? <CreateDialog draft={draft} setDraft={setDraft} busy={busy} plans={plans} onCancel={() => setCreating(false)} onCreate={async () => { const plan = buildPlan(draft); const saved = await save(plan); await fileNewPlan(plan, saved?.id || saved?.documentId || ""); setCreating(false); setDraft({ name: "", examDate: "", colour: PLAN_COLOURS[0], note: "", parentPlanId: "" }); }} /> : null}
        {deletingPlan ? <DeletePlanDialog planRow={deletingPlan} documents={documents} folders={folders} busy={busy} onCancel={() => setDeletingPlan(null)} onConfirm={(opts) => deletePlan(deletingPlan, opts)} /> : null}

        {/* ── Rebuild confirmation modal ── */}
        {rebuildConfirmOpen && (
          <div className="tw-scope fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={() => setRebuildConfirmOpen(false)}>
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-[0_24px_64px_rgba(0,0,0,0.25)]" onClick={(e) => e.stopPropagation()}>
              <h4 className="m-0 text-lg font-bold text-ink">Rebuild concept map?</h4>
              <p className="m-0 mt-2 text-sm text-soft-ink">
                Rebuilding the concept map may change your performance tracking data. Concepts that no longer exist will be removed from the student model and their mastery scores will be lost.
              </p>
              <p className="m-0 mt-2 text-sm text-soft-ink">
                You will be shown a preview of the changes before they are applied.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" className={ghostBtn} onClick={() => setRebuildConfirmOpen(false)}>Cancel</button>
                <button
                  type="button"
                  className={primaryBtn}
                  onClick={() => {
                    setRebuildConfirmOpen(false);
                    const ownerUserId = typeof window !== "undefined" ? (window.localStorage.getItem("luna.ownerUserId") || "") : "";
                    doRebuildConceptMap(open.plan.materialIds, selectedWorkspaceId, ownerUserId);
                  }}
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Rebuild preview modal ── */}
        {rebuildPreview && (
          <div className="tw-scope fixed inset-0 z-50 flex flex-col overflow-hidden bg-black/40 p-4">
            <div className="mx-auto flex h-full w-full max-w-4xl flex-col rounded-2xl bg-white shadow-[0_24px_64px_rgba(0,0,0,0.3)]">
              {/* Header */}
              <div className="border-b border-ink/8 px-6 py-4">
                <h4 className="m-0 text-lg font-bold text-ink">New concept map preview</h4>
                <p className="m-0 mt-0.5 text-xs text-soft-ink">Review the changes before applying. Click Accept to update the student model and activity tags, or Go back to keep the old map.</p>
              </div>
              {/* Diff strip */}
              <div className="flex flex-wrap gap-6 border-b border-ink/8 px-6 py-3">
                {addedConcepts.length > 0 && (
                  <div>
                    <p className="m-0 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#2f9e5b" }}>
                      {`Added (${addedConcepts.length})`}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {addedConcepts.slice(0, 10).map((c) => (
                        <span key={c.id} className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "rgba(47,158,91,0.1)", color: "#1d7a44" }}>{c.name}</span>
                      ))}
                      {addedConcepts.length > 10 && <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-soft-ink" style={{ background: "rgba(0,0,0,0.04)" }}>{`+${addedConcepts.length - 10} more`}</span>}
                    </div>
                  </div>
                )}
                {removedConcepts.length > 0 && (
                  <div>
                    <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-danger)]">
                      {`Removed (${removedConcepts.length})`}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {removedConcepts.slice(0, 10).map((c) => (
                        <span key={c.id} className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "rgba(255,59,48,0.08)", color: "var(--color-danger)" }}>{c.name}</span>
                      ))}
                      {removedConcepts.length > 10 && <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-soft-ink" style={{ background: "rgba(0,0,0,0.04)" }}>{`+${removedConcepts.length - 10} more`}</span>}
                    </div>
                  </div>
                )}
                {addedConcepts.length === 0 && removedConcepts.length === 0 && (
                  <p className="m-0 text-xs text-soft-ink">No concept names changed — internal structure may have been reorganised.</p>
                )}
              </div>
              {/* New graph */}
              <div className="flex-1 overflow-auto px-6 py-4">
                <KnowledgeGraph
                  concepts={rebuildPreview.newConcepts}
                  prerequisites={rebuildPreview.newPrereqs}
                  masteryByConceptId={masteryByConceptId}
                  height={360}
                />
              </div>
              {/* Footer */}
              <div className="flex justify-end gap-2 border-t border-ink/8 px-6 py-4">
                <button type="button" className={ghostBtn} onClick={handleGoBackRebuild}>← Go back</button>
                <button type="button" className={primaryBtn} onClick={handleAcceptRebuild}>Accept new map</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Material picker modal: uploaded material and generated resources, kept apart ── */}
        {materialPickerOpen && (
          <MaterialPickerModal
            documents={documents.filter((d) => !(d.tags || []).includes("study-plan") && !(d.tags || []).includes("activity-attempt"))}
            folders={folders}
            resources={resources}
            plan={open.plan}
            initialPicked={[...(open.plan.materialIds || []), ...open.plan.items.map((i) => i.resourceId).filter(Boolean)]}
            onClose={() => setMaterialPickerOpen(false)}
            onConfirm={({ materialIds, resourceIds }) => {
              const resourceIdSet = new Set(resources.map((r) => r.document.id));
              const isGenerated = (id) => {
                const document = workspaceDocuments.find((d) => d.id === id);
                return document ? isGeneratedDocument(document, resourceIdSet) : resourceIdSet.has(id);
              };
              // Earlier versions filed generated resources under materialIds; they are read as resources here.
              const prevUploaded = new Set((open.plan.materialIds || []).filter((id) => !isGenerated(id)));
              const prevGenerated = new Set([...open.plan.items.map((i) => i.resourceId).filter(Boolean), ...(open.plan.materialIds || []).filter(isGenerated)]);
              const addedUploaded = materialIds.filter((id) => !prevUploaded.has(id));
              const removedGenerated = new Set([...prevGenerated].filter((id) => !resourceIds.includes(id)));

              // Generated resources are steps of the plan; remove only the ones not done yet.
              const itemsAfterRemoval = open.plan.items.filter((i) => {
                if (!i.resourceId || !removedGenerated.has(i.resourceId)) return true;
                return Boolean(i.doneAt) || progress.scoreByResource.get(i.resourceId) !== undefined;
              });
              const addedItems = resourceIds.filter((id) => !prevGenerated.has(id)).map((id) => {
                const document = workspaceDocuments.find((d) => d.id === id);
                if (!document || open.plan.items.some((i) => i.resourceId === id)) return null;
                const row = resources.find((r) => r.document.id === id);
                return newItem({ resourceId: id, title: row?.resource.name || document.name, kind: row?.resource.activity ? "activity" : "read" });
              }).filter(Boolean);

              const nextPlan = { ...open.plan, materialIds, items: [...itemsAfterRemoval, ...addedItems] };
              save(nextPlan, open.document.id);
              setMaterialPickerOpen(false);

              if (addedUploaded.length) {
                const ownerUserId = typeof window !== "undefined" ? (window.localStorage.getItem("luna.ownerUserId") || "") : "";
                triggerExtraction(addedUploaded, selectedWorkspaceId, ownerUserId);
                setStatus("Material added — reading its concepts…");
              }
              // Anything new means the rest of the plan has to be redone around it.
              if (addedUploaded.length || addedItems.length) setRevising({ plan: nextPlan, newUploadedIds: addedUploaded });
            }}
          />
        )}
        {revising ? (
          <RevisePlanDialog
            row={{ document: open.document, plan: revising.plan }}
            documents={workspaceDocuments}
            resources={resources}
            attempts={attempts}
            conceptMap={graphConcepts}
            newUploadedIds={revising.newUploadedIds}
            ready={!extracting}
            onCancel={() => { setRevising(null); setStatus("Plan left as it was — the new material is linked, but nothing was rescheduled."); }}
            onApply={async (nextPlan, { buildNow }) => {
              const target = { document: open.document, plan: nextPlan };
              setRevising(null);
              await save(nextPlan, open.document.id);
              setStatus(`Plan re-planned: finished work kept, ${nextPlan.items.filter((item) => !item.doneAt).length} steps still to do.`);
              if (buildNow) await build(target);
            }}
          />
        ) : null}
        {playing ? (
          <ReaderView
              resource={playing.resource}
              activity={playing.activity}
              chat={{ documentId: playing.documentId, planId: playing.planDocumentId }}
              highlights={playing.resource?.highlights || []}
              onSaveHighlights={(list) => saveHighlights(playing.resourceDocument, playing.resource, list)}
              onSubmit={async (attempt) => {
                await saveAttempt(attempt, playing.documentId);
                const row = plans.find((r) => r.document.id === playing.planDocumentId);
                if (row) save({ ...row.plan, items: row.plan.items.map((entry) => entry.id === playing.itemId ? { ...entry, doneAt: new Date().toISOString() } : entry) }, playing.planDocumentId);
                // The window stays open: checking the answers is when the learner reads what was right and wrong.
              }}
              onClose={() => setPlaying(null)}
            />
        ) : null}
        {readingDoc ? (
          <DocumentReader
            document={readingDoc}
            documents={workspaceDocuments}
            onClose={() => setReadingDoc(null)}
            onSaveGeneratedQuizDocument={onSaveGeneratedQuizDocument}
            onUpdateGeneratedDocument={onUpdateGeneratedDocument}
            onDownloadDocument={onDownloadDocument}
            onUpdateDocumentContent={onUpdateDocumentContent}
            focus={readingDoc.focus}
            planId={open.document.id}
          />
        ) : null}
        {reading ? (
          <ReaderView
            resource={reading.resource}
            chat={{ documentId: reading.document?.id, planId: open.document.id }}
            highlights={reading.resource?.highlights || []}
            onSaveHighlights={(list) => saveHighlights(reading.document, reading.resource, list)}
            onClose={() => setReading(null)}
          />
        ) : null}
      </section>
    );
  }

  /* ---------------------------------------------------------------- all plans */
  return (
    <section className="tw-scope grid gap-4">
      <SubjectTabs workspaces={workspaces} selectedWorkspaceId={selectedWorkspaceId} selectedSubjectId={selectedSubjectId} onSelectSubject={onSelectSubject} />
      <div className={`${card} flex flex-wrap items-center justify-between gap-3 p-5`}>
        <div>
          <p className={kicker}>Study plans · {subject.name}</p>
          <h3 className="m-0 mt-1 text-xl font-bold text-ink">{plans.length} plan{plans.length === 1 ? "" : "s"}</h3>
          <p className="m-0 mt-1 text-sm text-soft-ink">Deadlines, what has to be achieved, and the resources and activities that get {role === "student" ? "you" : "them"} there. Doing an activity on Luna ticks it off by itself.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-xl bg-[var(--surface-soft)] p-1">
            {[["plans", "Plans"], ["calendar", "Calendar"], ...(examDates.length ? [["exams", `Exam dates (${examDates.filter((entry) => !entry.dismissedAt).length})`]] : [])].map(([value, label]) => <button key={value} type="button" onClick={() => setTab(value)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === value ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink"}`}>{label}</button>)}
          </div>
          <button type="button" className={ghostBtn} onClick={() => { setPickedExam(null); setGenerating(true); }}>✦ Plan it for me</button>
          <button type="button" className={primaryBtn} onClick={() => { setPickedExam(null); setDraft({ name: "", examDate: "", examDateId: "", colour: PLAN_COLOURS[plans.length % PLAN_COLOURS.length], note: "", parentPlanId: "" }); setCreating(true); }}>＋ New plan</button>
        </div>
      </div>

      {alerts.length ? (
        <section className={`${card} p-5`}>
          <div className="flex items-center justify-between gap-2">
            <p className={kicker}>Next up</p>
            <span className="text-[11px] text-soft-ink">{alerts.filter((alert) => alert.days < 0).length} late · {alerts.filter((alert) => alert.days === 0).length} today</span>
          </div>
          <ul className="m-0 mt-2 grid list-none gap-1.5 p-0">
            {alerts.slice(0, 6).map((alert) => (
              <li key={`${alert.planId}-${alert.id}`}>
                <button type="button" className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition hover:bg-[var(--surface-soft)] ${alert.days < 0 ? "border-[var(--color-danger)]/30 bg-[rgba(255,59,48,0.04)]" : alert.days === 0 ? "border-[var(--accent)]/40 bg-[var(--accent-soft)]/40" : "border-ink/10"}`} onClick={() => setOpenId(alert.planId)}>
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: alert.colour }} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{alert.kind === "deadline" ? "★ " : ""}{alert.title}</span><span className="block text-[11px] text-soft-ink">{alert.planName}</span></span>
                  {alert.imposed || alert.kind === "deadline" ? <OriginBadge imposed={Boolean(alert.imposed)} by={alert.setByName} /> : null}
                  <span className={`shrink-0 text-xs font-semibold ${alert.days < 0 ? "text-[var(--color-danger)]" : "text-soft-ink"}`}>{dueLabel(alert.dueDate)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {status ? <p className="m-0 px-1 text-xs text-[var(--accent-ink)]">{status}</p> : null}

      {tab === "exams" ? (
        <ExamDatesCard
          examDates={examDates}
          showHidden
          title="Exam dates from my teachers"
          emptyHint="Nothing yet. When a teacher or parent sends you an exam date it shows here and in the bell."
          onPlan={(entry) => { setPickedExam(entry); setGenerating(true); }}
          onOpenPlan={(documentId) => { const row = plans.find((entry) => entry.document.id === documentId); if (row) { setTab("plans"); setOpenId(documentId); } else setStatus("That plan is in another topic: open it from there."); }}
          onDismiss={(entry, hide) => onDismissExamDate?.(entry, hide)}
        />
      ) : tab === "calendar" ? <PlanCalendar rows={plans} attempts={attempts} onOpenPlan={setOpenId} onMoveItem={moveItem} /> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {roots.map(({ document, plan }) => {
            const children = plans.filter((row) => row.plan.parentPlanId === document.id);
            const progress = planProgress(children.length ? withSubPlans(plan, plans) : plan, attempts);
            return (
              <PlanCard
                key={document.id}
                document={document}
                plan={plan}
                subPlans={children}
                progress={progress}
                building={building}
                sharedLabel={isSharedDocument(document) ? `${isAssignedDocument(document) ? "Assigned" : "Shared"} by ${senderNameOf(document, folders) || "another account"} · read-only (you can tick steps off)` : ""}
                shareLabel={role === "teacher" || role === "parent" ? "Assign…" : "Share…"}
                onShare={onShareDocument && !isSharedDocument(document) ? () => onShareDocument(document) : undefined}
                onBuild={build}
                onOpen={setOpenId}
                onDelete={onRemoveDocument && !isSharedDocument(document) ? setDeletingPlan : undefined}
              />
            );
          })}
          {!plans.length ? <p className="m-0 text-sm text-soft-ink">No plans yet — create one, or let Luna build one from your material.</p> : null}
        </div>
      )}

      {creating ? <CreateDialog draft={draft} setDraft={setDraft} busy={busy} plans={plans} examDates={examDates} onCancel={() => setCreating(false)} onCreate={async () => {
        // A teacher's exam date becomes the plan's first deadline: locked, and it follows the date if the teacher moves it.
        const exam = draft.examDateId ? examDates.find((entry) => entry.id === draft.examDateId) : null;
        const plan = buildPlan({ ...draft, deadlines: exam ? [examDeadline(exam)] : [] });
        const saved = await save(plan);
        await fileNewPlan(plan, saved?.id || saved?.documentId || "");
        setCreating(false);
        setDraft({ name: "", examDate: "", examDateId: "", colour: PLAN_COLOURS[0], note: "", parentPlanId: "" });
      }} /> : null}
      {deletingPlan ? <DeletePlanDialog planRow={deletingPlan} documents={documents} folders={folders} busy={busy} onCancel={() => setDeletingPlan(null)} onConfirm={(opts) => deletePlan(deletingPlan, opts)} /> : null}

      {generating ? (
        <GeneratePlanDialog
          documents={documents}
          agents={agentCatalog}
          workspaceId={selectedWorkspaceId}
          folders={folders}
          resources={resources}
          attempts={attempts}
          examDates={examDates}
          initialExam={pickedExam}
          onCancel={() => setGenerating(false)}
          onDone={(message, info) => { setGenerating(false); setStatus(message); if (info && info.built === false) fileNewPlan(info.plan, info.savedId); }}
          onSavePlan={(plan) => save(plan)}
          onBuild={async (plan, savedDocumentId, report) => {
            // The plan is worth nothing until its material exists, so it is built immediately —
            // into its own folders, with the material it studies linked rather than copied.
            setStatus("Setting up the plan's folders…");
            const planFolders = await ensurePlanFolders(plan.name, { folders, subjectId: selectedSubjectId, onCreateFolder });
            if (savedDocumentId && planFolders.planId) await onUpdateDocumentMeta?.(savedDocumentId, { folderIds: [planFolders.planId], tags: [PLAN_TAG] });
            const result = await executePlan({
              plan,
              documents: workspaceDocuments,
              agentDocuments,
              subjectName: subject?.name || "",
              workspaceId: selectedWorkspaceId,
              subjectId: selectedSubjectId,
              folderIds: planFolders.generatedId ? [planFolders.generatedId] : [],
              onSaveGeneratedQuizDocument,
              onUpdateGeneratedDocument,
              onProgress: (event) => {
                const { phase, index, total, title, detail } = event;
                setStatus(phase === "master" ? `Merging your documents into one master document${detail ? ` — ${detail}` : ""}…` : `Building ${index + 1} of ${total}: ${title}…`);
                report?.(event);
              }
            });
            if (savedDocumentId) await save(result.plan, savedDocumentId);
            return result;
          }}
        />
      ) : null}
    </section>
  );
}

function DeletePlanDialog({ planRow, documents, folders, busy, onCancel, onConfirm }) {
  const plan = planRow.plan;
  const scope = planDeletionScope(planRow.document, plan, { folders, documents });
  const built = new Set((plan.items || []).filter((item) => item.generate && item.resourceId).map((item) => item.resourceId));
  const generatedCount = new Set([...scope.generatedIds, ...[...built].filter((id) => documents.some((doc) => doc.id === id))]).size;
  const resourceIds = new Set((plan.items || []).map((item) => item.resourceId).filter(Boolean));
  const metricsCount = documents.filter((doc) => {
    if (!(doc.tags || []).includes("activity-attempt")) return false;
    try { return resourceIds.has(JSON.parse(doc.content || "{}").activityDocumentId); }
    catch { return false; }
  }).length;

  const [delMetrics, setDelMetrics] = useState(false);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-[0_24px_64px_rgba(0,0,0,0.25)]" onClick={(e) => e.stopPropagation()}>
        <h4 className="m-0 text-lg font-bold text-ink">Delete &ldquo;{plan.name}&rdquo;?</h4>
        <p className="m-0 mt-1 text-sm text-soft-ink">This permanently removes:</p>
        <ul className="m-0 mt-2 grid list-disc gap-1 pl-5 text-sm text-ink">
          <li>the plan</li>
          {scope.folderId ? <li>its folder &ldquo;{scope.folderName}&rdquo; in the workspace</li> : null}
          <li>{generatedCount ? `${generatedCount} generated resource${generatedCount === 1 ? "" : "s"} (quizzes, summaries…) built for it` : "no generated resources (none were built)"}</li>
        </ul>
        <p className="m-0 mt-2 text-xs text-soft-ink">Your uploaded material is not deleted — it just leaves the plan&rsquo;s folder and stays wherever else it is filed.</p>

        <div className="mt-4 grid gap-3">
          <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${delMetrics ? "border-[var(--color-danger)]/40 bg-[rgba(255,59,48,0.04)]" : "border-ink/10 hover:border-ink/20"}`}>
            <input type="checkbox" className="mt-0.5 accent-[var(--color-danger)]" checked={delMetrics} onChange={(e) => setDelMetrics(e.target.checked)} disabled={!metricsCount} />
            <div>
              <p className="m-0 text-sm font-semibold text-ink">Also delete performance metrics</p>
              <p className="m-0 mt-0.5 text-xs text-soft-ink">
                {metricsCount
                  ? `${metricsCount} activity attempt${metricsCount === 1 ? "" : "s"} recorded against this plan's resources will be erased.`
                  : "No recorded attempts found for this plan's resources."}
              </p>
            </div>
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={ghostBtn} onClick={onCancel}>Cancel</button>
          <button
            type="button"
            disabled={busy}
            className="inline-flex items-center justify-center rounded-full bg-[var(--color-danger)] px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            onClick={() => onConfirm({ metrics: delMetrics })}
          >
            {busy ? "Deleting…" : "Delete plan"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateDialog({ draft, setDraft, busy, plans, examDates = [], onCancel, onCreate }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-[0_24px_64px_rgba(0,0,0,0.25)]" onClick={(event) => event.stopPropagation()}>
        <h4 className="m-0 text-lg font-bold text-ink">{draft.parentPlanId ? "New sub-plan" : "New study plan"}</h4>
        <p className="m-0 mt-1 text-xs text-soft-ink">A name and a first deadline. Goals, resources and further deadlines are added inside.</p>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-xs font-semibold text-soft-ink">Name<input autoFocus className={field} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Maths final · June" /></label>
          <ExamDatePicker examDates={examDates} value={draft.examDateId || ""} onChange={(exam) => setDraft({ ...draft, examDateId: exam?.id || "", examDate: exam?.date || draft.examDate, name: draft.name || exam?.title || "" })} />
          <label className="grid gap-1 text-xs font-semibold text-soft-ink">First deadline<input type="date" className={field} disabled={Boolean(draft.examDateId)} value={draft.examDate} onChange={(event) => setDraft({ ...draft, examDate: event.target.value })} /></label>
          <label className="grid gap-1 text-xs font-semibold text-soft-ink">What is it for?<textarea className={field} rows={2} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="Cover units 4 to 6 and fix the mistakes from the mock." /></label>
          <label className="grid gap-1 text-xs font-semibold text-soft-ink">Part of
            <select className={field} value={draft.parentPlanId} onChange={(event) => setDraft({ ...draft, parentPlanId: event.target.value })}>
              <option value="">A plan of its own</option>
              {plans.map((row) => <option key={row.document.id} value={row.document.id}>{row.plan.name}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            {PLAN_COLOURS.map((colour) => <button key={colour} type="button" aria-label={`Colour ${colour}`} className={`size-6 rounded-full ${draft.colour === colour ? "ring-2 ring-offset-2 ring-ink/40" : ""}`} style={{ background: colour }} onClick={() => setDraft({ ...draft, colour })} />)}
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={ghostBtn} onClick={onCancel}>Cancel</button>
          <button type="button" className={primaryBtn} disabled={busy || !draft.name.trim()} onClick={onCreate}>{busy ? "Creating…" : "Create plan"}</button>
        </div>
      </div>
    </div>
  );
}
