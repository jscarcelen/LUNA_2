"use client";

import { useState } from "react";
import { ResourceExports } from "./ResourceExports";
import { SKILLS } from "../activities/engine/activity";
import { CONCEPT_LEVELS, newConcept, resourceConcepts } from "./concepts";

const card = "rounded-[18px] border border-ink/8 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)]";
const kicker = "m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink";
const primaryBtn = "inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0077ed] disabled:opacity-50";
const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-[var(--surface-soft)]";
const field = "rounded-xl border border-ink/12 bg-white px-3 py-1.5 text-xs text-ink";

const TABS = [
  ["do", "Do it on Luna"],
  ["concepts", "What it teaches"],
  ["questions", "Questions & sources"],
  ["export", "Downloads"],
  ["results", "Results"]
];

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
  onDelete,
  onClassify,
  onBulkClassify,
  onSaveConcepts,
  onStatus
}) {
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
      if (!response.ok) throw new Error(data.error || "Could not read the resource");
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
    onStatus?.("Saved what this resource teaches.");
  }

  return (
    <div className="tw-scope fixed inset-0 z-40 overflow-y-auto bg-[var(--bg)]/95 p-4 sm:p-8">
      <div className="mx-auto grid max-w-4xl gap-3">
        <header className={`${card} flex flex-wrap items-start justify-between gap-3 p-5`}>
          <div className="min-w-0">
            <h3 className="m-0 truncate text-2xl font-bold tracking-tight text-ink">{row.resource.name}</h3>
            <p className="m-0 mt-1 text-sm text-soft-ink">
              {new Date(row.resource.createdAt).toLocaleString()}
              {row.resource.meta.agentName ? ` · ✦ ${row.resource.meta.agentName}` : ""}
              {row.resource.meta.templateName ? ` · ${row.resource.meta.templateName}` : ""}
              {(row.resource.meta.sourceNames || []).length ? ` · from ${row.resource.meta.sourceNames.join(", ")}` : ""}
            </p>
            {stats?.times ? <p className="m-0 mt-1 text-xs text-soft-ink">Done {stats.times}× · best {Math.round(stats.best * 100)}% · {stats.errors} mistakes recorded</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {onRegenerate ? <button type="button" className={ghostBtn} onClick={() => onRegenerate(row)}>Regenerate / edit</button> : null}
            {onDelete ? <button type="button" className={`${ghostBtn} text-[var(--color-danger)]`} onClick={() => { if (window.confirm(`Delete "${row.resource.name}"?`)) { onDelete(row); onClose?.(); } }}>Delete</button> : null}
            <button type="button" className={ghostBtn} onClick={onClose}>Close</button>
          </div>
        </header>

        <div className="flex flex-wrap gap-1 self-start rounded-xl bg-[var(--surface-soft)] p-1">
          {TABS.map(([value, text]) => <button key={value} type="button" onClick={() => setTab(value)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === value ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink"}`}>{text}</button>)}
        </div>

        {tab === "do" ? (
          row.resource.activity?.questions?.length
            ? <section className={`${card} p-5`}><p className="m-0 text-sm text-soft-ink">{row.resource.activity.questions.length} questions. Answers are checked and every attempt is recorded.</p><button type="button" className={`${primaryBtn} mt-3`} onClick={() => onPlay?.(row)}>{stats?.times ? "Do it again" : "Start"}</button></section>
            : <section className={`${card} p-5`}><p className="m-0 text-sm text-soft-ink">This resource has nothing to answer — it is a reading document. Use Downloads.</p></section>
        ) : null}

        {tab === "concepts" ? (
          <section className={`${card} p-5`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className={kicker}>What this resource teaches</p>
                <p className="m-0 mt-1 max-w-xl text-xs text-soft-ink">Small learning goals, edited by you. Study plans are built from these, and several resources landing on the same goal is exactly what shows a topic is covered.</p>
              </div>
              <div className="flex gap-2">
                <button type="button" className={ghostBtn} disabled={suggesting} onClick={suggest}>{suggesting ? "Reading…" : "✦ Suggest with Luna"}</button>
                {dirty ? <button type="button" className={primaryBtn} onClick={saveConcepts}>Save</button> : null}
              </div>
            </div>
            <label className="mt-3 grid gap-1 text-xs font-semibold text-soft-ink">Context
              <input className={`${field} w-full`} value={context} onChange={(event) => { setContext(event.target.value); setDirty(true); }} placeholder="What this is about and where it sits in the subject" />
            </label>
            <div className="mt-3 grid gap-2">
              {concepts.map((concept) => (
                <div key={concept.id} className="grid gap-2 rounded-xl border border-ink/10 p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="grid gap-1">
                    <input className={`${field} w-full font-semibold`} value={concept.name} onChange={(event) => edit((current) => current.map((item) => (item.id === concept.id ? { ...item, name: event.target.value } : item)))} placeholder="Concept" />
                    <input className={`${field} w-full`} value={concept.detail || ""} onChange={(event) => edit((current) => current.map((item) => (item.id === concept.id ? { ...item, detail: event.target.value } : item)))} placeholder="What the learner can do once they have it" />
                  </div>
                  <div className="flex items-start gap-1.5">
                    <select className={field} value={concept.level || "understand"} onChange={(event) => edit((current) => current.map((item) => (item.id === concept.id ? { ...item, level: event.target.value } : item)))}>
                      {CONCEPT_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
                    </select>
                    <button type="button" className="px-1 text-xs text-soft-ink hover:text-[var(--color-danger)]" onClick={() => edit((current) => current.filter((item) => item.id !== concept.id))}>✕</button>
                  </div>
                </div>
              ))}
              <button type="button" className={`${ghostBtn} justify-self-start`} onClick={() => edit((current) => [...current, newConcept("")])}>＋ Add a concept</button>
              {!concepts.length && !suggesting ? <p className="m-0 text-sm text-soft-ink">Nothing listed yet — let Luna read the resource, then edit what it proposes.</p> : null}
            </div>
            {error ? <p className="m-0 mt-2 text-xs text-[var(--color-danger)]">{error}</p> : null}
          </section>
        ) : null}

        {tab === "questions" ? (
          <section className={`${card} p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><p className={kicker}>What each question tests</p><p className="m-0 mt-1 text-xs text-soft-ink">Classify the questions so mistakes can be measured by skill and difficulty. Where the answer comes from is shown underneath.</p></div>
              {row.resource.activity?.questions?.length ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <select className={field} value="" onChange={(event) => event.target.value && onBulkClassify?.(row, { skill: event.target.value })}><option value="">Set all skills…</option>{SKILLS.map((skill) => <option key={skill} value={skill}>{skill}</option>)}</select>
                  <select className={field} value="" onChange={(event) => event.target.value && onBulkClassify?.(row, { difficulty: event.target.value })}><option value="">Set all difficulty…</option>{["easy", "medium", "hard"].map((level) => <option key={level} value={level}>{level}</option>)}</select>
                </div>
              ) : null}
            </div>
            <div className="mt-3 grid gap-2">
              {(row.resource.activity?.questions || []).map((question, index) => (
                <div key={question.id} className="rounded-xl border border-ink/10 p-3">
                  <p className="m-0 text-sm font-semibold text-ink"><span className="mr-2 text-soft-ink">{index + 1}.</span>{question.prompt}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <select className={field} value={question.skill || ""} onChange={(event) => onClassify?.(row, question.id, { skill: event.target.value })}>
                      <option value="">What does it test…</option>
                      {[...new Set([...SKILLS, ...(question.skill ? [question.skill] : [])])].map((skill) => <option key={skill} value={skill}>{skill}</option>)}
                    </select>
                    <select className={field} value={question.difficulty || ""} onChange={(event) => onClassify?.(row, question.id, { difficulty: event.target.value })}>
                      <option value="">Difficulty…</option>
                      {["easy", "medium", "hard"].map((level) => <option key={level} value={level}>{level}</option>)}
                    </select>
                    <input className={`${field} w-40`} defaultValue={question.topic || ""} placeholder="Topic" onBlur={(event) => event.target.value !== (question.topic || "") && onClassify?.(row, question.id, { topic: event.target.value })} />
                  </div>
                  {question.source?.extract
                    ? <p className="m-0 mt-2 rounded-lg bg-[var(--surface-soft)] px-2.5 py-1.5 text-[11px] text-soft-ink">📖 {question.source.documentName ? <strong className="text-ink">{question.source.documentName}</strong> : "Material"}{question.source.locator ? ` · ${question.source.locator}` : ""}: “{question.source.extract}”</p>
                    : <p className="m-0 mt-2 text-[11px] text-soft-ink">No source passage matched this question.</p>}
                </div>
              ))}
              {!row.resource.activity?.questions?.length ? <p className="m-0 text-sm text-soft-ink">This resource has no questions.</p> : null}
            </div>
          </section>
        ) : null}

        {tab === "export" ? <section className={`${card} p-5`}><p className={kicker}>Every view of its template</p><div className="mt-3"><ResourceExports resource={row.resource} template={template} onStatus={onStatus} /></div></section> : null}

        {tab === "results" ? (
          <section className={`${card} p-5`}>
            {!stats?.attempts?.length ? <p className="m-0 text-sm text-soft-ink">Not done yet.</p> : stats.attempts.map((attempt, index) => (
              <div key={index} className="mb-2 rounded-xl border border-ink/10 p-3">
                <p className="m-0 flex items-center justify-between text-sm"><span className="text-soft-ink">{new Date(attempt.at).toLocaleString()}</span><span className="font-bold text-ink">{attempt.score} / {attempt.total}</span></p>
                {(attempt.results || []).filter((result) => result.correct === false).map((result) => <p key={result.id} className="m-0 mt-1 text-xs text-ink">✗ {result.prompt} <span className="text-soft-ink">→ {result.expected}</span></p>)}
              </div>
            ))}
          </section>
        ) : null}
      </div>
    </div>
  );
}
