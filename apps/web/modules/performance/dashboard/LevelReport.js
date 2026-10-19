"use client";

import { AiGuidanceNote, card, chip, ghostBtn, kicker } from "./parts";
import { useT, useLocale } from "../../../lib/i18n/LocaleProvider.js";

const STATUS = {
  strong: { label: "Solid", tone: "bg-[#e9f9ee] text-[#1d7a44]", bar: "#34c759" },
  review: { label: "Review", tone: "bg-[#fff1e0] text-[#8a4a00]", bar: "#ff9f0a" },
  start: { label: "Start here", tone: "bg-[#fde8ea] text-[#a1000f]", bar: "#ff3b30" }
};

/**
 * Where you start: for each level test, the foundations from the most basic to the most advanced, how each went,
 * and where to begin. A weak foundation offers a refresher (a skill refresher when the foundation is a skill).
 */
export function LevelReport({ reports = [], onBuild, onSkill, onRetake, compact = false }) {
  const t = useT();
  const { locale, formatDate } = useLocale();
  if (!reports.length) {
    return <p className="m-0 rounded-xl bg-[var(--surface-soft)] p-4 text-sm text-soft-ink">{t("progress.lr.empty")}</p>;
  }
  const shown = compact ? reports.slice(0, 1) : reports;
  return (
    <div className="grid gap-4">
      <AiGuidanceNote />
      {shown.map((report) => (
        <div key={report.id || report.title} className={`${card} grid gap-3 p-4`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="m-0 text-sm font-bold text-ink">{report.title}</p>
            <span className="text-[11px] font-semibold text-soft-ink">{t("progress.lr.overall", { pct: Math.round(report.accuracy * 100), count: report.asked })}{report.at ? ` · ${formatDate(report.at, { year: "numeric", month: "numeric", day: "numeric" })}` : ""}</span>
          </div>
          <p className="m-0 text-[15px] font-semibold leading-snug text-ink">{report.summary}</p>
          <div className="grid gap-2">
            {report.components.map((component, index) => {
              const status = STATUS[component.status];
              const isStart = report.startAt?.name === component.name;
              return (
                <div key={component.name} className={`rounded-xl border p-3 ${isStart ? "border-[var(--accent)]/50 bg-[var(--accent-soft)]/40" : "border-ink/10"}`}>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-ink">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-white text-[10px] font-bold text-soft-ink ring-1 ring-ink/15">{index + 1}</span>
                    <strong className="min-w-0 flex-1">{component.name}</strong>
                    <span className={`${chip} ${status.tone}`}>{t(`progress.lr.status.${component.status}`)}</span>
                    <span className="text-[11px] font-semibold text-soft-ink">{component.right}/{component.asked}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-soft)]"><div className="h-full rounded-full" style={{ width: `${Math.round(component.accuracy * 100)}%`, background: status.bar }} /></div>
                  {component.status !== "strong" && !compact ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {onBuild ? <button type="button" className={ghostBtn} onClick={() => onBuild(report, component)}>{t("progress.lr.build")}</button> : null}
                      {component.skill && onSkill ? <button type="button" className={ghostBtn} onClick={() => onSkill({ id: component.skill, label: component.skillLabel, lifts: [component.name] })}>{t("progress.lr.refresh", { skill: component.skillLabel.toLowerCase() })}</button> : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          {compact && report.startAt && onBuild ? <div><button type="button" className={ghostBtn} onClick={() => onBuild(report, report.startAt)}>{t("progress.lr.buildNamed", { name: report.startAt.name })}</button></div> : null}
          {onRetake && !compact ? <div><button type="button" className="text-xs font-semibold text-[var(--accent-ink)] hover:underline" onClick={() => onRetake(report)}>{t("progress.lr.retake")}</button></div> : null}
        </div>
      ))}
    </div>
  );
}

export { kicker };
