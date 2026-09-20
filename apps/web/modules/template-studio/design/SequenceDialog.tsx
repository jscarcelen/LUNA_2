"use client";

import { useState } from "react";
import { blockFamilies, buildSequenceBlock, builtInBlocks, readBlockLibrary, typeValueFor, type BlockDef, type SequenceChoice } from "../engine/blocks";
import { fieldBase, ghostBtn, label, primaryBtn } from "../ui";

/**
 * "Content in the agent's order": tick the designs that may appear; each gets a Type value the
 * agent will use. The result is one block — the agent's list decides which design goes where.
 */
export function SequenceDialog({ onClose, onInsert }: { onClose: () => void; onInsert: (block: BlockDef, choices: SequenceChoice[]) => void }) {
  const library = [...builtInBlocks().filter((b) => b.id !== "block-question-mixed" && b.id !== "block-section-questions" && !b.id.startsWith("block-footer") && !b.id.startsWith("block-header")), ...readBlockLibrary()];
  const families = blockFamilies(library);
  const [listName, setListName] = useState("Content");
  const [picked, setPicked] = useState<Record<string, string>>({});
  // Short, readable type values: the variant when a family has several designs, else the family.
  const slug = (text: string) => text.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 32);
  const defaultType = (block: BlockDef) => {
    const fam = families.find((f) => f.variants.some((v) => v.id === block.id));
    if (!fam) return typeValueFor(block);
    return fam.variants.length > 1 ? slug((block.variant || block.name).split(",")[0].split(" — ")[0]) : slug(fam.family);
  };
  const toggle = (block: BlockDef) => setPicked((prev) => { const next = { ...prev }; if (next[block.id] !== undefined) delete next[block.id]; else next[block.id] = defaultType(block); return next; });
  const chosen = library.filter((b) => picked[b.id] !== undefined);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div className="grid max-h-[88vh] w-full max-w-2xl grid-rows-[auto_1fr_auto] rounded-2xl bg-white shadow-[0_24px_64px_rgba(0,0,0,0.25)]" onClick={(event) => event.stopPropagation()}>
        <div className="p-5 pb-3">
          <h4 className="m-0 text-lg font-bold text-ink">Content in the agent's order</h4>
          <p className="m-0 mt-1 text-xs text-soft-ink">Tick the designs that may appear. The agent returns one list where every element says its <strong>Type</strong>; the matching design is drawn at that position — sections, question styles, callouts, in whatever order the agent decides.</p>
          <label className="mt-3 grid gap-1 text-xs font-semibold text-soft-ink">List name (the agent's output field)<input className={`${fieldBase} w-full`} value={listName} onChange={(event) => setListName(event.target.value)} /></label>
        </div>
        <div className="overflow-y-auto px-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {families.map(({ family, variants }) => (
              <div key={family} className="rounded-2xl border border-ink/10 p-3">
                <p className={`${label} mb-1.5`}>{family}</p>
                <div className="grid gap-1">
                  {variants.map((block) => {
                    const on = picked[block.id] !== undefined;
                    return (
                      <div key={block.id} className={`rounded-xl border px-2.5 py-2 ${on ? "border-[var(--accent)]/40 bg-[var(--accent-soft)]" : "border-transparent hover:bg-[var(--surface-soft)]"}`}>
                        <label className="flex cursor-pointer items-start gap-2 text-sm text-ink">
                          <input type="checkbox" className="mt-0.5" checked={on} onChange={() => toggle(block)} />
                          <span className="min-w-0"><span className="block font-semibold leading-tight">{block.variant || block.name}</span><span className="block text-[11px] leading-snug text-soft-ink">{block.description}</span></span>
                        </label>
                        {on ? <label className="mt-1.5 flex items-center gap-2 text-[11px] font-semibold text-soft-ink">Type value<input className={`${fieldBase} w-full py-1 text-xs`} value={picked[block.id]} onChange={(event) => setPicked((prev) => ({ ...prev, [block.id]: event.target.value.toLowerCase().replace(/[^a-z0-9_]+/g, "_") }))} /></label> : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-ink/8 p-4">
          <p className="m-0 text-xs text-soft-ink">{chosen.length ? `Agent output: ${listName || "Content"}[] with Type ∈ { ${chosen.map((b) => picked[b.id]).join(", ")} }` : "Pick at least one design."}</p>
          <div className="flex gap-2">
            <button type="button" className={ghostBtn} onClick={onClose}>Cancel</button>
            <button type="button" className={primaryBtn} disabled={!chosen.length} onClick={() => { const choices = chosen.map((block) => ({ block, typeValue: picked[block.id] || typeValueFor(block) })); onInsert(buildSequenceBlock(choices, listName.trim() || "Content"), choices); }}>Insert block</button>
          </div>
        </div>
      </div>
    </div>
  );
}
