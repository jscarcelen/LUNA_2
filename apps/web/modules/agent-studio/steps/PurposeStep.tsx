"use client";

import type { AgentSpec } from "../engine/types";
import { card, field, label, kicker } from "../ui";

export function PurposeStep({ spec, onChange }: { spec: AgentSpec; onChange: (updater: (spec: AgentSpec) => AgentSpec) => void }) {
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section className={`${card} grid gap-4 p-5`}>
        <div><label className={label}>Agent name</label><input className={field} value={spec.name} onChange={(event) => onChange((s) => ({ ...s, name: event.target.value }))} placeholder="Vocabulary Flashcards" /></div>
        <div><label className={label}>What should it generate?</label><input className={field} value={spec.purpose.headline} onChange={(event) => onChange((s) => ({ ...s, purpose: { ...s.purpose, headline: event.target.value } }))} placeholder="Vocabulary flashcards" /><p className="m-0 mt-1 text-xs text-soft-ink">A few words — this is what people see in the marketplace.</p></div>
        <div><label className={label}>Describe what you want it to do</label><textarea className={`${field} min-h-28 resize-y`} value={spec.instructions.core} onChange={(event) => onChange((s) => ({ ...s, instructions: { ...s.instructions, core: event.target.value }, purpose: { ...s.purpose, description: s.purpose.description || event.target.value.slice(0, 200) } }))} placeholder="Create vocabulary flashcards that pair words between two languages. Choose useful, level-appropriate words…" /><p className="m-0 mt-1 text-xs text-soft-ink">Write it as you'd brief a colleague. Luna turns this into the agent's instructions.</p></div>
        <div><label className={label}>Short description (optional)</label><input className={field} value={spec.purpose.description} onChange={(event) => onChange((s) => ({ ...s, purpose: { ...s.purpose, description: event.target.value } }))} placeholder="Shown to people before they use the agent" /></div>
        <div><label className={label}>Category</label><select className={field} value={spec.purpose.category || ""} onChange={(event) => onChange((s) => ({ ...s, purpose: { ...s.purpose, category: event.target.value } }))}><option value="">Choose…</option>{["Study aids", "Assessment", "Languages", "Writing", "Science", "Other"].map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
      </section>
      <aside className={`${card} p-5`}>
        <p className={kicker}>How an agent works</p>
        <ol className="m-0 mt-2 grid list-none gap-2 p-0 text-sm text-ink">
          {[["1", "You describe what it creates."], ["2", "You decide what people can customise (number, level, language…)."], ["3", "You say what material it should read."], ["4", "You define what each generated item contains."], ["5", "You test it and improve it in plain words."]].map(([n, t]) => <li key={n} className="flex gap-2"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-[10px] font-bold text-[var(--accent-ink)]">{n}</span><span>{t}</span></li>)}
        </ol>
        <p className="m-0 mt-3 text-xs text-soft-ink">No prompts, no code. The agent's output works with any template that uses the same fields.</p>
      </aside>
    </div>
  );
}
