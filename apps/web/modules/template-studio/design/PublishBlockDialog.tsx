"use client";

import { useState } from "react";
import type { BlockDef } from "../engine/blocks";
import { ACCENT_PRESETS } from "../engine/blocks";
import { ghostBtn, primaryBtn } from "../ui";

const SALES_MODELS: { value: string; label: string; hint: string }[] = [
  { value: "one-time", label: "One-time purchase", hint: "Buy once, keep forever." },
  { value: "subscription", label: "Subscription", hint: "Monthly access, cancel any time." },
  { value: "free", label: "Free", hint: "Anyone can add it." }
];

export interface BlockListingInput { price: number; pricingType: string; accent: string }

/** Price + sales model for a design block listing. Mirrors the agent publish dialog. */
export function PublishBlockDialog({ block, existing, onClose, onConfirm }: { block: BlockDef; existing: BlockListingInput | null; onClose: () => void; onConfirm: (values: BlockListingInput) => void }) {
  const [pricingType, setPricingType] = useState(existing?.pricingType || "one-time");
  const [price, setPrice] = useState(String(existing?.price ?? 2.99));
  const [accent, setAccent] = useState(existing?.accent || ACCENT_PRESETS[0].main);
  const input = "w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-[var(--accent)]";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-[0_24px_64px_rgba(0,0,0,0.25)]" onClick={(event) => event.stopPropagation()}>
        <h4 className="m-0 text-lg font-bold text-ink">{existing ? "Update listing" : "Sell in Marketplace"}</h4>
        <p className="m-0 mt-1 text-xs text-soft-ink">“{block.name}” will appear under Design blocks. Buyers add it to their own Template Studio.</p>
        <div className="mt-4 grid gap-2">
          {SALES_MODELS.map((model) => (
            <label key={model.value} className={`flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 ${pricingType === model.value ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-ink/10"}`}>
              <input type="radio" className="mt-1" checked={pricingType === model.value} onChange={() => setPricingType(model.value)} />
              <span><span className="block text-sm font-semibold text-ink">{model.label}</span><span className="block text-xs text-soft-ink">{model.hint}</span></span>
            </label>
          ))}
          {pricingType !== "free" ? (
            <label className="grid gap-1 text-xs font-semibold text-soft-ink">Price (USD{pricingType === "subscription" ? " per month" : ""})<input className={input} type="number" min="0" step="0.5" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
          ) : null}
          <div className="grid gap-1 text-xs font-semibold text-soft-ink">Card colour
            <div className="flex gap-1">{ACCENT_PRESETS.map((preset) => <button key={preset.id} type="button" title={preset.label} onClick={() => setAccent(preset.main)} className={`size-6 rounded-full border-2 ${accent === preset.main ? "border-ink" : "border-white"}`} style={{ background: preset.main, boxShadow: "0 0 0 1px rgba(0,0,0,0.08)" }} />)}</div>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={ghostBtn} onClick={onClose}>Cancel</button>
          <button type="button" className={primaryBtn} onClick={() => onConfirm({ price: pricingType === "free" ? 0 : Math.max(0, Number(price) || 0), pricingType, accent })}>{existing ? "Update" : "Publish"}</button>
        </div>
      </div>
    </div>
  );
}
