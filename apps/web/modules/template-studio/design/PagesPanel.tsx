"use client";

import type { Layout, Page } from "../engine/types";
import { GROUP_COLOR, card, ghostBtn, kicker } from "../ui";

export function PagesPanel({ layout, pages, activeId, onSelect, onAdd, onRemove }: { layout: Layout; pages: Page[]; activeId: string; onSelect: (id: string) => void; onAdd: () => void; onRemove: (id: string) => void }) {
  const { width, height } = layout.canvas;
  return (
    <div className={`${card} p-3`}>
      <p className={`${kicker} px-1`}>Pages</p>
      <div className="mt-2 grid gap-2">
        {pages.map((page, index) => {
          const bg = page.background;
          const src = bg.type === "image" || bg.type === "pdf" ? bg.src : "";
          const pageRepeat = page.elements.find((element) => element.type === "group" && element.repeat?.mode === "page");
          return (
            <div key={page.id} role="button" tabIndex={0} onClick={() => onSelect(page.id)} onKeyDown={(event) => event.key === "Enter" && onSelect(page.id)} className={`relative cursor-pointer overflow-hidden rounded-xl border p-1.5 transition ${page.id === activeId ? "border-[var(--accent)] ring-4 ring-[var(--accent-soft)]" : "border-ink/10 hover:border-ink/25"}`}>
              <div className="relative mx-auto overflow-hidden rounded bg-white" style={{ width: 110, height: Math.round((110 * height) / width), backgroundImage: src ? `url(${src})` : "none", backgroundSize: "100% 100%" }}>
                {page.elements.map((element) => <span key={element.id} className="absolute rounded-[1px]" style={{ left: `${(element.frame.x / width) * 100}%`, top: `${(element.frame.y / height) * 100}%`, width: `${(element.frame.w / width) * 100}%`, height: `${Math.max(1.5, (element.frame.h / height) * 100)}%`, background: element.type === "group" ? `${GROUP_COLOR}33` : element.type === "text" && element.source.type === "field" ? "rgba(0,113,227,0.35)" : "rgba(0,0,0,0.15)" }} />)}
              </div>
              <p className="m-0 mt-1 flex items-center justify-between text-[11px] font-semibold text-ink"><span>Page {index + 1}</span>{pageRepeat ? <span className="rounded bg-[var(--accent-soft)] px-1 text-[9px] text-[var(--accent-ink)]">per item</span> : null}</p>
              {pages.length > 1 ? <button type="button" aria-label="Remove page" onClick={(event) => { event.stopPropagation(); onRemove(page.id); }} className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-white/90 text-[10px] text-soft-ink shadow hover:text-[var(--color-danger)]">✕</button> : null}
            </div>
          );
        })}
        <button type="button" className={ghostBtn} onClick={onAdd}>＋ Add page</button>
      </div>
    </div>
  );
}
