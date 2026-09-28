"use client";

import { useRef, useState } from "react";
import type { Template } from "../engine/types";
import { assembleTemplate, type DesignedSection } from "../engine/assemble";
import { polishTemplate } from "../engine/critique";
import { builtInBlocks, readBlockLibrary } from "../engine/blocks";
import { card, fieldBase, ghostBtn, kicker } from "../ui";

export interface TemplateChatProps {
  templateNames?: string[];
  onBuilt: (template: Template, note: string) => void;
}

/* ─── Format options ─────────────────────────────────────────── */
const FORMATS = [
  { id: "a4-portrait", label: "A4", icon: "▭", hint: "Portrait — questions stack, header & footer every page" },
  { id: "letter-portrait", label: "US Letter", icon: "▭", hint: "8.5×11 in — same flow as A4, letter size" },
  { id: "slides-16-9", label: "Slides", icon: "⊡", hint: "16:9 — one item per slide, great for flashcards & games" },
  { id: "card-a6", label: "Cards", icon: "▢", hint: "A6 cards — flashcards, tiles, cut-apart pieces" }
] as const;

/* ─── Audience options ───────────────────────────────────────── */
const AUDIENCES = [
  { id: "children", label: "Kids", emoji: "🧒", hint: "Big type, playful colours, plenty of writing space" },
  { id: "teenagers", label: "Teens", emoji: "🧑‍🎓", hint: "Structured, clean cards with clear sections" },
  { id: "adults", label: "Adults", emoji: "🎓", hint: "Minimal, professional, dense information" }
] as const;

/* ─── Component families for the visual gallery ──────────────── */
const COMPONENT_GALLERY = [
  {
    group: "Questions",
    emoji: "❶",
    color: "#dbeafe",
    ink: "#1d4ed8",
    items: [
      { name: "Multiple choice", icon: "Ⓐ", tip: "Lettered options — the agent picks the order and the correct answer" },
      { name: "True / False", icon: "✓✗", tip: "Two-option tick cards with answer band" },
      { name: "Open question", icon: "✍", tip: "Writing lines for long answers" },
      { name: "Mixed (any type)", icon: "❶⁄", tip: "Agent decides the format per question — MC, T/F or open" }
    ]
  },
  {
    group: "Structure",
    emoji: "▔",
    color: "#f0fdf4",
    ink: "#166534",
    items: [
      { name: "Exam header", icon: "▔", tip: "Title, subject, Name / Date lines — appears on first page" },
      { name: "Document header", icon: "H", tip: "Centered title with accent rule — for notes & worksheets" },
      { name: "Footer", icon: "▁", tip: "Title and page number on every page" },
      { name: "Section header", icon: "§", tip: "Numbered section badge, title and intro line" },
      { name: "Callout", icon: "ⓘ", tip: "Highlighted box for tips, notes or important info" }
    ]
  },
  {
    group: "Cards",
    emoji: "🃏",
    color: "#fdf4ff",
    ink: "#7e22ce",
    items: [
      { name: "Flashcard", icon: "⇄", tip: "Front/back card — one per slide in PPT, tiled in A4" },
      { name: "Vocabulary rows", icon: "≡", tip: "Table of word ↔ definition ↔ translation rows" },
      { name: "Key points", icon: "★", tip: "Numbered list of things to remember" }
    ]
  },
  {
    group: "Worksheets",
    emoji: "✍",
    color: "#fff7ed",
    ink: "#9a3412",
    items: [
      { name: "Fill in the blanks", icon: "Aa", tip: "Sentences with a missing word — child types the answer" },
      { name: "Match the pairs", icon: "⋯", tip: "Two columns to connect — word ↔ definition, word ↔ image" },
      { name: "Math practice set", icon: "±", tip: "Two-column operations with working box and answer box" },
      { name: "Cut and paste", icon: "✂", tip: "Category boxes and word strip to cut out and sort" }
    ]
  },
  {
    group: "Games",
    emoji: "🎮",
    color: "#fef9c3",
    ink: "#713f12",
    items: [
      { name: "Word search", icon: "▩", tip: "Letter grid with words hidden inside — agent generates the grid" },
      { name: "Pair puzzle grid", icon: "▦", tip: "Cut-apart tiles with matching edges (word ↔ definition)" },
      { name: "Square puzzle", icon: "▦", tip: "16-tile edge-matching puzzle — works as a game or print activity" }
    ]
  }
];

/* ─── Example prompts ────────────────────────────────────────── */
const EXAMPLES = [
  "An exam for Year 9 Biology with 15 questions: a header with title, subject and Name/Date lines; mixed multiple-choice, true/false and open questions; a footer with page number. Include an answer key view.",
  "Colourful flashcards for primary school Spanish vocabulary: a word on the front, the translation and a picture space on the back. 20 cards per set, playful pastel colours.",
  "A worksheet for Grade 6 maths: a header with the topic and student name, fill-in-the-blanks sentences using key vocabulary, a match-the-pairs section, and 5 open calculation questions with working space.",
  "A one-page study guide for a History chapter: a document header, 3 key-point sections each with a callout box, and a footer."
];

type FormatId = typeof FORMATS[number]["id"];
type AudienceId = typeof AUDIENCES[number]["id"];

/**
 * Redesigned template prompt — format + audience picked up front, visual component gallery
 * to inspire the description, example prompts to get started, and iterative refinement after
 * the first generation.
 */
export function TemplateChat({ templateNames = [], onBuilt }: TemplateChatProps) {
  const [prompt, setPrompt] = useState("");
  const [image, setImage] = useState("");
  const [format, setFormat] = useState<FormatId>("a4-portrait");
  const [audience, setAudience] = useState<AudienceId>("teenagers");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [lastResult, setLastResult] = useState<{ note: string; usedBlocks: string[]; customSections: string[] } | null>(null);
  const [refineMode, setRefineMode] = useState(false);
  const [refineText, setRefineText] = useState("");
  const [showGallery, setShowGallery] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function insertExample(text: string) {
    setPrompt(text);
    textareaRef.current?.focus();
  }

  /** Builds the enriched prompt that includes format and audience hints. */
  function buildEnrichedPrompt(base: string, isRefine = false): string {
    const fmtObj = FORMATS.find((f) => f.id === format) || FORMATS[0];
    const audObj = AUDIENCES.find((a) => a.id === audience) || AUDIENCES[1];
    const hint = `\n\n[Format: ${fmtObj.label} (${fmtObj.id}). Audience: ${audObj.label}${isRefine ? ". Keep the existing structure, only change what is described below." : ""}]`;
    return base.trim() + hint;
  }

  async function generate(basePrompt: string, isRefine = false) {
    if (!basePrompt.trim() || busy) return;
    setBusy(true);
    setStatus("Writing the brief and designing each section…");
    try {
      const blocks = [...builtInBlocks(), ...readBlockLibrary()].map((block) => block.name);
      const response = await fetch("/api/templates/template-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: buildEnrichedPrompt(basePrompt, isRefine),
          image,
          templates: templateNames.map((name) => ({ name })),
          blocks
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not design the template");
      const sections = (data.sections || []) as DesignedSection[];
      if (!sections.length) throw new Error("No sections could be designed — try describing the document differently.");
      setStatus("Checking the layout…");
      const polished = polishTemplate(assembleTemplate(data.brief, sections));
      const note = [
        data.reply || "Here is your template.",
        polished.fixed ? `Luna fixed ${polished.fixed} layout issue${polished.fixed === 1 ? "" : "s"}.` : "",
        polished.after.length ? `Worth checking: ${polished.after[0].message}` : ""
      ].filter(Boolean).join(" ");
      setLastResult({ note, usedBlocks: data.usedBlocks || [], customSections: data.customSections || [] });
      setStatus("");
      setImage("");
      if (!isRefine) { setPrompt(""); setRefineMode(false); }
      setRefineText("");
      setRefineMode(true);
      onBuilt(polished.template, note);
    } catch (error) {
      setStatus(String((error as Error).message || error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${card} p-5`}>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <p className={kicker}>Describe the template you want</p>
        <span className="rounded-full bg-[#fff5d6] px-2 py-0.5 text-[10px] font-semibold text-[#b25e00]">Premium</span>
      </div>
      <p className="m-0 mt-1 text-xs text-soft-ink">
        Describe the document in plain words — what it is for, who it is for, how it should look. Luna picks the right components and builds it for you.
      </p>

      {/* Format + Audience pickers */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {/* Format */}
        <div>
          <p className="m-0 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-soft-ink">Format</p>
          <div className="flex flex-wrap gap-1.5">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                type="button"
                title={f.hint}
                onClick={() => setFormat(f.id)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${format === f.id ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "border-ink/10 text-soft-ink hover:text-ink"}`}
              >
                <span>{f.icon}</span> {f.label}
              </button>
            ))}
          </div>
          <p className="m-0 mt-1 text-[11px] text-soft-ink">{FORMATS.find((f) => f.id === format)?.hint}</p>
        </div>
        {/* Audience */}
        <div>
          <p className="m-0 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-soft-ink">Audience</p>
          <div className="flex flex-wrap gap-1.5">
            {AUDIENCES.map((a) => (
              <button
                key={a.id}
                type="button"
                title={a.hint}
                onClick={() => setAudience(a.id)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${audience === a.id ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "border-ink/10 text-soft-ink hover:text-ink"}`}
              >
                {a.emoji} {a.label}
              </button>
            ))}
          </div>
          <p className="m-0 mt-1 text-[11px] text-soft-ink">{AUDIENCES.find((a) => a.id === audience)?.hint}</p>
        </div>
      </div>

      {/* Component gallery toggle */}
      <div className="mt-4">
        <button
          type="button"
          className="flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-ink)] hover:underline"
          onClick={() => setShowGallery((v) => !v)}
        >
          {showGallery ? "▾" : "▸"} What components are available?
        </button>
        {showGallery && (
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {COMPONENT_GALLERY.map((group) => (
              <div key={group.group} className="rounded-2xl border border-ink/10 p-3" style={{ background: group.color }}>
                <p className="m-0 mb-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: group.ink }}>{group.emoji} {group.group}</p>
                <div className="grid gap-1">
                  {group.items.map((item) => (
                    <button
                      key={item.name}
                      type="button"
                      title={item.tip}
                      onClick={() => {
                        const mention = item.name.toLowerCase();
                        if (!prompt.toLowerCase().includes(mention)) {
                          setPrompt((prev) => prev ? `${prev.trim()}, ${item.name.toLowerCase()}` : `Include a ${item.name.toLowerCase()} component`);
                        }
                        textareaRef.current?.focus();
                      }}
                      className="flex items-center gap-2 rounded-xl border border-white/60 bg-white/70 px-2.5 py-1.5 text-left text-xs font-semibold text-ink transition hover:bg-white hover:shadow-sm"
                    >
                      <span className="w-5 shrink-0 text-center text-sm" style={{ color: group.ink }}>{item.icon}</span>
                      <span className="min-w-0"><span className="block truncate">{item.name}</span><span className="block truncate text-[10px] font-normal text-soft-ink">{item.tip}</span></span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Prompt textarea */}
      <textarea
        ref={textareaRef}
        className={`${fieldBase} mt-4 min-h-[6rem] w-full text-sm`}
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) generate(prompt); }}
        placeholder={`e.g. A ${FORMATS.find((f) => f.id === format)?.label || "A4"} exam for ${AUDIENCES.find((a) => a.id === audience)?.label.toLowerCase() || "students"}: a header with the title, student name and date; 12 mixed questions (multiple-choice, true/false, open); an answer key view.`}
      />

      {/* Example prompts */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {EXAMPLES.map((example, i) => (
          <button
            key={i}
            type="button"
            title={example}
            onClick={() => insertExample(example)}
            className={`${ghostBtn} text-[11px]`}
          >
            {["📋 Exam", "🃏 Flashcards", "📝 Worksheet", "📖 Study guide"][i]}
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={busy || !prompt.trim()}
          onClick={() => generate(prompt)}
        >
          {busy ? "Designing…" : "Design my template"}
        </button>
        <label className="cursor-pointer rounded-full border border-ink/15 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-[var(--surface-soft)]">
          {image ? "📎 Image attached" : "📎 Reference image"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => setImage(String(reader.result || ""));
              reader.readAsDataURL(file);
              event.target.value = "";
            }}
          />
        </label>
        {image ? <button type="button" className="text-xs text-soft-ink hover:text-[var(--color-danger)]" onClick={() => setImage("")}>Remove image</button> : null}
        {templateNames.length ? <span className="text-[11px] text-soft-ink">Can refer to: {templateNames.slice(0, 3).join(", ")}{templateNames.length > 3 ? `…` : ""}</span> : null}
        <span className="ml-auto text-[11px] text-soft-ink">⌘↵ to generate</span>
      </div>

      {/* Status */}
      {status ? <p className="m-0 mt-2 text-xs text-[var(--accent-ink)]">{busy ? "⏳ " : ""}{status}</p> : null}

      {/* Result + Refine */}
      {lastResult && !busy && (
        <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4">
          <p className="m-0 text-sm font-semibold text-[#166534]">✓ Template built</p>
          <p className="m-0 mt-1 text-xs text-[#166534]/80">{lastResult.note}</p>
          {(lastResult.usedBlocks.length > 0 || lastResult.customSections.length > 0) && (
            <div className="mt-2 flex flex-wrap gap-1">
              {lastResult.usedBlocks.map((name) => (
                <span key={name} className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-[#166534]">✦ {name}</span>
              ))}
              {lastResult.customSections.map((name) => (
                <span key={name} className="rounded-full bg-[#f0f9ff] px-2 py-0.5 text-[10px] font-semibold text-[#0369a1]">✎ {name} (custom)</span>
              ))}
            </div>
          )}
          {refineMode && (
            <div className="mt-3 border-t border-green-200 pt-3">
              <p className="m-0 mb-1.5 text-[11px] font-semibold text-[#166534]">Not quite right? Describe what to change:</p>
              <textarea
                className={`${fieldBase} min-h-[4rem] w-full text-sm`}
                value={refineText}
                onChange={(event) => setRefineText(event.target.value)}
                placeholder="e.g. Make the header bigger, add a section for fill-in-the-blanks, use purple accent colour"
                onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) generate(refineText, true); }}
              />
              <button
                type="button"
                className="mt-2 rounded-full bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                disabled={busy || !refineText.trim()}
                onClick={() => generate(refineText, true)}
              >
                Refine template
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
