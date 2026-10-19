"use client";

import { useMemo, useState } from "react";
import { PlanProgress } from "./PlanProgress";
import { PLAN_COLOURS, buildPlan, newDeadline, newGoal, newItem } from "./plan";
import { examDeadline } from "./deadlines.js";
import { ExamDatePicker } from "./ExamDates";
import { DEFAULT_PLAN_AGENT_IDS, generateKeys, generateLabel, scopeFromIds } from "./agents";
import { DEFAULT_MAX_MINUTES_PER_DAY } from "./dailyCap.js";
import { capConceptTree } from "./conceptTree";
import { CONSOLIDATED_KEY, MASTER_STEP_ID, documentChars, needsConsolidatedView, planBuildSteps } from "./master";
import { resourceConcepts } from "../resources/concepts";
import { bySkill, summarise } from "../performance/metrics";
import { useT } from "../../lib/i18n/LocaleProvider.js";

const input = "w-full rounded-xl border border-ink/12 bg-white px-3 py-2 text-sm text-ink";
const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-[var(--surface-soft)]";
const primaryBtn = "inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#0077ed] disabled:opacity-50";
const chip = "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold";

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
  const t = useT();
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
              <span className="ml-auto shrink-0 text-[10px] text-soft-ink">{doc.sourceType === "generated" ? t("plans.gen.generated") : t("plans.gen.uploaded")}</span>
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
export function GeneratePlanDialog({ documents = [], agents = [], folders = [], resources = [], attempts = [], workspaceId = "", examDates = [], initialExam = null, initialMaterialIds = [], onCancel, onDone, onSavePlan, onBuild }) {
  const t = useT();
  // "Use a teacher's exam date": the plan is ready by that date, which is locked and follows the teacher's changes.
  const [exam, setExam] = useState(initialExam);
  const [name, setName] = useState(initialExam?.title || "");
  const [deadline, setDeadline] = useState(initialExam?.date || "");
  const [minutes, setMinutes] = useState(120);
  // The most to study in one day; the plan is checked against it in code, so a day never goes over.
  const [maxPerDay, setMaxPerDay] = useState(DEFAULT_MAX_MINUTES_PER_DAY);
  // Optional, in the learner's own words: what they prefer and what each exam covers; the shape of what gets built.
  const [instructions, setInstructions] = useState("");
  const [formatNotes, setFormatNotes] = useState("");
  // Example exams, worksheets or flashcards whose format the built material copies (the agents' "style" documents).
  const [formatDocIds, setFormatDocIds] = useState([]);
  const [agentIds, setAgentIds] = useState(DEFAULT_PLAN_AGENT_IDS);
  const [picked, setPicked] = useState(initialMaterialIds);
  const [busy, setBusy] = useState(false);
  const [buildNow, setBuildNow] = useState(true);
  const [error, setError] = useState("");
  const [currentId, setCurrentId] = useState("");
  const [sub, setSub] = useState(null);

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

  const toggleAgent = (id) => setAgentIds((prev) => prev.includes(id) ? prev.filter((k) => k !== id) : [...prev, id]);
  const agentScope = useMemo(() => scopeFromIds(agentIds, agents), [agentIds, agents]);
  const toggleDoc = (id) => setPicked((prev) => prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]);

  /**
   * The concepts of the picked material, which the plan must cover exhaustively. Documents that have
   * none yet are read first, so the planner never works without the map.
   */
  async function loadConceptMap() {
    if (!workspaceId) return [];
    const url = `/api/concepts?workspaceId=${workspaceId}&documentIds=${encodeURIComponent(picked.join(","))}`;
    const fetchMap = async () => fetch(url).then((r) => r.json()).catch(() => ({ concepts: [], prerequisites: [] }));
    let data = await fetchMap();
    const have = new Set((data.concepts || []).map((concept) => concept.source_document_id));
    const missing = picked.filter((id) => !have.has(id) && documents.find((doc) => doc.id === id)?.sourceType !== "generated");
    if (missing.length) {
      setCurrentId("concepts");
      const ownerUserId = typeof window !== "undefined" ? (window.localStorage.getItem("luna.ownerUserId") || "") : "";
      await Promise.allSettled(missing.map((documentId) => fetch("/api/concepts/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId, workspaceId, ownerUserId }) }).then((r) => r.json())));
      data = await fetchMap();
    }
    const graph = capConceptTree(Array.isArray(data.concepts) ? data.concepts : [], Array.isArray(data.prerequisites) ? data.prerequisites : []);
    return graph.concepts.map((concept) => ({ name: concept.name, topic: concept.topic || "" })).filter((concept) => concept.name);
  }

  const documentCount = picked.length;
  // With two or more uploaded documents, the first thing built is their master document.
  const uploadedCount = picked.filter((id) => documents.find((doc) => doc.id === id)?.sourceType !== "generated").length;
  const uploadedChars = picked.reduce((sum, id) => { const doc = documents.find((item) => item.id === id); return doc && doc.sourceType !== "generated" ? sum + documentChars(doc) : sum; }, 0);
  // Many documents or a lot of material: the plan's first step is a consolidated view of all of it (its master document).
  const withMaster = uploadedCount >= 2 || needsConsolidatedView({ uploadedCount, totalChars: uploadedChars });
  const steps = planBuildSteps({ documentCount, uploadedCount, buildNow, withMaster }, t);

  async function generate() {
    setBusy(true);
    setError("");
    try {
      setCurrentId("concepts");
      const conceptMap = await loadConceptMap();
      setCurrentId("schedule");
      const response = await fetch("/api/plans/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deadline,
          minutesPerWeek: minutes,
          maxMinutesPerDay: maxPerDay,
          instructions: instructions.trim(),
          formatNotes: formatNotes.trim(),
          // The scope of agents the plan may use to build resources.
          agents: agentScope,
          kinds: generateKeys(agentScope),
          performance,
          // Concept map: canonical concept list so the AI only uses these names as tags
          // and covers all of them across the plan.
          conceptMap,
          // The title of the consolidated first step, in the learner's language (used when the plan needs one).
          consolidatedTitle: t("plans.gen.consolidatedTitle"),
          materials: picked.map((id) => {
            const document = documents.find((item) => item.id === id);
            const resource = resourceByDocumentId.get(id);
            return {
              id,
              name: resource?.name || document?.name || "",
              kind: resource ? "generated resource" : "material",
              chars: resource ? 0 : documentChars(document),
              concepts: resource ? resourceConcepts(resource).map((concept) => concept.name) : []
            };
          })
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t("plans.gen.buildFailed"));
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
          note: item.generate === CONSOLIDATED_KEY ? t("plans.gen.consolidatedNote") : item.generate ? `Luna will generate ${generateLabel(item.generate, agentScope)} from "${known?.name || "the material"}".` : (known ? `Material: ${known.name}` : ""),
          generate: item.generate || "",
          sourceDocumentId: item.sourceId || "",
          concepts: item.concepts || []
        };
      });
      const plan = buildPlan({
        name: name.trim() || proposal.name || "Study plan",
        deadlines: [exam ? examDeadline(exam) : newDeadline("Exam", deadline, "exam")],
        colour: PLAN_COLOURS[Math.floor(Math.random() * PLAN_COLOURS.length)],
        note: proposal.note || "",
        goals,
        items,
        materialIds: picked,
        agentScope,
        instructions,
        formatNotes,
        formatDocumentIds: formatDocIds,
        minutesPerDay: maxPerDay
      });
      setCurrentId("save");
      const saved = await onSavePlan?.(plan);
      const cov = data.coverage;
      const coverageNote = cov
        ? ` ${cov.tested === cov.total ? t("plans.gen.allTested", { total: cov.total }) : t("plans.gen.someTested", { tested: cov.tested, total: cov.total })}${cov.repairs?.length ? ` ${t("plans.gen.covAdded", { count: cov.repairs.length })}` : ""}`
        : "";
      const capTime = maxPerDay / 60 >= 1 ? t.plural("plans.upd.hours", maxPerDay / 60) : t.plural("plans.upd.minutes", maxPerDay);
      const capNote = data.dailyCap?.moved ? ` ${t.plural("plans.gen.capMoved", data.dailyCap.moved, { time: capTime })}` : "";
      const planned = `${t.plural("plans.gen.planned", items.length, { date: new Date(`${deadline}T00:00:00`).toLocaleDateString(t.locale === "es" ? "es-ES" : undefined) })}${performance ? `, ${t("plans.gen.fitted")}` : ""}.${coverageNote}${capNote}`;
      if (buildNow && onBuild && items.some((item) => item.generate)) {
        setCurrentId(withMaster ? MASTER_STEP_ID : "build");
        const result = await onBuild(plan, saved?.id || saved?.documentId || "", (event) => {
          if (event.phase === "master") {
            setCurrentId(MASTER_STEP_ID);
            setSub(event.of ? { done: event.done || 0, total: event.of, label: event.detail } : null);
          } else {
            setCurrentId("build");
            setSub({ done: event.index, total: event.total, label: event.title });
          }
        });
        onDone?.(`${planned} ${t.plural("plans.gen.generatedFiled", result?.created || 0)}${result?.failures?.length ? `, ${t("plans.upd.stillToBuild", { count: result.failures.length })}` : ""}.`, { built: true });
        return;
      }
      onDone?.(planned, { built: false, plan, savedId: saved?.id || saved?.documentId || "" });
    } catch (problem) {
      setError(String(problem.message || problem));
    } finally {
      setBusy(false);
      setCurrentId("");
      setSub(null);
    }
  }

  // Selected documents info for the tray
  const pickedDocs = picked.map((id) => {
    const doc = documents.find((d) => d.id === id);
    const res = resourceByDocumentId.get(id);
    return { id, label: res?.name || doc?.name || id };
  });

  return (
    <div className="tw-scope fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/30 p-4" onClick={busy ? undefined : onCancel}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-[0_24px_64px_rgba(0,0,0,0.25)]" onClick={(event) => event.stopPropagation()}>
        {busy ? <PlanProgress steps={steps} currentId={currentId || steps[0].id} sub={sub} /> : null}
        <div className={busy ? "hidden" : ""}>
        <h4 className="m-0 text-lg font-bold text-ink">{t("plans.gen.title")}</h4>
        <p className="m-0 mt-1 text-xs text-soft-ink">{t("plans.gen.intro")}</p>
        <div className="mt-4 grid gap-3">
          <ExamDatePicker examDates={examDates} value={exam?.id || ""} onChange={(entry) => { setExam(entry); if (entry) { setDeadline(entry.date); setName((current) => current || entry.title); } }} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-semibold text-soft-ink">{t("plans.gen.name")}<input className={input} value={name} onChange={(event) => setName(event.target.value)} placeholder={t("plans.add.placeholder")} /></label>
            <label className="grid gap-1 text-xs font-semibold text-soft-ink">{t("plans.gen.readyBy")}<input type="date" className={`${input} disabled:bg-[var(--surface-soft)]`} disabled={Boolean(exam)} title={exam ? `🔒 ${t("plans.card.setBy", { by: exam.senderName || t("plans.origin.yourTeacher") })}` : undefined} value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-semibold text-soft-ink">{t("plans.upd.perWeek")}
              <select className={input} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))}>
                {[60, 120, 180, 240, 360, 600, 900].map((value) => <option key={value} value={value}>{t("plans.upd.weekOpt", { time: t.plural("plans.upd.hours", value / 60) })}</option>)}
              </select>
            </label>
          </div>
          {/* Material picker — collapsible folder tree */}
          <div>
            <p className="m-0 text-xs font-semibold text-soft-ink">{t("plans.gen.material")}</p>
            <div className="mt-1.5 max-h-52 overflow-y-auto rounded-xl border border-ink/10 p-2 grid gap-0.5">
              {!material.length
                ? <p className="m-0 text-xs text-soft-ink">{t("plans.gen.nothing")}</p>
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
                        <span className="ml-auto shrink-0 text-[10px] text-soft-ink">{doc.sourceType === "generated" ? t("plans.gen.generated") : t("plans.gen.uploaded")}</span>
                      </label>
                    ))}
                  </>)}
            </div>

            {/* Selected items tray */}
            {pickedDocs.length > 0 && (
              <div className="mt-2 rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/5 px-3 py-2">
                <p className="m-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">{t("plans.gen.selected", { count: pickedDocs.length })}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {pickedDocs.map(({ id, label }) => (
                    <span key={id} className="inline-flex items-center gap-1 rounded-full border border-[var(--accent)]/25 bg-white px-2 py-0.5 text-[11px] font-medium text-ink">
                      <span className="max-w-[160px] truncate">{label}</span>
                      <button type="button" onClick={() => toggleDoc(id)} className="ml-0.5 shrink-0 text-soft-ink transition hover:text-[var(--accent)]" aria-label={t("plans.gen.remove", { label })}>×</button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <details className="rounded-xl border border-ink/10 px-3 py-2">
            <summary className="cursor-pointer text-sm font-semibold text-ink">{t("plans.gen.more")}</summary>
            <div className="mt-3 grid gap-3">
              <label className="grid gap-1 text-xs font-semibold text-soft-ink">{t("plans.upd.mostDay")}
              <select className={input} value={maxPerDay} onChange={(event) => setMaxPerDay(Number(event.target.value))}>
                {[60, 90, 120, 180, 240, 300].map((value) => <option key={value} value={value}>{t("plans.upd.dayOpt", { time: value < 120 ? t.plural("plans.upd.minutes", value) : t.plural("plans.upd.hours", value / 60) })}</option>)}
              </select>
            </label>
          <label className="grid gap-1 text-xs font-semibold text-soft-ink">{t("plans.gen.instr")} <span className="font-normal text-soft-ink">{t("common.optional")}</span>
            <textarea className={input} rows={3} value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder={t("plans.gen.instrPh")} />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-soft-ink">{t("plans.gen.format")} <span className="font-normal text-soft-ink">{t("common.optional")}</span>
            <textarea className={input} rows={2} value={formatNotes} onChange={(event) => setFormatNotes(event.target.value)} placeholder={t("plans.gen.formatPh")} />
          </label>
          {material.length ? (
            <details className="rounded-xl border border-ink/10 px-2.5 py-1.5">
              <summary className="cursor-pointer text-[11px] font-semibold text-soft-ink">{t("plans.gen.copyFormat")}{formatDocIds.length ? ` (${t("plans.gen.chosen", { count: formatDocIds.length })})` : ""}</summary>
              <p className="m-0 mt-1 text-[11px] text-soft-ink">{t("plans.gen.copyHint")}</p>
              <div className="mt-1 grid max-h-28 gap-0.5 overflow-y-auto">
                {material.map((doc) => (
                  <label key={doc.id} className="flex items-center gap-2 rounded-lg px-1 py-0.5 text-xs text-ink hover:bg-ink/5">
                    <input type="checkbox" className="shrink-0" checked={formatDocIds.includes(doc.id)} onChange={() => setFormatDocIds((prev) => (prev.includes(doc.id) ? prev.filter((id) => id !== doc.id) : [...prev, doc.id]))} />
                    <span className="truncate">{resourceByDocumentId.get(doc.id)?.name || doc.name}</span>
                  </label>
                ))}
              </div>
            </details>
          ) : null}
          <div>
            <p className="m-0 text-xs font-semibold text-soft-ink">{t("plans.gen.agents")}</p>
            <p className="m-0 mt-0.5 text-[11px] text-soft-ink">{t("plans.gen.agentsHint")}</p>
            <div className="mt-1.5 grid max-h-44 gap-1 overflow-y-auto rounded-xl border border-ink/10 p-1.5">
              {agents.map((agent) => (
                <label key={agent.id} className={`flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 transition ${agentIds.includes(agent.id) ? "bg-[var(--accent)]/6" : "hover:bg-ink/5"}`}>
                  <input type="checkbox" className="mt-0.5 shrink-0" checked={agentIds.includes(agent.id)} onChange={() => toggleAgent(agent.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                      <span className="truncate">{agent.label}</span>
                      {agent.custom ? <span className={`${chip} bg-[var(--surface-soft)] text-soft-ink`}>{agent.bought ? t("plans.gen.bought") : t("plans.gen.mine")}</span> : null}
                    </span>
                    {agent.purpose ? <span className="block truncate text-[11px] text-soft-ink">{agent.purpose}</span> : null}
                  </span>
                </label>
              ))}
            </div>
            {!agentIds.length ? <p className="m-0 mt-1 text-[11px] text-soft-ink">{t("plans.gen.noAgent")}</p> : null}
          </div>
            </div>
          </details>

          <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={buildNow} onChange={(event) => setBuildNow(event.target.checked)} />{t("plans.gen.buildNow")}</label>
          {performance ? <p className="m-0 rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-[11px] text-soft-ink">{t("plans.gen.results", { count: performance.activities, pct: Math.round(performance.average * 100) })}{performance.weakConcepts.length ? `, ${t("plans.gen.weakest", { list: performance.weakConcepts.slice(0, 3).join(", ") })}` : ""}.</p> : null}
        </div>
        {error ? <p className="m-0 mt-2 text-xs text-[var(--color-danger)]">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={ghostBtn} disabled={busy} onClick={onCancel}>{t("common.cancel")}</button>
          <button type="button" className={primaryBtn} disabled={busy || !deadline || !picked.length} onClick={generate}>{busy ? t("plans.card.building") : t("plans.gen.submit")}</button>
        </div>
        </div>
      </div>
    </div>
  );
}
