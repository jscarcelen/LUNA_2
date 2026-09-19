"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GenerationProgress } from "./GenerationProgress";
import { applyOutputCustomization, renderPlainOutputHtml, renderPlainOutputText, wrapPreviewDocument } from "./previewHtml";

const TABS = [
  { id: "preview", label: "Preview" },
  { id: "data", label: "Data" },
  { id: "raw", label: "Raw" }
];

function useDebouncedValue(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function downloadBase64(fileBase64, mimeType, filename) {
  const bytes = Uint8Array.from(atob(fileBase64), (char) => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Builds the data object the template renderer expects from raw agent items + the user's mapping.
 * Exported so the save path in RunAgentPage produces exactly what the preview showed.
 */
export function buildTemplateData(items, templateFields, fieldMappingByTemplateField, template, rootData = {}) {
  const itemFields = templateFields.filter((field) => field.frequency !== "once");
  const onceFields = templateFields.filter((field) => field.frequency === "once");
  const mappedItems = items.map((item) => itemFields.reduce((mapped, field) => {
    const sourceName = fieldMappingByTemplateField[field.name] || field.name;
    mapped[field.name] = item[field.name] ?? item[sourceName];
    return mapped;
  }, {}));
  // Once-per-document slots read from the agent's root output (e.g. a title), falling back to the first item.
  const root = onceFields.reduce((mapped, field) => {
    const sourceName = fieldMappingByTemplateField[field.name] || field.name;
    mapped[field.name] = rootData[sourceName] ?? rootData[field.name] ?? items[0]?.[sourceName] ?? items[0]?.[field.name];
    return mapped;
  }, {});
  return template?.repeatCollectionField ? { ...root, [template.repeatCollectionField]: mappedItems } : { ...root, ...(mappedItems[0] || {}) };
}

/**
 * Sticky right-hand pane: live rendered preview of the agent output, updated as the user changes
 * template, mapping or brand settings. Template output is rendered server-side (the same code
 * path used for saving/exporting) and shown inside a sandboxed iframe via srcDoc.
 */
export function LivePreviewPane({
  items,
  rootData = {},
  fields,
  fieldTypeByName,
  customization,
  template,
  templateFields,
  fieldMappingByTemplateField,
  mappingReady,
  generation,
  onCancelGeneration,
  agentName,
  emptyHint
}) {
  const [tab, setTab] = useState("preview");
  const [templateHtml, setTemplateHtml] = useState("");
  const [templateError, setTemplateError] = useState("");
  const [isRendering, setIsRendering] = useState(false);
  const [exporting, setExporting] = useState("");
  const [device, setDevice] = useState("desktop");
  const iframeRef = useRef(null);

  const visible = useMemo(() => applyOutputCustomization(items, fields, customization), [items, fields, customization]);
  const brand = customization.brand || {};
  const templateData = useMemo(
    () => (template ? buildTemplateData(visible.items, templateFields, fieldMappingByTemplateField, template, rootData) : null),
    [template, visible.items, templateFields, fieldMappingByTemplateField, rootData]
  );
  const debouncedTemplateData = useDebouncedValue(templateData, 300);

  useEffect(() => {
    if (!template || !debouncedTemplateData || !visible.items.length || !mappingReady) {
      setTemplateHtml("");
      setTemplateError("");
      return undefined;
    }
    let cancelled = false;
    setIsRendering(true);
    fetch("/api/templates/render-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template, sampleData: debouncedTemplateData, format: "html" })
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "Template rendering failed");
        if (!cancelled) {
          setTemplateHtml(payload.html || "");
          setTemplateError("");
        }
      })
      .catch((error) => {
        if (!cancelled) setTemplateError(String(error.message || error));
      })
      .finally(() => {
        if (!cancelled) setIsRendering(false);
      });
    return () => {
      cancelled = true;
    };
  }, [template, debouncedTemplateData, visible.items.length, mappingReady]);

  const fragment = template && templateHtml
    ? templateHtml
    : renderPlainOutputHtml(visible.items, visible.fields, fieldTypeByName, brand, rootData, fields.filter((field) => field.repeatScope === "once"));
  const documentHtml = useMemo(() => wrapPreviewDocument(fragment, brand, { header: !(template && templateHtml) }), [fragment, brand, template, templateHtml]);
  const rawText = useMemo(() => renderPlainOutputText(visible.items, visible.fields, fieldTypeByName), [visible, fieldTypeByName]);

  async function handleExport(format) {
    if (!template || !templateData) return;
    setExporting(format);
    try {
      const response = await fetch("/api/templates/render-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template, sampleData: templateData, format })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Export failed");
      downloadBase64(payload.fileBase64, payload.mimeType, `${agentName || "agent-output"}.${format}`);
    } catch (error) {
      setTemplateError(String(error.message || error));
    } finally {
      setExporting("");
    }
  }

  function handleCopy(text) {
    navigator.clipboard?.writeText(text).catch(() => {});
  }

  const hasOutput = items.length > 0;
  const isBusy = generation.isGenerating;

  return (
    <div className="@container flex h-full min-h-[520px] flex-col overflow-hidden rounded-bento border border-ink/8 bg-paper shadow-glow">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/10 px-4 py-3">
        <div className="flex items-center gap-1 rounded-full bg-ink/5 p-1 ring-1 ring-ink/10">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${tab === item.id ? "bg-ink text-bg shadow" : "text-soft-ink hover:text-ink"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {tab === "preview" ? (
            <div className="hidden items-center gap-1 rounded-full bg-ink/5 p-1 ring-1 ring-ink/10 @lg:flex" aria-label="Preview width">
              {["desktop", "mobile"].map((option) => (
                <button key={option} type="button" onClick={() => setDevice(option)} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize transition ${device === option ? "bg-ink/15 text-ink" : "text-soft-ink hover:text-ink"}`}>{option}</button>
              ))}
            </div>
          ) : null}
          {template && hasOutput ? (
            <>
              <button type="button" disabled={Boolean(exporting) || !mappingReady} onClick={() => handleExport("pdf")} className="rounded-full px-3 py-1 text-xs font-semibold text-ink ring-1 ring-ink/15 transition hover:bg-ink/10 disabled:opacity-40">{exporting === "pdf" ? "…" : "PDF"}</button>
              <button type="button" disabled={Boolean(exporting) || !mappingReady} onClick={() => handleExport("docx")} className="rounded-full px-3 py-1 text-xs font-semibold text-ink ring-1 ring-ink/15 transition hover:bg-ink/10 disabled:opacity-40">{exporting === "docx" ? "…" : "DOCX"}</button>
              {template.docModel || (template.templateV3 && template.templateV3.layouts?.[0]?.class === "slides") ? <button type="button" disabled={Boolean(exporting) || !mappingReady} onClick={() => handleExport("pptx")} className="rounded-full px-3 py-1 text-xs font-semibold text-ink ring-1 ring-ink/15 transition hover:bg-ink/10 disabled:opacity-40">{exporting === "pptx" ? "…" : "PPTX"}</button> : null}
            </>
          ) : null}
          {hasOutput ? (
            <button type="button" onClick={() => handleCopy(tab === "data" ? JSON.stringify(visible.items, null, 2) : rawText)} className="rounded-full px-3 py-1 text-xs font-semibold text-ink ring-1 ring-ink/15 transition hover:bg-ink/10">Copy</button>
          ) : null}
        </div>
      </div>

      <div className="relative flex-1 bg-ink/[0.06]">
        {isBusy || generation.error ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 p-5">
            <div className="w-full max-w-lg">
              <GenerationProgress
                steps={generation.steps}
                tokenChars={generation.tokenChars}
                tokenTail={generation.tokenTail}
                elapsedMs={generation.elapsedMs}
                isGenerating={generation.isGenerating}
                error={generation.error}
                onCancel={onCancelGeneration}
              />
            </div>
          </div>
        ) : null}

        {!hasOutput && !isBusy ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="grid size-16 place-items-center rounded-3xl bg-gradient-to-br from-teal/20 to-mustard/20 ring-1 ring-ink/10">
              <svg viewBox="0 0 24 24" className="size-8 text-warn" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /><circle cx="12" cy="12" r="3.5" /></svg>
            </div>
            <p className="m-0 text-base font-semibold text-ink">Your output will appear here</p>
            <p className="m-0 max-w-sm text-sm text-soft-ink">{emptyHint || "Complete the steps on the left and press Generate. The preview updates live as you tweak the template or styling."}</p>
          </div>
        ) : null}

        {hasOutput && tab === "preview" ? (
          <div className="h-full overflow-auto p-3 sm:p-4">
            <div className={`mx-auto h-full min-h-[480px] overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/20 transition-all duration-300 ${device === "mobile" ? "max-w-[390px]" : "max-w-none"}`}>
              {isRendering ? <div className="h-1 animate-shimmer bg-[linear-gradient(90deg,transparent,var(--color-teal),transparent)] bg-[length:200%_100%]" /> : null}
              <iframe
                ref={iframeRef}
                title="Output preview"
                sandbox=""
                srcDoc={documentHtml}
                className="h-full min-h-[480px] w-full border-0"
              />
            </div>
            {templateError ? <p className="mt-2 text-xs text-danger">{templateError}</p> : null}
            {template && !mappingReady ? <p className="mt-2 text-xs text-warn">Finish mapping the template fields to see the templated preview. Showing the plain layout meanwhile.</p> : null}
          </div>
        ) : null}

        {hasOutput && tab === "data" ? (
          <pre className="m-0 h-full overflow-auto p-4 font-mono text-xs leading-relaxed text-ink/90">{JSON.stringify(visible.items, null, 2)}</pre>
        ) : null}

        {hasOutput && tab === "raw" ? (
          <pre className="m-0 h-full overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed text-ink/90">{rawText}</pre>
        ) : null}
      </div>
    </div>
  );
}
