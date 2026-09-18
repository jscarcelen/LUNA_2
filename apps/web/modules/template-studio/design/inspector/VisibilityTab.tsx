"use client";

import type { Element, View } from "../../engine/types";
import { label } from "../../ui";

/** Per-view visibility. Writes to the element's visibility list (inherit) — views stay lightweight overrides. */
export function VisibilityTab({ element, views, onChange }: { element: Element; views: View[]; onChange: (updater: (element: Element) => Element) => void }) {
  const list = element.visibility.views;
  const visibleIn = (viewId: string) => !list || list.includes(viewId);
  return (
    <div className="grid gap-3">
      <div>
        <label className={label}>Visible in</label>
        <div className="grid gap-1">
          {views.map((view) => (
            <label key={view.id} className="flex items-center justify-between gap-3 rounded-xl border border-ink/10 px-3 py-2 text-sm text-ink">
              <span>{view.name}</span>
              <input type="checkbox" checked={visibleIn(view.id)} onChange={(event) => onChange((current) => {
                const all = views.map((item) => item.id);
                const currentList = current.visibility.views || all;
                const next = event.target.checked ? [...new Set([...currentList, view.id])] : currentList.filter((id) => id !== view.id);
                return { ...current, visibility: { views: next.length === all.length ? undefined : next } };
              })} />
            </label>
          ))}
        </div>
      </div>
      <p className="m-0 text-xs text-soft-ink">Example: show the answer only in the “Answer key” view. Views share the same layout — nothing is duplicated.</p>
    </div>
  );
}
