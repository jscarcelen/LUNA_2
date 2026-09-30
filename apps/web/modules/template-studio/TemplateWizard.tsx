"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ACCENT_PRESETS, builtInBlocks, instantiateBlock, type AccentPreset, type BlockDef } from "./engine/blocks";
import { buildSampleData } from "./engine/sample";
import { compileForSave } from "./adapters/agentTemplate";
import { createTemplate, createView } from "./engine/model";
import type { Template } from "./engine/types";
import { ElementView } from "./design/canvas/ElementView";
import { card, kicker, primaryBtn, ghostBtn, fieldBase } from "./ui";

/* ─── Category config ───────────────────────────────────────────── */
const CATEGORIES = [
  { id: "structure",  label: "Structure",     emoji: "▔", locked: true,  bg: "#f0fdf4", ink: "#166534", border: "#bbf7d0" },
  { id: "questions",  label: "Questions",     emoji: "❶", locked: false, bg: "#dbeafe", ink: "#1d4ed8", border: "#bfdbfe" },
  { id: "worksheets", label: "Worksheets",    emoji: "✍", locked: false, bg: "#fff7ed", ink: "#9a3412", border: "#fed7aa" },
  { id: "games",      label: "Cards & Games", emoji: "🃏", locked: false, bg: "#fdf4ff", ink: "#7e22ce", border: "#e9d5ff" },
] as const;
type CatId = typeof CATEGORIES[number]["id"];

const WORKSHEET_FAMILIES = new Set(["Fill in the blanks", "Match the pairs", "Math practice set", "Cut and paste", "Tracing"]);

function uiCat(block: BlockDef): CatId {
  if (block.category === "structure") return "structure";
  if (block.category === "questions" || (block.category === "kids" && block.family === "Question card")) return "questions";
  if (WORKSHEET_FAMILIES.has(block.family || "")) return "worksheets";
  return "games";
}

/* ─── Canvas options ────────────────────────────────────────────── */
const CANVAS_OPTIONS = [
  { id: "a4-portrait",    label: "A4",      emoji: "📄", w: 210, h: 297 },
  { id: "a4-landscape",   label: "A4 land", emoji: "🖼", w: 297, h: 210 },
  { id: "letter-portrait",label: "Letter",  emoji: "📃", w: 216, h: 279 },
  { id: "slides-16-9",    label: "Slides",  emoji: "🖥", w: 254, h: 143 },
];

/* ─── Keyword-based family suggestions ─────────────────────────── */
function suggestBlockIds(prompt: string, blocks: BlockDef[]): Set<string> {
  const p = prompt.toLowerCase();
  const out = new Set<string>();
  const add = (fn: (b: BlockDef) => boolean) => blocks.filter(fn).forEach((b) => out.add(b.id));
  if (/multiple.?choice|mcq|quiz|exam|test/.test(p))   add((b) => b.variant === "Multiple choice");
  if (/open.?question|open.?answer|essay|explain/.test(p)) add((b) => b.variant === "Open answer");
  if (/true.?false/.test(p))                           add((b) => b.variant === "True / false");
  if (/short.?answer/.test(p))                         add((b) => b.family === "Question card" && /short/i.test(b.variant || ""));
  if (/flashcard/.test(p))                             add((b) => b.family === "Flashcard");
  if (/vocabular|vocab/.test(p))                       add((b) => b.family === "Vocabulary");
  if (/fill.?in|blank|cloze/.test(p))                  add((b) => b.family === "Fill in the blanks");
  if (/match|pair/.test(p))                            add((b) => b.family === "Match the pairs");
  if (/math|arithmetic|calculat/.test(p))              add((b) => b.family === "Math practice set");
  if (/word.?search/.test(p))                          add((b) => b.family === "Word search");
  if (/puzzle/.test(p))                                add((b) => b.family === "Square puzzle");
  if (/key.?point|summary|overview/.test(p))           add((b) => b.family === "Key points");
  if (/callout|important|note|tip/.test(p))            add((b) => b.family === "Callout");
  if (/answer.?box|write.?space/.test(p))              add((b) => b.family === "Answer box");
  if (/trace|tracing/.test(p))                         add((b) => b.family === "Tracing");
  if (/cut.?paste|scissors/.test(p))                   add((b) => b.family === "Cut and paste");
  return out;
}

/* ─── Assemble Template ─────────────────────────────────────────── */
function assembleTemplate(
  name: string,
  canvasId: string,
  selections: { block: BlockDef; accent: AccentPreset; toggles: Record<string, boolean> }[]
): Template {
  const spec = CANVAS_OPTIONS.find((c) => c.id === canvasId) || CANVAS_OPTIONS[0];
  let template = createTemplate(name);
  template = { ...template, layouts: template.layouts.map((l, i) => i === 0 ? { ...l, canvas: { ...l.canvas, width: spec.w, height: spec.h } } : l) };
  const margins = template.layouts[0].margins;
  const contentW = spec.w - margins.left - margins.right;

  for (const { block, accent, toggles } of selections) {
    const { fields, elements } = instantiateBlock(block, template.fields, { accent, toggles });
    const page = template.layouts[0].pages[0];
    const lastY = page.elements.length ? Math.max(...page.elements.map((e) => e.frame.y + e.frame.h)) : margins.top;
    const placed = elements.map((el, i) => ({ ...el, frame: { ...el.frame, x: margins.left, y: lastY + 4 + i * 2, w: contentW } }));
    template = { ...template, fields, layouts: template.layouts.map((l, li) => li === 0 ? { ...l, pages: l.pages.map((p, pi) => pi === 0 ? { ...p, elements: [...p.elements, ...placed] } : p) } : l) };
  }

  const studentView = { ...template.layouts[0].views[0], name: "Student view" };
  const answerView = createView("Answer key");
  template = { ...template, layouts: template.layouts.map((l, i) => i === 0 ? { ...l, views: [studentView, answerView] } : l) };
  return template;
}

/* ─── BlockThumbnail ────────────────────────────────────────────── */
function BlockThumbnail({ block, accent, toggles = {}, scale = 0.35, maxW = 180 }: {
  block: BlockDef;
  accent: AccentPreset;
  toggles?: Record<string, boolean>;
  scale?: number;
  maxW?: number;
}) {
  const { fields, elements } = useMemo(
    () => instantiateBlock(block, [], { accent, toggles }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [block.id, accent.id, JSON.stringify(toggles)]
  );
  const el = elements[0];
  if (!el) return <div className="h-20 rounded-xl bg-[var(--surface-soft)]" />;
  const w = Math.min(el.frame.w * scale, maxW);
  const h = el.frame.h * scale;
  return (
    <div className="overflow-hidden rounded-xl border border-ink/10 bg-white" style={{ width: w + 8, height: h + 8, flexShrink: 0 }}>
      <ElementView
        element={{ ...el, frame: { ...el.frame, x: 4 / scale, y: 4 / scale } } as any}
        scale={scale}
        selectedIds={[]}
        fields={fields}
        sampleMode
        sampleValues={{}}
        onPointerDown={() => undefined}
        onResizeStart={() => undefined}
      />
    </div>
  );
}

/* ─── VisualizeModal ────────────────────────────────────────────── */
function VisualizeModal({ block, accent, toggles, onClose }: {
  block: BlockDef;
  accent: AccentPreset;
  toggles: Record<string, boolean>;
  onClose: () => void;
}) {
  const { fields, elements } = useMemo(
    () => instantiateBlock(block, [], { accent, toggles }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [block.id, accent.id, JSON.stringify(toggles)]
  );
  const el = elements[0];
  const scale = el ? Math.min(1.6, 560 / Math.max(40, el.frame.w)) : 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className={`${card} max-h-[90vh] w-full max-w-xl overflow-auto p-6`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-soft-ink">{block.family}</span>
            <h3 className="m-0 text-lg font-bold text-ink">{block.variant || block.name}</h3>
          </div>
          <button type="button" onClick={onClose} className={`${ghostBtn} px-3`}>✕ Close</button>
        </div>
        {el ? (
          <div className="overflow-auto rounded-xl border border-ink/10 bg-[#f0f0f3] p-3">
            <div className="relative bg-white shadow-sm" style={{ width: el.frame.w * scale + 16, minHeight: el.frame.h * scale + 16 }}>
              <ElementView
                element={{ ...el, frame: { ...el.frame, x: 8 / scale, y: 8 / scale } } as any}
                scale={scale}
                selectedIds={[]}
                fields={fields}
                sampleMode
                sampleValues={{}}
                onPointerDown={() => undefined}
                onResizeStart={() => undefined}
              />
            </div>
          </div>
        ) : <p className="text-sm text-soft-ink">No preview available.</p>}
        <p className="m-0 mt-3 text-[11px] text-soft-ink">{block.description}</p>
      </div>
    </div>
  );
}

/* ─── PagePreviewModal ──────────────────────────────────────────── */
function PagePreviewModal({ template, viewIndex, onClose }: { template: Template; viewIndex: number; onClose: () => void }) {
  const [html, setHtml] = useState("");
  const layout = template.layouts[0];
  const view = layout?.views[viewIndex] || layout?.views[0];
  const compiled = useMemo(() => compileForSave(template, ""), [template]);
  const sampleData = useMemo(() => buildSampleData(template, 3), [template]);

  useEffect(() => {
    if (!compiled || !view) return;
    fetch("/api/templates/render-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template: compiled, sampleData, format: "html", layoutId: layout.id, viewId: view.id }),
    }).then((r) => r.json()).then((payload) => {
      setHtml(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#e5e5ea;}body{padding:10mm;}</style></head><body>${payload.html || ""}</body></html>`);
    }).catch(() => { /* silently fail */ });
  }, [compiled, sampleData, layout?.id, view?.id]);

  const viewName = view?.name || "Preview";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60" onClick={onClose}>
      <div className="flex items-center justify-between bg-white/95 px-6 py-3 shadow" onClick={(e) => e.stopPropagation()}>
        <span className="font-bold text-ink">{viewName} — {CANVAS_OPTIONS.find((c) => c.id === "a4-portrait")?.label || "A4"} preview</span>
        <button type="button" onClick={onClose} className={`${ghostBtn} px-3`}>✕ Close</button>
      </div>
      <div className="flex-1 overflow-auto" onClick={(e) => e.stopPropagation()}>
        {html
          ? <iframe title="Preview" sandbox="" srcDoc={html} className="h-full w-full border-0" />
          : <div className="flex h-full items-center justify-center text-white/70">Loading preview…</div>}
      </div>
    </div>
  );
}

/* ─── Wizard state ──────────────────────────────────────────────── */
type Step = 1 | 2 | 3 | 4;

export interface TemplateWizardProps {
  onSave: (template: Template) => Promise<void>;
  onCancel: () => void;
}

export function TemplateWizard({ onSave, onCancel }: TemplateWizardProps) {
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [canvasId, setCanvasId] = useState("a4-portrait");
  const [accentId, setAccentId] = useState("blue");
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(() => {
    const init = new Set<string>();
    builtInBlocks().filter((b) => b.category === "structure").forEach((b) => init.add(b.id));
    return init;
  });
  const [blockToggles, setBlockToggles] = useState<Map<string, Record<string, boolean>>>(new Map());
  const [visualizeBlock, setVisualizeBlock] = useState<BlockDef | null>(null);
  const [pagePreview, setPagePreview] = useState<{ template: Template; viewIndex: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const allBlocks = useMemo(() => builtInBlocks(), []);
  const accent = useMemo(() => ACCENT_PRESETS.find((a) => a.id === accentId) || ACCENT_PRESETS[0], [accentId]);

  // Group blocks by UI category
  const byCategory = useMemo(() => {
    const map = new Map<CatId, BlockDef[]>();
    for (const cat of CATEGORIES) map.set(cat.id, []);
    for (const block of allBlocks) map.get(uiCat(block))?.push(block);
    return map;
  }, [allBlocks]);

  // Ordered selections for assembly (structure first)
  const selectedBlocks = useMemo((): { block: BlockDef; accent: AccentPreset; toggles: Record<string, boolean> }[] => {
    const out: { block: BlockDef; accent: AccentPreset; toggles: Record<string, boolean> }[] = [];
    for (const cat of CATEGORIES) {
      for (const block of byCategory.get(cat.id) || []) {
        if (!selectedBlockIds.has(block.id)) continue;
        const defaults = Object.fromEntries((block.options || []).map((o) => [o.key, o.key === "answer" ? false : o.default]));
        const toggles = { ...defaults, ...(blockToggles.get(block.id) || {}) };
        out.push({ block, accent, toggles });
      }
    }
    return out;
  }, [selectedBlockIds, blockToggles, byCategory, accent]);

  const assembledTemplate = useMemo(
    () => selectedBlocks.length ? assembleTemplate(name || "Untitled template", canvasId, selectedBlocks) : null,
    [selectedBlocks, name, canvasId]
  );

  function toggleBlock(id: string, locked: boolean) {
    if (locked) return;
    setSelectedBlockIds((cur) => { const next = new Set(cur); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  function setToggle(blockId: string, key: string, val: boolean) {
    setBlockToggles((cur) => {
      const prev = cur.get(blockId) || {};
      return new Map(cur).set(blockId, { ...prev, [key]: val });
    });
  }

  function handlePromptNext() {
    const suggested = suggestBlockIds(prompt, allBlocks);
    if (suggested.size > 0) setSelectedBlockIds((cur) => new Set([...cur, ...suggested]));
    setStep(2);
  }

  async function handleSave() {
    if (!assembledTemplate) return;
    setSaving(true);
    try { await onSave(assembledTemplate); } finally { setSaving(false); }
  }

  /* ─── Step 1 ──────────────────────────────────────────────────── */
  if (step === 1) {
    return (
      <div className={`${card} mx-auto max-w-2xl p-8`}>
        <button type="button" onClick={onCancel} className={`${ghostBtn} mb-6 px-3 text-sm`}>‹ Back to templates</button>
        <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--accent-ink)]">New template</span>
        <h2 className="m-0 mt-4 text-3xl font-bold tracking-tight text-ink">Create a template</h2>
        <p className="m-0 mt-1 text-sm text-soft-ink">A template defines which component types the AI can produce and how they look.</p>

        <label className="mt-6 block">
          <span className="mb-1.5 block text-sm font-semibold text-ink">Template name</span>
          <input className={`${fieldBase} w-full text-base`} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Year 7 Maths Exam, Vocabulary Flashcards…" autoFocus />
        </label>

        <div className="mt-5">
          <span className="mb-2 block text-sm font-semibold text-ink">Page format</span>
          <div className="grid grid-cols-4 gap-2">
            {CANVAS_OPTIONS.map((opt) => (
              <button key={opt.id} type="button" onClick={() => setCanvasId(opt.id)} className={`flex flex-col items-center gap-1.5 rounded-xl border-2 px-3 py-3 text-center transition ${canvasId === opt.id ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-ink/10 bg-white hover:border-ink/20"}`}>
                <span className="text-2xl">{opt.emoji}</span>
                <span className="text-[11px] font-semibold text-ink leading-tight">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <span className="mb-2 block text-sm font-semibold text-ink">How do you want to start?</span>
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setStep(2)} className="flex flex-col items-start gap-2 rounded-2xl border-2 border-ink/10 bg-white p-5 text-left transition hover:border-[var(--accent)] hover:shadow-md">
              <span className="grid size-10 place-items-center rounded-xl bg-[var(--surface-soft)] text-xl">🧩</span>
              <span className="block font-bold text-ink">Pick components</span>
              <span className="block text-[12px] text-soft-ink">Select which question types, worksheets and cards the agent can produce.</span>
            </button>
            <div className="flex flex-col gap-2 rounded-2xl border-2 border-ink/10 bg-white p-5">
              <div className="flex items-center gap-2">
                <span className="grid size-10 place-items-center rounded-xl bg-[var(--accent-soft)] text-xl">✨</span>
                <span className="font-bold text-ink">Describe with AI</span>
              </div>
              <textarea className={`${fieldBase} h-16 w-full resize-none text-sm`} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. A multiple-choice exam with open questions and an answer key, for Year 8 Biology" />
              <button type="button" onClick={handlePromptNext} className={`${primaryBtn} w-full py-1.5 text-sm`}>Suggest components ›</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Step 2: component selection (block-level) ──────────────── */
  if (step === 2) {
    return (
      <div className="tw-scope mx-auto max-w-2xl">
        <WizardHeader step={2} title="What can the agent produce?" subtitle="Tick each component type you want to allow. You can pick multiple." onBack={() => setStep(1)} />
        <div className={`${card} mt-3 p-5`}>
          {CATEGORIES.map((cat) => {
            const blocks = byCategory.get(cat.id) || [];
            if (!blocks.length) return null;
            const activeCnt = blocks.filter((b) => selectedBlockIds.has(b.id)).length;
            return (
              <div key={cat.id} className="mb-4 last:mb-0">
                <div className="mb-2 flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: cat.bg, border: `1px solid ${cat.border}` }}>
                  <span className="text-base">{cat.emoji}</span>
                  <span className="flex-1 text-[13px] font-bold" style={{ color: cat.ink }}>{cat.label}</span>
                  {cat.locked
                    ? <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold" style={{ borderColor: cat.border, color: cat.ink }}>Always included</span>
                    : activeCnt > 0 ? <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold" style={{ borderColor: cat.border, color: cat.ink }}>{activeCnt} selected</span> : null}
                </div>
                <div className="grid gap-1.5 pl-2">
                  {blocks.map((block) => {
                    const active = selectedBlockIds.has(block.id);
                    const locked = cat.locked;
                    return (
                      <button key={block.id} type="button" disabled={locked} onClick={() => toggleBlock(block.id, locked)}
                        className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${active ? "border-[var(--accent)]/40 bg-[var(--accent-soft)]" : locked ? "border-ink/10 bg-[var(--surface-soft)] opacity-75" : "border-ink/10 bg-white hover:border-ink/25 hover:bg-[var(--surface-soft)]"}`}
                      >
                        {/* Mini thumbnail */}
                        <div className="shrink-0" style={{ width: 56, height: 40, overflow: "hidden" }}>
                          <BlockThumbnail block={block} accent={accent} scale={0.22} maxW={56} />
                        </div>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-semibold text-ink">{block.variant || block.name}</span>
                          <span className="line-clamp-1 block text-[11px] text-soft-ink">{block.description}</span>
                        </span>
                        <span className={`grid size-5 shrink-0 place-items-center rounded-full border-2 transition ${active ? "border-[var(--accent)] bg-[var(--accent)]" : "border-ink/25 bg-white"}`}>
                          {active ? <span className="text-[10px] font-bold text-white">✓</span> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex justify-end">
          <button type="button" className={`${primaryBtn} px-8 py-2.5`} onClick={() => setStep(3)}>Next: Choose style ›</button>
        </div>
      </div>
    );
  }

  /* ─── Step 3: accent + options + thumbnails ──────────────────── */
  if (step === 3) {
    const nonStructure = selectedBlocks.filter((s) => s.block.category !== "structure");
    return (
      <div className="tw-scope mx-auto max-w-2xl">
        <WizardHeader step={3} title="How should it look?" subtitle="Pick a color theme and style options for each component." onBack={() => setStep(2)} />

        {/* Color theme */}
        <div className={`${card} mt-3 p-5`}>
          <p className={`${kicker} mb-3`}>Color theme</p>
          <div className="flex flex-wrap gap-2">
            {ACCENT_PRESETS.map((preset) => (
              <button key={preset.id} type="button" title={preset.label} onClick={() => setAccentId(preset.id)}
                className={`flex items-center gap-2 rounded-full border-2 px-3 py-1.5 text-[12px] font-semibold transition ${accentId === preset.id ? "border-[var(--accent)]" : "border-transparent bg-[var(--surface-soft)] hover:border-ink/20"}`}
                style={{ background: accentId === preset.id ? preset.tint : undefined }}>
                <span className="size-4 shrink-0 rounded-full" style={{ background: preset.main }} />
                <span style={{ color: accentId === preset.id ? preset.main : undefined }}>{preset.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Per-component options + thumbnail */}
        {nonStructure.map(({ block, toggles }) => (
          <div key={block.id} className={`${card} mt-3 p-5`}>
            <div className="flex items-start gap-4">
              {/* Thumbnail */}
              <div className="shrink-0">
                <BlockThumbnail block={block} accent={accent} toggles={toggles} scale={0.32} maxW={140} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-soft-ink">{block.family}</p>
                    <p className="m-0 text-[15px] font-bold text-ink">{block.variant || block.name}</p>
                  </div>
                  <button type="button" onClick={() => setVisualizeBlock(block)}
                    className="shrink-0 rounded-full border border-ink/15 px-3 py-1 text-[11px] font-semibold text-soft-ink hover:border-[var(--accent)]/50 hover:text-[var(--accent-ink)]">
                    Visualize ↗
                  </button>
                </div>
                {(block.options || []).length > 0 && (
                  <div className="mt-3 grid gap-1.5">
                    {(block.options || []).map((opt) => {
                      const val = toggles[opt.key] ?? opt.default;
                      return (
                        <label key={opt.key} className="flex items-center gap-2 text-[13px] text-ink cursor-pointer">
                          <input type="checkbox" checked={val} onChange={(e) => setToggle(block.id, opt.key, e.target.checked)} className="accent-[var(--accent)]" />
                          {opt.label}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {nonStructure.length === 0 && (
          <div className={`${card} mt-3 p-5`}>
            <p className="m-0 text-sm text-soft-ink">Only structure components selected — nothing to style here.</p>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button type="button" className={`${primaryBtn} px-8 py-2.5`} onClick={() => setStep(4)}>Next: Preview ›</button>
        </div>

        {visualizeBlock && <VisualizeModal block={visualizeBlock} accent={accent} toggles={{ ...Object.fromEntries((visualizeBlock.options || []).map((o) => [o.key, o.key === "answer" ? false : o.default])), ...(blockToggles.get(visualizeBlock.id) || {}) }} onClose={() => setVisualizeBlock(null)} />}
      </div>
    );
  }

  /* ─── Step 4: preview gallery + save ────────────────────────── */
  const views = assembledTemplate?.layouts[0]?.views || [];
  return (
    <div className="tw-scope mx-auto max-w-3xl">
      <WizardHeader step={4} title="Preview your template" subtitle="Review each component, then see how the full document looks." onBack={() => setStep(3)} />

      {/* Component gallery */}
      <div className={`${card} mt-3 p-5`}>
        <p className={`${kicker} mb-3`}>Components — {selectedBlocks.length} selected</p>
        <div className="flex flex-wrap gap-4">
          {selectedBlocks.map(({ block, accent: a, toggles }) => (
            <div key={block.id} className="flex flex-col items-center gap-2">
              <div className="relative group cursor-pointer" onClick={() => setVisualizeBlock(block)}>
                <BlockThumbnail block={block} accent={a} toggles={toggles} scale={0.4} maxW={200} />
                <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/0 transition group-hover:bg-black/10">
                  <span className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-ink opacity-0 shadow-sm transition group-hover:opacity-100">Visualize ↗</span>
                </div>
              </div>
              <span className="max-w-[200px] truncate text-center text-[12px] font-semibold text-ink">{block.variant || block.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Full-page previews */}
      {assembledTemplate && (
        <div className={`${card} mt-3 p-5`}>
          <p className={`${kicker} mb-3`}>Full document preview</p>
          <p className="m-0 mb-3 text-[12px] text-soft-ink">Click a view to see how the complete document looks with sample content.</p>
          <div className="flex flex-wrap gap-2">
            {views.map((view, i) => (
              <button key={view.id} type="button" onClick={() => setPagePreview({ template: assembledTemplate, viewIndex: i })}
                className="flex items-center gap-2 rounded-xl border border-ink/15 bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-[var(--accent)]/50 hover:shadow-md">
                <span>📄</span> {view.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Save */}
      <div className={`${card} mt-3 p-5`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="m-0 text-base font-bold text-ink">{name || "Untitled template"}</p>
            <p className="m-0 text-[12px] text-soft-ink">{CANVAS_OPTIONS.find((c) => c.id === canvasId)?.label} · {accent.label} · {selectedBlocks.length} component{selectedBlocks.length !== 1 ? "s" : ""} · {views.length} views</p>
          </div>
          <button type="button" disabled={saving || !selectedBlocks.length} onClick={handleSave} className={`${primaryBtn} shrink-0 px-8 py-2.5 text-base disabled:opacity-50`}>
            {saving ? "Saving…" : "Save template"}
          </button>
        </div>
      </div>

      {visualizeBlock && <VisualizeModal block={visualizeBlock} accent={accent} toggles={{ ...Object.fromEntries((visualizeBlock.options || []).map((o) => [o.key, o.key === "answer" ? false : o.default])), ...(blockToggles.get(visualizeBlock.id) || {}) }} onClose={() => setVisualizeBlock(null)} />}
      {pagePreview && <PagePreviewModal template={pagePreview.template} viewIndex={pagePreview.viewIndex} onClose={() => setPagePreview(null)} />}
    </div>
  );
}

/* ─── Shared step header ─────────────────────────────────────────── */
function WizardHeader({ step, title, subtitle, onBack }: { step: number; title: string; subtitle: string; onBack: () => void }) {
  return (
    <div className={`${card} p-5`}>
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} className={`${ghostBtn} px-3 text-sm`}>‹ Back</button>
        <div className="ml-auto flex gap-1.5">
          {[1, 2, 3, 4].map((n) => (
            <span key={n} className={`h-1.5 w-6 rounded-full transition ${n === step ? "bg-[var(--accent)]" : n < step ? "bg-[var(--accent)]/40" : "bg-ink/15"}`} />
          ))}
        </div>
        <span className="text-[11px] font-semibold text-soft-ink">Step {step} of 4</span>
      </div>
      <h2 className="m-0 mt-4 text-2xl font-bold tracking-tight text-ink">{title}</h2>
      <p className="m-0 mt-0.5 text-sm text-soft-ink">{subtitle}</p>
    </div>
  );
}
