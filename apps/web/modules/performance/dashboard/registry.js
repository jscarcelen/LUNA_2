"use client";

import { MASTERY_THRESHOLD, statusOf } from "../mastery";
import { activityKindLabel } from "../metrics";
import { dueLabel } from "../../plans/plan";
import { ClassTopicBars, ErrorBreakdown, Heatmap, Kpi, MasteryMap, MasteryTrend, NextActions, TypeChip, chip, ghostBtn, percent, trendArrow, trendTone } from "./parts";
import { CoachPanel } from "./CoachPanel";

/**
 * Every panel the performance screen can show.
 *
 * A panel is a small, self-contained answer to one question, and it declares who it is for, how wide
 * it wants to be and which ways it can read. The screen itself only knows how to lay panels out in
 * the order a view puts them — which is what makes the dashboard arrangeable, and a saved
 * arrangement something that can be shared or sold.
 */

const tone = (value) => (value >= 0.8 ? "text-[#2f9e5b]" : value >= 0.5 ? "text-[#b25e00]" : "text-[var(--color-danger)]");
const ALL = ["student", "parent", "teacher"];

export const PANELS = [
  {
    id: "headline",
    title: "Where things stand",
    blurb: "Mastery, topics mastered, what needs work, accuracy and retention.",
    roles: ALL,
    size: "full",
    modes: ["value", "history"],
    render: ({ overall, topics, retention, trendChange, weeks }, mode) => (mode === "history"
      ? <MasteryTrend points={trendChange.points} />
      : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Kpi
            label="Overall mastery"
            value={`${overall.mastery}%`}
            hint={`${statusOf(overall.mastery).label}${weeks > 1 ? ` · ${trendArrow(trendChange.change)} ${Math.abs(Math.round(trendChange.change * 100))} pts over ${weeks} weeks` : ""}`}
            footer={<div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface-soft)]"><div className="h-full rounded-full" style={{ width: `${overall.mastery}%`, background: statusOf(overall.mastery).colour }} /></div>}
          />
          <Kpi label="Topics mastered" value={`${overall.strongOrBetter} / ${overall.topicCount}`} hint={`at or above ${MASTERY_THRESHOLD}% mastery`} />
          <Kpi label="Topics to improve" value={overall.toImprove} tone={overall.toImprove ? "text-[var(--color-warn)]" : "text-ink"} hint={overall.toImprove ? topics.slice(0, 2).map((entry) => entry.topic).join(", ") : "nothing lagging"} />
          <Kpi label="Accuracy" value={percent(overall.accuracy)} hint={`${overall.questions} questions answered`} />
          <Kpi label="Retention" value={retention.value === null ? "—" : percent(retention.value)} hint={retention.value === null ? "measured once a topic comes back after a week" : `across ${retention.topics} topic${retention.topics === 1 ? "" : "s"} revisited later`} />
        </div>
      ))
  },
  {
    id: "coach",
    title: "Luna's read",
    blurb: "The model reads the mistakes and says what to do about them.",
    roles: ALL,
    size: "half",
    modes: ["value"],
    render: (ctx) => (
      <CoachPanel
        role={ctx.role}
        learner={ctx.learner || ctx.profileName}
        topics={ctx.topics}
        errorTypes={ctx.errors.types}
        stuck={ctx.stuck}
        plan={ctx.planSummary}
        onPractise={(action) => ctx.onPractise?.(action)}
        onSchedule={(action) => ctx.onSchedule?.(action)}
      />
    )
  },
  {
    id: "mastery-map",
    title: "Topic by topic",
    blurb: "What is known and what is not, weighed by recency, difficulty, coverage and retention.",
    roles: ALL,
    size: "half",
    modes: ["value", "detail"],
    render: (ctx, mode) => (
      <>
        <MasteryMap topics={ctx.topics} selected={ctx.selectedTopic} onSelect={ctx.onSelectTopic} />
        {mode === "detail" && ctx.selected ? (
          <div className="mt-3 rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent-soft)]/30 p-4">
            <p className="m-0 flex flex-wrap items-baseline justify-between gap-2 text-sm font-bold text-ink">
              <span className="min-w-0 truncate">{ctx.selected.topic}</span>
              <span className={trendTone(ctx.selected.trend)}>{trendArrow(ctx.selected.trend)} {Math.abs(Math.round(ctx.selected.trend * 100))} pts recently</span>
            </p>
            <p className="m-0 mt-1 text-[11px] text-soft-ink">
              Mastery {ctx.selected.mastery}% · accuracy {percent(ctx.selected.accuracy)} · recent {percent(ctx.selected.recentAccuracy)} · {ctx.selected.questions} questions
              {ctx.selected.retention !== null && ctx.selected.retention !== undefined ? ` · retention ${percent(ctx.selected.retention)}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(ctx.errors.byTopic.get(ctx.selected.topic) || []).map((type) => <span key={type.id} className={chip} style={{ background: `${type.colour}1f`, color: type.ink || type.colour }}>{type.label} {Math.round(type.share * 100)}%</span>)}
            </div>
            {ctx.errors.rows.filter((row) => row.topic === ctx.selected.topic).slice(0, 3).map((row, index) => (
              <p key={index} className="m-0 mt-1.5 text-[11px] text-ink">✗ {row.prompt} <span className="text-soft-ink">→ {row.expected}</span> <TypeChip id={row.errorType} /></p>
            ))}
          </div>
        ) : null}
      </>
    )
  },
  {
    id: "next-actions",
    title: "What to work on next",
    blurb: "The lagging topics in order, each with the reason it is lagging.",
    roles: ALL,
    size: "half",
    modes: ["value"],
    render: (ctx) => <NextActions actions={ctx.actions} onOpen={ctx.onPractise} />
  },
  {
    id: "error-breakdown",
    title: "Why answers are wrong",
    blurb: "Careless slips, misread questions, missing prerequisites, real gaps — as shares of all mistakes.",
    roles: ALL,
    size: "half",
    modes: ["value", "detail"],
    render: (ctx, mode) => <ErrorBreakdown analysis={ctx.errors} limit={mode === "detail" ? 8 : 4} />
  },
  {
    id: "mastery-trend",
    title: "Mastery over time",
    blurb: "Whether it is going up.",
    roles: ALL,
    size: "half",
    modes: ["value"],
    render: (ctx) => <MasteryTrend points={ctx.trendChange.points} />
  },
  {
    id: "plan-progress",
    title: "This plan",
    blurb: "Whether the plan being tracked is on schedule, goal by goal.",
    roles: ALL,
    size: "full",
    modes: ["value", "detail"],
    render: (ctx, mode) => {
      if (!ctx.activePlan || !ctx.planStats) return <p className="m-0 rounded-xl bg-[var(--surface-soft)] p-4 text-sm text-soft-ink">Pick a study plan in the filters and this reads the results through it: whether its goals are met and whether the work is on schedule.</p>;
      const stats = ctx.planStats;
      return (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="m-0 text-sm text-soft-ink">
              {stats.deadline ? `${stats.deadline.title}: ${dueLabel(stats.deadline.date)}` : "No deadline"}
              {` · ${stats.done} of ${stats.total} steps done`}
              {stats.late.length ? ` · ${stats.late.length} late` : ""}
              {stats.average ? ` · averaging ${percent(stats.average)}` : ""}
            </p>
            <span className="flex items-center gap-3">
              <span className={`text-sm font-bold ${stats.late.length ? "text-[var(--color-danger)]" : "text-[#2f9e5b]"}`}>{stats.late.length ? "behind" : "on track"}</span>
              {stats.days !== null ? <span className="text-sm text-ink">{stats.days} days left</span> : null}
              <button type="button" className={ghostBtn} onClick={() => ctx.onOpenPage?.("plans")}>Open the plan</button>
            </span>
          </div>
          <div className="grid gap-1.5">
            {stats.goals.map((goal) => (
              <div key={goal.id} className="rounded-xl border border-ink/10 p-2.5">
                <p className="m-0 flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-ink"><span className="min-w-0 truncate">{goal.title}</span><span className={tone(goal.average || 0)}>{goal.done}/{goal.total} done{goal.average ? ` · ${percent(goal.average)}` : ""}</span></p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--surface-soft)]"><div className="h-full rounded-full" style={{ width: `${goal.total ? (goal.done / goal.total) * 100 : 0}%`, background: goal.met ? "#2f9e5b" : ctx.activePlan.plan.colour }} /></div>
                {mode === "detail" && (goal.concepts || []).length ? <p className="m-0 mt-1 text-[11px] text-soft-ink">{goal.concepts.slice(0, 6).join(" · ")}</p> : null}
              </div>
            ))}
            {!stats.goals.length ? <p className="m-0 text-sm text-soft-ink">This plan has no goals yet.</p> : null}
          </div>
          {mode === "detail" ? (
            <div>
              <p className="m-0 text-[11px] font-semibold uppercase tracking-wider text-soft-ink">Still to do</p>
              <div className="mt-1 grid gap-1">
                {stats.next.slice(0, 8).map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-sm">
                    <span className="min-w-0 flex-1 truncate text-ink">{item.title}</span>
                    <span className={`shrink-0 text-[11px] ${dueLabel(item.dueDate).includes("late") ? "text-[var(--color-danger)]" : "text-soft-ink"}`}>{dueLabel(item.dueDate)}</span>
                  </div>
                ))}
                {!stats.next.length ? <p className="m-0 text-sm text-[#2f9e5b]">Everything in this plan is done.</p> : null}
              </div>
            </div>
          ) : null}
        </div>
      );
    }
  },
  {
    id: "parent-summary",
    title: "What is happening",
    blurb: "The whole picture in a paragraph, in plain words.",
    roles: ["parent", "teacher"],
    size: "full",
    modes: ["value"],
    render: ({ overall, topics, errors, trendChange, learner, sessionsPerWeek }) => {
      const change = Math.round(trendChange.change * 100);
      const strong = topics.filter((topic) => topic.mastery >= MASTERY_THRESHOLD).slice(-3).reverse();
      const weak = topics.filter((topic) => topic.mastery < MASTERY_THRESHOLD).slice(0, 3);
      return (
        <div className="grid gap-3">
          <p className="m-0 max-w-3xl text-[15px] leading-relaxed text-ink">
            {learner ? `${learner}'s` : "Overall"} mastery is <strong>{overall.mastery}%</strong> and {change === 0 ? "has held steady" : change > 0 ? `has risen ${change} points` : `has slipped ${Math.abs(change)} points`} over the last weeks.
            {strong.length ? ` The strongest areas are ${strong.map((topic) => topic.topic).join(" and ")}.` : ""}
            {weak.length ? ` ${weak.map((topic) => topic.topic).join(", ")} ${weak.length === 1 ? "remains the area" : "remain the areas"} to practise` : " Nothing is lagging"}
            {errors.total ? `, and most of the mistakes there are ${errors.types[0].label.toLowerCase()} — ${errors.types[0].blurb.toLowerCase().replace(/\.$/, "")}` : ""}.
          </p>
          <p className="m-0 text-[11px] text-soft-ink">{overall.questions} questions answered · {sessionsPerWeek.toFixed(1)} sessions a week in this period.</p>
        </div>
      );
    }
  },
  {
    id: "subjects",
    title: "Mastery by subject",
    blurb: "One bar per plan or subject, strongest first.",
    roles: ALL,
    size: "half",
    modes: ["value"],
    render: ({ subjects }) => (subjects.length ? (
      <div className="grid gap-1.5">
        {subjects.map((subject) => (
          <div key={subject.subject} className="grid gap-1 rounded-xl px-1 py-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-sm font-semibold text-ink">{subject.subject}</span>
              <span className="flex shrink-0 items-center gap-2 text-[11px]"><span className={trendTone(subject.trend)}>{trendArrow(subject.trend)}</span><span className="font-bold text-ink">{subject.mastery}%</span></span>
            </span>
            <span className="block h-2 overflow-hidden rounded-full bg-[var(--surface-soft)]"><span className="block h-full rounded-full" style={{ width: `${subject.mastery}%`, background: statusOf(subject.mastery).colour }} /></span>
          </div>
        ))}
      </div>
    ) : <p className="m-0 rounded-xl bg-[var(--surface-soft)] p-4 text-sm text-soft-ink">Nothing measured yet.</p>)
  },
  {
    id: "habit",
    title: "Habit",
    blurb: "Streak and how often work happens — context, never the point.",
    roles: ALL,
    size: "half",
    modes: ["value"],
    render: ({ streak, sessionsPerWeek, overall, rhythm }) => (
      <div className="grid gap-2">
        <p className="m-0 text-2xl font-bold text-ink">{streak ? `${streak}-day streak` : "No streak"}</p>
        <p className="m-0 text-[11px] text-soft-ink">{sessionsPerWeek.toFixed(1)} sessions a week · {overall.questions} questions in this selection. Doing more is not the goal — getting the weak topics up is.</p>
        <div className="flex h-12 items-end gap-[3px]">
          {rhythm.map((day) => (
            <div key={day.date} className="flex-1" title={`${day.date}: ${day.attempts} activities · ${day.minutes} min`}>
              <div className="w-full rounded-t-[2px]" style={{ height: `${Math.min(100, (day.minutes / 60) * 100)}%`, minHeight: day.attempts ? 3 : 0, background: day.average === null ? "#d2d2d7" : day.average >= 0.8 ? "#34c759" : day.average >= 0.5 ? "#ff9f0a" : "#ff3b30" }} />
            </div>
          ))}
        </div>
      </div>
    )
  },
  {
    id: "class-heatmap",
    title: "Class × topic",
    blurb: "Green is mastery, red is trouble. A red column is the teaching, not the student.",
    roles: ["teacher"],
    size: "full",
    modes: ["value"],
    render: (ctx) => <Heatmap columns={ctx.matrix.topics} rows={ctx.matrix.rows} onCell={(row) => ctx.onPickLearner?.(row.learner)} />
  },
  {
    id: "class-topics",
    title: "How much of the class has each topic",
    blurb: "The share of students at mastery, topic by topic.",
    roles: ["teacher"],
    size: "half",
    modes: ["value"],
    render: (ctx) => <ClassTopicBars rows={ctx.coverage} onPick={ctx.onSelectTopic} />
  },
  {
    id: "attention",
    title: "Who needs attention",
    blurb: "Flagged by mastery, trend, kind of mistake and retention.",
    roles: ["teacher", "parent"],
    size: "half",
    modes: ["value"],
    render: (ctx) => (
      <div className="grid gap-1.5">
        {ctx.flagged.map((entry) => (
          <button key={entry.learner} type="button" className="grid gap-1 rounded-xl border border-ink/10 px-3 py-2 text-left hover:bg-[var(--surface-soft)]" onClick={() => ctx.onPickLearner?.(entry.learner)}>
            <span className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-sm font-semibold text-ink">{entry.learner || "Unassigned"}</span>
              <span className="shrink-0 text-xs font-bold" style={{ color: statusOf(entry.mastery).ink }}>{entry.mastery}%</span>
            </span>
            <span className="flex flex-wrap gap-1">
              {entry.flags.length ? entry.flags.map((flag) => <span key={flag.id} className={`${chip} bg-[rgba(255,59,48,0.1)] text-[var(--color-danger)]`}>{flag.label}</span>) : <span className={`${chip} bg-[#eaf7ef] text-[#1d7a44]`}>On track</span>}
            </span>
          </button>
        ))}
        {!ctx.flagged.length ? <p className="m-0 rounded-xl bg-[var(--surface-soft)] p-4 text-sm text-soft-ink">Nobody to show — add students, or nothing matches the filters.</p> : null}
      </div>
    )
  },
  {
    id: "across-subjects",
    title: "Students × subjects",
    blurb: "Weak in one column means that subject; weak across the row means something else.",
    roles: ["teacher", "parent"],
    size: "full",
    modes: ["value"],
    render: (ctx) => <Heatmap columns={ctx.across.subjects} rows={ctx.across.rows} onCell={(row) => ctx.onPickLearner?.(row.learner)} firstColumnLabel="Student" />
  },
  {
    id: "timeline",
    title: "Activity over time",
    blurb: "How much was done each day, coloured by score.",
    roles: ALL,
    size: "half",
    modes: ["value"],
    render: ({ days }) => (
      <>
        <div className="flex h-24 items-end gap-[3px]">
          {days.map((day) => (
            <div key={day.date} className="flex-1" title={`${day.date}: ${day.count} activities${day.score === null ? "" : ` · ${percent(day.score)}`}`}>
              <div className="w-full rounded-t-[2px]" style={{ height: `${(day.count / Math.max(1, ...days.map((entry) => entry.count))) * 100}%`, minHeight: day.count ? 3 : 0, background: day.score === null ? "#d2d2d7" : day.score >= 0.8 ? "#34c759" : day.score >= 0.5 ? "#ff9f0a" : "#ff3b30" }} />
            </div>
          ))}
        </div>
        <p className="m-0 mt-2 text-[11px] text-soft-ink">Bar height = activities that day · colour = average score.</p>
      </>
    )
  },
  {
    id: "by-resource",
    title: "By resource",
    blurb: "Which material was done, how often, and whether repeating it helped.",
    roles: ALL,
    size: "half",
    modes: ["value"],
    render: ({ rows }) => (
      <div className="grid gap-1">
        {rows.slice(0, 12).map((row) => (
          <div key={row.key} className="flex items-center gap-2 rounded-xl px-2 py-1 text-sm">
            <span className="min-w-0 flex-1 truncate text-ink">{row.name}</span>
            <span className="shrink-0 text-[11px] text-soft-ink">{row.times}× · {row.errors} wrong</span>
            <span className={`w-12 shrink-0 text-right font-semibold ${tone(row.best)}`}>{percent(row.best)}</span>
          </div>
        ))}
        {!rows.length ? <p className="m-0 rounded-xl bg-[var(--surface-soft)] p-4 text-sm text-soft-ink">Nothing done yet.</p> : null}
      </div>
    )
  },
  {
    id: "stuck",
    title: "Questions that keep going wrong",
    blurb: "The same question missed more than once — the shortest route to a real gap.",
    roles: ALL,
    size: "half",
    modes: ["value"],
    render: ({ stuck }) => (
      <div className="grid gap-1.5">
        {stuck.slice(0, 6).map((entry, index) => (
          <div key={index} className="rounded-xl border border-ink/10 p-2.5">
            <p className="m-0 text-sm text-ink">✗ {entry.prompt}</p>
            <p className="m-0 mt-1 text-[11px] text-soft-ink">Wrong {entry.times}×{entry.topic ? ` · ${entry.topic}` : ""} · answer: <span className="text-ink">{entry.expected}</span></p>
          </div>
        ))}
        {!stuck.length ? <p className="m-0 rounded-xl bg-[#eaf7ef] p-4 text-sm text-[#1d7a44]">Nothing is being missed repeatedly.</p> : null}
      </div>
    )
  },
  {
    id: "skills",
    title: "What the mistakes are about",
    blurb: "Per skill: how much was asked and how much went wrong.",
    roles: ALL,
    size: "half",
    modes: ["value"],
    render: ({ skills }) => (
      <div className="grid gap-1">
        {skills.map((entry) => (
          <div key={entry.skill} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-ink">{entry.skill}</span>
            <span className="shrink-0 text-[11px] text-soft-ink">{entry.asked} q</span>
            <span className={`w-24 shrink-0 text-right text-[11px] font-semibold ${entry.rate > 0.4 ? "text-[var(--color-danger)]" : entry.rate > 0.15 ? "text-[#b25e00]" : "text-[#2f9e5b]"}`}>{entry.errors} wrong · {percent(entry.rate)}</span>
          </div>
        ))}
        {!skills.length ? <p className="m-0 rounded-xl bg-[var(--surface-soft)] p-4 text-sm text-soft-ink">Classify a resource's questions to see this.</p> : null}
      </div>
    )
  },
  {
    id: "difficulty",
    title: "By difficulty",
    blurb: "How the score holds up as the questions get harder.",
    roles: ALL,
    size: "half",
    modes: ["value"],
    render: ({ difficulties }) => (
      <div className="grid gap-1">
        {difficulties.map((entry) => (
          <div key={entry.difficulty} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate capitalize text-ink">{entry.difficulty}</span>
            <span className="shrink-0 text-[11px] text-soft-ink">{entry.asked} q</span>
            <span className={`w-14 shrink-0 text-right text-[11px] font-semibold ${tone(1 - entry.rate)}`}>{percent(1 - entry.rate)}</span>
          </div>
        ))}
        {!difficulties.length ? <p className="m-0 rounded-xl bg-[var(--surface-soft)] p-4 text-sm text-soft-ink">No difficulty ratings yet.</p> : null}
      </div>
    )
  },
  {
    id: "pace",
    title: "Time per question",
    blurb: "How long each kind of activity takes — useful for exam pacing.",
    roles: ALL,
    size: "half",
    modes: ["value"],
    render: ({ times, examMinutes }) => (
      <div className="grid gap-1">
        {times.map((entry) => (
          <div key={entry.kind} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-ink">{activityKindLabel(entry.kind)}</span>
            <span className="shrink-0 text-[11px] text-soft-ink">{entry.count} answered</span>
            <span className="w-14 shrink-0 text-right font-semibold text-ink">{entry.seconds}s</span>
          </div>
        ))}
        {examMinutes ? <p className="m-0 mt-1 text-[11px] text-soft-ink">At this pace a 20-question exam takes about {examMinutes} minutes.</p> : null}
        {!times.length ? <p className="m-0 rounded-xl bg-[var(--surface-soft)] p-4 text-sm text-soft-ink">Timing is recorded from now on.</p> : null}
      </div>
    )
  },
  {
    id: "concepts",
    title: "Concepts",
    blurb: "What the material says it teaches, scored across everything that touched it.",
    roles: ALL,
    size: "half",
    modes: ["value"],
    render: ({ concepts }) => (
      <div className="grid gap-1">
        {concepts.slice(0, 10).map((concept) => (
          <div key={concept.concept} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-ink">{concept.mastered ? "✓ " : ""}{concept.concept}</span>
            <span className="shrink-0 text-[11px] text-soft-ink">{concept.attempts} attempt{concept.attempts === 1 ? "" : "s"}</span>
            <span className={`w-12 shrink-0 text-right font-semibold ${tone(concept.average)}`}>{percent(concept.average)}</span>
          </div>
        ))}
        {!concepts.length ? <p className="m-0 rounded-xl bg-[var(--surface-soft)] p-4 text-sm text-soft-ink">Let Luna list what a resource teaches to see this.</p> : null}
      </div>
    )
  },
  {
    id: "goals",
    title: "Dates and goals",
    blurb: "Exams and deadlines, and whether the work that prepares for them is done.",
    roles: ALL,
    size: "half",
    modes: ["value"],
    render: (ctx) => ctx.renderGoals()
  }
];

export const panelById = (id) => PANELS.find((panel) => panel.id === id) || null;

/** The panels one profile may use. */
export const panelsForRole = (role) => PANELS.filter((panel) => panel.roles.includes(role));
