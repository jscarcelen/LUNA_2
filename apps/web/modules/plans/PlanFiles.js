"use client";

import { useEffect, useState } from "react";
import { useT } from "../../lib/i18n/LocaleProvider.js";
import { TypeIcon } from "../mobile/ui.js";

const VIEW_KEY = "luna.planFiles.view";
const kicker = "m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink";

/**
 * "Files in this plan": every file the plan uses (plans/planFiles.js), as big tiles (Gallery, like the Courses gallery)
 * or compact rows (List). The choice is remembered per browser. A file opens on click when `canOpen(file)` says so;
 * the others (uploaded material a parent or teacher only sees by name) are shown with `lockedHint` as their tooltip.
 */
export function PlanFiles({ files = [], onOpen, canOpen = () => true, lockedHint = "", emptyText = "", compact = false }) {
  const t = useT();
  const [view, setView] = useState("gallery");
  useEffect(() => { try { if (window.localStorage.getItem(VIEW_KEY) === "list") setView("list"); } catch { /* storage blocked: stay on the gallery */ } }, []);
  function choose(next) {
    setView(next);
    try { window.localStorage.setItem(VIEW_KEY, next); } catch { /* not remembered */ }
  }
  const detail = (file) => [file.type, file.kind === "made" ? t("plans.files.made") : t("plans.files.material"), file.steps ? t.plural("plans.files.steps", file.steps) : ""].filter(Boolean).join(" · ");
  const props = (file) => {
    const openable = Boolean(onOpen) && canOpen(file);
    return {
      type: "button",
      disabled: !openable,
      title: openable ? t("plans.files.open", { name: file.name }) : lockedHint || undefined,
      "aria-label": openable ? t("plans.files.open", { name: file.name }) : `${file.name}. ${lockedHint}`,
      onClick: openable ? () => onOpen(file) : undefined
    };
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className={kicker}>{t("plans.files.title")}{files.length ? ` · ${t.plural("plans.files.count", files.length)}` : ""}</p>
          {compact ? null : <p className="m-0 mt-1 text-xs text-soft-ink">{t("plans.files.hint")}</p>}
        </div>
        {files.length ? (
          <div className="flex gap-1 rounded-xl bg-[var(--surface-soft)] p-1" role="group" aria-label={t("plans.files.view")}>
            {[["gallery", "▦", t("plans.files.gallery")], ["list", "☰", t("plans.files.list")]].map(([value, icon, label]) => (
              <button key={value} type="button" aria-pressed={view === value} onClick={() => choose(value)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${view === value ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink"}`}>
                <span aria-hidden className="mr-1">{icon}</span>{label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {!files.length ? <p className="m-0 rounded-xl bg-[var(--surface-soft)] p-4 text-sm text-soft-ink">{emptyText}</p> : view === "gallery" ? (
        <div className={`grid gap-3 ${compact ? "grid-cols-[repeat(auto-fill,minmax(min(100%,150px),1fr))]" : "grid-cols-[repeat(auto-fill,minmax(min(100%,200px),1fr))]"}`}>
          {files.map((file) => (
            <button key={file.id} {...props(file)} className="flex min-w-0 flex-col items-start gap-2 rounded-[16px] border border-ink/8 bg-white p-3 text-left transition enabled:hover:shadow-[0_8px_24px_rgba(0,0,0,0.07)] disabled:cursor-default">
              <TypeIcon typeId={file.typeId} made={file.kind === "made"} />
              <span className="line-clamp-2 text-sm font-semibold leading-snug text-ink [overflow-wrap:anywhere]">{file.name}</span>
              <span className="mt-auto text-[11px] text-soft-ink">{detail(file)}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="divide-y divide-ink/8 overflow-hidden rounded-[16px] border border-ink/8 bg-white">
          {files.map((file) => (
            <button key={file.id} {...props(file)} className="flex w-full min-w-0 items-center gap-3 px-3 py-2 text-left transition enabled:hover:bg-[var(--surface-soft)] disabled:cursor-default">
              <TypeIcon typeId={file.typeId} made={file.kind === "made"} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{file.name}</span>
                <span className="block truncate text-[11px] text-soft-ink">{detail(file)}</span>
              </span>
              {Boolean(onOpen) && canOpen(file) ? <span aria-hidden className="shrink-0 text-lg text-[#c7c7cc]">›</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
