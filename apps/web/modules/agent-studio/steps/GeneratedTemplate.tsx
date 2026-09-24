"use client";

import { useEffect, useMemo, useState } from "react";
import type { AgentSpec } from "../engine/types";
import type { Template } from "../../template-studio/engine/types";
import { templateFromFields } from "../../template-studio/engine/autoTemplate";
import { buildSampleData } from "../../template-studio/engine/sample";
import { compileForSave } from "../../template-studio/adapters/agentTemplate";
import { importanceOf } from "../../template-studio/engine/fit";
import { card, ghostBtn, kicker, primaryBtn } from "../ui";
import type { TemplateRow } from "./OutputComposer";

/** Everything the generated document can become, shown so the choice of output is never a guess. */
const FORMATS = [
  { id: "activity", label: "Activity on Luna", hint: "answered online, results tracked" },
  { id: "html", label: "HTML", hint: "open in any browser" },
  { id: "pdf", label: "PDF", hint: "print-ready" },
  { id: "docx", label: "Word", hint: "editable" },
  { id: "pptx", label: "PowerPoint", hint: "from the slides layout" }
];

export interface GeneratedTemplateProps {
  spec: AgentSpec;
  onChange: (updater: (spec: AgentSpec) => AgentSpec) => void;
  templates?: TemplateRow[];
  saveTemplate?: (payload: unknown) => Promise<{ template?: { id?: string }; templates?: TemplateRow[] } | null>;
  onOpenTemplateStudio?: (templateId: string) => void;
}

/**
 * A ready document for the fields the user just described. Luna designs it (header, one card or
 * slide per item, an answers view, a footer), shows it, and then the user can keep it, edit it in
 * Template Studio, or pick a different template — nobody has to design a page to see their output.
 */
export function GeneratedTemplate({ spec, onChange, templates = [], saveTemplate, onOpenTemplateStudio }: GeneratedTemplateProps) {
  const [kind, setKind] = useState<"document" | "slides">("document");
  const [html, setHtml] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [savedId, setSavedId] = useState("");

  const schemaKey = JSON.stringify(spec.outputSchema);
  const template: Template | null = useMemo(
    () => (spec.outputSchema.length ? templateFromFields(spec.outputSchema, { name: `${spec.name || "Agent"} — ${kind === "slides" ? "slides" : "document"}`, kind }) : null),
    // The design follows the fields; rebuilding on every keystroke of the schema is intended.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schemaKey, kind, spec.name]
  );
  const compiled = useMemo(() => (template ? { ...compileForSave(template, savedId), folderId: "tpl-folder-root" } : null), [template, savedId]);
  const sample = useMemo(() => (template ? buildSampleData(template, kind === "slides" ? 3 : 4) : {}), [template, kind]);

  useEffect(() => {
    if (!compiled) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/templates/render-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ template: compiled, sampleData: sample, format: "html" })
        });
        const payload = await response.json();
        if (!cancelled) setHtml(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#ececed;}body{padding:8mm;}</style></head><body>${payload.html || ""}</body></html>`);
      } catch {
        if (!cancelled) setHtml("");
      }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [compiled, sample]);

  async function keepIt() {
    if (!compiled || !saveTemplate) return;
    setBusy(true);
    try {
      const saved = await saveTemplate(compiled);
      const id = saved?.template?.id || savedId;
      setSavedId(id);
      onChange((current) => ({ ...current, outputTemplateId: id }));
      setStatus(`Saved to Template Studio as “${compiled.name}”. It is now this agent's document.`);
    } catch (error) {
      setStatus(String((error as Error).message || error));
    } finally {
      setBusy(false);
    }
  }

  if (!template || !compiled) return null;
  const essential = spec.outputSchema.flatMap((field) => (field.type === "array" ? (field.children?.[0]?.children || []) : [field])).filter((field) => importanceOf(field) === "essential");

  return (
    <section className={`${card} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={kicker}>Document for these fields</p>
          <p className="m-0 mt-1 text-xs text-soft-ink">Designed automatically from what this agent returns — {essential.length} essential field{essential.length === 1 ? "" : "s"} laid out first. Keep it, edit it, or use another template.</p>
        </div>
        <div className="flex gap-1 rounded-xl bg-[var(--surface-soft)] p-1">
          {([["document", "Document"], ["slides", "Slides"]] as const).map(([value, label]) => (
            <button key={value} type="button" onClick={() => setKind(value)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${kind === value ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink"}`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="mt-3 grid items-start gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="overflow-hidden rounded-xl border border-ink/10 bg-[#ececed]">
          <iframe title="Generated template" sandbox="" srcDoc={html} className="h-[420px] w-full border-0" />
        </div>
        <div className="grid gap-3">
          <div>
            <p className={kicker}>Comes out as</p>
            <ul className="m-0 mt-2 grid list-none gap-1.5 p-0">
              {FORMATS.filter((format) => (kind === "slides" ? format.id !== "pdf" || true : format.id !== "pptx")).map((format) => (
                <li key={format.id} className="flex items-baseline gap-2 text-sm text-ink"><span className="text-[var(--accent-ink)]">✓</span>{format.label}<span className="text-xs text-soft-ink">{format.hint}</span></li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap gap-2">
            {saveTemplate ? <button type="button" className={primaryBtn} disabled={busy} onClick={keepIt}>{busy ? "Saving…" : savedId ? "Update saved template" : "Keep this document"}</button> : null}
            {savedId && onOpenTemplateStudio ? <button type="button" className={ghostBtn} onClick={() => onOpenTemplateStudio(savedId)}>Edit in Template Studio ↗</button> : null}
          </div>
          {templates.length ? (
            <label className="grid gap-1 text-xs font-semibold text-soft-ink">Or use a template I already have
              <select
                className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink"
                value={spec.outputTemplateId || ""}
                onChange={(event) => { onChange((current) => ({ ...current, outputTemplateId: event.target.value })); setStatus(event.target.value ? "Using the saved template for this agent's document." : ""); }}
              >
                <option value="">Use the generated document</option>
                {templates.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select>
            </label>
          ) : null}
          {status ? <p className="m-0 text-xs text-[var(--accent-ink)]">{status}</p> : null}
        </div>
      </div>
    </section>
  );
}
