"use client";

import { useEffect, useMemo, useState } from "react";
import { DEADLINE_KINDS, ITEM_KINDS, PLAN_COLOURS, PLAN_TAG, buildPlan, dueLabel, newDeadline, newItem, nextDeadline, parsePlan, planProgress, planWeeks, upcoming, withSubPlans } from "./plan";
import { parseResource } from "../resources/resource";
import { conceptIndex, resourceConcepts } from "../resources/concepts";
import { joinAttempts } from "../performance/metrics";
import { PlanCalendar } from "./PlanCalendar";
import { GeneratePlanDialog } from "./GeneratePlanDialog";
import { executePlan } from "./execute";
import { ensurePlanFolders, linkMaterial } from "./folders";
import { ActivityPlayer } from "../activities/ActivityPlayer";
import { KnowledgeGraph } from "./KnowledgeGraph.js";

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
function FolderPickerNode({ node, depth = 0, docs, picked, onToggle, docLabel }) {
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
            </label>
          ))}
          {node.children.map((child) => <FolderPickerNode key={child.id} node={child} depth={depth + 1} docs={docs} picked={picked} onToggle={onToggle} docLabel={docLabel} />)}
        </div>
      )}
    </div>
  );
}

/**
 * Full-height modal that mirrors the GeneratePlanDialog file picker.
 * initialPicked = union of plan.materialIds + plan items' resourceIds.
 * onConfirm(newPicked[]) returns the final selection.
 */
function MaterialPickerModal({ documents, folders, resources, initialPicked, onClose, onConfirm }) {
  const [picked, setPicked] = useState(() => [...initialPicked]);
  const resourceByDocumentId = useMemo(() => new Map(resources.map((row) => [row.document.id, row.resource])), [resources]);
  const folderTree = useMemo(() => buildFolderTree(folders), [folders]);
  const allFolderIds = useMemo(() => new Set(folders.map((f) => f.id)), [folders]);
  const unorganised = useMemo(() => documents.filter((d) => {
    const df = d.folderIds || (d.folderId ? [d.folderId] : []);
    return !df.some((fid) => allFolderIds.has(fid));
  }), [documents, allFolderIds]);

  const toggle = (id) => setPicked((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const docLabel = (doc) => (doc && (resourceByDocumentId.get(doc.id)?.name || doc.name || doc.id)) || "";
  const pickedDocs = picked.map((id) => {
    const doc = documents.find((d) => d.id === id);
    return { id, label: docLabel(doc || { id, name: id }) };
  });

  return (
    <div className="tw-scope fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-[0_24px_64px_rgba(0,0,0,0.25)]" style={{ maxHeight: "82vh" }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-ink/8 px-5 py-4">
          <div>
            <h4 className="m-0 text-base font-bold text-ink">Materials &amp; resources</h4>
            <p className="m-0 mt-0.5 text-xs text-soft-ink">Tick documents to include — they feed the concept map and can be scheduled as reading steps.</p>
          </div>
          <button type="button" className="shrink-0 text-soft-ink hover:text-ink" onClick={onClose}>✕</button>
        </div>

        {/* Folder tree */}
        <div className="flex-1 overflow-y-auto p-3 grid gap-0.5">
          {!documents.length
            ? <p className="m-0 p-2 text-xs text-soft-ink">No documents in this workspace yet.</p>
            : (<>
                {folderTree.map((node) => <FolderPickerNode key={node.id} node={node} docs={documents} picked={picked} onToggle={toggle} docLabel={docLabel} />)}
                {unorganised.map((doc) => (
                  <label key={doc.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-0.5 text-sm text-ink transition hover:bg-ink/5">
                    <input type="checkbox" checked={picked.includes(doc.id)} onChange={() => toggle(doc.id)} className="shrink-0" />
                    <span className="truncate">{docLabel(doc)}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-soft-ink">{doc.sourceType === "generated" ? "resource" : "material"}</span>
                  </label>
                ))}
              </>)}
        </div>

        {/* Selected tray */}
        {pickedDocs.length > 0 && (
          <div className="border-t border-ink/8 px-4 py-3">
            <p className="m-0 mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">{pickedDocs.length} selected</p>
            <div className="flex max-h-20 flex-wrap gap-1.5 overflow-y-auto">
              {pickedDocs.map(({ id, label }) => (
                <span key={id} className="inline-flex items-center gap-1 rounded-full border border-[var(--accent)]/25 bg-[var(--accent)]/5 px-2 py-0.5 text-[11px] font-medium text-ink">
                  <span className="max-w-[140px] truncate">{label}</span>
                  <button type="button" onClick={() => toggle(id)} className="ml-0.5 shrink-0 text-soft-ink hover:text-[var(--color-danger)]" aria-label={`Remove ${label}`}>×</button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-ink/8 px-5 py-4">
          <button type="button" className={ghostBtn} onClick={onClose}>Cancel</button>
          <button type="button" className={primaryBtn} onClick={() => onConfirm(picked)}>Confirm selection</button>
        </div>
      </div>
    </div>
  );
}

/** Concept mastery list — hierarchical (mirrors concept map), with mastery bar each. */
function ConceptMasteryList({ concepts = [], masteryByConceptId = {} }) {
  if (!concepts.length) return <p className="m-0 text-xs text-soft-ink">No concept data yet. Upload reference material to populate.</p>;

  const color = (m) => m === undefined ? "#9ca3af" : m < 0.4 ? "#ff3b30" : m < 0.7 ? "#ff9500" : "#34c759";

  // Build parent→children map using c.topic as the parent name.
  // Roots are concepts whose topic doesn't match any other concept's name.
  const byName = new Map(concepts.map((c) => [c.name, c]));
  const children = new Map(concepts.map((c) => [c.id, []]));
  const roots = [];
  for (const c of concepts) {
    const parent = c.topic ? byName.get(c.topic) : null;
    if (parent) {
      children.get(parent.id).push(c);
    } else {
      roots.push(c);
    }
  }

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

/** Ring showing how much of a plan is done — the one number a plan is judged on. */
function Ring({ ratio, colour, size = 56 }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="6" />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={colour} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${circumference * Math.max(0, Math.min(1, ratio))} ${circumference}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize={size * 0.26} fontWeight="700" fill="#1d1d1f">{Math.round(ratio * 100)}%</text>
    </svg>
  );
}

/**
 * Study plans: several at once, nested (a final exam made of the topics it covers), each with its
 * deadlines, its goals — expressed as the concepts its resources teach — and its schedule. The
 * calendar puts every plan on the same weeks so a collision is visible before it happens, and the
 * alert panel says what is due now.
 */
export function PlansPage({ role = "student", workspaces = [], selectedWorkspaceId, selectedSubjectId, onSaveGeneratedQuizDocument, onUpdateGeneratedDocument, onUpdateDocumentMeta, onCreateFolder, onRemoveDocument, onOpenResource, onDownloadDocument }) {
  const [building, setBuilding] = useState("");
  const subject = workspaces.find((w) => w.id === selectedWorkspaceId)?.subjects?.find((s) => s.id === selectedSubjectId) || null;
  const documents = subject?.documents || [];
  const folders = subject?.folders || [];
  const [openId, setOpenId] = useState("");
  const [tab, setTab] = useState("plans");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState({ name: "", examDate: "", colour: PLAN_COLOURS[0], note: "", parentPlanId: "" });
  const [playing, setPlaying] = useState(null); // { activity, documentId, itemId, planDocumentId }
  const [deletingPlan, setDeletingPlan] = useState(null); // plan row to confirm-delete
  const [planView, setPlanView] = useState("list"); // "list" | "calendar" inside the open plan
  const [replanResult, setReplanResult] = useState(null);
  const [replanning, setReplanning] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [materialPickerOpen, setMaterialPickerOpen] = useState(false);

  // Knowledge graph + student model state
  const [graphConcepts, setGraphConcepts] = useState([]);
  const [graphPrereqs, setGraphPrereqs] = useState([]);
  const [masteryByConceptId, setMasteryByConceptId] = useState({});

  const plans = useMemo(() => documents.map((document) => ({ document, plan: parsePlan(document) })).filter((row) => row.plan), [documents]);
  const resources = useMemo(() => documents.map((document) => ({ document, resource: parseResource(document) })).filter((row) => row.resource), [documents]);
  const attempts = useMemo(() => joinAttempts(documents), [documents]);
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

  // Fetch concept graph + mastery whenever the open plan or workspace changes.
  // If no concepts exist yet but the plan has linked material, auto-trigger extraction.
  useEffect(() => {
    if (!open || !selectedWorkspaceId) return;
    const learnerId = (typeof window !== "undefined" && window.localStorage.getItem("luna.learnerId")) || "anonymous";
    const ownerUserId = typeof window !== "undefined" ? (window.localStorage.getItem("luna.ownerUserId") || "") : "";

    Promise.all([
      fetch(`/api/concepts?workspaceId=${selectedWorkspaceId}`).then((r) => r.json()).catch(() => ({ concepts: [], prerequisites: [] })),
      fetch(`/api/student/mastery?learnerId=${encodeURIComponent(learnerId)}&workspaceId=${selectedWorkspaceId}`).then((r) => r.json()).catch(() => ({ states: [] })),
    ]).then(([conceptData, masteryData]) => {
      const fetchedConcepts = Array.isArray(conceptData.concepts) ? conceptData.concepts : [];
      setGraphConcepts(fetchedConcepts);
      setGraphPrereqs(Array.isArray(conceptData.prerequisites) ? conceptData.prerequisites : []);
      const byId = {};
      for (const s of (masteryData.states || [])) {
        if (s.concept_id) byId[s.concept_id] = s.mastery ?? 0;
      }
      setMasteryByConceptId(byId);

      // Auto-extract for plan-linked documents that haven't been processed yet
      if (fetchedConcepts.length === 0 && open?.plan?.materialIds?.length > 0) {
        triggerExtraction(open.plan.materialIds, selectedWorkspaceId, ownerUserId);
      }
    });
  }, [open?.document?.id, selectedWorkspaceId]);

  async function triggerExtraction(materialIds, workspaceId, ownerUserId) {
    if (!materialIds?.length || !workspaceId) return;
    setExtracting(true);
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
      const conceptData = await fetch(`/api/concepts?workspaceId=${workspaceId}`).then((r) => r.json()).catch(() => ({ concepts: [], prerequisites: [] }));
      setGraphConcepts(Array.isArray(conceptData.concepts) ? conceptData.concepts : []);
      setGraphPrereqs(Array.isArray(conceptData.prerequisites) ? conceptData.prerequisites : []);
    } finally {
      setExtracting(false);
    }
  }

  async function save(plan, documentId) {
    const content = JSON.stringify({ ...plan, updatedAt: new Date().toISOString() }, null, 2);
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
      await linkMaterial(row.plan.materialIds || [], planFolders.materialId, { documents, onUpdateDocumentMeta });
      if (planFolders.planId) await onUpdateDocumentMeta?.(row.document.id, { folderIds: [planFolders.planId], tags: row.document.tags || [] });
      const result = await executePlan({
        plan: row.plan,
        documents,
        workspaceId: selectedWorkspaceId,
        subjectId: selectedSubjectId,
        folderIds: planFolders.generatedId ? [planFolders.generatedId] : (row.document.folderIds || []).filter(Boolean),
        onSaveGeneratedQuizDocument,
        onProgress: ({ index, total, title }) => setStatus(`Building ${index + 1} of ${total}: ${title}…`)
      });
      await save(result.plan, row.document.id);
      setStatus(`${result.created} resource${result.created === 1 ? "" : "s"} generated and filed in your workspace${result.failures.length ? ` · ${result.failures.length} could not be built (${result.failures[0].message})` : ""}.`);
    } catch (error) {
      setStatus(String(error.message || error));
    } finally {
      setBuilding("");
    }
  }

  /**
   * Delete a study plan and — optionally — the auto-generated materials it produced and/or
   * the activity-attempt records for its resources.
   */
  async function deletePlan(planRow, { materials, metrics }) {
    if (!onRemoveDocument) return;
    setBusy(true);
    try {
      const plan = planRow.plan;
      const toDelete = [planRow.document.id];

      if (materials) {
        // Only remove documents that were auto-generated (item.generate) and still exist
        const generatedIds = (plan.items || [])
          .filter((item) => item.generate && item.resourceId)
          .map((item) => item.resourceId);
        toDelete.push(...generatedIds);
      }

      if (metrics) {
        // Remove activity-attempt documents for any resource in this plan
        const resourceIds = new Set((plan.items || []).map((item) => item.resourceId).filter(Boolean));
        const attemptIds = documents
          .filter((doc) => {
            if (!(doc.tags || []).includes("activity-attempt")) return false;
            try { return resourceIds.has(JSON.parse(doc.content || "{}").activityDocumentId); }
            catch { return false; }
          })
          .map((doc) => doc.id);
        toDelete.push(...attemptIds);
      }

      for (const id of [...new Set(toDelete)]) {
        await onRemoveDocument(id);
      }
      setOpenId("");
      setDeletingPlan(null);
      setStatus(`Plan "${plan.name}" deleted.`);
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

  /** Links a new document as reference material for this plan and auto-triggers concept extraction. */
  function addMaterialToPlan(docId) {
    if (!open) return;
    const current = open.plan.materialIds || [];
    if (current.includes(docId)) return;
    updateOpen((p) => ({ ...p, materialIds: [...current, docId] }));
    const ownerUserId = typeof window !== "undefined" ? (window.localStorage.getItem("luna.ownerUserId") || "") : "";
    triggerExtraction([docId], selectedWorkspaceId, ownerUserId);
    setStatus("Reference material added — rebuilding concept map…");
  }

  /** Dropping an item on a day of the calendar moves its due date, whichever plan it belongs to. */
  function moveItem(planId, itemId, date) {
    const row = plans.find((entry) => entry.document.id === planId);
    if (!row) return;
    save({ ...row.plan, items: row.plan.items.map((item) => (item.id === itemId ? { ...item, dueDate: date } : item)) }, planId);
  }

  if (!subject) return <section className="tw-scope"><p className="m-0 text-sm text-soft-ink">Choose a folder in your workspace first.</p></section>;

  /* ---------------------------------------------------------------- one plan */
  if (open) {
    const plan = open.plan;
    const children = plans.filter((row) => row.plan.parentPlanId === open.document.id);
    const whole = withSubPlans(plan, plans);
    const progress = planProgress(plan, attempts);
    const wholeProgress = planProgress(whole, attempts);
    const weeks = planWeeks(plan);
    const parent = plans.find((row) => row.document.id === plan.parentPlanId) || null;

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
                {progress.deadline ? `${progress.deadline.title}: ${dueLabel(progress.deadline.date)}` : "No deadline set"}
                {plan.learner ? ` · ${plan.learner}` : ""}
                {progress.total ? ` · ${progress.done} of ${progress.total} steps done` : ""}
                {children.length ? ` · ${children.length} sub-plan${children.length === 1 ? "" : "s"} (${wholeProgress.done}/${wholeProgress.total} in total)` : ""}
              </p>
              {plan.note ? <p className="m-0 mt-2 max-w-2xl text-sm text-ink">{plan.note}</p> : null}
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
            {(plan.deadlines || []).map((deadline) => (
              <div key={deadline.id} className="flex flex-wrap items-center gap-1.5 rounded-xl border border-ink/10 p-2">
                <input className="min-w-0 flex-1 rounded-lg border border-ink/12 px-2 py-1 text-sm" value={deadline.title} onChange={(event) => updateOpen((current) => ({ ...current, deadlines: current.deadlines.map((entry) => (entry.id === deadline.id ? { ...entry, title: event.target.value } : entry)) }))} />
                <select className="rounded-lg border border-ink/12 px-2 py-1 text-xs" value={deadline.kind} onChange={(event) => updateOpen((current) => ({ ...current, deadlines: current.deadlines.map((entry) => (entry.id === deadline.id ? { ...entry, kind: event.target.value } : entry)) }))}>
                  {DEADLINE_KINDS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
                </select>
                <input type="date" className="rounded-lg border border-ink/12 px-2 py-1 text-xs" value={deadline.date || ""} onChange={(event) => updateOpen((current) => ({ ...current, deadlines: current.deadlines.map((entry) => (entry.id === deadline.id ? { ...entry, date: event.target.value } : entry)) }))} />
                <span className="text-[11px] font-semibold text-soft-ink">{dueLabel(deadline.date)}</span>
                <button type="button" className="text-xs text-soft-ink hover:text-[var(--color-danger)]" onClick={() => updateOpen((current) => ({ ...current, deadlines: current.deadlines.filter((entry) => entry.id !== deadline.id) }))}>✕</button>
              </div>
            ))}
            <button type="button" className={`${ghostBtn} justify-self-start`} onClick={() => { const title = window.prompt("What is the deadline? e.g. Mock exam"); if (title) updateOpen((current) => ({ ...current, deadlines: [...(current.deadlines || []), newDeadline(title, "", "exam")] })); }}>＋ Add a deadline</button>
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
                        const itemResourceDoc = item.resourceId ? documents.find((d) => d.id === item.resourceId) : null;
                        const itemResource = itemResourceDoc ? parseResource(itemResourceDoc) : null;
                        const activity = itemResource?.activity?.questions?.length ? itemResource.activity : null;
                        const skillTags = inferSkillTags(item, itemResource);
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
                              {skillTags.length > 0 && (
                                <p className="m-0 mt-1 flex flex-wrap gap-1">
                                  {skillTags.map((tag) => (
                                    <span key={tag.label} className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-semibold ${tag.cls}`}>{tag.label}</span>
                                  ))}
                                </p>
                              )}
                            </span>
                            <input
                              type="date"
                              className="rounded-lg border border-ink/12 px-2 py-1 text-xs"
                              value={item.dueDate || ""}
                              onChange={(event) => updateOpen((current) => ({ ...current, items: current.items.map((entry) => (entry.id === item.id ? { ...entry, dueDate: event.target.value } : entry)) }))}
                            />
                            {/* Action buttons */}
                            {activity ? (
                              <button type="button" className={primaryBtn} onClick={() => setPlaying({ activity, documentId: item.resourceId, itemId: item.id, planDocumentId: open.document.id })}>▶ Start</button>
                            ) : null}
                            {item.resourceId && onOpenResource ? (
                              <button type="button" className={ghostBtn} onClick={() => onOpenResource(item.resourceId)}>
                                {item.kind === "read" ? "View material" : activity ? "View" : "Open"}
                              </button>
                            ) : null}
                            {item.kind === "read" && item.resourceId && onDownloadDocument ? (
                              <button
                                type="button"
                                className={ghostBtn}
                                title="Download reading material"
                                onClick={async () => {
                                  const doc = documents.find((d) => d.id === item.resourceId);
                                  if (doc) await onDownloadDocument(doc);
                                }}
                              >
                                ↓ Download
                              </button>
                            ) : null}
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
          <ConceptMasteryList concepts={graphConcepts} masteryByConceptId={masteryByConceptId} />
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
                onClick={() => {
                  const ownerUserId = typeof window !== "undefined" ? (window.localStorage.getItem("luna.ownerUserId") || "") : "";
                  triggerExtraction(open.plan.materialIds, selectedWorkspaceId, ownerUserId);
                }}
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
        {creating ? <CreateDialog draft={draft} setDraft={setDraft} busy={busy} plans={plans} onCancel={() => setCreating(false)} onCreate={async () => { await save(buildPlan(draft)); setCreating(false); setDraft({ name: "", examDate: "", colour: PLAN_COLOURS[0], note: "", parentPlanId: "" }); }} /> : null}
        {deletingPlan ? <DeletePlanDialog planRow={deletingPlan} documents={documents} busy={busy} onCancel={() => setDeletingPlan(null)} onConfirm={(opts) => deletePlan(deletingPlan, opts)} /> : null}

        {/* ── Material picker modal ── */}
        {materialPickerOpen && (
          <MaterialPickerModal
            documents={documents.filter((d) => !(d.tags || []).includes("study-plan") && !(d.tags || []).includes("activity-attempt"))}
            folders={folders}
            resources={resources}
            initialPicked={[...(open.plan.materialIds || []), ...open.plan.items.map((i) => i.resourceId).filter(Boolean)]}
            onClose={() => setMaterialPickerOpen(false)}
            onConfirm={(newPicked) => {
              const wasMaterial = new Set(open.plan.materialIds || []);
              const wasItem = new Set(open.plan.items.map((i) => i.resourceId).filter(Boolean));
              const wasIn = new Set([...wasMaterial, ...wasItem]);
              const added = newPicked.filter((id) => !wasIn.has(id));
              const removed = new Set([...wasIn].filter((id) => !newPicked.includes(id)));

              // New plan items for added resources (only if they parse as a resource)
              const addedItems = added.map((id) => {
                const row = resources.find((r) => r.document.id === id);
                if (!row) return null;
                if (open.plan.items.some((i) => i.resourceId === id)) return null;
                return newItem({ resourceId: id, title: row.resource.name, kind: row.resource.activity ? "activity" : "read" });
              }).filter(Boolean);

              // Remove plan items for removed docs (only non-done ones)
              const itemsAfterRemoval = open.plan.items.filter((i) => {
                if (!i.resourceId || !removed.has(i.resourceId)) return true;
                const sc = progress.scoreByResource.get(i.resourceId);
                return Boolean(i.doneAt) || sc !== undefined; // keep done
              });

              updateOpen((current) => ({
                ...current,
                materialIds: newPicked,
                items: [...itemsAfterRemoval, ...addedItems],
              }));

              if (added.length) {
                const ownerUserId = typeof window !== "undefined" ? (window.localStorage.getItem("luna.ownerUserId") || "") : "";
                triggerExtraction(added, selectedWorkspaceId, ownerUserId);
                setStatus("Materials updated — rebuilding concept map…");
              }
              setMaterialPickerOpen(false);
            }}
          />
        )}
        {playing ? (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-[var(--bg)]/95 p-4 sm:p-8">
            <ActivityPlayer
              activity={playing.activity}
              onSubmit={async (attempt) => {
                await saveAttempt(attempt, playing.documentId);
                const row = plans.find((r) => r.document.id === playing.planDocumentId);
                if (row) save({ ...row.plan, items: row.plan.items.map((entry) => entry.id === playing.itemId ? { ...entry, doneAt: new Date().toISOString() } : entry) }, playing.planDocumentId);
                setPlaying(null);
              }}
              onClose={() => setPlaying(null)}
            />
          </div>
        ) : null}
      </section>
    );
  }

  /* ---------------------------------------------------------------- all plans */
  return (
    <section className="tw-scope grid gap-4">
      <div className={`${card} flex flex-wrap items-center justify-between gap-3 p-5`}>
        <div>
          <p className={kicker}>Study plans · {subject.name}</p>
          <h3 className="m-0 mt-1 text-xl font-bold text-ink">{plans.length} plan{plans.length === 1 ? "" : "s"}</h3>
          <p className="m-0 mt-1 text-sm text-soft-ink">Deadlines, what has to be achieved, and the resources and activities that get {role === "student" ? "you" : "them"} there. Doing an activity on Luna ticks it off by itself.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-xl bg-[var(--surface-soft)] p-1">
            {[["plans", "Plans"], ["calendar", "Calendar"]].map(([value, label]) => <button key={value} type="button" onClick={() => setTab(value)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === value ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink"}`}>{label}</button>)}
          </div>
          <button type="button" className={ghostBtn} onClick={() => setGenerating(true)}>✦ Plan it for me</button>
          <button type="button" className={primaryBtn} onClick={() => { setDraft({ name: "", examDate: "", colour: PLAN_COLOURS[plans.length % PLAN_COLOURS.length], note: "", parentPlanId: "" }); setCreating(true); }}>＋ New plan</button>
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
                  <span className={`shrink-0 text-xs font-semibold ${alert.days < 0 ? "text-[var(--color-danger)]" : "text-soft-ink"}`}>{dueLabel(alert.dueDate)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {status ? <p className="m-0 px-1 text-xs text-[var(--accent-ink)]">{status}</p> : null}

      {tab === "calendar" ? <PlanCalendar rows={plans} attempts={attempts} onOpenPlan={setOpenId} onMoveItem={moveItem} /> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {roots.map(({ document, plan }) => {
            const children = plans.filter((row) => row.plan.parentPlanId === document.id);
            const progress = planProgress(children.length ? withSubPlans(plan, plans) : plan, attempts);
            return (
              <article key={document.id} className={`${card} flex flex-col gap-3 p-5`} style={{ borderTop: `4px solid ${plan.colour}` }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="m-0 truncate text-base font-bold text-ink">{plan.name}</h4>
                    <p className="m-0 mt-0.5 text-xs text-soft-ink">{progress.deadline ? `${progress.deadline.title} · ${dueLabel(progress.deadline.date)}` : "No deadline"}{children.length ? ` · ${children.length} sub-plan${children.length === 1 ? "" : "s"}` : ""}</p>
                  </div>
                  <Ring ratio={progress.ratio} colour={plan.colour} />
                </div>
                <div className="flex flex-wrap gap-1">
                  <span className={`${chip} bg-[var(--surface-soft)] text-soft-ink`}>{progress.done}/{progress.total} steps</span>
                  {progress.goals.length ? <span className={`${chip} bg-[var(--surface-soft)] text-soft-ink`}>{progress.goals.filter((goal) => goal.met).length}/{progress.goals.length} goals</span> : null}
                  {progress.late.length ? <span className={`${chip} bg-[rgba(255,59,48,0.1)] text-[var(--color-danger)]`}>{progress.late.length} late</span> : null}
                  {progress.average ? <span className={`${chip} bg-[#2f9e5b]/10 text-[#1d7a44]`}>avg {Math.round(progress.average * 100)}%</span> : null}
                </div>
                {children.length ? (
                  <ul className="m-0 grid list-none gap-0.5 p-0">
                    {children.map((row) => <li key={row.document.id} className="truncate text-[11px] text-soft-ink">↳ {row.plan.name}</li>)}
                  </ul>
                ) : null}
                {progress.next.length ? (
                  <div>
                    <p className={kicker}>Next up</p>
                    <ul className="m-0 mt-1 grid list-none gap-1 p-0">
                      {progress.next.slice(0, 3).map((item) => <li key={item.id} className="flex items-center justify-between gap-2 text-xs text-ink"><span className="truncate">{item.title}</span><span className="shrink-0 text-soft-ink">{dueLabel(item.dueDate)}</span></li>)}
                    </ul>
                  </div>
                ) : <p className="m-0 text-xs text-soft-ink">Everything done. 🎉</p>}
                <div className="mt-auto grid gap-1.5">
                  {plan.items.some((item) => item.generate && !item.resourceId) ? (
                    <button type="button" className={ghostBtn} disabled={building === document.id} onClick={() => build({ document, plan })}>
                      {building === document.id ? "Building…" : `✦ Build ${plan.items.filter((item) => item.generate && !item.resourceId).length} resources`}
                    </button>
                  ) : null}
                  <div className="flex items-center gap-1.5">
                    <button type="button" className={`${primaryBtn} flex-1`} onClick={() => setOpenId(document.id)}>Open plan</button>
                    {onRemoveDocument ? (
                      <button type="button" title="Delete plan…" className="grid size-9 shrink-0 place-items-center rounded-full border border-ink/15 bg-white text-xs text-soft-ink transition hover:border-[var(--color-danger)]/40 hover:text-[var(--color-danger)]" onClick={() => setDeletingPlan({ document, plan })}>🗑</button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
          {!plans.length ? <p className="m-0 text-sm text-soft-ink">No plans yet — create one, or let Luna build one from your material.</p> : null}
        </div>
      )}

      {creating ? <CreateDialog draft={draft} setDraft={setDraft} busy={busy} plans={plans} onCancel={() => setCreating(false)} onCreate={async () => { await save(buildPlan(draft)); setCreating(false); setDraft({ name: "", examDate: "", colour: PLAN_COLOURS[0], note: "", parentPlanId: "" }); }} /> : null}
      {deletingPlan ? <DeletePlanDialog planRow={deletingPlan} documents={documents} busy={busy} onCancel={() => setDeletingPlan(null)} onConfirm={(opts) => deletePlan(deletingPlan, opts)} /> : null}

      {generating ? (
        <GeneratePlanDialog
          documents={documents}
          folders={folders}
          resources={resources}
          attempts={attempts}
          conceptMap={graphConcepts}
          onCancel={() => setGenerating(false)}
          onDone={(message) => { setGenerating(false); setStatus(message); }}
          onSavePlan={(plan) => save(plan)}
          onBuild={async (plan, savedDocumentId) => {
            // The plan is worth nothing until its material exists, so it is built immediately —
            // into its own folders, with the material it studies linked rather than copied.
            setStatus("Setting up the plan's folders…");
            const planFolders = await ensurePlanFolders(plan.name, { folders, subjectId: selectedSubjectId, onCreateFolder });
            await linkMaterial(plan.materialIds || [], planFolders.materialId, { documents, onUpdateDocumentMeta });
            if (savedDocumentId && planFolders.planId) await onUpdateDocumentMeta?.(savedDocumentId, { folderIds: [planFolders.planId], tags: [PLAN_TAG] });
            const result = await executePlan({
              plan,
              documents,
              workspaceId: selectedWorkspaceId,
              subjectId: selectedSubjectId,
              folderIds: planFolders.generatedId ? [planFolders.generatedId] : [],
              onSaveGeneratedQuizDocument,
              onProgress: ({ index, total, title }) => setStatus(`Building ${index + 1} of ${total}: ${title}…`)
            });
            if (savedDocumentId) await save(result.plan, savedDocumentId);
            return result;
          }}
        />
      ) : null}
    </section>
  );
}

function DeletePlanDialog({ planRow, documents, busy, onCancel, onConfirm }) {
  const plan = planRow.plan;
  const generatedCount = (plan.items || []).filter((item) => item.generate && item.resourceId).length;
  const resourceIds = new Set((plan.items || []).map((item) => item.resourceId).filter(Boolean));
  const metricsCount = documents.filter((doc) => {
    if (!(doc.tags || []).includes("activity-attempt")) return false;
    try { return resourceIds.has(JSON.parse(doc.content || "{}").activityDocumentId); }
    catch { return false; }
  }).length;

  const [delMaterials, setDelMaterials] = useState(false);
  const [delMetrics, setDelMetrics] = useState(false);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-[0_24px_64px_rgba(0,0,0,0.25)]" onClick={(e) => e.stopPropagation()}>
        <h4 className="m-0 text-lg font-bold text-ink">Delete &ldquo;{plan.name}&rdquo;?</h4>
        <p className="m-0 mt-1 text-sm text-soft-ink">The plan document will be permanently removed. Choose what else to delete:</p>

        <div className="mt-4 grid gap-3">
          <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${delMaterials ? "border-[var(--color-danger)]/40 bg-[rgba(255,59,48,0.04)]" : "border-ink/10 hover:border-ink/20"}`}>
            <input type="checkbox" className="mt-0.5 accent-[var(--color-danger)]" checked={delMaterials} onChange={(e) => setDelMaterials(e.target.checked)} disabled={!generatedCount} />
            <div>
              <p className="m-0 text-sm font-semibold text-ink">Also delete generated materials</p>
              <p className="m-0 mt-0.5 text-xs text-soft-ink">
                {generatedCount
                  ? `${generatedCount} auto-built resource${generatedCount === 1 ? "" : "s"} will be removed from the workspace.`
                  : "No auto-generated materials found for this plan."}
              </p>
            </div>
          </label>

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
            onClick={() => onConfirm({ materials: delMaterials, metrics: delMetrics })}
          >
            {busy ? "Deleting…" : "Delete plan"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateDialog({ draft, setDraft, busy, plans, onCancel, onCreate }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-[0_24px_64px_rgba(0,0,0,0.25)]" onClick={(event) => event.stopPropagation()}>
        <h4 className="m-0 text-lg font-bold text-ink">{draft.parentPlanId ? "New sub-plan" : "New study plan"}</h4>
        <p className="m-0 mt-1 text-xs text-soft-ink">A name and a first deadline. Goals, resources and further deadlines are added inside.</p>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-xs font-semibold text-soft-ink">Name<input autoFocus className={field} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Maths final · June" /></label>
          <label className="grid gap-1 text-xs font-semibold text-soft-ink">First deadline<input type="date" className={field} value={draft.examDate} onChange={(event) => setDraft({ ...draft, examDate: event.target.value })} /></label>
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
