"use client";

import { useMemo, useState } from "react";
import { AIToolsHubPage } from "./AIToolsHubPage";
import { WorkspaceDocumentPicker } from "../tools/agent-builder/WorkspaceDocumentPicker";

const card = "rounded-[18px] border border-ink/8 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)]";
const kicker = "m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink";
const primaryBtn = "inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0077ed] disabled:opacity-50";
const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-[var(--surface-soft)]";

/** What can be made in one go: the tool that makes it, and a sentence on what comes out. */
export const QUICK_MAKES = [
  { id: "quiz-generator", title: "A quiz", text: "Questions with answers, to test what you know.", icon: "✎" },
  { id: "math-problem-set", title: "A problem set", text: "Problems that use the formulas in your material, with worked answers.", icon: "∑" },
  { id: "level-test", title: "A level test", text: "A short test of the foundations, to find out where to start.", icon: "◎" },
  { id: "concept-flashcards", title: "Flashcards", text: "Each key concept on a card, with its definition.", icon: "▭" },
  { id: "document-summarizer", title: "A summary", text: "One or two pages with the key messages and what to remember.", icon: "☰" },
  { id: "formula-sheet", title: "A formula sheet", text: "Every key formula, what each variable means and the logic behind it.", icon: "ƒ" }
];

/** `ai-tool:quiz-generator?docs=a,b`: the page that opens a tool with material already chosen. */
export function quickMakePage(toolId, documentIds = []) {
  return `ai-tool:${toolId}${documentIds.length ? `?docs=${documentIds.map(encodeURIComponent).join(",")}` : ""}`;
}

/**
 * Create → Make. The first thing is the question "what do you want to make?": choose it, choose the material, go.
 * Building your own tool and the chatbot sit behind "More", and the tools you already have are underneath.
 */
export function CreatePage({ role = "student", workspaces = [], selectedWorkspaceId, selectedSubjectId, onOpenTool, onOpenCustomAgent, onEditAgent, onDeleteAgent }) {
  const workspace = workspaces.find((entry) => entry.id === selectedWorkspaceId) || workspaces[0] || null;
  const [kind, setKind] = useState("");
  const [documentIds, setDocumentIds] = useState([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const hasMaterial = useMemo(() => (workspace?.subjects || []).some((subject) => (subject.documents || []).some((document) => document.sourceType !== "generated")), [workspace]);
  const chosen = QUICK_MAKES.find((entry) => entry.id === kind) || null;

  return (
    <section className="tw-scope grid gap-4">
      <div className={`${card} grid gap-4 p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className={kicker}>Quick make</p>
            <h3 className="m-0 mt-1 text-xl font-bold text-ink">What do you want to make?</h3>
          </div>
          <div className="relative">
            <button type="button" className={ghostBtn} aria-expanded={moreOpen} onClick={() => setMoreOpen((value) => !value)}>More ▾</button>
            {moreOpen ? (
              <div className="absolute right-0 z-10 mt-1 grid w-60 gap-0.5 rounded-2xl border border-ink/10 bg-white p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.12)]" onMouseLeave={() => setMoreOpen(false)}>
                <button type="button" className="rounded-xl px-3 py-2 text-left text-sm text-ink hover:bg-[var(--surface-soft)]" onClick={() => onOpenTool?.("agent-builder")}><strong className="block">Build your own tool</strong><span className="text-xs text-soft-ink">Teach Luna a new way to make material</span></button>
                <button type="button" className="rounded-xl px-3 py-2 text-left text-sm text-ink hover:bg-[var(--surface-soft)]" onClick={() => onOpenTool?.("chatbot")}><strong className="block">Chat with the assistant</strong><span className="text-xs text-soft-ink">Ask questions, plan, get unstuck</span></button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="What to make">
          {QUICK_MAKES.map((entry) => {
            const on = entry.id === kind;
            return (
              <button key={entry.id} type="button" role="radio" aria-checked={on} onClick={() => setKind(entry.id)} className={`flex flex-col gap-1 rounded-2xl border p-4 text-left transition ${on ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-ink/12 bg-white hover:bg-[var(--surface-soft)]"}`}>
                <span aria-hidden className="text-xl text-[var(--accent)]">{entry.icon}</span>
                <strong className="text-base text-ink">{entry.title}</strong>
                <span className="text-xs text-soft-ink">{entry.text}</span>
              </button>
            );
          })}
        </div>

        {chosen ? (
          <div className="grid gap-2">
            <p className="m-0 text-sm font-semibold text-ink">From which material?</p>
            {hasMaterial ? (
              <WorkspaceDocumentPicker workspace={workspace} selectedIds={documentIds} onChange={setDocumentIds} />
            ) : (
              <p className="m-0 rounded-2xl bg-[var(--surface-soft)] p-4 text-sm text-soft-ink">You have no material yet. Open <strong>Study → Courses</strong> and upload your notes, then come back here.</p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className={primaryBtn} disabled={!documentIds.length} onClick={() => onOpenTool?.(quickMakePage(chosen.id, documentIds).replace(/^ai-tool:/, ""))}>
                Continue
              </button>
              <span className="text-xs text-soft-ink">{documentIds.length ? `${documentIds.length} document${documentIds.length === 1 ? "" : "s"} chosen. Next you can adjust the options.` : "Choose at least one document."}</span>
            </div>
          </div>
        ) : null}
      </div>

      <AIToolsHubPage onOpenTool={onOpenTool} onOpenCustomAgent={onOpenCustomAgent} onEditAgent={onEditAgent} onDeleteAgent={onDeleteAgent} workspaces={workspaces} selectedWorkspaceId={selectedWorkspaceId} selectedSubjectId={selectedSubjectId} role={role} />
    </section>
  );
}
