"use client";

import { useState } from "react";
import { MODES, SIZES, movePanel, reorderPanels, setPanelMode, setPanelSize, togglePanel } from "../views";
import { panelsForRole } from "./registry";
import { ghostBtn, kicker } from "./parts";

/**
 * Arranging the dashboard.
 *
 * The panel is the unit: it can be hidden, moved, made full width, and told how to read — the figure
 * as it stands, how it moved over time, or every row behind it. Dragging a row reorders it; the
 * arrows do the same thing for anyone not using a mouse. Nothing here touches the data, so an
 * arrangement is safe to save, share and sell.
 */
export function Customise({ view, role = "student", onChange, onSaveAs, onDelete, onPublish, onReset, canDelete = false }) {
  const [dragging, setDragging] = useState("");
  const available = panelsForRole(role);
  const inView = view.panels.filter((panel) => available.some((entry) => entry.id === panel.id));
  const notInView = available.filter((entry) => !view.panels.some((panel) => panel.id === entry.id));

  return (
    <section className="grid gap-3 rounded-2xl border border-[var(--accent)]/25 bg-[var(--accent-soft)]/25 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className={kicker}>Arrange “{view.name}”</p>
          <p className="m-0 mt-0.5 text-[11px] text-soft-ink">Drag a row to reorder it. Hide what you do not want to see; every metric stays available.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={ghostBtn} onClick={onSaveAs}>Save as a new view</button>
          {onPublish ? <button type="button" className={ghostBtn} onClick={onPublish}>Sell this arrangement</button> : null}
          {onReset ? <button type="button" className={ghostBtn} onClick={onReset}>Reset to Luna's default</button> : null}
          {canDelete && onDelete ? <button type="button" className={`${ghostBtn} text-[var(--color-danger)]`} onClick={onDelete}>Delete this view</button> : null}
        </div>
      </div>

      <div className="grid gap-1.5">
        {inView.map((panel, index) => {
          const definition = available.find((entry) => entry.id === panel.id);
          return (
            <div
              key={panel.id}
              draggable
              onDragStart={() => setDragging(panel.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => { if (dragging && dragging !== panel.id) onChange(reorderPanels(view, dragging, panel.id)); setDragging(""); }}
              className={`grid gap-2 rounded-xl border bg-white p-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${dragging === panel.id ? "border-[var(--accent)]" : "border-ink/10"}`}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span aria-hidden className="cursor-grab text-soft-ink">⠿</span>
                <label className="flex min-w-0 items-center gap-2">
                  <input type="checkbox" checked={panel.visible} onChange={() => onChange(togglePanel(view, panel.id))} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">{definition.title}</span>
                    <span className="block truncate text-[11px] text-soft-ink">{definition.blurb}</span>
                  </span>
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-1 justify-self-start sm:justify-self-end">
                {definition.modes.length > 1 ? (
                  <select
                    className="min-w-[6.5rem] rounded-lg border border-ink/12 bg-white py-1 pl-2 pr-1 text-[11px] text-ink"
                    value={panel.mode}
                    onChange={(event) => onChange(setPanelMode(view, panel.id, event.target.value))}
                    aria-label="How this panel reads"
                  >
                    {MODES.filter((mode) => definition.modes.includes(mode.id)).map((mode) => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
                  </select>
                ) : null}
                <select
                  className="min-w-[7rem] rounded-lg border border-ink/12 bg-white py-1 pl-2 pr-1 text-[11px] text-ink"
                  value={panel.size}
                  onChange={(event) => onChange(setPanelSize(view, panel.id, event.target.value))}
                  aria-label="Panel width"
                >
                  {SIZES.map((size) => <option key={size.id} value={size.id}>{size.label}</option>)}
                </select>
                <button type="button" className="h-7 w-7 rounded-full border border-ink/15 bg-white text-xs" aria-label="Move up" disabled={index === 0} onClick={() => onChange(movePanel(view, panel.id, -1))}>↑</button>
                <button type="button" className="h-7 w-7 rounded-full border border-ink/15 bg-white text-xs" aria-label="Move down" disabled={index === inView.length - 1} onClick={() => onChange(movePanel(view, panel.id, 1))}>↓</button>
              </div>
            </div>
          );
        })}
      </div>

      {notInView.length ? (
        <div>
          <p className={kicker}>Add a panel</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {notInView.map((entry) => (
              <button key={entry.id} type="button" title={entry.blurb} className={ghostBtn} onClick={() => onChange(togglePanel(view, entry.id))}>＋ {entry.title}</button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
