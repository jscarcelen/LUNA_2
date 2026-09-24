"use client";

import { useMemo, useState } from "react";
import { addDays, calendarDays, weekStart } from "./plan";

const card = "rounded-[18px] border border-ink/8 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)]";
const kicker = "m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink";
const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-[var(--surface-soft)]";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HEAVY = 120; // minutes in a day beyond which the day is called heavy

/**
 * Every plan on one calendar.
 *
 * Plans are worked on at the same time, so the question is never "what does this plan ask of me"
 * but "what does this week ask of me": the grid shows each day's work, coloured by plan, and marks
 * the days where the plans pile up so a deadline can be moved before the week arrives.
 */
export function PlanCalendar({ rows = [], attempts = [], onOpenPlan, onMoveItem }) {
  const [offset, setOffset] = useState(0);
  const [weeks, setWeeks] = useState(6);
  const from = useMemo(() => addDays(weekStart(new Date().toISOString().slice(0, 10)), offset * 7), [offset]);
  const days = useMemo(() => calendarDays(rows, { from, days: weeks * 7, attempts }), [rows, from, weeks, attempts]);
  const today = new Date().toISOString().slice(0, 10);
  const busiest = Math.max(HEAVY, ...days.map((day) => day.minutes));

  return (
    <section className={`${card} p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className={kicker}>Calendar · every plan</p>
          <p className="m-0 mt-1 text-xs text-soft-ink">Colour by plan. A day in amber is carrying more than {HEAVY} minutes — drag an item to another day to spread the load.</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" className={ghostBtn} onClick={() => setOffset((value) => value - 1)}>← Earlier</button>
          <button type="button" className={ghostBtn} onClick={() => setOffset(0)}>Today</button>
          <button type="button" className={ghostBtn} onClick={() => setOffset((value) => value + 1)}>Later →</button>
          <select className="rounded-xl border border-ink/12 bg-white px-2 py-1.5 text-xs" value={weeks} onChange={(event) => setWeeks(Number(event.target.value))}>
            {[4, 6, 8, 12].map((value) => <option key={value} value={value}>{value} weeks</option>)}
          </select>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-soft-ink">
        {DAY_NAMES.map((name) => <span key={name}>{name}</span>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {days.map((day) => {
          const heavy = day.minutes > HEAVY;
          const isToday = day.date === today;
          const plans = [...new Set(day.entries.map((entry) => entry.planId))];
          return (
            <div
              key={day.date}
              onDragOver={(event) => { if (onMoveItem) event.preventDefault(); }}
              onDrop={(event) => {
                if (!onMoveItem) return;
                event.preventDefault();
                const raw = event.dataTransfer.getData("text/luna-plan-item");
                if (raw) { const [planId, itemId] = raw.split("|"); onMoveItem(planId, itemId, day.date); }
              }}
              className={`min-h-[86px] rounded-xl border p-1.5 text-left transition ${isToday ? "border-[var(--accent)] bg-[var(--accent-soft)]/30" : heavy ? "border-[var(--color-warn)]/40 bg-[rgba(178,94,0,0.06)]" : "border-ink/10 bg-white"}`}
            >
              <div className="flex items-baseline justify-between">
                <span className={`text-[11px] font-bold ${isToday ? "text-[var(--accent-ink)]" : "text-ink"}`}>{Number(day.date.slice(8, 10))}</span>
                {day.minutes ? <span className={`text-[9px] font-semibold ${heavy ? "text-[var(--color-warn)]" : "text-soft-ink"}`}>{day.minutes}m</span> : null}
              </div>
              <div className="mt-1 grid gap-0.5">
                {day.entries.slice(0, 3).map((entry) => (
                  <button
                    key={`${entry.planId}-${entry.id}`}
                    type="button"
                    draggable={entry.kind !== "deadline" && Boolean(onMoveItem)}
                    onDragStart={(event) => event.dataTransfer.setData("text/luna-plan-item", `${entry.planId}|${entry.id}`)}
                    onClick={() => onOpenPlan?.(entry.planId)}
                    title={`${entry.title} · ${entry.planName}`}
                    className={`truncate rounded-md px-1 py-0.5 text-left text-[9.5px] font-semibold ${entry.done ? "line-through opacity-50" : ""}`}
                    style={{ background: `${entry.colour}1f`, color: entry.colour, borderLeft: `2px solid ${entry.colour}` }}
                  >
                    {entry.kind === "deadline" ? "★ " : ""}{entry.title}
                  </button>
                ))}
                {day.entries.length > 3 ? <span className="px-1 text-[9px] text-soft-ink">+{day.entries.length - 3} more</span> : null}
              </div>
              {plans.length > 1 ? <p className="m-0 mt-1 px-1 text-[9px] font-semibold text-[var(--color-warn)]">{plans.length} plans</p> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
