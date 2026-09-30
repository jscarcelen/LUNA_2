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
import { simpleOrder } from "../../template-studio/engine/model";
import { bindingsOf } from "../../template-studio/design/ComponentPreview";
import { ACCENT_PRESETS, builtInBlocks, instantiateBlock, type BlockDef } from "../../template-studio/engine/blocks";
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

/* ─── Structure types (mirrors TemplateWizard) ────────────────────── */
type StructureType = "quiz" | "document" | "game";

const STRUCTURE_TYPES: { id: StructureType; emoji: string; label: string; desc: string }[] = [
  { id: "quiz",     emoji: "📝", label: "Quiz / Exam",         desc: "Exam header + question types you pick." },
  { id: "document", emoji: "📄", label: "Document / Summary",  desc: "Headings, paragraphs, bullets, callouts — all included." },
  { id: "game",     emoji: "🃏", label: "Flashcard / Game",    desc: "Game header + flashcard or puzzle format." },
];

const QUIZ_FIXED_IDS     = ["block-header-exam", "block-footer"];
const DOCUMENT_BLOCK_IDS = ["block-header-minimal", "block-section-header", "block-document", "block-key-points", "block-callout", "block-vocabulary-row", "block-footer"];
const GAME_FIXED_IDS     = ["block-header-minimal"];

const QUIZ_QUESTIONS: { id: string; label: string; icon: string; desc: string }[] = [
  { id: "block-exam-question",     label: "Multiple choice",         icon: "❶",  desc: "Numbered question with lettered options." },
  { id: "block-open-question",     label: "Open answer",             icon: "✍",  desc: "Question with a blank writing area." },
  { id: "block-true-false",        label: "True / False",            icon: "◎",  desc: "Binary choice question." },
  { id: "block-question-compact",  label: "Compact (2 columns)",     icon: "❶❶", desc: "Fits more questions per page." },
  { id: "block-section-questions", label: "Sections with questions", icon: "§❶", desc: "Group questions under numbered sections." },
  { id: "block-answer-box",        label: "Answer key box",          icon: "✓",  desc: "Highlighted correct answer with explanation." },
];
const QUIZ_WORKSHEETS: { id: string; label: string; icon: string; desc: string }[] = [
  { id: "block-fill-blanks",   label: "Fill in the blanks",  icon: "Aa", desc: "Sentences with a missing word." },
  { id: "block-match-pairs",   label: "Match the pairs",     icon: "⋯",  desc: "Connect words or translations." },
  { id: "block-math-practice", label: "Math practice set",   icon: "±",  desc: "Numbered operations with answer boxes." },
  { id: "block-word-search",   label: "Word search",         icon: "▩",  desc: "Letter grid with words to find." },
  { id: "block-pair-puzzle",   label: "Pair puzzle",         icon: "▦",  desc: "Cut-apart matching tiles." },
  { id: "block-square-puzzle", label: "Square puzzle",       icon: "▦",  desc: "16-tile edge-matching grid." },
  { id: "block-tracing",       label: "Tracing",             icon: "✎",  desc: "Large letters between writing lines." },
  { id: "block-cut-paste",     label: "Cut and paste",       icon: "✂",  desc: "Category boxes with cut-out words." },
];

const GAME_OPTIONS: { id: string; emoji: string; label: string; desc: string; primaryBlockId: string | null; disabled?: boolean }[] = [
  { id: "flashcard", emoji: "🃏", label: "Flashcard deck", desc: "Front / back cards.", primaryBlockId: "block-flashcard" },
  { id: "puzzle",    emoji: "🧩", label: "Word puzzle",    desc: "Coming soon.", primaryBlockId: null, disabled: true },
];

function findBlock(id: string): BlockDef | undefined {
  return builtInBlocks().find((b) => b.id === id);
}

/**
 * Step 4 — Output blocks.
 *
 * The teacher picks one of three structure types (quiz / document / game), then selects
 * which interactive components or game format the agent may produce. The selected blocks'
 * AI fields become the output JSON schema automatically.
 */
export function OutputComposer({ spec, onChange, listTemplates, saveTemplate, onOpenTemplateStudio }: OutputComposerProps) {
  const store = useTemplateStore();
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const openedRef = useRef(false);

  const [structureType, setStructureType] = useState<StructureType>("quiz");
  const [selectedInteractiveIds, setSelectedInteractiveIds] = useState<Set<string>>(
    () => new Set(["block-exam-question", "block-open-question", "block-true-false"])
  );
  const [selectedGameOptionId, setSelectedGameOptionId] = useState<string>("flashcard");

  // Open the spec's existing template once (or empty one).
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

  // Sync template → spec whenever template changes.
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

  // Rebuild template when structure type or component selection changes.
  const resolvedBlockIds = useMemo(() => {
    if (structureType === "quiz") {
      return [...QUIZ_FIXED_IDS, ...[...QUIZ_QUESTIONS, ...QUIZ_WORKSHEETS].filter((q) => selectedInteractiveIds.has(q.id)).map((q) => q.id)];
    } else if (structureType === "document") {
      return DOCUMENT_BLOCK_IDS;
    } else {
      const gameOpt = GAME_OPTIONS.find((g) => g.id === selectedGameOptionId);
      return [...GAME_FIXED_IDS, ...(gameOpt?.primaryBlockId ? [gameOpt.primaryBlockId] : [])];
    }
  }, [structureType, selectedInteractiveIds, selectedGameOptionId]);

  const rebuildRef = useRef<string>("");
  useEffect(() => {
    const key = resolvedBlockIds.join(",");
    if (key === rebuildRef.current) return;
    rebuildRef.current = key;
    // Build a fresh template from the selected block list.
    const tpl = createTemplate(spec.name || "Agent output");
    tpl.editorMode = "simple";
    let fields = tpl.fields;
    const elements: any[] = [];
    for (const id of resolvedBlockIds) {
      const block = findBlock(id);
      if (!block) continue;
      const accent = ACCENT_PRESETS[0];
      const isInteractive = block.category !== "structure";
      const toggles = Object.fromEntries((block.options || []).map((o) => [o.key, isInteractive ? true : o.default]));
      const result = instantiateBlock(block, fields, { accent, toggles });
      fields = result.fields;
      elements.push(...result.elements);
    }
    const built: Template = {
      ...tpl,
      fields,
      layouts: tpl.layouts.map((l, li) =>
        li === 0 ? { ...l, pages: l.pages.map((p, pi) => pi === 0 ? { ...p, elements } : p) } : l
      ),
    };
    store.open(built, store.state.savedId || "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedBlockIds]);

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

  const blockCount = template?.layouts[0]?.pages[0]?.elements.length || 0;
  const fieldCount = template?.fields.length || 0;

  if (!template) return null;

  return (
    <div className="tw-scope grid gap-4">
      {/* Header bar */}
      <div className={`${card} flex flex-wrap items-center gap-3 px-4 py-2.5`}>
        <p className={`${kicker} mr-1`}>Output format</p>
        <p className="m-0 text-xs text-soft-ink">Pick the structure type. The agent's output schema is built automatically from your selection.</p>
        <span className="mx-auto" />
        {rows.length > 0 && (
          <label className="flex items-center gap-1.5 text-xs font-semibold text-soft-ink">
            Start from saved template
            <select className="rounded-lg border border-ink/15 px-2.5 py-1.5 text-xs" value={store.state.savedId || ""} onChange={(e) => e.target.value && useSaved(e.target.value)}>
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
          <button type="button" className={primaryBtn} onClick={() => onOpenTemplateStudio(store.state.savedId)}>Format in Template Studio ↗</button>
        ) : null}
      </div>

      {status ? <p className="m-0 px-1 text-xs text-[var(--accent-ink)]">{status}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Left: structure type + component picker */}
        <div className="grid gap-3">
          {/* 1. Structure type */}
          <div className={`${card} p-4`}>
            <p className={`${kicker} mb-3`}>Output type</p>
            <div className="grid gap-2">
              {STRUCTURE_TYPES.map((t) => (
                <button key={t.id} type="button" onClick={() => setStructureType(t.id)}
                  className={`flex items-center gap-3 rounded-2xl border-2 p-3.5 text-left transition ${structureType === t.id ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-ink/10 bg-white hover:border-[var(--accent)]/40"}`}>
                  <span className="text-2xl">{t.emoji}</span>
                  <div className="flex-1"><span className="block text-[13px] font-bold text-ink">{t.label}</span><span className="block text-[11px] text-soft-ink">{t.desc}</span></div>
                  <span className={`grid size-4 shrink-0 place-items-center rounded-full border-2 transition ${structureType === t.id ? "border-[var(--accent)] bg-[var(--accent)]" : "border-ink/25 bg-white"}`}>{structureType === t.id && <span className="text-[9px] font-bold text-white">✓</span>}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 2. Sub-picker */}
          {structureType === "quiz" && (
            <div className={`${card} p-4`}>
              <div className="mb-3 rounded-xl bg-green-50 px-3 py-2 text-[11px] font-semibold text-green-800">Always included: Exam header · Page footer</div>
              <p className={`${kicker} mb-2`}>Questions</p>
              <div className="grid gap-1">
                {QUIZ_QUESTIONS.map((q) => {
                  const active = selectedInteractiveIds.has(q.id);
                  return (
                    <button key={q.id} type="button" onClick={() => setSelectedInteractiveIds((c) => { const n = new Set(c); n.has(q.id) ? n.delete(q.id) : n.add(q.id); return n; })}
                      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition ${active ? "border-[var(--accent)]/40 bg-[var(--accent-soft)]" : "border-ink/10 bg-white hover:border-ink/20"}`}>
                      <span className="grid size-7 shrink-0 place-items-center rounded-lg text-[11px] font-bold" style={{ background: active ? "#dbeafe" : "var(--surface-soft)", color: active ? "#1d4ed8" : "#6b7280" }}>{q.icon}</span>
                      <span className="flex-1"><span className="block text-[12px] font-semibold text-ink">{q.label}</span><span className="block text-[10px] text-soft-ink">{q.desc}</span></span>
                      <span className={`grid size-4 shrink-0 place-items-center rounded-full border-2 ${active ? "border-[var(--accent)] bg-[var(--accent)]" : "border-ink/25 bg-white"}`}>{active && <span className="text-[9px] font-bold text-white">✓</span>}</span>
                    </button>
                  );
                })}
              </div>
              <p className={`${kicker} mb-2 mt-4`}>Worksheets</p>
              <div className="grid gap-1">
                {QUIZ_WORKSHEETS.map((q) => {
                  const active = selectedInteractiveIds.has(q.id);
                  return (
                    <button key={q.id} type="button" onClick={() => setSelectedInteractiveIds((c) => { const n = new Set(c); n.has(q.id) ? n.delete(q.id) : n.add(q.id); return n; })}
                      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition ${active ? "border-orange-400/50 bg-orange-50" : "border-ink/10 bg-white hover:border-ink/20"}`}>
                      <span className="grid size-7 shrink-0 place-items-center rounded-lg text-[11px] font-bold" style={{ background: active ? "#fff7ed" : "var(--surface-soft)", color: active ? "#9a3412" : "#6b7280" }}>{q.icon}</span>
                      <span className="flex-1"><span className="block text-[12px] font-semibold text-ink">{q.label}</span><span className="block text-[10px] text-soft-ink">{q.desc}</span></span>
                      <span className={`grid size-4 shrink-0 place-items-center rounded-full border-2 ${active ? "border-orange-400 bg-orange-400" : "border-ink/25 bg-white"}`}>{active && <span className="text-[9px] font-bold text-white">✓</span>}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {structureType === "document" && (
            <div className={`${card} p-4`}>
              <p className="m-0 mb-3 text-xs text-soft-ink">All document components are automatically included in the agent's output schema.</p>
              <div className="grid gap-1">
                {DOCUMENT_BLOCK_IDS.map((id) => {
                  const block = findBlock(id);
                  if (!block) return null;
                  return (
                    <div key={id} className="flex items-center gap-2.5 rounded-xl border border-ink/8 bg-[var(--surface-soft)] px-3 py-2">
                      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-green-50 text-[11px] font-bold text-green-700">{block.icon || "▔"}</span>
                      <span className="flex-1"><span className="block text-[12px] font-semibold text-ink">{block.variant || block.name}</span></span>
                      <span className="text-[10px] font-semibold text-green-600">✓</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {structureType === "game" && (
            <div className={`${card} p-4`}>
              <div className="mb-3 rounded-xl bg-green-50 px-3 py-2 text-[11px] font-semibold text-green-800">Always included: Game header (topic, name, date)</div>
              <p className={`${kicker} mb-2`}>Game format</p>
              <div className="grid gap-2">
                {GAME_OPTIONS.map((opt) => {
                  const sel = selectedGameOptionId === opt.id;
                  return (
                    <button key={opt.id} type="button" disabled={opt.disabled} onClick={() => !opt.disabled && setSelectedGameOptionId(opt.id)}
                      className={`flex items-center gap-3 rounded-xl border-2 p-3.5 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${sel ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-ink/10 bg-white hover:border-[var(--accent)]/40"}`}>
                      <span className="text-2xl">{opt.emoji}</span>
                      <div className="flex-1"><span className="block text-[13px] font-bold text-ink">{opt.label}</span><span className="block text-[11px] text-soft-ink">{opt.desc}</span></div>
                      <span className={`grid size-4 shrink-0 place-items-center rounded-full border-2 ${sel ? "border-[var(--accent)] bg-[var(--accent)]" : "border-ink/25 bg-white"}`}>{sel && <span className="text-[9px] font-bold text-white">✓</span>}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: AI fields summary */}
        <div className={`${card} p-4`}>
          <p className={`${kicker} mb-2`}>What the agent will return</p>
          {blockCount === 0 ? (
            <p className="m-0 text-sm text-soft-ink">No blocks selected yet.</p>
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
              {blockCount > 0 && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-[11px] font-semibold text-soft-ink">JSON the agent will return</summary>
                  <pre className="mt-2 overflow-x-auto rounded-xl bg-[var(--surface-soft)] p-3 text-[10px] leading-relaxed text-ink">{outputSkeleton(spec.outputSchema)}</pre>
                </details>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
