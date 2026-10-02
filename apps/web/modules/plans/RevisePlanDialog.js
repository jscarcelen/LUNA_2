"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { dueLabel } from "./plan";
import { applyRevision, buildRevisePayload, doneItemIds, fallbackRevision, reviseWindow } from "./revise";
import { resourceConcepts } from "../resources/concepts";
import { bySkill, summarise } from "../performance/metrics";

const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-[var(--surface-soft)]";
const primaryBtn = "inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#0077ed] disabled:opacity-50";
const kicker = "m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink";

/**
 * "Redo the plan": shows what changes when material is added — the finished work stays exactly as
 * it is, everything still to do is spread over the time that is left — before anything is saved.
 */
export function RevisePlanDialog({ row, documents = [], resources = [], attempts = [], conceptMap = [], newUploadedIds = [], ready = true, onApply, onCancel }) {
  const [phase, setPhase] = useState("waiting");
  const [proposal, setProposal] = useState(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [buildNow, setBuildNow] = useState(true);
  const started = useRef(false);

  const doneIds = useMemo(() => doneItemIds(row.plan, attempts), [row.plan, attempts]);
  const span = useMemo(() => reviseWindow(row.plan), [row.plan]);
  const newUploaded = useMemo(() => newUploadedIds.map((id) => documents.find((document) => document.id === id)).filter(Boolean), [newUploadedIds, documents]);
  const generatedIds = useMemo(() => new Set(resources.map((entry) => entry.document.id)), [resources]);

  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    setPhase("planning");
    const performance = (() => {
      if (!attempts.length) return null;
      const stats = summarise(attempts);
      const skills = bySkill(attempts);
      return { activities: stats.done, average: stats.score, weakConcepts: skills.filter((skill) => skill.asked >= 2 && skill.rate > 0.3).map((skill) => skill.skill) };
    })();
    const resourceNames = new Map(resources.map((entry) => [entry.document.id, entry.resource.name]));
    const conceptsByResource = new Map(resources.map((entry) => [entry.document.id, resourceConcepts(entry.resource).map((concept) => concept.name)]));
    const payload = buildRevisePayload({ plan: row.plan, doneIds, newUploaded, resourceNames, conceptsFor: (id) => conceptsByResource.get(id) || [], conceptMap, performance, window: span });

    (async () => {
      let revision = null;
      try {
        const response = await fetch("/api/plans/revise", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const data = await response.json();
        if (!response.ok || !Array.isArray(data?.revision?.items)) throw new Error(data?.error || "No schedule returned");
        revision = data.revision;
      } catch {
        revision = fallbackRevision({ plan: row.plan, doneIds, newUploaded, window: span });
        setUsedFallback(true);
      }
      setProposal(applyRevision(row.plan, revision, { doneIds, window: span, generatedIds }));
      setPhase("ready");
    })();
  }, [ready]);

  const summary = proposal?.summary;
  const willBuild = Boolean(proposal?.added.some((item) => item.generate));

  return (
    <div className="tw-scope fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/30 p-4" onClick={onCancel}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-[0_24px_64px_rgba(0,0,0,0.25)]" onClick={(event) => event.stopPropagation()}>
        <p className={kicker}>Study plan</p>
        <h4 className="m-0 mt-1 text-lg font-bold text-ink">Re-plan with the new material</h4>
        <p className="m-0 mt-1 text-xs text-soft-ink">Everything you have already done stays exactly as it is. What is still to do — including the new material — is spread over the {span.days} day{span.days === 1 ? "" : "s"} left until {new Date(`${span.horizon}T00:00:00`).toLocaleDateString()}.</p>

        {phase !== "ready" ? (
          <div className="mt-5 rounded-2xl bg-[var(--surface-soft)] px-4 py-8 text-center">
            <p className="m-0 text-sm font-semibold text-ink">{phase === "waiting" ? "Reading the new material…" : "Re-planning the remaining time…"}</p>
            <p className="m-0 mt-1 text-xs text-soft-ink">{phase === "waiting" ? "Its concepts are added to the map first, so the new steps can name them." : "Fitting the remaining steps and the new ones into the time that is left."}</p>
          </div>
        ) : (
          <div className="mt-4 grid gap-3">
            <div className="grid grid-cols-4 gap-2 text-center">
              {[["Done · kept", summary.kept], ["Rescheduled", summary.moved], ["New steps", summary.added], ["Replaced", summary.dropped]].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-[var(--surface-soft)] px-2 py-2.5">
                  <p className="m-0 text-xl font-bold text-ink">{value}</p>
                  <p className="m-0 text-[10px] font-semibold uppercase tracking-wide text-soft-ink">{label}</p>
                </div>
              ))}
            </div>
            {usedFallback ? <p className="m-0 rounded-xl bg-[rgba(178,94,0,0.08)] px-3 py-2 text-xs text-[var(--color-warn)]">The planner model was not available, so the steps were spread evenly over the time left. You can still move any step afterwards.</p> : null}
            {proposal.plan.note && proposal.plan.note !== row.plan.note ? <p className="m-0 text-xs text-soft-ink">{proposal.plan.note}</p> : null}

            {proposal.added.length ? (
              <div>
                <p className={kicker}>New steps</p>
                <ul className="m-0 mt-1.5 grid max-h-48 list-none gap-1 overflow-y-auto p-0">
                  {proposal.added.map((item) => (
                    <li key={item.id} className="flex items-center gap-2 rounded-lg border border-ink/8 px-2.5 py-1.5 text-sm text-ink">
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                      <span className="shrink-0 rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-[10px] font-semibold text-soft-ink">{item.resourceId ? "generated resource" : item.generate ? `new ${item.generate}` : "from uploaded material"}</span>
                      <span className="shrink-0 text-xs text-soft-ink">{dueLabel(item.dueDate)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {proposal.droppedItems.length ? (
              <div>
                <p className={kicker}>Replaced by the new schedule</p>
                <p className="m-0 mt-1 text-xs text-soft-ink">{proposal.droppedItems.map((item) => item.title).join(" · ")} — planned practice that was not built yet.</p>
              </div>
            ) : null}
            {willBuild ? <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={buildNow} onChange={(event) => setBuildNow(event.target.checked)} />Generate the new quizzes and summaries now, and file them in my workspace</label> : null}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={ghostBtn} onClick={onCancel}>Keep my current plan</button>
          <button type="button" className={primaryBtn} disabled={phase !== "ready"} onClick={() => onApply(proposal.plan, { buildNow: willBuild && buildNow })}>Apply new plan</button>
        </div>
      </div>
    </div>
  );
}
