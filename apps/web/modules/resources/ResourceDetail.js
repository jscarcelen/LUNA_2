"use client";

import { useState } from "react";
import { ResourceExports } from "./ResourceExports";
import { ResourceStyle } from "./ResourceStyle";
import { resourceBlocks } from "./look";
import { ReaderView } from "../reader/ReaderView";
import { SKILLS } from "../activities/engine/activity";
import { CONCEPT_LEVELS, newConcept, resourceConcepts } from "./concepts";
import { VersionsPanel } from "./VersionsPanel";
import { displayName } from "../ui/displayName";
import { useT } from "../../lib/i18n/LocaleProvider.js";

const card = "rounded-[18px] border border-ink/8 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)]";
const kicker = "m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink";
const primaryBtn = "inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0077ed] disabled:opacity-50";
const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-[var(--surface-soft)]";
const field = "rounded-xl border border-ink/12 bg-white px-3 py-1.5 text-xs text-ink";

const TABS = ["do", "style", "concepts", "questions", "export", "results", "versions"];

/** A fixed word (skill, level, difficulty) in the UI language; anything unknown shows as it is. */
const word = (t, prefix, value) => {
  const key = `courses.${prefix}.${value}`;
  const out = t(key);
  return out === key ? value : out;
};

/**
 * Everything you can do with one generated resource: do it on Luna, see and edit what it teaches,
 * classify its questions, download any view of its template, and read past attempts. Shown as an
 * overlay from wherever the resource lives — the workspace — so the library and the folders are
 * the same place.
 */
export function ResourceDetail({
  row,
  stats,
  template,
  onClose,
  onPlay,
  onRegenerate,
  onUpdate,
  onRestoreVersion,
  notices = [],
  onDelete,
  onClassify,
  onBulkClassify,
  onSaveConcepts,
  onSaveStyles,
  onSaveHighlights,
  onSubmitAttempt,
  onStatus
}) {
  const t = useT();
  // A document (summary, notes…) opens straight in the reading view; the editor and the rest sit in the "⋯" menu.
  const readsFirst = Boolean(resourceBlocks(row.resource)) && !row.resource.activity?.questions?.length;
  const [landed, setLanded] = useState(readsFirst);
  const [reading, setReading] = useState(readsFirst);
  const [tab, setTab] = useState(row.resource.activity?.questions?.length ? "do" : "concepts");
  const [concepts, setConcepts] = useState(resourceConcepts(row.resource));
  const [context, setContext] = useState(row.resource.context || "");
  const [suggesting, setSuggesting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");

  function edit(updater) {
    setConcepts((current) => { const next = updater(current); setDirty(true); return next; });
  }

  async function suggest() {
    setSuggesting(true);
    setError("");
    try {
      const response = await fetch("/api/resources/concepts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: row.resource.name,
          questions: (row.resource.activity?.questions || []).map((question) => question.prompt).slice(0, 40),
          sample: JSON.stringify(row.resource.data || {}).slice(0, 4000),
          sources: row.resource.meta?.sourceNames || []
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t("courses.rd.readFail"));
      setContext(data.context || "");
      setConcepts((current) => {
        const existing = new Set(current.map((concept) => concept.name.toLowerCase()));
        const added = (data.concepts || []).filter((concept) => !existing.has(String(concept.name).toLowerCase())).map((concept) => newConcept(concept.name, concept.detail, concept.level));
        return [...current, ...added];
      });
      setDirty(true);
    } catch (problem) {
      setError(String(problem.message || problem));
    } finally {
      setSuggesting(false);
    }
  }

  async function saveConcepts() {
    await onSaveConcepts?.(row, { concepts, context });
    setDirty(false);
    onStatus?.(t("courses.rd.savedConcepts"));
  }

  return (
    <div className="tw-scope fixed inset-0 z-40 overflow-y-auto bg-[var(--bg)]/95 p-4 sm:p-8">
      {reading ? <ReaderView resource={row.resource} menuItems={landed ? [
        { label: t("courses.rd.tab.concepts"), icon: "◎", onSelect: () => { setLanded(false); setReading(false); setTab("concepts"); } },
        onRegenerate ? { label: t("courses.wb.regenerate"), icon: "✨", onSelect: () => onRegenerate(row) } : null,
        onDelete ? { label: t("common.delete"), icon: "🗑", danger: true, onSelect: () => { if (window.confirm(t("courses.rd.confirmDeleteUndo", { name: displayName(row.resource.name) }))) { onDelete(row); onClose?.(); } } } : null
      ] : []} chat={{ documentId: row.document.id }} highlights={row.resource.highlights || []} onSaveHighlights={(list) => onSaveHighlights?.(row, list)} onSubmit={(attempt) => onSubmitAttempt?.(attempt, row.document.id)} onUpdate={onUpdate ? () => onUpdate(row) : undefined} onClose={() => { if (landed) onClose?.(); else setReading(false); }} /> : null}
      <div className={`mx-auto grid gap-3 ${tab === "style" ? "max-w-6xl" : "max-w-4xl"}`}>
        <header className={`${card} flex flex-wrap items-start justify-between gap-3 p-5`}>
          <div className="min-w-0">
            <h3 className="m-0 truncate text-2xl font-bold tracking-tight text-ink">{displayName(row.resource.name)}</h3>
            <p className="m-0 mt-1 text-sm text-soft-ink">
              {new Date(row.resource.createdAt).toLocaleString(t.locale)}
              {row.resource.meta.agentName ? ` · ✦ ${row.resource.meta.agentName}` : ""}
              {row.resource.meta.templateName ? ` · ${row.resource.meta.templateName}` : ""}
              {(row.resource.meta.sourceNames || []).length ? ` · ${t("courses.rd.from", { names: row.resource.meta.sourceNames.join(", ") })}` : ""}
            </p>
            {stats?.times ? <p className="m-0 mt-1 text-xs text-soft-ink">{t("courses.rd.stats", { times: stats.times, best: Math.round(stats.best * 100), errors: stats.errors })}</p> : null}
            {notices.map((notice) => <p key={notice} className="m-0 mt-1 text-xs font-semibold text-[var(--color-warn)]">{notice}</p>)}
          </div>
          <div className="flex flex-wrap gap-2">
            {resourceBlocks(row.resource) || row.resource.activity?.questions?.length ? <button type="button" className={primaryBtn} onClick={() => setReading(true)}>{row.resource.activity?.questions?.length ? t("courses.rd.openHtml") : t("courses.rd.read")}</button> : null}
            {onUpdate ? <button type="button" className={ghostBtn} onClick={() => onUpdate(row)}>✦ {t("courses.wb.update")}</button> : null}
            {onRegenerate ? <button type="button" className={ghostBtn} onClick={() => onRegenerate(row)}>{t("courses.rd.regenEdit")}</button> : null}
            {onDelete ? <button type="button" className={`${ghostBtn} text-[var(--color-danger)]`} onClick={() => { if (window.confirm(t("courses.rd.confirmDelete", { name: displayName(row.resource.name) }))) { onDelete(row); onClose?.(); } }}>{t("common.delete")}</button> : null}
            <button type="button" className={ghostBtn} onClick={onClose}>{t("common.close")}</button>
          </div>
        </header>

        <div className="flex flex-wrap gap-1 self-start rounded-xl bg-[var(--surface-soft)] p-1">
          {TABS.filter((value) => (value !== "style" || resourceBlocks(row.resource)) && (value !== "versions" || (row.resource.versions || []).length)).map((value) => <button key={value} type="button" onClick={() => setTab(value)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === value ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink"}`}>{t(`courses.rd.tab.${value}`)}</button>)}
        </div>

        {tab === "do" ? (
          row.resource.activity?.questions?.length
            ? <section className={`${card} p-5`}><p className="m-0 text-sm text-soft-ink">{t("courses.rd.doIntro", { count: row.resource.activity.questions.length })}</p><button type="button" className={`${primaryBtn} mt-3`} onClick={() => onPlay?.(row)}>{stats?.times ? t("courses.rd.again") : t("courses.rd.start")}</button></section>
            : <section className={`${card} p-5`}><p className="m-0 text-sm text-soft-ink">{t("courses.rd.readingDoc")}</p></section>
        ) : null}

        {tab === "style" ? (
          <section className={`${card} p-5`}>
            <p className={kicker}>{t("courses.rd.tab.style")}</p>
            <p className="m-0 mb-3 mt-1 text-xs text-soft-ink">{t("courses.rd.styleIntro")}</p>
            <ResourceStyle resource={row.resource} documentId={row.document.id} onSaveStyles={(styles) => onSaveStyles?.(row, styles)} onStatus={onStatus} />
          </section>
        ) : null}

        {tab === "concepts" ? (
          <section className={`${card} p-5`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className={kicker}>{t("courses.rd.teachesTitle")}</p>
                <p className="m-0 mt-1 max-w-xl text-xs text-soft-ink">{t("courses.rd.teachesIntro")}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" className={ghostBtn} disabled={suggesting} onClick={suggest}>{suggesting ? t("courses.rd.reading") : t("courses.rd.suggest")}</button>
                {dirty ? <button type="button" className={primaryBtn} onClick={saveConcepts}>{t("common.save")}</button> : null}
              </div>
            </div>
            <label className="mt-3 grid gap-1 text-xs font-semibold text-soft-ink">{t("courses.rd.context")}
              <input className={`${field} w-full`} value={context} onChange={(event) => { setContext(event.target.value); setDirty(true); }} placeholder={t("courses.rd.contextPh")} />
            </label>
            <div className="mt-3 grid gap-2">
              {concepts.map((concept) => (
                <div key={concept.id} className="grid gap-2 rounded-xl border border-ink/10 p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="grid gap-1">
                    <input className={`${field} w-full font-semibold`} value={concept.name} onChange={(event) => edit((current) => current.map((item) => (item.id === concept.id ? { ...item, name: event.target.value } : item)))} placeholder={t("courses.rd.conceptPh")} />
                    <input className={`${field} w-full`} value={concept.detail || ""} onChange={(event) => edit((current) => current.map((item) => (item.id === concept.id ? { ...item, detail: event.target.value } : item)))} placeholder={t("courses.rd.detailPh")} />
                  </div>
                  <div className="flex items-start gap-1.5">
                    <select className={field} value={concept.level || "understand"} onChange={(event) => edit((current) => current.map((item) => (item.id === concept.id ? { ...item, level: event.target.value } : item)))}>
                      {CONCEPT_LEVELS.map((level) => <option key={level} value={level}>{word(t, "level", level)}</option>)}
                    </select>
                    <button type="button" className="px-1 text-xs text-soft-ink hover:text-[var(--color-danger)]" onClick={() => edit((current) => current.filter((item) => item.id !== concept.id))}>✕</button>
                  </div>
                </div>
              ))}
              <button type="button" className={`${ghostBtn} justify-self-start`} onClick={() => edit((current) => [...current, newConcept("")])}>＋ {t("courses.rd.addConcept")}</button>
              {!concepts.length && !suggesting ? <p className="m-0 text-sm text-soft-ink">{t("courses.rd.noConcepts")}</p> : null}
            </div>
            {error ? <p className="m-0 mt-2 text-xs text-[var(--color-danger)]">{error}</p> : null}
          </section>
        ) : null}

        {tab === "questions" ? (
          <section className={`${card} p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><p className={kicker}>{t("courses.rd.qTests")}</p><p className="m-0 mt-1 text-xs text-soft-ink">{t("courses.rd.qIntro")}</p></div>
              {row.resource.activity?.questions?.length ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <select className={field} value="" onChange={(event) => event.target.value && onBulkClassify?.(row, { skill: event.target.value })}><option value="">{t("courses.rd.setAllSkills")}</option>{SKILLS.map((skill) => <option key={skill} value={skill}>{word(t, "skill", skill)}</option>)}</select>
                  <select className={field} value="" onChange={(event) => event.target.value && onBulkClassify?.(row, { difficulty: event.target.value })}><option value="">{t("courses.rd.setAllDiff")}</option>{["easy", "medium", "hard"].map((level) => <option key={level} value={level}>{word(t, "diff", level)}</option>)}</select>
                </div>
              ) : null}
            </div>
            <div className="mt-3 grid gap-2">
              {(row.resource.activity?.questions || []).map((question, index) => (
                <div key={question.id} className="rounded-xl border border-ink/10 p-3">
                  <p className="m-0 text-sm font-semibold text-ink"><span className="mr-2 text-soft-ink">{index + 1}.</span>{question.prompt}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <select className={field} value={question.skill || ""} onChange={(event) => onClassify?.(row, question.id, { skill: event.target.value })}>
                      <option value="">{t("courses.rd.whatTest")}</option>
                      {[...new Set([...SKILLS, ...(question.skill ? [question.skill] : [])])].map((skill) => <option key={skill} value={skill}>{word(t, "skill", skill)}</option>)}
                    </select>
                    <select className={field} value={question.difficulty || ""} onChange={(event) => onClassify?.(row, question.id, { difficulty: event.target.value })}>
                      <option value="">{t("courses.rd.difficulty")}</option>
                      {["easy", "medium", "hard"].map((level) => <option key={level} value={level}>{word(t, "diff", level)}</option>)}
                    </select>
                    <input className={`${field} w-40`} defaultValue={question.topic || ""} placeholder={t("courses.wb.topic")} onBlur={(event) => event.target.value !== (question.topic || "") && onClassify?.(row, question.id, { topic: event.target.value })} />
                  </div>
                  {question.source?.extract
                    ? <p className="m-0 mt-2 rounded-lg bg-[var(--surface-soft)] px-2.5 py-1.5 text-[11px] text-soft-ink">📖 {question.source.documentName ? <strong className="text-ink">{question.source.documentName}</strong> : t("courses.rd.material")}{question.source.locator ? ` · ${question.source.locator}` : ""}: “{question.source.extract}”</p>
                    : <p className="m-0 mt-2 text-[11px] text-soft-ink">{t("courses.rd.noSource")}</p>}
                </div>
              ))}
              {!row.resource.activity?.questions?.length ? <p className="m-0 text-sm text-soft-ink">{t("courses.rd.noQuestions")}</p> : null}
            </div>
          </section>
        ) : null}

        {tab === "export" ? <section className={`${card} p-5`}><p className={kicker}>{t("courses.rd.everyView")}</p>{!template && resourceBlocks(row.resource) ? <p className="m-0 mt-2 text-sm text-soft-ink">{t("courses.rd.exportFromBefore")} <button type="button" className="font-semibold text-[var(--accent)]" onClick={() => setTab("style")}>{t("courses.rd.tab.style")}</button> {t("courses.rd.exportFromAfter")}</p> : null}<div className="mt-3"><ResourceExports resource={row.resource} template={template} onStatus={onStatus} /></div></section> : null}

        {tab === "versions" ? <section className={`${card} p-5`}><VersionsPanel resource={row.resource} onRestore={(id) => onRestoreVersion?.(row, id)} /></section> : null}

        {tab === "results" ? (
          <section className={`${card} p-5`}>
            {!stats?.attempts?.length ? <p className="m-0 text-sm text-soft-ink">{t("courses.rd.notDone")}</p> : stats.attempts.map((attempt, index) => (
              <div key={index} className="mb-2 rounded-xl border border-ink/10 p-3">
                <p className="m-0 flex items-center justify-between text-sm"><span className="text-soft-ink">{new Date(attempt.at).toLocaleString(t.locale)}</span><span className="font-bold text-ink">{attempt.score} / {attempt.total}</span></p>
                {(attempt.results || []).filter((result) => result.correct === false).map((result) => <p key={result.id} className="m-0 mt-1 text-xs text-ink">✗ {result.prompt} <span className="text-soft-ink">→ {result.expected}</span></p>)}
              </div>
            ))}
          </section>
        ) : null}
      </div>
    </div>
  );
}
