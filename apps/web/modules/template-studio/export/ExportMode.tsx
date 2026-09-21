"use client";

import { useState } from "react";
import type { FieldDef, Layout, View } from "../engine/types";
import { buildActivity } from "../../activities/engine/activity";
import { renderActivityHtml } from "../../activities/engine/html";
import { EXPORTS_BY_CLASS } from "../engine/types";
import { card, kicker, primaryBtn } from "../ui";

const LABELS: Record<string, [string, string]> = { pdf: ["PDF", "Print-ready"], docx: ["Word", "Editable text"], html_print: ["HTML", "Paged, any browser"], png: ["PNG", "Images (coming soon)"], pptx: ["PowerPoint", "One slide per page"], html_slideshow: ["HTML slideshow", "Coming soon"] };

export function ExportMode({ layout, view, compiled, sampleData, layoutId, viewId, name, dirty, onSave, busy, fields = [] }: { layout: Layout; view: View | null; compiled: unknown; fields?: FieldDef[]; sampleData: unknown; layoutId: string; viewId: string; name: string; dirty: boolean; onSave: () => void; busy: boolean }) {
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  async function exportAs(format: string) {
    const apiFormat = format === "html_print" ? "html" : format;
    setWorking(format);
    setError("");
    try {
      const response = await fetch("/api/templates/render-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template: compiled, sampleData, format: apiFormat, layoutId, viewId }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Export failed");
      const blob = apiFormat === "html" ? new Blob([`<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#fff">${payload.html}</body></html>`], { type: "text/html" }) : new Blob([Uint8Array.from(atob(payload.fileBase64), (char) => char.charCodeAt(0))], { type: payload.mimeType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${name || "template"}.${apiFormat}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(String((caught as Error).message || caught));
    } finally {
      setWorking("");
    }
  }
  const formats = EXPORTS_BY_CLASS[layout.class].filter((format) => !view?.exports || view.exports.includes(format));
  const activity = (() => { try { return buildActivity(fields, (sampleData || {}) as Record<string, unknown>, { title: name }); } catch { return null; } })();
  function exportInteractive() {
    if (!activity) return;
    const blob = new Blob([renderActivityHtml(activity)], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${name || "activity"}.interactive.html`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="grid items-start gap-3 lg:grid-cols-2">
      {activity && activity.questions.length ? (
        <section className={`${card} border-2 border-[var(--accent)]/30 p-5 lg:col-span-2`}>
          <p className={kicker}>Interactive · default for activities</p>
          <p className="m-0 mt-1 text-sm text-soft-ink">This template has {activity.questions.length} answerable question{activity.questions.length === 1 ? "" : "s"} (sample data). Documents made from it with an agent can be done on Luna — answers are checked and tracked. Files below are the printable alternative.</p>
          <button type="button" className={`${primaryBtn} mt-3`} onClick={exportInteractive}>Download interactive HTML (sample)</button>
        </section>
      ) : null}
      <section className={`${card} p-5`}>
        <p className={kicker}>{view?.name || layout.name} · {layout.class === "slides" ? "Slides" : "Paged document"}</p>
        <p className="m-0 mt-1 text-xs text-soft-ink">Formats chosen for this view (change them under Views → Settings).</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {formats.map((format) => {
            const disabled = format === "png" || format === "html_slideshow";
            return <button key={format} type="button" disabled={disabled || Boolean(working)} onClick={() => exportAs(format)} className="rounded-2xl border border-ink/10 bg-white p-4 text-left transition hover:border-[var(--accent)]/50 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] disabled:opacity-40"><span className="block text-base font-bold text-ink">{LABELS[format][0]}</span><span className="block text-xs text-soft-ink">{working === format ? "Preparing…" : LABELS[format][1]}</span></button>;
          })}
        </div>
        {error ? <p className="m-0 mt-2 text-xs text-[var(--color-danger)]">{error}</p> : null}
        <p className="m-0 mt-3 text-xs text-soft-ink">Exports here use sample data. Real documents come from agents, which offer the same formats.</p>
      </section>
      <section className={`${card} p-5`}>
        <p className={kicker}>Save &amp; share</p>
        <p className="m-0 mt-1 text-xs text-soft-ink">Saved templates appear in every agent's Configure output step, and can be listed in the marketplace on their own.</p>
        <button type="button" className={`${primaryBtn} mt-3`} onClick={onSave} disabled={busy || !dirty}>{dirty ? "Save template" : "Saved"}</button>
      </section>
    </div>
  );
}
