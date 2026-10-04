"use client";

/**
 * Which main folder (subject) a screen is about. Activities, study plans and performance each read
 * one subject at a time; with more than one in the workspace (Accounting, Statistics…) these chips
 * switch between them. Nothing is drawn when there is only one.
 */
export function SubjectTabs({ workspaces = [], selectedWorkspaceId, selectedSubjectId, onSelectSubject }) {
  const subjects = workspaces.find((workspace) => workspace.id === selectedWorkspaceId)?.subjects || [];
  if (subjects.length < 2 || typeof onSelectSubject !== "function") return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Main topic">
      <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-soft-ink">Topic</span>
      {subjects.map((subject) => (
        <button
          key={subject.id}
          type="button"
          role="tab"
          aria-selected={subject.id === selectedSubjectId}
          onClick={() => onSelectSubject(subject.id)}
          className={`inline-flex max-w-[14rem] items-center truncate rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${subject.id === selectedSubjectId ? "border-transparent bg-ink text-white" : "border-ink/15 bg-white text-soft-ink hover:bg-[var(--surface-soft)]"}`}
        >
          <span className="truncate">{subject.name}</span>
        </button>
      ))}
    </div>
  );
}
