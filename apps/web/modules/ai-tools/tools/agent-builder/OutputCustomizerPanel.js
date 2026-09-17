"use client";

import { ACCENT_PRESETS, BLOCK_TYPE_OPTIONS, FONT_OPTIONS } from "./previewHtml";

const inputClass = "w-full rounded-xl border border-ink/10 bg-bg/60 px-3 py-2 text-sm text-ink placeholder:text-soft-ink/60 outline-none transition focus:border-teal/60 focus:ring-2 focus:ring-teal/20";
const labelClass = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-soft-ink";

function Section({ title, children }) {
  return (
    <section className="rounded-2xl border border-ink/8 bg-ink/[0.04] p-3.5">
      <h6 className="m-0 mb-3 text-xs font-bold uppercase tracking-[0.14em] text-accent">{title}</h6>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm text-ink">
      <span>{label}</span>
      <span
        role="switch"
        aria-checked={checked}
        tabIndex={0}
        onClick={() => onChange(!checked)}
        onKeyDown={(event) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            onChange(!checked);
          }
        }}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${checked ? "bg-accent/80" : "bg-ink/15"}`}
      >
        <span className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
      </span>
    </label>
  );
}

/**
 * Sidebar that lets the user restyle and reshape the generated output without re-running the
 * agent. Everything here is presentation-only and applied live by LivePreviewPane.
 *
 * customization = { brand: {...}, hiddenFields: string[], fieldOrder: string[] }
 */
export function OutputCustomizerPanel({ fields, fieldTypeByName, onFieldTypeChange, customization, onChange, hasTemplate }) {
  const brand = customization.brand || {};
  const hidden = new Set(customization.hiddenFields || []);
  const savedOrder = (customization.fieldOrder || []).filter((name) => fields.some((field) => field.name === name));
  const order = [...new Set([...savedOrder, ...fields.map((field) => field.name)])];

  const setBrand = (patch) => onChange({ ...customization, brand: { ...brand, ...patch } });
  const setHidden = (name, isHidden) => {
    const next = new Set(hidden);
    if (isHidden) next.add(name);
    else next.delete(name);
    onChange({ ...customization, hiddenFields: [...next] });
  };
  const move = (name, direction) => {
    const index = order.indexOf(name);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    onChange({ ...customization, fieldOrder: next });
  };

  return (
    <div className="grid gap-3">
      <Section title="Branding">
        <div>
          <label className={labelClass} htmlFor="brand-title">Document title</label>
          <input id="brand-title" className={inputClass} value={brand.title || ""} onChange={(event) => setBrand({ title: event.target.value })} placeholder="e.g., Unit 4 flashcards" />
        </div>
        <div>
          <label className={labelClass} htmlFor="brand-subtitle">Subtitle</label>
          <input id="brand-subtitle" className={inputClass} value={brand.subtitle || ""} onChange={(event) => setBrand({ subtitle: event.target.value })} placeholder="Class, teacher, date…" />
        </div>
        <div>
          <label className={labelClass} htmlFor="brand-logo">Logo URL</label>
          <input id="brand-logo" className={inputClass} value={brand.logoUrl || ""} onChange={(event) => setBrand({ logoUrl: event.target.value })} placeholder="https://…/logo.png" />
        </div>
      </Section>

      <Section title="Style">
        <div>
          <span className={labelClass}>Accent colour</span>
          <div className="flex flex-wrap items-center gap-2">
            {ACCENT_PRESETS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Use ${color}`}
                onClick={() => setBrand({ accent: color })}
                className={`size-7 rounded-full ring-2 ring-offset-2 ring-offset-paper transition hover:scale-110 ${brand.accent === color ? "ring-ink" : "ring-transparent"}`}
                style={{ background: color }}
              />
            ))}
            <label className="relative size-7 cursor-pointer overflow-hidden rounded-full ring-1 ring-ink/20" title="Custom colour">
              <span className="absolute inset-0 bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]" />
              <input type="color" value={brand.accent || ACCENT_PRESETS[0]} onChange={(event) => setBrand({ accent: event.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
            </label>
          </div>
        </div>
        <div>
          <label className={labelClass} htmlFor="brand-font">Font</label>
          <select id="brand-font" className={inputClass} value={brand.font || "inter"} onChange={(event) => setBrand({ font: event.target.value })}>
            {FONT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        {!hasTemplate ? (
          <>
            <div>
              <span className={labelClass}>Density</span>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-ink/5 p-1 ring-1 ring-ink/10">
                {["comfortable", "compact"].map((option) => (
                  <button key={option} type="button" onClick={() => setBrand({ density: option })} className={`rounded-lg px-2 py-1.5 text-xs font-semibold capitalize transition ${(brand.density || "comfortable") === option ? "bg-ink text-bg" : "text-soft-ink hover:text-ink"}`}>{option}</button>
                ))}
              </div>
            </div>
            <Toggle label="Number each item" checked={Boolean(brand.numbered)} onChange={(value) => setBrand({ numbered: value })} />
            <Toggle label="Dividers between items" checked={brand.showDividers !== false} onChange={(value) => setBrand({ showDividers: value })} />
          </>
        ) : null}
      </Section>

      <Section title="Content">
        <div>
          <label className={labelClass} htmlFor="brand-limit">Max items (0 = all)</label>
          <input id="brand-limit" type="number" min="0" className={inputClass} value={brand.itemLimit ?? 0} onChange={(event) => setBrand({ itemLimit: Math.max(0, Number(event.target.value) || 0) })} />
        </div>
        <div>
          <span className={labelClass}>Fields</span>
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {order.map((name, index) => {
              const field = fields.find((item) => item.name === name);
              if (!field) return null;
              const isHidden = hidden.has(name);
              return (
                <li key={name} className={`grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-xl border border-ink/8 px-2 py-1.5 transition ${isHidden ? "opacity-50" : ""}`}>
                  <div className="flex flex-col">
                    <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => move(name, -1)} className="text-[10px] leading-none text-soft-ink hover:text-ink disabled:opacity-30">▲</button>
                    <button type="button" aria-label="Move down" disabled={index === order.length - 1} onClick={() => move(name, 1)} className="text-[10px] leading-none text-soft-ink hover:text-ink disabled:opacity-30">▼</button>
                  </div>
                  <div className="min-w-0">
                    <p className="m-0 truncate text-sm font-semibold text-ink">{field.label || field.name}</p>
                    {!hasTemplate ? (
                      <select
                        aria-label={`Block type for ${field.label || field.name}`}
                        className="mt-0.5 w-full rounded-lg border border-ink/10 bg-bg/60 px-2 py-1 text-xs text-ink outline-none"
                        value={fieldTypeByName[name] || "paragraph"}
                        onChange={(event) => onFieldTypeChange(name, event.target.value)}
                      >
                        {BLOCK_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    aria-label={isHidden ? "Show field" : "Hide field"}
                    onClick={() => setHidden(name, !isHidden)}
                    className="rounded-lg px-2 py-1 text-xs text-soft-ink ring-1 ring-ink/10 transition hover:bg-ink/10 hover:text-ink"
                  >
                    {isHidden ? "Show" : "Hide"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </Section>
    </div>
  );
}
