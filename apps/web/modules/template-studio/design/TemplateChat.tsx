"use client";

import { useState } from "react";
import type { Template } from "../engine/types";
import { assembleTemplate, type DesignedSection } from "../engine/assemble";
import { builtInBlocks, readBlockLibrary } from "../engine/blocks";
import { card, fieldBase, kicker } from "../ui";

export interface TemplateChatProps {
  /** Names of the user's saved templates, so the description can refer to them. */
  templateNames?: string[];
  onBuilt: (template: Template, note: string) => void;
}

/**
 * "Describe the template you want" — the whole document, not a single block. Luna improves the
 * description into a brief (page size, sections, views), designs each section, and hands back a
 * normal template the user can edit, preview and save. A reference image and a nod to templates
 * they already have both steer the result.
 */
export function TemplateChat({ templateNames = [], onBuilt }: TemplateChatProps) {
  const [prompt, setPrompt] = useState("");
  const [image, setImage] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function generate() {
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    setStatus("Writing the brief and designing each section…");
    try {
      const blocks = [...builtInBlocks(), ...readBlockLibrary()].map((block) => block.name);
      const response = await fetch("/api/templates/template-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text, image, templates: templateNames.map((name) => ({ name })), blocks })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not design the template");
      const sections = (data.sections || []) as DesignedSection[];
      if (!sections.length) throw new Error("No section could be designed — try describing the document differently.");
      const template = assembleTemplate(data.brief, sections);
      setStatus("");
      setImage("");
      setPrompt("");
      onBuilt(template, data.reply || "Here is your template.");
    } catch (error) {
      setStatus(String((error as Error).message || error));
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
      <p className="m-0 mt-1 text-xs text-soft-ink">The whole document in your own words — what it is for, what goes on it, how it should look. Mention a template you already have to follow its style, or attach a picture to copy a layout.</p>
      <textarea
        className={`${fieldBase} mt-3 min-h-20 w-full text-sm`}
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="e.g. A two-page Year 7 science worksheet: a header with the topic and the pupil's name, then 8 questions in boxes with space to write, a picture box for a diagram, and a teacher's answer key at the end. Same colours as my Exam template."
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || !prompt.trim()} onClick={generate}>{busy ? "Designing…" : "Design my template"}</button>
        <label className="cursor-pointer rounded-full border border-ink/15 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-[var(--surface-soft)]">
          {image ? "📎 Image attached" : "📎 Reference image"}
          <input type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setImage(String(reader.result || "")); reader.readAsDataURL(file); event.target.value = ""; }} />
        </label>
        {image ? <button type="button" className="text-xs text-soft-ink hover:text-[var(--color-danger)]" onClick={() => setImage("")}>Remove image</button> : null}
        {templateNames.length ? <span className="text-[11px] text-soft-ink">Can refer to: {templateNames.slice(0, 4).join(", ")}{templateNames.length > 4 ? "…" : ""}</span> : null}
      </div>
      {status ? <p className="m-0 mt-2 text-xs text-[var(--accent-ink)]">{status}</p> : null}
    </section>
  );
}
