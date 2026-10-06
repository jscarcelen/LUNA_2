"use client";

import { useState } from "react";
import { blockText } from "./update";

const TONE = {
  added: { label: "New", chip: "bg-[rgba(52,199,89,0.15)] text-[#1f7a3a]", box: "border-[rgba(52,199,89,0.35)] bg-[rgba(52,199,89,0.06)]" },
  changed: { label: "Changed", chip: "bg-[rgba(255,149,0,0.15)] text-[#b25e00]", box: "border-[rgba(255,149,0,0.4)] bg-[rgba(255,149,0,0.06)]" },
  removed: { label: "Removed", chip: "bg-[rgba(255,59,48,0.12)] text-[var(--color-danger)]", box: "border-[rgba(255,59,48,0.3)] bg-[rgba(255,59,48,0.05)]" },
  same: { label: "Same", chip: "bg-[var(--surface-soft)] text-soft-ink", box: "border-ink/10 bg-white" }
};

const Chip = ({ status }) => <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${TONE[status].chip}`}>{TONE[status].label}</span>;

const answerOf = (question) => (typeof question?.answer === "string" ? question.answer : question?.answer ? Object.entries(question.answer).map(([left, right]) => `${left} → ${right}`).join("; ") : "");

function QuestionBody({ question, struck = false }) {
  if (!question) return null;
  const text = question.kind === "flashcard" ? `${question.prompt}  →  ${answerOf(question)}` : question.prompt;
  return (
    <div className={struck ? "text-soft-ink line-through decoration-[var(--color-danger)]/50" : ""}>
      <p className="m-0 text-sm font-semibold text-ink">{text}</p>
      {question.kind !== "flashcard" ? <p className="m-0 mt-0.5 text-xs text-soft-ink">{question.options?.length ? `${question.options.length} options · ` : ""}Answer: {answerOf(question) || "—"}</p> : null}
    </div>
  );
}

function BlockBody({ block, struck = false }) {
  if (!block) return null;
  const heading = /^(heading|section_header|document_header)/.test(String(block.type || ""));
  return (
    <p className={`m-0 whitespace-pre-wrap text-sm ${heading ? "font-bold text-ink" : "text-ink"} ${struck ? "text-soft-ink line-through decoration-[var(--color-danger)]/50" : ""}`}>
      {blockText(block) || <span className="text-soft-ink">({block.type})</span>}
    </p>
  );
}

/**
 * What an update changed. Quizzes and flashcards: the new, changed and removed questions (the ones that
 * stayed are one line). Documents: the new version's blocks with the changed ones marked — before and
 * after side by side — and the removed ones where they were.
 */
export function UpdateCompare({ diff }) {
  const [showSame, setShowSame] = useState(false);
  const { counts, rows, kind } = diff;
  const same = rows.filter((row) => row.status === "same");
  const changedRows = rows.filter((row) => row.status !== "same");
  const unit = kind === "questions" ? "question" : "block";

  const summary = [["added", counts.added], ["changed", counts.changed], ["removed", counts.removed]].filter(([, n]) => n > 0);

  /** Unchanged blocks fold into one line unless asked for, so what changed stands out. */
  function renderBlocks() {
    const out = [];
    let run = [];
    const flush = (key) => {
      if (!run.length) return;
      if (showSame) run.forEach((row, index) => out.push(<div key={`${key}-${index}`} className={`rounded-xl border px-3 py-2 ${TONE.same.box}`}><BlockBody block={row.after} /></div>));
      else out.push(<p key={`${key}-fold`} className="m-0 px-1 text-[11px] text-soft-ink">… {run.length} unchanged {unit}{run.length === 1 ? "" : "s"}</p>);
      run = [];
    };
    rows.forEach((row, index) => {
      if (row.status === "same") { run.push(row); return; }
      flush(index);
      out.push(
        <div key={index} className={`grid gap-2 rounded-xl border px-3 py-2 ${TONE[row.status].box} ${row.status === "changed" ? "md:grid-cols-2" : ""}`}>
          {row.status === "changed" ? (
            <>
              <div><p className="m-0 mb-1 text-[10px] font-semibold uppercase tracking-wide text-soft-ink">Before</p><BlockBody block={row.before} struck /></div>
              <div><p className="m-0 mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-soft-ink">After <Chip status="changed" /></p><BlockBody block={row.after} /></div>
            </>
          ) : (
            <div className="flex items-start gap-2"><Chip status={row.status} /><div className="min-w-0 flex-1"><BlockBody block={row.after || row.before} struck={row.status === "removed"} /></div></div>
          )}
        </div>
      );
    });
    flush("end");
    return out;
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {summary.length ? summary.map(([status, n]) => <span key={status} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[status].chip}`}>{n} {TONE[status].label.toLowerCase()}</span>) : <span className="text-xs text-soft-ink">Nothing was changed.</span>}
        {counts.same ? <span className="text-xs text-soft-ink">· {counts.same} unchanged</span> : null}
        {kind === "blocks" && counts.same ? <button type="button" className="ml-auto text-xs font-semibold text-[var(--accent-ink)] hover:underline" onClick={() => setShowSame((value) => !value)}>{showSame ? "Hide unchanged" : "Show unchanged"}</button> : null}
      </div>
      <div className="grid max-h-[46vh] gap-1.5 overflow-y-auto pr-1">
        {kind === "blocks" ? renderBlocks() : (
          <>
            {changedRows.map((row, index) => (
              <div key={index} className={`grid gap-2 rounded-xl border px-3 py-2 ${TONE[row.status].box}`}>
                <div className="flex items-start gap-2">
                  <Chip status={row.status} />
                  <div className="min-w-0 flex-1 grid gap-1.5">
                    {row.status === "changed" ? <QuestionBody question={row.before} struck /> : null}
                    <QuestionBody question={row.after || row.before} struck={row.status === "removed"} />
                  </div>
                </div>
              </div>
            ))}
            {same.length ? (
              <button type="button" className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-left text-xs text-soft-ink hover:bg-[var(--surface-soft)]" onClick={() => setShowSame((value) => !value)}>
                {showSame ? "▾" : "▸"} {same.length} {unit}{same.length === 1 ? "" : "s"} kept as they were
              </button>
            ) : null}
            {showSame ? same.map((row, index) => <div key={`s${index}`} className={`rounded-xl border px-3 py-2 ${TONE.same.box}`}><QuestionBody question={row.after} /></div>) : null}
          </>
        )}
      </div>
    </div>
  );
}
