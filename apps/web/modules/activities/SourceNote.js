"use client";

/** Where the answer can be traced: document, place in it, the exact words, and a link to that passage. */
const GROUNDING_LABEL = {
  verified: ["Stated in your material", "text-[#1f7a3d]", "The supporting words were found in your document."],
  inferred: ["Inferred from your material", "text-[#8a4a00]", "This follows from the passage by reasoning; it is not a direct quotation."],
  unverified: ["Could not be confirmed", "text-[var(--color-danger)]", "Luna could not match this to your material. Check the source, or ask your teacher."]
};

export function GroundingBadge({ grounding }) {
  const entry = grounding && GROUNDING_LABEL[grounding.level];
  if (!entry) return null;
  const why = [entry[2], ...(grounding.level === "verified" ? [] : grounding.reasons || [])].join(" ");
  return <span className={`ml-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold ${entry[1]}`} title={why}>{entry[0]}</span>;
}

export function SourceNote({ source }) {
  const url = source.documentId ? `/source?d=${encodeURIComponent(source.documentId)}&c=${source.chunkIndex || 1}&q=${encodeURIComponent(String(source.extract || "").slice(0, 200))}` : "";
  return (
    <div className="mt-2 rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-xs text-soft-ink">
      <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span aria-hidden>📖</span>
        {source.documentName ? <strong className="text-ink">{source.documentName}</strong> : <strong className="text-ink">Source</strong>}
        {source.locator ? <span>· {source.locator}</span> : null}
        <GroundingBadge grounding={source.grounding} />
        {url ? <a href={url} target="_blank" rel="noreferrer" className="ml-auto font-semibold text-[var(--accent)] hover:underline">Open this part of the document →</a> : null}
      </p>
      {source.extract ? <p className="m-0 mt-1 border-l-2 border-[var(--accent)] pl-2 italic text-ink">“{source.extract}”</p> : null}
      {source.grounding?.level === "unverified" && source.grounding.reasons?.length ? <p className="m-0 mt-1 text-[11px] text-[var(--color-danger)]">{source.grounding.reasons[0]}</p> : null}
    </div>
  );
}
