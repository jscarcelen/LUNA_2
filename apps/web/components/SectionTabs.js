"use client";
import { useT } from "../lib/i18n/LocaleProvider.js";

/**
 * The tabs inside a section (Study: Courses · Study plans · Practice, …). A segmented row of pills, never more than
 * three: the rail says where you are in the app, this says which view of it. Each tab explains itself on hover and
 * to screen readers.
 */
export function SectionTabs({ tabs = [], active, onChange }) {
  const t = useT();
  if (tabs.length < 2) return null;
  return (
    <div className="tw-scope mb-4 flex">
      <div role="tablist" aria-label={t("shell.views")} className="inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-ink/10 bg-white p-1">
        {tabs.map((tab) => {
          const on = tab.key === active;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={on}
              title={tab.hint}
              onClick={() => onChange?.(tab.key)}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition ${on ? "bg-[var(--accent)] text-white" : "text-soft-ink hover:bg-[var(--surface-soft)] hover:text-ink"}`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
