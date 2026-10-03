"use client";

import { parseAgentPrompt } from "./briefParser";

const heading = "m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink";

/** The whole prompt of an agent, laid out in sections that are easy to read. */
export function AgentBrief({ prompt }) {
  const brief = parseAgentPrompt(prompt);
  if (brief.plain) {
    return <div className="grid gap-2 text-sm leading-relaxed text-ink">{brief.paragraphs.map((paragraph, index) => <p key={index} className="m-0">{paragraph}</p>)}</div>;
  }
  return (
    <div className="grid gap-4 text-sm leading-relaxed text-ink">
      {brief.does ? <section><p className={heading}>What it does</p><p className="m-0 mt-1">{brief.does}</p></section> : null}
      {brief.style ? <section><p className={heading}>Style</p><p className="m-0 mt-1">{brief.style}</p></section> : null}
      {brief.rules.length ? <section><p className={heading}>Rules it follows</p><ul className="m-0 mt-1 grid list-disc gap-1 pl-5">{brief.rules.map((rule, index) => <li key={index}>{rule}</li>)}</ul></section> : null}
      {brief.output || brief.structure ? (
        <section>
          <p className={heading}>What it returns</p>
          <p className="m-0 mt-1">A document made of content blocks. The agent chooses which kinds of block to use, how many, and in what order{brief.output ? `: ${brief.output.charAt(0).toLowerCase()}${brief.output.slice(1)}` : "."}</p>
        </section>
      ) : null}
      {brief.blocks.length ? (
        <section>
          <p className={heading}>Blocks it can write</p>
          <div className="mt-1.5 overflow-hidden rounded-xl border border-ink/10">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead className="bg-[var(--surface-soft)] text-[11px] uppercase tracking-wide text-soft-ink"><tr><th className="px-3 py-1.5 font-semibold">Block</th><th className="px-3 py-1.5 font-semibold">What it holds</th></tr></thead>
              <tbody>
                {brief.blocks.map((block) => (
                  <tr key={block.id} className="border-t border-ink/8 align-top">
                    <td className="px-3 py-2 font-semibold">{block.label}</td>
                    <td className="px-3 py-2 text-soft-ink">{block.fields.map((field) => `${field.name}${field.optional ? " (optional)" : ""}${field.note ? ` — ${field.note.replace(/\.$/, "")}` : ""}`).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
