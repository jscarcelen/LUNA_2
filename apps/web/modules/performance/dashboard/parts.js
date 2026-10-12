"use client";

import { useState } from "react";
import { MASTERY_THRESHOLD, RECOVERY_GAP_DAYS, statusOf } from "../mastery";
import { typeOf } from "../errors";

export const card = "rounded-[18px] border border-ink/8 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)]";
export const kicker = "m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink";
export const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-[var(--surface-soft)]";
export const chip = "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold";

/** What each headline number means and how it is computed: shown behind the "i" so the maths is never hidden. */
export const METRIC_INFO = {
  mastery: {
    meaning: "How well you could answer questions on your topics today. It is not the same as accuracy: it also weighs difficulty, recency and how much evidence there is.",
    formula: [
      "topic mastery = min( blend × difficulty, coverage cap ) × freshness",
      "blend = 0.65 × recent accuracy + 0.35 × overall accuracy",
      "difficulty = 0.85 + 0.15 × average difficulty (easy 0.8, medium 1, hard 1.25)",
      "coverage cap = 0.45 + 0.55 × min(1, questions ÷ 10)",
      "overall mastery = average of topic mastery, weighted by questions answered"
    ]
  },
  topicsMastered: {
    meaning: "How many of your topics are at or above the mastery threshold.",
    formula: `topics mastered = topics with mastery ≥ ${MASTERY_THRESHOLD}%  ·  shown as mastered ÷ all measured topics`
  },
  topicsToImprove: {
    meaning: "How many topics are below the mastery threshold, weakest first.",
    formula: `topics to improve = topics with mastery < ${MASTERY_THRESHOLD}%`
  },
  accuracy: {
    meaning: "The share of the questions you answered that were right. A nearly-right written answer earns part of a point.",
    formula: [
      "accuracy = credit earned ÷ questions answered",
      "credit: right = 1, close = the grader's score (0.5 unless stated), wrong = 0"
    ]
  },
  retention: {
    meaning: "Whether mistakes get fixed. Of the topics where you made mistakes, how many improved in the following weeks.",
    formula: [
      `follow-up = answers given ${RECOVERY_GAP_DAYS}+ days after the topic's first mistake (a mistake is an answer that earned under half a point)`,
      "a topic is measured once its follow-up has 2+ answers",
      "improved = follow-up accuracy is higher than the accuracy before it",
      "retention = improved topics ÷ measured topics"
    ]
  },
  topicAccuracy: {
    meaning: "For each topic, the share of your answers that were right, next to the mastery Luna estimates from them.",
    formula: "topic accuracy = correct answers ÷ answers attempted on that topic"
  }
};

export const percent = (value) => `${Math.round((value || 0) * 100)}%`;
export const trendArrow = (value) => (value > 0.04 ? "↑" : value < -0.04 ? "↓" : "→");
export const trendTone = (value) => (value > 0.04 ? "text-[#2f9e5b]" : value < -0.04 ? "text-[var(--color-danger)]" : "text-soft-ink");

/**
 * The "i" next to a metric: click it to read what the number means and exactly how it is calculated, so
 * nothing on the screen is a black box. `info` is { meaning, formula } (formula may be a string or a list of lines).
 */
export function InfoDot({ info, label = "this metric" }) {
  const [open, setOpen] = useState(false);
  if (!info) return null;
  const lines = Array.isArray(info.formula) ? info.formula : info.formula ? [info.formula] : [];
  return (
    <span className="relative inline-flex normal-case tracking-normal">
      <button
        type="button"
        aria-label={`What is ${label}?`}
        aria-expanded={open}
        onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }}
        className="grid size-4 shrink-0 place-items-center rounded-full border border-ink/25 text-[10px] font-bold italic leading-none text-soft-ink transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
      >i</button>
      {open ? (
        <span role="dialog" aria-label={`About ${label}`} className="absolute left-0 top-6 z-30 grid w-72 max-w-[80vw] gap-2 rounded-2xl border border-ink/10 bg-white p-3 text-left text-xs font-normal text-ink shadow-[0_12px_32px_rgba(0,0,0,0.16)]">
          <span className="block">{info.meaning}</span>
          {lines.length ? <span className="grid gap-1"><span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-soft-ink">How it is calculated</span>{lines.map((line) => <code key={line} className="block whitespace-pre-wrap rounded-lg bg-[var(--surface-soft)] px-2 py-1 text-[11px] leading-snug text-ink">{line}</code>)}</span> : null}
          <button type="button" className="justify-self-end text-[11px] font-semibold text-[var(--accent-ink)] hover:underline" onClick={(event) => { event.stopPropagation(); setOpen(false); }}>Close</button>
        </span>
      ) : null}
    </span>
  );
}

/** One headline number. `tone` carries the judgement so every screen reads the same way. */
export function Kpi({ label, value, hint, tone = "text-ink", footer, info }) {
  return (
    <div className={`${card} p-4`}>
      <p className={`${kicker} flex items-center gap-1.5`}>{label}<InfoDot info={info} label={label} /></p>
      <p className={`m-0 mt-1 text-2xl font-bold ${tone}`}>{value}</p>
      {hint ? <p className="m-0 text-[11px] text-soft-ink">{hint}</p> : null}
      {footer || null}
    </div>
  );
}

/** The topic mastery map: the centrepiece of the student's screen and of the teacher's per-student view. */
export function MasteryMap({ topics = [], onSelect, selected = "", emptyText = "Nothing measured yet." }) {
  if (!topics.length) return <p className="m-0 rounded-xl bg-[var(--surface-soft)] p-4 text-sm text-soft-ink">{emptyText}</p>;
  return (
    <div className="grid gap-1.5">
      {[...topics].sort((a, b) => b.mastery - a.mastery).map((topic) => {
        const status = topic.status || statusOf(topic.mastery);
        return (
          <button
            key={topic.topic}
            type="button"
            onClick={() => onSelect?.(topic.topic === selected ? "" : topic.topic)}
            className={`grid w-full gap-1 rounded-xl px-3 py-2 text-left transition ${selected === topic.topic ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-soft)]"}`}
          >
            <span className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-ink">{topic.topic}</span>
              <span className="flex items-center gap-2 text-[11px]">
                <span className={trendTone(topic.trend)}>{trendArrow(topic.trend)}</span>
                <span style={{ color: status.ink || status.colour }} className="font-semibold">{status.label}</span>
                <span className="w-9 text-right font-bold text-ink">{topic.mastery}%</span>
              </span>
            </span>
            <span className="block h-2 overflow-hidden rounded-full bg-[var(--surface-soft)]">
              <span className="block h-full rounded-full" style={{ width: `${topic.mastery}%`, background: status.colour }} />
            </span>
            <span className="text-[10.5px] text-soft-ink">
              {topic.questions} question{topic.questions === 1 ? "" : "s"} · accuracy {percent(topic.accuracy)}
              {topic.retention !== null && topic.retention !== undefined ? ` · retention ${percent(topic.retention)}` : ""}
              {topic.coverage < 0.4 ? " · thin evidence" : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Why answers are wrong, as shares of all the mistakes. */
export function ErrorBreakdown({ analysis, onPick, limit = 5 }) {
  if (!analysis?.total) return <p className="m-0 rounded-xl bg-[var(--surface-soft)] p-4 text-sm text-soft-ink">No mistakes recorded yet.</p>;
  return (
    <div className="grid gap-2">
      {analysis.types.slice(0, limit).map((type) => (
        <div key={type.id} className="rounded-xl border border-ink/10 p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="m-0 text-sm font-bold text-ink">{type.label}</p>
            <p className="m-0 text-xs font-semibold" style={{ color: type.ink || type.colour }}>{Math.round(type.share * 100)}% of mistakes · {type.count}</p>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--surface-soft)]"><div className="h-full rounded-full" style={{ width: `${type.share * 100}%`, background: type.colour }} /></div>
          <p className="m-0 mt-1 text-[11px] text-soft-ink">{type.blurb} {type.advice}</p>
          {type.examples?.slice(0, 1).map((example, index) => (
            <p key={index} className="m-0 mt-1 truncate text-[11px] text-ink" title={example.prompt} onClick={() => onPick?.(example)}>✗ {example.prompt} <span className="text-soft-ink">→ {example.expected}</span></p>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Mastery over time — the "am I improving?" line. */
export function MasteryTrend({ points = [], height = 88 }) {
  const measured = points.filter((point) => point.mastery !== null);
  if (measured.length < 2) return <p className="m-0 rounded-xl bg-[var(--surface-soft)] p-4 text-sm text-soft-ink">A few more weeks of activity and the trend appears here.</p>;
  const max = 100;
  const step = 100 / Math.max(1, points.length - 1);
  const path = points.map((point, index) => (point.mastery === null ? null : `${index * step},${height - (point.mastery / max) * height}`)).filter(Boolean).join(" L ");
  const first = measured[0].mastery;
  const last = measured[measured.length - 1].mastery;
  return (
    <div>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="h-24 w-full" aria-hidden>
        <line x1="0" y1={height - (MASTERY_THRESHOLD / max) * height} x2="100" y2={height - (MASTERY_THRESHOLD / max) * height} stroke="#d2d2d7" strokeWidth="0.5" strokeDasharray="2 2" />
        <path d={`M ${path}`} fill="none" stroke="var(--accent)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="m-0 mt-1 text-[11px] text-soft-ink">
        {first}% → <span className="font-semibold text-ink">{last}%</span> over {measured.length} weeks · dotted line = mastery threshold ({MASTERY_THRESHOLD}%)
      </p>
    </div>
  );
}

/** What to do next — the screen's point, not an afterthought. */
export function NextActions({ actions = [], onOpen }) {
  if (!actions.length) return <p className="m-0 rounded-xl bg-[#eaf7ef] p-4 text-sm text-[#1d7a44]">Nothing is lagging. Keep going.</p>;
  return (
    <ol className="m-0 grid list-none gap-2 p-0">
      {actions.map((action, index) => (
        <li key={action.topic} className="rounded-xl border border-ink/10 p-3">
          <p className="m-0 flex flex-wrap items-baseline justify-between gap-2 text-sm font-bold text-ink">
            <span>{index + 1}. {action.topic}</span>
            <span className="text-xs font-semibold" style={{ color: statusOf(action.mastery).ink }}>{action.mastery}% mastery</span>
          </p>
          <p className="m-0 mt-1 text-[11px] text-soft-ink">Main issue: {action.reason}. {action.advice}</p>
          {onOpen ? <button type="button" className={`${ghostBtn} mt-2`} onClick={() => onOpen(action)}>Practise {action.questions} questions</button> : null}
        </li>
      ))}
    </ol>
  );
}

/** A grid of mastery cells — class × topic, or learner × subject. */
export function Heatmap({ columns = [], rows = [], onCell, firstColumnLabel = "Student" }) {
  if (!rows.length || !columns.length) return <p className="m-0 rounded-xl bg-[var(--surface-soft)] p-4 text-sm text-soft-ink">Not enough activity yet to compare.</p>;
  const cell = (value) => {
    if (value === null || value === undefined) return { background: "var(--surface-soft)", color: "var(--soft-ink)" };
    const status = statusOf(value);
    return { background: `${status.colour}22`, color: status.ink || status.colour };
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-soft-ink">
            <th className="sticky left-0 bg-white py-1.5 pr-3 font-semibold">{firstColumnLabel}</th>
            {columns.map((column) => <th key={column} className="px-1.5 py-1.5 text-center font-semibold">{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.learner}>
              <td className="sticky left-0 max-w-40 truncate bg-white py-1 pr-3 text-xs font-semibold text-ink">{row.learner || "Unassigned"}</td>
              {row.cells.map((entry) => (
                <td key={entry.topic || entry.subject} className="p-0.5">
                  <button
                    type="button"
                    onClick={() => onCell?.(row, entry)}
                    className="w-full rounded-md px-1.5 py-1 text-center text-[11px] font-bold"
                    style={cell(entry.mastery)}
                    title={`${row.learner || "Unassigned"} · ${entry.topic || entry.subject}: ${entry.mastery === null ? "no evidence" : `${entry.mastery}%`}`}
                  >
                    {entry.mastery === null ? "–" : entry.mastery}
                  </button>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** How much of the class has reached the threshold on each topic. */
export function ClassTopicBars({ rows = [], onPick }) {
  if (!rows.length) return <p className="m-0 rounded-xl bg-[var(--surface-soft)] p-4 text-sm text-soft-ink">No topics measured yet.</p>;
  return (
    <div className="grid gap-1.5">
      {rows.map((row) => (
        <button key={row.topic} type="button" onClick={() => onPick?.(row.topic)} className="grid gap-1 rounded-xl px-3 py-2 text-left hover:bg-[var(--surface-soft)]">
          <span className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-ink">{row.topic}</span>
            <span className="text-[11px] text-soft-ink">{row.mastered} of {row.learners} at mastery · class {row.classMastery}%</span>
          </span>
          <span className="block h-2 overflow-hidden rounded-full bg-[var(--surface-soft)]">
            <span className="block h-full rounded-full" style={{ width: `${row.share * 100}%`, background: statusOf(row.share * 100).colour }} />
          </span>
        </button>
      ))}
    </div>
  );
}

export function TypeChip({ id }) {
  const type = typeOf(id);
  return <span className={chip} style={{ background: `${type.colour}1f`, color: type.ink || type.colour }}>{type.label}</span>;
}
