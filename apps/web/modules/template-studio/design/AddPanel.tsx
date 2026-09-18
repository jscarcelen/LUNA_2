"use client";

import { listComponents } from "../engine/registry";
import { card, kicker } from "../ui";

export function AddPanel({ onAdd, hint }: { onAdd: (type: string) => void; hint: string }) {
  const items = listComponents().filter((component) => component.addable);
  return (
    <div className={`${card} p-3`}>
      <p className={`${kicker} px-1`}>Add</p>
      <p className="m-0 mb-2 px-1 text-[11px] text-soft-ink">{hint}</p>
      <div className="grid grid-cols-2 gap-1">
        {items.map((item) => (
          <button key={item.type} type="button" onClick={() => onAdd(item.type)} className={`flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-center transition hover:bg-[var(--surface-soft)] ${item.group === "static" ? "text-ink" : "text-[var(--accent-ink)]"}`}>
            <span className="grid size-8 place-items-center rounded-lg bg-[var(--surface-soft)] text-sm font-bold">{item.icon}</span>
            <span className="text-[11px] font-semibold">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
