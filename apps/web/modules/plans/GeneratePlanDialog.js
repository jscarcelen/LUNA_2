"use client";

import { useMemo, useState } from "react";
import { PLAN_COLOURS, buildPlan, newDeadline, newGoal, newItem } from "./plan";
import { resourceConcepts } from "../resources/concepts";
import { bySkill, summarise } from "../performance/metrics";

const input = "w-full rounded-xl border border-ink/12 bg-white px-3 py-2 text-sm text-ink";
const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-[var(--surface-soft)]";
const primaryBtn = "inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#0077ed] disabled:opacity-50";
const chip = "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold";

const KINDS = [
  { id: "quiz", label: "Quizzes" },
  { id: "flashcards", label: "Flashcards" },
  { id: "summary", label: "Summaries" },
  { id: "worksheet", label: "Worksheets" },
  { id: "exam", label: "Practice exams" }
];

/**
 * Build a nested folder tree from a flat folders array.
 * Returns root-level nodes, each with a `children` array.
 */
function buildFolderTree(folders = []) {
  const byId = {};
  for (const f of folders) byId[f.id] = { ...f, children: [] };
  const roots = [];
  for (const f of folders) {
    if (f.parentFolderId && byId[f.parentFolderId]) {
      byId[f.parentFolderId].children.push(byId[f.id]);
    } else {
      roots.push(byId[f.id]);
    }
  }
  return roots;
}

/**
 * Recursive folder node with checkboxes and collapsible children.
 */
function FolderNode({ node, depth = 0, documents, picked, onToggle, resourceByDocumentId }) {
  const [open, setOpen] = useState(true);
  const folderDocs = documents.filter((d) => (d.folderIds || [d.folderId]).includes(node.id));
  const childIds = [node.id, ...node.children.map((c) => c.id)]; // rough check for badge
  const totalDocs = folderDocs.length + node.children.reduce((n, c) => n + documents.filter((d) => (d.folderIds || [d.folderId]).includes(c.id)).length, 0);

  if (totalDocs === 0 && node.children.length === 0) return null;

  return (
    <div style={{ paddingLeft: depth * 12 }}>
      {/* Folder header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded-lg px-1 py-0.5 text-left text-xs font-semibold text-soft-ink transition hover:bg-ink/5"
      >
        <span style={{ fontSize: 10 }}>{open ? "▾" : "▸"}</span>
        <span className="truncate">{node.name}</span>
        {totalDocs > 0 && <span className="ml-auto shrink-0 text-[10px] text-soft-ink/60">{totalDocs}</span>}
      </button>

      {open && (
        <div>
          {/* Direct children documents */}
          {folderDocs.map((doc) => (
            <label key={doc.id} className="flex items-center gap-2 rounded-lg px-1 py-0.5 text-sm text-ink transition hover:bg-ink/5" style={{ paddingLeft: 20 }}>
              <input
                type="checkbox"
                checked={picked.includes(doc.id)}
                onChange={() => onToggle(doc.id)}
                className="shrink-0"
              />
              <span className="truncate">{resourceByDocumentId.get(doc.id)?.name || doc.name}</span>
              <span className="ml-auto shrink-0 text-[10px] text-soft-ink">{doc.sourceType === "generated" ? "generated" : "uploaded"}</span>
            </label>
          ))}
          {/* Sub-folders */}
          {node.children.map((child) => (
            <FolderNode
              key={child.id}
              node={child}
              depth={depth + 1}
              documents={documents}
              picked={picked}
              onToggle={onToggle}
              resourceByDocumentId={resourceByDocumentId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * "Plan it for me": pick the material, the deadline and the kinds of practice, and Luna lays the
 * work out between now and the date — more time on what the learner keeps getting wrong, the last
 * stretch left for review. The result is an ordinary plan, so every step can be moved afterwards.
 */
export function GeneratePlanDialog({ documents = [], folders = [], resources = [], attempts = [], conceptMap = [], onCancel, onDone, onSavePlan, onBuild }) {
  const [name, setName] = useState("");
  const [deadline, setDeadline] = useState("");
  const [minutes, setMinutes] = useState(120);
  const [kinds, setKinds] = useState(["quiz", "flashcards"]);
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const [buildNow, setBuildNow] = useState(true);
  const [error, setError] = useState("");

  const material = useMemo(() => documents.filter((document) => document.sourceType !== "generated" || (document.tags || []).includes("resource")), [documents]);
  const resourceByDocumentId = useMemo(() => new Map(resources.map((row) => [row.document.id, row.resource])), [resources]);

  // Build folder tree for collapsible view
  const folderTree = useMemo(() => buildFolderTree(folders), [folders]);

  // Documents not in any folder (unorganised)
  const unorganisedDocs = useMemo(() => {
    if (!folders.length) return material;
    const allFolderIds = new Set(folders.map((f) => f.id));
    return material.filter((doc) => {
      const docFolders = doc.folderIds || (doc.folderId ? [doc.folderId] : []);
      return !docFolders.some((fid) => allFolderIds.has(fid));
    });
  }, [material, folders]);

  /** What the learner is good and bad at, so the plan is fitted to them rather than generic. */
  const performance = useMemo(() => {
    if (!attempts.length) return null;
    const stats = summarise(attempts);
    const skills = bySkill(attempts);
    return {
      activities: stats.done,
      average: stats.score,
      minutesPerQuestion: stats.perQuestion ? Math.max(1, Math.round(stats.perQuestion / 60)) : 0,
      weakConcepts: skills.filter((skill) => skill.asked >= 2 && skill.rate > 0.3).map((skill) => skill.skill),
      strongConcepts: skills.filter((skill) => skill.asked >= 2 && skill.rate <= 0.1).map((skill) => skill.skill)
    };
  }, [attempts]);

  const toggleKind = (id) => setKinds((prev) => prev.includes(id) ? prev.filter((k) => k !== id) : [...prev, id]);
  const toggleDoc = (id) => setPicked((prev) => prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]);

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/plans/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deadline,
          minutesPerWeek: minutes,
          kinds,
          performance,
          // Concept map: canonical concept list so the AI only uses these names as tags
          // and covers all of them across the plan.
          conceptMap: conceptMap.map((c) => ({ name: c.name, topic: c.topic || "" })),
          materials: picked.map((id) => {
            const document = documents.find((item) => item.id === id);
            const resource = resourceByDocumentId.get(id);
            return {
              id,
              name: resource?.name || document?.name || "",
              kind: resource ? "generated resource" : "material",
              concepts: resource ? resourceConcepts(resource).map((concept) => concept.name) : []
            };
          })
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not build the plan");
      const proposal = data.plan || {};
      const goals = (proposal.goals || []).map((goal) => ({ ...newGoal(goal.title, goal.targetScore || 0.8), concepts: goal.concepts || [] }));
      const items = (proposal.items || []).map((item) => {
        const goal = goals.find((entry) => entry.title.toLowerCase() === String(item.goal || "").toLowerCase());
        const known = documents.find((document) => document.id === item.sourceId);
        return {
          ...newItem({
            resourceId: known && resourceByDocumentId.has(item.sourceId) ? item.sourceId : "",
            title: item.title,
            kind: item.kind,
            dueDate: item.dueDate,
            goalId: goal?.id || "",
            minutes: item.minutes || 30
          }),
          note: item.generate ? `Luna will generate a ${item.generate} from "${known?.name || "the material"}".` : (known ? `Material: ${known.name}` : ""),
          generate: item.generate || "",
          sourceDocumentId: item.sourceId || "",
          concepts: item.concepts || []
        };
      });
      const plan = buildPlan({
        name: name.trim() || proposal.name || "Study plan",
        deadlines: [newDeadline("Exam", deadline, "exam")],
        colour: PLAN_COLOURS[Math.floor(Math.random() * PLAN_COLOURS.length)],
        note: proposal.note || "",
        goals,
        items,
        materialIds: picked
      });
      const saved = await onSavePlan?.(plan);
      const planned = `Planned ${items.length} step${items.length === 1 ? "" : "s"} up to ${new Date(`${deadline}T00:00:00`).toLocaleDateString()}${performance ? ", fitted to how you have been scoring" : ""}.`;
      if (buildNow && onBuild && items.some((item) => item.generate)) {
        const result = await onBuild(plan, saved?.id || saved?.documentId || "");
        onDone?.(`${planned} ${result?.created || 0} resource${result?.created === 1 ? "" : "s"} generated and filed${result?.failures?.length ? `, ${result.failures.length} still to build` : ""}.`);
        return;
      }
      onDone?.(planned);
    } catch (problem) {
      setError(String(problem.message || problem));
    } finally {
      setBusy(false);
    }
  }

  // Selected documents info for the tray
  const pickedDocs = picked.map((id) => {
    const doc = documents.find((d) => d.id === id);
    const res = resourceByDocumentId.get(id);
    return { id, label: res?.name || doc?.name || id };
  });

  return (
    <div className="tw-scope fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/30 p-4" onClick={onCancel}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-[0_24px_64px_rgba(0,0,0,0.25)]" onClick={(event) => event.stopPropagation()}>
        <h4 className="m-0 text-lg font-bold text-ink">Plan it for me</h4>
        <p className="m-0 mt-1 text-xs text-soft-ink">Choose what to study and when it has to be ready. Luna spreads the work, generates the practice it needs, and gives more time to what you keep getting wrong.</p>
        <div className="mt-4 grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-semibold text-soft-ink">Plan name<input className={input} value={name} onChange={(event) => setName(event.target.value)} placeholder="Maths final · June" /></label>
            <label className="grid gap-1 text-xs font-semibold text-soft-ink">Ready by<input type="date" className={input} value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label>
          </div>
          <label className="grid gap-1 text-xs font-semibold text-soft-ink">Time per week
            <select className={input} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))}>
              {[60, 120, 180, 240, 360].map((value) => <option key={value} value={value}>{value / 60} hour{value > 60 ? "s" : ""} a week</option>)}
            </select>
          </label>
          <div>
            <p className="m-0 text-xs font-semibold text-soft-ink">Practice to generate</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {KINDS.map((entry) => <button key={entry.id} type="button" onClick={() => toggleKind(entry.id)} className={`${chip} ${kinds.includes(entry.id) ? "bg-[var(--accent)] text-white" : "border border-ink/15 text-soft-ink"}`}>{entry.label}</button>)}
            </div>
          </div>

          {/* Material picker — collapsible folder tree */}
          <div>
            <p className="m-0 text-xs font-semibold text-soft-ink">Material to study</p>
            <div className="mt-1.5 max-h-52 overflow-y-auto rounded-xl border border-ink/10 p-2 grid gap-0.5">
              {!material.length
                ? <p className="m-0 text-xs text-soft-ink">Nothing in this folder yet.</p>
                : (<>
                    {/* Folder tree */}
                    {folderTree.map((node) => (
                      <FolderNode
                        key={node.id}
                        node={node}
                        documents={material}
                        picked={picked}
                        onToggle={toggleDoc}
                        resourceByDocumentId={resourceByDocumentId}
                      />
                    ))}
                    {/* Documents with no folder */}
                    {unorganisedDocs.map((doc) => (
                      <label key={doc.id} className="flex items-center gap-2 rounded-lg px-1 py-0.5 text-sm text-ink transition hover:bg-ink/5">
                        <input type="checkbox" checked={picked.includes(doc.id)} onChange={() => toggleDoc(doc.id)} className="shrink-0" />
                        <span className="truncate">{resourceByDocumentId.get(doc.id)?.name || doc.name}</span>
                        <span className="ml-auto shrink-0 text-[10px] text-soft-ink">{doc.sourceType === "generated" ? "generated" : "uploaded"}</span>
                      </label>
                    ))}
                  </>)}
            </div>

            {/* Selected items tray */}
            {pickedDocs.length > 0 && (
              <div className="mt-2 rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/5 px-3 py-2">
                <p className="m-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">{pickedDocs.length} selected</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {pickedDocs.map(({ id, label }) => (
                    <span key={id} className="inline-flex items-center gap-1 rounded-full border border-[var(--accent)]/25 bg-white px-2 py-0.5 text-[11px] font-medium text-ink">
                      <span className="max-w-[160px] truncate">{label}</span>
                      <button type="button" onClick={() => toggleDoc(id)} className="ml-0.5 shrink-0 text-soft-ink transition hover:text-[var(--accent)]" aria-label={`Remove ${label}`}>×</button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={buildNow} onChange={(event) => setBuildNow(event.target.checked)} />Generate the quizzes and summaries now, and file them in my workspace</label>
          {performance ? <p className="m-0 rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-[11px] text-soft-ink">Luna will use your results: {performance.activities} activities, {Math.round(performance.average * 100)}% average{performance.weakConcepts.length ? `, weakest on ${performance.weakConcepts.slice(0, 3).join(", ")}` : ""}.</p> : null}
        </div>
        {error ? <p className="m-0 mt-2 text-xs text-[var(--color-danger)]">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={ghostBtn} onClick={onCancel}>Cancel</button>
          <button type="button" className={primaryBtn} disabled={busy || !deadline || !picked.length} onClick={generate}>{busy ? "Planning…" : "Build my plan"}</button>
        </div>
      </div>
    </div>
  );
}
