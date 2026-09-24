"use client";

import { useEffect, useMemo, useState } from "react";
import type { DataObject, Template } from "../engine/types";
import { layoutDocument } from "../engine/layout";
import { card, fieldBase, kicker } from "../ui";
import { Segmented } from "../design/inspector/Segmented";
import { VariantGallery, variantSets } from "./VariantGallery";

export function PreviewMode({ template, layoutId, viewId, sampleData, sampleValues = {}, sampleCount, onSampleCount, compiled }: { template: Template; layoutId: string; viewId: string; sampleData: DataObject; sampleValues?: Record<string, unknown>; sampleCount: number; onSampleCount: (n: number) => void; compiled: unknown }) {
  const [source, setSource] = useState<"sample" | "agent">("sample");
  const [html, setHtml] = useState("");
  const result = useMemo(() => layoutDocument(template, sampleData, { layoutId, viewId }), [template, sampleData, layoutId, viewId]);
  const sets = useMemo(() => variantSets(template), [template]);
  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const response = await fetch("/api/templates/render-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template: compiled, sampleData, format: "html", layoutId, viewId }) });
      const payload = await response.json();
      setHtml(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#e9e9ee;}body{padding:10mm;}</style></head><body>${payload.html || ""}</body></html>`);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [compiled, sampleData, layoutId, viewId]);
  const repeatCounts = Object.values(result.itemCounts);
  return (
    <div className="grid items-start gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
      <div className="grid gap-3">
        <section className={`${card} p-5`}>
          <p className={kicker}>Data</p>
          <div className="mt-2"><Segmented value={source} options={[["sample", "Sample data"], ["agent", "Agent output"]]} onChange={setSource} /></div>
          {source === "sample" ? <div className="mt-3 flex items-center gap-2 text-sm text-ink">Generate <input type="number" min="1" max="60" className={`${fieldBase} w-20 px-2 py-1 text-sm`} value={sampleCount} onChange={(event) => onSampleCount(Math.max(1, Math.min(60, Number(event.target.value) || 1)))} /> items</div> : <p className="m-0 mt-3 text-xs text-soft-ink">Run an agent and pick this template in its Configure output step — the preview there uses the real output.</p>}
        </section>
        <section className={`${card} p-5`}>
          <p className={kicker}>Result</p>
          <p className="m-0 mt-2 text-2xl font-bold text-ink">{result.pages.length} page{result.pages.length === 1 ? "" : "s"}</p>
          <p className="m-0 text-xs text-soft-ink">{repeatCounts.length ? `${Math.max(...repeatCounts)} repeated item${Math.max(...repeatCounts) === 1 ? "" : "s"}` : "No repeating groups"}</p>
          {result.overflows.length ? <p className="m-0 mt-3 rounded-xl border border-[var(--color-warn)]/40 bg-[rgba(178,94,0,0.08)] px-3 py-2 text-xs text-[var(--color-warn)]">⚠ {result.overflows.length} element{result.overflows.length === 1 ? "" : "s"} exceed the page bounds (page {result.overflows[0].pageIndex + 1}). Use a flow group or shrink the content.</p> : <p className="m-0 mt-3 rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-xs text-soft-ink">✓ Everything fits.</p>}
        </section>
      </div>
      <div className="grid gap-3">
        <VariantGallery sets={sets} fields={template.fields} sampleValues={sampleValues} itemsShown={sampleCount} onShowAll={onSampleCount} />
        <div className={`${card} overflow-hidden`}><iframe title="Preview" sandbox="" srcDoc={html} className="h-[760px] w-full border-0" /></div>
      </div>
    </div>
  );
}
