"use client";

import { useT } from "../../lib/i18n/LocaleProvider.js";

/**
 * The small set of pieces every phone screen is built from, in the LUNA design language: white cards with a hairline,
 * 18px corners, pill buttons, one accent, large titles. Tailwind utilities inside `.tw-scope`.
 */

export const cardClass = "rounded-[18px] border border-ink/8 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]";
export const primaryClass = "inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-5 text-[16px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-40";
export const secondaryClass = "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-ink/15 bg-white px-4 text-[15px] font-semibold text-ink transition active:bg-[var(--surface-soft)] disabled:opacity-40";

/** The screen: a large title (and an optional action at its right), then the content in one column. */
export function MobileScreen({ title, subtitle = "", action = null, children, label }) {
  return (
    <section className="tw-scope mx-auto grid w-full max-w-xl gap-5 pb-2" aria-label={label || title}>
      {title ? (
        <header className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="m-0 text-[30px] font-bold leading-tight tracking-tight text-ink">{title}</h1>
            {subtitle ? <p className="m-0 mt-0.5 text-[15px] text-soft-ink">{subtitle}</p> : null}
          </div>
          {action}
        </header>
      ) : null}
      {children}
    </section>
  );
}

/** A section heading with an optional link at the right ("See all"). */
export function SectionTitle({ children, actionLabel = "", onAction }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="m-0 text-[17px] font-semibold tracking-tight text-ink">{children}</h2>
      {actionLabel && onAction ? <button type="button" className="min-h-[36px] shrink-0 text-[15px] font-semibold text-[var(--accent)]" onClick={onAction}>{actionLabel}</button> : null}
    </div>
  );
}

/** Two or three choices in a pill track, like the iOS segmented control. */
export function Segmented({ options = [], value, onChange, label }) {
  return (
    <div className="grid rounded-full bg-[rgba(118,118,128,0.12)] p-[3px]" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="tablist" aria-label={label}>
      {options.map(([key, text]) => (
        <button key={key} type="button" role="tab" aria-selected={value === key} onClick={() => onChange(key)} className={`min-h-[36px] truncate rounded-full px-3 text-[14px] font-semibold transition ${value === key ? "bg-white text-ink shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-soft-ink"}`}>{text}</button>
      ))}
    </div>
  );
}

/** Horizontal chips that scroll sideways (subjects). */
export function ChipRow({ options = [], value, onChange, label }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label={label}>
      <div className="flex w-max gap-2">
        {options.map(([key, text]) => (
          <button key={key || "all"} type="button" role="tab" aria-selected={value === key} onClick={() => onChange(key)} className={`min-h-[36px] max-w-[60vw] truncate rounded-full border px-4 text-[14px] font-semibold transition ${value === key ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-ink/12 bg-white text-ink"}`}>{text}</button>
        ))}
      </div>
    </div>
  );
}

/** An honest empty state: what is missing, why it matters, and the real actions that fill it. */
export function Empty({ title, text, actions = [] }) {
  return (
    <div className={`${cardClass} grid justify-items-center gap-2 px-5 py-8 text-center`}>
      <p className="m-0 text-[17px] font-semibold text-ink">{title}</p>
      {text ? <p className="m-0 max-w-sm text-[15px] text-soft-ink">{text}</p> : null}
      {actions.length ? (
        <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
          {actions.map((action, position) => <button key={action.label} type="button" className={position === 0 ? primaryClass : secondaryClass} onClick={action.onClick}>{action.label}</button>)}
        </div>
      ) : null}
    </div>
  );
}

/** A tappable row: icon, title, a line under it, and what is at the right (a label or a chevron). */
export function Row({ icon = null, title, detail = "", extra = null, trailing = null, onClick, ariaLabel }) {
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel} className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left transition active:bg-[var(--surface-soft)]">
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-semibold text-ink">{title}</span>
        {detail ? <span className="block truncate text-[13px] text-soft-ink">{detail}</span> : null}
        {extra}
      </span>
      {trailing ?? <span aria-hidden className="shrink-0 text-lg text-[#c7c7cc]">›</span>}
    </button>
  );
}

/** A list of rows inside one card, separated by hairlines. */
export function RowList({ children }) {
  return <div className={`${cardClass} divide-y divide-ink/8 overflow-hidden`}>{children}</div>;
}

/** Keyed by the type id of model.js (`resourceTypeId`). */
const TYPE_GLYPHS = {
  quiz: "?", exam: "★", levelTest: "◎", problemSet: "∑", flashcards: "▭", matching: "⇄",
  summary: "☰", formulaSheet: "ƒ", combinedNotes: "≡", madeByLuna: "✦",
  pdf: "PDF", document: "DOC", slides: "▤", photo: "◩", notes: "✎", table: "▦", material: "▢"
};

/** A small rounded square with the kind of item in it: tinted for things Luna made, grey for material. */
export function TypeIcon({ typeId, made = false }) {
  const glyph = TYPE_GLYPHS[typeId] || "▢";
  return (
    <span aria-hidden className={`grid size-10 shrink-0 place-items-center rounded-xl font-bold ${glyph.length > 2 ? "text-[10px]" : "text-[17px]"} ${made ? "bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "bg-[rgba(118,118,128,0.12)] text-soft-ink"}`}>{glyph}</span>
  );
}

/** A thin progress bar with its label for screen readers. */
export function Bar({ value = 0, colour = "var(--accent)", label = "" }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[rgba(118,118,128,0.14)]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: colour }} />
    </div>
  );
}

/** Loading placeholders in the shape of cards. */
export function Skeleton({ rows = 2 }) {
  const t = useT();
  return (
    <div className="grid gap-3" aria-busy="true" aria-label={t("mobile.loading")}>
      {Array.from({ length: rows }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-[18px] bg-ink/5" />)}
    </div>
  );
}
