"use client";

import { useState } from "react";

const ghostBtn = "inline-flex items-center justify-between gap-2 rounded-xl border border-ink/12 bg-white px-3 py-2 text-sm font-semibold text-ink transition hover:border-[var(--accent)]/50 disabled:opacity-40";

const LABELS = { pdf: ["PDF", "print ready"], docx: ["Word", "editable"], pptx: ["PowerPoint", "one slide per page"], html: ["HTML", "any browser"] };

/**
 * Every export of a resource: one row per template view (student / answer key / slides…) × format.
 * Views come from the template the resource was generated with; formats from the view's settings.
 */
export function ResourceExports({ resource, template, onStatus }) {
  const [busy, setBusy] = useState("");
  const layouts = template?.templateV3?.layouts || [];
  const views = layouts.flatMap((layout) => (layout.views || []).map((view) => ({ layout, view })));
  const data = resource?.data || {};

  async function download(layoutId, viewId, format, label) {
    setBusy(`${viewId}-${format}`);
    onStatus?.("");
    try {
      const response = await fetch("/api/templates/render-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: template.templateV3 ? { ...template, templateV3: template.templateV3 } : template, sampleData: data, format, layoutId, viewId })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Export failed");
      const blob = format === "html"
        ? new Blob([`<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#fff">${payload.html}</body></html>`], { type: "text/html" })
        : new Blob([Uint8Array.from(atob(payload.fileBase64), (char) => char.charCodeAt(0))], { type: payload.mimeType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${resource.name} · ${label}.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      onStatus?.(String(error.message || error));
    } finally {
      setBusy("");
    }
  }

  if (!template) return <p className="m-0 text-sm text-soft-ink">This resource was generated without a template, so only the interactive version and its saved HTML are available. Regenerate it with a template to export PDF / Word / PowerPoint.</p>;
  return (
    <div className="grid gap-3">
      {views.map(({ layout, view }) => {
        const formats = view.exports && view.exports.length ? view.exports : layout.class === "slides" ? ["pptx", "pdf"] : ["pdf", "docx", "html_print"];
        return (
          <div key={`${layout.id}-${view.id}`} className="rounded-2xl border border-ink/10 p-3">
            <p className="m-0 text-sm font-bold text-ink">{view.name}</p>
            <p className="m-0 text-[11px] text-soft-ink">{view.description || (layout.class === "slides" ? "Slides" : "Paged document")} · {layout.canvas.width}×{layout.canvas.height} mm</p>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {formats.map((format) => {
                const key = format === "html_print" ? "html" : format;
                const label = LABELS[key];
                if (!label) return null;
                return <button key={format} type="button" className={ghostBtn} disabled={Boolean(busy)} onClick={() => download(layout.id, view.id, key, view.name)}><span>{label[0]}</span><span className="text-xs font-normal text-soft-ink">{busy === `${view.id}-${key}` ? "Preparing…" : label[1]}</span></button>;
              })}
            </div>
          </div>
        );
      })}
      {!views.length ? <p className="m-0 text-sm text-soft-ink">This template has no views yet.</p> : null}
    </div>
  );
}
