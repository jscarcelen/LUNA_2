"use client";

import { GENERATION_STEPS } from "./useAgentGenerationStream";

function formatElapsed(ms) {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
}

function stepMetaLabel(id, meta = {}) {
  if (id === "scope" && meta.documentCount != null) return `${meta.documentCount} document${meta.documentCount === 1 ? "" : "s"}`;
  if (id === "chunk" && meta.chunkCount != null) return `${meta.chunkCount} passages`;
  if (id === "retrieve" && meta.chunkCount != null) return `${meta.chunkCount} selected`;
  if (id === "generate" && meta.itemCount != null) return `${meta.itemCount} items · ${meta.model || ""}`.trim();
  if (id === "generate" && meta.status === "retry") return "First attempt was incomplete — trying again";
  if (id === "generate" && meta.model) return meta.model;
  if (id === "validate" && meta.total != null) return `${meta.passed} of ${meta.total} checks passed`;
  return "";
}

function StepIcon({ status, index }) {
  if (status === "done") {
    return (
      <span className="grid size-7 place-items-center rounded-full bg-teal/20 text-accent ring-1 ring-accent/50 transition-all duration-300">
        <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 10.5 3.2 3L15 6.5" /></svg>
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="relative grid size-7 place-items-center rounded-full bg-mustard/15 text-warn ring-1 ring-warn/60">
        <span className="absolute inset-0 animate-ping rounded-full bg-mustard/25" />
        <span className="relative size-2 rounded-full bg-warn" />
      </span>
    );
  }
  if (status === "error") {
    return <span className="grid size-7 place-items-center rounded-full bg-rose/20 text-danger ring-1 ring-danger/60 text-xs font-bold">!</span>;
  }
  return <span className="grid size-7 place-items-center rounded-full bg-ink/5 text-soft-ink/70 ring-1 ring-ink/10 text-xs font-semibold">{index + 1}</span>;
}

/**
 * Step-by-step "building" state shown while an agent run streams back.
 * Pure presentation: feed it the state from useAgentGenerationStream.
 */
export function GenerationProgress({ steps, tokenChars, tokenTail, elapsedMs, isGenerating, error, onCancel, compact = false }) {
  const doneCount = GENERATION_STEPS.filter((step) => steps[step.id]?.status === "done").length;
  const activeStep = GENERATION_STEPS.find((step) => steps[step.id]?.status === "active");
  const percent = Math.min(100, Math.round((doneCount / GENERATION_STEPS.length) * 100 + (activeStep ? 12 : 0)));

  return (
    <div className={`@container rounded-bento border border-ink/8 bg-paper shadow-glow animate-rise ${compact ? "p-4" : "p-5"}`} aria-live="polite">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">{isGenerating ? "Building" : error ? "Stopped" : "Complete"}</p>
          <p className="m-0 mt-0.5 text-sm text-soft-ink">
            {isGenerating ? (activeStep ? `${activeStep.label}…` : "Starting…") : error ? error : "Your output is ready."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-ink/5 px-2.5 py-1 font-mono text-xs text-soft-ink ring-1 ring-ink/10 tabular-nums">{formatElapsed(elapsedMs)}</span>
          {isGenerating && typeof onCancel === "function" ? (
            <button type="button" onClick={onCancel} className="rounded-full px-3 py-1 text-xs font-semibold text-soft-ink ring-1 ring-ink/15 transition hover:bg-ink/10 hover:text-ink">Cancel</button>
          ) : null}
        </div>
      </div>

      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-ink/10">
        <div
          className={`h-full rounded-full bg-[linear-gradient(90deg,var(--color-teal),var(--color-mustard),var(--color-burnt),var(--color-teal))] bg-[length:200%_100%] transition-[width] duration-500 ease-out ${isGenerating ? "animate-shimmer" : ""}`}
          style={{ width: `${error ? Math.max(percent, 8) : percent}%` }}
        />
      </div>

      <ol className="m-0 grid list-none gap-2 p-0 @md:grid-cols-2">
        {GENERATION_STEPS.map((step, index) => {
          const state = steps[step.id] || { status: "pending", meta: {} };
          const meta = stepMetaLabel(step.id, state.meta);
          return (
            <li
              key={step.id}
              className={`flex items-start gap-3 rounded-2xl border px-3 py-2.5 transition-all duration-300 ${
                state.status === "active"
                  ? "border-warn/40 bg-mustard/[0.06]"
                  : state.status === "done"
                    ? "border-accent/25 bg-teal/[0.05]"
                    : state.status === "error"
                      ? "border-danger/40 bg-rose/[0.06]"
                      : "border-ink/8 bg-ink/[0.03] opacity-70"
              }`}
            >
              <StepIcon status={state.status} index={index} />
              <div className="min-w-0 flex-1">
                <p className="m-0 text-sm font-semibold text-ink">{step.label}</p>
                <p className="m-0 truncate text-xs text-soft-ink">{meta || step.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>

      {isGenerating && steps.generate?.status === "active" ? (
        <div className="mt-3 rounded-2xl border border-ink/8 bg-bg/60 px-3 py-2.5">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-soft-ink">
            <span>Live output</span>
            <span className="font-mono tabular-nums">{tokenChars.toLocaleString()} chars</span>
          </div>
          <p className="m-0 mt-1 line-clamp-2 font-mono text-xs leading-relaxed text-ink/80 animate-pulse-soft break-all">
            {tokenTail || "Waiting for the first tokens…"}
          </p>
        </div>
      ) : null}
    </div>
  );
}
