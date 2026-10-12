"use client";

import { Fragment, useMemo, useState } from "react";
import { ghostBtn } from "./parts";
import { cellOf, overviewColumns, topicGroups, topicSplit } from "../skillOverview.js";

const tone = (acc) => (acc >= 0.8 ? "#34c759" : acc >= 0.6 ? "#ff9f0a" : "#ff3b30");

const cellStyle = (cell) => {
  if (!cell) return { background: "var(--surface-soft)", color: "var(--soft-ink)" };
  // Little evidence is drawn paler: one answer is not a pattern.
  const alpha = cell.asked >= 4 ? "33" : cell.asked >= 2 ? "22" : "14";
  return { background: `${tone(cell.acc)}${alpha}`, color: cell.acc >= 0.8 ? "#1d7a44" : cell.acc >= 0.6 ? "#8a4a00" : "#a1000f" };
};

const pill = (active) => `rounded-full px-3 py-1 text-xs font-semibold transition ${active ? "bg-ink text-white" : "text-soft-ink hover:bg-[var(--surface-soft)]"}`;

function Percent({ cell, title, onInfo, infoLabel }) {
  return (
    <div className="flex items-center justify-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-bold" style={cellStyle(cell)} title={title}>
      <span>{cell ? Math.round(cell.acc * 100) : "·"}</span>
      {cell && onInfo ? (
        <button type="button" aria-label={infoLabel} onClick={onInfo} className="grid h-4 w-4 shrink-0 place-items-center rounded-full border border-current text-[9px] font-bold leading-none opacity-60 hover:opacity-100">i</button>
      ) : null}
    </div>
  );
}

/**
 * Skills against workspace and study plan. Skills are grouped by family on top (Quantitative, Reasoning…);
 * only the ones that matter show until "+" opens them all. Rows are a workspace's study plans, and the "i"
 * in a cell shows which topics of that plan the skill's questions came from. "By topic" is the advanced
 * table: workspace → study plan → topic, indented.
 */
export function SkillMatrix({ overview }) {
  const [view, setView] = useState("plans");
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState(null);

  const columns = useMemo(() => overviewColumns(overview?.rows || [], { expanded }), [overview, expanded]);
  const skills = columns.flatMap((group) => group.skills);
  const subjects = overview?.subjects || [];
  if (!subjects.length || !skills.length) return null;

  const detailRows = detail ? subjects.find((subject) => subject.id === detail.subjectId)?.plans.find((plan) => plan.id === detail.planId)?.rows : null;
  const split = detail && detailRows ? topicSplit(detailRows, detail.skillId) : [];
  const detailSkill = detail ? skills.find((skill) => skill.id === detail.skillId) : null;
  const detailSubject = detail ? subjects.find((subject) => subject.id === detail.subjectId) : null;
  const detailPlan = detailSubject?.plans.find((plan) => plan.id === detail?.planId);

  const cells = (rows, label, info) => skills.map((skill) => {
    const cell = cellOf(rows, skill.id);
    return (
      <td key={skill.id} className="p-0.5">
        <Percent cell={cell} title={cell ? `${label} · ${skill.label}: ${cell.asked - cell.wrong} of ${cell.asked} right` : "No question needed this skill here"} onInfo={info ? () => info(skill.id) : null} infoLabel={`Topics behind ${label}, ${skill.label}`} />
      </td>
    );
  });

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-full border border-ink/12 bg-white p-0.5" role="tablist" aria-label="Skills grid view">
          <button type="button" role="tab" aria-selected={view === "plans"} className={pill(view === "plans")} onClick={() => setView("plans")}>By study plan</button>
          <button type="button" role="tab" aria-selected={view === "topics"} className={pill(view === "topics")} onClick={() => setView("topics")}>By topic · advanced</button>
        </div>
        <button type="button" className={ghostBtn} aria-pressed={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? "− Fewer skills" : "+ All skills"}</button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-soft-ink">
              <th colSpan={view === "plans" ? 2 : 1} />
              {columns.map((group) => <th key={group.family.id} colSpan={group.skills.length} className="border-l border-ink/10 px-1 pb-1 pt-1.5 text-center text-[11px] font-bold tracking-[0.1em] text-ink">{group.family.label}</th>)}
            </tr>
            <tr className="text-left text-[10px] uppercase tracking-wider text-soft-ink">
              {view === "plans" ? (
                <>
                  <th className="sticky left-0 bg-white py-1.5 pr-3 font-semibold">Workspace</th>
                  <th className="py-1.5 pr-3 font-semibold">Study plan</th>
                </>
              ) : <th className="sticky left-0 bg-white py-1.5 pr-3 font-semibold">Workspace · plan · topic</th>}
              {columns.map((group) => group.skills.map((skill, index) => <th key={skill.id} className={`px-1 py-1.5 text-center font-semibold ${index === 0 ? "border-l border-ink/10" : ""}`}>{skill.label}</th>))}
            </tr>
          </thead>
          <tbody>
            {subjects.map((subject) => view === "plans" ? subject.plans.map((plan, index) => (
              <tr key={`${subject.id}|${plan.id}`} className={index === 0 ? "border-t border-ink/10" : ""}>
                {index === 0 ? <td rowSpan={subject.plans.length} className="sticky left-0 max-w-40 truncate bg-white py-1 pr-3 align-top text-xs font-bold text-ink">{subject.name}</td> : null}
                <td className="max-w-48 truncate py-1 pr-3 text-xs font-semibold text-ink">{plan.name}</td>
                {cells(plan.rows, `${subject.name} · ${plan.name}`, (skillId) => setDetail(detail?.planId === plan.id && detail?.subjectId === subject.id && detail?.skillId === skillId ? null : { subjectId: subject.id, planId: plan.id, skillId }))}
              </tr>
            )) : (
              <Fragment key={subject.id}>
                <tr className="border-t border-ink/10">
                  <td className="sticky left-0 max-w-56 truncate bg-white py-1 pr-3 text-xs font-bold text-ink">{subject.name}</td>
                  {cells(subject.rows, subject.name, null)}
                </tr>
                {subject.plans.map((plan) => (
                  <Fragment key={plan.id}>
                    <tr>
                      <td className="sticky left-0 max-w-56 truncate bg-white py-1 pl-4 pr-3 text-xs font-semibold text-ink">{plan.name}</td>
                      {cells(plan.rows, plan.name, null)}
                    </tr>
                    {topicGroups(plan.rows).map((group) => (
                      <tr key={group.topic}>
                        <td className="sticky left-0 max-w-56 truncate bg-white py-1 pl-8 pr-3 text-xs text-soft-ink">{group.topic}</td>
                        {cells(group.rows, group.topic, null)}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
        <p className="m-0 mt-1 text-[10px] text-soft-ink">Percent right. A weak column is a skill problem, a weak row a topic or plan problem. Paler cells have fewer answers.{view === "plans" ? " Tap the i in a cell to see which topics it comes from." : ""}</p>
      </div>

      {detail && detailSkill && detailPlan && view === "plans" ? (
        <div className="grid gap-2 rounded-xl border border-ink/10 bg-[var(--surface-soft)] p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="m-0 text-sm font-bold text-ink">{detailSubject.name} · {detailPlan.name} · {detailSkill.label}<span className="block text-xs font-normal text-soft-ink">The topics the questions that needed this skill came from.</span></p>
            <button type="button" className={ghostBtn} onClick={() => setDetail(null)}>Close</button>
          </div>
          {split.map((entry) => (
            <div key={entry.topic} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-2 text-xs">
              <span className="truncate font-semibold text-ink">{entry.topic}</span>
              <span className="h-2 overflow-hidden rounded-full bg-white"><span className="block h-full rounded-full" style={{ width: `${Math.max(4, Math.round(entry.share * 100))}%`, background: tone(entry.acc) }} /></span>
              <span className="whitespace-nowrap text-soft-ink">{entry.asked - entry.wrong} of {entry.asked} right · {Math.round(entry.share * 100)}% of its questions</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
