"use client";

import { useMemo, useRef, useState } from "react";
import { PlanProgress } from "../plans/PlanProgress";
import { RunEstimateLine, useRunEstimate } from "../credits/RunEstimate";
import { chargeRun, readCredits } from "../credits/credits";
import { WorkspaceDocumentPicker } from "../ai-tools/tools/agent-builder/WorkspaceDocumentPicker";
import { isSharedDocument } from "../accounts/shared";
import { parseResource, resourceStats } from "./resource";
import { UpdateCompare } from "./UpdateCompare";
import { UpdateError, agentDocumentsOf, applyUpdate, buildUpdateConfig, chooseAgent, decideMode, describeResource, hasMaterial, kindOfResource, answersForResource, resolveAgent, resolveMaterial, suggestionsFor, updateResource } from "./update";
import { displayName } from "../ui/displayName";
import { useT } from "../../lib/i18n/LocaleProvider.js";

const fieldClass = "w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink placeholder:text-soft-ink/70 outline-none transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]";
const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-[var(--surface-soft)] disabled:opacity-50";
const primaryBtn = "inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#0077ed] disabled:cursor-not-allowed disabled:opacity-50";
const kicker = "m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink";

/** What is shown while it runs: the steps of an update, in the words of the person who asked. */
const STEP_IDS = ["understand", "read", "write", "check", "compare"];
const STEP_OF_EVENT = { understand: "understand", scope: "read", chunk: "read", retrieve: "read", generate: "write", validate: "check", compare: "compare" };

/** Tags a copy keeps: what it is, not who it was shared by or when it was due. */
const COPY_DROPS = ["due:", "favourite", "shared-by:", "assigned-by:", "shared-from:"];
const copyTags = (document) => (document?.tags || []).filter((tag) => !COPY_DROPS.some((prefix) => String(tag).startsWith(prefix)));

const sentence = (list, t) => (list.length > 1 ? `${list.slice(0, -1).join(", ")} ${t("courses.ud.and")} ${list[list.length - 1]}` : list[0] || "");

/**
 * "Update…": say what to change and Luna runs the same agent again with the same choices and material,
 * then shows what is different before anything is saved. Works on a saved resource (replace it, or save the
 * update next to it) and on a result that is not saved yet (the chat's cards: it is replaced in place).
 */
export function UpdateDialog({ document = null, resource, workspace = null, fallbackSubjectId = "", onClose, onSaveGeneratedQuizDocument, onUpdateGeneratedDocument, onReplaceUnsaved, onDone }) {
  const t = useT();
  const STEPS = useMemo(() => STEP_IDS.map((id) => ({ id, title: t(`courses.ud.step.${id}.title`), detail: t(`courses.ud.step.${id}.detail`) })), [t]);
  const documents = useMemo(() => (workspace?.subjects || []).flatMap((subject) => subject.documents || []), [workspace]);
  const agentDocuments = useMemo(() => agentDocumentsOf(documents), [documents]);
  const kind = kindOfResource(resource, document);
  const resolution = useMemo(() => resolveAgent({ resource, document, agentDocuments }), [resource, document, agentDocuments]);
  const stats = useMemo(() => (document ? resourceStats(document.id, resource?.activity?.id, documents) : null), [document, resource, documents]);
  const decision = useMemo(() => decideMode({ document, resource, documents, attempts: stats?.attempts }), [document, resource, documents, stats]);

  const [instruction, setInstruction] = useState("");
  const [differentMaterial, setDifferentMaterial] = useState(false);
  const [materialIds, setMaterialIds] = useState([]);
  const [keepFormat, setKeepFormat] = useState(true);
  const [useFallback, setUseFallback] = useState(false);
  const [phase, setPhase] = useState("form"); // form | running | result
  const [currentId, setCurrentId] = useState("understand");
  const [sub, setSub] = useState(null);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState(null);
  const [mode, setMode] = useState(decision.mode);
  const [saving, setSaving] = useState(false);
  const abortRef = useRef(null);

  const chosen = chooseAgent(resolution, useFallback);
  const material = useMemo(() => resolveMaterial({ resource, picked: differentMaterial ? materialIds : null, documents: documents.filter((entry) => entry.id) }), [resource, differentMaterial, materialIds, documents]);
  const ready = Boolean(chosen) && hasMaterial(chosen?.agent, material);
  const estimateConfig = useMemo(() => {
    if (!chosen || !hasMaterial(chosen.agent, material)) return null;
    return buildUpdateConfig({ resource, agent: chosen.agent, material, workspaceId: workspace?.id || "", subjectId: document?.subjectId || fallbackSubjectId, refinementPrompt: instruction.trim() || "Update the result.", answers: answersForResource(chosen.agent, resource) }).config;
  }, [chosen, material, resource, workspace?.id, document?.subjectId, fallbackSubjectId, instruction]);
  const { estimate, loading: estimating } = useRunEstimate(estimateConfig, phase === "form" && Boolean(estimateConfig));

  const effectiveMode = useFallback ? "copy" : mode;
  const canReplace = decision.canReplace && !useFallback;
  const existingNames = useMemo(() => documents.map((entry) => parseResource(entry)?.name).filter(Boolean), [documents]);

  function progress(event) {
    if (!event?.step) return;
    const id = STEP_OF_EVENT[event.step];
    if (!id) return;
    setCurrentId(id);
    if (event.status === "progress" && event.total) setSub({ done: event.done || 0, total: event.total, label: event.label || "" });
    else if (event.status === "start" || event.status === "end") setSub(null);
  }

  async function run() {
    setError("");
    setPhase("running");
    setCurrentId("understand");
    setSub(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await updateResource({
        document,
        resource,
        instruction,
        material: differentMaterial ? { documentIds: materialIds } : null,
        keepFormat,
        workspace,
        useFallback,
        t,
        onProgress: progress,
        fetchImpl: (url, init) => fetch(url, { ...init, signal: controller.signal })
      });
      chargeRun({ agentName: result.agent.label, usage: result.usage, fallbackTokens: estimate?.totalTokens || 0, model: result.model });
      setOutcome(result);
      setMode(useFallback ? "copy" : decision.mode);
      setPhase("result");
    } catch (problem) {
      if (problem instanceof UpdateError && problem.code === "no-material") setDifferentMaterial(true);
      setError(problem?.name === "AbortError" ? t("courses.ud.cancelled") : String(problem?.message || problem));
      setPhase("form");
    } finally {
      abortRef.current = null;
    }
  }

  async function apply() {
    if (!outcome) return;
    setSaving(true);
    setError("");
    try {
      const final = applyUpdate({ previous: resource, next: outcome.resource, mode: effectiveMode, instruction, model: outcome.model, existingNames, originalDocumentId: document?.id || "" });
      if (!document) {
        onReplaceUnsaved?.(final);
        onDone?.(t("courses.ud.updated", { name: final.name }), { mode: "replace", documentId: "" });
        onClose?.();
        return;
      }
      const content = JSON.stringify(final, null, 2);
      const preview = `${final.meta?.questionCount || 0} questions`;
      if (effectiveMode === "replace") {
        await onUpdateGeneratedDocument?.(document.id, { file: { name: document.name, content, preview, sizeBytes: content.length } }, document.subjectId);
        onDone?.(t("courses.ud.updatedHistory", { name: final.name }), { mode: "replace", documentId: document.id });
      } else {
        // A document shared with you is not yours to add to: the copy goes to your own topic.
        const own = !isSharedDocument(document) && !document.shared;
        const saved = await onSaveGeneratedQuizDocument?.({ folderIds: own ? document.folderIds || [] : [], tags: copyTags(document), file: { name: `${final.name}.resource.json`, content, preview, sizeBytes: content.length } }, own ? document.subjectId : fallbackSubjectId || document.subjectId);
        onDone?.(t("courses.ud.savedCopy", { name: final.name }), { mode: "copy", documentId: saved?.id || "" });
      }
      onClose?.();
    } catch (problem) {
      setError(String(problem?.message || problem));
    } finally {
      setSaving(false);
    }
  }

  const busy = phase === "running";
  const missing = resolution.status === "missing";
  const unsupported = resolution.status === "unsupported";
  const suggestions = suggestionsFor(kind, t);
  const wide = phase === "result";

  return (
    <div className="tw-scope fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-black/30 p-4" onClick={busy ? undefined : onClose}>
      <div role="dialog" aria-modal="true" aria-label={t("courses.ud.ariaUpdate", { name: resource.name })} className={`w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-2xl bg-white p-5 shadow-[0_24px_64px_rgba(0,0,0,0.25)]`} onClick={(event) => event.stopPropagation()}>
        {phase === "running" ? (
          <div className="grid gap-4">
            <PlanProgress steps={STEPS} currentId={currentId} sub={sub} headline={t("courses.ud.updating", { name: resource.name })} />
            <div className="flex justify-end"><button type="button" className={ghostBtn} onClick={() => abortRef.current?.abort()}>{t("common.cancel")}</button></div>
          </div>
        ) : null}

        {phase === "form" ? (
          <>
            <p className={kicker}>{t("courses.ud.kicker")}</p>
            <h4 className="m-0 mt-1 text-lg font-bold text-ink">{displayName(resource.name)}</h4>
            <p className="m-0 mt-0.5 text-xs text-soft-ink">{describeResource(resource, document, t)}</p>
            <p className="m-0 mt-2 text-xs text-soft-ink">{t("courses.ud.intro")}</p>

            {unsupported ? <p className="m-0 mt-3 rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-sm text-ink">{t("courses.ud.unsupported")}</p> : null}
            {missing ? (
              <div className="mt-3 rounded-xl border border-[rgba(255,149,0,0.4)] bg-[rgba(255,149,0,0.06)] px-3 py-2.5">
                <p className="m-0 text-sm font-semibold text-ink">{t("courses.ud.missing")}{resolution.name ? ` (${resolution.name})` : ""}.</p>
                {resolution.fallback ? (
                  <label className="mt-1.5 flex cursor-pointer items-start gap-2 text-sm text-ink">
                    <input type="checkbox" className="mt-1" checked={useFallback} onChange={(event) => setUseFallback(event.target.checked)} />
                    <span>{t("courses.ud.fallbackBefore")} <strong>{resolution.fallback.label}</strong>. {t("courses.ud.fallbackAfter")}</span>
                  </label>
                ) : <p className="m-0 mt-1 text-xs text-soft-ink">{t("courses.ud.noBuiltin")}</p>}
              </div>
            ) : null}

            <textarea className={`${fieldClass} mt-3`} rows={3} autoFocus value={instruction} disabled={unsupported} onChange={(event) => setInstruction(event.target.value)} placeholder={t("courses.ud.placeholder")} />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {suggestions.map((chip) => (
                <button key={chip} type="button" disabled={unsupported} className="rounded-full border border-ink/15 px-2.5 py-1 text-[11px] font-semibold text-soft-ink transition hover:bg-[var(--surface-soft)]" onClick={() => setInstruction((current) => (current.trim() ? `${current.trim()}. ${chip}` : chip))}>{chip}</button>
              ))}
            </div>

            <div className="mt-4 grid gap-2.5 rounded-xl bg-[var(--surface-soft)] p-3">
              <label className="flex cursor-pointer items-start gap-2 text-sm text-ink">
                <input type="checkbox" className="mt-1" checked={keepFormat} onChange={(event) => setKeepFormat(event.target.checked)} />
                <span>{t("courses.ud.keepFormat")}<span className="block text-[11px] text-soft-ink">{t("courses.ud.keepFormatHint")}</span></span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 text-sm text-ink">
                <input type="checkbox" className="mt-1" checked={differentMaterial} onChange={(event) => setDifferentMaterial(event.target.checked)} />
                <span>{t("courses.ud.differentMaterial")}<span className="block text-[11px] text-soft-ink">{material.different ? t.plural("courses.ud.chosen", material.documentIds.length) : (resource.meta?.sourceNames || []).length ? t("courses.ud.now", { names: sentence(resource.meta.sourceNames.slice(0, 3), t) }) : t("courses.ud.pickDocs")}</span></span>
              </label>
              {differentMaterial ? <WorkspaceDocumentPicker workspace={workspace} selectedIds={materialIds} onChange={setMaterialIds} /> : null}
              {material.missing.length && !differentMaterial ? <p className="m-0 text-[11px] text-[var(--color-warn)]">{t.plural("courses.ud.gone", material.missing.length)}</p> : null}
            </div>

            <div className="mt-3 min-h-4">
              {ready ? <RunEstimateLine estimate={estimate} loading={estimating} balance={readCredits().balance} /> : chosen ? <p className="m-0 text-[11px] text-[var(--color-warn)]">{t("courses.ud.chooseMaterial")}</p> : null}
            </div>
            {error ? <p className="m-0 mt-2 text-xs text-[var(--color-danger)]">{error}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className={ghostBtn} onClick={onClose}>{t("common.cancel")}</button>
              <button type="button" className={primaryBtn} disabled={!instruction.trim() || !ready || unsupported} onClick={run}>{t("courses.ud.kicker")}</button>
            </div>
          </>
        ) : null}

        {phase === "result" && outcome ? (
          <>
            <p className={kicker}>{t("courses.ud.newVersion")}</p>
            <h4 className="m-0 mt-1 text-lg font-bold text-ink">{displayName(resource.name)}</h4>
            {outcome.understood ? <p className="m-0 mt-1.5 rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-xs text-ink"><strong>{t("courses.ud.understood")}</strong> {outcome.understood}</p> : null}
            {outcome.agent.fallback ? <p className="m-0 mt-1.5 text-xs text-soft-ink">{t("courses.ud.writtenWith", { name: outcome.agent.label })}</p> : null}
            <div className="mt-3"><UpdateCompare diff={outcome.diff} /></div>
            {outcome.checks.length ? <p className="m-0 mt-2 text-xs text-[var(--color-warn)]">{t("courses.ud.checksFailed", { checks: outcome.checks.map((check) => check.message).join(" · ") })}</p> : null}

            <div className="mt-4 grid gap-2">
              <label className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm ${effectiveMode === "replace" ? "border-[var(--accent)]/40 bg-[var(--accent-soft)]" : "border-ink/10"} ${canReplace ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}>
                <input type="radio" name="update-mode" className="mt-1" disabled={!canReplace} checked={effectiveMode === "replace"} onChange={() => setMode("replace")} />
                <span><strong>{t("courses.ud.replace")}</strong><span className="block text-[11px] text-soft-ink">{t("courses.ud.replaceHint")}</span></span>
              </label>
              <label className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm ${effectiveMode === "copy" ? "border-[var(--accent)]/40 bg-[var(--accent-soft)]" : "border-ink/10"}`}>
                <input type="radio" name="update-mode" className="mt-1" disabled={useFallback} checked={effectiveMode === "copy"} onChange={() => setMode("copy")} />
                <span><strong>{t("courses.ud.saveNew")}</strong><span className="block text-[11px] text-soft-ink">{document ? t("courses.ud.saveNewHintDoc") : t("courses.ud.saveNewHintNone")}</span></span>
              </label>
              {decision.reasons.length ? <p className="m-0 px-1 text-[11px] text-soft-ink">{decision.mode === "copy" ? t("courses.ud.copySuggested") : t("courses.ud.note")} {sentence(decision.reasons, t)}.</p> : null}
              {kind === "master" && effectiveMode === "replace" && decision.dependants ? <p className="m-0 px-1 text-[11px] text-[var(--color-warn)]">{t.plural("courses.ud.dependants", decision.dependants)}</p> : null}
            </div>
            {error ? <p className="m-0 mt-2 text-xs text-[var(--color-danger)]">{error}</p> : null}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" className={ghostBtn} disabled={saving} onClick={onClose}>{t("courses.ud.discard")}</button>
              <button type="button" className={ghostBtn} disabled={saving} onClick={() => { setPhase("form"); setOutcome(null); }}>{t("courses.ud.change")}</button>
              <button type="button" className={primaryBtn} disabled={saving || !outcome.diff.changedAnything} onClick={apply}>{saving ? t("courses.rs.saving") : effectiveMode === "replace" ? t("courses.ud.replace") : t("courses.ud.saveNew")}</button>
            </div>
            {!outcome.diff.changedAnything ? <p className="m-0 mt-2 text-right text-[11px] text-soft-ink">{t("courses.ud.nothingDiff")}</p> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
