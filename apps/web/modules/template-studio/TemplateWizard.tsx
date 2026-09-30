"use client";

import { useState, useMemo } from "react";
import { ACCENT_PRESETS, blockFamilies, builtInBlocks, instantiateBlock, type AccentPreset, type BlockDef } from "./engine/blocks";
import { createTemplate, createId, createView } from "./engine/model";
import type { Template } from "./engine/types";
import { card, kicker, primaryBtn, ghostBtn, fieldBase } from "./ui";

/* ─── Category config (mirrors AddPanel) ───────────────────────── */
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

/* ─── Keyword-based family suggestions ─────────────────────────── */
function suggestFamilies(prompt: string): Set<string> {
  const p = prompt.toLowerCase();
  const out = new Set<string>();
  if (/question|quiz|exam|test|multiple.?choice|mcq/.test(p)) out.add("Question card");
  if (/open.?question|open.?answer|essay|explain/.test(p)) out.add("Question card");
  if (/true.?false|yes.?no/.test(p)) out.add("Question card");
  if (/answer.?box|space.?to.?write|write.?here/.test(p)) out.add("Answer box");
  if (/flashcard|flash card/.test(p)) out.add("Flashcard");
  if (/vocabular|vocab|word list/.test(p)) { out.add("Flashcard"); out.add("Vocabulary"); }
  if (/fill.?in|blank|cloze|gap/.test(p)) out.add("Fill in the blanks");
  if (/match|matching|pair/.test(p)) out.add("Match the pairs");
  if (/math|arithmetic|calculat|number|algebra/.test(p)) out.add("Math practice set");
  if (/word.?search/.test(p)) out.add("Word search");
  if (/puzzle|jigsaw/.test(p)) out.add("Square puzzle");
  if (/key.?point|summary|overview|takeaway/.test(p)) out.add("Key points");
  if (/callout|important|note|tip|hint/.test(p)) out.add("Callout");
  if (/trace|tracing|handwriting|writing practice/.test(p)) out.add("Tracing");
  if (/cut|paste|scissors|activity/.test(p)) out.add("Cut and paste");
  return out;
}

/* ─── Canvas options ────────────────────────────────────────────── */
const CANVAS_OPTIONS = [
  { id: "a4-portrait",   label: "A4 portrait",   emoji: "📄", w: 210, h: 297 },
  { id: "a4-landscape",  label: "A4 landscape",   emoji: "🖼", w: 297, h: 210 },
  { id: "letter-portrait", label: "Letter",       emoji: "📃", w: 216, h: 279 },
  { id: "slides-16-9",   label: "Slides 16:9",    emoji: "🖥", w: 254, h: 143 },
];

/* ─── Assemble Template from selections ─────────────────────────── */
function assembleTemplate(
  name: string,
  canvasId: string,
  selections: { block: BlockDef; accent: AccentPreset }[]
): Template {
  const spec = CANVAS_OPTIONS.find((c) => c.id === canvasId) || CANVAS_OPTIONS[0];
  let template = createTemplate(name);
  // Patch canvas size
  template = {
    ...template,
    layouts: template.layouts.map((l, i) =>
      i === 0 ? { ...l, canvas: { ...l.canvas, width: spec.w, height: spec.h } } : l
    ),
  };

  const margins = template.layouts[0].margins;
  const contentWidth = spec.w - margins.left - margins.right;

  for (const { block, accent } of selections) {
    const toggles = Object.fromEntries(
      (block.options || []).map((o) => [o.key, o.key === "answer" ? false : o.default])
    );
    const { fields, elements } = instantiateBlock(block, template.fields, { accent, toggles });
    const page = template.layouts[0].pages[0];
    const lastBottom =
      page.elements.length
        ? Math.max(...page.elements.map((e) => e.frame.y + e.frame.h))
        : margins.top;
    const placed = elements.map((el, i) => ({
      ...el,
      frame: { ...el.frame, x: margins.left, y: lastBottom + 4 + i * 2, w: contentWidth },
    }));
    template = {
      ...template,
      fields,
      layouts: template.layouts.map((l, li) =>
        li === 0
          ? {
              ...l,
              pages: l.pages.map((p, pi) =>
                pi === 0 ? { ...p, elements: [...p.elements, ...placed] } : p
              ),
            }
          : l
      ),
    };
  }

  // Add Student view + Answer key view
  const studentView = { ...template.layouts[0].views[0], name: "Student view" };
  const answerView = createView("Answer key");
  template = {
    ...template,
    layouts: template.layouts.map((l, i) =>
      i === 0 ? { ...l, views: [studentView, answerView] } : l
    ),
  };

  return template;
}

/* ─── Wizard state ──────────────────────────────────────────────── */
type Step = 1 | 2 | 3 | 4;

export interface TemplateWizardProps {
  onBuilt: (template: Template, note: string) => void;
  onCancel: () => void;
}

export function TemplateWizard({ onBuilt, onCancel }: TemplateWizardProps) {
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [canvasId, setCanvasId] = useState("a4-portrait");
  const [accentId, setAccentId] = useState("blue");
  // Step 2: selected families
  const [selectedFamilies, setSelectedFamilies] = useState<Set<string>>(() => {
    // Pre-select structure families
    const init = new Set<string>();
    const blocks = builtInBlocks();
    for (const block of blocks) {
      if (block.category === "structure") init.add(block.family || block.name);
    }
    return init;
  });
  // Step 3: one variant (blockId) per family
  const [variantByFamily, setVariantByFamily] = useState<Map<string, string>>(new Map());

  /* Derived data -------------------------------------------------- */
  const allBlocks = useMemo(() => builtInBlocks(), []);
  const families = useMemo(() => blockFamilies(allBlocks), [allBlocks]);
  const accent = useMemo(() => ACCENT_PRESETS.find((a) => a.id === accentId) || ACCENT_PRESETS[0], [accentId]);

  // Group families by UI category
  const byCategory = useMemo(() => {
    const map = new Map<CatId, { family: string; variants: BlockDef[] }[]>();
    for (const cat of CATEGORIES) map.set(cat.id, []);
    for (const fam of families) {
      const catId = uiCat(fam.variants[0]);
      map.get(catId)?.push(fam);
    }
    return map;
  }, [families]);

  // Ordered selections for step 3 + assembly: structure first, then others
  const selectedFamilyEntries = useMemo(() => {
    const out: { family: string; variants: BlockDef[]; cat: typeof CATEGORIES[number] }[] = [];
    for (const cat of CATEGORIES) {
      const famList = byCategory.get(cat.id) || [];
      for (const fam of famList) {
        if (selectedFamilies.has(fam.family)) {
          out.push({ ...fam, cat });
        }
      }
    }
    return out;
  }, [selectedFamilies, byCategory]);

  // Build the final block selections (with resolved variants)
  const finalSelections = useMemo((): { block: BlockDef; accent: AccentPreset }[] => {
    return selectedFamilyEntries.map(({ family, variants }) => {
      const chosenId = variantByFamily.get(family);
      const block = (chosenId ? variants.find((v) => v.id === chosenId) : null) || variants[0];
      return { block, accent };
    });
  }, [selectedFamilyEntries, variantByFamily, accent]);

  /* Handlers ------------------------------------------------------ */
  function handlePromptNext() {
    const suggested = suggestFamilies(prompt);
    if (suggested.size > 0) {
      setSelectedFamilies((current) => new Set([...current, ...suggested]));
    }
    setStep(2);
  }

  function toggleFamily(family: string, locked: boolean) {
    if (locked) return;
    setSelectedFamilies((current) => {
      const next = new Set(current);
      if (next.has(family)) next.delete(family); else next.add(family);
      return next;
    });
  }

  function pickVariant(family: string, blockId: string) {
    setVariantByFamily((current) => new Map(current).set(family, blockId));
  }

  function save() {
    const template = assembleTemplate(name || "Untitled template", canvasId, finalSelections);
    onBuilt(template, `Template "${template.name}" created with ${finalSelections.length} component${finalSelections.length !== 1 ? "s" : ""}.`);
  }

  /* ─── Step 1: Name + Method ──────────────────────────────────── */
  if (step === 1) {
    return (
      <div className={`${card} mx-auto max-w-2xl p-8`}>
        <button type="button" onClick={onCancel} className={`${ghostBtn} mb-6 px-3 text-sm`}>‹ Back to templates</button>
        <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--accent-ink)]">New template</span>
        <h2 className="m-0 mt-4 text-3xl font-bold tracking-tight text-ink">Create a template</h2>
        <p className="m-0 mt-1 text-sm text-soft-ink">A template tells the AI how to format and present its output.</p>

        {/* Name */}
        <label className="mt-6 block">
          <span className="mb-1.5 block text-sm font-semibold text-ink">Template name</span>
          <input
            className={`${fieldBase} w-full text-base`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Year 7 Maths Exam, Vocabulary Flashcards…"
            autoFocus
          />
        </label>

        {/* Canvas */}
        <div className="mt-5">
          <span className="mb-2 block text-sm font-semibold text-ink">Page format</span>
          <div className="grid grid-cols-4 gap-2">
            {CANVAS_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setCanvasId(opt.id)}
                className={`flex flex-col items-center gap-1.5 rounded-xl border-2 px-3 py-3 text-center transition ${canvasId === opt.id ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-ink/10 bg-white hover:border-ink/20"}`}
              >
                <span className="text-2xl">{opt.emoji}</span>
                <span className="text-[11px] font-semibold text-ink leading-tight">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Method */}
        <div className="mt-6">
          <span className="mb-2 block text-sm font-semibold text-ink">How do you want to start?</span>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="flex flex-col items-start gap-2 rounded-2xl border-2 border-ink/10 bg-white p-5 text-left transition hover:border-[var(--accent)] hover:shadow-md"
            >
              <span className="grid size-10 place-items-center rounded-xl bg-[var(--surface-soft)] text-xl">🧩</span>
              <span>
                <span className="block font-bold text-ink">Pick components</span>
                <span className="mt-0.5 block text-[12px] text-soft-ink">Choose what goes in your template step by step.</span>
              </span>
            </button>
            <div className="flex flex-col gap-2 rounded-2xl border-2 border-ink/10 bg-white p-5">
              <div className="flex items-center gap-2">
                <span className="grid size-10 place-items-center rounded-xl bg-[var(--accent-soft)] text-xl">✨</span>
                <span className="font-bold text-ink">Describe it with AI</span>
              </div>
              <textarea
                className={`${fieldBase} h-16 w-full resize-none text-sm`}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. A multiple-choice exam with 10 questions and an answer key, for Year 8 Biology"
              />
              <button
                type="button"
                onClick={handlePromptNext}
                className={`${primaryBtn} w-full py-1.5 text-sm`}
              >
                Suggest components ›
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Step 2: Component selection ───────────────────────────── */
  if (step === 2) {
    return (
      <div className="tw-scope mx-auto max-w-2xl">
        <StepHeader step={2} title="What goes in your template?" subtitle="Tick the types of content you want to include." onBack={() => setStep(1)} />

        <div className={`${card} mt-3 p-5`}>
          <div className="grid gap-3">
            {CATEGORIES.map((cat) => {
              const famList = byCategory.get(cat.id) || [];
              if (!famList.length) return null;
              return (
                <div key={cat.id}>
                  {/* Category header */}
                  <div className="mb-2 flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: cat.bg, border: `1px solid ${cat.border}` }}>
                    <span className="text-base">{cat.emoji}</span>
                    <span className="text-[13px] font-bold" style={{ color: cat.ink }}>{cat.label}</span>
                    {cat.locked ? <span className="ml-auto rounded-full border px-2 py-0.5 text-[10px] font-semibold" style={{ borderColor: cat.border, color: cat.ink }}>Always included</span> : null}
                  </div>

                  {/* Families */}
                  <div className="grid gap-1.5 pl-2">
                    {famList.map(({ family, variants }) => {
                      const active = selectedFamilies.has(family);
                      const locked = cat.locked;
                      return (
                        <button
                          key={family}
                          type="button"
                          disabled={locked}
                          onClick={() => toggleFamily(family, locked)}
                          className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                            active
                              ? "border-[var(--accent)]/40 bg-[var(--accent-soft)]"
                              : locked
                              ? "border-ink/10 bg-[var(--surface-soft)] opacity-70"
                              : "border-ink/10 bg-white hover:border-ink/25 hover:bg-[var(--surface-soft)]"
                          }`}
                        >
                          <span className="grid size-8 shrink-0 place-items-center rounded-lg text-sm" style={{ background: active ? cat.bg : "var(--surface-soft)", color: active ? cat.ink : "#6b7280" }}>
                            {variants[0]?.icon || "▪"}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-semibold text-ink">{family}</span>
                            {variants.length > 1 ? (
                              <span className="text-[11px] text-soft-ink">{variants.length} style options</span>
                            ) : (
                              <span className="line-clamp-1 text-[11px] text-soft-ink">{variants[0]?.description}</span>
                            )}
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
        </div>

        <div className="mt-4 flex justify-end">
          <button type="button" className={`${primaryBtn} px-8 py-2.5`} onClick={() => setStep(3)}>
            Next: Choose style ›
          </button>
        </div>
      </div>
    );
  }

  /* ─── Step 3: Format + color ─────────────────────────────────── */
  if (step === 3) {
    return (
      <div className="tw-scope mx-auto max-w-2xl">
        <StepHeader step={3} title="How should it look?" subtitle="Pick a color and choose a style for each component." onBack={() => setStep(2)} />

        {/* Color theme */}
        <div className={`${card} mt-3 p-5`}>
          <p className={`${kicker} mb-3`}>Color theme</p>
          <div className="flex gap-2.5 flex-wrap">
            {ACCENT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                title={preset.label}
                onClick={() => setAccentId(preset.id)}
                className={`flex items-center gap-2 rounded-full border-2 px-3 py-1.5 text-[12px] font-semibold transition ${accentId === preset.id ? "border-[var(--accent)]" : "border-transparent bg-[var(--surface-soft)] hover:border-ink/20"}`}
                style={{ background: accentId === preset.id ? preset.tint : undefined }}
              >
                <span className="size-4 rounded-full shrink-0" style={{ background: preset.main }} />
                <span style={{ color: accentId === preset.id ? preset.main : undefined }}>{preset.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Variants per family (non-structure only — structure uses default) */}
        {selectedFamilyEntries.filter((e) => !e.cat.locked && e.variants.length > 1).map(({ family, variants, cat }) => (
          <div key={family} className={`${card} mt-3 p-5`}>
            <p className={`${kicker} mb-1`}>{family}</p>
            <p className="m-0 mb-3 text-[12px] text-soft-ink">Pick one style:</p>
            <div className="grid gap-2">
              {variants.map((block) => {
                const chosen = variantByFamily.get(family) || variants[0].id;
                const active = chosen === block.id;
                return (
                  <button
                    key={block.id}
                    type="button"
                    onClick={() => pickVariant(family, block.id)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${active ? "border-[var(--accent)]/40 bg-[var(--accent-soft)]" : "border-ink/10 bg-white hover:border-ink/20"}`}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg text-sm" style={{ background: cat.bg, color: cat.ink }}>{block.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-ink">{block.variant || block.name}</span>
                      <span className="line-clamp-2 text-[11px] text-soft-ink">{block.description}</span>
                    </span>
                    <span className={`grid size-5 shrink-0 place-items-center rounded-full border-2 transition ${active ? "border-[var(--accent)] bg-[var(--accent)]" : "border-ink/25 bg-white"}`}>
                      {active ? <span className="text-[10px] font-bold text-white">✓</span> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {selectedFamilyEntries.filter((e) => !e.cat.locked && e.variants.length > 1).length === 0 ? (
          <div className={`${card} mt-3 p-5`}>
            <p className="m-0 text-sm text-soft-ink">All selected components have a single style — nothing to pick here.</p>
          </div>
        ) : null}

        <div className="mt-4 flex justify-end">
          <button type="button" className={`${primaryBtn} px-8 py-2.5`} onClick={() => setStep(4)}>
            Next: Preview ›
          </button>
        </div>
      </div>
    );
  }

  /* ─── Step 4: Preview + Save ─────────────────────────────────── */
  return (
    <div className="tw-scope mx-auto max-w-2xl">
      <StepHeader step={4} title="Your template is ready" subtitle="Review your selections and save." onBack={() => setStep(3)} />

      {/* Summary */}
      <div className={`${card} mt-3 p-5`}>
        <div className="mb-4 flex items-center gap-3">
          <span className="size-10 rounded-full shrink-0" style={{ background: accent.main }} />
          <div>
            <p className="m-0 text-base font-bold text-ink">{name || "Untitled template"}</p>
            <p className="m-0 text-[12px] text-soft-ink">{CANVAS_OPTIONS.find((c) => c.id === canvasId)?.label} · {accent.label} theme · {finalSelections.length} component{finalSelections.length !== 1 ? "s" : ""}</p>
          </div>
        </div>

        <p className={`${kicker} mb-2`}>Components</p>
        <div className="grid gap-2">
          {finalSelections.map(({ block }, i) => (
            <div key={block.id + i} className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white px-3 py-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--surface-soft)] text-sm">{block.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-ink">{block.variant ? `${block.family} — ${block.variant}` : block.name}</span>
                <span className="line-clamp-1 text-[11px] text-soft-ink">{block.description}</span>
              </span>
            </div>
          ))}
        </div>

        <p className="m-0 mt-4 text-[12px] text-soft-ink">
          Two views will be created automatically: <strong>Student view</strong> (answers hidden) and <strong>Answer key</strong>.
        </p>
      </div>

      <div className="mt-4 flex gap-3 justify-end">
        <button type="button" className={`${ghostBtn} px-5 py-2.5`} onClick={() => setStep(3)}>‹ Back</button>
        <button type="button" className={`${primaryBtn} px-8 py-2.5 text-base`} onClick={save}>
          Save template
        </button>
      </div>
    </div>
  );
}

/* ─── Shared step header ─────────────────────────────────────────── */
function StepHeader({ step, title, subtitle, onBack }: { step: number; title: string; subtitle: string; onBack: () => void }) {
  return (
    <div className={`${card} p-5`}>
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} className={`${ghostBtn} px-3 text-sm`}>‹ Back</button>
        <div className="flex gap-1.5 ml-auto">
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
