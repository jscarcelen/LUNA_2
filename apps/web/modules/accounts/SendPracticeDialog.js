"use client";

import { useMemo, useState } from "react";
import { assignableDocuments } from "./sendQuestions";
import { card, field, ghostBtn, kicker, primaryBtn } from "./ui";
import { useT } from "../../lib/i18n/LocaleProvider.js";

/**
 * "Send practice to {class}…": pick one of your activities or study plans, then the normal Assign dialog opens with the
 * class (or students) already chosen, where the due date is set. Nothing is sent from here.
 */
export function SendPracticeDialog({ target, workspaces = [], onPick, onMake, onClose }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const all = useMemo(() => assignableDocuments(workspaces), [workspaces]);
  const shown = useMemo(() => all.filter((entry) => !query.trim() || `${entry.name} ${entry.subject}`.toLowerCase().includes(query.trim().toLowerCase())), [all, query]);
  return (
    <div className="tw-scope fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={t("dialogs.practice.aria", { name: target?.name || t("dialogs.practice.aClass") })} className={`${card} max-h-[88vh] w-full max-w-md overflow-y-auto`} onClick={(event) => event.stopPropagation()}>
        <p className={kicker}>{t("dialogs.practice.kicker")}</p>
        <h3 className="m-0 mt-1 truncate text-lg font-bold text-ink">{target?.name}</h3>
        {all.length ? (
          <>
            <p className="m-0 mt-2 text-sm text-soft-ink">{t("dialogs.practice.choose")}</p>
            {all.length > 6 ? <input className={`${field} mt-2 w-full`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("dialogs.practice.search")} aria-label={t("dialogs.practice.search")} /> : null}
            <ul className="m-0 mt-2 grid max-h-72 list-none gap-1.5 overflow-y-auto p-0">
              {shown.map((entry) => (
                <li key={entry.id}>
                  <button type="button" className="flex w-full items-center gap-2 rounded-xl border border-ink/10 px-3 py-2 text-left transition hover:bg-[var(--surface-soft)]" onClick={() => onPick(entry.document)}>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{entry.name}</span><span className="block truncate text-[11px] text-soft-ink">{entry.kind === "plan" ? t("dialogs.practice.plan") : t("dialogs.practice.activity")} · {entry.subject}</span></span>
                    <span className="text-xs font-semibold text-[var(--accent-ink)]">{t("dialogs.practice.choice")}</span>
                  </button>
                </li>
              ))}
              {!shown.length ? <li className="text-sm text-soft-ink">{t("dialogs.practice.noMatch")}</li> : null}
            </ul>
            <div className="mt-3 flex flex-wrap justify-between gap-2">
              <button type="button" className={ghostBtn} onClick={onMake}>{t("dialogs.practice.makeNew")}</button>
              <button type="button" className={ghostBtn} onClick={onClose}>{t("common.cancel")}</button>
            </div>
          </>
        ) : (
          <>
            <p className="m-0 mt-2 text-sm text-soft-ink">{t("dialogs.practice.none")}</p>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className={ghostBtn} onClick={onClose}>{t("common.cancel")}</button>
              <button type="button" className={primaryBtn} onClick={onMake}>{t("dialogs.practice.makeQuiz")}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
