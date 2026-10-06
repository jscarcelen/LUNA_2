"use client";

import { useMemo, useState } from "react";
import { PlanProgress } from "./PlanProgress";
import { dueLabel } from "./plan";
import { capConceptTree } from "./conceptTree";
import { MASTER_STEP_ID, findMasterDocument, masterIsCurrent, needsMasterDocument, planBuildSteps, uploadedMaterialIds } from "./master";
import { doneItemIds } from "./revise";
import { PLAN_UPDATE_SUGGESTIONS, applyDeadlineChanges, applyPlanUpdate, buildPlanUpdatePayload, currentPace, editableDeadline, groupChanges, isImposedDeadline, restorePlanVersion, stepsToBuild, updateWindow } from "./updatePlan";
import { bySkill, summarise } from "../performance/metrics";

const input = "w-full rounded-xl border border-ink/12 bg-white px-3 py-2 text-sm text-ink";
const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-[var(--surface-soft)] disabled:opacity-50";
const primaryBtn = "inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#0077ed] disabled:opacity-50";
const kicker = "m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink";

const THINKING = [
  { id: "read", title: "Reading your plan and your results", detail: "What is done stays exactly as it is; the rest is what can change." },
  { id: "plan", title: "Changing the plan", detail: "Applying your request to the steps still to do, inside the time that is left and the agents you allowed." },
  { id: "check", title: "Checking the changes", detail: "Finished work, built material and deadlines set by someone else are put back if anything touched them." }
];

const PACES = [30, 60, 90, 120, 180, 240, 300, 360, 480];
const dateText = (date) => (date ? new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "no date");

const GROUPS = [
  ["added", "New steps", "bg-[rgba(52,199,89,0.15)] text-[#1f7a3a]"],
  ["removed", "Removed", "bg-[rgba(255,59,48,0.12)] text-[var(--color-danger)]"],
  ["moved", "Moved", "bg-[rgba(255,149,0,0.15)] text-[#b25e00]"],
  ["edited", "Changed", "bg-[rgba(0,113,227,0.12)] text-[var(--accent-ink)]"]
];

/**
 * "Update this plan…": say what to change in your own words and Luna proposes it — what is done stays,
 * deadlines someone else set stay, only the agents of the plan's scope are used — and shows the added,
 * removed and moved steps with their dates before anything is saved. After applying it offers to build the
 * material for the new steps. The last five versions are kept, with Restore.
 */
export function UpdatePlanDialog({ row, documents = [], attempts = [], workspaceId = "", conceptMap = null, onApply, onBuild, onCancel, onDone }) {
  const plan = row.plan;
  const today = new Date().toISOString().slice(0, 10);
  const doneIds = useMemo(() => doneItemIds(plan, attempts), [plan, attempts]);
  const editable = useMemo(() => editableDeadline(plan, today), [plan, today]);
  const imposed = (plan.deadlines || []).filter(isImposedDeadline);

  const [instruction, setInstruction] = useState("");
  const [minutes, setMinutes] = useState(() => currentPace(plan, today));
  const [deadline, setDeadline] = useState(editable?.date || "");
  const [phase, setPhase] = useState("form"); // form | thinking | preview | applying | build | building
  const [currentId, setCurrentId] = useState("read");
  const [sub, setSub] = useState(null);
  const [proposal, setProposal] = useState(null);
  const [applied, setApplied] = useState(null); // the plan as saved
  const [error, setError] = useState("");
  const [history, setHistory] = useState(false);

  const pace = currentPace(plan, today);
  const paceOptions = PACES.includes(pace) ? PACES : [...PACES, pace].sort((a, b) => a - b);
  const deadlineChanged = Boolean(editable && deadline && deadline !== editable.date);
  const paceChanged = minutes !== pace;
  const versions = Array.isArray(plan.history) ? plan.history : [];

  async function loadConceptMap() {
    if (Array.isArray(conceptMap)) return conceptMap;
    if (!workspaceId || !(plan.materialIds || []).length) return [];
    try {
      const data = await fetch(`/api/concepts?workspaceId=${workspaceId}&documentIds=${encodeURIComponent((plan.materialIds || []).join(","))}`).then((response) => response.json());
      const graph = capConceptTree(Array.isArray(data.concepts) ? data.concepts : [], Array.isArray(data.prerequisites) ? data.prerequisites : []);
      return graph.concepts.map((concept) => ({ name: concept.name, topic: concept.topic || "" })).filter((concept) => concept.name);
    } catch { return []; }
  }

  async function propose() {
    setError("");
    setPhase("thinking");
    setCurrentId("read");
    try {
      const names = await loadConceptMap();
      const performance = (() => {
        if (!attempts.length) return null;
        const stats = summarise(attempts);
        const skills = bySkill(attempts);
        return { activities: stats.done, average: stats.score, weakConcepts: skills.filter((skill) => skill.asked >= 2 && skill.rate > 0.3).map((skill) => skill.skill) };
      })();
      // The learner's own fields first: a deadline nobody imposed can be moved here.
      const deadlineEdit = deadlineChanged ? [{ id: editable.id, date: deadline }] : [];
      const { deadlines } = applyDeadlineChanges(plan, deadlineEdit, { today });
      const window = updateWindow(plan, deadlines, today);
      const text = [instruction.trim(), paceChanged ? `I can now study about ${minutes / 60 >= 1 ? `${minutes / 60} hour${minutes === 60 ? "" : "s"}` : `${minutes} minutes`} a week.` : "", deadlineChanged ? `The deadline "${editable.title}" is now ${deadline}.` : ""].filter(Boolean).join(" ");
      const payload = buildPlanUpdatePayload({ plan, instruction: text, doneIds, minutesPerWeek: minutes, deadlines, conceptMap: names, performance, window, today });
      setCurrentId("plan");
      const response = await fetch("/api/plans/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok || !data?.update) throw new Error(data?.error || "Luna could not update the plan.");
      setCurrentId("check");
      const generatedIds = new Set(documents.filter((document) => document.sourceType === "generated").map((document) => document.id));
      setProposal(applyPlanUpdate(plan, data.update, { doneIds, today, generatedIds, deadlineEdit, conceptMap: names, minutesPerWeek: paceChanged ? minutes : 0, instruction: text }));
      setPhase("preview");
    } catch (problem) {
      setError(String(problem?.message || problem));
      setPhase("form");
    }
  }

  async function apply() {
    if (!proposal) return;
    setPhase("applying");
    setError("");
    try {
      await onApply(proposal.plan);
      setApplied(proposal.plan);
      if (stepsToBuild(proposal.plan, proposal.changes).length && onBuild) setPhase("build");
      else finish(`Plan updated: ${proposal.summary}`);
    } catch (problem) {
      setError(String(problem?.message || problem));
      setPhase("preview");
    }
  }

  const toBuild = proposal ? stepsToBuild(proposal.plan, proposal.changes) : [];
  const uploadedCount = uploadedMaterialIds(applied || plan, documents).length;
  const withMaster = needsMasterDocument(applied || plan, documents) && (!findMasterDocument(applied || plan, documents) || !masterIsCurrent(applied || plan, documents));
  const buildSteps = planBuildSteps({ documentCount: (applied || plan).materialIds?.length || 0, uploadedCount, buildNow: true, withMaster }).filter((step) => step.id === MASTER_STEP_ID || step.id === "build");

  async function build() {
    setPhase("building");
    setCurrentId(withMaster ? MASTER_STEP_ID : "build");
    try {
      const result = await onBuild(applied, (event) => {
        if (event.phase === "master") {
          setCurrentId(MASTER_STEP_ID);
          setSub(event.of ? { done: event.done || 0, total: event.of, label: event.detail } : null);
        } else {
          setCurrentId("build");
          setSub({ done: event.index, total: event.total, label: event.title });
        }
      });
      finish(`Plan updated: ${proposal.summary} ${result?.created || 0} resource${result?.created === 1 ? "" : "s"} built${result?.failures?.length ? `, ${result.failures.length} still to build` : ""}.`);
    } catch (problem) {
      setError(String(problem?.message || problem));
      setPhase("build");
    }
  }

  function finish(message) {
    onDone?.(message);
    onCancel?.();
  }

  async function restore(id) {
    setError("");
    try {
      await onApply(restorePlanVersion(plan, id));
      finish("Plan restored to an earlier version. What you finished since is kept.");
    } catch (problem) {
      setError(String(problem?.message || problem));
    }
  }

  const busy = phase === "thinking" || phase === "applying" || phase === "building";
  const counts = proposal?.counts;
  const grouped = proposal ? groupChanges(proposal.changes) : null;

  return (
    <div className="tw-scope fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/30 p-4" onClick={busy ? undefined : onCancel}>
      <div role="dialog" aria-modal="true" aria-label={`Update ${plan.name}`} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-[0_24px_64px_rgba(0,0,0,0.25)]" onClick={(event) => event.stopPropagation()}>
        {phase === "thinking" ? <PlanProgress steps={THINKING} currentId={currentId} headline="Updating your plan" /> : null}
        {phase === "applying" ? <p className="m-0 py-8 text-center text-sm font-semibold text-ink">Saving the changes…</p> : null}
        {phase === "building" ? <PlanProgress steps={buildSteps} currentId={currentId} sub={sub} headline="Building the new steps" /> : null}

        {phase === "form" ? (
          <>
            <p className={kicker}>Study plan</p>
            <h4 className="m-0 mt-1 text-lg font-bold text-ink">Update “{plan.name}”</h4>
            <p className="m-0 mt-1 text-xs text-soft-ink">Say what to change. Everything you have already done stays; you see the changes before anything is saved.</p>
            <textarea className={`${input} mt-3`} rows={3} autoFocus value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="e.g. lighter workload in the last two weeks · add a mock exam two days before the deadline" />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PLAN_UPDATE_SUGGESTIONS.map((chip) => <button key={chip} type="button" className="rounded-full border border-ink/15 px-2.5 py-1 text-[11px] font-semibold text-soft-ink transition hover:bg-[var(--surface-soft)]" onClick={() => setInstruction((current) => (current.trim() ? `${current.trim()}. ${chip}` : chip))}>{chip}</button>)}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-semibold text-soft-ink">Time per week
                <select className={input} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))}>
                  {paceOptions.map((value) => <option key={value} value={value}>{value < 60 ? `${value} minutes` : `${value / 60} hour${value === 60 ? "" : "s"}`} a week{value === pace ? " (now)" : ""}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-soft-ink">{editable ? `New date for “${editable.title}”` : "Deadline"}
                <input type="date" className={input} min={today} value={deadline} disabled={!editable} onChange={(event) => setDeadline(event.target.value)} />
              </label>
            </div>
            {imposed.length ? <p className="m-0 mt-2 rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-[11px] text-soft-ink">{imposed.map((entry) => `“${entry.title}” (${dateText(entry.date)})`).join(", ")} {imposed.length === 1 ? "was" : "were"} set by someone else and cannot be changed here.</p> : null}
            {Array.isArray(plan.agentScope) ? <p className="m-0 mt-2 text-[11px] text-soft-ink">New steps only use the agents of this plan: {plan.agentScope.length ? plan.agentScope.map((agent) => agent.label).join(" · ") : "none (studying the material only)"}.</p> : null}
            {versions.length ? (
              <div className="mt-3">
                <button type="button" className="text-xs font-semibold text-[var(--accent-ink)] hover:underline" onClick={() => setHistory((value) => !value)}>{history ? "Hide" : "Show"} earlier versions ({versions.length})</button>
                {history ? (
                  <ul className="m-0 mt-1.5 grid list-none gap-1.5 p-0">
                    {versions.map((version) => (
                      <li key={version.id} className="flex items-center gap-2 rounded-xl border border-ink/10 px-3 py-2">
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{version.instruction ? `Before: “${version.instruction}”` : "Earlier version"}</span><span className="block text-[11px] text-soft-ink">{new Date(version.at).toLocaleString()} · {version.items.length} steps{version.summary ? ` · ${version.summary}` : ""}</span></span>
                        <button type="button" className="shrink-0 rounded-full border border-ink/15 px-3 py-1 text-xs font-semibold text-ink hover:bg-[var(--surface-soft)]" onClick={() => restore(version.id)}>Restore</button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            {error ? <p className="m-0 mt-2 text-xs text-[var(--color-danger)]">{error}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className={ghostBtn} onClick={onCancel}>Cancel</button>
              <button type="button" className={primaryBtn} disabled={!instruction.trim() && !paceChanged && !deadlineChanged} onClick={propose}>Update the plan</button>
            </div>
          </>
        ) : null}

        {phase === "preview" && proposal ? (
          <>
            <p className={kicker}>Proposed changes</p>
            <h4 className="m-0 mt-1 text-lg font-bold text-ink">{proposal.changed ? "Here is what would change" : "Nothing needs to change"}</h4>
            <p className="m-0 mt-1 text-sm text-ink">{proposal.summary}</p>
            <div className="mt-3 grid grid-cols-5 gap-1.5 text-center">
              {[["Done · kept", counts.done], ["Moved", counts.moved], ["New", counts.added], ["Removed", counts.removed], ["Changed", counts.edited]].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-[var(--surface-soft)] px-1 py-2"><p className="m-0 text-lg font-bold text-ink">{value}</p><p className="m-0 text-[9px] font-semibold uppercase tracking-wide text-soft-ink">{label}</p></div>
              ))}
            </div>
            {proposal.deadlineMoves.length ? <p className="m-0 mt-2 rounded-xl bg-[rgba(255,149,0,0.08)] px-3 py-2 text-xs text-ink">{proposal.deadlineMoves.map((move) => `“${move.title}”: ${dateText(move.from)} → ${dateText(move.to)}`).join(" · ")}</p> : null}
            {proposal.coverage && proposal.coverage.untested > proposal.coverage.untestedBefore ? <p className="m-0 mt-2 rounded-xl bg-[rgba(178,94,0,0.08)] px-3 py-2 text-xs text-[var(--color-warn)]">{proposal.coverage.untested} of {proposal.coverage.total} concepts would no longer be tested by an activity. You can add them back from the plan page.</p> : null}
            <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto pr-1">
              {GROUPS.map(([key, label, chipClass]) => (grouped[key].length ? (
                <div key={key}>
                  <p className={kicker}>{label} ({grouped[key].length})</p>
                  <ul className="m-0 mt-1 grid list-none gap-1 p-0">
                    {grouped[key].map((entry, index) => (
                      <li key={`${key}-${index}`} className="flex items-center gap-2 rounded-lg border border-ink/8 px-2.5 py-1.5 text-sm text-ink">
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${chipClass}`}>{label.split(" ")[0]}</span>
                        <span className={`min-w-0 flex-1 truncate ${key === "removed" ? "line-through text-soft-ink" : ""}`}>{(entry.item || entry.before).title}</span>
                        <span className="shrink-0 text-xs text-soft-ink">{key === "moved" ? `${dateText(entry.before.dueDate)} → ${dateText(entry.item.dueDate)}` : key === "removed" ? dateText(entry.before.dueDate) : `${dateText(entry.item.dueDate)}${entry.item.generate ? " · Luna builds it" : ""}`}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null))}
              {grouped.kept ? <p className="m-0 text-[11px] text-soft-ink">{grouped.kept} other step{grouped.kept === 1 ? "" : "s"} stay as they are.</p> : null}
            </div>
            {error ? <p className="m-0 mt-2 text-xs text-[var(--color-danger)]">{error}</p> : null}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" className={ghostBtn} onClick={onCancel}>Cancel</button>
              <button type="button" className={ghostBtn} onClick={() => setPhase("form")}>Change my request</button>
              <button type="button" className={primaryBtn} disabled={!proposal.changed} onClick={apply}>Apply changes</button>
            </div>
          </>
        ) : null}

        {phase === "build" ? (
          <>
            <p className={kicker}>Plan updated</p>
            <h4 className="m-0 mt-1 text-lg font-bold text-ink">Build the material for the new steps?</h4>
            <p className="m-0 mt-1 text-sm text-soft-ink">{toBuild.length} new step{toBuild.length === 1 ? "" : "s"} {toBuild.length === 1 ? "is" : "are"} waiting for {toBuild.length === 1 ? "its" : "their"} quiz, flashcards or summary{withMaster ? ", and your documents will be merged into a master document first" : ""}. It can take a minute or two.</p>
            <ul className="m-0 mt-2 grid max-h-40 list-none gap-1 overflow-y-auto p-0">
              {toBuild.map((item) => <li key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-ink/8 px-2.5 py-1.5 text-sm text-ink"><span className="truncate">{item.title}</span><span className="shrink-0 text-xs text-soft-ink">{dueLabel(item.dueDate)}</span></li>)}
            </ul>
            {error ? <p className="m-0 mt-2 text-xs text-[var(--color-danger)]">{error}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className={ghostBtn} onClick={() => finish(`Plan updated: ${proposal.summary} The new steps can be built from the plan page.`)}>Later</button>
              <button type="button" className={primaryBtn} onClick={build}>Build now</button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
