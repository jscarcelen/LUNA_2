"use client";

import { useState } from "react";
import type { BlockDef } from "../engine/blocks";
import { saveBlockToLibrary } from "../engine/blocks";
import { blockFromDsl, type DslComponent } from "../engine/componentDsl";
import { fieldBase } from "../ui";

/**
 * "Describe a component" — the user says what they need in plain words; Luna designs the block
 * (fields + layout). It lands in My blocks and can be refined with a follow-up message.
 */
export function ComponentChat({ onBuilt }: { onBuilt: (block: BlockDef) => void }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "luna"; text: string }[]>([]);
  const [last, setLast] = useState<DslComponent | null>(null);

  async function send() {
    const text = prompt.trim();
    if (!text || busy) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setPrompt("");
    setBusy(true);
    try {
      const response = await fetch("/api/templates/component-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: text, previous: last }) });
      const data = await response.json();
      if (!response.ok || !data.dsl) throw new Error(data.error || "Could not build the component");
      const block = blockFromDsl(data.dsl as DslComponent);
      saveBlockToLibrary(block);
      setLast(data.dsl);
      setMessages((m) => [...m, { role: "luna", text: `${data.reply || "Done."} It is in My blocks — insert it, or tell me what to change.` }]);
      onBuilt(block);
    } catch (error) {
      setMessages((m) => [...m, { role: "luna", text: String((error as Error).message || error) }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-[var(--accent)]/50 bg-[var(--accent-soft)]/40 p-2">
      <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setOpen((v) => !v)}>
        <span><span className="block text-[12px] font-semibold text-[var(--accent-ink)]">✨ Describe a component</span><span className="block text-[10.5px] leading-snug text-soft-ink">“A bingo card 4×4 with words”, “a reading comprehension box with 3 questions”…</span></span>
        <span className="rounded-full bg-[#fff5d6] px-1.5 text-[9px] font-semibold text-[#b25e00]">Premium</span>
      </button>
      {open ? (
        <div className="mt-2 grid gap-1.5">
          {messages.length ? <div className="grid max-h-40 gap-1 overflow-y-auto">{messages.map((m, i) => <p key={i} className={`m-0 rounded-lg px-2 py-1 text-[10.5px] ${m.role === "user" ? "bg-white text-ink" : "bg-[var(--accent)] text-white"}`}>{m.text}</p>)}</div> : null}
          <textarea className={`${fieldBase} min-h-14 w-full text-xs`} value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} placeholder={last ? "Change something… e.g. make the boxes bigger, add a hint" : "What do you need? e.g. a word bank with 8 boxes and a picture space"} />
          <button type="button" className="rounded-full bg-[var(--accent)] px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-50" disabled={busy || !prompt.trim()} onClick={send}>{busy ? "Designing…" : last ? "Refine" : "Create component"}</button>
        </div>
      ) : null}
    </div>
  );
}
