"use client";

import { useMemo } from "react";
import { greeting } from "../dashboard/home";
import { useT } from "../../lib/i18n/LocaleProvider.js";
import { homeModel } from "./model.js";
import { Bar, Empty, MobileScreen, SectionTitle, Skeleton, cardClass, primaryClass } from "./ui.js";

/**
 * Home on the phone answers "what should I study next?": a greeting, ONE next-step card, what was left half-way, what is
 * coming up, and three quick actions. Sections with nothing real in them are not shown.
 */
export function MobileHome({ profileName = "", workspace = null, loading = false, drafts = {}, examDates = [], onOpen, onOpenPage }) {
  const t = useT();
  const model = useMemo(() => homeModel(workspace, { drafts, examDates }, t), [workspace, drafts, examDates, t]);
  const documentById = (id) => (workspace?.subjects || []).flatMap((subject) => subject.documents || []).find((document) => document.id === id) || null;
  const start = (target) => {
    const document = target.documentId ? documentById(target.documentId) : null;
    if (document) onOpen?.(document, target.subjectId);
    else if (target.planId) onOpenPage?.(`plans?open=${target.planId}`);
  };
  const { next } = model;

  return (
    <MobileScreen title={greeting(profileName, t)} subtitle={t("mobile.home.ready")} label={t("mobile.tab.home")}>
      {!workspace && loading ? <Skeleton rows={2} /> : (
        <>
          {next ? (
            <article className={`${cardClass} grid gap-3 p-5`} aria-label={t("mobile.home.nextAria")}>
              <p className="m-0 text-[13px] font-semibold text-[var(--accent-ink)]">{[next.subject, next.topic].filter(Boolean).join(" · ") || t("mobile.home.next")}</p>
              <div className="grid gap-1">
                <h2 className="m-0 text-[22px] font-bold leading-snug tracking-tight text-ink">{next.title}</h2>
                <p className="m-0 text-[15px] text-soft-ink">{next.reason}</p>
                {next.when ? <p className={`m-0 text-[14px] font-semibold ${next.late ? "text-[var(--color-danger)]" : "text-soft-ink"}`}>{next.when}</p> : null}
              </div>
              <button type="button" className={`${primaryClass} mt-1 w-full`} onClick={() => start(next)}>{t("mobile.home.start")}</button>
            </article>
          ) : (
            <Empty
              title={model.hasMaterial ? t("mobile.home.emptyPlanned") : t("mobile.home.emptyStart")}
              text={model.hasMaterial ? t("mobile.home.emptyPlannedText") : t("mobile.home.emptyStartText")}
              actions={model.hasMaterial
                ? [{ label: t("mobile.home.chooseSubject"), onClick: () => onOpenPage?.("study") }, { label: t("mobile.upload"), onClick: () => onOpenPage?.("library?add=1") }]
                : [{ label: t("mobile.upload"), onClick: () => onOpenPage?.("library?add=1") }, { label: t("mobile.home.chooseSubject"), onClick: () => onOpenPage?.("study") }]}
            />
          )}

          {model.continueItems.length ? (
            <div className="grid gap-2">
              <SectionTitle>{t("mobile.home.continue")}</SectionTitle>
              {model.continueItems.map((item) => (
                <article key={item.documentId} className={`${cardClass} flex items-center gap-3 p-4`}>
                  <div className="min-w-0 flex-1">
                    <p className="m-0 truncate text-[13px] text-soft-ink">{[item.subject, item.type].filter(Boolean).join(" · ")}</p>
                    <p className="m-0 truncate text-[16px] font-semibold text-ink">{item.title}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <Bar value={item.total ? (item.answered / item.total) * 100 : 0} label={t("mobile.answeredOf", { answered: item.answered, total: item.total })} />
                      <span className="shrink-0 text-[12px] text-soft-ink">{item.answered}/{item.total}</span>
                    </div>
                  </div>
                  <button type="button" className="min-h-[40px] shrink-0 rounded-full bg-[var(--accent-soft)] px-4 text-[15px] font-semibold text-[var(--accent-ink)]" onClick={() => start(item)}>{t("mobile.continue")}</button>
                </article>
              ))}
            </div>
          ) : null}

          {model.upcoming.length ? (
            <div className="grid gap-2">
              <SectionTitle actionLabel={t("mobile.study.plan")} onAction={() => onOpenPage?.("study?view=plan")}>{t("mobile.home.upcoming")}</SectionTitle>
              <div className={`${cardClass} divide-y divide-ink/8 overflow-hidden`}>
                {model.upcoming.map((item) => (
                  <button key={item.id} type="button" className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-[var(--surface-soft)]" onClick={() => onOpenPage?.(item.planId ? `plans?open=${item.planId}` : "study?view=plan")}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-ink">{item.title}</span>
                      <span className="block truncate text-[13px] text-soft-ink">{item.detail}</span>
                    </span>
                    <span className={`shrink-0 text-[13px] font-semibold ${item.late ? "text-[var(--color-danger)]" : "text-soft-ink"}`}>{item.when}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid gap-2">
            <SectionTitle>{t("mobile.home.quick")}</SectionTitle>
            <div className="grid grid-cols-3 gap-2">
              {[
                [t("mobile.home.practise"), "study", <path key="p" d="M12 4v16M4 12h16" />],
                [t("mobile.upload"), "library?add=1", <path key="u" d="M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15" />],
                [t("mobile.home.resources"), "library", <path key="r" d="M5 4.5h10.5L19 8v11.5H5zM8.5 10h7M8.5 13.5h7M8.5 17h4" />]
              ].map(([label, target, glyph]) => (
                <button key={target} type="button" className={`${cardClass} grid min-h-[88px] content-center justify-items-center gap-1.5 px-2 py-3 text-center active:bg-[var(--surface-soft)]`} onClick={() => onOpenPage?.(target)}>
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{glyph}</svg>
                  <span className="text-[13px] font-semibold leading-tight text-ink">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </MobileScreen>
  );
}
