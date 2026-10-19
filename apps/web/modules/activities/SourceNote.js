"use client";
import { useT } from "../../lib/i18n/LocaleProvider.js";

/** Where the answer can be traced: document, place in it, the exact words, and a link to that passage. */
const GROUNDING_LABEL = {
  verified: ["practice.ground.verified", "text-[#1f7a3d]", "practice.ground.verified.why"],
  inferred: ["practice.ground.inferred", "text-[#8a4a00]", "practice.ground.inferred.why"],
  unverified: ["practice.ground.unverified", "text-[var(--color-danger)]", "practice.ground.unverified.why"]
};

export function GroundingBadge({ grounding }) {
  const t = useT();
  const entry = grounding && GROUNDING_LABEL[grounding.level];
  if (!entry) return null;
  const why = [t(entry[2]), ...(grounding.level === "verified" ? [] : grounding.reasons || [])].join(" ");
  return <span className={`ml-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold ${entry[1]}`} title={why}>{t(entry[0])}</span>;
}

export function SourceNote({ source }) {
  const t = useT();
  const url = source.documentId ? `/source?d=${encodeURIComponent(source.documentId)}&c=${source.chunkIndex || 1}&q=${encodeURIComponent(String(source.extract || "").slice(0, 200))}` : "";
  return (
    <div className="mt-2 rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-xs text-soft-ink">
      <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span aria-hidden>📖</span>
        {source.documentName ? <strong className="text-ink">{source.documentName}</strong> : <strong className="text-ink">{t("practice.source")}</strong>}
        {source.locator ? <span>· {source.locator}</span> : null}
        <GroundingBadge grounding={source.grounding} />
        {url ? <a href={url} target="_blank" rel="noreferrer" className="ml-auto font-semibold text-[var(--accent)] hover:underline">{t("practice.openSource")}</a> : null}
      </p>
      {source.extract ? <p className="m-0 mt-1 border-l-2 border-[var(--accent)] pl-2 italic text-ink">“{source.extract}”</p> : null}
      {source.grounding?.level === "unverified" && source.grounding.reasons?.length ? <p className="m-0 mt-1 text-[11px] text-[var(--color-danger)]">{source.grounding.reasons[0]}</p> : null}
    </div>
  );
}
