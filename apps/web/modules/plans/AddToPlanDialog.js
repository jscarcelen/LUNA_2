"use client";

import { useMemo, useState } from "react";
import { ITEM_KINDS, PLAN_COLOURS, PLAN_TAG, buildPlan, newItem, parsePlan } from "./plan";
import { useT } from "../../lib/i18n/LocaleProvider.js";

const input = "w-full rounded-xl border border-ink/12 bg-white px-3 py-2 text-sm text-ink";
const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-[var(--surface-soft)]";
const primaryBtn = "inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#0077ed] disabled:opacity-50";

/**
 * Schedules a resource: which plan it belongs to, when it is due and what kind of work it is.
 * Choosing "A new plan" creates the plan on the spot, so a resource can always be planned without
 * leaving the library.
 */
export function AddToPlanDialog({ documents = [], resourceId, resourceName, isActivity = false, onCancel, onDone, onSaveGeneratedQuizDocument, onUpdateGeneratedDocument }) {
  const t = useT();
  const plans = useMemo(() => documents.map((document) => ({ document, plan: parsePlan(document) })).filter((row) => row.plan), [documents]);
  const [planId, setPlanId] = useState(plans[0]?.document.id || "__new");
  const [planName, setPlanName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [kind, setKind] = useState(isActivity ? "activity" : "read");
  const [goalId, setGoalId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const chosen = plans.find((row) => row.document.id === planId) || null;

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const item = newItem({ resourceId, title: resourceName, kind, dueDate, goalId });
      if (planId === "__new") {
        const plan = buildPlan({ name: planName.trim() || t("plans.add.defaultName", { name: resourceName }), examDate: dueDate, colour: PLAN_COLOURS[plans.length % PLAN_COLOURS.length], items: [item] });
        const content = JSON.stringify(plan, null, 2);
        await onSaveGeneratedQuizDocument?.({ folderIds: [], tags: [PLAN_TAG], file: { name: `${plan.name}.plan.json`, content, preview: t("plans.add.oneStep"), sizeBytes: content.length } });
        onDone?.(t("plans.add.scheduledNew", { name: resourceName, plan: plan.name }));
        return;
      }
      if (!chosen) throw new Error(t("plans.add.choosePlan"));
      const next = { ...chosen.plan, items: [...(chosen.plan.items || []), item], updatedAt: new Date().toISOString() };
      const content = JSON.stringify(next, null, 2);
      await onUpdateGeneratedDocument?.(chosen.document.id, { file: { name: chosen.document.name, content, preview: t("plans.add.manySteps", { count: next.items.length }), sizeBytes: content.length } });
      onDone?.(dueDate ? t("plans.add.addedDue", { name: resourceName, plan: next.name, date: new Date(`${dueDate}T00:00:00`).toLocaleDateString(t.locale === "es" ? "es-ES" : undefined) }) : t("plans.add.added", { name: resourceName, plan: next.name }));
    } catch (problem) {
      setError(String(problem.message || problem));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tw-scope fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-[0_24px_64px_rgba(0,0,0,0.25)]" onClick={(event) => event.stopPropagation()}>
        <h4 className="m-0 text-lg font-bold text-ink">{t("plans.add.title")}</h4>
        <p className="m-0 mt-1 text-xs text-soft-ink">{t("plans.add.intro", { name: resourceName })}</p>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-xs font-semibold text-soft-ink">{t("plans.add.plan")}
            <select className={input} value={planId} onChange={(event) => setPlanId(event.target.value)}>
              {plans.map((row) => <option key={row.document.id} value={row.document.id}>{row.plan.name}</option>)}
              <option value="__new">{t("plans.add.newPlanOpt")}</option>
            </select>
          </label>
          {planId === "__new" ? <label className="grid gap-1 text-xs font-semibold text-soft-ink">{t("plans.add.newName")}<input className={input} value={planName} onChange={(event) => setPlanName(event.target.value)} placeholder={t("plans.add.placeholder")} /></label> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-semibold text-soft-ink">{t("plans.add.due")}<input type="date" className={input} value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
            <label className="grid gap-1 text-xs font-semibold text-soft-ink">{t("plans.add.kind")}
              <select className={input} value={kind} onChange={(event) => setKind(event.target.value)}>
                {ITEM_KINDS.map((entry) => <option key={entry.id} value={entry.id}>{t(`plans.itemKind.${entry.id}`)}</option>)}
              </select>
            </label>
          </div>
          {chosen && (chosen.plan.goals || []).length ? (
            <label className="grid gap-1 text-xs font-semibold text-soft-ink">{t("plans.add.goal")}
              <select className={input} value={goalId} onChange={(event) => setGoalId(event.target.value)}>
                <option value="">{t("plans.add.noGoal")}</option>
                {chosen.plan.goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
              </select>
            </label>
          ) : null}
        </div>
        {error ? <p className="m-0 mt-2 text-xs text-[var(--color-danger)]">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={ghostBtn} onClick={onCancel}>{t("common.cancel")}</button>
          <button type="button" className={primaryBtn} disabled={busy} onClick={submit}>{busy ? t("plans.add.adding") : t("plans.add.submit")}</button>
        </div>
      </div>
    </div>
  );
}
