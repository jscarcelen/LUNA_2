"use client";
import { useT } from "../../lib/i18n/LocaleProvider.js";
import { feedbackSource, feedbackSourceLabel } from "./sourceLabel.js";

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

/**
 * The source under a checked answer. A quote is shown as a quote; a maths problem says which section of the notes it
 * is built on; any other question without a quote names the section (or the document) it came from. `question` and
 * `result` let it tell maths from the rest; with only `source` it behaves as before.
 */
export function SourceNote({ source, question = null, result = null }) {
  const t = useT();
  const info = feedbackSource({ ...(question || {}), source: source || question?.source || {} }, result);
  if (info.kind === "none") return null;
  const label = feedbackSourceLabel(info, t);
  const grounding = source?.grounding || question?.source?.grounding;
  return (
    <div className="mt-2 rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-xs text-soft-ink">
      <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span aria-hidden>{info.kind === "maths" ? "∑" : "📖"}</span>
        {info.kind === "quote" ? (
          <>
            {info.documentName ? <strong className="text-ink">{info.documentName}</strong> : <strong className="text-ink">{t("practice.source")}</strong>}
            {source?.locator ? <span>· {source.locator}</span> : null}
            {info.showBadge ? <GroundingBadge grounding={{ ...grounding, reasons: info.reasons }} /> : null}
          </>
        ) : (
          <>
            <strong className="text-ink">{label}</strong>
            {info.documentName && info.kind !== "document" ? <span>· {info.documentName}</span> : null}
          </>
        )}
        {info.href ? <a href={info.href} target="_blank" rel="noreferrer" className="ml-auto font-semibold text-[var(--accent)] hover:underline">{info.kind === "quote" ? t("practice.openSource") : t("practice.src.jump")}</a> : null}
      </p>
      {info.extract ? <p className="m-0 mt-1 border-l-2 border-[var(--accent)] pl-2 italic text-ink">“{info.extract}”</p> : null}
      {info.kind === "quote" && grounding?.level === "unverified" && info.reasons.length ? <p className="m-0 mt-1 text-[11px] text-[var(--color-danger)]">{info.reasons[0]}</p> : null}
    </div>
  );
}
