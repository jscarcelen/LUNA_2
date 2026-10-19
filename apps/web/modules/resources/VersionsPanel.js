"use client";

import { useState } from "react";
import { blockText } from "./update";
import { useT } from "../../lib/i18n/LocaleProvider.js";

const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-[var(--surface-soft)] disabled:opacity-50";
const kicker = "m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink";

const sizeOf = (version, t) => {
  const questions = version.activity?.questions?.length || 0;
  if (questions) return t.plural("courses.vp.questions", questions);
  const blocks = Array.isArray(version.data?.blocks) ? version.data.blocks.length : Array.isArray(version.data?.items) ? version.data.items.length : 0;
  return blocks ? t.plural("courses.vp.blocks", blocks) : "";
};

const firstWords = (version) => {
  const block = Array.isArray(version.data?.blocks) ? version.data.blocks.find((entry) => blockText(entry)) : null;
  const text = version.activity?.questions?.[0]?.prompt || (block ? blockText(block) : "");
  return text ? `“${text.slice(0, 90)}${text.length > 90 ? "…" : ""}”` : "";
};

/**
 * The earlier versions kept inside a resource (the last five): what was asked, when, with which model,
 * and a button to go back. Going back keeps the version it leaves, so it can be undone too.
 */
export function VersionsPanel({ resource, onRestore }) {
  const t = useT();
  const versions = Array.isArray(resource?.versions) ? resource.versions : [];
  const [busy, setBusy] = useState("");
  return (
    <div>
      <p className={kicker}>{t("courses.vp.title")}</p>
      <p className="m-0 mt-1 text-xs text-soft-ink">{t("courses.vp.intro")}</p>
      <div className="mt-3 grid gap-2">
        {versions.map((version) => (
          <div key={version.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-ink/10 p-3">
            <div className="min-w-0 flex-1">
              <p className="m-0 text-sm font-semibold text-ink">{version.prompt ? t("courses.vp.before", { prompt: version.prompt }) : t("courses.vp.earlier")}</p>
              <p className="m-0 mt-0.5 text-xs text-soft-ink">{new Date(version.at).toLocaleString(t.locale)}{sizeOf(version, t) ? ` · ${sizeOf(version, t)}` : ""}{version.agentName ? ` · ✦ ${version.agentName}` : ""}{version.model ? ` · ${version.model === "gpt-4o" ? "Luna 3 Pro" : version.model === "gpt-4.1" ? "Luna 3 Max" : version.model}` : ""}</p>
              {firstWords(version) ? <p className="m-0 mt-1 text-[11px] text-soft-ink">{firstWords(version)}</p> : null}
            </div>
            <button type="button" className={ghostBtn} disabled={Boolean(busy)} onClick={async () => { setBusy(version.id); try { await onRestore?.(version.id); } finally { setBusy(""); } }}>{busy === version.id ? t("courses.vp.restoring") : t("courses.vp.restore")}</button>
          </div>
        ))}
        {!versions.length ? <p className="m-0 text-sm text-soft-ink">{t("courses.vp.none")}</p> : null}
      </div>
    </div>
  );
}
