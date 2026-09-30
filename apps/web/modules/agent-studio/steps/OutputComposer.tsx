"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentSpec } from "../engine/types";
import type { Template } from "../../template-studio/engine/types";
import { createTemplate } from "../../template-studio/engine/model";
import { templateFromFields } from "../../template-studio/engine/autoTemplate";
import { migrateToV3, normalizeTemplate } from "../../template-studio/engine/migrate";
import { compileForSave } from "../../template-studio/adapters/agentTemplate";
import { useTemplateStore } from "../../template-studio/state/useTemplateStore";
import { outputSkeleton } from "../engine/schema";
import { createInput } from "../engine/model";
import { simpleOrder } from "../../template-studio/engine/model";
import { bindingsOf } from "../../template-studio/design/ComponentPreview";
import { AddPanel } from "../../template-studio/design/AddPanel";
import { ACCENT_PRESETS, instantiateBlock, type AccentPreset, type BlockDef } from "../../template-studio/engine/blocks";
import type { GroupElement } from "../../template-studio/engine/types";
import { card, ghostBtn, kicker, primaryBtn } from "../ui";
import "../../template-studio/components";

export interface TemplateRow { id: string; name: string; [key: string]: unknown }

export interface OutputComposerProps {
  spec: AgentSpec;
  onChange: (updater: (spec: AgentSpec) => AgentSpec) => void;
  listTemplates?: () => Promise<TemplateRow[]>;
  saveTemplate?: (payload: unknown) => Promise<{ template?: { id?: string }; templates?: TemplateRow[] } | null>;
  onOpenTemplateStudio?: (templateId: string) => void;
}

/**
 * Step 4 — Output blocks.
 *
 * The teacher clicks which block formats the agent may produce. The selected blocks'
 * AI fields become the output JSON schema automatically. No canvas, no inspector —
 * just the 3-level category / family / variant checkbox picker.
 */
export function OutputComposer({ spec, onChange, listTemplates, saveTemplate, onOpenTemplateStudio }: OutputComposerProps) {
  const store = useTemplateStore();
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const openedRef = useRef(false);

  // Open the spec's template once (or a fresh empty one named after the agent).
  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    const initial = spec.outputTemplate
      ? normalizeTemplate(migrateToV3(spec.outputTemplate))
      : spec.outputSchema.length
        ? templateFromFields(spec.outputSchema, { name: spec.name || "Agent output" })
        : createTemplate(spec.name || "Agent output");
    initial.editorMode = "simple";
    store.open(initial, spec.outputTemplateId || "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    listTemplates?.().then((list) => setRows(Array.isArray(list) ? list : [])).catch(() => undefined);
  }, [listTemplates]);

  // Sync template → spec (fields in block order; orphaned fields excluded).
  const template = store.state.template;
  const lastSynced = useRef<string>("");
  useEffect(() => {
    if (!template) return;
    const key = JSON.stringify(template.fields) + template.updatedAt;
    if (key === lastSynced.current) return;
    lastSynced.current = key;
    const layout = template.layouts[0];
    const order: string[] = [];
    for (const element of simpleOrder(layout?.pages[0]?.elements || [], layout))
      for (const b of bindingsOf(element, template.fields))
        if (!order.includes(b.field.id)) order.push(b.field.id);
    const rank = (id: string) => { const i = order.indexOf(id); return i < 0 ? Number.MAX_SAFE_INTEGER : i; };
    const usedIds = new Set(order);
    const ordered = [...template.fields].filter((f) => usedIds.has(f.id)).sort((a, b) => rank(a.id) - rank(b.id));
    onChange((current) => ({ ...current, outputTemplate: template as unknown as AgentSpec["outputTemplate"], outputSchema: ordered }));
  }, [template, onChange]);

  /** IDs of blocks currently in the template (by origin.blockId). */
  const selectedBlockIds = useMemo(() => {
    const page = template?.layouts[0]?.pages[0];
    if (!page) return [];
    const ids: string[] = [];
    const walk = (elements: typeof page.elements) => elements.forEach((el) => {
      if (el.type === "group" && (el as GroupElement).origin?.blockId) ids.push((el as GroupElement).origin!.blockId);
      if (el.type === "group") walk((el as GroupElement).children);
    });
    walk(page.elements);
    return ids;
  }, [template]);

  const blockCount = template?.layouts[0]?.pages[0]?.elements.length || 0;
  const fieldCount = template?.fields.length || 0;

  /** Toggle a block on or off in the template. */
  function toggleBlock(block: BlockDef, options: { accent: AccentPreset; toggles: Record<string, boolean> }, active: boolean) {
    if (!template) return;
    const layout = template.layouts[0];
    const page = layout?.pages[0];
    if (!page) return;

    if (active) {
      const { fields, elements } = instantiateBlock(block, template.fields, options);
      store.update((current) => ({
        ...current,
        fields,
        layouts: current.layouts.map((l) =>
          l.id === layout.id ? { ...l, pages: l.pages.map((p) => p.id === page.id ? { ...p, elements: [...p.elements, ...elements] } : p) } : l
        ),
      }));
    } else {
      // Remove all top-level elements from this block
      const toRemove = new Set(page.elements.filter((el) => el.type === "group" && (el as GroupElement).origin?.blockId === block.id).map((el) => el.id));
      store.update((current) => ({
        ...current,
        layouts: current.layouts.map((l) =>
          l.id === layout.id ? { ...l, pages: l.pages.map((p) => p.id === page.id ? { ...p, elements: p.elements.filter((el) => !toRemove.has(el.id)) } : p) } : l
        ),
      }));
    }
  }

  function useSaved(id: string) {
    const row = rows.find((item) => item.id === id);
    if (!row) return;
    const loaded = normalizeTemplate(migrateToV3(row));
    loaded.editorMode = "simple";
    store.open(loaded, row.id);
    onChange((current) => ({ ...current, outputTemplateId: row.id }));
    setStatus(`Using "${row.name}" — its blocks are now the agent's output.`);
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
      setStatus(`Saved as "${template.name}". Format it further in Template Studio.`);
    } catch (error) {
      setStatus(String((error as Error).message || error));
    } finally {
      setBusy(false);
    }
  }

  if (!template) return null;

  return (
    <div className="tw-scope grid gap-4">
      {/* Header bar */}
      <div className={`${card} flex flex-wrap items-center gap-3 px-4 py-2.5`}>
        <p className={`${kicker} mr-1`}>Output blocks</p>
        <p className="m-0 text-xs text-soft-ink">
          Select the block formats this agent can produce. The agent picks which to use and in what order — you only decide which formats are available.
        </p>
        <span className="mx-auto" />
        {rows.length > 0 && (
          <label className="flex items-center gap-1.5 text-xs font-semibold text-soft-ink">
            Start from a saved template
            <select
              className="rounded-lg border border-ink/15 px-2.5 py-1.5 text-xs"
              value={store.state.savedId || ""}
              onChange={(e) => e.target.value && useSaved(e.target.value)}
            >
              <option value="">Choose…</option>
              {rows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </label>
        )}
        <span className="text-xs text-soft-ink">{blockCount} block{blockCount === 1 ? "" : "s"} · {fieldCount} field{fieldCount === 1 ? "" : "s"}</span>
        {saveTemplate ? (
          <button type="button" className={ghostBtn} disabled={busy || !blockCount} onClick={saveAsTemplate}>
            {store.state.savedId ? "Update template" : "Save as template"}
          </button>
        ) : null}
        {store.state.savedId && onOpenTemplateStudio ? (
          <button type="button" className={primaryBtn} onClick={() => onOpenTemplateStudio(store.state.savedId)}>
            Format in Template Studio ↗
          </button>
        ) : null}
      </div>

      {status ? <p className="m-0 px-1 text-xs text-[var(--accent-ink)]">{status}</p> : null}

      {/* Block picker — full-width, no canvas beside it */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <AddPanel
          onAdd={() => undefined}
          onAddBlock={(block, options) => toggleBlock(block, options, true)}
          selectedBlockIds={selectedBlockIds}
          onToggleBlock={toggleBlock}
          hint=""
          blocksOnly
        />

        {/* Selected blocks summary */}
        <div className={`${card} p-4`}>
          <p className={`${kicker} mb-2`}>What the agent will return</p>
          {blockCount === 0 ? (
            <p className="m-0 text-sm text-soft-ink">No blocks selected yet — pick at least one from the left to define what the agent generates.</p>
          ) : (
            <>
              <p className="m-0 mb-3 text-xs text-soft-ink">These AI fields will be in every output. The agent fills them; the template controls how they look.</p>
              <div className="grid gap-1">
                {template.fields.filter((f) => f.type !== "object").slice(0, 20).map((f) => (
                  <div key={f.id} className="flex items-center gap-2 rounded-xl bg-[var(--surface-soft)] px-3 py-2">
                    <span className="text-[11px] font-semibold text-[var(--accent-ink)]">✦</span>
                    <span className="text-[12px] font-semibold text-ink">{f.name}</span>
                    <span className="ml-auto text-[10px] text-soft-ink">{f.type}</span>
                  </div>
                ))}
                {template.fields.length > 20 ? <p className="m-0 text-[11px] text-soft-ink">+{template.fields.length - 20} more…</p> : null}
              </div>
            </>
          )}

          {/* JSON skeleton */}
          {blockCount > 0 ? (
            <details className="mt-4">
              <summary className="cursor-pointer text-[11px] font-semibold text-soft-ink">JSON the agent will return</summary>
              <pre className="mt-2 overflow-x-auto rounded-xl bg-[var(--surface-soft)] p-3 text-[10px] leading-relaxed text-ink">{outputSkeleton(spec.outputSchema)}</pre>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  );
}
