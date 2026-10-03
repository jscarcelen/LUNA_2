"use client";

import { useEffect, useMemo, useState } from "react";
import { buildConceptForest, capConceptTree } from "../../plans/conceptTree";

const TOP = 5;
const colour = (mastery) => (mastery === undefined ? "#9ca3af" : mastery < 0.4 ? "#ff3b30" : mastery < 0.7 ? "#ff9500" : "#34c759");

/**
 * Topic by topic, as the study plan sees it: the plan's own concepts (the same tree, with the same
 * indentation, as the Student model in the plan), with the five assessed topics that are furthest
 * behind, the five that are strongest, and how many have not been assessed at all. One plan at a
 * time — the most recently active one to begin with, others one tap away.
 */
export function PlanTopics({ plans = [], planId = "", onPlanChange, workspaceId = "" }) {
  const plan = plans.find((entry) => entry.id === planId) || plans[0] || null;
  const [data, setData] = useState({ status: "idle", concepts: [], prerequisites: [], mastery: {} });
  const [showUnassessed, setShowUnassessed] = useState(false);
  const materialKey = (plan?.materialIds || []).join(",");

  useEffect(() => {
    if (!plan || !workspaceId) { setData({ status: "idle", concepts: [], prerequisites: [], mastery: {} }); return undefined; }
    let cancelled = false;
    setData((current) => ({ ...current, status: "loading" }));
    const learnerId = (typeof window !== "undefined" && window.localStorage.getItem("luna.learnerId")) || "anonymous";
    Promise.all([
      fetch(`/api/concepts?workspaceId=${workspaceId}&documentIds=${encodeURIComponent(materialKey)}`).then((response) => response.json()).catch(() => ({})),
      fetch(`/api/student/mastery?learnerId=${encodeURIComponent(learnerId)}&workspaceId=${workspaceId}`).then((response) => response.json()).catch(() => ({}))
    ]).then(([conceptData, masteryData]) => {
      if (cancelled) return;
      const graph = capConceptTree(Array.isArray(conceptData?.concepts) ? conceptData.concepts : [], Array.isArray(conceptData?.prerequisites) ? conceptData.prerequisites : []);
      const mastery = {};
      for (const state of masteryData?.states || []) if (state.concept_id) mastery[state.concept_id] = state.mastery ?? 0;
      setData({ status: "done", concepts: graph.concepts, prerequisites: graph.prerequisites, mastery });
    });
    return () => { cancelled = true; };
  }, [plan?.id, workspaceId, materialKey]);

  const view = useMemo(() => {
    const { roots, childrenById } = buildConceptForest(data.concepts, data.prerequisites);
    const depth = new Map();
    const walk = (concept, level) => { depth.set(concept.id, level); (childrenById.get(concept.id) || []).forEach((kid) => walk(kid, level + 1)); };
    roots.forEach((root) => walk(root, 0));
    const order = [...depth.keys()];
    const rank = new Map(order.map((id, index) => [id, index]));
    const byId = new Map(data.concepts.map((concept) => [concept.id, concept]));
    const assessed = data.concepts.filter((concept) => data.mastery[concept.id] !== undefined);
    const notAssessed = data.concepts.filter((concept) => data.mastery[concept.id] === undefined).sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
    const ascending = [...assessed].sort((a, b) => data.mastery[a.id] - data.mastery[b.id]);
    const lowest = ascending.slice(0, TOP);
    const lowIds = new Set(lowest.map((concept) => concept.id));
    const highest = [...assessed].sort((a, b) => data.mastery[b.id] - data.mastery[a.id]).filter((concept) => !lowIds.has(concept.id)).slice(0, TOP);
    // In the plan's order, so the indentation reads as the tree does.
    const inTreeOrder = (list) => [...list].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
    return { depth, byId, assessed, notAssessed, lowest: inTreeOrder(lowest), highest: inTreeOrder(highest), total: data.concepts.length };
  }, [data]);

  if (!plans.length) return <p className="m-0 rounded-xl bg-[var(--surface-soft)] p-4 text-sm text-soft-ink">Make a study plan — its topics are what this tracks.</p>;

  const row = (concept) => {
    const value = data.mastery[concept.id];
    const percent = value === undefined ? null : Math.round(value * 100);
    const depth = view.depth.get(concept.id) || 0;
    return (
      <div key={concept.id} className="grid gap-0.5" style={{ paddingLeft: depth * 14 }}>
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-sm font-medium text-ink" title={concept.name}>{depth > 0 ? <span className="mr-1 text-[9px] text-soft-ink">└</span> : null}{concept.name}</span>
          <span className="shrink-0 text-xs font-semibold" style={{ color: colour(value) }}>{percent === null ? "—" : `${percent}%`}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-ink/8"><div className="h-full rounded-full" style={{ width: `${percent ?? 0}%`, background: colour(value) }} /></div>
      </div>
    );
  };
  const group = (title, list, tone) => (list.length ? (
    <div className="grid gap-2">
      <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: tone }}>{title}</p>
      {list.map(row)}
    </div>
  ) : null);
  const few = view.assessed.length <= TOP;

  return (
    <div className="grid gap-4">
      {plans.length > 1 ? (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Study plan">
          {plans.map((entry) => (
            <button key={entry.id} type="button" onClick={() => onPlanChange?.(entry.id)} className={`inline-flex max-w-[16rem] items-center gap-1.5 truncate rounded-full border px-3 py-1 text-xs font-semibold transition ${entry.id === plan.id ? "border-transparent bg-ink text-white" : "border-ink/15 text-soft-ink hover:bg-[var(--surface-soft)]"}`}>
              <span className="size-2 shrink-0 rounded-full" style={{ background: entry.colour }} />
              <span className="truncate">{entry.name}</span>
            </button>
          ))}
        </div>
      ) : plan ? <p className="m-0 text-xs font-semibold text-soft-ink">◷ {plan.name}</p> : null}

      {data.status === "loading" ? <p className="m-0 text-sm text-soft-ink">Reading the plan's topics…</p> : null}
      {data.status === "done" && !view.total ? <p className="m-0 rounded-xl bg-[var(--surface-soft)] p-4 text-sm text-soft-ink">This plan has no topics yet. Open it in Study plans so Luna can map its material.</p> : null}
      {view.total ? (
        <>
          <p className="m-0 text-sm text-ink">
            <strong>{view.total}</strong> topic{view.total === 1 ? "" : "s"} in this plan · <strong>{view.assessed.length}</strong> assessed · <strong className={view.notAssessed.length ? "text-[var(--color-warn)]" : ""}>{view.notAssessed.length}</strong> not assessed yet
          </p>
          {few ? group("Assessed topics", [...view.lowest], "#6e6e73") : (
            <div className="grid gap-4 lg:grid-cols-2">
              {group(`${TOP} furthest behind`, view.lowest, "#d7003a")}
              {group(`${TOP} strongest`, view.highest, "#1f7a3a")}
            </div>
          )}
          {!view.assessed.length ? <p className="m-0 rounded-xl bg-[var(--surface-soft)] p-4 text-sm text-soft-ink">Nothing assessed yet — do an activity from this plan and its topics start to fill in.</p> : null}
          {view.notAssessed.length ? (
            <div className="grid gap-2">
              <button type="button" className="justify-self-start text-xs font-semibold text-[var(--accent-ink)] hover:underline" aria-expanded={showUnassessed} onClick={() => setShowUnassessed((value) => !value)}>
                {showUnassessed ? "Hide" : "Show"} the {view.notAssessed.length} topic{view.notAssessed.length === 1 ? "" : "s"} not assessed yet
              </button>
              {showUnassessed ? <div className="grid gap-2 rounded-xl bg-[var(--surface-soft)] p-3">{view.notAssessed.map(row)}</div> : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
