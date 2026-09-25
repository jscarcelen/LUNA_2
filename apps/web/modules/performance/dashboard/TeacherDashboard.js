"use client";

import { useMemo, useState } from "react";
import { MASTERY_THRESHOLD, attentionFlags, byLearner, classTopicCoverage, classTopicMatrix, learnerSubjectMatrix, masteryOverTime, nextActions, overallMastery, retentionOf, statusOf, topicMastery } from "../mastery";
import { analyseErrors } from "../errors";
import { ClassTopicBars, ErrorBreakdown, Heatmap, Kpi, MasteryMap, MasteryTrend, NextActions, card, chip, ghostBtn, kicker, percent, trendArrow, trendTone } from "./parts";

const VIEWS = [
  { id: "class", label: "Class · this subject", hint: "How is my class doing here?" },
  { id: "student", label: "One student · this subject", hint: "How is this student doing with me?" },
  { id: "across", label: "Students × subjects", hint: "Who needs attention, and where?" }
];

const FILTERS = [
  { id: "below", label: "Below mastery" },
  { id: "declining", label: "Declining" },
  { id: "conceptual", label: "Conceptual errors" },
  { id: "retention", label: "Forgets after a gap" },
  { id: "coverage", label: "Too little evidence" }
];

/**
 * The teacher's three views, built from the same evidence as the student's screen:
 * the class in this subject, one student in this subject, and everyone across subjects — the last
 * one being what tells a struggling-in-my-subject student from a struggling-everywhere student.
 */
export function TeacherDashboard({ evidence = [], subjectName = "", onOpenLearner }) {
  const [view, setView] = useState("class");
  const [learner, setLearner] = useState("");
  const [topic, setTopic] = useState("");
  const [flags, setFlags] = useState([]);

  const learners = useMemo(() => byLearner(evidence), [evidence]);
  const classTopics = useMemo(() => topicMastery(evidence), [evidence]);
  const classOverall = useMemo(() => overallMastery(classTopics), [classTopics]);
  const classErrors = useMemo(() => analyseErrors(evidence), [evidence]);
  const coverage = useMemo(() => classTopicCoverage(evidence), [evidence]);
  const matrix = useMemo(() => classTopicMatrix(evidence), [evidence]);
  const across = useMemo(() => learnerSubjectMatrix(evidence), [evidence]);
  const trend = useMemo(() => masteryOverTime(evidence), [evidence]);
  const measured = trend.filter((point) => point.mastery !== null);
  const change = measured.length > 1 ? measured[measured.length - 1].mastery - measured[0].mastery : 0;

  const errorsFor = (entry) => analyseErrors(entry.rows).types;
  const flagged = useMemo(() => learners.map((entry) => ({ ...entry, flags: attentionFlags(entry, errorsFor) })), [learners]);
  const shown = flags.length ? flagged.filter((entry) => entry.flags.some((flag) => flags.includes(flag.id))) : flagged;

  const current = flagged.find((entry) => entry.learner === learner) || flagged[0] || null;

  if (!evidence.length) {
    return <section className={`${card} p-6`}><p className="m-0 text-sm text-soft-ink">No results yet in {subjectName || "this space"}. Assign an activity and this fills in per student, per topic and per kind of mistake.</p></section>;
  }

  return (
    <div className="grid gap-4">
      <div className={`${card} flex flex-wrap items-center justify-between gap-2 p-2`}>
        <div className="flex flex-wrap gap-1">
          {VIEWS.map((entry) => (
            <button key={entry.id} type="button" onClick={() => setView(entry.id)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${view === entry.id ? "bg-ink text-white" : "text-soft-ink hover:bg-[var(--surface-soft)]"}`}>{entry.label}</button>
          ))}
        </div>
        <p className="m-0 pr-2 text-[11px] text-soft-ink">{VIEWS.find((entry) => entry.id === view)?.hint}</p>
      </div>

      {view === "class" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Kpi label="Class mastery" value={`${classOverall.mastery}%`} hint={`${measured.length > 1 ? `${change >= 0 ? "↑" : "↓"} ${Math.abs(Math.round(change))} pts` : "not enough history yet"}`} />
            <Kpi label="At mastery" value={`${learners.filter((entry) => entry.mastery >= MASTERY_THRESHOLD).length} / ${learners.length}`} hint={`threshold ${MASTERY_THRESHOLD}%`} />
            <Kpi label="Need attention" value={flagged.filter((entry) => entry.flags.length).length} tone="text-[var(--color-warn)]" hint="flagged by mastery, trend, errors or retention" />
            <Kpi label="Class accuracy" value={percent(classOverall.accuracy)} hint={`${classOverall.questions} questions answered`} />
            <Kpi label="Hardest topic" value={coverage[0]?.topic || "—"} tone="text-[var(--color-danger)]" hint={coverage[0] ? `${coverage[0].mastered} of ${coverage[0].learners} students at mastery` : ""} />
          </div>

          <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <section className={`${card} p-5`}>
              <p className={kicker}>Class × topic</p>
              <p className="m-0 mt-1 text-xs text-soft-ink">Green is mastery, red is trouble. A red column is a class-wide problem — it is the teaching, not the student.</p>
              <div className="mt-3"><Heatmap columns={matrix.topics} rows={matrix.rows} onCell={(row) => { setLearner(row.learner); setView("student"); }} /></div>

              <p className={`${kicker} mt-5`}>How much of the class has each topic</p>
              <div className="mt-2"><ClassTopicBars rows={coverage} onPick={setTopic} /></div>
            </section>

            <div className="grid gap-3">
              <section className={`${card} p-5`}>
                <p className={kicker}>Why the class gets things wrong</p>
                <div className="mt-2"><ErrorBreakdown analysis={topic ? analyseErrors(evidence.filter((row) => row.topic === topic)) : classErrors} /></div>
                {topic ? <button type="button" className={`${ghostBtn} mt-2`} onClick={() => setTopic("")}>Showing “{topic}” · clear</button> : null}
              </section>

              <section className={`${card} p-5`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className={kicker}>Who needs attention</p>
                  <div className="flex flex-wrap gap-1">
                    {FILTERS.map((filter) => (
                      <button key={filter.id} type="button" onClick={() => setFlags((current) => (current.includes(filter.id) ? current.filter((id) => id !== filter.id) : [...current, filter.id]))} className={`${chip} ${flags.includes(filter.id) ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-soft)] text-soft-ink"}`}>{filter.label}</button>
                    ))}
                  </div>
                </div>
                <div className="mt-2 grid gap-1.5">
                  {shown.map((entry) => (
                    <button key={entry.learner} type="button" className="grid gap-1 rounded-xl border border-ink/10 px-3 py-2 text-left hover:bg-[var(--surface-soft)]" onClick={() => { setLearner(entry.learner); setView("student"); }}>
                      <span className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold text-ink">{entry.learner || "Unassigned"}</span>
                        <span className="text-xs font-bold" style={{ color: statusOf(entry.mastery).colour }}>{entry.mastery}%</span>
                      </span>
                      <span className="flex flex-wrap gap-1">
                        {entry.flags.length ? entry.flags.map((flag) => <span key={flag.id} className={`${chip} bg-[rgba(255,59,48,0.1)] text-[var(--color-danger)]`}>{flag.label}</span>) : <span className={`${chip} bg-[#eaf7ef] text-[#1d7a44]`}>On track</span>}
                      </span>
                    </button>
                  ))}
                  {!shown.length ? <p className="m-0 text-sm text-soft-ink">Nobody matches those filters.</p> : null}
                </div>
              </section>
            </div>
          </div>
        </>
      ) : null}

      {view === "student" && current ? (
        <>
          <div className={`${card} flex flex-wrap items-center justify-between gap-3 p-5`}>
            <div>
              <p className={kicker}>{subjectName || "This space"}</p>
              <h3 className="m-0 mt-1 text-2xl font-bold tracking-tight text-ink">{current.learner || "Unassigned"}</h3>
              <p className="m-0 mt-1 text-sm text-soft-ink">Mastery {current.mastery}% · accuracy {percent(current.accuracy)} · {current.strongOrBetter} of {current.topicCount} topics at mastery · {current.questions} questions answered</p>
            </div>
            <select className="rounded-xl border border-ink/12 bg-white px-3 py-1.5 text-sm" value={current.learner} onChange={(event) => setLearner(event.target.value)}>
              {flagged.map((entry) => <option key={entry.learner} value={entry.learner}>{entry.learner || "Unassigned"}</option>)}
            </select>
          </div>

          <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <section className={`${card} p-5`}>
              <p className={kicker}>Topic by topic</p>
              <div className="mt-3"><MasteryMap topics={current.topics} /></div>
              <p className={`${kicker} mt-5`}>Where the mistakes come from</p>
              <div className="mt-2"><ErrorBreakdown analysis={analyseErrors(current.rows)} /></div>
            </section>
            <div className="grid gap-3">
              <section className={`${card} p-5`}>
                <p className={kicker}>Recommended intervention</p>
                <div className="mt-2"><NextActions actions={nextActions(current.topics, analyseErrors(current.rows).byTopic)} /></div>
              </section>
              <section className={`${card} p-5`}>
                <p className={kicker}>Mastery over time</p>
                <div className="mt-2"><MasteryTrend points={masteryOverTime(current.rows)} /></div>
                <p className="m-0 mt-2 text-[11px] text-soft-ink">Retention {retentionOf(current.topics).value === null ? "not measurable yet" : percent(retentionOf(current.topics).value)} · flags: {current.flags.map((flag) => flag.label).join(", ") || "none"}</p>
              </section>
              {onOpenLearner ? <button type="button" className={ghostBtn} onClick={() => onOpenLearner(current.learner)}>Open their activities</button> : null}
            </div>
          </div>
        </>
      ) : null}

      {view === "across" ? (
        <section className={`${card} p-5`}>
          <p className={kicker}>Students × subjects</p>
          <p className="m-0 mt-1 text-xs text-soft-ink">A student weak in one column needs help with that subject; a student weak across the row needs something else entirely.</p>
          <div className="mt-3">
            <Heatmap
              columns={across.subjects}
              rows={across.rows.map((row) => ({ learner: row.learner, cells: row.cells }))}
              onCell={(row) => { setLearner(row.learner); setView("student"); }}
            />
          </div>
          <div className="mt-3 grid gap-1.5">
            {across.rows.map((row) => (
              <div key={row.learner} className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate text-ink">{row.learner || "Unassigned"}</span>
                <span className="text-[11px] text-soft-ink">overall</span>
                <span className="w-10 text-right font-bold" style={{ color: statusOf(row.overall).colour }}>{row.overall}%</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
