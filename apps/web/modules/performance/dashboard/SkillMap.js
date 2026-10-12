"use client";

import { card, chip, ghostBtn, kicker } from "./parts";
import { skillLabel, familyOf } from "../../skills/taxonomy.js";

const VERDICT = {
  skill: { label: "Skill gap", tone: "bg-[#fff1e0] text-[#8a4a00]" },
  topic: { label: "Topic gap", tone: "bg-[#e8f2fd] text-[#0b5cad]" },
  both: { label: "Skill and topic", tone: "bg-[#fde8ea] text-[#a1000f]" },
  unclear: { label: "Not enough yet", tone: "bg-[var(--surface-soft)] text-soft-ink" }
};

const cellStyle = (cell) => {
  if (!cell) return { background: "var(--surface-soft)", color: "var(--soft-ink)" };
  const colour = cell.acc >= 0.8 ? "#34c759" : cell.acc >= 0.6 ? "#ff9f0a" : "#ff3b30";
  // Little evidence is drawn paler: one answer is not a pattern.
  const alpha = cell.asked >= 4 ? "33" : cell.asked >= 2 ? "22" : "14";
  return { background: `${colour}${alpha}`, color: cell.acc >= 0.8 ? "#1d7a44" : cell.acc >= 0.6 ? "#8a4a00" : "#a1000f" };
};

/**
 * Topic or skill? The grid of topics (content) against skills (what answering needs), the sentence it
 * adds up to, and what to do about each weak spot. A red column is a skill problem, a red row a topic problem.
 */
export function SkillMap({ diagnosis, onPrimer, onReteach, compact = false }) {
  if (!diagnosis || !diagnosis.rows) {
    return <p className="m-0 rounded-xl bg-[var(--surface-soft)] p-4 text-sm text-soft-ink">Once a few questions are answered, Luna can tell whether a mistake is about the topic or about a skill underneath it.</p>;
  }
  const { matrix, topics, weakSkills, headline } = diagnosis;
  const flagged = topics.filter((topic) => topic.verdict !== "ok");

  if (compact) {
    return (
      <div className="grid gap-2">
        <p className="m-0 text-sm font-semibold text-ink">{headline}</p>
        {weakSkills.slice(0, 2).map((skill) => (
          <div key={skill.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/10 px-3 py-2">
            <span className="min-w-0 text-sm text-ink"><strong>{skill.label}</strong>{skill.lifts.length ? <span className="text-soft-ink"> · affects {skill.lifts.slice(0, 2).join(", ")}{skill.lifts.length > 2 ? ` +${skill.lifts.length - 2}` : ""}</span> : null}</span>
            {onPrimer ? <button type="button" className={ghostBtn} onClick={() => onPrimer(skill)}>Refresh this skill</button> : null}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <p className="m-0 text-[15px] font-semibold leading-snug text-ink">{headline}</p>

      {matrix.topics.length && matrix.skills.length ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-soft-ink">
                <th className="sticky left-0 bg-white py-1.5 pr-3 font-semibold">Topic \ Skill</th>
                {matrix.skills.map((id) => <th key={id} className="px-1 py-1.5 text-center font-semibold" title={familyOf(id)?.label}>{skillLabel(id)}</th>)}
              </tr>
            </thead>
            <tbody>
              {matrix.topics.map((topic) => (
                <tr key={topic}>
                  <td className="sticky left-0 max-w-44 truncate bg-white py-1 pr-3 text-xs font-semibold text-ink">{topic}</td>
                  {matrix.skills.map((id) => {
                    const cell = matrix.cells[`${topic}|${id}`];
                    return (
                      <td key={id} className="p-0.5">
                        <div className="rounded-md px-1.5 py-1 text-center text-[11px] font-bold" style={cellStyle(cell)} title={cell ? `${topic} · ${skillLabel(id)}: ${cell.asked - cell.wrong} of ${cell.asked} right` : "No question needed this skill here"}>
                          {cell ? `${Math.round(cell.acc * 100)}` : "·"}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="m-0 mt-1 text-[10px] text-soft-ink">Percent right. A weak column is a skill problem, a weak row a topic problem. Paler cells have fewer answers.</p>
        </div>
      ) : null}

      {flagged.length ? (
        <div className="grid gap-2">
          <p className={kicker}>What each weak spot needs</p>
          {flagged.slice(0, 6).map((topic) => {
            const verdict = VERDICT[topic.verdict] || VERDICT.unclear;
            return (
              <div key={topic.topic} className="rounded-xl border border-ink/10 p-3">
                <p className="m-0 flex flex-wrap items-center gap-2 text-sm font-bold text-ink">{topic.topic}<span className={`${chip} ${verdict.tone}`}>{verdict.label}</span><span className="text-[11px] font-semibold text-soft-ink">{Math.round((topic.acc || 0) * 100)}% right · {topic.asked} answered</span></p>
                <p className="m-0 mt-1 text-xs text-soft-ink">{topic.reason}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(topic.verdict === "skill" || topic.verdict === "both") && topic.skills.slice(0, 2).map((id) => onPrimer ? <button key={id} type="button" className={ghostBtn} onClick={() => onPrimer(weakSkills.find((skill) => skill.id === id) || { id, label: skillLabel(id), lifts: [topic.topic] })}>Refresh {skillLabel(id).toLowerCase()}</button> : null)}
                  {(topic.verdict === "topic" || topic.verdict === "both") && onReteach ? <button type="button" className={ghostBtn} onClick={() => onReteach(topic)}>Re-teach this topic</button> : null}
                </div>
                {topic.verdict === "both" ? <p className="m-0 mt-1.5 text-[11px] text-soft-ink">Start with the skill, then the topic.</p> : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export { card };
