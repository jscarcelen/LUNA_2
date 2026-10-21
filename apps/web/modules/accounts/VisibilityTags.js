"use client";

import { Fragment, createContext, useContext, useEffect, useMemo, useState } from "react";
import { accountsApi } from "./api.js";
import { useT } from "../../lib/i18n/LocaleProvider.js";
import { audienceChips, audienceOf, grantIndex, locateAll, planAudience, scoreAudience, shortNames, watcherNames, watchersFrom } from "./visibility.js";

/**
 * "Who can see this?" for a logged-in student: tags on material and plans, a line under every quiz saying who sees
 * the score, and a small explainer card. Outside the provider (the demo, teachers, parents) every piece renders
 * nothing, and nothing renders until the connections and shares have loaded (a wrong "Only you" is worse than none).
 * The rules are in visibility.js.
 */
const VisibilityContext = createContext(null);

export function VisibilityProvider({ account = null, workspaces = [], refreshKey = "", onOpenPage, children }) {
  const enabled = account?.role === "student";
  const [loaded, setLoaded] = useState(null);
  useEffect(() => {
    if (!enabled) { setLoaded(null); return undefined; }
    let alive = true;
    Promise.all([accountsApi.connections(), accountsApi.grantOverview()]).then(([links, grants]) => {
      if (!alive || !links.ok) return;
      setLoaded({ watchers: watchersFrom(links.data?.connections?.accepted || []), given: grants.ok ? grants.data?.given || [] : [] });
    });
    return () => { alive = false; };
  }, [enabled, account?.id, refreshKey]);
  const places = useMemo(() => locateAll(workspaces), [workspaces]);
  const value = useMemo(() => (loaded ? { watchers: loaded.watchers, given: loaded.given, index: grantIndex(loaded.given), places, onOpenPage } : null), [loaded, places, onOpenPage]);
  return <VisibilityContext.Provider value={value}>{children}</VisibilityContext.Provider>;
}

/** null outside a logged-in student's app, or while loading. */
export const useVisibility = () => useContext(VisibilityContext);

const chipClass = {
  watchers: "bg-[rgba(255,159,10,0.14)] text-[#8a4a00]",
  shared: "bg-[#e8f2ff] text-[#0058b0]",
  private: "bg-[var(--surface-soft)] text-soft-ink"
};

/** The tags on one document: 🔒 Only you · 👀 Teacher can see · 👥 Shared with Ana. */
export function VisibilityChips({ document, className = "", wrapClassName = "" }) {
  const t = useT();
  const context = useVisibility();
  if (!context || !document) return null;
  const chips = audienceChips(audienceOf(document, context), t);
  if (!chips.length) return null;
  const Wrap = wrapClassName ? "span" : Fragment;
  return (
    <Wrap {...(wrapClassName ? { className: wrapClassName } : {})}>
      {chips.map((chip) => (
        <span key={chip.key} title={chip.title} className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${chipClass[chip.key]} ${className}`}>
          <span aria-hidden>{chip.icon}</span>{chip.text}<span className="sr-only">. {chip.title}</span>
        </span>
      ))}
    </Wrap>
  );
}

/** "Shared with Ana" on a folder or topic the student shared. */
export function FolderVisibilityChip({ folderId = "", subjectId = "" }) {
  const t = useT();
  const context = useVisibility();
  if (!context || (!folderId && !subjectId)) return null;
  // Only where the share was made (what is inside carries its own tags), so a shared topic does not tag every folder.
  const names = context.index.get(folderId ? `folder:${folderId}` : `subject:${subjectId}`) || [];
  if (!names.length) return null;
  return (
    <span title={t("people.vis.tip.sharedWith", { names: names.join(", ") })} className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${chipClass.shared}`}>
      <span aria-hidden>👥</span>{t("people.vis.chip.sharedWith", { names: shortNames(names, t) })}
    </span>
  );
}

/** Under a quiz or a deck of flashcards: who will see the score (`what="progress"` on the progress pages). */
export function ScoreAudienceNote({ className = "", what = "score" }) {
  const t = useT();
  const context = useVisibility();
  if (!context) return null;
  const line = scoreAudience(context.watchers, t, what);
  return <p role="note" className={`m-0 flex items-start gap-1.5 text-xs text-soft-ink ${className}`}><span aria-hidden>{line.icon}</span><span>{line.text}</span></p>;
}

/** At the top of a study plan: who can follow it. */
export function PlanAudienceNote({ document, className = "" }) {
  const t = useT();
  const context = useVisibility();
  if (!context || !document) return null;
  const lines = planAudience(audienceOf(document, context), t);
  if (!lines.length) return null;
  return (
    <div role="note" className={`grid gap-0.5 ${className}`}>
      {lines.map((line) => <p key={line.icon} className="m-0 flex items-start gap-1.5 text-xs text-soft-ink"><span aria-hidden>{line.icon}</span><span>{line.text}</span></p>)}
    </div>
  );
}

const HIDE_KEY = "luna.whoCanSee.hidden";

/** "Who can see my things?": a short explainer with the legend of the tags. Can be folded away (remembered per browser). */
export function WhoCanSeeCard({ className = "" }) {
  const t = useT();
  const context = useVisibility();
  const [hidden, setHidden] = useState(false);
  useEffect(() => { try { setHidden(window.localStorage.getItem(HIDE_KEY) === "1"); } catch { /* storage unavailable */ } }, []);
  if (!context) return null;
  const toggle = (next) => { setHidden(next); try { window.localStorage.setItem(HIDE_KEY, next ? "1" : "0"); } catch { /* storage unavailable */ } };
  if (hidden) {
    return (
      <button type="button" onClick={() => toggle(false)} className={`tw-scope inline-flex items-center gap-1.5 self-start rounded-full border border-ink/10 bg-white px-3 py-1.5 text-xs font-semibold text-ink ${className}`}>
        <span aria-hidden>👀</span>{t("people.vis.card.show")}
      </button>
    );
  }
  const sharedCount = new Set(context.given.map((grant) => `${grant.itemKind}:${grant.itemId}`)).size;
  const legend = [["🔒", t("people.vis.card.legendPrivate"), chipClass.private], ["👀", t("people.vis.card.legendWatchers"), chipClass.watchers], ["👥", t("people.vis.card.legendShared"), chipClass.shared], ["📥", t("people.vis.card.legendFrom"), chipClass.shared]];
  return (
    <section aria-label={t("people.vis.card.title")} className={`tw-scope rounded-2xl border border-ink/10 bg-white p-4 ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="m-0 text-sm font-bold text-ink">{t("people.vis.card.title")}</p>
        <button type="button" onClick={() => toggle(true)} className="rounded-full px-2 py-0.5 text-xs font-semibold text-soft-ink hover:bg-ink/5">{t("people.vis.card.hide")}</button>
      </div>
      <p className="m-0 mt-1 text-sm text-ink">{context.watchers.length ? t("people.vis.card.watchers", { names: watcherNames(context.watchers, t) }) : t("people.vis.card.none")}</p>
      <p className="m-0 mt-1 text-xs text-soft-ink">{sharedCount ? `${t.plural("people.vis.card.shared", sharedCount)} ` : ""}{t("people.vis.card.notes")}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {legend.map(([icon, text, tone]) => <span key={icon} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}><span aria-hidden>{icon}</span>{text}</span>)}
      </div>
      {context.onOpenPage ? <button type="button" onClick={() => context.onOpenPage("connections")} className="mt-2 text-xs font-semibold text-[var(--accent)] underline">{t("people.vis.card.manage")}</button> : null}
    </section>
  );
}
