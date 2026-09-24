"use client";

import { useMemo, useState } from "react";
import { aiToolsRegistry } from "../registry";

const card = "rounded-[18px] border border-ink/8 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.05)]";
const kicker = "m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink";
const primaryBtn = "inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0077ed]";
const ghostBtn = "inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-[var(--surface-soft)]";
const chip = "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold";

function parseAgent(document) {
  try {
    const parsed = JSON.parse(String(document.content || "{}"));
    return parsed;
  } catch {
    return {};
  }
}

/** Origin tag: self-created, bought (marketplace) with availability, or built-in. */
export function originTag(meta = {}) {
  if (meta.installedFrom?.listingId) {
    const until = meta.installedFrom.availableUntil ? ` · until ${new Date(meta.installedFrom.availableUntil).toLocaleDateString()}` : "";
    return { label: `Bought${until}`, className: `${chip} bg-[rgba(255,149,0,0.15)] text-[#b25e00]` };
  }
  if (meta.builtIn) return { label: "Built-in", className: `${chip} bg-[var(--surface-soft)] text-soft-ink` };
  return { label: "Created by me", className: `${chip} bg-[var(--accent-soft)] text-[var(--accent-ink)]` };
}

function AgentCard({ document, onOpen, onEdit, onDelete }) {
  const parsed = parseAgent(document);
  const tag = originTag(parsed);
  const fields = parsed.template?.fields || [];
  const inputs = parsed.questions || [];
  const own = !parsed.installedFrom?.listingId;
  return (
    <article className={`${card} flex flex-col gap-2 p-4`}>
      <div className="flex items-start justify-between gap-2">
        <h4 className="m-0 text-base font-bold text-ink">{parsed.name || document.name.replace(/\.agent\.json$/, "")}</h4>
        <span className={tag.className}>{tag.label}</span>
      </div>
      <p className="m-0 line-clamp-2 text-xs text-soft-ink">{parsed.description || parsed.tagline || String(parsed.instructions || "").slice(0, 120) || "Custom agent."}</p>
      <div className="flex flex-wrap gap-1">
        {inputs.slice(0, 4).map((q) => <span key={q.id} className={`${chip} bg-[var(--surface-soft)] text-soft-ink`}>{q.text}</span>)}
        {fields.slice(0, 4).map((f) => <span key={f.name} className={`${chip} border border-ink/10 text-ink`}>{f.label || f.name}</span>)}
      </div>
      <div className="mt-auto flex items-center gap-2 pt-1">
        <button type="button" className={`${primaryBtn} flex-1 py-1.5 text-xs`} onClick={() => onOpen(document.id)}>Run</button>
        {own && typeof onEdit === "function" ? <button type="button" className={ghostBtn} onClick={() => onEdit(document.id)}>Edit</button> : null}
        {typeof onDelete === "function" ? (
          <button
            type="button"
            title="Delete this agent"
            className="rounded-full border border-ink/12 px-2 py-1.5 text-xs text-soft-ink transition hover:border-[var(--color-danger)]/40 hover:text-[var(--color-danger)]"
            onClick={() => { if (window.confirm(`Delete “${parsed.name || document.name}”? This cannot be undone.`)) onDelete(document.id); }}
          >
            🗑
          </button>
        ) : null}
      </div>
    </article>
  );
}

/**
 * AI agents hub: the agents you own (built-in, created, bought) and the two generators. Templates
 * have their own section of the app, so they are not listed here.
 */
export function AIToolsHubPage({ onOpenTool, onOpenCustomAgent, onEditAgent, onDeleteAgent, onOpenTemplates, workspaces = [], selectedWorkspaceId, selectedSubjectId }) {
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId) || null;
  const selectedSubject = selectedWorkspace?.subjects?.find((subject) => subject.id === selectedSubjectId) || null;
  const customAgents = (selectedSubject?.documents || []).filter((document) => document.sourceType === "generated" && (document.tags || []).includes("ai-agent"));
  const builtInAgents = aiToolsRegistry.filter((tool) => !["agent-builder", "template-builder", "ai-tutor", "chatbot"].includes(tool.id));
  const [filter, setFilter] = useState("all");
  const visibleAgents = useMemo(() => customAgents.filter((document) => {
    const parsed = parseAgent(document);
    if (filter === "bought") return Boolean(parsed.installedFrom?.listingId);
    if (filter === "mine") return !parsed.installedFrom?.listingId;
    return true;
  }), [customAgents, filter]);

  return (
    <section className="tw-scope grid gap-4">
      <div className="grid gap-3 lg:grid-cols-2">
        <div className={`${card} flex items-center justify-between gap-4 p-5`}>
          <div><p className={kicker}>Content generator</p><h4 className="m-0 mt-1 text-lg font-bold text-ink">Agent Studio</h4><p className="m-0 mt-1 text-sm text-soft-ink">Build an agent recipe: what it creates, what people customise, what it reads, what it returns.</p></div>
          <button type="button" className={primaryBtn} onClick={() => onOpenTool("agent-builder")}>Create agent</button>
        </div>
        <div className={`${card} flex items-center justify-between gap-4 p-5`}>
          <div><p className={kicker}>Presentation generator</p><h4 className="m-0 mt-1 text-lg font-bold text-ink">Template Studio</h4><p className="m-0 mt-1 text-sm text-soft-ink">Design the document: static design, AI fields, repeating groups, views — one template, every format.</p></div>
          <button type="button" className={primaryBtn} onClick={() => (typeof onOpenTemplates === "function" ? onOpenTemplates() : onOpenTool("template-builder"))}>Create template</button>
        </div>
      </div>

      <div className="grid items-start gap-3">
        <section className={`${card} p-5`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><p className={kicker}>My agents</p><p className="m-0 text-xs text-soft-ink">{customAgents.length + builtInAgents.length} available</p></div>
            <div className="flex gap-1 rounded-xl bg-[var(--surface-soft)] p-1">{[["all", "All"], ["mine", "Created by me"], ["bought", "Bought"]].map(([value, text]) => <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${filter === value ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-soft-ink"}`}>{text}</button>)}</div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {filter !== "bought" ? builtInAgents.map((tool) => (
              <article key={tool.id} className={`${card} flex flex-col gap-2 p-4`}>
                <div className="flex items-start justify-between gap-2"><h4 className="m-0 text-base font-bold text-ink">{tool.name}</h4><span className={originTag({ builtIn: true }).className}>Built-in</span></div>
                <p className="m-0 line-clamp-2 text-xs text-soft-ink">{tool.description}</p>
                <button type="button" className={`${primaryBtn} mt-auto py-1.5 text-xs`} onClick={() => onOpenTool(tool.id)}>Run</button>
              </article>
            )) : null}
            {visibleAgents.map((document) => <AgentCard key={document.id} document={document} onOpen={onOpenCustomAgent} onEdit={onEditAgent} onDelete={onDeleteAgent} />)}
            {!visibleAgents.length && filter === "bought" ? <p className="m-0 text-sm text-soft-ink">Nothing bought yet — browse the Marketplace.</p> : null}
          </div>
        </section>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {aiToolsRegistry.filter((tool) => ["ai-tutor", "chatbot"].includes(tool.id)).map((tool) => (
          <article key={tool.id} className={`${card} flex items-center justify-between gap-3 p-4`}><div><h4 className="m-0 text-sm font-bold text-ink">{tool.name}</h4><p className="m-0 text-xs text-soft-ink">{tool.description}</p></div><button type="button" className={ghostBtn} onClick={() => onOpenTool(tool.id)}>Open</button></article>
        ))}
      </div>
    </section>
  );
}
