"use client";

import { useMemo, useState } from "react";
import { MASTERY_THRESHOLD, masteryOverTime, nextActions, overallMastery, retentionOf, statusOf, topicMastery } from "../mastery";
import { analyseErrors } from "../errors";
import { ClassTopicBars, ErrorBreakdown, Kpi, MasteryMap, MasteryTrend, NextActions, TypeChip, card, chip, kicker, percent, trendArrow, trendTone } from "./parts";

/**
 * The student's screen answers four questions in order: where am I, what am I good at, what do I
 * need to work on, and what should I do next. Mastery leads; practice and streaks are deliberately
 * at the bottom, so the screen never pushes "do more" ahead of "learn more".
 */
export function StudentDashboard({ evidence = [], streak = 0, onPractise }) {
  const [topic, setTopic] = useState("");
  const topics = useMemo(() => topicMastery(evidence), [evidence]);
  const overall = useMemo(() => overallMastery(topics), [topics]);
  const errors = useMemo(() => analyseErrors(evidence), [evidence]);
  const trend = useMemo(() => masteryOverTime(evidence), [evidence]);
  const retention = useMemo(() => retentionOf(topics), [topics]);
  const actions = useMemo(() => nextActions(topics, errors.byTopic), [topics, errors]);
  const selected = topics.find((entry) => entry.topic === topic) || null;
  const measured = trend.filter((point) => point.mastery !== null);
  const change = measured.length > 1 ? (measured[measured.length - 1].mastery - measured[0].mastery) / 100 : 0;
  const status = statusOf(overall.mastery);

  if (!evidence.length) {
    return <section className={`${card} p-6`}><p className="m-0 text-sm text-soft-ink">Nothing measured yet. Do an activity on Luna and this screen fills itself in: what you know, what you keep getting wrong and what to do next.</p></section>;
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi
          label="Overall mastery"
          value={`${overall.mastery}%`}
          tone="text-ink"
          hint={`${status.label}${measured.length > 1 ? ` · ${trendArrow(change)} ${Math.abs(Math.round(change * 100))} pts over ${measured.length} weeks` : ""}`}
          footer={<div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface-soft)]"><div className="h-full rounded-full" style={{ width: `${overall.mastery}%`, background: status.colour }} /></div>}
        />
        <Kpi label="Topics mastered" value={`${overall.strongOrBetter} / ${overall.topicCount}`} hint={`at or above ${MASTERY_THRESHOLD}% mastery`} />
        <Kpi label="Topics to improve" value={overall.toImprove} tone={overall.toImprove ? "text-[var(--color-warn)]" : "text-ink"} hint={overall.toImprove ? topics.slice(0, 2).map((entry) => entry.topic).join(", ") : "nothing lagging"} />
        <Kpi label="Accuracy" value={percent(overall.accuracy)} hint={`${overall.questions} questions answered`} />
        <Kpi label="Retention" value={retention.value === null ? "—" : percent(retention.value)} hint={retention.value === null ? "measured once a topic comes back after a week" : `across ${retention.topics} topic${retention.topics === 1 ? "" : "s"} revisited later`} />
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className={`${card} p-5`}>
          <p className={kicker}>What you know, topic by topic</p>
          <p className="m-0 mt-1 text-xs text-soft-ink">Mastery is not just the score: it weighs how recent the answers are, how hard the questions were, how much you have actually been asked, and whether it stuck after a gap.</p>
          <div className="mt-3"><MasteryMap topics={topics} selected={topic} onSelect={setTopic} /></div>

          {selected ? (
            <div className="mt-4 rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent-soft)]/30 p-4">
              <p className="m-0 flex flex-wrap items-baseline justify-between gap-2 text-sm font-bold text-ink">
                <span>{selected.topic}</span>
                <span className={trendTone(selected.trend)}>{trendArrow(selected.trend)} {Math.abs(Math.round(selected.trend * 100))} pts recently</span>
              </p>
              <p className="m-0 mt-1 text-[11px] text-soft-ink">
                Mastery {selected.mastery}% · accuracy {percent(selected.accuracy)} · recent {percent(selected.recentAccuracy)} · {selected.questions} questions
                {selected.retention !== null ? ` · retention ${percent(selected.retention)}` : ""}
                {selected.lastAt ? ` · last asked ${new Date(selected.lastAt).toLocaleDateString()}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(errors.byTopic.get(selected.topic) || []).map((type) => <span key={type.id} className={chip} style={{ background: `${type.colour}1f`, color: type.colour }}>{type.label} {Math.round(type.share * 100)}%</span>)}
              </div>
              {(errors.rows.filter((row) => row.topic === selected.topic).slice(0, 3)).map((row, index) => (
                <p key={index} className="m-0 mt-1.5 text-[11px] text-ink">✗ {row.prompt} <span className="text-soft-ink">→ {row.expected}</span> <TypeChip id={row.errorType} /></p>
              ))}
            </div>
          ) : null}

          <p className={`${kicker} mt-5`}>Why you are getting things wrong</p>
          <div className="mt-2"><ErrorBreakdown analysis={errors} /></div>
        </section>

        <div className="grid gap-3">
          <section className={`${card} p-5`}>
            <p className={kicker}>What to work on next</p>
            <div className="mt-2"><NextActions actions={actions} onOpen={onPractise} /></div>
          </section>

          <section className={`${card} p-5`}>
            <p className={kicker}>Mastery over time</p>
            <div className="mt-2"><MasteryTrend points={trend} /></div>
          </section>

          <section className={`${card} p-5`}>
            <p className={kicker}>Practice</p>
            <p className="m-0 mt-1 text-sm text-ink">{streak ? `${streak}-day streak` : "No streak yet"}</p>
            <p className="m-0 text-[11px] text-soft-ink">{overall.questions} questions answered in this selection. Doing more is not the goal — getting the weak topics up is.</p>
          </section>
        </div>
      </div>
    </div>
  );
}

/** The parent's screen: the same data, one level up, in plain words. */
export function ParentDashboard({ evidence = [], sessionsPerWeek = 0, learner = "" }) {
  const topics = useMemo(() => topicMastery(evidence), [evidence]);
  const overall = useMemo(() => overallMastery(topics), [topics]);
  const errors = useMemo(() => analyseErrors(evidence), [evidence]);
  const trend = useMemo(() => masteryOverTime(evidence), [evidence]);
  const measured = trend.filter((point) => point.mastery !== null);
  const change = measured.length > 1 ? measured[measured.length - 1].mastery - measured[0].mastery : 0;
  const direction = change > 4 ? "Improving" : change < -4 ? "Needs attention" : "Steady";
  const subjects = useMemo(() => {
    const map = new Map();
    for (const row of evidence) {
      const key = row.subject || "This space";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
    return [...map.entries()].map(([subject, rows]) => {
      const subjectTopics = topicMastery(rows);
      const summary = overallMastery(subjectTopics);
      const series = masteryOverTime(rows, 8).filter((point) => point.mastery !== null);
      return { subject, mastery: summary.mastery, trend: series.length > 1 ? (series[series.length - 1].mastery - series[0].mastery) / 100 : 0, questions: rows.length };
    }).sort((a, b) => b.mastery - a.mastery);
  }, [evidence]);

  if (!evidence.length) {
    return <section className={`${card} p-6`}><p className="m-0 text-sm text-soft-ink">Nothing to report yet — this fills in as soon as {learner || "your child"} does an activity on Luna.</p></section>;
  }

  const strong = topics.filter((topic) => topic.mastery >= MASTERY_THRESHOLD).slice(-3).reverse();
  const weak = topics.filter((topic) => topic.mastery < MASTERY_THRESHOLD).slice(0, 3);
  const best = subjects[0];

  return (
    <div className="grid gap-4">
      <section className={`${card} p-5`}>
        <p className={kicker}>What is happening</p>
        <p className="m-0 mt-2 max-w-3xl text-[15px] leading-relaxed text-ink">
          {learner ? `${learner}'s` : "Overall"} mastery is <strong>{overall.mastery}%</strong> and {change === 0 ? "has held steady" : change > 0 ? `has risen ${Math.round(change)} points` : `has slipped ${Math.abs(Math.round(change))} points`} over the last weeks.
          {strong.length ? ` The strongest areas are ${strong.map((topic) => topic.topic).join(" and ")}.` : ""}
          {weak.length ? ` ${weak.map((topic) => topic.topic).join(", ")} ${weak.length === 1 ? "remains the area" : "remain the areas"} to practise` : " Nothing is lagging"}
          {errors.total ? `, and most of the mistakes there are ${errors.types[0].label.toLowerCase()} — ${errors.types[0].blurb.toLowerCase().replace(/\.$/, "")}` : ""}.
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Overall progress" value={`${overall.mastery}%`} hint={`${change >= 0 ? "↑" : "↓"} ${Math.abs(Math.round(change))} points recently`} />
        <Kpi label="Strongest" value={strong[0]?.topic || "—"} hint={strong[0] ? `${strong[0].mastery}% mastery` : "not enough evidence yet"} />
        <Kpi label="Needs attention" value={weak[0]?.topic || "None"} tone={weak.length ? "text-[var(--color-warn)]" : "text-[#2f9e5b]"} hint={weak[0] ? `${weak[0].mastery}% mastery` : "everything at or above the threshold"} />
        <Kpi label="Trend" value={direction} tone={direction === "Improving" ? "text-[#2f9e5b]" : direction === "Needs attention" ? "text-[var(--color-danger)]" : "text-ink"} hint="based on mastery, not on time spent" />
        <Kpi label="Activity" value={`${sessionsPerWeek.toFixed(1)}/week`} hint={`${overall.questions} questions answered in this period`} />
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-2">
        <section className={`${card} p-5`}>
          <p className={kicker}>Mastery by subject</p>
          <div className="mt-2 grid gap-1.5">
            {subjects.map((subject) => (
              <div key={subject.subject} className="grid gap-1 rounded-xl px-3 py-2">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">{subject.subject}</span>
                  <span className="flex items-center gap-2 text-[11px]"><span className={trendTone(subject.trend)}>{trendArrow(subject.trend)}</span><span className="font-bold text-ink">{subject.mastery}%</span></span>
                </span>
                <span className="block h-2 overflow-hidden rounded-full bg-[var(--surface-soft)]"><span className="block h-full rounded-full" style={{ width: `${subject.mastery}%`, background: statusOf(subject.mastery).colour }} /></span>
              </div>
            ))}
          </div>
          <p className={`${kicker} mt-5`}>Progress over time</p>
          <div className="mt-2"><MasteryTrend points={trend} /></div>
        </section>

        <section className={`${card} p-5`}>
          <p className={kicker}>Strengths and weaknesses</p>
          <div className="mt-2 grid gap-3">
            <div>
              <p className="m-0 text-xs font-bold text-[#2f9e5b]">Strong</p>
              <p className="m-0 mt-0.5 text-sm text-ink">{strong.length ? strong.map((topic) => `${topic.topic} (${topic.mastery}%)`).join(" · ") : "Nothing above the threshold yet."}</p>
            </div>
            <div>
              <p className="m-0 text-xs font-bold text-[var(--color-warn)]">Developing</p>
              <p className="m-0 mt-0.5 text-sm text-ink">{topics.filter((topic) => topic.mastery >= 55 && topic.mastery < MASTERY_THRESHOLD).map((topic) => `${topic.topic} (${topic.mastery}%)`).join(" · ") || "—"}</p>
            </div>
            <div>
              <p className="m-0 text-xs font-bold text-[var(--color-danger)]">Needs attention</p>
              <p className="m-0 mt-0.5 text-sm text-ink">{weak.length ? weak.map((topic) => `${topic.topic} (${topic.mastery}%)`).join(" · ") : "—"}</p>
            </div>
          </div>
          <p className={`${kicker} mt-5`}>Where the mistakes come from</p>
          <div className="mt-2"><ErrorBreakdown analysis={errors} limit={3} /></div>
        </section>
      </div>
    </div>
  );
}
