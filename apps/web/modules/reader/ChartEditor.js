"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CHART_COLORS, chartToSvg, normalizeChart } from "../document-processing/renderers/chartSvg.js";
import { useT } from "../../lib/i18n/LocaleProvider.js";

const pill = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-4 py-1.5 text-sm font-semibold text-ink transition hover:bg-[var(--surface-soft)]";
const cell = "w-full min-w-[4.5rem] rounded-md border border-ink/12 bg-white px-2 py-1 text-sm text-ink";

/**
 * Play with a chart's numbers: the table is the chart's data, the picture above it redraws as you type.
 * `initial` is the chart object; `onApply(chart)` puts the new numbers in the page; `onCancel()` closes.
 */
export function ChartEditor({ initial, canSave, onApply, onCancel }) {
  const t = useT();
  const start = useMemo(() => normalizeChart(initial), [initial]);
  const [type, setType] = useState(start.type);
  const [categories, setCategories] = useState(start.categories);
  const [names, setNames] = useState(start.series.map((entry) => entry.name));
  const [values, setValues] = useState(start.series.map((entry) => entry.values.map((value) => (value === null ? "" : String(value)))));
  const chart = useMemo(() => normalizeChart({ ...start, type, categories, series: names.map((name, s) => ({ name, values: values[s] })) }), [start, type, categories, names, values]);

  const setValue = (s, i, text) => setValues((all) => all.map((row, index) => (index === s ? row.map((value, k) => (k === i ? text : value)) : row)));
  const addRow = () => { setCategories((all) => [...all, ""]); setValues((all) => all.map((row) => [...row, ""])); };
  const dropRow = (i) => { setCategories((all) => all.filter((_, k) => k !== i)); setValues((all) => all.map((row) => row.filter((_, k) => k !== i))); };
  const addSeries = () => { setNames((all) => [...all, t("courses.ce.seriesN", { n: all.length + 1 })]); setValues((all) => [...all, categories.map(() => "")]); };
  const dropSeries = (s) => { setNames((all) => all.filter((_, k) => k !== s)); setValues((all) => all.filter((_, k) => k !== s)); };

  return createPortal(
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/35 p-4"
      onMouseUp={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Escape") onCancel(); }}
    >
      <div role="dialog" aria-label={t("courses.ce.aria")} className="grid max-h-[92vh] w-full max-w-3xl grid-rows-[auto_auto_1fr_auto] gap-3 overflow-hidden rounded-[18px] border border-ink/10 bg-white p-5 shadow-[0_24px_60px_rgba(0,0,0,0.25)]">
        <div className="flex flex-wrap items-center gap-2">
          <p className="m-0 mr-auto text-base font-bold text-ink">{t("courses.ce.title")}</p>
          <button type="button" className={`${pill} ${type === "bar" ? "bg-[var(--accent-soft)]" : ""}`} onClick={() => setType("bar")}>{t("courses.ce.bars")}</button>
          <button type="button" className={`${pill} ${type === "line" ? "bg-[var(--accent-soft)]" : ""}`} onClick={() => setType("line")}>{t("courses.ce.lines")}</button>
        </div>
        <div className="rounded-xl border border-ink/8 p-2" dangerouslySetInnerHTML={{ __html: chartToSvg(chart) }} />
        <div className="min-h-0 overflow-auto rounded-xl border border-ink/10">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-[var(--surface-soft)]">
              <tr>
                <th className="p-1.5 text-left text-xs text-soft-ink">{t("courses.ce.label")}</th>
                {names.map((name, s) => (
                  <th key={s} className="p-1.5">
                    <div className="flex items-center gap-1">
                      <span className="size-3 shrink-0 rounded-sm" style={{ background: CHART_COLORS[s % CHART_COLORS.length] }} />
                      <input className={cell} value={name} onChange={(event) => setNames((all) => all.map((entry, k) => (k === s ? event.target.value : entry)))} aria-label={t("courses.ce.seriesName", { n: s + 1 })} />
                      {names.length > 1 ? <button type="button" aria-label={t("courses.ce.removeSeries")} className="px-1 text-soft-ink hover:text-[var(--color-danger)]" onClick={() => dropSeries(s)}>×</button> : null}
                    </div>
                  </th>
                ))}
                <th className="p-1.5"><button type="button" className="text-xs font-semibold text-[var(--accent)]" onClick={addSeries}>{t("courses.ce.addSeries")}</button></th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category, i) => (
                <tr key={i} className="border-t border-ink/8">
                  <td className="p-1"><input className={cell} value={category} onChange={(event) => setCategories((all) => all.map((entry, k) => (k === i ? event.target.value : entry)))} aria-label={t("courses.ce.labelN", { n: i + 1 })} /></td>
                  {names.map((_, s) => (
                    <td key={s} className="p-1"><input className={cell} inputMode="decimal" value={values[s]?.[i] ?? ""} onChange={(event) => setValue(s, i, event.target.value)} aria-label={`${names[s]} · ${category || i + 1}`} /></td>
                  ))}
                  <td className="p-1 text-center"><button type="button" aria-label={t("courses.ce.removeRow")} className="px-1 text-soft-ink hover:text-[var(--color-danger)]" onClick={() => dropRow(i)}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="m-2 text-xs font-semibold text-[var(--accent)]" onClick={addRow}>{t("courses.ce.addRow")}</button>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canSave ? null : <span className="mr-auto text-[11px] text-soft-ink">{t("courses.ce.playOnly")}</span>}
          <button type="button" className={pill} onClick={onCancel}>{t("common.cancel")}</button>
          <button type="button" className="inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-5 py-1.5 text-sm font-semibold text-white" onClick={() => onApply(chart)}>{canSave ? t("courses.ce.apply") : t("courses.ce.show")}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
