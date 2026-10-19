"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { dueLabel } from "./plan";
import { generateLabel } from "./agents";
import { conceptNames } from "./coverage";
import { applyRevision, buildRevisePayload, doneItemIds, fallbackRevision, reviseWindow } from "./revise";
import { resourceConcepts } from "../resources/concepts";
import { bySkill, summarise } from "../performance/metrics";
import { useT } from "../../lib/i18n/LocaleProvider.js";

const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-[var(--surface-soft)]";
const primaryBtn = "inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#0077ed] disabled:opacity-50";
const kicker = "m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink";

/**
 * "Redo the plan": shows what changes when material is added — the finished work stays exactly as
 * it is, everything still to do is spread over the time that is left — before anything is saved.
 */
export function RevisePlanDialog({ row, documents = [], resources = [], attempts = [], conceptMap = [], newUploadedIds = [], ready = true, onApply, onCancel }) {
  const t = useT();
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
      setProposal(applyRevision(row.plan, revision, { doneIds, window: span, generatedIds, conceptNames: conceptNames(conceptMap) }));
      setPhase("ready");
    })();
  }, [ready]);

  const summary = proposal?.summary;
  const willBuild = Boolean(proposal?.added.some((item) => item.generate));

  return (
    <div className="tw-scope fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/30 p-4" onClick={onCancel}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-[0_24px_64px_rgba(0,0,0,0.25)]" onClick={(event) => event.stopPropagation()}>
        <p className={kicker}>{t("plans.rev.kicker")}</p>
        <h4 className="m-0 mt-1 text-lg font-bold text-ink">{t("plans.rev.title")}</h4>
        <p className="m-0 mt-1 text-xs text-soft-ink">{t.plural("plans.rev.intro", span.days, { date: new Date(`${span.horizon}T00:00:00`).toLocaleDateString(t.locale === "es" ? "es-ES" : undefined) })}</p>

        {phase !== "ready" ? (
          <div className="mt-5 rounded-2xl bg-[var(--surface-soft)] px-4 py-8 text-center">
            <p className="m-0 text-sm font-semibold text-ink">{phase === "waiting" ? t("plans.rev.reading") : t("plans.rev.replanning")}</p>
            <p className="m-0 mt-1 text-xs text-soft-ink">{phase === "waiting" ? t("plans.rev.readingHint") : t("plans.rev.replanningHint")}</p>
          </div>
        ) : (
          <div className="mt-4 grid gap-3">
            <div className="grid grid-cols-4 gap-2 text-center">
              {[["kept", summary.kept], ["moved", summary.moved], ["added", summary.added], ["dropped", summary.dropped]].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-[var(--surface-soft)] px-2 py-2.5">
                  <p className="m-0 text-xl font-bold text-ink">{value}</p>
                  <p className="m-0 text-[10px] font-semibold uppercase tracking-wide text-soft-ink">{t(`plans.rev.sum.${label}`)}</p>
                </div>
              ))}
            </div>
            {usedFallback ? <p className="m-0 rounded-xl bg-[rgba(178,94,0,0.08)] px-3 py-2 text-xs text-[var(--color-warn)]">{t("plans.rev.fallback")}</p> : null}
            {proposal.coverageRepairs?.length ? <p className="m-0 rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-xs text-soft-ink">{t.plural("plans.rev.coverage", proposal.coverageRepairs.length)}</p> : null}
            {proposal.plan.note && proposal.plan.note !== row.plan.note ? <p className="m-0 text-xs text-soft-ink">{proposal.plan.note}</p> : null}

            {proposal.added.length ? (
              <div>
                <p className={kicker}>{t("plans.rev.sum.added")}</p>
                <ul className="m-0 mt-1.5 grid max-h-48 list-none gap-1 overflow-y-auto p-0">
                  {proposal.added.map((item) => (
                    <li key={item.id} className="flex items-center gap-2 rounded-lg border border-ink/8 px-2.5 py-1.5 text-sm text-ink">
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                      <span className="shrink-0 rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-[10px] font-semibold text-soft-ink">{item.resourceId ? t("plans.rev.genResource") : item.generate ? t("plans.rev.newKind", { kind: generateLabel(item.generate, row.plan.agentScope, t) }) : t("plans.rev.fromUploaded")}</span>
                      <span className="shrink-0 text-xs text-soft-ink">{dueLabel(item.dueDate, t)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {proposal.droppedItems.length ? (
              <div>
                <p className={kicker}>{t("plans.rev.replacedKicker")}</p>
                <p className="m-0 mt-1 text-xs text-soft-ink">{proposal.droppedItems.map((item) => item.title).join(" · ")} — {t("plans.rev.notBuilt")}</p>
              </div>
            ) : null}
            {willBuild ? <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={buildNow} onChange={(event) => setBuildNow(event.target.checked)} />{t("plans.rev.buildNow")}</label> : null}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={ghostBtn} onClick={onCancel}>{t("plans.rev.keep")}</button>
          <button type="button" className={primaryBtn} disabled={phase !== "ready"} onClick={() => onApply(proposal.plan, { buildNow: willBuild && buildNow })}>{t("plans.rev.apply")}</button>
        </div>
      </div>
    </div>
  );
}
