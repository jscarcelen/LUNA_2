"use client";

import { useState } from "react";
import { MODES, SIZES, movePanel, reorderPanels, setPanelMode, setPanelSize, togglePanel } from "../views";
import { panelBlurb, panelTitle, panelsForRole } from "./registry";
import { viewName } from "../views";
import { ghostBtn, kicker } from "./parts";
import { useT } from "../../../lib/i18n/LocaleProvider.js";

/**
 * Arranging the dashboard.
 *
 * The panel is the unit: it can be hidden, moved, made full width, and told how to read — the figure
 * as it stands, how it moved over time, or every row behind it. Dragging a row reorders it; the
 * arrows do the same thing for anyone not using a mouse. Nothing here touches the data, so an
 * arrangement is safe to save, share and sell.
 */
export function Customise({ view, role = "student", onChange, onSaveAs, onDelete, onPublish, onReset, canDelete = false }) {
  const t = useT();
  const [dragging, setDragging] = useState("");
  const available = panelsForRole(role);
  const inView = view.panels.filter((panel) => available.some((entry) => entry.id === panel.id));
  const notInView = available.filter((entry) => !view.panels.some((panel) => panel.id === entry.id));

  return (
    <section className="grid gap-3 rounded-2xl border border-[var(--accent)]/25 bg-[var(--accent-soft)]/25 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className={kicker}>{t("progress.cu.arrange", { name: viewName(view, role, t) })}</p>
          <p className="m-0 mt-0.5 text-[11px] text-soft-ink">{t("progress.cu.hint")}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={ghostBtn} onClick={onSaveAs}>{t("progress.cu.saveAs")}</button>
          {onPublish ? <button type="button" className={ghostBtn} onClick={onPublish}>{t("progress.cu.sell")}</button> : null}
          {onReset ? <button type="button" className={ghostBtn} onClick={onReset}>{t("progress.cu.reset")}</button> : null}
          {canDelete && onDelete ? <button type="button" className={`${ghostBtn} text-[var(--color-danger)]`} onClick={onDelete}>{t("progress.cu.delete")}</button> : null}
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
                    <span className="block truncate text-sm font-semibold text-ink">{panelTitle(definition.id, t)}</span>
                    <span className="block truncate text-[11px] text-soft-ink">{panelBlurb(definition.id, t)}</span>
                  </span>
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-1 justify-self-start sm:justify-self-end">
                {definition.modes.length > 1 ? (
                  <select
                    className="min-w-[6.5rem] rounded-lg border border-ink/12 bg-white py-1 pl-2 pr-1 text-[11px] text-ink"
                    value={panel.mode}
                    onChange={(event) => onChange(setPanelMode(view, panel.id, event.target.value))}
                    aria-label={t("progress.cu.reads")}
                  >
                    {MODES.filter((mode) => definition.modes.includes(mode.id)).map((mode) => <option key={mode.id} value={mode.id}>{t(`progress.mode.${mode.id}`)}</option>)}
                  </select>
                ) : null}
                <select
                  className="min-w-[7rem] rounded-lg border border-ink/12 bg-white py-1 pl-2 pr-1 text-[11px] text-ink"
                  value={panel.size}
                  onChange={(event) => onChange(setPanelSize(view, panel.id, event.target.value))}
                  aria-label={t("progress.cu.width")}
                >
                  {SIZES.map((size) => <option key={size.id} value={size.id}>{t(`progress.size.${size.id}`)}</option>)}
                </select>
                <button type="button" className="h-7 w-7 rounded-full border border-ink/15 bg-white text-xs" aria-label={t("progress.cu.up")} disabled={index === 0} onClick={() => onChange(movePanel(view, panel.id, -1))}>↑</button>
                <button type="button" className="h-7 w-7 rounded-full border border-ink/15 bg-white text-xs" aria-label={t("progress.cu.down")} disabled={index === inView.length - 1} onClick={() => onChange(movePanel(view, panel.id, 1))}>↓</button>
              </div>
            </div>
          );
        })}
      </div>

      {notInView.length ? (
        <div>
          <p className={kicker}>{t("progress.cu.add")}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {notInView.map((entry) => (
              <button key={entry.id} type="button" title={panelBlurb(entry.id, t)} className={ghostBtn} onClick={() => onChange(togglePanel(view, entry.id))}>＋ {panelTitle(entry.id, t)}</button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
