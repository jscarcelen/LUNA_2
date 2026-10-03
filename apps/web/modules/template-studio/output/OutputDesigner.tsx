"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ACCENT_PRESETS, builtInBlocks } from "../engine/blocks";
import { defaultToggles, findBlock } from "../engine/outputTemplate";
import type { Template } from "../engine/types";
import { FormatCard, VisualizeModal } from "../TemplateWizard";
import { card, fieldBase, ghostBtn, kicker } from "../ui";
import { formatsOf, resolveStyle, styleFromTemplate, type OutputDocument, type OutputPlan, type OutputStyles } from "./outputDocument";

/* ─── rendering helpers (shared with the run page's save / print / download) ───────────── */

export interface PreviewSelection { layoutIndex: number; viewIndex: number }

function idsFor(doc: OutputDocument, selection: PreviewSelection) {
  const layout = doc.template.layouts[Math.min(selection.layoutIndex, doc.template.layouts.length - 1)] || doc.template.layouts[0];
  const view = layout.views[Math.min(selection.viewIndex, layout.views.length - 1)] || layout.views[0];
  return { layout, view };
}

async function callRender(doc: OutputDocument, selection: PreviewSelection, format: string) {
  const { layout, view } = idsFor(doc, selection);
  const response = await fetch("/api/templates/render-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ template: doc.compiled, sampleData: doc.data, format, layoutId: layout.id, viewId: view?.id || null })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error || "Rendering failed");
  return payload as { html?: string; fileBase64?: string; mimeType?: string };
}

/** The document's HTML for the chosen page size and view. `forPrint` drops the screen backdrop. */
export async function renderOutputHtml(doc: OutputDocument, selection: PreviewSelection, forPrint = false): Promise<string> {
  const { html } = await callRender(doc, selection, "html");
  const backdrop = forPrint ? "html,body{margin:0;background:#fff}" : "html,body{margin:0;background:#e9e9ee}body{padding:10mm}";
  return `<!doctype html><html><head><meta charset="utf-8"><style>${backdrop}</style></head><body>${html || ""}</body></html>`;
}

export async function downloadOutput(doc: OutputDocument, selection: PreviewSelection, format: "pdf" | "docx" | "pptx", filename: string): Promise<void> {
  const payload = await callRender(doc, selection, format);
  if (!payload.fileBase64) throw new Error("Export failed");
  const bytes = Uint8Array.from(atob(payload.fileBase64), (char) => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: payload.mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${filename}.${format}`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/* ─── left: components, format and colour ──────────────────────────────────────────────── */

export interface SavedTemplateRow { id: string; name: string; templateV3?: Template | null; [key: string]: unknown }

export interface OutputStylePanelProps {
  /** Null for outputs laid out automatically (only the colour can be chosen). */
  plan: OutputPlan | null;
  styles: OutputStyles;
  onStylesChange: (next: OutputStyles) => void;
  /** Accent for automatic outputs. */
  autoAccentId?: string;
  onAutoAccentChange?: (id: string) => void;
  savedTemplates?: SavedTemplateRow[];
  templatesLoading?: boolean;
  onRefreshTemplates?: () => void;
  onOpenTemplateStudio?: () => void;
  /** The name the file is saved under, offered as the footer text. */
  fileName?: string;
}

function ColorRow({ selected, onPick, compact = false }: { selected?: string; onPick: (id: string) => void; compact?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ACCENT_PRESETS.map((preset) => (
        <button key={preset.id} type="button" title={preset.label} onClick={() => onPick(preset.id)}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition ${selected === preset.id ? "border-[var(--accent)] bg-[var(--accent-soft)] text-ink" : "border-ink/15 text-soft-ink hover:border-[var(--accent)]/50 hover:bg-[var(--accent-soft)]"}`}>
          <span className="size-2.5 rounded-full" style={{ background: preset.main }} />{compact ? null : preset.label}
        </button>
      ))}
    </div>
  );
}

export function OutputStylePanel({ plan, styles, onStylesChange, autoAccentId, onAutoAccentChange, savedTemplates = [], templatesLoading, onRefreshTemplates, onOpenTemplateStudio, fileName }: OutputStylePanelProps) {
  const allBlocks = useMemo(() => builtInBlocks(), []);
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());
  const [visualize, setVisualize] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [note, setNote] = useState("");

  const keys = plan ? plan.components.map((component) => component.key) : [];
  const resolved = useMemo(() => Object.fromEntries(keys.map((key) => [key, resolveStyle(key, styles)])), [keys.join("|"), styles]); // eslint-disable-line react-hooks/exhaustive-deps

  const blockFormats = useMemo(() => new Map(keys.map((key) => [key, resolved[key]?.block.id || key])), [resolved]); // eslint-disable-line react-hooks/exhaustive-deps
  const blockAccents = useMemo(() => new Map(keys.map((key) => [key, resolved[key]?.accent.id || ACCENT_PRESETS[0].id])), [resolved]); // eslint-disable-line react-hooks/exhaustive-deps
  const blockToggles = useMemo(() => new Map(keys.map((key) => [key, styles[key]?.toggles || {}])), [styles]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key: string, patch: Partial<OutputStyles[string]>) => onStylesChange({ ...styles, [key]: { ...styles[key], ...patch } });
  const closeCard = (key: string) => setOpenKeys((current) => { const next = new Set(current); next.delete(key); return next; });

  /** Formats several components offer under the same name (e.g. a "Kids" look), to force across all of them. */
  const sharedFormats = useMemo(() => {
    const names = new Set<string>();
    for (const key of keys) { const formats = formatsOf(key); if (formats.length > 1) formats.forEach((format) => names.add(format.variant || format.name)); }
    return [...names];
  }, [keys.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyColorToAll(accentId: string) {
    const next: OutputStyles = { ...styles };
    for (const key of keys) next[key] = { ...next[key], accentId };
    onStylesChange(next);
    setOpenKeys(new Set());
  }
  function applyFormatToAll(name: string) {
    const next: OutputStyles = { ...styles };
    for (const key of keys) {
      const match = formatsOf(key).find((format) => (format.variant || format.name) === name);
      if (match) next[key] = { ...next[key], blockId: match.id };
    }
    onStylesChange(next);
  }
  function applyTemplate() {
    const row = savedTemplates.find((item) => item.id === templateId);
    if (!row) return;
    const template = (row.templateV3 || (Array.isArray((row as { layouts?: unknown }).layouts) ? (row as unknown as Template) : null)) as Template | null;
    const found = styleFromTemplate(template, keys);
    const count = Object.keys(found).length;
    if (count) onStylesChange({ ...styles, ...Object.fromEntries(Object.entries(found).map(([key, style]) => [key, { ...styles[key], ...style }])) });
    setNote(count ? `"${row.name}" styled ${count} of ${keys.length} components.` : `"${row.name}" has none of this output's components, so nothing changed.`);
  }

  if (!plan) {
    return (
      <div className={`${card} p-5`}>
        <p className={kicker}>Output</p>
        <p className="m-0 mt-1 text-sm font-bold text-ink">Item cards</p>
        <p className="m-0 mt-1 text-xs text-soft-ink">This agent returns free-form fields, so Template Studio lays them out automatically: a header, one card per item and a footer. Choose the colour.</p>
        <div className="mt-3"><ColorRow selected={autoAccentId || ACCENT_PRESETS[0].id} onPick={(id) => onAutoAccentChange?.(id)} /></div>
      </div>
    );
  }

  const fixed = plan.components.filter((component) => component.fixed);
  const content = plan.components.filter((component) => !component.fixed);
  const cardFor = (key: string) => {
    const block = findBlock(key);
    if (!block) return null;
    return (
      <FormatCard key={key} origId={key} block={block} allBlocks={allBlocks}
        blockFormats={blockFormats} blockAccents={blockAccents} blockToggles={blockToggles} openBlocks={openKeys}
        onSelectFormat={(id, blockId) => set(id, { blockId })}
        onSelectColor={(id, accentId) => { set(id, { accentId }); closeCard(id); }}
        onToggleOption={(id, optionKey, value) => set(id, { toggles: { ...(styles[id]?.toggles || {}), [optionKey]: value } })}
        onToggleOpen={(id) => setOpenKeys((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })}
        onVisualize={(id) => setVisualize(id)} />
    );
  };

  const visualizeBlock = visualize ? resolved[visualize]?.block : null;

  return (
    <div className="grid gap-3">
      <div className={`${card} p-4`}>
        <p className={kicker}>Style the output</p>
        <p className="m-0 mt-1 text-xs text-soft-ink">Every component below comes from Template Studio: pick its format and colour one by one, set one for all, or apply a saved template.</p>
        <div className="mt-3 grid gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[12px] font-semibold text-soft-ink">One color for all:</span>
            <ColorRow onPick={applyColorToAll} compact />
          </div>
          {sharedFormats.length ? (
            <div className="flex flex-wrap items-center gap-3 border-t border-ink/8 pt-3">
              <span className="text-[12px] font-semibold text-soft-ink">One format for all:</span>
              <div className="flex flex-wrap gap-1.5">
                {sharedFormats.map((name) => <button key={name} type="button" onClick={() => applyFormatToAll(name)} className="rounded-full border border-ink/15 px-3 py-1 text-[11px] font-semibold text-soft-ink transition hover:border-[var(--accent)]/50 hover:bg-[var(--accent-soft)]">{name}</button>)}
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 border-t border-ink/8 pt-3">
            <span className="text-[12px] font-semibold text-soft-ink">Apply a saved template:</span>
            <select className={`${fieldBase} min-w-40 flex-1 py-1.5 text-sm`} value={templateId} onChange={(event) => { setTemplateId(event.target.value); setNote(""); }}>
              <option value="">{templatesLoading ? "Loading templates…" : savedTemplates.length ? "Choose a template…" : "No saved templates yet"}</option>
              {savedTemplates.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
            <button type="button" className={ghostBtn} disabled={!templateId} onClick={applyTemplate}>Apply</button>
            {Object.keys(styles).length ? <button type="button" className="text-xs font-semibold text-soft-ink hover:underline" onClick={() => { onStylesChange({}); setNote("Back to Template Studio's default look."); }}>Reset</button> : null}
          </div>
          {note ? <p className="m-0 text-xs text-[var(--accent-ink)]">{note}</p> : null}
          <div className="flex items-center gap-3 text-xs">
            {onRefreshTemplates ? <button type="button" className="font-semibold text-soft-ink hover:underline" onClick={onRefreshTemplates} disabled={templatesLoading}>{templatesLoading ? "Refreshing…" : "Refresh templates"}</button> : null}
            {onOpenTemplateStudio ? <button type="button" className="font-semibold text-[var(--accent-ink)] hover:underline" onClick={onOpenTemplateStudio}>Design a template in Template Studio →</button> : null}
          </div>
        </div>
      </div>

      {fixed.length ? (
        <div>
          <p className={`${kicker} mb-1 px-1`}>Structure</p>
          {fixed.map((component) => (
            <div key={component.key}>
              {cardFor(component.key)}
              <label className="mb-3 mt-2.5 flex items-center gap-2 px-2 text-xs text-soft-ink">
                <input type="checkbox" checked={!styles[component.key]?.hidden} onChange={(event) => set(component.key, { hidden: !event.target.checked })} />
                {styles[component.key]?.hidden ? "Hidden — tick to show it again" : "Shown on the document (untick to remove it)"}
              </label>
              {(component.key === "block-header-exam" || component.key === "block-header-minimal") && !styles[component.key]?.hidden ? (
                <div className="-mt-1 mb-3 flex flex-wrap items-center gap-2 px-2">
                  <span className="text-xs text-soft-ink">Title</span>
                  <input className={`${fieldBase} min-w-40 flex-1 py-1 text-xs`} value={styles[component.key]?.text ?? plan.title} onChange={(event) => set(component.key, { text: event.target.value })} />
                  <button type="button" className="text-xs font-semibold text-[var(--accent-ink)] hover:underline" onClick={() => set(component.key, { text: undefined })}>Default</button>
                  <span className="basis-full text-[10px] text-soft-ink">Printed in the header and shown on the interactive version too.</span>
                </div>
              ) : null}
              {component.key === "block-footer" && !styles[component.key]?.hidden ? (
                <div className="-mt-1 mb-3 flex flex-wrap items-center gap-2 px-2">
                  <span className="text-xs text-soft-ink">Footer text</span>
                  <input className={`${fieldBase} min-w-40 flex-1 py-1 text-xs`} value={styles[component.key]?.text ?? plan.footerText} onChange={(event) => set(component.key, { text: event.target.value })} />
                  <button type="button" className="text-xs font-semibold text-[var(--accent-ink)] hover:underline" onClick={() => set(component.key, { text: undefined })}>Default</button>
                  {fileName ? <button type="button" className="text-xs font-semibold text-[var(--accent-ink)] hover:underline" onClick={() => set(component.key, { text: fileName })}>Use the file name</button> : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {content.length ? (
        <div>
          <p className={`${kicker} mb-1 px-1`}>Components in this output</p>
          {content.map((component) => cardFor(component.key))}
        </div>
      ) : null}

      {visualize && visualizeBlock ? (
        <VisualizeModal block={visualizeBlock} accentId={resolved[visualize]?.accent.id || "blue"} toggles={{ ...defaultToggles(visualizeBlock), ...(styles[visualize]?.toggles || {}) }} allBlocks={allBlocks}
          onClose={() => setVisualize(null)} onConfirm={(blockId, accentId) => { set(visualize, { blockId, accentId }); closeCard(visualize); }} />
      ) : null}
    </div>
  );
}

/* ─── right: preview matrix ────────────────────────────────────────────────────────────── */

export interface OutputPreviewPaneProps {
  doc: OutputDocument | null;
  selection: PreviewSelection;
  onSelection: (next: PreviewSelection) => void;
  /** Text for the Data and Raw tabs. */
  dataJson: string;
  rawText: string;
  /** Progress / error overlay shown while the agent generates. */
  overlay?: ReactNode;
  emptyHint?: string;
  filename: string;
  onError?: (message: string) => void;
  /** The interactive HTML form of the output, shown in its own tab (separate from the page-size × view matrix). */
  interactive?: ReactNode;
}

const MM_PX = 3.78;

export function OutputPreviewPane({ doc, selection, onSelection, dataJson, rawText, overlay, emptyHint, onError, interactive }: OutputPreviewPaneProps) {
  const [tab, setTab] = useState<"preview" | "interactive" | "data" | "raw">("preview");
  const [html, setHtml] = useState("");
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState("");
  const [width, setWidth] = useState(560);
  const frameBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = frameBox.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => setWidth(node.clientWidth));
    observer.observe(node);
    setWidth(node.clientWidth);
    return () => observer.disconnect();
  }, [tab, Boolean(doc)]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!doc) { setHtml(""); return undefined; }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setRendering(true);
      try {
        const { html: rendered } = await callRender(doc, selection, "html");
        if (!cancelled) { setHtml(rendered || ""); setError(""); }
      } catch (failure) {
        if (!cancelled) setError(String((failure as Error).message || failure));
      } finally {
        if (!cancelled) setRendering(false);
      }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [doc, selection.layoutIndex, selection.viewIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = doc ? idsFor(doc, selection) : null;
  const pageWidthPx = (current?.layout.canvas.width || 210) * MM_PX;
  const zoom = Math.max(0.3, Math.min(1.25, (width - 8) / (pageWidthPx + 2 * 10 * MM_PX)));
  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#e9e9ee}body{padding:10mm;zoom:${zoom.toFixed(3)}}</style></head><body>${html}</body></html>`;
  const showMatrix = Boolean(doc && (doc.layouts.length > 1 || doc.views.length > 1));

  const tabButton = (id: typeof tab, label: string) => (
    <button key={id} type="button" onClick={() => setTab(id)} className={`rounded-full px-3 py-1 text-xs font-semibold transition ${tab === id ? "bg-ink text-white shadow" : "text-soft-ink hover:text-ink"}`}>{label}</button>
  );

  return (
    <div className="flex min-h-[560px] flex-col overflow-hidden rounded-[18px] border border-ink/8 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/10 px-4 py-3">
        <div className="flex items-center gap-1 rounded-full bg-ink/5 p-1 ring-1 ring-ink/10">{tabButton("preview", "Preview")}{interactive ? tabButton("interactive", "Interactive") : null}{tabButton("data", "Data")}{tabButton("raw", "Raw")}</div>
      </div>

      {showMatrix && doc && tab === "preview" ? (
        <div className="border-b border-ink/8 px-4 py-2.5">
          <table className="border-separate border-spacing-1 text-xs">
            <thead>
              <tr>
                <th className="pr-2 text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-soft-ink">View \ Page</th>
                {doc.layouts.map((layout) => <th key={layout.id} className="px-1 text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-soft-ink">{layout.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {doc.views.map((view, viewIndex) => (
                <tr key={view.name}>
                  <td className="pr-2 text-[12px] font-semibold text-ink">{view.name}</td>
                  {doc.layouts.map((layout, layoutIndex) => {
                    const on = selection.layoutIndex === layoutIndex && selection.viewIndex === viewIndex;
                    return (
                      <td key={layout.id} className="text-center">
                        <button type="button" onClick={() => onSelection({ layoutIndex, viewIndex })} aria-pressed={on} aria-label={`${view.name}, ${layout.label}`}
                          className={`min-w-14 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${on ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-ink/15 bg-white text-ink hover:border-[var(--accent)]/60 hover:bg-[var(--accent-soft)]"}`}>
                          {on ? "Showing" : "Show"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="relative flex-1 bg-ink/[0.06]">
        {overlay ? <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 p-5"><div className="w-full max-w-lg">{overlay}</div></div> : null}
        {!doc && !overlay ? (
          <div className="flex h-full min-h-[480px] flex-col items-center justify-center gap-2 p-8 text-center">
            <p className="m-0 text-base font-semibold text-ink">Your output will appear here</p>
            <p className="m-0 max-w-sm text-sm text-soft-ink">{emptyHint || "Generate in step 1 and the result appears here, laid out with Template Studio's components."}</p>
          </div>
        ) : null}
        {doc && tab === "preview" ? (
          <div ref={frameBox} className="h-[640px] overflow-hidden">
            {rendering ? <div className="h-0.5 animate-pulse bg-[var(--accent)]" /> : null}
            <iframe title="Output preview" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={srcDoc} className="h-full w-full border-0" />
          </div>
        ) : null}
        {doc && tab === "interactive" && interactive ? <div className="h-[640px] overflow-y-auto bg-[var(--bg)]">{interactive}</div> : null}
        {doc && tab === "data" ? <pre className="m-0 h-[640px] overflow-auto p-4 font-mono text-xs leading-relaxed text-ink/90">{dataJson}</pre> : null}
        {doc && tab === "raw" ? <pre className="m-0 h-[640px] overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed text-ink/90">{rawText}</pre> : null}
        {error ? <p className="absolute bottom-2 left-3 right-3 m-0 rounded-lg bg-white/95 px-3 py-1.5 text-xs text-[var(--color-danger)]">{error}</p> : null}
      </div>
    </div>
  );
}

/* ─── downloads: PDF per page size and view, and the interactive HTML ──────────────────── */

export interface OutputDownloadsProps {
  doc: OutputDocument | null;
  filename: string;
  /** Downloads the interactive HTML file (omit when the output has no interactive form). */
  onInteractiveHtml?: () => void;
  interactiveKind?: "activity" | "document";
  onError?: (message: string) => void;
}

/**
 * Pick any page sizes and views (A4 · Letter · Slides × Student view · Answer key…) and download
 * each as its own PDF — or take the interactive HTML, which works anywhere but is not connected to
 * Luna, so nothing done in it is tracked.
 */
export function OutputDownloads({ doc, filename, onInteractiveHtml, interactiveKind = "activity", onError }: OutputDownloadsProps) {
  const [picked, setPicked] = useState<Set<string>>(new Set(["0:0"]));
  const [busy, setBusy] = useState("");
  const key = (layoutIndex: number, viewIndex: number) => `${layoutIndex}:${viewIndex}`;
  if (!doc) return <p className="m-0 text-sm text-soft-ink">Generate something first — then choose what to download.</p>;
  const total = doc.layouts.length * doc.views.length;
  const toggle = (id: string) => setPicked((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  async function download() {
    if (!doc) return;
    const chosen = [...picked].map((id) => id.split(":").map(Number) as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (let index = 0; index < chosen.length; index += 1) {
      const [layoutIndex, viewIndex] = chosen[index];
      setBusy(`${index + 1} of ${chosen.length}`);
      try {
        await downloadOutput(doc, { layoutIndex, viewIndex }, "pdf", `${filename} - ${doc.views[viewIndex]?.name || "view"} - ${doc.layouts[layoutIndex]?.label || "page"}`.trim());
        // Browsers ask before saving several files; give them a breath between downloads.
        await new Promise((resolve) => window.setTimeout(resolve, 350));
      } catch (failure) {
        onError?.(String((failure as Error).message || failure));
        break;
      }
    }
    setBusy("");
  }

  return (
    <div className="grid gap-4">
      <div>
        <p className={`${kicker} mb-1.5`}>PDF · choose page sizes and views</p>
        <div className="overflow-x-auto rounded-xl border border-ink/10">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-[var(--surface-soft)]">
              <tr>
                <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-soft-ink">View \ Page</th>
                {doc.layouts.map((layout) => <th key={layout.id} className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-soft-ink">{layout.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {doc.views.map((view, viewIndex) => (
                <tr key={view.name} className="border-t border-ink/8">
                  <td className="px-3 py-2 text-[12px] font-semibold text-ink">{view.name}</td>
                  {doc.layouts.map((layout, layoutIndex) => (
                    <td key={layout.id} className="px-3 py-2 text-center">
                      <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={picked.has(key(layoutIndex, viewIndex))} onChange={() => toggle(key(layoutIndex, viewIndex))} aria-label={`${view.name}, ${layout.label}`} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" className={ghostBtn} disabled={!picked.size || Boolean(busy)} onClick={download}>{busy ? `Preparing ${busy}…` : `Download ${picked.size || ""} PDF${picked.size === 1 ? "" : "s"}`.replace("Download  ", "Download ")}</button>
          <button type="button" className="text-xs font-semibold text-soft-ink hover:underline" onClick={() => setPicked(picked.size === total ? new Set() : new Set(doc.views.flatMap((_, v) => doc.layouts.map((__, l) => key(l, v)))))}>{picked.size === total ? "Clear" : "Select all"}</button>
          <span className="text-[11px] text-soft-ink">Each selection is its own file.</span>
        </div>
      </div>

      {onInteractiveHtml ? (
        <div className="border-t border-ink/8 pt-3">
          <p className={`${kicker} mb-1.5`}>{interactiveKind === "activity" ? "Interactive HTML" : "HTML"}</p>
          <button type="button" className={ghostBtn} onClick={onInteractiveHtml}>{interactiveKind === "activity" ? "Download the interactive HTML" : "Download the HTML"}</button>
          <p className="m-0 mt-2 rounded-lg bg-[rgba(178,94,0,0.08)] px-3 py-2 text-[11px] leading-relaxed text-[var(--color-warn)]">
            This file works in any browser but is not connected to Luna. If the task is done in it, outside Luna, your results and performance will <strong>not</strong> be tracked — do it inside Luna to keep them.
          </p>
        </div>
      ) : null}
    </div>
  );
}
