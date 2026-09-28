"use client";

import { useRef, useState } from "react";
import type { Template } from "../engine/types";
import { assembleTemplate, type DesignedSection } from "../engine/assemble";
import { polishTemplate } from "../engine/critique";
import { builtInBlocks, readBlockLibrary } from "../engine/blocks";
import { card, fieldBase, ghostBtn, kicker } from "../ui";

export type TemplateKind = "document" | "cards";

export interface TemplateChatProps {
  kind: TemplateKind;
  templateNames?: string[];
  onBuilt: (template: Template, note: string) => void;
  onUpload?: (file: File) => void;
}

/* ─── Component families ─────────────────────────────────────── */
const COMPONENT_GALLERY = [
  {
    group: "Structure", emoji: "▔", color: "#f0fdf4", ink: "#166534",
    items: [
      { name: "Exam header", icon: "▔", tip: "Title, subject, Name/Date lines — first page" },
      { name: "Document header", icon: "H", tip: "Centered title with accent rule" },
      { name: "Footer", icon: "▁", tip: "Title and page number on every page" },
      { name: "Section header", icon: "§", tip: "Numbered section badge and title" },
      { name: "Callout", icon: "ⓘ", tip: "Info box for tips, notes or highlights" }
    ]
  },
  {
    group: "Questions", emoji: "❶", color: "#dbeafe", ink: "#1d4ed8",
    items: [
      { name: "Multiple choice", icon: "Ⓐ", tip: "Lettered options — agent picks order and correct answer" },
      { name: "True / False", icon: "✓✗", tip: "Two-option cards with answer band" },
      { name: "Open question", icon: "✍", tip: "Writing lines for free-text answers" },
      { name: "Mixed (any type)", icon: "❶⁄", tip: "Agent decides the format per question" }
    ]
  },
  {
    group: "Worksheets", emoji: "✍", color: "#fff7ed", ink: "#9a3412",
    items: [
      { name: "Fill in the blanks", icon: "Aa", tip: "Sentences with missing words to type" },
      { name: "Match the pairs", icon: "⋯", tip: "Two columns to connect — drag or draw a line" },
      { name: "Math practice set", icon: "±", tip: "Two-column operations with working and answer boxes" },
      { name: "Cut and paste", icon: "✂", tip: "Category boxes and word strip to sort" }
    ]
  },
  {
    group: "Cards & Games", emoji: "🃏", color: "#fdf4ff", ink: "#7e22ce",
    items: [
      { name: "Flashcard", icon: "⇄", tip: "Front / back card — one per slide or tiled in A4" },
      { name: "Vocabulary rows", icon: "≡", tip: "Word ↔ definition ↔ translation table" },
      { name: "Word search", icon: "▩", tip: "Letter grid — agent generates words and positions" },
      { name: "Pair puzzle grid", icon: "▦", tip: "Cut-apart tiles with matching edges" },
      { name: "Square puzzle", icon: "▦", tip: "16-tile edge-matching game" }
    ]
  }
];

/* ─── Example prompts ────────────────────────────────────────── */
const DOC_EXAMPLES = [
  { label: "📋 Exam", text: "An A4 exam for Year 9 Biology with 15 mixed questions (multiple-choice, true/false, open answer). A header with title, subject and Name/Date lines, numbered question cards with the correct answer visible only in the answer key view, and a footer with page number." },
  { label: "📝 Worksheet", text: "A worksheet on Grammar for Grade 6: a header, fill-in-the-blanks sentences, a match-the-pairs section pairing words with their definitions, and 5 open questions with writing space." },
  { label: "📖 Study guide", text: "A two-page study guide for a History chapter: a document header, 3 key-point sections each with a highlighted callout box, and a footer." }
];
const CARD_EXAMPLES = [
  { label: "🃏 Flashcards", text: "Spanish vocabulary flashcards for primary school: a word on the front, the translation and a picture space on the back. Playful pastel colours." },
  { label: "▦ Matching game", text: "A pair puzzle game for science vocabulary — word on one edge, definition on the opposite edge. 16 tiles, cut-apart for groups of 4 students." },
  { label: "▩ Word search", text: "A word search for Year 5 Geography: 15 hidden words related to climate zones. Include a word list below the grid." }
];

/**
 * Prompt chatbot for generating a template from a plain description.
 * Receives the kind (document vs cards) from SourceChooser.
 */
export function TemplateChat({ kind, templateNames = [], onBuilt, onUpload }: TemplateChatProps) {
  const [prompt, setPrompt] = useState("");
  const [image, setImage] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [lastResult, setLastResult] = useState<{ note: string; usedBlocks: string[]; customSections: string[] } | null>(null);
  const [refineText, setRefineText] = useState("");
  const [showGallery, setShowGallery] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const examples = kind === "cards" ? CARD_EXAMPLES : DOC_EXAMPLES;

  /** Enriches the prompt with format context so the AI makes the right layout choices. */
  function buildEnrichedPrompt(base: string, isRefine = false): string {
    const formatHint = kind === "cards"
      ? "[Format: cards — one item per card, small A6 size, tiled 4 per A4 page or one per slide]"
      : "[Format: A4 portrait document — questions stack vertically, header on first page, footer on every page]";
    const refineHint = isRefine ? " Keep the existing structure; only apply the changes described below." : "";
    return `${base.trim()}\n\n${formatHint}${refineHint}`;
  }

  async function generate(basePrompt: string, isRefine = false) {
    if (!basePrompt.trim() || busy) return;
    setBusy(true);
    setStatus("Writing the brief and designing each section…");
    try {
      const blocks = [...builtInBlocks(), ...readBlockLibrary()].map((b) => b.name);
      const res = await fetch("/api/templates/template-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: buildEnrichedPrompt(basePrompt, isRefine), image, templates: templateNames.map((n) => ({ name: n })), blocks })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not design the template");
      const sections = (data.sections || []) as DesignedSection[];
      if (!sections.length) throw new Error("No sections could be designed — try describing the document differently.");
      setStatus("Reviewing the layout…");
      const polished = polishTemplate(assembleTemplate(data.brief, sections));
      const note = [
        data.reply || "Here is your template.",
        polished.fixed ? `Automatically fixed ${polished.fixed} layout issue${polished.fixed === 1 ? "" : "s"}.` : "",
        polished.after.length ? `Worth a look: ${polished.after[0].message}` : ""
      ].filter(Boolean).join(" ");
      setLastResult({ note, usedBlocks: data.usedBlocks || [], customSections: data.customSections || [] });
      setStatus("");
      setImage("");
      if (!isRefine) setPrompt("");
      setRefineText("");
      onBuilt(polished.template, note);
    } catch (err) {
      setStatus(String((err as Error).message || err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${card} p-5`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className={kicker}>Describe the template you want</p>
        <span className="rounded-full bg-[#fff5d6] px-2 py-0.5 text-[10px] font-semibold text-[#b25e00]">Premium</span>
      </div>
      <p className="m-0 mt-1 text-xs text-soft-ink">
        Describe what goes in the template in plain words — Luna picks the right components and builds it.
        Or <button type="button" className="font-semibold text-[var(--accent-ink)] underline underline-offset-2" onClick={() => setShowGallery((v) => !v)}>browse the components</button> and add them to the description.
      </p>

      {/* Component gallery */}
      {showGallery && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {COMPONENT_GALLERY.map((group) => (
            <div key={group.group} className="rounded-2xl border border-ink/10 p-3" style={{ background: group.color }}>
              <p className="m-0 mb-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: group.ink }}>{group.emoji} {group.group}</p>
              <div className="grid gap-1">
                {group.items.map((item) => (
                  <button key={item.name} type="button" title={item.tip}
                    onClick={() => { if (!prompt.toLowerCase().includes(item.name.toLowerCase())) setPrompt((p) => p ? `${p.trim()}, ${item.name.toLowerCase()}` : `Include a ${item.name.toLowerCase()}`); textareaRef.current?.focus(); }}
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

      {/* Prompt textarea */}
      <textarea
        ref={textareaRef}
        className={`${fieldBase} mt-3 min-h-[5.5rem] w-full text-sm`}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate(prompt); }}
        placeholder={kind === "cards"
          ? "e.g. Spanish vocabulary flashcards: word on the front, translation and image space on the back. Playful pastel colours."
          : "e.g. A Year 9 Biology exam: header with title and Name/Date, 15 mixed questions (MC, true/false, open), answer key view, page footer."}
      />

      {/* Example buttons */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {examples.map((ex) => (
          <button key={ex.label} type="button" className={`${ghostBtn} text-[11px]`} onClick={() => { setPrompt(ex.text); textareaRef.current?.focus(); }}>{ex.label}</button>
        ))}
      </div>

      {/* Actions */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || !prompt.trim()} onClick={() => generate(prompt)}>
          {busy ? "Designing…" : "Generate template"}
        </button>
        <label className="cursor-pointer rounded-full border border-ink/15 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-[var(--surface-soft)]">
          {image ? "📎 Image attached" : "📎 Reference image"}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; const r = new FileReader(); r.onload = () => setImage(String(r.result || "")); r.readAsDataURL(file); e.target.value = ""; }} />
        </label>
        {image ? <button type="button" className="text-xs text-soft-ink hover:text-[var(--color-danger)]" onClick={() => setImage("")}>Remove</button> : null}
        {onUpload && (
          <label className="cursor-pointer rounded-full border border-ink/15 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-[var(--surface-soft)]">
            📄 Start from PDF
            <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file && onUpload) onUpload(file); e.target.value = ""; }} />
          </label>
        )}
        {templateNames.length ? <span className="text-[11px] text-soft-ink">Can match: {templateNames.slice(0, 3).join(", ")}{templateNames.length > 3 ? "…" : ""}</span> : null}
        <span className="ml-auto text-[11px] text-soft-ink">⌘↵ to generate</span>
      </div>

      {status ? <p className="m-0 mt-2 text-xs text-[var(--accent-ink)]">{busy ? "⏳ " : ""}{status}</p> : null}

      {/* Generation result + iterative refine */}
      {lastResult && !busy && (
        <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4">
          <p className="m-0 text-sm font-semibold text-[#166534]">✓ Template ready — open it in the editor above</p>
          <p className="m-0 mt-1 text-xs text-[#166534]/80">{lastResult.note}</p>
          {(lastResult.usedBlocks.length > 0 || lastResult.customSections.length > 0) && (
            <div className="mt-2 flex flex-wrap gap-1">
              {lastResult.usedBlocks.map((n) => <span key={n} className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-[#166534]">✦ {n}</span>)}
              {lastResult.customSections.map((n) => <span key={n} className="rounded-full bg-[#f0f9ff] px-2 py-0.5 text-[10px] font-semibold text-[#0369a1]">✎ {n}</span>)}
            </div>
          )}
          <div className="mt-3 border-t border-green-200 pt-3">
            <p className="m-0 mb-1.5 text-[11px] font-semibold text-[#166534]">Refine it — what should change?</p>
            <div className="flex gap-2">
              <textarea className={`${fieldBase} min-h-[3rem] flex-1 text-sm`} value={refineText} onChange={(e) => setRefineText(e.target.value)} placeholder="e.g. Make the header bigger, add a fill-in-the-blanks section, use purple" onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate(refineText, true); }} />
              <button type="button" className="self-end rounded-full bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50" disabled={busy || !refineText.trim()} onClick={() => generate(refineText, true)}>Refine</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
