"use client";

import { useMemo } from "react";
import { progressModel, whenLabel, formatScore } from "./model.js";
import { Bar, Empty, MobileScreen, SectionTitle, Skeleton, cardClass } from "./ui.js";
import { ScoreAudienceNote } from "../accounts/VisibilityTags.js";
import { useT } from "../../lib/i18n/LocaleProvider.js";

/**
 * Progress on the phone: what the student knows and what to practise next, never a competition. Every number is the
 * website's own mastery engine (performance/mastery.js) reading the student's answered questions: nothing shows before a
 * first activity is done. Mastery is explained in words ("Strong", "Needs practice"), with a bar, not a score table.
 */
export function MobileProgress({ workspace = null, loading = false, learner = "", onOpenPage, onOpen }) {
  const t = useT();
  const model = useMemo(() => progressModel(workspace, { learner }, t), [workspace, learner, t]);
  const statusLabel = (status) => (status ? t(`progress.status.${status.id}`) : "");
  const documentById = (id) => (workspace?.subjects || []).flatMap((subject) => subject.documents || []).find((document) => document.id === id) || null;

  if (!workspace && loading) return <MobileScreen title={t("mobile.tab.progress")}><Skeleton rows={3} /></MobileScreen>;
  if (!model.hasData) {
    return (
      <MobileScreen title={t("mobile.tab.progress")}>
        <Empty
          title={t("mobile.progress.empty")}
          text={t("mobile.progress.emptyText")}
          actions={[{ label: t("mobile.home.start"), onClick: () => onOpenPage?.("study") }]}
        />
      </MobileScreen>
    );
  }

  const { overall } = model;
  return (
    <MobileScreen title={t("mobile.tab.progress")} label={t("mobile.tab.progress")}>
      <ScoreAudienceNote what="progress" className="px-1 text-[13px]" />
      <div className="grid gap-2">
        <SectionTitle>{t("mobile.progress.learning")}</SectionTitle>
        <div className={`${cardClass} grid gap-4 p-4`}>
          <p className="m-0 text-[15px] text-ink">
            {t.plural("mobile.progress.answered", overall.questions)} {t.plural("mobile.progress.topics", overall.topicCount)}
            {overall.strongOrBetter ? ` ${t.plural("mobile.progress.going", overall.strongOrBetter)}` : ""}
          </p>
          {model.subjects.length > 1 ? (
            <ul className="m-0 grid list-none gap-3 p-0">
              {model.subjects.map((subject) => (
                <li key={subject.name} className="grid gap-1.5">
                  <div className="flex items-baseline justify-between gap-2"><span className="truncate text-[15px] font-semibold text-ink">{subject.name}</span><span className="shrink-0 text-[13px] text-soft-ink">{t.plural("mobile.progress.answers", subject.questions)}</span></div>
                  <Bar value={subject.mastery} label={t("mobile.progress.outOf", { name: subject.name, value: subject.mastery })} />
                </li>
              ))}
            </ul>
          ) : null}
          <ul className="m-0 grid list-none gap-3 p-0">
            {model.topics.map((topic) => (
              <li key={topic.topic} className="grid gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-[15px] text-ink">{topic.topic}</span>
                  <span className="shrink-0 text-[13px] font-semibold" style={{ color: topic.status?.ink }}>{statusLabel(topic.status)}</span>
                </div>
                <Bar value={topic.mastery} colour={topic.status?.colour} label={`${topic.topic}: ${statusLabel(topic.status)}`} />
              </li>
            ))}
          </ul>
          <p className="m-0 text-[12px] text-soft-ink">{t("mobile.progress.barNote")}</p>
        </div>
      </div>

      {model.weak.length ? (
        <div className="grid gap-2">
          <SectionTitle>{t("mobile.progress.weak")}</SectionTitle>
          <div className="grid gap-2">
            {model.weak.map((entry) => (
              <article key={entry.topic} className={`${cardClass} grid gap-1 p-4`}>
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="m-0 min-w-0 truncate text-[16px] font-semibold text-ink">{entry.topic}</h3>
                  <span className="shrink-0 text-[13px] font-semibold" style={{ color: entry.status?.ink }}>{statusLabel(entry.status)}</span>
                </div>
                <p className="m-0 text-[14px] text-soft-ink">{entry.reason} · {t.plural("mobile.progress.from", entry.questions)}</p>
                <p className="m-0 text-[14px] text-ink">{entry.advice}</p>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {model.recent.length ? (
        <div className="grid gap-2">
          <SectionTitle>{t("mobile.progress.recent")}</SectionTitle>
          <div className={`${cardClass} divide-y divide-ink/8 overflow-hidden`}>
            {model.recent.map((entry) => {
              const document = entry.resourceId ? documentById(entry.resourceId) : null;
              const content = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-ink">{entry.title}</span>
                    <span className="block truncate text-[13px] text-soft-ink">{[entry.subject, whenLabel(entry.at, t)].filter(Boolean).join(" · ")}</span>
                  </span>
                  {entry.total ? <span className="shrink-0 text-[14px] font-semibold text-ink">{formatScore(entry.score)}/{entry.total}</span> : null}
                </>
              );
              return document ? (
                <button key={entry.id} type="button" className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-[var(--surface-soft)]" onClick={() => onOpen?.(document, "")}>{content}</button>
              ) : (
                <div key={entry.id} className="flex min-h-[56px] items-center gap-3 px-4 py-2.5">{content}</div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="grid gap-2">
        <SectionTitle>{t("mobile.progress.next")}</SectionTitle>
        <div className={`${cardClass} grid gap-3 p-4`}>
          <p className="m-0 text-[15px] text-ink">{model.weak.length ? t("mobile.progress.nextWeak", { topic: model.weak[0].topic, advice: model.weak[0].advice }) : t("mobile.progress.nextNone")}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="min-h-[44px] flex-1 rounded-full bg-[var(--accent)] px-4 text-[15px] font-semibold text-white" onClick={() => onOpenPage?.("study")}>{t("mobile.progress.practise")}</button>
            <button type="button" className="min-h-[44px] flex-1 rounded-full border border-ink/15 bg-white px-4 text-[15px] font-semibold text-ink" onClick={() => onOpenPage?.("study?view=plan")}>{t("mobile.progress.plan")}</button>
          </div>
        </div>
      </div>
    </MobileScreen>
  );
}
