"use client";

export function Segmented<T extends string>({ value, options, onChange, size = "sm" }: { value: T; options: [T, string][]; onChange: (value: T) => void; size?: "sm" | "md" }) {
  return (
    <div className="grid gap-1 rounded-xl bg-[var(--surface-soft)] p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(([optionValue, text]) => (
        <button key={optionValue} type="button" onClick={() => onChange(optionValue)} className={`rounded-lg px-2 ${size === "sm" ? "py-1.5 text-xs" : "py-2 text-sm"} font-semibold transition ${value === optionValue ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink hover:text-ink"}`}>{text}</button>
      ))}
    </div>
  );
}
