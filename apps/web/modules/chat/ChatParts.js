"use client";

import { markdownToHtml } from "../reader/markdown";
import { useT } from "../../lib/i18n/LocaleProvider.js";

/** Styles of the small numbered citation buttons ([P1] → ①) inside an answer. */
export const CITE_CSS = ".md-cite{display:inline-grid;place-items:center;min-width:17px;height:17px;margin:0 2px;padding:0 4px;border-radius:9px;background:#e8f1fd;color:#0a4aa6;font:700 10px/1 -apple-system,sans-serif;border:0;cursor:pointer;vertical-align:text-top}.md-cite:hover{background:#0071e3;color:#fff}";

/** Markdown → HTML, with the [P1] citations turned into small numbered buttons. */
export function renderAssistant(text) {
  return markdownToHtml(text).replace(/\[P(\d+)\]/g, '<button type="button" class="md-cite" data-cite="P$1">$1</button>');
}

/** The "References" block under an answer: which passage of which document each [P#] came from. */
export function SourceList({ messageId, sources = [] }) {
  const t = useT();
  if (!sources.length) return null;
  return (
    <div className="mt-3 grid gap-2">
      <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink">{t("misc.chat.references")}</p>
      {sources.map((source) => (
        <div key={source.n} id={`src-${messageId}-${source.n}`} className="rounded-xl border border-ink/10 bg-[var(--surface-soft)] px-3 py-2 text-xs transition">
          <p className="m-0 flex flex-wrap items-center gap-x-2 text-soft-ink">
            <span className="grid size-4 place-items-center rounded-full bg-[#e8f1fd] text-[10px] font-bold text-[#0a4aa6]">{source.n.replace("P", "")}</span>
            <strong className="text-ink">{source.documentName}</strong>
            {source.heading ? <span>› {source.heading}</span> : null}
            {source.page ? <span>{t("misc.chat.page", { page: source.page })}</span> : null}
            <span>{t("misc.chat.passage", { n: source.chunkIndex })}</span>
            {source.url ? <a href={source.url} target="_blank" rel="noreferrer" className="ml-auto font-semibold text-[var(--accent)] hover:underline">{t("misc.chat.openPart")}</a> : null}
          </p>
          {source.extract ? <p className="m-0 mt-1 border-l-2 border-[var(--accent)] pl-2 italic text-ink">“{source.extract}”</p> : null}
        </div>
      ))}
    </div>
  );
}

/** What the grounding check found about an answer: confirmed against the material, partly, or not taken from it. */
export function GroundingNote({ grounding }) {
  const t = useT();
  if (!grounding) return null;
  if (grounding.uncited) return <p className="m-0 mt-2 text-[11px] text-[#8a4a00]">{t("misc.chat.uncited")}</p>;
  const bad = (grounding.unsupported || 0) + (grounding.partly || 0) + (grounding.invalidCitations?.length || 0);
  if (!bad) return grounding.judged === false ? null : <p className="m-0 mt-2 text-[11px] text-[#1f7a3d]">{t("misc.chat.checked", { supported: grounding.supported, checked: grounding.checked })}</p>;
  return (
    <div className="mt-2 rounded-xl bg-[#fff4e5] px-3 py-2 text-[11px] text-[#8a4a00]">
      <p className="m-0 font-semibold">{t("misc.chat.checkThis")}</p>
      <ul className="m-0 mt-1 list-disc pl-4">
        {(grounding.flagged || []).map((item) => <li key={item.text}>“{item.text.slice(0, 110)}” — {item.reason}</li>)}
        {grounding.invalidCitations?.length ? <li>{t("misc.chat.badRefs", { list: grounding.invalidCitations.join(", ") })}</li> : null}
      </ul>
    </div>
  );
}

/** A click on a [P#] button scrolls to (and flashes) its reference card inside the same thread. */
export function jumpToCitation(event) {
  const cite = event.target.closest?.("[data-cite]");
  if (!cite) return;
  const card = document.getElementById(`src-${cite.closest("[data-message]")?.getAttribute("data-message")}-${cite.getAttribute("data-cite")}`);
  card?.scrollIntoView({ behavior: "smooth", block: "center" });
  card?.classList.add("ring-2", "ring-[var(--accent)]");
  window.setTimeout(() => card?.classList.remove("ring-2", "ring-[var(--accent)]"), 1600);
}
