"use client";

import { deadlineOrigin } from "./deadlines.js";
import { dueLabel, visibleDeadlines } from "./plan.js";

/**
 * The two looks of a deadline, everywhere a due date is shown:
 *   imposed (set by a teacher or parent): a SOLID DARK badge with the sender's name, e.g. "🔒 Prof. Rivera";
 *   own (set by the learner): an OUTLINED LIGHT badge, "Your deadline".
 * `by` is the sender's name; `title` adds the hover text.
 */
export function OriginBadge({ imposed, by = "", tooltip = "", className = "", ownLabel = "Your deadline" }) {
  if (imposed) {
    return (
      <span title={tooltip || `Set by ${by || "your teacher"}. You cannot change it, but you can add your own earlier deadline.`} className={`inline-flex max-w-[11rem] items-center gap-1 truncate whitespace-nowrap rounded-full bg-[#1d1d1f] px-2 py-0.5 text-[10px] font-semibold text-white ${className}`}>
        <span aria-hidden="true">🔒</span><span className="truncate">{by || "Your teacher"}</span>
      </span>
    );
  }
  return (
    <span title={tooltip || "You set this deadline: you can change or remove it."} className={`inline-flex items-center whitespace-nowrap rounded-full border border-ink/25 bg-white px-2 py-0.5 text-[10px] font-semibold text-ink ${className}`}>
      {ownLabel}
    </span>
  );
}

/** The badge of one plan deadline, resolved against the plan (a deadline of a received copy was set by whoever sent it). */
export function DeadlineOrigin({ deadline, plan, className = "", ownLabel = "Your deadline" }) {
  const origin = deadlineOrigin(deadline, { receivedFrom: plan?.receivedFrom || null });
  return <OriginBadge imposed={origin.imposed} by={origin.by} tooltip={origin.tooltip} className={className} ownLabel={ownLabel} />;
}

/**
 * The deadline line of a plan card: the next deadline with its badge, and, when the plan also has one of the other
 * origin (the teacher's date and the student's own earlier one), that one too.
 */
export function PlanDeadlines({ plan, emptyLabel = "No deadline", className = "", ownLabel = "Your deadline" }) {
  const list = visibleDeadlines(plan);
  if (!list.length) return <p className={`m-0 text-xs text-soft-ink ${className}`}>{emptyLabel}</p>;
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {list.map((deadline) => (
        <p key={deadline.id} className="m-0 flex flex-wrap items-center gap-1.5 text-xs text-soft-ink">
          <DeadlineOrigin deadline={deadline} plan={plan} ownLabel={ownLabel} />
          <span className="min-w-0 truncate">{deadline.title} · {dueLabel(deadline.date)}</span>
        </p>
      ))}
    </div>
  );
}
