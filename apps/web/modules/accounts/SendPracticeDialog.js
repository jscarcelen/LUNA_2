"use client";

import { useMemo, useState } from "react";
import { assignableDocuments } from "./sendQuestions";
import { card, field, ghostBtn, kicker, primaryBtn } from "./ui";

/**
 * "Send practice to {class}…": pick one of your activities or study plans, then the normal Assign dialog opens with the
 * class (or students) already chosen, where the due date is set. Nothing is sent from here.
 */
export function SendPracticeDialog({ target, workspaces = [], onPick, onMake, onClose }) {
  const [query, setQuery] = useState("");
  const all = useMemo(() => assignableDocuments(workspaces), [workspaces]);
  const shown = useMemo(() => all.filter((entry) => !query.trim() || `${entry.name} ${entry.subject}`.toLowerCase().includes(query.trim().toLowerCase())), [all, query]);
  return (
    <div className="tw-scope fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Send practice to ${target?.name || "a class"}`} className={`${card} max-h-[88vh] w-full max-w-md overflow-y-auto`} onClick={(event) => event.stopPropagation()}>
        <p className={kicker}>Send practice to</p>
        <h3 className="m-0 mt-1 truncate text-lg font-bold text-ink">{target?.name}</h3>
        {all.length ? (
          <>
            <p className="m-0 mt-2 text-sm text-soft-ink">Choose what to send. You set the due date on the next screen.</p>
            {all.length > 6 ? <input className={`${field} mt-2 w-full`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your activities" aria-label="Search your activities" /> : null}
            <ul className="m-0 mt-2 grid max-h-72 list-none gap-1.5 overflow-y-auto p-0">
              {shown.map((entry) => (
                <li key={entry.id}>
                  <button type="button" className="flex w-full items-center gap-2 rounded-xl border border-ink/10 px-3 py-2 text-left transition hover:bg-[var(--surface-soft)]" onClick={() => onPick(entry.document)}>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{entry.name}</span><span className="block truncate text-[11px] text-soft-ink">{entry.kind === "plan" ? "Study plan" : "Activity"} · {entry.subject}</span></span>
                    <span className="text-xs font-semibold text-[var(--accent-ink)]">Choose</span>
                  </button>
                </li>
              ))}
              {!shown.length ? <li className="text-sm text-soft-ink">Nothing matches.</li> : null}
            </ul>
            <div className="mt-3 flex flex-wrap justify-between gap-2">
              <button type="button" className={ghostBtn} onClick={onMake}>Make a new quiz instead</button>
              <button type="button" className={ghostBtn} onClick={onClose}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <p className="m-0 mt-2 text-sm text-soft-ink">You have no quiz, flashcards or worksheet to send yet. Make one from your material, then come back and send it.</p>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className={ghostBtn} onClick={onClose}>Cancel</button>
              <button type="button" className={primaryBtn} onClick={onMake}>Make a quiz</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
