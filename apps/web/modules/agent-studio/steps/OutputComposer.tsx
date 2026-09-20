"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentSpec } from "../engine/types";
import type { Template } from "../../template-studio/engine/types";
import { createTemplate } from "../../template-studio/engine/model";
import { migrateToV3, normalizeTemplate } from "../../template-studio/engine/migrate";
import { buildSampleData } from "../../template-studio/engine/sample";
import { compileForSave } from "../../template-studio/adapters/agentTemplate";
import { useTemplateStore } from "../../template-studio/state/useTemplateStore";
import { DesignMode } from "../../template-studio/design/DesignMode";
import { outputSkeleton } from "../engine/schema";
import { createInput } from "../engine/model";
import { simpleOrder } from "../../template-studio/engine/model";
import { bindingsOf } from "../../template-studio/design/ComponentPreview";
import { card, fieldBase, ghostBtn, kicker, primaryBtn } from "../ui";
import "../../template-studio/components";

export interface TemplateRow { id: string; name: string; [key: string]: unknown }

export interface OutputComposerProps {
  spec: AgentSpec;
  onChange: (updater: (spec: AgentSpec) => AgentSpec) => void;
  listTemplates?: () => Promise<TemplateRow[]>;
  saveTemplate?: (payload: unknown) => Promise<{ template?: { id?: string }; templates?: TemplateRow[] } | null>;
  onOpenTemplateStudio?: (templateId: string) => void;
}

/** Field-id → sample value for the block previews (mirrors TemplateStudio). */
function sampleValuesFor(template: Template): Record<string, unknown> {
  const data = buildSampleData(template, 3) as Record<string, unknown>;
  const values: Record<string, unknown> = {};
  const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const walk = (fields: Template["fields"], scope: Record<string, unknown> | undefined) => {
    for (const field of fields) {
      const key = Object.keys(scope || {}).find((k) => norm(k) === norm(field.name));
      const value = key && scope ? scope[key] : undefined;
      if (field.type === "array") { const first = Array.isArray(value) ? value[0] : undefined; const item = field.children?.[0]; if (item?.type === "object") walk(item.children || [], first as Record<string, unknown>); else if (item) values[item.id] = first; values[field.id] = value; continue; }
      if (field.type === "object") { walk(field.children || [], value as Record<string, unknown>); continue; }
      values[field.id] = value;
    }
  };
  walk(template.fields, data);
  return values;
}

/**
 * Output = an ordered composition of Template Studio blocks. The blocks' fields ARE the agent's
 * output schema, so any template built from the same blocks maps automatically. Structure only —
 * formatting is done later in Template Studio.
 */
export function OutputComposer({ spec, onChange, listTemplates, saveTemplate, onOpenTemplateStudio }: OutputComposerProps) {
  const store = useTemplateStore();
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const openedRef = useRef(false);

  // Open the spec's composition once (or a fresh structure named after the agent).
  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    const initial = spec.outputTemplate ? normalizeTemplate(migrateToV3(spec.outputTemplate)) : createTemplate(spec.name || "Agent output");
    initial.editorMode = "simple";
    store.open(initial, spec.outputTemplateId || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { listTemplates?.().then((list) => setRows(Array.isArray(list) ? list : [])).catch(() => undefined); }, [listTemplates]);

  // Composition → spec (fields become the output schema).
  const template = store.state.template;
  const lastSynced = useRef<string>("");
  useEffect(() => {
    if (!template) return;
    const key = JSON.stringify(template.fields) + template.updatedAt;
    if (key === lastSynced.current) return;
    lastSynced.current = key;
    // JSON order follows the blocks: fields in the order the components use them, unused ones last.
    const layout = template.layouts[0];
    const order: string[] = [];
    for (const element of simpleOrder(layout?.pages[0]?.elements || [], layout)) for (const b of bindingsOf(element, template.fields)) if (!order.includes(b.field.id)) order.push(b.field.id);
    const rank = (id: string) => { const index = order.indexOf(id); return index < 0 ? Number.MAX_SAFE_INTEGER : index; };
    const ordered = [...template.fields].sort((a, b) => rank(a.id) - rank(b.id));
    onChange((current) => ({ ...current, outputTemplate: template as unknown as AgentSpec["outputTemplate"], outputSchema: ordered }));
  }, [template, onChange]);

  const sampleValues = useMemo(() => (template ? sampleValuesFor(template) : {}), [template]);
  const blocks = template?.layouts[0]?.pages[0]?.elements.length || 0;

  function useSaved(id: string) {
    const row = rows.find((item) => item.id === id);
    if (!row) return;
    const loaded = normalizeTemplate(migrateToV3(row));
    loaded.editorMode = "simple";
    store.open(loaded, row.id);
    onChange((current) => ({ ...current, outputTemplateId: row.id }));
    setStatus(`Using “${row.name}” — its structure is now the agent's output.`);
  }
  async function saveAsTemplate() {
    if (!template || !saveTemplate) return;
    setBusy(true);
    try {
      const payload = { ...compileForSave({ ...template, name: template.name || `${spec.name} output` }, store.state.savedId), folderId: "tpl-folder-root" };
      const saved = await saveTemplate(payload);
      const id = saved?.template?.id || store.state.savedId || template.id;
      store.dispatch({ type: "saved", id });
      onChange((current) => ({ ...current, outputTemplateId: id }));
      if (Array.isArray(saved?.templates)) setRows(saved!.templates as TemplateRow[]);
      setStatus(`Saved as template “${template.name}”. Refine its format in Template Studio whenever you like.`);
    } catch (error) {
      setStatus(String((error as Error).message || error));
    } finally {
      setBusy(false);
    }
  }

  /** Document data: make sure an agent input with this name exists; the field is filled from it at run time. */
  function ensureInput(name: string): string {
    const existing = spec.inputs.find((input) => input.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing.id;
    const input = createInput(name, "text", { required: false, description: `${name} shown in the document` });
    onChange((current) => ({ ...current, inputs: [...current.inputs, input] }));
    return input.id;
  }

  if (!template) return null;
  return (
    <div className="grid gap-3">
      <div className={`${card} flex flex-wrap items-center gap-2 px-4 py-2.5`}>
        <p className={`${kicker} mr-2`}>Output structure</p>
        <input className={`${fieldBase} min-w-48 py-1.5 text-sm font-semibold`} value={template.name} onChange={(event) => store.update((current) => ({ ...current, name: event.target.value }))} aria-label="Structure name" />
        <label className="flex items-center gap-1.5 text-xs font-semibold text-soft-ink">Start from a saved template
          <select className={`${fieldBase} max-w-56 py-1.5 text-sm`} value={store.state.savedId || ""} onChange={(event) => event.target.value && useSaved(event.target.value)}>
            <option value="">Choose…</option>
            {rows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
        </label>
        <span className="mx-auto" />
        <span className="text-xs text-soft-ink">{blocks} block{blocks === 1 ? "" : "s"} · {template.fields.length} top-level field{template.fields.length === 1 ? "" : "s"}</span>
        {saveTemplate ? <button type="button" className={ghostBtn} disabled={busy || !blocks} onClick={saveAsTemplate}>{store.state.savedId ? "Update template" : "Save as template"}</button> : null}
        {store.state.savedId && onOpenTemplateStudio ? <button type="button" className={primaryBtn} onClick={() => onOpenTemplateStudio(store.state.savedId)}>Format in Template Studio ↗</button> : null}
      </div>
      {status ? <p className="m-0 px-1 text-xs text-[var(--accent-ink)]">{status}</p> : null}
      <div className="tw-scope">
        <DesignMode store={store} sampleValues={sampleValues} composer onDataField={ensureInput} />
      </div>
      <details className={`${card} p-4`}>
        <summary className="cursor-pointer text-xs font-semibold text-soft-ink">JSON the agent will return (derived from the blocks)</summary>
        <pre className="mt-2 overflow-x-auto rounded-xl bg-[var(--surface-soft)] p-3 text-[11px] leading-relaxed text-ink">{outputSkeleton(spec.outputSchema)}</pre>
      </details>
    </div>
  );
}
