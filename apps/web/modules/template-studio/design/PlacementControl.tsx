"use client";

import type { Element } from "../engine/types";
import { field as fieldClass, label } from "../ui";

export type PlacementChoice = "flow" | "fixed" | "new_page" | "every";

export const PLACEMENT_OPTIONS: [PlacementChoice, string, string][] = [
  ["flow", "After the previous block", "Starts where the block above ends — pushed down when that one grows."],
  ["fixed", "Fixed position", "Always starts here; the block above gets only the space before it and continues on the next page."],
  ["new_page", "On a new page", "Always starts on a fresh page (after the every-page header)."],
  ["every", "Every page (header / footer)", "Drawn once on every page, including continuation pages."]
];

export function placementOf(element: Element): PlacementChoice {
  if (element.pageScope.mode === "every") return "every";
  return element.placement || "flow";
}

export function applyPlacement(element: Element, choice: PlacementChoice): Element {
  if (choice === "every") return { ...element, placement: undefined, pageScope: { mode: "every" } } as Element;
  const pageScope = element.pageScope.mode === "every" ? { mode: "page" as const } : element.pageScope;
  return { ...element, placement: choice === "flow" ? undefined : choice, pageScope } as Element;
}

/** How a block is placed relative to the one above (and whether it repeats on every page). */
export function PlacementControl({ element, onChange, compact = false }: { element: Element; onChange: (updater: (element: Element) => Element) => void; compact?: boolean }) {
  const value = placementOf(element);
  if (compact) {
    return (
      <select className={`${fieldClass} py-1 text-xs`} value={value} onChange={(event) => onChange((current) => applyPlacement(current, event.target.value as PlacementChoice))} onClick={(event) => event.stopPropagation()}>
        {PLACEMENT_OPTIONS.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
      </select>
    );
  }
  return (
    <div>
      <label className={label}>Placement</label>
      <div className="grid gap-1">
        {PLACEMENT_OPTIONS.map(([key, title, text]) => (
          <label key={key} className={`flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 ${value === key ? "border-[var(--accent)]/40 bg-[var(--accent-soft)]" : "border-ink/10 hover:bg-[var(--surface-soft)]"}`}>
            <input type="radio" className="mt-1" checked={value === key} onChange={() => onChange((current) => applyPlacement(current, key))} />
            <span><span className="block text-sm font-semibold text-ink">{title}</span><span className="block text-xs text-soft-ink">{text}</span></span>
          </label>
        ))}
      </div>
    </div>
  );
}
