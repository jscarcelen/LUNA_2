"use client";

import { useT } from "../../../../lib/i18n/LocaleProvider.js";
import { countNoun, splitChecks } from "../../pipeline/itemCount";

/**
 * What the runner is told about the result's checks.
 *  - Fewer items than asked (the material ran out of distinct ideas, or a call came back short) is not an
 *    error: a calm note says how many were made and offers "Make more", which asks only for the missing ones.
 *  - A real problem with the output (a missing field, duplicates, an answer not among its options) keeps the
 *    red style, because that result should not be used as it is.
 */
export function CountNotice({ shortfall = null, checks = [], agentName = "", busy = false, onMakeMore }) {
  const t = useT();
  const { problems } = splitChecks(checks);
  const noun = countNoun(agentName);
  return (
    <>
      {shortfall ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-ink/10 bg-[var(--surface-soft)] px-3 py-2">
          <p className="m-0 flex-1 text-xs text-ink">
            {shortfall.exhausted
              ? t.plural("misc.run.madeAll", shortfall.made, { noun: t.plural(`misc.run.noun.${noun}`, shortfall.made) })
              : t("misc.run.madeSome", { made: shortfall.made, requested: shortfall.requested, noun: t.plural(`misc.run.noun.${noun}`, shortfall.requested) })}
          </p>
          {onMakeMore ? (
            <button type="button" className="shrink-0 rounded-full border border-ink/15 bg-white px-3 py-1 text-xs font-semibold text-ink transition hover:bg-[var(--surface-soft)] disabled:opacity-50" disabled={busy} onClick={onMakeMore}>
              {busy ? t("misc.run.makingMore") : t("misc.run.makeMore", { count: shortfall.missing })}
            </button>
          ) : null}
        </div>
      ) : null}
      {problems.length ? (
        <div className="rounded-xl border border-[rgba(215,0,21,0.25)] bg-[rgba(215,0,21,0.06)] px-3 py-2">
          <p className="m-0 text-xs font-semibold text-[var(--color-danger)]">{t("misc.run.problems")}</p>
          <ul className="m-0 mt-1 grid list-none gap-1 p-0 sm:grid-cols-2">
            {problems.map((check) => <li key={check.rule} className="text-xs text-[var(--color-danger)]">✗ {check.message}</li>)}
          </ul>
        </div>
      ) : null}
    </>
  );
}
