"use client";

import { AiGuidanceNote, card, chip, ghostBtn, kicker } from "./parts";
import { skillLabel } from "../../skills/taxonomy.js";
import { SkillMatrix } from "./SkillMatrix";
import { useT } from "../../../lib/i18n/LocaleProvider.js";

const VERDICT = {
  skill: { label: "Skill gap", tone: "bg-[#fff1e0] text-[#8a4a00]" },
  topic: { label: "Topic gap", tone: "bg-[#e8f2fd] text-[#0b5cad]" },
  both: { label: "Skill and topic", tone: "bg-[#fde8ea] text-[#a1000f]" },
  unclear: { label: "Not enough yet", tone: "bg-[var(--surface-soft)] text-soft-ink" }
};

/**
 * Topic or skill? The grid of workspaces and study plans (content) against skills (what answering needs), the
 * sentence it adds up to, and what to do about each weak spot. A red column is a skill problem, a red row a topic or plan problem.
 */
export function SkillMap({ diagnosis, overview = null, onPrimer, onReteach, compact = false }) {
  const t = useT();
  if (!diagnosis || !diagnosis.rows) {
    return <p className="m-0 rounded-xl bg-[var(--surface-soft)] p-4 text-sm text-soft-ink">{t("progress.sm.empty")}</p>;
  }
  const { topics, weakSkills, headline } = diagnosis;
  const flagged = topics.filter((topic) => topic.verdict !== "ok");

  if (compact) {
    return (
      <div className="grid gap-2">
        <p className="m-0 text-sm font-semibold text-ink">{headline}</p>
        {weakSkills.slice(0, 2).map((skill) => (
          <div key={skill.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/10 px-3 py-2">
            <span className="min-w-0 text-sm text-ink"><strong>{skill.label}</strong>{skill.lifts.length ? <span className="text-soft-ink"> · {t("progress.sm.affects", { topics: skill.lifts.slice(0, 2).join(", ") })}{skill.lifts.length > 2 ? ` +${skill.lifts.length - 2}` : ""}</span> : null}</span>
            {onPrimer ? <button type="button" className={ghostBtn} onClick={() => onPrimer(skill)}>{t("progress.sm.refreshThis")}</button> : null}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <p className="m-0 text-[15px] font-semibold leading-snug text-ink">{headline}</p>
      <AiGuidanceNote />

      {overview?.subjects?.length ? <SkillMatrix overview={overview} /> : null}

      {flagged.length ? (
        <div className="grid gap-2">
          <p className={kicker}>{t("progress.sm.needs")}</p>
          {flagged.slice(0, 6).map((topic) => {
            const verdict = VERDICT[topic.verdict] || VERDICT.unclear;
            return (
              <div key={topic.topic} className="rounded-xl border border-ink/10 p-3">
                <p className="m-0 flex flex-wrap items-center gap-2 text-sm font-bold text-ink">{topic.topic}<span className={`${chip} ${verdict.tone}`}>{t(`progress.sm.verdict.${VERDICT[topic.verdict] ? topic.verdict : "unclear"}`)}</span><span className="text-[11px] font-semibold text-soft-ink">{t("progress.sm.rightAnswered", { pct: Math.round((topic.acc || 0) * 100), count: topic.asked })}</span></p>
                <p className="m-0 mt-1 text-xs text-soft-ink">{topic.reason}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(topic.verdict === "skill" || topic.verdict === "both") && topic.skills.slice(0, 2).map((id) => onPrimer ? <button key={id} type="button" className={ghostBtn} onClick={() => onPrimer(weakSkills.find((skill) => skill.id === id) || { id, label: skillLabel(id), lifts: [topic.topic] })}>{t("progress.lr.refresh", { skill: skillLabel(id).toLowerCase() })}</button> : null)}
                  {(topic.verdict === "topic" || topic.verdict === "both") && onReteach ? <button type="button" className={ghostBtn} onClick={() => onReteach(topic)}>{t("progress.sm.reteach")}</button> : null}
                </div>
                {topic.verdict === "both" ? <p className="m-0 mt-1.5 text-[11px] text-soft-ink">{t("progress.sm.skillFirst")}</p> : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export { card };
