"use client";

import { dueLabel } from "./plan";
import { PlanDeadlines } from "./DeadlineBadge";

const card = "rounded-[18px] border border-ink/8 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)]";
const kicker = "m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink";
const primaryBtn = "inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0077ed] disabled:opacity-50";
const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-[var(--surface-soft)]";
const chip = "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold";

/** Ring showing how much of a plan is done — the one number a plan is judged on. */
export function Ring({ ratio, colour, size = 56 }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="6" />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={colour} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${circumference * Math.max(0, Math.min(1, ratio))} ${circumference}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize={size * 0.26} fontWeight="700" fill="#1d1d1f">{Math.round(ratio * 100)}%</text>
    </svg>
  );
}

/**
 * One study plan as a card: name, next deadline, completion ring, step / goal / late chips, what is
 * next up. The Study plans list and the Home gallery both draw it, so a plan looks the same wherever
 * it is shown. `progress` comes from `planProgress` (with sub-plans rolled in for a parent plan);
 * the Build and Delete controls only appear when their handlers are given. `subjectName` adds a
 * small line above the title for views that mix several subjects.
 */
export function PlanCard({ document, plan, subPlans = [], progress, building = "", subjectName = "", sharedLabel = "", shareLabel = "Share…", onShare, onBuild, onUpdate, onOpen, onDelete }) {
  const pendingBuilds = plan.items.filter((item) => item.generate && !item.resourceId).length;
  return (
    <article className={`${card} flex flex-col gap-3 p-5`} style={{ borderTop: `4px solid ${plan.colour}` }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {subjectName ? <p className={`${kicker} truncate`}>{subjectName}</p> : null}
          <h4 className="m-0 truncate text-base font-bold text-ink">{plan.name}</h4>
          {sharedLabel ? <p className="m-0 mt-0.5 text-[11px] font-semibold text-[#0058b0]">{sharedLabel}</p> : null}
          {/* The next deadline with who set it (solid dark badge = a teacher or parent, outlined = your own); both when the plan has both. */}
          <PlanDeadlines plan={{ ...plan, deadlines: [...(plan.deadlines || []), ...subPlans.flatMap((row) => row.plan.deadlines || [])] }} className="mt-1" />
          {subPlans.length ? <p className="m-0 mt-0.5 text-xs text-soft-ink">{subPlans.length} sub-plan{subPlans.length === 1 ? "" : "s"}</p> : null}
        </div>
        <Ring ratio={progress.ratio} colour={plan.colour} />
      </div>
      <div className="flex flex-wrap gap-1">
        <span className={`${chip} bg-[var(--surface-soft)] text-soft-ink`}>{progress.done}/{progress.total} steps</span>
        {progress.goals.length ? <span className={`${chip} bg-[var(--surface-soft)] text-soft-ink`}>{progress.goals.filter((goal) => goal.met).length}/{progress.goals.length} goals</span> : null}
        {progress.late.length ? <span className={`${chip} bg-[rgba(255,59,48,0.1)] text-[var(--color-danger)]`}>{progress.late.length} late</span> : null}
        {progress.average ? <span className={`${chip} bg-[#2f9e5b]/10 text-[#1d7a44]`}>avg {Math.round(progress.average * 100)}%</span> : null}
      </div>
      {subPlans.length ? (
        <ul className="m-0 grid list-none gap-0.5 p-0">
          {subPlans.map((row) => <li key={row.document.id} className="truncate text-[11px] text-soft-ink">↳ {row.plan.name}</li>)}
        </ul>
      ) : null}
      {progress.next.length ? (
        <div>
          <p className={kicker}>Next up</p>
          <ul className="m-0 mt-1 grid list-none gap-1 p-0">
            {progress.next.slice(0, 3).map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 text-xs text-ink">
                <span className="truncate">{item.title}</span>
                {/* A step of a plan somebody assigned: its date is theirs (locked); an own date added next to it shows too. */}
                <span className="flex shrink-0 items-center gap-1 text-soft-ink">
                  {plan.receivedFrom && item.dueDate ? <span title={`Set by ${plan.receivedFrom.name || "your teacher"}`} aria-label="Set by your teacher">🔒</span> : null}
                  {dueLabel(item.dueDate)}
                  {item.ownDueDate ? <span className="rounded-full border border-ink/25 px-1.5 text-[10px] font-semibold text-ink" title="Your own deadline">{dueLabel(item.ownDueDate)}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : <p className="m-0 text-xs text-soft-ink">Everything done. 🎉</p>}
      <div className="mt-auto grid gap-1.5">
        {onBuild && pendingBuilds ? (
          <button type="button" className={ghostBtn} disabled={building === document.id} onClick={() => onBuild({ document, plan })}>
            {building === document.id ? "Building…" : `✦ Build ${pendingBuilds} resources`}
          </button>
        ) : null}
        <div className="flex items-center gap-1.5">
          <button type="button" className={`${primaryBtn} flex-1`} onClick={() => onOpen?.(document.id)}>Open plan</button>
          {onUpdate ? <button type="button" className={ghostBtn} title="Say what to change in this plan" onClick={() => onUpdate({ document, plan })}>✎ Update…</button> : null}
          {onShare ? <button type="button" className={ghostBtn} onClick={onShare}>{shareLabel}</button> : null}
          {onDelete ? (
            <button type="button" title="Delete plan…" className="grid size-9 shrink-0 place-items-center rounded-full border border-ink/15 bg-white text-xs text-soft-ink transition hover:border-[var(--color-danger)]/40 hover:text-[var(--color-danger)]" onClick={() => onDelete({ document, plan })}>🗑</button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
